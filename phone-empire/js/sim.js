'use strict';
// ============================================================================
//  Simulation: game state, daily tick (research, construction, production,
//  sales), monthly bookkeeping, rivals, save/load.
// ============================================================================

const SAVE_KEY = 'phoneEmpireSave_v1';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let S = null;                 // the whole game state (serializable)
const listeners = { news: [], month: [], gameover: [] };
const on = (ev, fn) => listeners[ev].push(fn);
const emit = (ev, a) => listeners[ev].forEach(fn => fn(a));

const now = () => S.start + S.day / 365;
const monthIndex = t => Math.floor(t * 12 + 1e-9);
function dateLabel(t) { const m = monthIndex(t); return MONTHS[m % 12] + ' ' + Math.floor(m / 12); }
let _uid = 1;
const uid = p => p + (Date.now() % 1e6).toString(36) + (_uid++).toString(36);

// ---- Availability for the player -----------------------------------------------
function factoryActive(type) { return S.factories.some(f => f.type === type && f.status === 'active'); }
function hasFab(nm) { return S.factories.some(f => f.type === 'fab' && f.nm === nm && f.status === 'active'); }
function playerAv() {
  const t = now();
  return {
    t,
    market: id => !id || t >= TECH[id].market,
    inhouse(id) {
      if (!id || !S.researched[id]) return false;
      const fac = TECH_CATS[TECH[id].cat].factory;
      return fac === null || fac === 'fab' || factoryActive(fac);
    },
    ok(id) { return this.market(id) || this.inhouse(id); },
  };
}
const archGenFor = av => { let g = 1; for (let k = 2; k <= 14; k++) if (av.ok('chip_arch' + k)) g = k; return g; };
const modemGenFor = av => (av.ok('chip_5g') ? 3 : av.ok('chip_lte') ? 2 : 1);
function nodesForDesign() {
  const t = now();
  return NODES.filter(n => n.year <= t || hasFab(n.nm));
}

// ---- Techs used by a design (to know what is exclusive / in-house only) ---------------
function camModuleTech(c) {
  const g = CAM_GENS.find(gg => c.sensor <= gg[1] && c.mp <= gg[2]);
  return g ? g[0] : 'cam_g8';
}
function specTechs(spec) {
  const d = spec.display, b = spec.battery, m = spec.memory, cams = spec.cams;
  const ppi = PPI_CAPS.find(p => d.ppi <= p[1]);
  const camT = camerasList(cams).map(([, c]) => camModuleTech(c));
  if (cams.main.ois || (cams.tele.on && cams.tele.ois)) camT.push('cam_ois');
  if (cams.ultra.on || cams.tele.on) camT.push('cam_multi');
  if (cams.tele.on && cams.tele.periscope) camT.push('cam_periscope');
  const mem = MEM_GENS.find(g => m.ram <= g[1] && m.storage <= g[2]);
  return {
    display: [DISPLAY_TECH[d.tech].tech, ppi ? ppi[0] : 'disp_530', (REFRESH.find(r => r.hz === d.hz) || REFRESH[0]).tech, d.fullview ? 'disp_fullview' : null],
    camera: camT,
    battery: [CHEM[b.chem].tech, (CHARGE.find(c => c.w === b.charge) || CHARGE[0]).tech, b.wireless ? 'bat_wireless' : null],
    memory: [mem ? mem[0] : 'mem_g10'],
    body: [MATERIALS[spec.body.mat].tech, WATER[spec.body.water].tech, FINGERPRINT[spec.feat.fp].tech,
      spec.feat.face3d ? 'feat_face3d' : null, spec.feat.nfc ? 'feat_nfc' : null, spec.feat.stereo ? 'feat_stereo' : null],
  };
}
// returns {ok, missing:[techIds], exclusive:{display:bool,...}}
function specAvailability(spec, av) {
  const used = specTechs(spec);
  const missing = [], exclusive = {};
  for (const k in used) {
    exclusive[k] = false;
    for (const id of used[k]) {
      if (!id) continue;
      if (!av.ok(id)) missing.push(id);
      else if (!av.market(id)) exclusive[k] = true;
    }
  }
  if (!spec.modem && !chipFor(spec).modemGen) missing.push('modem');
  return { ok: missing.length === 0, missing, exclusive };
}

// ---- Chips --------------------------------------------------------------------------
function chipFor(spec) {
  if (spec.chip.kind === 'vendor') return vendorChipById(spec.chip.id);
  const c = S.chips.find(x => x.id === spec.chip.id);
  return c ? c.stats : null;
}
function chipRecord(spec) { return spec.chip.kind === 'custom' ? S.chips.find(x => x.id === spec.chip.id) : null; }

// ---- Costs per unit ---------------------------------------------------------------------
const POOL_OF = { display: 'display', camera: 'camera', battery: 'battery', memory: 'memory', assembly: 'assembly' };
function productCosts(spec, t, av) {
  const chip = chipFor(spec);
  const ev = evalPhone(spec, t, av, chip);
  const ex = specAvailability(spec, av).exclusive;
  const cat = CATS[spec.cat];
  const comps = [];
  if (spec.chip.kind === 'vendor') comps.push({ key: 'chip', label: 'SoC (' + chip.vendor + ')', buy: ev.bom.chip });
  else {
    const e = chipEconomics(chip.area, chip.nm, t);
    const fab = hasFab(chip.nm);
    const early = t < nodeByNm(chip.nm).year;   // node not offered by foundries yet
    comps.push({ key: 'chip', label: 'SoC (custom)', pool: fab ? 'fab' + chip.nm : null, per: 1 / e.good, in: e.own, buy: early ? null : e.foundry, buyLabel: 'foundry' });
  }
  if (!ev.integrated) comps.push({ key: 'modem', label: 'Discrete modem', buy: ev.bom.modem });
  const fac = (key, label, price, per, excl) => {
    const mk = FACTORY_TYPES[key].markup;
    const pool = factoryActive(key) ? key : null;
    comps.push({ key, label, pool, per, in: price / mk, buy: excl ? null : price });
  };
  fac('display', 'Display', ev.bom.display, 1, ex.display);
  fac('camera', 'Cameras ×' + ev.nCams, ev.bom.camera, ev.nCams, ex.camera);
  fac('battery', 'Battery', ev.bom.battery, 1, ex.battery);
  fac('memory', 'Memory', ev.bom.memory, 1, ex.memory);
  comps.push({ key: 'body', label: 'Body & features', buy: ev.bom.body });
  comps.push({ key: 'misc', label: 'Board, PMIC, sensors, box', buy: ev.bom.misc });
  comps.push({ key: 'assembly', label: 'Assembly', pool: factoryActive('assembly') ? 'assembly' : null, per: 1,
    in: cat.inAssembly + 0.5 * (ev.nCams - 2), buy: ex.body ? null : ev.bom.assembly, buyLabel: 'contract' });
  // estimated unit cost: in-house wherever we own the factory
  let est = 0, allBuy = 0;
  for (const c of comps) {
    est += c.pool ? c.in : (c.buy != null ? c.buy : c.in || 0);
    allBuy += c.buy != null ? c.buy : (c.in || 0);
  }
  return { comps, est, allBuy, ev, chip };
}

// ---- New game -------------------------------------------------------------------------
function defaultDraft(cat, t) {
  const d = baseDraft(cat, t);
  const cost = productCosts(d, t, playerAv()).est;
  d.price = Math.max(d.price, Math.round(cost / (1 - RETAIL_CUT) * 1.3 / 10) * 10 - 1);
  return d;
}
function baseDraft(cat, t) {
  const av = marketAv(t);
  const chips = vendorChipsAvailable(t).filter(c => c.tier !== 'flagship');
  const chip = chips.sort((a, b) => b.release - a.release)[0] || vendorChipsAvailable(t)[0];
  const cc = camCaps(av), mc = memCaps(av);
  const sz = +(prefSize(cat, t) - (cat === 'phone' ? 0.2 : 0.5)).toFixed(1);
  return {
    cat, name: '', color: BODY_COLORS[0],
    chip: { kind: 'vendor', id: chip.id }, modem: 0,
    display: { tech: av.ok('disp_amoled') && t > 2014 ? 'amoled' : av.ok('disp_ips') ? 'ips' : 'tn', size: sz, ppi: Math.min(ppiCap(av), cat === 'tablet' ? 220 : 300), hz: 60, fullview: av.ok('disp_fullview') },
    cams: {
      main: { sensor: Math.max(0, cc.maxSensor - 1), mp: bestMP(Math.max(0, cc.maxSensor - 1), cc.maxMP, av), ois: false },
      ultra: { on: false, sensor: 0, mp: 5 }, tele: { on: false, periscope: false, sensor: 0, mp: 5, ois: false },
      front: { sensor: 0, mp: Math.min(2, cc.maxMP) },
    },
    battery: { mah: Math.round(interp(CATS[cat].flagMah, t) * 0.9 / 50) * 50, chem: av.ok('bat_lipo') ? 'lipo' : 'liion', charge: 5, wireless: false },
    memory: { ram: RAM_OPTIONS[Math.max(0, RAM_OPTIONS.indexOf(mc.ram) - 2)], storage: Math.max(4, mc.storage / 4), sd: true },
    body: { mat: 'plastic', water: 'none' },
    feat: { fp: 'none', face3d: false, nfc: false, stereo: false, jack: true },
    price: Math.round(segBudget(cat, 'mid', t) * 0.7 / 10) * 10 - 1,
  };
}
function defaultChipDraft(t) {
  const node = frontierNode(t, 0);
  return { name: 'My SoC 1', nm: node.nm, w: 6, h: 6, clock: node.fnom, blocks: [] };
}
function newGame(opts) {
  const start = opts.start || 2008;
  S = {
    version: 1, company: opts.company || 'Nimbus Devices', start, day: 0,
    cash: opts.cash || 2e6, debt: 0, aware: 0.01, rep: 6.5,
    researched: {}, research: [], factories: [], chips: [], products: [], rivalPhones: [], rivalNext: {},
    marketing: 0, month: emptyMonth(), history: [], shareHist: [], news: [], goals: {}, overdraftDays: 0,
    draft: null, chipDraft: null, stats: { sold: 0, launched: 0, bestReview: 0 }, speed: 0, over: false,
  };
  S.draft = defaultDraft('phone', start);
  S.chipDraft = defaultChipDraft(start);
  initRivals();
  monthlyRefresh();
  computeDemand();
  addNews(`${S.company} is founded with ${fmtMoney(S.cash)} in the bank. Time to build an empire.`, 'good');
  addNews('Tip: open the Phone Lab, pick off-the-shelf parts, and launch your first device.', 'info');
}
function emptyMonth() {
  return { revenue: 0, cogs: 0, upkeep: 0, rnd: 0, marketing: 0, overhead: 0, interest: 0, tax: 0, capex: 0, dev: 0, spare: 0, units: 0 };
}

// ---- Rivals ------------------------------------------------------------------------------
function rivalAware(r, t) {
  let a = r.aware + r.growth * Math.max(0, t - 2008);
  return clamp(a, 0.04, 0.95);
}
function makeRivalPhone(r, cat, seg, tl, gen) {
  const spec = rivalSpec(cat, seg, tl);
  const chip = vendorChipById(spec.chip.id);
  const ev = evalPhone(spec, tl, marketAv(tl), chip);
  const raw = Object.assign({}, ev.raw);
  const sk = r.skill * (0.95 + Math.random() * 0.1);     // engineering polish
  for (const k of ['cpu', 'gpu', 'cam', 'disp', 'design']) raw[k] *= sk;
  const bom = Object.values(ev.bom).reduce((a, b) => a + (b || 0), 0) * 0.88;   // volume discounts
  const B = segBudget(cat, seg, tl);
  const target = Math.max(B * r.priceMul * (0.82 + Math.random() * 0.2), bom / (1 - RETAIL_CUT) * 1.15);
  const price = Math.max(49, Math.round(target / 10) * 10 - 1);
  const name = (r.names[cat][seg] || r.name + ' {n}').replace('{n}', gen);
  return { id: uid('r'), rival: r.id, cat, seg, name, launch: tl, price, raw, bom, active: true, units: 0, subs: null, q: null, chip: chip.name };
}
function initRivals() {
  const t = now();
  for (const r of RIVALS) for (const cat in r.segs) r.segs[cat].forEach((seg, si) => {
    const key = `${r.id}|${cat}|${seg}`;
    const offset = (r.month + si * 0.7) / 12;
    let first = Math.floor(t) - 2 + offset;
    while (first < r.start[cat]) first += 1;
    let gen = Math.max(1, Math.floor(first - r.start[cat]) + 1);
    let next = first;
    // releases that already happened before the game starts
    while (next <= t) {
      if (!r.end || next < r.end) {
        retireOlder(key);
        S.rivalPhones.push(Object.assign(makeRivalPhone(r, cat, seg, next, gen++), { key }));
      }
      next += 1;
    }
    S.rivalNext[key] = { t: next, gen };
  });
}
function retireOlder(key) {
  const mine = S.rivalPhones.filter(p => p.key === key && p.active).sort((a, b) => b.launch - a.launch);
  mine.forEach((p, i) => {
    if (i === 0) p.basePrice = p.price = Math.max(49, Math.round(p.price * 0.8 / 10) * 10 - 1); // previous gen gets a price cut
    else p.active = false;
  });
}
function rivalReleases() {
  const t = now();
  for (const r of RIVALS) for (const cat in r.segs) for (const seg of r.segs[cat]) {
    const key = `${r.id}|${cat}|${seg}`, nx = S.rivalNext[key];
    if (!nx || t < nx.t) continue;
    if (r.end && t >= r.end) {
      if (t > r.end + 1.5) S.rivalPhones.forEach(p => { if (p.key === key) p.active = false; });
      continue;
    }
    retireOlder(key);
    const ph = Object.assign(makeRivalPhone(r, cat, seg, t, nx.gen), { key });
    S.rivalPhones.push(ph);
    nx.t += 1 + (Math.random() - 0.5) * 0.08; nx.gen++;
    refreshPhoneScores(ph);
    if (seg === 'premium' || seg === 'ultra' || r.id === 'orchard') addNews(`${r.name} launches the ${ph.name} at ${fmtMoney(ph.price)}.`, 'rival');
  }
  S.rivalPhones = S.rivalPhones.filter(p => p.active || t - p.launch < 3);
  for (const r of RIVALS) {
    if (!r.end || t < r.end + 1.5 || (S.exited || {})[r.id]) continue;
    S.exited = Object.assign(S.exited || {}, { [r.id]: t });
    addNews(`${r.name} exits the device business after years of declining sales.`, 'rival', true);
  }
}

// ---- Scores refresh (monthly) ----------------------------------------------------------
function refreshPhoneScores(p) {
  const cat = p.cat || p.spec.cat;
  p.subs = subscores(p.raw, cat, now());
  p.q = {};
  for (const seg of SEGMENTS) p.q[seg] = segQuality(p.subs, seg);
}
function monthlyRefresh() {
  S.rivalPhones.forEach(p => { if (p.active) refreshPhoneScores(p); });
  S.products.forEach(p => {
    if (p.status === 'dev' || p.status === 'retired') return;
    refreshPhoneScores(p);
    p.costs = null;    // recompute lazily
  });
}

// ---- Demand -------------------------------------------------------------------------------
const MKT = {};   // per category+segment: total buyer attraction & market size (rebuilt daily)
// Rivals react to the market: every month each phone nudges its price toward the
// profit-maximizing point against everyone else (bounded around its launch price).
function rivalPricing() {
  const t = now();
  for (const r of S.rivalPhones) {
    if (!r.active || !r.q || !r.segE) continue;
    const rv = RIVALS.find(x => x.id === r.rival);
    if (!r.basePrice) r.basePrice = r.price;
    const floor = Math.max(r.bom / (1 - RETAIL_CUT) * 1.05, r.basePrice * 0.7), ceil = r.basePrice * 1.12;
    let best = r.price, bestProf = -Infinity;
    for (const m of [0.92, 0.97, 1, 1.03, 1.08]) {
      const p = clamp(r.price * m, floor, ceil);
      let units = 0;
      for (const seg of SEGMENTS) {
        const mk = MKT[r.cat + seg];
        if (!mk) continue;
        const u = utility(t, r.q[seg], p, r.cat, seg, rivalAware(rv, t), rv.rep, novelty(r.launch, t));
        const e1 = u == null ? 0 : Math.exp(u), e0 = r.segE[seg] || 0;
        units += mk.M * e1 / Math.max(1e-12, mk.denom - e0 + e1);
      }
      const prof = units * (p * (1 - RETAIL_CUT) - r.bom);
      if (prof > bestProf) { bestProf = prof; best = p; }
    }
    r.price = Math.max(49, Math.round(best / 10) * 10 - 1);
  }
}
function novelty(launch, t) { return 0.3 * Math.exp(-Math.max(0, t - launch) * 12 / 3); }
function computeDemand() {
  const t = now();
  for (const cat of ['phone', 'tablet']) {
    const M = marketSize(cat, t), split = segSplit(t);
    const list = [];
    for (const r of S.rivalPhones) if (r.active && r.cat === cat && r.q) {
      const rv = RIVALS.find(x => x.id === r.rival);
      list.push({ o: r, mine: false, aware: rivalAware(rv, t), rep: rv.rep, nov: novelty(r.launch, t) });
    }
    for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat && p.q)
      list.push({ o: p, mine: true, aware: S.aware, rep: S.rep, nov: novelty(p.launch, t), review: p.review });
    list.forEach(x => { x.units = 0; x.segUnits = {}; x.segE = {}; });
    SEGMENTS.forEach((seg, i) => {
      const Ms = M * split[i];
      let R = 0, P = 0;
      for (const x of list) {
        const u = utility(t, x.o.q[seg], x.o.price, cat, seg, x.aware, x.rep, x.nov, x.review);
        x.e = u == null ? 0 : Math.exp(u);
        if (x.mine) P += x.e; else R += x.e;
      }
      const outside = 0.25 * R + Math.exp(SEG_INFO[seg].a * 6 - 1.2);
      const denom = outside + R + P;
      MKT[cat + seg] = { denom, M: Ms };
      for (const x of list) { const u = Ms * x.e / denom; x.units += u; x.segUnits[seg] = u; x.segE[seg] = x.e; }
    });
    for (const x of list) { x.o.demand = x.units; x.o.segUnits = x.segUnits; x.o.segE = x.segE; }
  }
}
// what-if: estimated monthly units for a not-yet-launched design at a price
function estimateDemand(raw, cat, price, review) {
  const t = now();
  const subs = subscores(raw, cat, t);
  const M = marketSize(cat, t), split = segSplit(t);
  let units = 0;
  const bySeg = {};
  SEGMENTS.forEach((seg, i) => {
    let R = 0, P = 0;
    for (const r of S.rivalPhones) if (r.active && r.cat === cat && r.q) {
      const rv = RIVALS.find(x => x.id === r.rival);
      const u = utility(t, r.q[seg], r.price, cat, seg, rivalAware(rv, t), rv.rep, novelty(r.launch, t));
      if (u != null) R += Math.exp(u);
    }
    for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat && p.q) {
      const u = utility(t, p.q[seg], p.price, cat, seg, S.aware, S.rep, novelty(p.launch, t), p.review);
      if (u != null) P += Math.exp(u);
    }
    const u = utility(t, segQuality(subs, seg), price, cat, seg, S.aware, S.rep, 0.3, review);
    const e = u == null ? 0 : Math.exp(u);
    const out = 0.25 * R + Math.exp(SEG_INFO[seg].a * 6 - 1.2);
    bySeg[seg] = M * split[i] * e / (out + R + P + e);
    units += bySeg[seg];
  });
  return { units, bySeg, subs };
}
function segmentForPrice(cat, price) {
  let best = 'budget', bd = 1e9;
  for (const seg of SEGMENTS) { const d = Math.abs(Math.log(price / segBudget(cat, seg, now()))); if (d < bd) { bd = d; best = seg; } }
  return best;
}
function predictReview(raw, cat, price) {
  const t = now(), seg = segmentForPrice(cat, price), si = SEG_INFO[seg], B = segBudget(cat, seg, t);
  const subs = subscores(raw, cat, t);
  const V = si.a * segQuality(subs, seg) / 10 - 3 * si.b * Math.log(price / B);
  const rivals = S.rivalPhones.filter(r => r.active && r.cat === cat && r.seg === seg && r.q);
  let Vbar = si.a * 7;
  if (rivals.length) Vbar = rivals.reduce((a, r) => a + si.a * r.q[seg] / 10 - 3 * si.b * Math.log(r.price / B), 0) / rivals.length;
  const avgSubs = {};
  for (const k in SUB_LABELS) avgSubs[k] = rivals.length ? rivals.reduce((a, r) => a + r.subs[k], 0) / rivals.length : 70;
  return { score: clamp(6.3 + 1.6 * (V - Vbar), 1, 10), seg, subs, avgSubs };
}
function reviewNotes(p, rv, ev) {
  const diffs = Object.keys(SUB_LABELS).map(k => [k, rv.subs[k] - rv.avgSubs[k]]).sort((a, b) => b[1] - a[1]);
  const good = { perf: 'blazing performance', cam: 'a superb camera', disp: 'a gorgeous display', batt: 'outstanding battery life', design: 'a premium, sleek build', feat: 'a loaded feature set' };
  const bad = { perf: 'sluggish performance', cam: 'a disappointing camera', disp: 'a mediocre screen', batt: 'weak battery life', design: 'a cheap-feeling, chunky build', feat: 'missing features' };
  const notes = [];
  if (diffs[0][1] > 4) notes.push('+ ' + good[diffs[0][0]]);
  if (diffs[1][1] > 4) notes.push('+ ' + good[diffs[1][0]]);
  if (diffs[5][1] < -4) notes.push('− ' + bad[diffs[5][0]]);
  if (diffs[4][1] < -6) notes.push('− ' + bad[diffs[4][0]]);
  if (ev.sustain < 0.7) notes.push('− runs hot and throttles under load');
  if (p.exclusive && p.exclusive.length) notes.push('+ first to ship ' + p.exclusive.map(id => TECH[id].name).join(', '));
  return notes;
}

// ---- Actions ------------------------------------------------------------------------------
function spend(amount, bucket) { S.cash -= amount; S.month[bucket] = (S.month[bucket] || 0) + amount; }
function devCost(cat) { return CATS[cat].devCost * (1 + 0.12 * Math.max(0, now() - 2008)); }
function launchProduct(spec) {
  const av = playerAv();
  const chip = chipFor(spec);
  if (!chip) return 'Pick a processor.';
  if (!spec.name || !spec.name.trim()) return 'Give your device a name.';
  const a = specAvailability(spec, av);
  if (!a.ok) return 'Some selected parts are not available to you.';
  const cost = devCost(spec.cat);
  if (S.cash - cost < -creditLimit()) return 'Not enough cash for development.';
  const t = now();
  const ev = evalPhone(spec, t, av, chip);
  const used = specTechs(spec);
  const exclusive = [];
  for (const k in used) for (const id of used[k]) if (id && !av.market(id) && !exclusive.includes(id)) exclusive.push(id);
  spend(cost, 'dev');
  const p = {
    id: uid('p'), name: spec.name.trim(), spec: JSON.parse(JSON.stringify(spec)), raw: ev.raw, price: spec.price,
    status: 'dev', devUntil: S.day + 45, launch: null, auto: true, rate: 10000, inventory: 0, acc: 0,
    sold: 0, soldMonth: 0, soldLastMonth: 0, revenue: 0, profit: 0, review: null, notes: [], exclusive,
    lost: 0, demand: 0, unitCostLast: 0, created: t, designDate: t,
  };
  S.products.push(p);
  addNews(`Development started on the ${p.name} (${fmtMoney(cost)}, 45 days).`, 'info');
  return null;
}
function finishDev(p) {
  const t = now();
  p.status = 'active'; p.launch = t;
  refreshPhoneScores(p);
  const ev = evalPhone(p.spec, t, playerAv(), chipFor(p.spec));
  const rv = predictReview(p.raw, p.spec.cat, p.price);
  p.review = Math.round(rv.score * 10) / 10;
  p.notes = reviewNotes(p, rv, ev);
  S.rep = S.rep * 0.7 + p.review * 0.3;
  if (p.review >= 7.5) S.aware = clamp(S.aware + (1 - S.aware) * 0.015 * (p.review - 7), 0, 0.95);
  S.stats.launched++;
  S.stats.bestReview = Math.max(S.stats.bestReview, p.review);
  completeGoal('launch1');
  if (p.review >= 8) completeGoal('review8');
  if (p.spec.cat === 'phone' && isFullyVertical(p)) completeGoal('vertical');
  addNews(`🚀 ${p.name} launches! Reviews: ${p.review.toFixed(1)}/10 — ${p.notes.join(', ') || 'a solid, unremarkable device'}.`, p.review >= 7 ? 'good' : p.review < 5 ? 'bad' : 'info', true);
}
function isFullyVertical(p) {
  const c = chipRecord(p.spec);
  return !!c && hasFab(c.stats.nm) && ['display', 'camera', 'battery', 'memory', 'assembly'].every(factoryActive) && chipFor(p.spec).modemGen > 0;
}
function tapeOut(design) {
  const ev = evalChipDesign(design);
  if (!ev.ok) return ev.issues.find(i => i.err).text;
  if (!design.name.trim()) return 'Name your chip.';
  const cost = tapeOutCost(design);
  if (S.cash - cost < -creditLimit()) return 'Not enough cash for the mask set.';
  spend(cost, 'dev');
  const stats = Object.assign({}, ev);
  delete stats.heat; delete stats.issues; delete stats.units;
  stats.kind = 'custom'; stats.name = design.name.trim();
  S.chips.push({ id: uid('c'), name: design.name.trim(), design: JSON.parse(JSON.stringify(design)), stats, status: 'taping', readyDay: S.day + 120, created: now() });
  addNews(`${design.name} taped out at ${nodeLabel(design.nm)} (${fmtMoney(cost)}). First silicon in ~4 months.`, 'info');
  return null;
}
function tapeOutCost(design) {
  const node = nodeByNm(design.nm);
  const area = design.w * design.h * CELL_MM2;
  return node.mask + 1.5e6 * (1 + 0.15 * Math.max(0, now() - 2008)) * Math.pow(area / 50, 0.7);   // masks + design team
}

function factoryBuildCost(type, nm) { return type === 'fab' ? nodeByNm(nm).fab : FACTORY_TYPES[type].cost; }
function factoryUpkeep(f) {
  const base = f.type === 'fab' ? nodeByNm(f.nm).fab * 0.004 : FACTORY_TYPES[f.type].upkeep;
  return base * (1 + 0.6 * (f.level - 1));
}
function factoryCap(f) { return FACTORY_TYPES[f.type].cap * f.level; }
function buildFactory(type, nm) {
  const cost = factoryBuildCost(type, nm);
  if (type === 'fab') {
    const node = nodeByNm(nm);
    if (now() < node.year && !S.researched['proc_' + nm]) return 'Research this process node first.';
  }
  if (S.cash - cost < -creditLimit()) return 'Not enough cash (consider a loan in Finance).';
  spend(cost, 'capex');
  const days = type === 'fab' ? FACTORY_TYPES.fab.days + 15 * NODES.findIndex(n => n.nm === nm) : FACTORY_TYPES[type].days;
  S.factories.push({ id: uid('f'), type, nm: nm || null, level: 1, status: 'building', readyDay: S.day + days, invested: cost, sellSpare: true, used: 0, usedLast: 0 });
  addNews(`Construction started: ${factoryName({ type, nm })} (${fmtMoney(cost)}, ${Math.round(days / 30)} months).`, 'info');
  return null;
}
function factoryName(f) { return f.type === 'fab' ? `${nodeLabel(f.nm)} Chip Fab` : FACTORY_TYPES[f.type].name; }
function upgradeCost(f) { return factoryBuildCost(f.type, f.nm) * 0.6 * f.level; }
function upgradeFactory(f) {
  if (f.level >= FACTORY_MAX_LEVEL || f.upgradeUntil) return 'Cannot upgrade now.';
  const cost = upgradeCost(f);
  if (S.cash - cost < -creditLimit()) return 'Not enough cash.';
  spend(cost, 'capex');
  f.invested += cost;
  const days = Math.round((f.type === 'fab' ? FACTORY_TYPES.fab.days : FACTORY_TYPES[f.type].days) * 0.5);
  f.upgradeUntil = S.day + days;
  addNews(`Expanding ${factoryName(f)} to level ${f.level + 1} (${Math.round(days / 30)} months).`, 'info');
  return null;
}
function sellFactory(f) {
  const refund = f.invested * (f.status === 'active' ? 0.35 : 0.2);
  S.cash += refund;
  S.factories = S.factories.filter(x => x !== f);
  addNews(`Sold ${factoryName(f)} for ${fmtMoney(refund)}.`, 'info');
  S.products.forEach(p => { p.costs = null; });
}

function researchSlots() { return 1 + S.factories.filter(f => f.type === 'rnd' && f.status === 'active').reduce((a, f) => a + f.level, 0); }
function researchSpeed() { return 1 + 0.25 * S.factories.filter(f => f.type === 'rnd' && f.status === 'active').reduce((a, f) => a + f.level, 0); }
function researchCost(tc) { return tc.cost * (1 + 0.3 * Math.max(0, tc.market - 2008)); }
function techState(tc) {
  const t = now();
  if (S.researched[tc.id]) return 'done';
  if (t >= tc.market) return 'standard';
  if (S.research.some(r => r.id === tc.id)) return 'active';
  if (t < tc.market - tc.lead) return 'future';
  if (tc.req.some(id => !S.researched[id] && t < TECH[id].market)) return 'locked';
  return 'available';
}
function startResearch(id) {
  const tc = TECH[id];
  if (techState(tc) !== 'available') return 'Not available.';
  if (S.research.length >= researchSlots()) return 'All research slots busy. Build an R&D Center for more.';
  const cost = researchCost(tc);
  if (S.cash - cost < -creditLimit()) return 'Not enough cash.';
  spend(cost, 'rnd');
  S.research.push({ id, progress: 0, cost });
  return null;
}

// ---- Finance -----------------------------------------------------------------------------
function avgRevenue() {
  const h = S.history.slice(-3);
  return h.length ? h.reduce((a, m) => a + m.revenue, 0) / h.length : 0;
}
function creditLimit() { return 250e3 + 0.5 * avgRevenue(); }
function factoryValue() { return S.factories.reduce((a, f) => a + f.invested * 0.6, 0); }
function inventoryValue() { return S.products.reduce((a, p) => a + p.inventory * (p.unitCostLast || 0), 0); }
function netWorth() { return S.cash - S.debt + factoryValue() + inventoryValue(); }
function loanLimit() { return Math.max(0, 1.5e6 + 0.3 * Math.max(0, netWorth()) + 3 * avgRevenue() - S.debt); }
function loanRate() { return 0.08; }
function borrow(amt) { amt = Math.min(amt, loanLimit()); if (amt <= 0) return; S.debt += amt; S.cash += amt; addNews(`Borrowed ${fmtMoney(amt)} at ${(loanRate() * 100).toFixed(0)}% APR.`, 'info'); }
function repay(amt) { amt = Math.min(amt, S.debt, Math.max(0, S.cash)); if (amt <= 0) return; S.debt -= amt; S.cash -= amt; }

// ---- News & goals -------------------------------------------------------------------------
function addNews(text, kind, important) {
  const n = { day: S.day, t: now(), text, kind: kind || 'info' };
  S.news.unshift(n);
  if (S.news.length > 120) S.news.length = 120;
  emit('news', Object.assign({ important }, n));
}
function completeGoal(id) {
  if (S.goals[id]) return;
  S.goals[id] = now();
  const g = GOALS.find(x => x.id === id);
  addNews('🏆 Goal complete: ' + g.text, 'good', true);
}

// ---- The daily tick -------------------------------------------------------------------------
function tickDay() {
  if (S.over) return;
  const prevMonth = monthIndex(now());
  S.day++;
  const t = now();
  const av = playerAv();

  // research
  const spd = researchSpeed();
  for (const r of S.research.slice()) {
    const tc = TECH[r.id];
    r.progress += spd;
    if (t >= tc.market) {
      S.research = S.research.filter(x => x !== r);
      S.cash += r.cost * 0.5;
      addNews(`${tc.name} became industry standard before your research finished. 50% refunded.`, 'bad');
    } else if (r.progress >= tc.days) {
      S.research = S.research.filter(x => x !== r);
      S.researched[tc.id] = t;
      completeGoal('research');
      const fac = TECH_CATS[tc.cat].factory;
      const need = fac && fac !== 'fab' && !factoryActive(fac) ? ` — build a ${FACTORY_TYPES[fac].name} to use it.` : '';
      addNews(`🔬 Research complete: ${tc.name}! Exclusive to you until ${dateLabel(tc.market)}${need}`, 'good', true);
    }
  }
  // construction
  for (const f of S.factories) {
    if (f.status === 'building' && S.day >= f.readyDay) {
      f.status = 'active';
      addNews(`🏗️ ${factoryName(f)} is online.`, 'good', true);
      S.products.forEach(p => { p.costs = null; });
      if (f.type === 'assembly') completeGoal('assembly');
      if (['camera', 'battery', 'display', 'memory'].includes(f.type)) completeGoal('component');
      if (f.type === 'fab') completeGoal('fab');
    }
    if (f.upgradeUntil && S.day >= f.upgradeUntil) {
      f.level++; f.upgradeUntil = null;
      addNews(`${factoryName(f)} expanded to level ${f.level}.`, 'good');
    }
  }
  for (const c of S.chips) if (c.status === 'taping' && S.day >= c.readyDay) {
    c.status = 'ready';
    completeGoal('chip');
    addNews(`💠 First silicon is back: ${c.name} works! It is now available in the Phone Lab.`, 'good', true);
  }
  for (const p of S.products) if (p.status === 'dev' && S.day >= p.devUntil) finishDev(p);

  rivalReleases();
  computeDemand();

  // ---- production ----
  const pool = {};
  for (const f of S.factories) if (f.status === 'active' && f.type !== 'rnd') {
    const k = f.type === 'fab' ? 'fab' + f.nm : f.type;
    pool[k] = (pool[k] || 0) + factoryCap(f) / 30;
  }
  const poolStart = Object.assign({}, pool);
  const broke = S.cash < -creditLimit();
  for (const p of S.products) if (p.status === 'active' && !p.costs) p.costs = productCosts(p.spec, t, av);
  // devices that depend on exclusive in-house parts get first claim on factory capacity
  const order = S.products.filter(p => p.status === 'active')
    .sort((a, b) => b.costs.comps.some(c => c.buy == null) - a.costs.comps.some(c => c.buy == null));
  for (const p of order) {
    const dd = p.demand / 30;
    let want = p.auto ? Math.max(0, dd + (dd * 21 - p.inventory) / 10) : p.rate / 30;
    if (p.discontinued || broke) want = 0;
    want += p.acc;
    let units = Math.floor(want);
    p.acc = Math.min(1, want - units);
    for (const c of p.costs.comps) {
      if (c.buy == null) {                         // exclusive: limited by our own capacity
        const cap = c.pool ? (pool[c.pool] || 0) : 0;
        units = Math.min(units, Math.floor(cap / c.per + 1e-9));
      }
    }
    p.capLimited = units < Math.floor(want) && !broke;
    if (units <= 0) continue;
    let cost = 0;
    for (const c of p.costs.comps) {
      if (c.pool) {
        const need = units * c.per;
        const use = Math.min(need, pool[c.pool] || 0);
        pool[c.pool] = (pool[c.pool] || 0) - use;
        const frac = need > 0 ? use / need : 0;
        cost += units * (frac * c.in + (1 - frac) * (c.buy != null ? c.buy : c.in));
      } else cost += units * c.buy;
    }
    p.inventory += units;
    p.unitCostLast = cost / units;
    p.producedMonth = (p.producedMonth || 0) + units;
    spend(cost, 'cogs');
  }
  // factory utilization bookkeeping
  for (const f of S.factories) if (f.status === 'active' && f.type !== 'rnd') {
    const k = f.type === 'fab' ? 'fab' + f.nm : f.type;
    const share = poolStart[k] > 0 ? (factoryCap(f) / 30) / poolStart[k] : 0;
    f.used += (poolStart[k] - (pool[k] || 0)) * share;
  }

  // ---- sales ----
  for (const p of S.products) {
    if (p.status !== 'active') continue;
    const dd = p.demand / 30 * (0.9 + Math.random() * 0.2);
    p.dAcc = (p.dAcc || 0) + dd;
    const want = Math.floor(p.dAcc);
    p.dAcc -= want;
    const sold = Math.min(want, p.inventory);
    p.lost += want - sold;
    p.inventory -= sold;
    const rev = sold * p.price * (1 - RETAIL_CUT);
    p.sold += sold; p.soldMonth += sold; p.revenue += rev;
    p.profit += rev - sold * (p.unitCostLast || 0);
    S.cash += rev; S.month.revenue += rev; S.month.units += sold;
    S.stats.sold += sold;
    if (p.discontinued && p.inventory <= 0) { p.status = 'retired'; addNews(`${p.name} sold out and is retired.`, 'info'); }
  }
  if (S.stats.sold >= 25000) completeGoal('sold25k');

  // ---- daily share of fixed costs ----
  spend(S.marketing / 30, 'marketing');

  if (S.cash < -creditLimit()) S.overdraftDays++; else S.overdraftDays = 0;
  if (S.overdraftDays > 60) { S.over = true; emit('gameover'); return; }

  if (monthIndex(t) !== prevMonth) endOfMonth();
}

function endOfMonth() {
  const t = now();
  const m = S.month;
  // fixed costs
  let upkeep = 0;
  for (const f of S.factories) if (f.status === 'active') upkeep += factoryUpkeep(f);
  spend(upkeep, 'upkeep');
  const active = S.products.filter(p => p.status === 'active').length;
  spend(40e3 + 25e3 * active + 0.08 * m.revenue, 'overhead');   // staff, software, support, offices
  spend(inventoryValue() * 0.015, 'overhead');
  spend(S.debt * loanRate() / 12 + Math.max(0, -S.cash) * 0.18 / 12, 'interest');
  // spare factory capacity sold to other device makers
  let spare = 0;
  for (const f of S.factories) {
    if (f.status === 'active' && f.type !== 'rnd' && f.sellSpare) {
      const free = Math.max(0, factoryCap(f) - f.used);
      const val = f.type === 'fab' ? waferPrice(nodeByNm(f.nm), t) * 0.35 : FACTORY_TYPES[f.type].spare;
      spare += free * val * 0.4;
    }
    f.usedLast = f.used; f.used = 0;
  }
  S.cash += spare; m.spare = spare;
  // brand awareness
  const total = marketSize('phone', t) + marketSize('tablet', t);
  const K = 8e6 * Math.sqrt(total / 60e6);
  const gain = 0.16 * m.marketing / (m.marketing + K);
  const wom = Math.min(0.02, 0.3 * m.units / total) * (S.rep / 7);
  S.aware = clamp(S.aware + (1 - S.aware) * (gain + wom) - 0.03 * S.aware, 0.005, 0.95);
  // market share snapshot
  const share = { t };
  for (const cat of ['phone', 'tablet']) {
    const by = {};
    for (const r of S.rivalPhones) if (r.active && r.cat === cat) by[r.rival] = (by[r.rival] || 0) + (r.demand || 0);
    by.you = S.products.filter(p => p.spec.cat === cat && p.status === 'active').reduce((a, p) => a + Math.min(p.demand || 0, p.soldMonth || 0), 0);
    by.total = marketSize(cat, t);
    share[cat] = by;
  }
  S.shareHist.push(share);
  if (S.shareHist.length > 400) S.shareHist.shift();
  const ph = share.phone;
  if (ph.you / ph.total >= 0.05) completeGoal('share5');
  if (ph.you > 0 && RIVALS.every(r => (ph[r.id] || 0) < ph.you)) completeGoal('top1');
  // close the books (22% corporate tax, losses carry forward)
  const pretax = m.revenue + m.spare - m.cogs - m.upkeep - m.rnd - m.marketing - m.overhead - m.interest - m.dev;
  S.taxLoss = S.taxLoss || 0;
  let taxable = pretax;
  if (taxable > 0) { const use = Math.min(S.taxLoss, taxable); taxable -= use; S.taxLoss -= use; } else S.taxLoss -= taxable;
  m.tax = Math.max(0, taxable) * 0.22;
  S.cash -= m.tax;
  const profit = pretax - m.tax;
  S.history.push(Object.assign({ t: t - 1 / 12, profit, cash: S.cash, worth: netWorth(), aware: S.aware }, m));
  if (S.history.length > 400) S.history.shift();
  S.products.forEach(p => { p.soldLastMonth = p.soldMonth; p.soldMonth = 0; p.producedLast = p.producedMonth || 0; p.producedMonth = 0; });
  S.month = emptyMonth();
  if (netWorth() >= 10e9) completeGoal('worth10b');
  // world news
  for (const tc of TECHS) if (!S.seenTech?.[tc.id] && t >= tc.market && t - 1 / 12 < tc.market) {
    S.seenTech = S.seenTech || {};
    S.seenTech[tc.id] = 1;
    if (['display', 'camera', 'chip', 'body'].includes(tc.cat) && !tc.id.startsWith('chip_arch')) addNews(`📈 Industry trend: ${tc.name} is now standard across the market.`, 'world');
  }
  for (const n of NODES) if (t >= n.year && t - 1 / 12 < n.year) addNews(`💠 Foundries now offer the ${nodeLabel(n.nm)} process (${fmtMoney(n.wafer)}/wafer).`, 'world');
  for (const e of EVENTS) if (t >= e.start && t - 1 / 12 < e.start) addNews(`🌍 ${e.title}: ${e.desc}`, 'bad', true);
  for (const c of VENDOR_CHIPS) if (c.tier === 'flagship' && c.release <= t && c.release > t - 1 / 12) addNews(`${c.vendor} unveils the ${c.name} flagship chip (${nodeLabel(c.nm)}).`, 'world');
  rivalPricing();
  monthlyRefresh();
  emit('month');
  save();
}

// ---- Save / load ----------------------------------------------------------------------------
// cached per-product cost breakdowns are rebuilt on load, so keep them out of the save
const serialize = () => JSON.stringify(S, (k, v) => (k === 'costs' ? undefined : v));
function save() {
  try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { return false; }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.version !== 1) return false;
    S = s;
    monthlyRefresh();
    computeDemand();
    return true;
  } catch (e) { return false; }
}
function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

// ---- Formatting (shared with UI) ------------------------------------------------------------
function fmtMoney(v, dec) {
  const s = v < 0 ? '−$' : '$', a = Math.abs(v);
  if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e11 ? 0 : 2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 1e4) return s + Math.round(a / 1e3) + 'k';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k';
  return s + a.toFixed(dec == null ? (a < 100 ? 2 : 0) : dec);
}
function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e8 ? 0 : 2) + 'M';
  if (a >= 1e4) return Math.round(v / 1e3) + 'k';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return Math.round(v).toString();
}
const fmtPct = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + '%';
