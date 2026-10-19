'use strict';
// ============================================================================
//  Simulation: game state, the daily tick (research, engineering, production
//  lines, demand & sales), monthly books, rivals, investors, save/load.
//  The economy is deliberately simple and smooth: demand follows a slow-moving
//  target, production lines run continuously, rivals cut prices gradually.
// ============================================================================

const SAVE_KEY = 'phoneEmpireSave_v3';
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
const ecoNow = () => econ(now());
const fundScale = () => interp(FUND, now());
const has = id => !id || !!S.researched[id];

// ---- Availability for the player -----------------------------------------------
function factoryActive(type) {
  if (type === 'assembly') return S.factories.some(f => (f.type === 'assembly' || f.type === 'workshop') && f.status === 'active');
  return S.factories.some(f => f.type === type && f.status === 'active');
}
function hasFab(nm) { return S.factories.some(f => f.type === 'fab' && f.nm === nm && f.status === 'active'); }
// Everything must be researched. Before its market date, a tech also needs your own factory.
function playerAv() {
  const t = now();
  const av = {
    t,
    market: id => !id || t >= TECH[id].market,
    has: id => !id || !!S.researched[id],
    inhouse(id) {
      if (!id) return true;
      if (!S.researched[id]) return false;
      const fac = TECH_CATS[TECH[id].cat].factory;
      return fac === null || fac === 'fab' || factoryActive(fac);
    },
  };
  av.ok = id => av.has(id) && (av.market(id) || av.inhouse(id));
  av.std = id => av.has(id) && av.market(id);           // what a supplier can sell you
  return av;
}
function rivalAv(t) { return marketAv(t, S && S.licensed); }
// Design houses and tech pioneers buy their parts: supplier-made tech (networks, displays, cameras,
// batteries, memory, chip processes, manufacturing) reaches them on its own once it is industry
// standard and stays out of their research tree – unless they build the plant that makes it.
const SUPPLIED_CATS = ['network', 'display', 'camera', 'battery', 'memory', 'process', 'manufacturing'];
const suppliedCat = cat => S.playstyle !== 'maker' && SUPPLIED_CATS.includes(cat);
function catVisible(cat) {
  if (!suppliedCat(cat)) return true;
  const fac = cat === 'manufacturing' ? 'assembly' : TECH_CATS[cat].factory;
  return S.factories.some(f => f.type === fac || (fac === 'assembly' && f.type === 'workshop'));
}
const suppliedOnly = tc => suppliedCat(tc.cat) && !catVisible(tc.cat);
function supplierTech() {
  const t = now(), got = [];
  for (const tc of TECHS) if (!tc.never && t >= tc.market && !S.researched[tc.id] && suppliedCat(tc.cat)) { S.researched[tc.id] = tc.market; got.push(tc); }
  return got;
}
const supplierWord = tc => tc.cat === 'process' ? 'Foundries offer it' : 'Suppliers sell it';
const archGenFor = av => archGenAt(av.ok);
function nodesForDesign() {
  const av = playerAv();
  return NODES.filter((n, i) => (i === 0 || av.has('proc_' + n.nm)) && (n.year <= now() || hasFab(n.nm)));
}

// ---- Techs a spec uses ------------------------------------------------------------
// returns [{id, part}] for everything the phone needs researched
function specTechList(spec) {
  const out = [];
  const add = (ids, part) => ids.forEach(id => id && out.push({ id, part }));
  const f = formOf(spec);
  add([FORMS[f].tech, MATERIALS[spec.body.mat].tech, WATER[spec.body.water].tech, (FINISHES[spec.body.finish] || FINISHES.gloss).tech,
    INTEGRATION[spec.int || 0][0] === 'int_discrete' ? null : INTEGRATION[spec.int || 0][0], PORTS[spec.port].tech, JACKS[spec.jack].tech, SIMS[spec.sim].tech], 'design');
  if (spec.sd) add(['feat_sd'], 'memory');
  const feat = spec.feat || {};
  add([(FINGERPRINT[feat.fp] || FINGERPRINT.none).tech, OS[spec.os].tech, (FLASHES[spec.flash] || FLASHES.none).tech], 'features');
  for (const [key, id] of EXTRAS) if (feat[key]) add([id], 'features');
  const refs = [['display', spec.display], ['battery', spec.battery], ['memory', spec.memory], ['radio', spec.radio]];
  for (const [k, ref] of camsList(spec)) refs.push(['camera:' + k, ref]);
  for (const [type, ref] of refs) {
    if (!ref || ref.src !== 'std') continue;            // your own designs were checked when engineered
    const [base, role] = type.split(':');
    add(PART_TECHS[base](ref.p, role), base);
  }
  return out;
}
// {missing:[ids], exclusive:{part:true}, problems:[text]}
function specAvailability(spec, av) {
  const missing = [], exclusive = {}, problems = [];
  for (const { id, part } of specTechList(spec)) {
    if (!TECH[id]) continue;
    const isStd = part !== 'design' && part !== 'features';
    if (!av.has(id)) { if (!missing.includes(id)) missing.push(id); continue; }
    if (isStd && !av.market(id)) { problems.push(`Suppliers don't sell ${TECH[id].name} yet – design your own ${PART_INFO[part] ? PART_INFO[part].name.toLowerCase() : 'part'} in the lab.`); continue; }
    if (!av.market(id)) {
      if (!av.inhouse(id)) problems.push(`${TECH[id].name} is exclusive to you – build your own ${FACTORY_TYPES[TECH_CATS[TECH[id].cat].factory].name} to use it.`);
      else exclusive[part] = true;
    }
  }
  // own part designs: must be engineered, and exclusive ones need your plant
  const refs = [['display', spec.display], ['battery', spec.battery], ['memory', spec.memory], ['radio', spec.radio]].concat(camsList(spec).map(([, r]) => ['camera', r]));
  for (const [type, ref] of refs) {
    if (!ref || ref.src !== 'own') continue;
    const d = partRecord(ref);
    if (!d) { problems.push(`A ${PART_INFO[type].name.toLowerCase()} design was deleted.`); continue; }
    if (d.status !== 'ready') problems.push(`${d.name} is still being engineered (${Math.max(0, d.readyDay - S.day)} days).`);
    if (designExclusive(d)) { if (!factoryActive(type)) problems.push(`${d.name} uses exclusive tech: only your own ${FACTORY_TYPES[type].name} can make it.`); else exclusive[type] = true; }
  }
  const chip = chipFor(spec);
  if (!chip) problems.push('Pick a processor.');
  return { missing, exclusive, problems };
}
function designExclusive(d) { const t = now(); return d.techs.some(id => TECH[id] && t < TECH[id].market); }

// ---- Chips --------------------------------------------------------------------------
function chipFor(spec) {
  if (!spec.chip) return null;
  if (spec.chip.kind === 'vendor') return vendorChipById(spec.chip.id);
  const c = S.chips.find(x => x.id === spec.chip.id);
  return c ? c.stats : null;
}
function customChipCost(stats, t) {
  return { e: processorCost(stats, t), fab: hasFab(stats.nm), early: t < nodeByNm(stats.nm).year };
}

// ---- Makers ------------------------------------------------------------------------
function partnerById(id) { return PARTNERS.find(p => p.id === id); }
function ownAssemblyMul() {
  const plant = S.factories.some(f => f.type === 'assembly' && f.status === 'active');
  let m = (plant ? FACTORY_TYPES.assembly.assemblyMul : FACTORY_TYPES.workshop.assemblyMul) * perk('inMul', 1);
  for (const id of ['mfg_auto1', 'mfg_auto2', 'mfg_auto3']) if (S.researched[id]) m *= 0.85;
  return m;
}
function supplyMul() { let m = 1; for (const id of ['mfg_supply1', 'mfg_supply2', 'mfg_supply3']) if (S.researched[id]) m *= 0.96; return m; }
function defectMul() { let m = 1; for (const id of ['mfg_qc1', 'mfg_qc2', 'mfg_qc3']) if (S.researched[id]) m *= 0.7; return m; }
function avgRevenue() {
  const h = S.history.slice(-3);
  return h.length ? h.reduce((a, m) => a + m.revenue + (m.b2b || 0), 0) / h.length : 0;
}
// can this maker build this product right now? null or a reason
function makerProblem(maker, spec, ev, avail) {
  if (maker === 'own') return factoryActive('assembly') ? null : 'You have no assembly line yet (Factories tab).';
  const p = partnerById(maker);
  if (!p) return 'Unknown manufacturer.';
  const t = now();
  if (t < p.since) return `${p.name} doesn't exist yet.`;
  if (p.until && t > p.until) return `${p.name} has closed down.`;
  if (avail.exclusive.design || avail.exclusive.features) return 'Uses exclusive design/feature tech – only your own assembly line can build it.';
  if (ev.tier > p.tier) return `${p.name} can only build up to ${TIER_NAMES[p.tier]} devices (this one is ${TIER_NAMES[ev.tier]}).`;
  const need = p.minRev * fundScale();
  if (need > 0 && avgRevenue() < need) return `${p.name} only works with clients earning ${fmtMoney(need)}+/month.`;
  return null;
}
const makerName = m => (m === 'own' ? 'Your assembly line' : (partnerById(m) || { name: '?' }).name);
const MAKERS = () => (factoryActive('assembly') ? ['own'] : []).concat(PARTNERS.map(p => p.id));

// ---- Unit costs ---------------------------------------------------------------------
// comps: [{key, label, buy (supplier/contract price or null), own (in-house cost or null), pool}]
function productCosts(spec, t, maker) {
  const chip = chipFor(spec);
  const ev = evalPhone(spec, t, chip);
  const av = playerAv();
  const avail = specAvailability(spec, av);
  const comps = [];
  const sm = supplyMul(), inMul = perk('inMul', 1);
  if (!chip) comps.push({ key: 'chip', label: 'Processor', buy: 0 });
  else if (spec.chip.kind === 'vendor') comps.push({ key: 'chip', label: 'SoC (' + chip.vendor + ')', buy: ev.costs.chip * sm });
  else {
    const { e, fab, early } = customChipCost(chip, t);
    comps.push({ key: 'chip', label: 'SoC (custom)', buy: early ? null : e.foundry, own: fab ? e.own : null, pool: fab ? 'fab' + chip.nm : null, wafers: e.wafers, buyLabel: 'foundry' });
  }
  const part = (key, type, label, ref, base) => {
    if (!ref || base == null) return;
    if (ref.src === 'std') { comps.push({ key, type, label: label + ' (' + SUPPLIERS[type] + ')', buy: base * SUPPLIER_MARKUP * sm, std: true }); return; }
    const d = partRecord(ref);
    const excl = d ? designExclusive(d) : false;
    const plant = factoryActive(type);
    comps.push({ key, type, label: label + ' (' + (d ? d.name : 'design') + ')', buy: excl ? null : base * CONTRACT_MARKUP * sm, own: plant ? base * inMul : null, pool: plant ? type : null, buyLabel: 'contract' });
  };
  part('display', 'display', 'Display', spec.display, ev.costs.display);
  for (const [k, ref] of camsList(spec)) part('cam_' + k, 'camera', CAM_ROLES[k].name, ref, ev.costs.cams[k]);
  part('battery', 'battery', 'Battery', spec.battery, ev.costs.battery || null);
  part('memory', 'memory', 'Memory', spec.memory, ev.costs.memory);
  part('radio', 'radio', 'Radio', spec.radio, ev.costs.radio);
  comps.push({ key: 'body', label: 'Body, keys & features', buy: ev.costs.body * sm });
  comps.push({ key: 'misc', label: 'Board, speaker, box', buy: ev.costs.misc * sm });
  if (ev.costs.os > 0 && !S.researched.os_own) comps.push({ key: 'os', label: 'OS license', buy: ev.costs.os });
  maker = maker || 'pearl';
  const fee = maker === 'own' ? ev.costs.labor * ownAssemblyMul() : ev.costs.labor * (partnerById(maker) || PARTNERS[0]).fee * perk('feeMul', 1);
  comps.push({ key: 'assembly', label: 'Assembly (' + makerName(maker) + ')', buy: fee });
  let est = 0;
  for (const c of comps) est += c.own != null ? c.own : c.buy != null ? c.buy : 0;
  return { comps, est, ev, chip, avail, maker };
}

// ---- New game -------------------------------------------------------------------------
function stdOk(av) { return id => av.std(id); }
function defaultDraft(cat, t) {
  const av = playerAv(), ok = stdOk(av);
  const form = cat === 'tablet' ? 'slate' : bestForm(ok, t);
  const d = buildSpec(cat, t, ok, form, 1, null);
  d.int = integrationLevel(av.ok);
  const chips = vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu);
  d.chip = { kind: 'vendor', id: (chips.find(c => c.tier !== 'flagship') || chips[0] || VENDOR_CHIPS[0]).id };
  d.name = '';
  const cost = productCosts(d, t, 'pearl').est;
  d.price = Math.max(Math.round(segBudget(cat, 'mid', t) * 0.85 / 10) * 10 - 1, Math.round(cost / (1 - RETAIL_CUT) * 1.3 / 10) * 10 - 1);
  return d;
}
// a new processor starts from what this year's mid-range vendor chip carries (unresearched blocks left out)
function defaultChipDraft() {
  const nodes = nodesForDesign(), node = nodes[nodes.length - 1] || NODES[0];
  const av = playerAv(), counts = vendorChipCounts('mid', now()), n = {};
  for (const type of BLOCK_ORDER) {
    const b = BLOCKS[type], [lo, hi] = CHIP_LIMITS[type];
    let k = type === 'modem' ? (counts.modem && counts.modemGen ? 1 : 0) : counts[type] || 0;
    if (b.tech && !av.ok(b.tech)) k = 0;
    n[type] = clamp(k, lo, hi);
  }
  const brand = (S.company || 'Nimbus').split(' ')[0];
  let i = S.chips.length + 1;
  while (S.chips.some(c => c.name === `${brand} SoC ${i}`)) i++;
  return { name: `${brand} SoC ${i}`, nm: node.nm, clk: 1, n, b64: true, b3d: true, brt: true, dvfs: true };
}
function newGame(opts) {
  const start = opts.start || FIRST_YEAR;
  S = {
    version: 3, company: opts.company || 'Nimbus Devices', playstyle: opts.playstyle || 'brand', start, day: 0,
    cash: opts.cash || 10e3, debt: 0, own: 1, aware: 0.005, rep: 6.5,
    researched: {}, rsPaid: {}, research: [], licensed: {}, factories: [], chips: [], designs: [], products: [], protos: [],
    contracts: [], offers: [], funding: { done: {}, pitch: null, offer: null, cooldown: {} },
    rivalPhones: [], rivalNext: {}, marketing: 0, month: emptyMonth(), history: [], shareHist: [], news: [], goals: {}, overdraftDays: 0,
    draft: null, chipDraft: null, partDrafts: {}, stats: { sold: 0, launched: 0, bestReview: 0, researched: 0 }, speed: 0, over: false, taxLoss: 0, exited: {},
  };
  S.aware = perk('aware', 0.005);
  for (const tc of TECHS) if (!tc.never && tc.market <= start) S.researched[tc.id] = tc.market;   // know-how you start with
  if (S.playstyle === 'maker') S.factories.push(newFactory('workshop', null, 'active', FACTORY_TYPES.workshop.cost * econ(start) * 0.5));
  S.draft = defaultDraft('phone', start);
  S.chipDraft = defaultChipDraft();
  initRivals();
  monthlyRefresh();
  computeDemand(true);
  addNews(`${S.company} is founded with ${fmtMoney(S.cash)} – enough for a prototype, not a factory. Time to find investors.`, 'good');
  addNews('Tip: design a phone in the Phone Lab and build a prototype. Then pitch friends & family and angels in the Investors tab.', 'info');
}
function emptyMonth() {
  return { revenue: 0, b2b: 0, cogs: 0, sold: 0, build: 0, upkeep: 0, rnd: 0, marketing: 0, overhead: 0, lines: 0, interest: 0, tax: 0, capex: 0, dev: 0, spare: 0, units: 0, funding: 0, penalty: 0 };
}
function newFactory(type, nm, status, invested) {
  return { id: uid('f'), type, nm: nm || null, level: 1, status, readyDay: 0, invested, sellSpare: true, used: 0, usedLast: 0 };
}

// ---- Rivals ------------------------------------------------------------------------------
function rivalAware(r, t) { return clamp(interp(r.aware, t), 0.02, 0.95); }
function rivalRegions(r, t) { let g = r.regions[0][1]; for (const [y, list] of r.regions) if (t >= y) g = list; return g; }
function makeRivalPhone(r, cat, seg, tl, gen) {
  const ok = rivalAv(tl).ok;
  const regions = rivalRegions(r, tl);
  const spec = rivalSpec(cat, seg, tl, r, ok, regions);
  let chip = vendorChipById(spec.chip.id);
  let chipPrice = vendorChipPrice(chip, tl), playerChip = null;
  // rivals may buy your chips if they beat the vendors on value
  for (const c of S.chips) {
    if (c.status !== 'ready' || !c.listed || c.stats.modemGen < chip.modemGen) continue;
    const perfR = 0.6 * c.stats.cpu / Math.max(1e-9, chip.cpu) + 0.4 * (chip.gpu > 0 ? c.stats.gpu / chip.gpu : 1);
    const value = perfR / (c.listPrice / chipPrice);
    if (perfR >= 0.9 && value > 1.1) { chip = Object.assign({}, c.stats, { kind: 'custom' }); chipPrice = c.listPrice; playerChip = c.id; }
  }
  const ev = evalPhone(spec, tl, chip);
  const raw = Object.assign({}, ev.raw);
  const sk = r.skill * (0.96 + Math.random() * 0.08);    // engineering polish
  for (const k of ['cpu', 'gpu', 'cam', 'disp', 'style']) raw[k] *= sk;
  const c = ev.costs;
  const parts = c.display + Object.values(c.cams).reduce((a, b) => a + b, 0) + c.battery + c.memory + c.radio;
  const bom = (parts * 1.25 + (playerChip ? chipPrice : c.chip || 0) + c.body + c.misc + c.os + c.labor) * 0.9;
  const B = segBudget(cat, seg, tl);
  const target = Math.max(B * r.priceMul * (0.95 + Math.random() * 0.1), bom / (1 - RETAIL_CUT) * 1.12);
  const price = roundPrice(target);
  const name = ((r.names[cat] || {})[seg] || r.name + ' {n}').replace('{n}', gen);
  return { id: uid('r'), rival: r.id, cat, seg, name, launch: tl, price, launchPrice: price, raw, bom, active: true, demand: 0, target: 0, subs: null, q: null,
    chip: chip.name, form: spec.form, playerChip, chipPrice, regions, cov: ev.coverage.byRegion, bench: ev.bench, spec: summarizeSpec(spec, ev) };
}
const roundPrice = v => Math.max(19, v >= 1000 ? Math.round(v / 50) * 50 - 1 : Math.round(v / 10) * 10 - 1);
function summarizeSpec(spec, ev) {
  return { display: partSummary('display', partParams(spec.display)), cam: spec.cams.main ? partSummary('camera', partParams(spec.cams.main)) : 'no camera',
    battery: spec.battery ? partSummary('battery', partParams(spec.battery)) : 'car power', memory: partSummary('memory', partParams(spec.memory)),
    radio: partSummary('radio', partParams(spec.radio)), weight: Math.round(ev.weight), dims: `${Math.round(ev.geom.H)}×${Math.round(ev.geom.W)}×${ev.geom.T.toFixed(1)} mm`, mat: MATERIALS[spec.body.mat].name };
}
function initRivals() {
  const t = now();
  for (const r of RIVALS) for (const cat in r.segs) r.segs[cat].forEach((seg, si) => {
    const key = `${r.id}|${cat}|${seg}`;
    const offset = (r.month + si * 0.7) / 12;
    let first = Math.floor(t) - 1 + offset;
    while (first < r.start[cat]) first += 1;
    let gen = Math.max(1, Math.floor(first - r.start[cat]) + 1);
    let next = first;
    while (next <= t) {
      if (!r.end || next < r.end) {
        S.rivalPhones.filter(p => p.key === key && p.active).forEach(p => { p.successor = next; });
        S.rivalPhones.push(Object.assign(makeRivalPhone(r, cat, seg, next, gen++), { key }));
      }
      next += 1;
    }
    S.rivalNext[key] = { t: next, gen };
  });
  S.rivalPhones.forEach(p => { p.demand = 0; });
}
function rivalReleases() {
  const t = now();
  for (const r of RIVALS) for (const cat in r.segs) for (const seg of r.segs[cat]) {
    const key = `${r.id}|${cat}|${seg}`, nx = S.rivalNext[key];
    if (!nx || t < nx.t) continue;
    if (r.end && t >= r.end) continue;
    S.rivalPhones.filter(p => p.key === key && p.active && !p.successor).forEach(p => { p.successor = t; });
    const ph = Object.assign(makeRivalPhone(r, cat, seg, t, nx.gen), { key });
    S.rivalPhones.push(ph);
    nx.t += 1 + (Math.random() - 0.5) * 0.08; nx.gen++;
    refreshScores(ph);
    if (ph.playerChip) {
      completeGoal('b2b');
      addNews(`🤝 ${r.name} picked your ${S.chips.find(c => c.id === ph.playerChip).name} chip for the ${ph.name}!`, 'good', true);
    } else if (seg === 'premium' || seg === 'ultra') addNews(`${r.name} launches the ${ph.name} at ${fmtMoney(ph.price)}.`, 'rival');
  }
  // old models stay on sale for ~10 months after their successor, then leave the shelves
  for (const p of S.rivalPhones) {
    if (!p.active) continue;
    const rv = RIVALS.find(x => x.id === p.rival);
    if ((p.successor && t > p.successor + 0.85) || (rv.end && t > rv.end + 1)) p.active = false;
  }
  S.rivalPhones = S.rivalPhones.filter(p => p.active || t - p.launch < 3);
  for (const r of RIVALS) {
    if (!r.end || t < r.end + 1 || S.exited[r.id]) continue;
    S.exited[r.id] = t;
    addNews(`${r.name} exits the phone business after years of declining sales.`, 'rival', true);
  }
}
// gentle monthly price cuts, never below cost
function rivalPricing() {
  for (const p of S.rivalPhones) {
    if (!p.active) continue;
    const floor = p.bom / (1 - RETAIL_CUT) * 1.03;
    p.price = roundPrice(Math.max(floor, p.price * (p.successor ? 0.97 : 0.988)));
  }
}

// ---- Scores (monthly) --------------------------------------------------------------------
function refreshScores(p) {
  const cat = p.cat || p.spec.cat, t = now();
  p.subs = subscores(p.raw, cat, t);
  p.q = {};
  for (const seg of SEGMENTS) p.q[seg] = segQuality(p.subs, seg, t);
  if (p.rival) {
    const rv = RIVALS.find(x => x.id === p.rival);
    p.review = clamp(rv.rep + (p.q[p.seg] - SEG_INFO[p.seg].typical) / 12, 4, 9.6);
  }
}
function refreshProduct(p) {
  const t = now();
  const chip = chipFor(p.spec);
  if (!chip) return;
  const ev = evalPhone(p.spec, t, chip);
  p.raw = ev.raw; p.cov = ev.coverage.byRegion; p.bench = ev.bench; p.weight = ev.weight;
  refreshScores(p);
  p.costs = null;
}
function monthlyRefresh() {
  S.rivalPhones.forEach(p => { if (p.active) refreshScores(p); });
  S.products.forEach(p => { if (p.status !== 'retired') refreshProduct(p); });
}

// ---- Demand -------------------------------------------------------------------------------
// Each region × segment: buyers split between phones in proportion to their appeal:
//   presence(brand) × value(quality, price) × hype × reviews × network coverage
const presence = aware => Math.pow(Math.max(0.001, aware), 0.65);
function playerPresence() {
  let m = 1;
  for (const id of ['biz_retail1', 'biz_carrier', 'biz_stores']) if (S.researched[id]) m *= id === 'biz_stores' ? 1.1 : 1.15;
  return presence(S.aware) * m;
}
const hype = (launch, t) => 1 + 0.3 * Math.exp(-Math.max(0, t - launch) * 12 / 3);
const reviewMul = r => Math.exp(0.22 * ((r == null ? 6.5 : r) - 6.5));
function listings(cat) {
  const t = now(), list = [];
  for (const r of S.rivalPhones) if (r.active && r.cat === cat && r.q) {
    const rv = RIVALS.find(x => x.id === r.rival);
    list.push({ o: r, pres: presence(rivalAware(rv, t)), review: r.review, regions: r.regions, cov: r.cov, price: r.price, launch: r.launch });
  }
  const pp = playerPresence();
  for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat && p.q)
    list.push({ o: p, mine: true, pres: pp, review: p.review, regions: null, cov: p.cov, price: p.price, launch: p.launch });
  return list;
}
const MKT = {};
function demandFor(list, cat, extra) {
  const t = now(), M = marketSize(cat, t), split = segSplit(t), reg = regionShares(t);
  const out = new Map();
  for (const x of list) out.set(x, { units: 0, seg: {} });
  if (extra) out.set(extra, { units: 0, seg: {} });
  const all = extra ? list.concat([extra]) : list;
  SEGMENTS.forEach((seg, si) => {
    const si2 = SEG_INFO[seg];
    const base = all.map(x => x.pres * valueTerm(x.o.q[seg], x.price, cat, seg, t) * hype(x.launch, t) * reviewMul(x.review));
    const A0 = 0.5 * Math.pow(si2.typical / 100, si2.k);
    for (const r of REGION_ORDER) {
      const Ms = M * split[si] * reg[r];
      if (Ms <= 0) continue;
      let sum = A0;
      const a = all.map((x, i) => {
        const c = x.regions && !x.regions.includes(r) ? 0 : (x.cov && x.cov[r]) || 0;
        const v = base[i] * c;
        sum += v;
        return v;
      });
      all.forEach((x, i) => { if (!a[i]) return; const u = Ms * a[i] / sum; const d = out.get(x); d.units += u; d.seg[seg] = (d.seg[seg] || 0) + u; });
    }
  });
  return out;
}
// smooth: actual demand drifts toward the target over ~a month
function computeDemand(snap) {
  for (const cat of ['phone', 'tablet']) {
    const list = listings(cat);
    const res = demandFor(list, cat);
    for (const x of list) {
      const d = res.get(x);
      x.o.target = d.units; x.o.segUnits = d.seg;
      x.o.demand = snap || x.o.demand == null ? d.units : x.o.demand + (d.units - x.o.demand) * 0.045;
    }
  }
}
// what-if: monthly demand for a design that is not on sale yet (at full ramp)
function estimateDemand(raw, cat, price, review, cov) {
  const t = now();
  const subs = subscores(raw, cat, t);
  const q = {};
  for (const seg of SEGMENTS) q[seg] = segQuality(subs, seg, t);
  const ev = { o: { q }, mine: true, pres: playerPresence(), review, regions: null, cov: cov || raw.cov, price, launch: t - 0.5 };
  const res = demandFor(listings(cat), cat, ev);
  return { units: res.get(ev).units, bySeg: res.get(ev).seg, subs, q };
}
function predictReview(raw, cat, price, exclusive) {
  const t = now(), seg = segmentForPrice(cat, price, t);
  const subs = subscores(raw, cat, t);
  const q = segQuality(subs, seg, t);
  const V = Math.log(Math.max(1e-9, valueTerm(q, price, cat, seg, t)));
  const rivals = S.rivalPhones.filter(r => r.active && r.cat === cat && r.seg === seg && r.q);
  let Vbar = Math.log(valueTerm(SEG_INFO[seg].typical, segBudget(cat, seg, t), cat, seg, t));
  if (rivals.length) Vbar = rivals.reduce((a, r) => a + Math.log(Math.max(1e-9, valueTerm(r.q[seg], r.price, cat, seg, t))), 0) / rivals.length;
  const avgSubs = {};
  for (const k in SUB_LABELS) avgSubs[k] = rivals.length ? rivals.reduce((a, r) => a + r.subs[k], 0) / rivals.length : 70;
  let score = 6.5 + 1.6 * (V - Vbar) + (exclusive ? 0.25 : 0) + (S.researched.biz_pr ? 0.3 : 0) + (S.researched.biz_stores ? 0.2 : 0) + (S.researched.biz_influencer ? 0.2 : 0);
  return { score: clamp(score, 1, 10), seg, subs, avgSubs, q };
}
function reviewNotes(rv, ev, exclusive) {
  const diffs = Object.keys(SUB_LABELS).map(k => [k, rv.subs[k] - rv.avgSubs[k]]).sort((a, b) => b[1] - a[1]);
  const good = { perf: 'blazing performance', cam: 'a superb camera', disp: 'a gorgeous display', batt: 'outstanding battery life', net: 'great reception and speed', design: 'a gorgeous, portable design', feat: 'a loaded feature set' };
  const bad = { perf: 'sluggish performance', cam: 'a disappointing camera', disp: 'a mediocre screen', batt: 'weak battery life', net: 'poor reception', design: 'a dated, bulky design', feat: 'missing features' };
  const notes = [];
  if (diffs[0][1] > 4) notes.push('+ ' + good[diffs[0][0]]);
  if (diffs[1][1] > 4) notes.push('+ ' + good[diffs[1][0]]);
  if (diffs[6][1] < -4) notes.push('− ' + bad[diffs[6][0]]);
  if (diffs[5][1] < -6) notes.push('− ' + bad[diffs[5][0]]);
  if (ev.sustain < 0.7) notes.push('− runs hot and throttles');
  for (const n of ev.layout.notes.slice(0, 2)) notes.push(n);
  if (exclusive && exclusive.length) notes.push('+ first to ship ' + exclusive.slice(0, 2).map(id => TECH[id].name).join(', '));
  return notes;
}

// ---- Actions: design ------------------------------------------------------------------------
function spend(amount, bucket) { S.cash -= amount; S.month[bucket] = (S.month[bucket] || 0) + amount; }
function creditLimit() { return 5e3 * fundScale() + 0.5 * avgRevenue(); }
const spendable = () => Math.max(0, S.cash + creditLimit());
function canAfford(cost) { return S.cash - cost >= -creditLimit(); }
function devCost(cat) { return CATS[cat].devCost * ecoNow() * perk('devMul', 1); }
function protoCost(spec) { return productCosts(spec, now(), 'riverside').est * 3 + 8000 * ecoNow(); }
function specProblems(spec) {
  const out = [];
  if (!spec.name || !spec.name.trim()) out.push('Give your device a name.');
  const av = playerAv();
  const a = specAvailability(spec, av);
  if (a.missing.length) out.push('Research needed: ' + a.missing.slice(0, 3).map(id => TECH[id].name).join(', ') + (a.missing.length > 3 ? '…' : '') + '.');
  for (const p of a.problems) out.push(p);
  const chip = chipFor(spec);
  if (chip) for (const i of evalPhone(spec, now(), chip).issues) out.push(i);
  return [...new Set(out)];
}
function checkSpec(spec) { return specProblems(spec)[0] || null; }
function exclusiveTechs(spec) {
  const t = now(), out = [];
  for (const { id } of specTechList(spec)) if (TECH[id] && t < TECH[id].market && !out.includes(id)) out.push(id);
  const refs = [spec.display, spec.battery, spec.memory, spec.radio].concat(camsList(spec).map(([, r]) => r));
  for (const ref of refs) { const d = partRecord(ref); if (d) for (const id of d.techs) if (TECH[id] && t < TECH[id].market && !out.includes(id)) out.push(id); }
  return out;
}
function buildPrototype(spec) {
  const err = checkSpec(spec);
  if (err) return err;
  const cost = protoCost(spec);
  if (!canAfford(cost)) return `A prototype costs ${fmtMoney(cost)} – you can't afford it yet.`;
  spend(cost, 'dev');
  const ev = evalPhone(spec, now(), chipFor(spec));
  S.protos.push({ id: uid('x'), name: spec.name.trim(), spec: JSON.parse(JSON.stringify(spec)), raw: ev.raw, readyDay: S.day + 14, review: null, price: spec.price, excl: exclusiveTechs(spec) });
  addNews(`Building a hand-made prototype of the ${spec.name} (${fmtMoney(cost)}, 14 days).`, 'info');
  return null;
}
function launchProduct(spec) {
  const err = checkSpec(spec);
  if (err) return err;
  const cost = devCost(spec.cat);
  if (!canAfford(cost)) return `Development costs ${fmtMoney(cost)} – raise money first (Investors tab).`;
  spend(cost, 'dev');
  const t = now();
  const s = JSON.parse(JSON.stringify(spec));
  s.name = s.name.trim();
  const ev = evalPhone(s, t, chipFor(s));
  const raw = Object.assign({ cov: ev.coverage.byRegion }, ev.raw);
  const excl = exclusiveTechs(s);
  const rv = predictReview(raw, s.cat, s.price, excl.length);
  const p = {
    id: uid('p'), name: s.name, spec: s, raw, price: s.price, status: 'dev', devUntil: S.day + 45, launch: null, inventory: 0,
    line: { maker: 'auto', mode: 'auto', rate: 0 }, lineMaker: null, lineReady: 0, prodAcc: 0, dAcc: 0, demand: 0, target: 0,
    sold: 0, soldMonth: 0, soldLastMonth: 0, producedMonth: 0, producedLast: 0, revenue: 0, profit: 0, lost: 0, review: null, notes: [], exclusive: excl,
    forecast: estimateDemand(raw, s.cat, s.price, rv.score).units, unitCostLast: 0, created: t, cov: ev.coverage.byRegion, bench: ev.bench,
  };
  S.products.push(p);
  refreshScores(p);
  assignMaker(p);
  addNews(`Development started on the ${p.name} (${fmtMoney(cost)}, 45 days). Its production line starts building stock for launch.`, 'info');
  return null;
}
function finishDev(p) {
  const t = now();
  p.status = 'active'; p.launch = t;
  refreshProduct(p);
  const ev = evalPhone(p.spec, t, chipFor(p.spec));
  const rv = predictReview(p.raw, p.spec.cat, p.price, p.exclusive.length);
  p.review = Math.round(rv.score * 10) / 10;
  p.notes = reviewNotes(rv, ev, p.exclusive);
  S.rep = S.rep * 0.7 + p.review * 0.3;
  if (p.review >= 7.5) S.aware = clamp(S.aware + (1 - S.aware) * 0.012 * (p.review - 7), 0, 0.95);
  S.stats.launched++;
  S.stats.bestReview = Math.max(S.stats.bestReview, p.review);
  completeGoal('launch1');
  if (p.review >= 8) completeGoal('review8');
  if (!['car', 'bag'].includes(formOf(p.spec))) completeGoal('handheld');
  addNews(`🚀 ${p.name} launches! Reviews: ${p.review.toFixed(1)}/10 — ${p.notes.join(', ') || 'a solid, unremarkable device'}.`, p.review >= 7 ? 'good' : p.review < 5 ? 'bad' : 'info', true);
}

// ---- Part design (labs) ---------------------------------------------------------------------
function designCost(type) {
  let c = PART_INFO[type].nre * ecoNow() * perk('tapeMul', 1);
  if (S.researched.mfg_tooling) c *= 0.75;
  return c;
}
function designDays(type) { return Math.round(PART_INFO[type].days * (S.researched.mfg_tooling ? 0.75 : 1)); }
function designProblems(type, p, role) {
  const out = [];
  const av = playerAv();
  const techs = PART_TECHS[type](p, role);
  const miss = techs.filter(id => TECH[id] && !av.has(id));
  if (miss.length) out.push('Research needed: ' + miss.slice(0, 3).map(id => TECH[id].name).join(', ') + '.');
  const st = type === 'camera' ? evalCamera(p, now(), role) : PART_EVAL[type](p, now());
  if (st && st.rules) for (const r of st.rules) if (r.err) out.push(r.text);
  return out;
}
function engineerPart(type, name, p, role) {
  if (!name || !name.trim()) return 'Name your design.';
  const prob = designProblems(type, p, role);
  if (prob.length) return prob[0];
  const cost = designCost(type);
  if (!canAfford(cost)) return `Engineering and tooling cost ${fmtMoney(cost)} – not enough cash.`;
  spend(cost, 'dev');
  const days = designDays(type);
  S.designs.push({ id: uid('d'), type, role: role || null, name: name.trim(), p: JSON.parse(JSON.stringify(p)), techs: PART_TECHS[type](p, role).filter(id => TECH[id]),
    status: 'engineering', readyDay: S.day + days, nre: cost, created: now() });
  addNews(`Engineering ${name.trim()} (${PART_INFO[type].name.toLowerCase()}): ${fmtMoney(cost)} for prototypes and tooling, ready in ${days} days.`, 'info');
  return null;
}

// ---- Chips ----------------------------------------------------------------------------------
// mask sets (a respin included) + the design, verification and software team, which grows with the die
function tapeOutCost(nm, area) { return (nodeByNm(nm).mask * 1.5 + 8e6 * ecoNow() * Math.pow(area / 50, 0.6)) * perk('tapeMul', 1); }
const tapeOutDays = area => Math.round(100 + Math.min(80, area / 4));
function chipProblems(cfg) {
  const av = playerAv();
  if (!cfg.name || !cfg.name.trim()) return 'Name your chip.';
  if (!nodesForDesign().some(n => n.nm === cfg.nm)) return 'Research this process node first.';
  for (const type of BLOCK_ORDER) if ((cfg.n[type] || 0) > 0 && BLOCKS[type].tech && !av.ok(BLOCKS[type].tech)) return `Research ${TECH[BLOCKS[type].tech].name} first.`;
  const st = evalProcessor(cfg, av.ok, now());
  return st.ok ? null : st.issues.find(i => i.err).text;
}
function tapeOut(cfg) {
  const prob = chipProblems(cfg);
  if (prob) return prob;
  const t = now(), st = evalProcessor(cfg, playerAv().ok, t);
  const cost = tapeOutCost(cfg.nm, st.area);
  if (!canAfford(cost)) return `The mask set costs ${fmtMoney(cost)} – not enough cash.`;
  spend(cost, 'dev');
  const stats = Object.assign({}, st);
  delete stats.issues; delete stats.units;
  stats.kind = 'custom'; stats.name = cfg.name.trim();
  const days = tapeOutDays(st.area);
  S.chips.push({ id: uid('c'), name: cfg.name.trim(), cfg: JSON.parse(JSON.stringify(cfg)), stats, status: 'taping', readyDay: S.day + days, created: t, listed: false, listPrice: 0, sold: 0 });
  addNews(`${cfg.name.trim()} taped out at ${nodeLabel(cfg.nm)} (${fmtMoney(cost)}). First silicon in ~${Math.round(days / 30)} months.`, 'info');
  return null;
}
function listChip(c, price) {
  c.listed = price > 0; c.listPrice = Math.max(0.01, Math.round(price * 100) / 100);
  addNews(c.listed ? `${c.name} is now offered to other brands at ${fmtMoney(c.listPrice)} per chip.` : `${c.name} is no longer offered to other brands.`, 'info');
}

// ---- Production lines ---------------------------------------------------------------------------
// Each product has one line at one manufacturer. "Auto" picks the cheapest maker that can build it.
function lineCosts(p, maker) {
  const key = maker + '|' + monthIndex(now());
  if (!p.costs || p.costs.key !== key) p.costs = Object.assign(productCosts(p.spec, now(), maker), { key });
  return p.costs;
}
function makerOptions(p) {
  const out = [];
  const base = lineCosts(p, 'pearl');
  for (const m of MAKERS()) {
    const prob = makerProblem(m, p.spec, base.ev, base.avail);
    const pc = prob ? null : productCosts(p.spec, now(), m);
    const pt = partnerById(m);
    out.push({ m, prob, unit: pc ? pc.est : null, cap: m === 'own' ? factoryPool('assembly') : pt.cap, lead: m === 'own' ? 5 : pt.lead,
      fee: m === 'own' ? 0 : pt.lineFee * ecoNow(), defect: (m === 'own' ? 0.01 : pt.defect) * defectMul() });
  }
  return out;
}
function assignMaker(p) {
  let m = p.line.maker;
  const opts = makerOptions(p);
  if (m === 'auto') {
    const want = Math.max(p.demand || 0, p.forecast || 0);
    const ok = opts.filter(o => !o.prob);
    // cheapest per unit including the monthly line fee, preferring makers with enough capacity
    ok.sort((a, b) => ((b.cap >= want * 1.1) - (a.cap >= want * 1.1)) || ((a.unit + a.fee / Math.max(50, want)) - (b.unit + b.fee / Math.max(50, want))));
    m = ok.length ? ok[0].m : null;
  } else if (opts.find(o => o.m === m).prob) m = null;
  if (m !== p.lineMaker) {
    p.lineMaker = m;
    if (m) {
      const lead = opts.find(o => o.m === m).lead * (S.researched.mfg_ramp ? 0.6 : 1);
      p.lineReady = S.day + Math.round(lead);
    }
    p.costs = null;
  }
  p.lineMsg = m ? null : (opts.find(o => o.m === p.line.maker) || {}).prob || 'No manufacturer can build this device right now.';
}
function factoryPool(poolKey) {
  return S.factories.filter(f => f.status === 'active' && poolKeyOf(f) === poolKey).reduce((a, f) => a + factoryCap(f), 0);
}

// ---- Factories ----------------------------------------------------------------------------
function factoryBuildCost(type, nm) { return type === 'fab' ? nodeByNm(nm).fab * perk('facMul', 1) : FACTORY_TYPES[type].cost * ecoNow() * perk('facMul', 1); }
function factoryUpkeep(f) {
  const base = f.type === 'fab' ? nodeByNm(f.nm).fab * 0.004 : FACTORY_TYPES[f.type].upkeep * ecoNow();
  return base * (1 + 0.6 * (f.level - 1)) * perk('upkeepMul', 1);
}
function factoryCap(f) { return FACTORY_TYPES[f.type].cap * f.level; }
function poolKeyOf(f) { return f.type === 'fab' ? 'fab' + f.nm : FACTORY_TYPES[f.type].pool || f.type; }
function factoryName(f) { return f.type === 'fab' ? `${nodeLabel(f.nm)} Chip Fab` : FACTORY_TYPES[f.type].name; }
function buildFactory(type, nm) {
  const cost = factoryBuildCost(type, nm);
  if (type === 'fab' && now() < nodeByNm(nm).year && !S.researched['proc_' + nm]) return 'Research this process node first.';
  if (!canAfford(cost)) return 'Not enough cash (raise money in the Investors tab, or take a loan).';
  spend(cost, 'capex');
  const days = type === 'fab' ? FACTORY_TYPES.fab.days + 15 * Math.max(0, NODES.findIndex(n => n.nm === nm) - 8) : FACTORY_TYPES[type].days;
  const f = newFactory(type, nm, 'building', cost);
  f.readyDay = S.day + days;
  S.factories.push(f);
  addNews(`Construction started: ${factoryName(f)} (${fmtMoney(cost)}, ${Math.max(1, Math.round(days / 30))} months).`, 'info');
  return null;
}
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
const RS_BASE = y => 2500 * Math.pow(1.105, Math.max(0, y - FIRST_YEAR));
function researchCost(tc) {
  const t = now(), year = tc.never ? tc.opens : tc.market;
  const timing = tc.never ? 1 : t < tc.market ? 1.6 : Math.max(0.2, Math.pow(0.8, t - tc.market));
  return RS_BASE(year) * tc.k * timing * perk('rsCost', 1);
}
function researchDays(tc) {
  const t = now();
  const timing = tc.never || t < tc.market ? 1 : Math.max(0.4, Math.pow(0.85, t - tc.market));
  return Math.max(5, Math.ceil(tc.days * timing / researchSpeed()));
}
const reqMet = tc => tc.req.every(id => S.researched[id]) && (!tc.reqAny || tc.reqAny.some(id => S.researched[id]));
function techState(tc) {
  const t = now();
  if (S.researched[tc.id]) return 'done';
  if (S.research.some(r => r.id === tc.id)) return 'active';
  if (suppliedOnly(tc)) return 'supplied';
  if (t < (tc.never ? tc.opens : tc.market - tc.lead)) return 'future';
  if (!reqMet(tc)) return 'locked';
  return 'available';
}
function missingReqs(tc) {
  const nm = id => TECH[id].name + (suppliedOnly(TECH[id]) ? ` (from suppliers, ${dateLabel(TECH[id].market)})` : '');
  const out = tc.req.filter(id => !S.researched[id]).map(nm);
  if (tc.reqAny && !tc.reqAny.some(id => S.researched[id])) out.push(tc.reqAny.map(nm).join(' or '));
  return out;
}
function startResearch(id) {
  const tc = TECH[id];
  const st = techState(tc);
  if (st === 'locked') return 'Research ' + missingReqs(tc).join(', ') + ' first.';
  if (st === 'future') return `Nobody can research this until ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}.`;
  if (st === 'supplied') return `${supplierWord(tc)} from ${dateLabel(tc.market)}.`;
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
  if (!S.researched[id] || tc.never || now() >= tc.market || S.licensed[id]) return 'Only exclusive tech you own can be licensed.';
  if (!TECH_CATS[tc.cat].factory) return 'Know-how like this cannot be licensed.';
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
  else if (rd.need === 'proto') p = clamp((bestShowcaseReview() - 3.5) / 4, 0.15, 0.92);
  else {
    const ratio = lastRevenue() / (rd.rev * fs);
    const h = S.history.slice(-4);
    const growth = h.length >= 4 && h[0].revenue > 0 ? clamp(h[3].revenue / h[0].revenue - 1, -0.5, 1) : 0;
    p = clamp(0.35 + 0.35 * (ratio - 1) + 0.06 * (S.rep - 6.5) + 0.4 * growth, 0.12, 0.95);
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
const B2B_LABEL = { assembly: 'device assembly', display: 'display panels', camera: 'camera modules', battery: 'battery cells', memory: 'memory sets', radio: 'radio modules' };
let _typicalCache = null;
function typicalPrices() {
  const key = monthIndex(now());
  if (_typicalCache && _typicalCache.key === key) return _typicalCache.v;
  const t = now(), spec = rivalSpec('phone', 'mid', t, null, marketAv(t).ok, null), ev = evalPhone(spec, t, vendorChipById(spec.chip.id));
  const c = ev.costs;
  const v = { assembly: c.labor, display: c.display * SUPPLIER_MARKUP, camera: (Object.values(c.cams)[0] || 4) * SUPPLIER_MARKUP, battery: Math.max(2, c.battery) * SUPPLIER_MARKUP,
    memory: c.memory * SUPPLIER_MARKUP, radio: c.radio * SUPPLIER_MARKUP };
  _typicalCache = { key, v };
  return v;
}
function contractUnitCost(type) {
  const tp = typicalPrices();
  return type === 'assembly' ? tp.assembly * ownAssemblyMul() : type.startsWith('fab') ? nodeByNm(+type.slice(3)).wafer * 0.3 : tp[type] / SUPPLIER_MARKUP * perk('inMul', 1);
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
    if (!base) continue;
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
function factoryValue() { return S.factories.reduce((a, f) => a + f.invested * 0.6, 0); }
function inventoryValue() { return S.products.reduce((a, p) => a + p.inventory * (p.unitCostLast || 0), 0); }
function netWorth() { return S.cash - S.debt + factoryValue() + inventoryValue(); }
function loanLimit() { return Math.max(0, 10e3 * fundScale() + 0.3 * Math.max(0, netWorth()) + 2 * avgRevenue() - S.debt); }
function loanRate() { return 0.09; }
function borrow(amt) { amt = Math.min(amt, loanLimit()); if (amt <= 0) return; S.debt += amt; S.cash += amt; addNews(`Borrowed ${fmtMoney(amt)} at ${(loanRate() * 100).toFixed(0)}% APR.`, 'info'); }
function repay(amt) { amt = Math.min(amt, S.debt, Math.max(0, S.cash)); if (amt <= 0) return; S.debt -= amt; S.cash -= amt; }
const retailCut = () => (S.researched.biz_online ? 0.25 : RETAIL_CUT);

// ---- News & goals -------------------------------------------------------------------------
function addNews(text, kind, important) {
  const n = { day: S.day, t: now(), text, kind: kind || 'info' };
  S.news.unshift(n);
  if (S.news.length > 150) S.news.length = 150;
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

  // research
  const supplied = supplierTech().filter(tc => tc.k >= 1);
  if (supplied.length > 3) addNews(`📦 Suppliers now sell ${supplied.length} new technologies.`, 'world');
  else for (const tc of supplied) addNews(`📦 ${tc.cat === 'process' ? 'Foundries now offer' : 'Suppliers now sell'} ${tc.name}.`, 'world');
  for (const r of S.research.slice()) {
    const tc = TECH[r.id];
    r.progress += 1;
    if (r.progress < r.days) continue;
    S.research = S.research.filter(x => x !== r);
    S.researched[tc.id] = t; S.rsPaid[tc.id] = r.cost;
    S.stats.researched++;
    if (S.stats.researched >= 5) completeGoal('research5');
    const early = t < tc.market && !tc.never;
    if (early && TECH_CATS[tc.cat].factory) completeGoal('exclusive');
    const fac = TECH_CATS[tc.cat].factory;
    const need = early && fac && fac !== 'fab' && !factoryActive(fac) ? ` It's exclusive until ${dateLabel(tc.market)} – build a ${FACTORY_TYPES[fac].name} to use it before then.` : early && fac ? ` Exclusive to you until ${dateLabel(tc.market)}!` : '';
    addNews(`🔬 Research complete: ${tc.name}.${need}`, 'good', true);
    S.products.forEach(p => { p.costs = null; });
  }
  // construction & engineering
  for (const f of S.factories) {
    if (f.status === 'building' && S.day >= f.readyDay) {
      f.status = 'active';
      addNews(`🏗️ ${factoryName(f)} is online.`, 'good', true);
      S.products.forEach(p => { p.costs = null; });
      if (f.type !== 'rnd') completeGoal('factory');
      if (f.type === 'fab') completeGoal('fab');
    }
    if (f.upgradeUntil && S.day >= f.upgradeUntil) { f.level++; f.upgradeUntil = null; addNews(`${factoryName(f)} expanded to level ${f.level}.`, 'good'); }
  }
  for (const c of S.chips) if (c.status === 'taping' && S.day >= c.readyDay) {
    c.status = 'ready';
    completeGoal('chip');
    addNews(`💠 First silicon is back: ${c.name} works! Use it in the Phone Lab – or offer it to other brands.`, 'good', true);
  }
  for (const d of S.designs) if (d.status === 'engineering' && S.day >= d.readyDay) {
    d.status = 'ready';
    completeGoal('design1');
    addNews(`🛠️ ${d.name} is engineered and tooled up – pick it in the Phone Lab.`, 'good', true);
  }
  for (const x of S.protos) if (x.review == null && S.day >= x.readyDay) {
    x.review = Math.round(predictReview(x.raw, x.spec.cat, x.price, (x.excl || []).length).score * 10) / 10;
    completeGoal('proto');
    addNews(`🧪 Prototype ${x.name} is ready. Hands-on impressions: ${x.review.toFixed(1)}/10. Show it to angel investors!`, 'good', true);
  }
  for (const p of S.products) if (p.status === 'dev' && S.day >= p.devUntil) finishDev(p);
  const f = S.funding;
  if (f.pitch && S.day >= f.pitch.until) finishPitch();
  if (f.offer && S.day >= f.offer.expires) { addNews(`The offer from ${f.offer.investor} expired.`, 'bad'); f.offer = null; }

  rivalReleases();
  computeDemand();
  produce();
  sell();
  spend(S.marketing / 30, 'marketing');

  if (S.cash < -creditLimit()) S.overdraftDays++; else S.overdraftDays = 0;
  if (S.overdraftDays > 90) { S.over = true; emit('gameover'); return; }
  if (monthIndex(t) !== prevMonth) endOfMonth();
}

// factory capacity per day, shared out by priority: contracts, then your products
function produce() {
  const t = now();
  const pool = {};
  for (const fa of S.factories) if (fa.status === 'active' && fa.type !== 'rnd') pool[poolKeyOf(fa)] = (pool[poolKeyOf(fa)] || 0) + factoryCap(fa) / 30;
  const poolStart = Object.assign({}, pool);
  // supply contracts first – they are obligations
  for (const c of S.contracts) {
    const got = Math.min(c.qty / 30, pool[c.type] || 0);
    pool[c.type] = (pool[c.type] || 0) - got;
    c.delivered += got;
    spend(got * contractUnitCost(c.type), 'cogs');
  }
  // chips sold to rivals
  for (const r of S.rivalPhones) if (r.active && r.playerChip) {
    const c = S.chips.find(x => x.id === r.playerChip);
    if (!c) continue;
    const units = (r.demand || 0) / 30;
    const { e, fab, early } = customChipCost(c.stats, t);
    const fabKey = 'fab' + c.stats.nm;
    const inFab = fab ? Math.min(units, (pool[fabKey] || 0) / e.wafers) : 0;
    if (fab) pool[fabKey] -= inFab * e.wafers;
    const atFoundry = early ? 0 : units - inFab;
    const sold = inFab + atFoundry;
    S.cash += sold * c.listPrice; S.month.b2b += sold * c.listPrice;
    spend(inFab * e.own + atFoundry * e.foundry, 'cogs');
    c.sold += sold;
  }
  // products
  const partnerLeft = {};
  for (const p of S.products) {
    if (p.status === 'retired' || p.discontinued) continue;
    if (S.day % 15 === 0 || p.lineMaker === undefined) assignMaker(p);
    const m = p.lineMaker;
    if (!m || S.day < p.lineReady) continue;
    let want;
    if (p.line.mode === 'manual') want = p.line.rate / 30;
    else {
      const rate = p.status === 'active' ? Math.max(p.demand, p.target * 0.5) : (p.forecast || 0) * 0.4;
      want = Math.max(0, rate / 30 + (rate * 0.6 - p.inventory) / 15);   // keep ~3 weeks of stock
    }
    if (want <= 0) continue;
    p.prodAcc = Math.min((p.prodAcc || 0) + want, want * 4 + 2);
    let units = Math.floor(p.prodAcc);
    if (units <= 0) continue;
    const pc = lineCosts(p, m);
    // maker capacity
    if (m === 'own') units = Math.min(units, Math.floor((pool.assembly || 0) + 1e-9));
    else {
      if (partnerLeft[m] == null) partnerLeft[m] = partnerById(m).cap / 30;
      units = Math.min(units, Math.floor(partnerLeft[m] + 1e-9));
    }
    // exclusive parts only come from your own plants
    for (const c of pc.comps) if (c.buy == null && c.key !== 'assembly') {
      const avail = c.pool ? (pool[c.pool] || 0) / (c.wafers || 1) : 0;
      units = Math.min(units, Math.floor(avail + 1e-9));
    }
    // you pay as units come off the line – and keep enough back for this month's bills
    const budget = S.cash + creditLimit() * 0.5 - monthlyFixed();
    units = Math.min(units, Math.floor(Math.max(0, budget) / Math.max(0.01, pc.est)));
    p.cashStalled = units <= 0 && budget < pc.est;
    if (units <= 0) continue;
    p.prodAcc -= units;
    let cost = 0;
    for (const c of pc.comps) {
      if (c.own != null && c.pool) {
        const need = units * (c.wafers || 1), use = Math.min(need, pool[c.pool] || 0);
        pool[c.pool] = (pool[c.pool] || 0) - use;
        const frac = need > 0 ? use / need : 1;
        cost += units * (frac * c.own + (1 - frac) * (c.buy != null ? c.buy : c.own));
      } else cost += units * (c.buy != null ? c.buy : c.own || 0);
    }
    if (m === 'own') pool.assembly -= units; else partnerLeft[m] -= units;
    const defect = (m === 'own' ? 0.01 : partnerById(m).defect) * defectMul();
    const good = Math.max(0, units - Math.round(units * defect * (0.6 + Math.random() * 0.8)));
    p.inventory += good;
    p.unitCostLast = cost / Math.max(1, good);
    p.producedMonth = (p.producedMonth || 0) + good;
    p.lineUsed = true;
    spend(cost, 'build');            // goes into stock; it becomes a cost when sold
  }
  // utilization bookkeeping
  for (const fa of S.factories) if (fa.status === 'active' && fa.type !== 'rnd') {
    const k = poolKeyOf(fa);
    const share = poolStart[k] > 0 ? (factoryCap(fa) / 30) / poolStart[k] : 0;
    fa.used += (poolStart[k] - Math.max(0, pool[k] || 0)) * share;
  }
}
// roughly what end-of-month bills will be (staff, upkeep, line fees, marketing)
function monthlyFixed() {
  const active = S.products.filter(p => p.status === 'active').length;
  let f = (5e3 + 40e3 * active) * ecoNow() + S.marketing;
  for (const fa of S.factories) if (fa.status === 'active') f += factoryUpkeep(fa);
  return f * 0.5;
}
function sell() {
  const cut = retailCut();
  for (const p of S.products) {
    if (p.status !== 'active') continue;
    p.dAcc = (p.dAcc || 0) + p.demand / 30 * (0.92 + Math.random() * 0.16);
    const want = Math.floor(p.dAcc);
    p.dAcc -= want;
    const sold = Math.min(want, p.inventory);
    p.lost += want - sold;
    p.inventory -= sold;
    const rev = sold * p.price * (1 - cut);
    p.sold += sold; p.soldMonth += sold; p.revenue += rev;
    p.profit += rev - sold * (p.unitCostLast || 0);
    S.month.sold += sold * (p.unitCostLast || 0);
    S.cash += rev; S.month.revenue += rev; S.month.units += sold;
    S.stats.sold += sold;
    if (p.discontinued && p.inventory <= 0) { p.status = 'retired'; addNews(`${p.name} sold out and is retired.`, 'info'); }
  }
  if (S.stats.sold >= 100) completeGoal('sold100');
}

function endOfMonth() {
  const t = now();
  const m = S.month;
  // fixed costs
  let upkeep = 0;
  for (const fa of S.factories) if (fa.status === 'active') upkeep += factoryUpkeep(fa);
  spend(upkeep, 'upkeep');
  const active = S.products.filter(p => p.status === 'active').length;
  spend((5e3 + 40e3 * active) * ecoNow() + 0.12 * (m.revenue + m.b2b), 'overhead');   // staff, software, support, offices
  // contract manufacturer line fees for every line that ran this month
  const usedMakers = new Set();
  for (const p of S.products) { if (p.lineUsed && p.lineMaker && p.lineMaker !== 'own') usedMakers.add(p.lineMaker + '|' + p.id); p.lineUsed = false; }
  let lines = 0;
  for (const k of usedMakers) lines += partnerById(k.split('|')[0]).lineFee * ecoNow() * 0.25;
  spend(lines, 'lines');
  spend(inventoryValue() * 0.012, 'overhead');
  spend(S.debt * loanRate() / 12 + Math.max(0, -S.cash) * 0.18 / 12, 'interest');
  // supply contracts
  for (const c of S.contracts) {
    const pay = c.delivered * c.price;
    S.cash += pay; m.b2b += pay;
    const short = c.qty - c.delivered;
    if (short > c.qty * 0.05) { const pen = short * c.price * 0.3; spend(pen, 'penalty'); addNews(`⚠️ Missed ${fmtNum(short)} ${c.label} for ${c.buyer}: ${fmtMoney(pen)} penalty.`, 'bad'); }
    c.delivered = 0; c.monthsLeft--;
  }
  S.contracts = S.contracts.filter(c => c.monthsLeft > 0);
  for (const id in S.licensed) if (t < TECH[id].market) { const l = S.licensed[id]; S.cash += l.monthly; m.b2b += l.monthly; }
  // spare factory capacity sold on the open market
  let spare = 0;
  for (const fa of S.factories) {
    if (fa.status === 'active' && fa.type !== 'rnd' && fa.sellSpare) {
      const free = Math.max(0, factoryCap(fa) - fa.used);
      const val = fa.type === 'fab' ? waferPrice(nodeByNm(fa.nm), t) * 0.35 : FACTORY_TYPES[fa.type].spare * ecoNow();
      spare += free * val * 0.25;
    }
    fa.usedLast = fa.used; fa.used = 0;
  }
  S.cash += spare; m.spare = spare;
  // battery incidents: aggressive cells occasionally catch fire
  for (const p of S.products) {
    if (p.status !== 'active' || !p.spec.battery || !p.producedMonth) continue;
    const bp = partParams(p.spec.battery), b = bp ? evalBattery(bp, t) : null;
    if (!b) continue;
    const pr = 1 - Math.exp(-b.risk * Math.sqrt(p.producedMonth / 1e6) * 0.01);
    if (Math.random() < pr) {
      const cost = Math.min(p.sold, p.producedMonth * 6) * Math.max(5, p.unitCostLast * 0.4);
      spend(cost, 'penalty');
      S.rep = Math.max(3, S.rep - 0.8);
      S.aware *= 0.94;
      addNews(`🔥 Battery fires reported in the ${p.name}! A recall costs ${fmtMoney(cost)} and hurts your reputation. Safer cells (Battery Lab) cut the risk.`, 'bad', true);
    }
  }
  // brand awareness
  const total = marketSize('phone', t) + marketSize('tablet', t);
  const mktRevenue = marketSize('phone', t) * segBudget('phone', 'mid', t) + marketSize('tablet', t) * segBudget('tablet', 'mid', t);
  const K = 0.012 * mktRevenue;
  let mk = perk('mkMul', 1);
  for (const id of ['biz_ads1', 'biz_ads2', 'biz_ads3']) if (S.researched[id]) mk *= 1.15;
  const eff = m.marketing * mk;
  const gain = 0.1 * eff / (eff + K);
  const wom = Math.min(0.012, 0.12 * m.units / Math.max(1, total)) * (S.rep / 7) * (S.researched.biz_influencer ? 1.2 : 1);
  S.aware = clamp(S.aware + (1 - S.aware) * (gain + wom) - 0.025 * S.aware, 0.003, 0.95);
  S.rep = S.rep + (6.5 - S.rep) * (S.researched.biz_service ? 0.02 : 0.01);
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
  if (S.shareHist.length > 700) S.shareHist.shift();
  const ph = share.phone;
  if (ph.you / ph.total >= 0.05) completeGoal('share5');
  if (ph.you > 0 && RIVALS.every(r => (ph[r.id] || 0) < ph.you)) completeGoal('top1');
  // benchmark crowns
  if (S.products.some(p => p.status === 'active') && benchLeaders().some(b => b.mine)) completeGoal('bench1');
  // close the books (22% corporate tax, losses carry forward)
  const pretax = m.revenue + m.b2b + m.spare - m.cogs - m.sold - m.upkeep - m.rnd - m.marketing - m.overhead - m.lines - m.interest - m.dev - m.penalty;
  let taxable = pretax;
  if (taxable > 0) { const use = Math.min(S.taxLoss, taxable); taxable -= use; S.taxLoss -= use; } else S.taxLoss -= taxable;
  m.tax = Math.max(0, taxable) * TAX_RATE;
  S.cash -= m.tax;
  const profit = pretax - m.tax;
  S.history.push(Object.assign({ t: t - 1 / 12, profit, cash: S.cash, worth: netWorth(), aware: S.aware, own: S.own }, m));
  if (S.history.length > 700) S.history.shift();
  S.products.forEach(p => { p.soldLastMonth = p.soldMonth; p.soldMonth = 0; p.producedLast = p.producedMonth || 0; p.producedMonth = 0; });
  S.month = emptyMonth();
  if (netWorth() >= 10e9) completeGoal('worth10b');
  // world news
  for (const tc of TECHS) if (!tc.never && t >= tc.market && t - 1 / 12 < tc.market && !S.researched[tc.id] && tc.k >= 1 && TECH_CATS[tc.cat].factory)
    addNews(`📈 Industry trend: ${tc.name} is now standard – research it to keep up.`, 'world');
  for (const n of NODES) if (t >= n.year && t - 1 / 12 < n.year) addNews(`💠 Foundries now offer the ${nodeLabel(n.nm)} process (${fmtMoney(n.wafer)}/wafer).`, 'world');
  for (const e of EVENTS) if (t >= e.start && t - 1 / 12 < e.start) addNews(`🌍 ${e.title}: ${e.desc}`, 'bad', true);
  for (const c of CARRIERS) for (const s in c.stds) {
    const [a, b] = c.stds[s];
    if (t >= a && t - 1 / 12 < a && c.share >= 0.3) addNews(`📡 ${c.name} (${REGIONS[c.region].name}) switch on ${NET_STDS[s].name}.`, 'world');
    if (b && t >= b - NET_SUNSET && t - 1 / 12 < b - NET_SUNSET && c.share >= 0.3) addNews(`📴 ${c.name} (${REGIONS[c.region].name}) begin shutting down ${NET_STDS[s].name}: phones that only support it will lose coverage.`, 'world');
  }
  generateOffers();
  rivalPricing();
  monthlyRefresh();
  emit('month');
  save();
}
// best phone on sale in each benchmark
const BENCH_KEYS = [['cpu', 'CPU', v => fmtSci(v)], ['gpu', 'Graphics', v => fmtSci(v)], ['cam', 'Camera', v => Math.round(v)], ['disp', 'Display', v => Math.round(v)],
  ['batt', 'Battery life', v => (v == null ? '∞ (car)' : v.toFixed(1) + ' h')], ['net', 'Network', v => fmtSpeed(v)], ['weight', 'Lightest', v => fmtWeight(v)]];
function benchLeaders() {
  const phones = S.rivalPhones.filter(r => r.active && r.cat === 'phone' && r.bench).map(r => ({ name: r.name, bench: r.bench, mine: false }))
    .concat(S.products.filter(p => p.status === 'active' && p.spec.cat === 'phone' && p.bench).map(p => ({ name: p.name, bench: p.bench, mine: true })));
  return BENCH_KEYS.map(([k]) => {
    let best = null;
    for (const ph of phones) {
      const v = ph.bench[k == null ? 0 : k];
      if (v == null || (k !== 'weight' && v <= 0)) continue;
      if (!best || (k === 'weight' ? v < best.v : v > best.v)) best = { v, name: ph.name, mine: ph.mine };
    }
    return Object.assign({ k }, best || {});
  });
}

// ---- Save / load ----------------------------------------------------------------------------
const serialize = () => JSON.stringify(S, (k, v) => (k === 'costs' ? undefined : v));
function save() { try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { return false; } }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadState(s) {
  if (!s || s.version !== 3) return false;
  S = s;
  monthlyRefresh();
  computeDemand(true);
  return true;
}
function load() { try { return loadState(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { return false; } }
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
function fmtSci(v) { if (!v) return '—'; if (v >= 100) return fmtNum(v); if (v >= 1) return v.toFixed(1); return v.toPrecision(2); }
function fmtSpeed(mbps) { if (!mbps) return 'voice only'; if (mbps >= 1000) return (mbps / 1000).toFixed(1) + ' Gbps'; if (mbps >= 1) return mbps.toFixed(mbps < 10 ? 1 : 0) + ' Mbps'; return Math.round(mbps * 1000) + ' kbps'; }
function fmtWeight(g) { return g >= 1000 ? (g / 1000).toFixed(1) + ' kg' : Math.round(g) + ' g'; }
