'use strict';
// ============================================================================
//  Simulation: game state, daily tick (research, construction, component
//  stock, production orders, sales, supply contracts), monthly bookkeeping,
//  investors, rivals, save/load.
// ============================================================================

const SAVE_KEY = 'phoneEmpireSave_v2';
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
const perk = (key, dflt) => { const v = PLAYSTYLES[S.playstyle][key]; return v == null ? dflt : v; };
const eraDev = () => interp(ERA_DEV, now());
const eraFactory = () => interp(ERA_FACTORY, now());
const fundScale = () => interp(ERA_FUND, now());

// ---- Availability for the player -----------------------------------------------
function factoryActive(type) {
  if (type === 'assembly') return S.factories.some(f => (f.type === 'assembly' || f.type === 'workshop') && f.status === 'active');
  return S.factories.some(f => f.type === type && f.status === 'active');
}
function hasFab(nm) { return S.factories.some(f => f.type === 'fab' && f.nm === nm && f.status === 'active'); }
// Everything must be researched. Before its market date, a tech also needs your own factory.
function playerAv() {
  const t = now();
  return {
    t,
    market: id => !id || t >= TECH[id].market,
    has: id => !id || !!S.researched[id],
    inhouse(id) {
      if (!id) return true;
      if (!S.researched[id]) return false;
      const fac = TECH_CATS[TECH[id].cat].factory;
      return fac === null || fac === 'fab' || factoryActive(fac);
    },
    ok(id) { return this.has(id) && (this.market(id) || this.inhouse(id)); },
    ownOS: () => !!S.researched.os_own,
  };
}
// rivals use what is industry standard, plus anything you licensed to them
function rivalAv(t) {
  return { t, market: id => !id || t >= TECH[id].market || !!(S && S.licensed && S.licensed[id]), ok(id) { return this.market(id); } };
}
const archGenFor = av => { let g = 1; for (let k = 2; k <= 20; k++) if (av.ok('chip_arch' + k)) g = k; return g; };
function modemGenFor(av) { let g = 1; for (let k = 2; k < MODEM_TECH.length; k++) if (av.ok(MODEM_TECH[k])) g = k; return g; }
function nodesForDesign() {
  const av = playerAv();
  return NODES.filter((n, i) => (i === 0 || av.has('proc_' + n.nm)) && (n.year <= now() || hasFab(n.nm)));
}

// ---- Techs used by a design (to know what is locked / exclusive) ---------------
function camModuleTech(c) {
  const g = CAM_GENS.find(gg => c.sensor <= gg[1] && c.mp <= gg[2]);
  return g ? g[0] : 'cam_g8';
}
function specTechs(spec) {
  const d = spec.display, b = spec.battery, m = spec.memory, cams = spec.cams, form = formOf(spec);
  const ppi = PPI_CAPS.find(p => d.ppi <= p[1]);
  const sizeT = form === 'slate' ? (d.size > 10.1 ? 'disp_tab13' : null) : form === 'fold' ? null : (SIZE_CAPS.find(c => d.size <= c[1] + 1e-9) || ['disp_size10'])[0];
  const camT = camerasList(cams).map(([, c]) => camModuleTech(c));
  if (cams.front.on) camT.push('cam_front');
  if (cams.flash && cams.main.on) camT.push('cam_flash');
  if ((cams.main.on && cams.main.ois) || (cams.tele.on && cams.tele.ois)) camT.push('cam_ois');
  if (cams.ultra.on || cams.tele.on) camT.push('cam_multi');
  if (cams.tele.on && cams.tele.periscope) camT.push('cam_periscope');
  const mem = MEM_GENS.find(g => m.ram <= g[1] && m.storage <= g[2]);
  const mah = MAH_CAPS.find(c => b.mah <= (spec.cat === 'tablet' ? Math.max(3000, c[1] * 2.2) : c[1]));
  const f = spec.feat;
  return {
    display: [DISPLAY_TECH[d.tech].tech, ppi ? ppi[0] : 'disp_530', sizeT, (REFRESH.find(r => r.hz === d.hz) || REFRESH[0]).tech,
      d.fullview ? 'disp_fullview' : null, TOUCH[d.touch || 'none'].tech, form === 'fold' ? 'disp_fold' : null],
    camera: camT,
    battery: [CHEM[b.chem].tech, mah ? mah[0] : 'bat_c11', (CHARGE.find(c => c.w === b.charge) || CHARGE[0]).tech, b.wireless ? 'bat_wireless' : null],
    memory: [mem ? mem[0] : 'mem_g10', m.sd ? 'feat_sd' : null],
    design: [FORMS[form].tech, MATERIALS[spec.body.mat].tech, WATER[spec.body.water].tech, spec.body.antenna === 'internal' ? 'body_intant' : null],
    features: [FINGERPRINT[f.fp].tech, OS[spec.os].tech].concat(EXTRAS.filter(e => f[e[0]]).map(e => e[1])),
    chip: [MODEM_TECH[spec.modem || 0]],
  };
}
// returns {ok, missing:[techIds], exclusive:{display:bool,...}, problems:[text]}
function specAvailability(spec, av) {
  const used = specTechs(spec);
  const missing = [], exclusive = {}, problems = [];
  for (const k in used) {
    exclusive[k] = false;
    for (const id of used[k]) {
      if (!id) continue;
      if (!av.ok(id)) { if (!missing.includes(id)) missing.push(id); }
      else if (!av.market(id)) exclusive[k] = true;
    }
  }
  const chip = chipFor(spec);
  if (!chip) problems.push('Pick a processor.');
  else {
    if (chip.kind === 'vendor' && !av.ok(MODEM_TECH[chip.modemGen])) problems.push(`This chip has a ${MODEM_GENS[chip.modemGen]} modem – research ${TECH[MODEM_TECH[chip.modemGen]].name} first.`);
    if (!chip.modemGen && !spec.modem) problems.push('This chip has no modem – add a discrete modem.');
  }
  const form = formOf(spec);
  if (!isKeypad(form) && spec.display.touch === 'none') problems.push(`A ${FORMS[form].name.toLowerCase()} needs a touchscreen.`);
  return { ok: missing.length === 0 && problems.length === 0, missing, exclusive, problems };
}

// ---- Chips --------------------------------------------------------------------------
function chipFor(spec) {
  if (spec.chip.kind === 'vendor') return vendorChipById(spec.chip.id);
  const c = S.chips.find(x => x.id === spec.chip.id);
  return c ? c.stats : null;
}
function chipRecord(spec) { return spec.chip.kind === 'custom' ? S.chips.find(x => x.id === spec.chip.id) : null; }
function customChipCost(stats, t) {
  const e = chipEconomics(stats.area, stats.nm, t);
  return { e, fab: hasFab(stats.nm), early: t < nodeByNm(stats.nm).year };
}

// ---- Makers: contract manufacturers or your own lines -----------------------------------
function ownAssemblyMul() {
  const plant = S.factories.some(f => f.type === 'assembly' && f.status === 'active');
  return (plant ? FACTORY_TYPES.assembly.assemblyMul : FACTORY_TYPES.workshop.assemblyMul) * perk('inMul', 1);
}
function partnerById(id) { return PARTNERS.find(p => p.id === id); }
// can this maker build this spec right now? returns null or a reason
function makerProblem(maker, spec, av) {
  const ex = specAvailability(spec, av).exclusive;
  if (maker === 'own') return factoryActive('assembly') ? null : 'You have no assembly line yet (Factories tab).';
  const p = partnerById(maker);
  if (!p) return 'Unknown manufacturer.';
  if (now() < p.since) return `${p.name} doesn't exist yet.`;
  if (ex.design || ex.features) return 'Uses exclusive design/feature tech – only your own assembly line can build it.';
  const tier = complexityTier(spec);
  if (tier > p.tier) return `${p.name} can only build up to ${TIER_NAMES[p.tier]} devices (this one is ${TIER_NAMES[tier]}).`;
  const need = p.minRev * fundScale();
  if (need > 0 && avgRevenue() < need) return `${p.name} only works with clients earning ${fmtMoney(need)}+/month.`;
  return null;
}
function makerName(maker) { return maker === 'own' ? 'Your assembly line' : partnerById(maker).name; }

// ---- Costs per unit ---------------------------------------------------------------------
function productCosts(spec, t, av, maker) {
  const chip = chipFor(spec);
  const ev = evalPhone(spec, t, av, chip);
  const ex = specAvailability(spec, av).exclusive;
  const comps = [];
  if (spec.chip.kind === 'vendor') comps.push({ key: 'chip', label: 'SoC (' + chip.vendor + ')', buy: ev.bom.chip });
  else {
    const { e, fab, early } = customChipCost(chip, t);
    comps.push({ key: 'chip', label: 'SoC (custom)', pool: fab ? 'fab' + chip.nm : null, wafers: 1 / e.good, in: e.own, buy: early ? null : e.foundry, buyLabel: 'foundry' });
  }
  if (!ev.integrated) comps.push({ key: 'modem', label: 'Discrete modem', buy: ev.bom.modem });
  const inMul = perk('inMul', 1);
  const part = (key, label, price, per, excl) => {
    if (per <= 0) return;
    comps.push({ key, label, stock: factoryActive(key) ? key : null, per, in: price / FACTORY_TYPES[key].markup / per * inMul, buy: excl ? null : price / per, perUnitBuy: price });
  };
  part('display', 'Display', ev.bom.display, 1, ex.display);
  part('camera', 'Cameras ×' + ev.nCams, ev.bom.camera, ev.nCams, ex.camera);
  part('battery', 'Battery', ev.bom.battery, 1, ex.battery);
  part('memory', 'Memory', ev.bom.memory, 1, ex.memory);
  comps.push({ key: 'body', label: 'Body & features', buy: ev.bom.body });
  comps.push({ key: 'misc', label: 'Board, RF, keys, box', buy: ev.bom.misc });
  if (ev.bom.os > 0) comps.push({ key: 'os', label: 'OS license', buy: ev.bom.os });
  maker = maker || defaultMaker(spec);
  const fee = maker === 'own' ? ev.bom.assembly * ownAssemblyMul() : ev.bom.assembly * (partnerById(maker) || PARTNERS[0]).fee * perk('feeMul', 1);
  comps.push({ key: 'assembly', label: maker === 'own' ? 'Assembly (own line)' : 'Assembly (' + (partnerById(maker) || PARTNERS[0]).name + ')', buy: fee, maker });
  let est = 0, allBuy = 0;
  for (const c of comps) {
    const per = c.per || 1;
    est += per * ((c.stock || c.pool) ? c.in : (c.buy != null ? c.buy : c.in || 0));
    allBuy += per * (c.buy != null ? c.buy : (c.in || 0));
  }
  return { comps, est, allBuy, ev, chip, maker };
}
function defaultMaker(spec) {
  if (factoryActive('assembly')) return 'own';
  const av = playerAv();
  const ok = PARTNERS.filter(p => !makerProblem(p.id, spec, av));
  return (ok.length ? ok[ok.length - 1] : PARTNERS[0]).id;
}

// ---- New game -------------------------------------------------------------------------
function defaultDraft(cat, t) {
  const av = playerAv();
  const form = cat === 'tablet' ? 'slate' : (av.ok('form_touch') ? 'touch' : 'candybar');
  const d = buildSpec(cat, t, av, form, 1);
  const chips = vendorChipsAvailable(t).filter(c => av.ok(MODEM_TECH[c.modemGen])).sort((a, b) => b.cpu - a.cpu);
  d.chip = { kind: 'vendor', id: (chips.find(c => c.tier !== 'flagship') || chips[0] || vendorChipsAvailable(t)[0]).id };
  const cost = productCosts(d, t, av).est;
  d.price = Math.max(Math.round(segBudget(cat, 'mid', t) * 0.8 / 10) * 10 - 1, Math.round(cost / (1 - RETAIL_CUT) * 1.3 / 10) * 10 - 1);
  return d;
}
function defaultChipDraft(t) {
  const nodes = nodesForDesign();
  const node = nodes[nodes.length - 1] || NODES[0];
  return { name: 'My SoC 1', nm: node.nm, w: 5, h: 5, clock: node.fnom, blocks: [] };
}
function newGame(opts) {
  const start = opts.start || FIRST_YEAR;
  S = {
    version: 2, company: opts.company || 'Nimbus Devices', playstyle: opts.playstyle || 'brand', start, day: 0,
    cash: opts.cash || 10e3, debt: 0, own: 1, aware: 0.005, rep: 6.5,
    researched: {}, rsPaid: {}, research: [], licensed: {}, factories: [], chips: [], products: [], protos: [], orders: [],
    stock: Object.fromEntries(STOCK_TYPES.map(k => [k, { qty: 0, cost: 0, use: 0 }])),
    contracts: [], offers: [], funding: { done: {}, pitch: null, offer: null, cooldown: {} },
    rivalPhones: [], rivalNext: {}, marketing: 0, month: emptyMonth(), history: [], shareHist: [], news: [], goals: {}, overdraftDays: 0,
    draft: null, chipDraft: null, stats: { sold: 0, launched: 0, bestReview: 0, researched: 0 }, speed: 0, over: false, taxLoss: 0, exited: {},
  };
  S.aware = perk('aware', 0.005);
  for (const tc of TECHS) if (!tc.never && tc.market <= start) S.researched[tc.id] = tc.market;   // industry know-how you start with
  if (S.playstyle === 'maker') {
    S.factories.push({ id: uid('f'), type: 'workshop', nm: null, level: 1, status: 'active', readyDay: 0, invested: FACTORY_TYPES.workshop.cost * eraFactory() * 0.5, sellSpare: true, used: 0, usedLast: 0 });
  }
  S.draft = defaultDraft('phone', start);
  S.chipDraft = defaultChipDraft(start);
  initRivals();
  monthlyRefresh();
  computeDemand();
  addNews(`${S.company} is founded with ${fmtMoney(S.cash)} – enough for a prototype, not a factory. Time to find investors.`, 'good');
  addNews('Tip: design a phone in the Phone Lab and build a prototype. Then pitch friends & family and angels in the Investors tab.', 'info');
}
function emptyMonth() {
  return { revenue: 0, b2b: 0, cogs: 0, upkeep: 0, rnd: 0, marketing: 0, overhead: 0, interest: 0, tax: 0, capex: 0, dev: 0, spare: 0, units: 0, funding: 0, penalty: 0 };
}

// ---- Rivals ------------------------------------------------------------------------------
function rivalAware(r, t) { return clamp(interp(r.aware, t), 0.04, 0.95); }
function makeRivalPhone(r, cat, seg, tl, gen) {
  const av = rivalAv(tl);
  const spec = rivalSpec(cat, seg, tl, r, av);
  let chip = vendorChipById(spec.chip.id);
  let chipPrice = vendorChipPrice(chip, tl), playerChip = null;
  // rivals may buy your chips if they beat the vendors on value
  for (const c of S.chips) {
    if (c.status !== 'ready' || !c.listed || c.stats.modemGen < chip.modemGen) continue;
    const perfR = 0.6 * c.stats.cpu / chip.cpu + 0.4 * (chip.gpu > 0 ? c.stats.gpu / chip.gpu : 1);
    const value = perfR / (c.listPrice / chipPrice);
    if (perfR >= 0.9 && value > 1.1) { chip = Object.assign({}, c.stats, { kind: 'custom' }); chipPrice = c.listPrice; playerChip = c.id; }
  }
  const ev = evalPhone(spec, tl, av, chip);
  const raw = Object.assign({}, ev.raw);
  const sk = r.skill * (0.95 + Math.random() * 0.1);     // engineering polish
  for (const k of ['cpu', 'gpu', 'cam', 'disp', 'design']) raw[k] *= sk;
  const bom = (Object.values(ev.bom).reduce((a, b) => a + (b || 0), 0) + (playerChip ? chipPrice : 0)) * 0.88;   // volume discounts
  const B = segBudget(cat, seg, tl);
  const target = Math.max(B * r.priceMul * (0.82 + Math.random() * 0.2), bom / (1 - RETAIL_CUT) * 1.15);
  const price = Math.max(29, Math.round(target / 10) * 10 - 1);
  const name = ((r.names[cat] || {})[seg] || r.name + ' {n}').replace('{n}', gen);
  return { id: uid('r'), rival: r.id, cat, seg, name, launch: tl, price, raw, bom, active: true, units: 0, subs: null, q: null,
    chip: chip.name, form: spec.form, playerChip, chipPrice };
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
    if (i === 0) p.basePrice = p.price = Math.max(29, Math.round(p.price * 0.8 / 10) * 10 - 1); // previous gen gets a price cut
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
    if (ph.playerChip) {
      completeGoal('b2b');
      addNews(`🤝 ${r.name} picked your ${S.chips.find(c => c.id === ph.playerChip).name} chip for the ${ph.name}!`, 'good', true);
    } else if (seg === 'premium' || seg === 'ultra') addNews(`${r.name} launches the ${ph.name} at ${fmtMoney(ph.price)}.`, 'rival');
  }
  S.rivalPhones = S.rivalPhones.filter(p => p.active || t - p.launch < 3);
  for (const r of RIVALS) {
    if (!r.end || t < r.end + 1.5 || S.exited[r.id]) continue;
    S.exited[r.id] = t;
    addNews(`${r.name} exits the phone business after years of declining sales.`, 'rival', true);
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
    if (p.status === 'retired') return;
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
    r.price = Math.max(29, Math.round(best / 10) * 10 - 1);
  }
}
const shelfCap = aware => 0.04 + 0.4 * aware;
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
      // retail shelf space: a brand can only reach so many buyers, however good its phones are
      const mineUnits = Ms * P / denom, cap = Ms * shelfCap(S.aware);
      const k = mineUnits > cap ? cap / mineUnits : 1;
      for (const x of list) { const u = Ms * x.e / denom * (x.mine ? k : 1); x.units += u; x.segUnits[seg] = u; x.segE[seg] = x.e; }
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
    bySeg[seg] = Math.min(M * split[i] * e / (out + R + P + e), M * split[i] * shelfCap(S.aware));
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
  const good = { perf: 'blazing performance', cam: 'a superb camera', disp: 'a gorgeous display', batt: 'outstanding battery life', design: 'a gorgeous, on-trend design', feat: 'a loaded feature set' };
  const bad = { perf: 'sluggish performance', cam: 'a disappointing camera', disp: 'a mediocre screen', batt: 'weak battery life', design: 'a dated, chunky design', feat: 'missing features' };
  const notes = [];
  if (diffs[0][1] > 4) notes.push('+ ' + good[diffs[0][0]]);
  if (diffs[1][1] > 4) notes.push('+ ' + good[diffs[1][0]]);
  if (diffs[5][1] < -4) notes.push('− ' + bad[diffs[5][0]]);
  if (diffs[4][1] < -6) notes.push('− ' + bad[diffs[4][0]]);
  if (ev.sustain < 0.7) notes.push('− runs hot and throttles under load');
  if (p.exclusive && p.exclusive.length) notes.push('+ first to ship ' + p.exclusive.slice(0, 2).map(id => TECH[id].name).join(', '));
  return notes;
}

// ---- Actions: design ------------------------------------------------------------------------
function spend(amount, bucket) { S.cash -= amount; S.month[bucket] = (S.month[bucket] || 0) + amount; }
function canAfford(cost) { return S.cash - cost >= -creditLimit(); }
function devCost(cat) { return CATS[cat].devCost * eraDev() * perk('devMul', 1); }
function protoCost(spec) { return Math.max(600 * eraDev() / 0.07, productCosts(spec, now(), playerAv()).est * 15); }
function checkSpec(spec) {
  if (!spec.name || !spec.name.trim()) return 'Give your device a name.';
  const a = specAvailability(spec, playerAv());
  if (a.problems.length) return a.problems[0];
  if (a.missing.length) return 'Research needed: ' + a.missing.slice(0, 3).map(id => TECH[id].name).join(', ') + '.';
  return null;
}
function buildPrototype(spec) {
  const err = checkSpec(spec);
  if (err) return err;
  const cost = protoCost(spec);
  if (!canAfford(cost)) return `A prototype costs ${fmtMoney(cost)} – you can't afford it yet.`;
  spend(cost, 'dev');
  const ev = evalPhone(spec, now(), playerAv(), chipFor(spec));
  S.protos.push({ id: uid('x'), name: spec.name.trim(), spec: JSON.parse(JSON.stringify(spec)), raw: ev.raw, readyDay: S.day + 14, review: null, price: spec.price });
  addNews(`Building a hand-made prototype of the ${spec.name} (${fmtMoney(cost)}, 14 days).`, 'info');
  return null;
}
function launchProduct(spec) {
  const err = checkSpec(spec);
  if (err) return err;
  const cost = devCost(spec.cat);
  if (!canAfford(cost)) return `Development costs ${fmtMoney(cost)} – raise money first (Investors tab).`;
  const t = now(), av = playerAv();
  const ev = evalPhone(spec, t, av, chipFor(spec));
  const used = specTechs(spec);
  const exclusive = [];
  for (const k in used) for (const id of used[k]) if (id && !av.market(id) && !exclusive.includes(id)) exclusive.push(id);
  spend(cost, 'dev');
  const rv = predictReview(ev.raw, spec.cat, spec.price);
  const p = {
    id: uid('p'), name: spec.name.trim(), spec: JSON.parse(JSON.stringify(spec)), raw: ev.raw, price: spec.price,
    status: 'dev', devUntil: S.day + 45, launch: null, inventory: 0, acc: 0, dAcc: 0,
    auto: { on: true, maker: 'auto', days: 30 },
    sold: 0, soldMonth: 0, soldLastMonth: 0, revenue: 0, profit: 0, review: null, notes: [], exclusive,
    lost: 0, demand: 0, forecast: estimateDemand(ev.raw, spec.cat, spec.price, rv.score).units, unitCostLast: 0, created: t, designDate: t,
  };
  S.products.push(p);
  addNews(`Development started on the ${p.name} (${fmtMoney(cost)}, 45 days). Order a production run so it's in stock at launch.`, 'info');
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
  addNews(`🚀 ${p.name} launches! Reviews: ${p.review.toFixed(1)}/10 — ${p.notes.join(', ') || 'a solid, unremarkable device'}.`, p.review >= 7 ? 'good' : p.review < 5 ? 'bad' : 'info', true);
}
function tapeOut(design) {
  const ev = evalChipDesign(design);
  if (!ev.ok) return ev.issues.find(i => i.err).text;
  if (!design.name.trim()) return 'Name your chip.';
  const cost = tapeOutCost(design);
  if (!canAfford(cost)) return `The mask set costs ${fmtMoney(cost)} – not enough cash.`;
  spend(cost, 'dev');
  const stats = Object.assign({}, ev);
  delete stats.heat; delete stats.issues; delete stats.units;
  stats.kind = 'custom'; stats.name = design.name.trim();
  S.chips.push({ id: uid('c'), name: design.name.trim(), design: JSON.parse(JSON.stringify(design)), stats, status: 'taping', readyDay: S.day + 120, created: now(), listed: false, listPrice: 0, sold: 0 });
  addNews(`${design.name} taped out at ${nodeLabel(design.nm)} (${fmtMoney(cost)}). First silicon in ~4 months.`, 'info');
  return null;
}
function tapeOutCost(design) {
  const node = nodeByNm(design.nm);
  const area = design.w * design.h * CELL_MM2;
  return (node.mask + 1.5e6 * eraDev() * Math.pow(area / 50, 0.7)) * perk('tapeMul', 1);   // masks + design team
}
function listChip(c, price) {
  c.listed = price > 0; c.listPrice = Math.max(1, Math.round(price * 100) / 100);
  addNews(c.listed ? `${c.name} is now offered to other brands at ${fmtMoney(c.listPrice)} per chip.` : `${c.name} is no longer offered to other brands.`, 'info');
}

// ---- Production orders --------------------------------------------------------------------
function orderProblem(p, maker, qty) {
  const av = playerAv();
  const mp = makerProblem(maker, p.spec, av);
  if (mp) return mp;
  if (maker !== 'own' && qty < partnerById(maker).moq) return `${partnerById(maker).name} has a minimum order of ${fmtNum(partnerById(maker).moq)} units.`;
  if (qty <= 0) return 'Order at least one unit.';
  return null;
}
function orderQuote(p, maker, qty) {
  const pc = productCosts(p.spec, now(), playerAv(), maker);
  const deposit = maker === 'own' ? 0 : 0.3 * qty * pc.est;
  const partner = partnerById(maker);
  const lead = maker === 'own' ? 3 : partner.lead;
  const start = Math.max(S.day + lead, p.status === 'dev' ? p.devUntil : 0);
  const rate = maker === 'own' ? factoryPool('assembly') : partner.cap;
  return { unit: pc.est, total: pc.est * qty, deposit, startDay: start, days: Math.ceil(qty / Math.max(1, rate) * 30), pc };
}
function placeOrder(p, maker, qty) {
  qty = Math.round(qty);
  const err = orderProblem(p, maker, qty);
  if (err) return err;
  const q = orderQuote(p, maker, qty);
  if (!canAfford(q.deposit)) return `The ${fmtMoney(q.deposit)} deposit is more than you can pay.`;
  spend(q.deposit, 'cogs');
  S.orders.push({ id: uid('o'), pid: p.id, maker, qty, made: 0, startDay: q.startDay, credit: q.deposit, created: S.day, done: false });
  return null;
}
function cancelOrder(o) {
  // the manufacturer keeps a third of the unused deposit as a cancellation fee
  S.cash += o.credit * 0.66;
  o.credit = 0; o.done = true; o.cancelled = true;
}
function factoryPool(poolKey) {
  return S.factories.filter(f => f.status === 'active' && (FACTORY_TYPES[f.type].pool || ('fab' + f.nm)) === poolKey && f.type !== 'rnd')
    .reduce((a, f) => a + factoryCap(f), 0);
}

// ---- Factories ----------------------------------------------------------------------------
function factoryBuildCost(type, nm) { return type === 'fab' ? nodeByNm(nm).fab * perk('facMul', 1) : FACTORY_TYPES[type].cost * eraFactory() * perk('facMul', 1); }
function factoryUpkeep(f) {
  const base = f.type === 'fab' ? nodeByNm(f.nm).fab * 0.004 : FACTORY_TYPES[f.type].upkeep * eraFactory();
  return base * (1 + 0.6 * (f.level - 1)) * perk('upkeepMul', 1);
}
function factoryCap(f) { return FACTORY_TYPES[f.type].cap * f.level; }
function poolKeyOf(f) { return f.type === 'fab' ? 'fab' + f.nm : FACTORY_TYPES[f.type].pool; }
function buildFactory(type, nm) {
  const cost = factoryBuildCost(type, nm);
  if (type === 'fab') {
    const node = nodeByNm(nm);
    if (now() < node.year && !S.researched['proc_' + nm]) return 'Research this process node first.';
  }
  if (!canAfford(cost)) return 'Not enough cash (raise money in the Investors tab, or take a loan).';
  spend(cost, 'capex');
  const days = type === 'fab' ? FACTORY_TYPES.fab.days + 15 * NODES.findIndex(n => n.nm === nm) : FACTORY_TYPES[type].days;
  S.factories.push({ id: uid('f'), type, nm: nm || null, level: 1, status: 'building', readyDay: S.day + days, invested: cost, sellSpare: true, used: 0, usedLast: 0 });
  addNews(`Construction started: ${factoryName({ type, nm })} (${fmtMoney(cost)}, ${Math.max(1, Math.round(days / 30))} months).`, 'info');
  return null;
}
function factoryName(f) { return f.type === 'fab' ? `${nodeLabel(f.nm)} Chip Fab` : FACTORY_TYPES[f.type].name; }
function upgradeCost(f) { return factoryBuildCost(f.type, f.nm) * 0.6 * f.level; }
function upgradeFactory(f) {
  if (f.level >= FACTORY_MAX_LEVEL || f.upgradeUntil) return 'Cannot upgrade now.';
  const cost = upgradeCost(f);
  if (!canAfford(cost)) return 'Not enough cash.';
  spend(cost, 'capex');
  f.invested += cost;
  const days = Math.round((f.type === 'fab' ? FACTORY_TYPES.fab.days : FACTORY_TYPES[f.type].days) * 0.5);
  f.upgradeUntil = S.day + days;
  addNews(`Expanding ${factoryName(f)} to level ${f.level + 1} (${Math.max(1, Math.round(days / 30))} months).`, 'info');
  return null;
}
function sellFactory(f) {
  const refund = f.invested * (f.status === 'active' ? 0.35 : 0.2);
  S.cash += refund;
  S.factories = S.factories.filter(x => x !== f);
  addNews(`Sold ${factoryName(f)} for ${fmtMoney(refund)}.`, 'info');
  S.products.forEach(p => { p.costs = null; });
}

// ---- Research --------------------------------------------------------------------------------
function rndLevels() { return S.factories.filter(f => f.type === 'rnd' && f.status === 'active').reduce((a, f) => a + f.level, 0); }
function researchSlots() { return 2 + perk('rsSlot', 0) + rndLevels(); }
function researchSpeed() { return (1 + 0.25 * rndLevels()) * perk('rsSpeed', 1); }
function researchCost(tc) {
  const t = now(), year = tc.never ? tc.opens : tc.market;
  const base = 8000 * Math.pow(1.2, Math.max(0, year - 1996)) * tc.k;
  const timing = tc.never ? 1 : t < tc.market ? 1.6 : Math.max(0.25, Math.pow(0.8, t - tc.market));
  return base * timing * perk('rsCost', 1);
}
function researchDays(tc) {
  const t = now();
  const timing = tc.never || t < tc.market ? 1 : Math.max(0.4, Math.pow(0.85, t - tc.market));
  return Math.max(5, Math.ceil(tc.days * timing / researchSpeed()));
}
function techState(tc) {
  const t = now();
  if (S.researched[tc.id]) return 'done';
  if (S.research.some(r => r.id === tc.id)) return 'active';
  if (t < (tc.never ? tc.opens : tc.market - tc.lead)) return 'future';
  if (tc.req.some(id => !S.researched[id])) return 'locked';
  return 'available';
}
function startResearch(id) {
  const tc = TECH[id];
  const st = techState(tc);
  if (st === 'locked') return 'Research ' + tc.req.filter(r => !S.researched[r]).map(r => TECH[r].name).join(', ') + ' first.';
  if (st === 'future') return `Nobody can research this until ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}.`;
  if (st !== 'available') return 'Already researched or in progress.';
  if (S.research.length >= researchSlots()) return 'All research slots are busy. Build an R&D Center for more.';
  const cost = researchCost(tc);
  if (!canAfford(cost)) return `${tc.name} costs ${fmtMoney(cost)} – not enough cash.`;
  spend(cost, 'rnd');
  S.research.push({ id, progress: 0, cost, days: researchDays(tc) });
  return null;
}
function licenseTech(id) {
  const tc = TECH[id];
  if (!S.researched[id] || now() >= tc.market || S.licensed[id]) return 'Only exclusive tech you own can be licensed.';
  S.licensed[id] = { since: now(), monthly: (S.rsPaid[id] || researchCost(tc)) * 0.08 * perk('royaltyMul', 1) };
  addNews(`📜 Licensed ${tc.name} to the industry: ${fmtMoney(S.licensed[id].monthly)}/month in royalties until it becomes standard.`, 'good', true);
  completeGoal('b2b');
  return null;
}

// ---- Investors ---------------------------------------------------------------------------------
function lastRevenue() { const h = S.history[S.history.length - 1]; return h ? h.revenue + (h.b2b || 0) : 0; }
function bestShowcaseReview() {
  let r = 0;
  for (const x of S.protos) if (x.review != null) r = Math.max(r, x.review);
  for (const p of S.products) if (p.review != null) r = Math.max(r, p.review);
  return r;
}
function roundInfo(rd) {
  const fs = fundScale(), f = S.funding;
  const idx = ROUNDS.indexOf(rd);
  const later = ROUNDS.slice(idx + 1).some(r => f.done[r.id]);
  const info = { done: !!f.done[rd.id], blocked: later, ok: false, progress: 1, need: '' };
  if (rd.need === 'none') { info.ok = true; info.need = 'No requirements.'; }
  if (rd.need === 'proto') {
    const r = bestShowcaseReview();
    info.ok = r > 0; info.progress = r > 0 ? 1 : 0;
    info.need = r > 0 ? `Your best prototype/device reviewed ${r.toFixed(1)}/10 – better reviews mean better terms.` : 'Build a prototype in the Phone Lab first.';
  }
  if (rd.need === 'rev' || rd.need === 'ipo') {
    const need = rd.rev * fs, have = lastRevenue();
    info.progress = clamp(have / need, 0, 1); info.ok = have >= need;
    info.need = `Monthly revenue of ${fmtMoney(need)} (last month: ${fmtMoney(have)}).`;
    if (rd.need === 'ipo') {
      const prof = S.history.slice(-3);
      const profitable = prof.length === 3 && prof.every(m => m.profit > 0);
      info.ok = info.ok && profitable;
      info.need += profitable ? '' : ' And 3 profitable months in a row.';
    }
  }
  const gapMonths = { seed: 3, a: 6, b: 9, c: 12, ipo: 12 }[rd.id] || 0;
  const last = Math.max(0, ...Object.values(f.done).map(r => r.t));
  if (gapMonths && last && now() - last < gapMonths / 12) { info.ok = false; info.need += ` Investors want ${gapMonths} months of track record since your last round.`; }
  if (rd.id === 'ipo' && S.day < 3 * 365) { info.ok = false; info.need += ' The company must be at least 3 years old.'; }
  if (f.cooldown[rd.id] && S.day < f.cooldown[rd.id]) { info.ok = false; info.cool = f.cooldown[rd.id] - S.day; }
  return info;
}
function startPitch(roundId) {
  const rd = ROUNDS.find(r => r.id === roundId), f = S.funding;
  if (f.pitch) return 'You are already pitching.';
  if (f.offer) return 'Answer the offer on the table first.';
  const info = roundInfo(rd);
  if (info.done || info.blocked) return 'That round is closed.';
  if (info.cool) return `Investors said no recently. Try again in ${info.cool} days.`;
  if (!info.ok) return info.need;
  f.pitch = { round: roundId, until: S.day + rd.days };
  addNews(`Pitching the ${rd.name} to investors (${rd.days} days of meetings).`, 'info');
  return null;
}
function finishPitch() {
  const f = S.funding, rd = ROUNDS.find(r => r.id === f.pitch.round);
  f.pitch = null;
  const fs = fundScale();
  let p;
  if (rd.need === 'none') p = 0.9;
  else if (rd.need === 'proto') p = clamp((bestShowcaseReview() - 4) / 4, 0.1, 0.92);
  else {
    const ratio = lastRevenue() / (rd.rev * fs);
    const h = S.history.slice(-4);
    const growth = h.length >= 4 && h[0].revenue > 0 ? clamp(h[3].revenue / h[0].revenue - 1, -0.5, 1) : 0;
    p = clamp(0.3 + 0.35 * (ratio - 1) + 0.06 * (S.rep - 6.5) + 0.4 * growth, 0.1, 0.95);
    if (rd.need === 'ipo') p = Math.max(p, 0.6);
  }
  p *= eventMul('funding', now());
  if (Math.random() > p) {
    f.cooldown[rd.id] = S.day + 45;
    addNews(`❌ Investors passed on your ${rd.name}. ${rd.need === 'proto' ? 'A better-reviewed prototype would help.' : 'Grow revenue and try again in 45 days.'}`, 'bad', true);
    return;
  }
  const qn = clamp(p, 0, 1);
  const equity = rd.eq[1] - (rd.eq[1] - rd.eq[0]) * qn;
  let amount;
  if (rd.need === 'ipo') amount = (lastRevenue() * 12 * 2.5 + Math.max(0, netWorth())) * equity;
  else amount = (rd.min + (rd.max - rd.min) * qn * (0.7 + Math.random() * 0.3)) * fs;
  const investor = rd.investors[Math.floor(Math.random() * rd.investors.length)];
  f.offer = { round: rd.id, amount: Math.round(amount / 1000) * 1000, equity, investor, expires: S.day + 30 };
  addNews(`💼 ${investor} offers ${fmtMoney(f.offer.amount)} for ${fmtPct(equity, 1)} of ${S.company}. Answer in the Investors tab.`, 'good', true);
}
function answerOffer(accept) {
  const f = S.funding, o = f.offer;
  if (!o) return;
  f.offer = null;
  if (!accept) { addNews('You turned down the investment offer.', 'info'); return; }
  const rd = ROUNDS.find(r => r.id === o.round);
  S.cash += o.amount; S.month.funding += o.amount;
  S.own *= (1 - o.equity);
  f.done[o.round] = { amount: o.amount, equity: o.equity, investor: o.investor, t: now(), valuation: o.amount / o.equity };
  if (rd.id === 'ipo') { S.public = true; completeGoal('ipo'); }
  if (rd.id === 'a') completeGoal('seriesA');
  completeGoal('raise');
  addNews(`🎉 Closed the ${rd.name}: ${fmtMoney(o.amount)} from ${o.investor}. You now own ${fmtPct(S.own, 1)} of the company.`, 'good', true);
}

// ---- Supply contracts (B2B) ----------------------------------------------------------------------
const B2B_LABEL = { assembly: 'device assembly', display: 'display panels', camera: 'camera modules', battery: 'battery cells', memory: 'memory sets' };
let _typicalCache = null;
function typicalPrices() {
  const key = Math.floor(now() * 12);
  if (_typicalCache && _typicalCache.key === key) return _typicalCache.v;
  const t = now(), spec = rivalSpec('phone', 'mid', t, null, marketAv(t)), ev = evalPhone(spec, t, marketAv(t), vendorChipById(spec.chip.id));
  const v = { assembly: ev.bom.assembly, display: ev.bom.display, camera: ev.bom.camera / Math.max(1, ev.nCams), battery: ev.bom.battery, memory: ev.bom.memory };
  _typicalCache = { key, v };
  return v;
}
function contractUnitCost(type) {
  const tp = typicalPrices();
  return type === 'assembly' ? tp.assembly * ownAssemblyMul() : type.startsWith('fab') ? nodeByNm(+type.slice(3)).wafer * 0.3 : tp[type] / FACTORY_TYPES[type].markup * perk('inMul', 1);
}
function generateOffers() {
  const t = now();
  S.offers = S.offers.filter(o => o.expires > S.day);
  const pools = {};
  for (const f of S.factories) if (f.status === 'active' && f.type !== 'rnd') pools[poolKeyOf(f)] = (pools[poolKeyOf(f)] || 0) + factoryCap(f);
  const buyers = RIVALS.filter(r => rivalAware(r, t) > 0.1 && (!r.end || t < r.end) && r.start.phone <= t);
  for (const k in pools) {
    if (Math.random() > 0.3 * perk('contractMul', 1) || !buyers.length) continue;
    const tp = typicalPrices();
    const isFab = k.startsWith('fab');
    const base = isFab ? waferPrice(nodeByNm(+k.slice(3)), t) * 0.75 : tp[k];
    const qty = Math.max(100, Math.round(pools[k] * (0.15 + Math.random() * 0.35) / 100) * 100);
    const price = base * (0.82 + Math.random() * 0.13) * (S.playstyle === 'maker' ? 1.08 : 1);
    const b = buyers[Math.floor(Math.random() * buyers.length)];
    S.offers.push({ id: uid('k'), buyer: b.name, type: k, label: isFab ? `${nodeLabel(+k.slice(3))} wafers` : B2B_LABEL[k], qty, price, months: 3 + Math.floor(Math.random() * 10), expires: S.day + 30 });
  }
}
function acceptOffer(id) {
  const o = S.offers.find(x => x.id === id);
  if (!o) return 'Offer expired.';
  S.offers = S.offers.filter(x => x !== o);
  S.contracts.push(Object.assign({}, o, { monthsLeft: o.months, delivered: 0 }));
  completeGoal('b2b');
  addNews(`🤝 Signed: ${fmtNum(o.qty)} ${o.label}/month for ${o.buyer} at ${fmtMoney(o.price)} each, ${o.months} months.`, 'good');
  return null;
}

// ---- Finance -----------------------------------------------------------------------------
function avgRevenue() {
  const h = S.history.slice(-3);
  return h.length ? h.reduce((a, m) => a + m.revenue + (m.b2b || 0), 0) / h.length : 0;
}
function creditLimit() { return 5e3 * fundScale() + 0.5 * avgRevenue(); }
function factoryValue() { return S.factories.reduce((a, f) => a + f.invested * 0.6, 0); }
function inventoryValue() {
  return S.products.reduce((a, p) => a + p.inventory * (p.unitCostLast || 0), 0) + STOCK_TYPES.reduce((a, k) => a + S.stock[k].qty * S.stock[k].cost, 0);
}
function netWorth() { return S.cash - S.debt + factoryValue() + inventoryValue(); }
function loanLimit() { return Math.max(0, 10e3 * fundScale() + 0.3 * Math.max(0, netWorth()) + 2 * avgRevenue() - S.debt); }
function loanRate() { return 0.09; }
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
  if (g) addNews('🏆 Goal complete: ' + g.text, 'good', true);
}

// ---- The daily tick -------------------------------------------------------------------------
function tickDay() {
  if (S.over) return;
  const prevMonth = monthIndex(now());
  S.day++;
  const t = now();
  const av = playerAv();

  // research
  for (const r of S.research.slice()) {
    const tc = TECH[r.id];
    r.progress += 1;
    if (r.progress >= r.days) {
      S.research = S.research.filter(x => x !== r);
      S.researched[tc.id] = t; S.rsPaid[tc.id] = r.cost;
      S.stats.researched++;
      if (S.stats.researched >= 5) completeGoal('research5');
      const early = t < tc.market && !tc.never;
      if (early) completeGoal('exclusive');
      const fac = TECH_CATS[tc.cat].factory;
      const need = early && fac && fac !== 'fab' && !factoryActive(fac) ? ` It's exclusive until ${dateLabel(tc.market)} – build a ${FACTORY_TYPES[fac].name} to use it before then.` : early ? ` Exclusive to you until ${dateLabel(tc.market)}!` : '';
      addNews(`🔬 Research complete: ${tc.name}.${need}`, 'good', true);
      S.products.forEach(p => { p.costs = null; });
    }
  }
  // construction
  for (const f of S.factories) {
    if (f.status === 'building' && S.day >= f.readyDay) {
      f.status = 'active';
      addNews(`🏗️ ${factoryName(f)} is online.`, 'good', true);
      S.products.forEach(p => { p.costs = null; });
      if (f.type !== 'rnd') completeGoal('factory');
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
    addNews(`💠 First silicon is back: ${c.name} works! Use it in the Phone Lab – or offer it to other brands.`, 'good', true);
  }
  for (const x of S.protos) if (x.review == null && S.day >= x.readyDay) {
    x.review = Math.round(predictReview(x.raw, x.spec.cat, x.price).score * 10) / 10;
    completeGoal('proto');
    addNews(`🧪 Prototype ${x.name} is ready. Hands-on impressions: ${x.review.toFixed(1)}/10. Show it to angel investors!`, 'good', true);
  }
  for (const p of S.products) if (p.status === 'dev' && S.day >= p.devUntil) finishDev(p);
  const f = S.funding;
  if (f.pitch && S.day >= f.pitch.until) finishPitch();
  if (f.offer && S.day >= f.offer.expires) { addNews(`The offer from ${f.offer.investor} expired.`, 'bad'); f.offer = null; }

  rivalReleases();
  computeDemand();

  // ---- factory pools (units per day) ----
  const pool = {};
  for (const fa of S.factories) if (fa.status === 'active' && fa.type !== 'rnd') pool[poolKeyOf(fa)] = (pool[poolKeyOf(fa)] || 0) + factoryCap(fa) / 30;
  const poolStart = Object.assign({}, pool);
  for (const p of S.products) if (p.status !== 'retired' && !p.costs) p.costs = productCosts(p.spec, t, av, 'own');

  // 1) supply contracts come first – they are obligations
  for (const c of S.contracts) {
    const got = Math.min(c.qty / 30, pool[c.type] || 0);
    pool[c.type] = (pool[c.type] || 0) - got;
    c.delivered += got;
    spend(got * contractUnitCost(c.type), 'cogs');
  }
  // 2) chips sold to rivals (made in your fab if possible, else at the foundry)
  for (const r of S.rivalPhones) if (r.active && r.playerChip) {
    const c = S.chips.find(x => x.id === r.playerChip);
    if (!c) continue;
    const units = (r.demand || 0) / 30;
    const { e, fab, early } = customChipCost(c.stats, t);
    const fabKey = 'fab' + c.stats.nm;
    const inFab = fab ? Math.min(units, (pool[fabKey] || 0) * e.good) : 0;
    if (fab) pool[fabKey] -= inFab / e.good;
    const atFoundry = early ? 0 : units - inFab;
    const sold = inFab + atFoundry;
    S.cash += sold * c.listPrice; S.month.b2b += sold * c.listPrice;
    spend(inFab * e.own + atFoundry * e.foundry, 'cogs');
    c.sold += sold;
  }
  // 3) component plants refill your parts stock for upcoming production runs
  const running = S.orders.filter(o => !o.done);
  for (const k of STOCK_TYPES) {
    const st = S.stock[k];
    if (!pool[k]) continue;
    let need = 0, wsum = 0, csum = 0;
    for (const o of running) {
      const p = S.products.find(x => x.id === o.pid);
      if (!p || !p.costs) continue;
      const comp = p.costs.comps.find(c => c.key === k);
      if (!comp) continue;
      const left = (o.qty - o.made) * comp.per;
      need += left; wsum += left; csum += left * comp.in;
    }
    const target = Math.min(need, poolStart[k] * 30);
    const make = Math.max(0, Math.min(pool[k], target - st.qty));
    if (make <= 0 || wsum <= 0) continue;
    const unit = csum / wsum;
    st.cost = (st.qty * st.cost + make * unit) / (st.qty + make);
    st.qty += make;
    pool[k] -= make;
    spend(make * unit, 'cogs');
  }
  // 4) production orders turn parts into devices
  const partnerLeft = {};
  const orders = running.slice().sort((a, b) => a.created - b.created);
  for (const o of orders) {
    const p = S.products.find(x => x.id === o.pid);
    if (!p || p.status === 'retired') { o.done = true; continue; }
    if (S.day < o.startDay || p.status === 'dev') continue;
    const pc = productCosts(p.spec, t, av, o.maker);
    // you pay as units come off the line: build only what you can pay for
    const payable = Math.floor((o.credit + spendable()) / Math.max(0.01, pc.est));
    let units;
    if (o.maker === 'own') units = Math.min(o.qty - o.made, Math.floor((pool.assembly || 0) + 1e-9));
    else {
      if (partnerLeft[o.maker] == null) partnerLeft[o.maker] = partnerById(o.maker).cap / 30;
      units = Math.min(o.qty - o.made, Math.floor(partnerLeft[o.maker]));
    }
    units = Math.min(units, payable);
    o.cashStalled = payable < 1;
    // exclusive parts can only come from your own plants
    for (const c of pc.comps) if (c.buy == null && c.key !== 'assembly') {
      const avail = c.stock ? S.stock[c.stock].qty / c.per : c.pool ? (pool[c.pool] || 0) / c.wafers : 0;
      units = Math.min(units, Math.floor(avail + 1e-9));
    }
    if (units <= 0) { p.capLimited = o.qty > o.made; continue; }
    p.capLimited = false;
    let cost = 0, prepaid = 0;
    for (const c of pc.comps) {
      if (c.stock) {
        const need = units * c.per, st = S.stock[c.stock], take = Math.min(need, st.qty);
        st.qty -= take; st.use += take;
        prepaid += take * st.cost;                      // paid when the plant made them
        cost += take * st.cost + (need - take) * (c.buy != null ? c.buy : c.in);
      } else if (c.pool) {
        const need = units * c.wafers, w = Math.min(need, pool[c.pool] || 0);
        pool[c.pool] -= w;
        cost += units * ((w / need) * c.in + (1 - w / need) * (c.buy != null ? c.buy : c.in));
      } else cost += units * c.buy;
    }
    if (o.maker === 'own') pool.assembly -= units;
    else partnerLeft[o.maker] -= units;
    const defect = o.maker === 'own' ? 0.01 : partnerById(o.maker).defect;
    const good = Math.max(0, units - Math.round(units * defect * (0.6 + Math.random() * 0.8)));
    p.inventory += good;
    p.unitCostLast = cost / Math.max(1, good);
    p.producedMonth = (p.producedMonth || 0) + good;
    o.made += units;
    const cashCost = cost - prepaid, fromCredit = Math.min(o.credit, cashCost);   // the deposit pays for the first units
    o.credit -= fromCredit;
    spend(cashCost - fromCredit, 'cogs');
    if (o.made >= o.qty) {
      o.done = true;
      if (o.credit > 0) { S.cash += o.credit; S.month.cogs -= o.credit; o.credit = 0; }
      completeGoal('order1');
      addNews(`📦 Production run finished: ${fmtNum(o.qty)} × ${p.name} by ${makerName(o.maker)}.`, 'info');
    }
  }
  S.orders = S.orders.filter(o => !o.done || S.day - o.created < 120);
  // auto re-ordering
  if (S.day % 2 === 0) for (const p of S.products) autoReorder(p);
  // factory utilization bookkeeping
  for (const fa of S.factories) if (fa.status === 'active' && fa.type !== 'rnd') {
    const k = poolKeyOf(fa);
    const share = poolStart[k] > 0 ? (factoryCap(fa) / 30) / poolStart[k] : 0;
    fa.used += (poolStart[k] - Math.max(0, pool[k] || 0)) * share;
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
    if (p.discontinued && p.inventory <= 0 && !S.orders.some(o => o.pid === p.id && !o.done)) { p.status = 'retired'; addNews(`${p.name} sold out and is retired.`, 'info'); }
  }
  if (S.stats.sold >= 10000) completeGoal('sold10k');

  spend(S.marketing / 30, 'marketing');

  if (S.cash < -creditLimit()) S.overdraftDays++; else S.overdraftDays = 0;
  if (S.overdraftDays > 90) { S.over = true; emit('gameover'); return; }

  if (monthIndex(t) !== prevMonth) endOfMonth();
}
// cash you can spend without breaching the overdraft limit
const spendable = () => Math.max(0, S.cash + creditLimit());
// monthly capacity a maker has left after the runs already queued with it (spread over ~45 days)
function makerFreeCap(m) {
  const cap = m === 'own' ? factoryPool('assembly') : partnerById(m).cap;
  const queued = S.orders.filter(o => !o.done && o.maker === m).reduce((a, o) => a + o.qty - o.made, 0);
  return Math.max(0, cap - queued / 1.5);
}
// best manufacturer for an order of up to `want` units: cheap, affordable, and able to deliver soon
function pickMaker(p, want) {
  const av = playerAv(), opts = [];
  const makers = (factoryActive('assembly') ? ['own'] : []).concat(PARTNERS.map(x => x.id));
  for (const m of makers) {
    if (makerProblem(m, p.spec, av)) continue;
    const unit = productCosts(p.spec, now(), av, m).est;
    const moq = m === 'own' ? 1 : partnerById(m).moq;
    const cashPerUnit = m === 'own' ? unit * 0.5 : unit * 0.3;   // deposit up front for partners; own lines pay as they go
    const afford = Math.floor(spendable() * 0.6 / Math.max(0.01, cashPerUnit));
    const deliverable = Math.floor(makerFreeCap(m) * 1.5);
    const qty = Math.min(want, afford, deliverable);
    if (qty < moq) continue;
    opts.push({ m, qty, unit, full: qty >= want * 0.8 });
  }
  // prefer makers that can cover most of the need, then the cheapest
  opts.sort((a, b) => (b.full - a.full) || (a.unit - b.unit));
  return opts[0] || null;
}
function autoReorder(p) {
  if (!p.auto || !p.auto.on || p.discontinued || p.status === 'retired') return;
  const pending = S.orders.filter(o => o.pid === p.id && !o.done).reduce((a, o) => a + o.qty - o.made, 0);
  const rate = p.status === 'active' ? p.demand : p.forecast || 0;
  const target = rate * (p.auto.days / 30);
  if (rate < 1 || p.inventory + pending >= target) return;
  const want = Math.ceil((target * 1.3 - p.inventory - pending) / 100) * 100;
  let choice;
  if (p.auto.maker === 'auto') choice = pickMaker(p, want);
  else {
    const m = p.auto.maker, moq = m === 'own' ? 1 : partnerById(m).moq;
    choice = makerFreeCap(m) > 0 ? { m, qty: Math.max(moq, Math.min(want, Math.floor(makerFreeCap(m) * 1.5))) } : null;
    if (!choice) { p.autoMsg = `${makerName(m)} is fully booked.`; return; }
  }
  // top up the open automatic run at that maker instead of piling up new ones
  const open = choice && S.orders.find(o => !o.done && o.auto && o.pid === p.id && o.maker === choice.m);
  let err;
  if (!choice) err = 'No manufacturer can take the order right now (minimum orders, cash or capacity).';
  else if (open) {
    const dep = choice.m === 'own' ? 0 : 0.3 * choice.qty * productCosts(p.spec, now(), playerAv(), choice.m).est;
    if (!canAfford(dep)) err = `The ${fmtMoney(dep)} deposit is more than you can pay.`;
    else { spend(dep, 'cogs'); open.qty += choice.qty; open.credit += dep; }
  } else {
    err = placeOrder(p, choice.m, choice.qty);
    if (!err) S.orders[S.orders.length - 1].auto = true;
  }
  if (err) {
    if (p.autoMsg !== err) addNews(`Auto-order for ${p.name} paused: ${err}`, 'bad');
    p.autoMsg = err;
  } else p.autoMsg = null;
}

function endOfMonth() {
  const t = now();
  const m = S.month;
  // fixed costs
  let upkeep = 0;
  for (const fa of S.factories) if (fa.status === 'active') upkeep += factoryUpkeep(fa);
  spend(upkeep, 'upkeep');
  const active = S.products.filter(p => p.status === 'active').length;
  spend((1.5e3 + 15e3 * active) * eraDev() + 0.08 * (m.revenue + m.b2b), 'overhead');   // staff, software, support, offices
  spend(inventoryValue() * 0.015, 'overhead');
  spend(S.debt * loanRate() / 12 + Math.max(0, -S.cash) * 0.18 / 12, 'interest');
  // supply contracts: get paid, pay penalties for shortfalls
  for (const c of S.contracts) {
    const pay = c.delivered * c.price;
    S.cash += pay; m.b2b += pay;
    const short = c.qty - c.delivered;
    if (short > c.qty * 0.05) { const pen = short * c.price * 0.3; spend(pen, 'penalty'); addNews(`⚠️ Missed ${fmtNum(short)} ${c.label} for ${c.buyer}: ${fmtMoney(pen)} penalty.`, 'bad'); }
    c.delivered = 0; c.monthsLeft--;
  }
  S.contracts = S.contracts.filter(c => c.monthsLeft > 0);
  // licensing royalties
  for (const id in S.licensed) {
    const l = S.licensed[id];
    if (t < TECH[id].market) { S.cash += l.monthly; m.b2b += l.monthly; }
  }
  // spare factory capacity sold to other device makers
  let spare = 0;
  for (const fa of S.factories) {
    if (fa.status === 'active' && fa.type !== 'rnd' && fa.sellSpare) {
      const free = Math.max(0, factoryCap(fa) - fa.used);
      const val = fa.type === 'fab' ? waferPrice(nodeByNm(fa.nm), t) * 0.35 : FACTORY_TYPES[fa.type].spare * eraFactory();
      spare += free * val * 0.25;
    }
    fa.usedLast = fa.used; fa.used = 0;
  }
  S.cash += spare; m.spare = spare;
  for (const k of STOCK_TYPES) S.stock[k].use = 0;
  // brand awareness
  const total = marketSize('phone', t) + marketSize('tablet', t);
  const K = 15e6 * Math.sqrt(total / 60e6) * eraFactory();
  const eff = m.marketing * perk('mkMul', 1);
  const gain = 0.11 * eff / (eff + K);
  const wom = Math.min(0.02, 0.3 * m.units / total) * (S.rep / 7);
  S.aware = clamp(S.aware + (1 - S.aware) * (gain + wom) - 0.03 * S.aware, 0.003, 0.95);
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
  const pretax = m.revenue + m.b2b + m.spare - m.cogs - m.upkeep - m.rnd - m.marketing - m.overhead - m.interest - m.dev - m.penalty;
  let taxable = pretax;
  if (taxable > 0) { const use = Math.min(S.taxLoss, taxable); taxable -= use; S.taxLoss -= use; } else S.taxLoss -= taxable;
  m.tax = Math.max(0, taxable) * 0.22;
  S.cash -= m.tax;
  const profit = pretax - m.tax;
  S.history.push(Object.assign({ t: t - 1 / 12, profit, cash: S.cash, worth: netWorth(), aware: S.aware, own: S.own }, m));
  if (S.history.length > 400) S.history.shift();
  S.products.forEach(p => { p.soldLastMonth = p.soldMonth; p.soldMonth = 0; p.producedLast = p.producedMonth || 0; p.producedMonth = 0; });
  S.month = emptyMonth();
  if (netWorth() >= 10e9) completeGoal('worth10b');
  // world news
  for (const tc of TECHS) if (!tc.never && t >= tc.market && t - 1 / 12 < tc.market && !S.researched[tc.id] &&
    ['display', 'camera', 'design', 'features', 'battery'].includes(tc.cat) && !/mAh|screens$|PPI/.test(tc.name))
    addNews(`📈 Industry trend: ${tc.name} is now standard – research it to keep up.`, 'world');
  for (const n of NODES) if (t >= n.year && t - 1 / 12 < n.year) addNews(`💠 Foundries now offer the ${nodeLabel(n.nm)} process (${fmtMoney(n.wafer)}/wafer).`, 'world');
  for (const e of EVENTS) if (t >= e.start && t - 1 / 12 < e.start) addNews(`🌍 ${e.title}: ${e.desc}`, 'bad', true);
  for (const c of VENDOR_CHIPS) if (c.tier === 'flagship' && c.release <= t && c.release > t - 1 / 12) addNews(`${c.vendor} unveils the ${c.name} flagship chip (${nodeLabel(c.nm)}).`, 'world');
  generateOffers();
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
    if (!s || s.version !== 2) return false;
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
