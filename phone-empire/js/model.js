'use strict';
// ============================================================================
//  Pure model: chip physics & economics, body geometry built around the parts,
//  layout ergonomics, full phone evaluation, benchmarks, smooth market
//  expectations (what buyers expect from a flagship in any month) and the
//  buyer appeal function. Nothing here touches the DOM or mutates game state.
// ============================================================================

// ---- Market timeline helpers ---------------------------------------------------
const formOf = spec => (spec.cat === 'tablet' ? 'slate' : spec.form);
function prefSize(form, t) {
  if (form === 'slate') return interp(TABLET_PREF, t);
  if (form === 'fold') return 7.6;
  if (form === 'touch') return interp(TOUCH_PREF, t);
  return interp(KEYPAD_PREF, t);
}
function sizeScore(form, size, t) {
  const d = size - prefSize(form, t);
  const sg = form === 'slate' ? [1.2, 2.0] : form === 'touch' ? [0.55, 1.0] : form === 'fold' ? [0.5, 0.8] : [0.3, 0.55];
  const s = d < 0 ? sg[0] : sg[1];
  return Math.exp(-(d / s) * (d / s));
}
const formAppeal = (form, t) => (t < FORMS[form].appeal[0][0] - 0.01 ? FORMS[form].appeal[0][1] * 0.8 : interp(FORMS[form].appeal, t));
function marketSize(cat, t) { return logInterp(MARKET_SIZE[cat], t) * eventMul('demand', t) * trendDemand(t); }
function segSplit(t) { return interp(SEG_SPLIT, t); }
const segBudget = (cat, seg, t) => interp(SEG_BUDGET[cat], t)[SEGMENTS.indexOf(seg)];
function regionShares(t) {
  const s = {}; let tot = 0;
  for (const r of REGION_ORDER) { s[r] = interp(REGIONS[r].share, t); tot += s[r]; }
  for (const r of REGION_ORDER) s[r] /= tot;
  return s;
}
function frontierNode(t, lag) {
  let i = -1;
  NODES.forEach((n, k) => { if (n.year <= t - 0.25) i = k; });
  return NODES[Math.max(0, i - (lag || 0))];
}
const archGenAt = okFn => { let g = 1; for (let k = 2; k <= ARCH_YEARS.length; k++) if (okFn('chip_arch' + k)) g = k; return g; };
const marketArchGen = t => archGenAt(id => t >= TECH[id].market);
function bestNetGen(okFn) { let g = 0; for (const s of NET_ORDER) if (okFn(NET_STDS[s].tech)) g = Math.max(g, NET_STDS[s].gen); return g; }
const integrationLevel = okFn => { let lv = 0; INTEGRATION.forEach(([id], i) => { if (i && okFn(id)) lv = i; }); return lv; };
const integrationFactor = lv => INTEGRATION.slice(0, lv + 1).reduce((a, x) => a * x[1], 1);

// ---- Silicon economics ----------------------------------------------------------
function waferPrice(node, t) {
  const age = t - node.year;
  let p = node.wafer;
  if (age < 1) p *= 1.25;
  else if (age > 3) p *= Math.max(0.45, Math.pow(0.92, age - 3));
  return p * eventMul('wafer', t);
}
function defectDensity(node, t) {             // defects per cm²
  const age = t - node.year;
  if (age < 0) return 0.6 + Math.min(0.6, -age * 0.3);
  return 0.07 + 0.45 * Math.exp(-age / 1.1);
}
function diesPerWafer(A, D) {                 // A in mm², D wafer diameter (mm)
  const r = (D || 300) / 2;
  return Math.max(1, Math.floor(Math.PI * r * r / A - Math.PI * 2 * r / Math.sqrt(2 * A)));
}
function chipEconomics(area, nm, t) {
  const node = nodeByNm(nm);
  const dpw = diesPerWafer(area, node.waferD);
  const D0 = defectDensity(node, t);
  const yld = Math.exp(-(area / 100) * D0);   // Poisson yield model
  const good = Math.max(1, dpw * yld);
  const wp = waferPrice(node, t);
  const pack = (1.5 + area * 0.015) * (t < 1990 ? 1 + (1990 - t) * 0.08 : 1);
  const ip = 2.5 * (t < 1995 ? 0.4 : 1);
  return { dpw, D0, yield: yld, good, waferPrice: wp, pack, ip,
    foundry: wp / good + pack + ip, own: node.wafer * 0.30 / good + pack + ip, ownWafer: node.wafer * 0.30 };
}

// ---- Chip performance ----------------------------------------------------------
function blockPower(type, node, clock) {
  const fRel = clock / node.fnom, fb = node.fnom / 0.45, p = node.pwr;
  const nmos = 0.06 * Math.max(0, p - 1.6);   // early NMOS logic burns power even when idle
  switch (type) {
    case 'pcore': return 0.25 * fb * p * Math.pow(fRel, 3) + nmos;
    case 'ecore': return 0.05 * Math.pow(fb, 0.8) * p + nmos * 0.5;
    case 'gpu':   return 0.25 * Math.pow(fb, 0.8) * p * fRel * fRel + nmos;
    case 'npu':   return 0.12 * Math.pow(fb, 0.8) * p + nmos;
    case 'isp':   return 0.05 * Math.pow(fb, 0.6) * p + nmos * 0.5;
    case 'dsp':   return 0.06 * Math.pow(fb, 0.6) * p + nmos * 0.6;
    case 'modem': return 0.3 * p * (node.year < 2000 ? 0.6 : 1) + nmos;
    case 'io':    return 0.08 * Math.pow(fb, 0.5) * p + nmos * 0.5;
    case 'cache': return 0.01 + nmos * 0.2;
    case 'media': return 0.04 * Math.pow(fb, 0.5) * p + nmos * 0.5;
  }
  return 0;
}
// units: [{type, adj (cache cells touching), valid}]
function evalChipCore(c) {
  const node = nodeByNm(c.nm);
  const ipc = Math.pow(1.12, c.arch - 1) * (c.b64 ? 1.15 : 1) * (c.b3d ? 1.12 : 1);
  const ds = node.density / 1.5;
  const fRel = c.clock / node.fnom;
  const live = c.units.filter(u => u.valid !== false);
  const n = type => live.filter(u => u.type === type).length;
  const ioN = n('io');
  const bwGpu = ioN >= 3 ? 1.05 : ioN === 2 ? 1 : ioN === 1 ? 0.8 : 0;
  const bwCpu = ioN >= 2 ? 1 : ioN === 1 ? 0.93 : 0;
  const hotFactor = c.hotT > 90 ? Math.max(0.5, 1 - (c.hotT - 90) * 0.02) : 1;
  const cores = [];
  let gpu = 0, tops = 0, isp = 0, power = 0;
  for (const u of c.units) power += blockPower(u.type, node, c.clock);
  if (c.dvfs) power *= 0.85;
  for (const u of live) {
    const adj = u.adj || 0;
    if (u.type === 'pcore') cores.push(100 * ipc * Math.pow(ds, 0.35) * c.clock * (1 + 0.10 * Math.min(adj, 4)) * bwCpu);
    else if (u.type === 'ecore') cores.push(33 * ipc * Math.pow(ds, 0.35) * node.fnom * 0.8 * (1 + 0.06 * Math.min(adj, 3)) * bwCpu);
    else if (u.type === 'gpu') gpu += 1.2 * Math.pow(ds, 0.9) * Math.sqrt(node.fnom / 0.45) * Math.sqrt(ipc) * fRel * (1 + 0.04 * Math.min(adj, 5)) * bwGpu * (c.brt ? 1.2 : 1);
    else if (u.type === 'npu') tops += 0.004 * Math.pow(node.density, 1.35) * ipc * (1 + 0.04 * Math.min(adj, 3));
    else if (u.type === 'isp') isp += 0.1 * Math.pow(node.density, 0.6) * Math.pow(ipc, 0.3);
  }
  cores.sort((a, b) => b - a);
  let cpu = 0;
  cores.forEach((p, i) => { cpu += p * Math.pow(0.85, i); });
  const modemGen = n('modem') ? c.modemGen : 0;
  const fill = c.fill == null ? 0.8 : c.fill;
  return {
    nm: c.nm, arch: c.arch, clock: c.clock, area: c.area,
    cpu: cpu * hotFactor, single: (cores[0] || 0) * hotFactor, gpu: gpu * hotFactor, tops, isp, power,
    hotT: c.hotT, hotFactor, modemGen, hasModem: n('modem') > 0, dsp: n('dsp') > 0, media: n('media') > 0,
    pCores: n('pcore'), eCores: n('ecore'), ioN,
    transistors: c.area * node.density * (0.35 + 0.65 * fill) / 1000, // billions
  };
}
// ---- Processor designer (Parts Lab → Processor) ------------------------------------
// cfg = {nm, clk (× the node's nominal clock), n: {block: count}, b64, b3d, brt, dvfs}
const CHIP_LIMITS = { pcore: [1, 12], ecore: [0, 16], cache: [1, 32], dsp: [0, 2], gpu: [0, 24], npu: [0, 8], isp: [0, 4], modem: [0, 1], io: [1, 4], media: [0, 2] };
const RETICLE_MM2 = 820;          // the biggest die a lithography scanner can print
// only some dies on a wafer run fast: clocking above nominal means paying for the ones that don't
const binYield = clk => (clk <= 0.95 ? 1 : Math.exp(-Math.pow((clk - 0.95) / 0.16, 2)));
function evalProcessor(cfg, okFn, t) {
  const node = nodeByNm(cfg.nm), n = cfg.n || {}, clk = clamp(cfg.clk || 1, 0.6, 1.25);
  const clock = node.fnom * clk, issues = [];
  // cache shared out over the blocks that use it (like cache cells touching them on a floorplan)
  const hungry = (n.pcore || 0) + (n.ecore || 0) + (n.gpu || 0) + (n.npu || 0);
  const feed = Math.min(1.2, (n.cache || 0) / Math.max(1, hungry * 0.75));
  const adjOf = { pcore: 2, ecore: 1, gpu: 2, npu: 1 };
  const units = [];
  let cells = 0;
  for (const type of BLOCK_ORDER) for (let k = 0; k < (n[type] || 0); k++) {
    units.push({ type, adj: (adjOf[type] || 0) * feed, valid: true });
    cells += BLOCKS[type].w * BLOCKS[type].h;
  }
  const area = Math.max(4, Math.round(cells * CELL_MM2 * 1.25));
  // hotspot: the hottest block type dominates, the die average adds to it
  let pTot = 0, pHot = 0;
  const dv = cfg.dvfs ? 0.85 : 1;
  for (const u of units) {
    const pw = blockPower(u.type, node, clock) * dv;
    pTot += pw; pHot = Math.max(pHot, pw / (BLOCKS[u.type].w * BLOCKS[u.type].h));
  }
  const hotT = 30 + 150 * (0.55 * pHot + 0.45 * pTot / Math.max(1, cells));
  const modemGen = n.modem ? bestNetGen(okFn) : 0;
  const core = evalChipCore({ nm: cfg.nm, arch: archGenAt(okFn), clock, area, units, hotT, modemGen, fill: 0.85,
    b64: !!cfg.b64 && okFn('chip_64'), b3d: !!cfg.b3d && okFn('chip_3d'), brt: !!cfg.brt && okFn('chip_rt'), dvfs: !!cfg.dvfs && okFn('chip_dvfs') });
  const bin = binYield(clk);
  if (area > RETICLE_MM2) issues.push({ err: true, text: `${area} mm² is bigger than a lithography reticle (${RETICLE_MM2} mm²) – it can't be printed.` });
  else if (area > 350) issues.push({ err: false, text: `A ${area} mm² die: few come out of a wafer and most have a defect.` });
  if (t >= 1998 && !n.modem) issues.push({ err: false, text: 'No integrated baseband: phones using this chip need a separate baseband chip (+cost, +power).' });
  if (t >= 1991 && t < 1999 && !n.dsp && !n.modem) issues.push({ err: false, text: 'No DSP: digital phones using this chip need a separate DSP chip.' });
  if (t >= 2003 && !n.isp) issues.push({ err: false, text: 'No ISP: camera phones using this chip get poor photos.' });
  if (t >= 2006 && !n.gpu) issues.push({ err: false, text: 'No GPU: smartphone UIs and games will crawl.' });
  if (hotT > 90) issues.push({ err: false, text: `Hotspot ${Math.round(hotT)}°C: the chip throttles. Fewer big cores, a lower clock or a newer node.` });
  if (bin < 0.5) issues.push({ err: false, text: `Only ${Math.round(bin * 100)}% of dies reach ${clk.toFixed(2)}× the nominal clock – you pay for the rest.` });
  return Object.assign(core, { issues, ok: !issues.some(i => i.err), fill: 0.85, units, cells, bin, clk });
}
// what one good, packaged chip costs (foundry or your own fab), including clock binning
function processorCost(stats, t) {
  const e = chipEconomics(stats.area, stats.nm, t), bin = stats.bin || 1;
  return { e, bin, foundry: e.waferPrice / (e.good * bin) + e.pack + e.ip, own: e.ownWafer / (e.good * bin) + e.pack + e.ip, wafers: 1 / (e.good * bin) };
}

// ---- Off-the-shelf SoCs ------------------------------------------------------------
const marketNetGen = t => bestNetGen(id => !id || t >= TECH[id].market);
function vendorChipCounts(tier, tr) {
  const yrs = Math.max(0, tr - 2008), little = tr >= 2011.5;
  const lagGen = { flagship: 0, mid: 1, budget: 2 }[tier];
  const modemGen = tr >= 1997 ? marketNetGen(tr - lagGen) : 0;
  const dsp = tr >= 1990 && tr < 1997 ? 1 : 0;
  if (tr < 1997) return { pcore: 1, cache: tr >= 1988 ? 2 : 1, io: 1, dsp, modemGen: 0 };
  const flagGpu = tr < 2004 ? 0 : Math.min(5, 1 + Math.floor(yrs / 5));
  if (tier === 'flagship') return {
    pcore: tr < 2010 ? 1 : tr < 2012 ? 2 : 4, ecore: little ? 4 : 0, gpu: flagGpu, cache: tr < 2004 ? 2 + (tr >= 2001 ? 1 : 0) : 5 + Math.floor(yrs / 4),
    npu: tr >= 2021 ? 2 : tr >= 2017.7 ? 1 : 0, isp: tr < 2002 ? 0 : tr < 2006 ? 1 : 2, io: tr >= 2010 ? 2 : 1, modem: 1, media: tr >= 2004.5 ? 1 : 0, modemGen };
  if (tier === 'mid') return {
    pcore: tr < 2011 ? 1 : 2, ecore: little ? (tr >= 2015 ? 6 : 4) : 0, gpu: tr < 2006 ? 0 : Math.max(1, flagGpu - 1), cache: 2 + Math.floor(yrs / 5),
    npu: tr >= 2019 ? 1 : 0, isp: tr >= 2003 ? 1 : 0, io: tr >= 2016 ? 2 : 1, modem: 1, media: tr >= 2014 ? 1 : 0, modemGen };
  return {
    pcore: tr < 2018 ? 1 : 2, ecore: little ? 4 : 0, gpu: tr < 2009 ? 0 : 1, cache: tr < 2005 ? 1 : 2, npu: tr >= 2021 ? 1 : 0,
    isp: tr >= 2005 ? 1 : 0, io: 1, modem: 1, media: 0, modemGen };
}
const VENDOR_CHIPS = [];
(function buildVendorChips() {
  const assumedAdj = { pcore: 2, ecore: 1, gpu: 2, npu: 1 };
  for (let y = 1971; y <= 2060; y++) {
    for (const v of VENDORS) {
      v.tiers.forEach((tier, ti) => {
        const tr = y + (v.month + ti * 0.4) / 12;
        if (tr < 1994 && v.id !== 'quasar') return;        // one logic-chip maker in the early days
        const lag = { flagship: 0, mid: 1, budget: 2 }[tier];
        const node = frontierNode(tr, tr < 1995 ? lag + 1 : lag);
        const arch = Math.max(1, marketArchGen(tr) - lag);
        const counts = vendorChipCounts(tier, tr);
        const units = [];
        let cells = 0;
        for (const type of BLOCK_ORDER) {
          for (let k = 0; k < (counts[type] || 0); k++) {
            units.push({ type, adj: assumedAdj[type] || 0, valid: true });
            cells += BLOCKS[type].w * BLOCKS[type].h;
          }
        }
        const area = Math.round(cells * CELL_MM2 * 1.25);
        const clock = +(node.fnom * ({ flagship: 1, mid: 0.95, budget: 0.88 }[tier])).toFixed(5);
        const st = evalChipCore({ nm: node.nm, arch, clock, area, units, hotT: 85, modemGen: counts.modemGen, fill: 0.8, b64: tr >= 2013.7, brt: tr >= 2023.3 && tier === 'flagship', dvfs: tr >= 1999 });
        const digit = { flagship: 8, mid: 6, budget: 4 }[tier];
        VENDOR_CHIPS.push(Object.assign(st, {
          id: `${v.id}-${y}-${tier}`, kind: 'vendor', vendor: v.name, tier, release: tr,
          name: `${v.name} ${v.series} ${digit}${String(y).slice(2)}`, counts,
        }));
      });
    }
  }
  VENDOR_CHIPS.sort((a, b) => a.release - b.release);
})();
const VENDOR_BY_ID = Object.fromEntries(VENDOR_CHIPS.map(c => [c.id, c]));
const vendorChipById = id => VENDOR_BY_ID[id];
function vendorChipsAvailable(t) { return VENDOR_CHIPS.filter(c => c.release <= t && t < c.release + 3.5); }
// What a chip vendor charges: the silicon at a modest margin, plus a premium for performance.
// The newest flagship carries most of that premium (a share of what premium phones sell for);
// slower and older chips get cheap fast. Your own chips pay only for the silicon.
const CHIP_PREMIUM = [[1973, 0.02], [1990, 0.03], [2000, 0.05], [2007, 0.075], [2012, 0.09], [2020, 0.1], [2040, 0.1]];
const TIER_PREMIUM = { flagship: 1, mid: 0.6, budget: 0.3 };
function vendorChipPrice(chip, t) {
  const e = chipEconomics(chip.area, chip.nm, t);
  const silicon = (e.waferPrice / e.good) * 1.5 + e.pack + { flagship: 4, mid: 3, budget: 2 }[chip.tier] * (t < 1995 ? 0.5 : 1);
  const rel = clamp(chip.cpu / Math.max(1e-12, frontierCpu(t)), 0, 1);
  const premium = interp(CHIP_PREMIUM, t) * segBudget('phone', 'premium', t) * TIER_PREMIUM[chip.tier] * Math.pow(rel, 1.4);
  return (silicon + premium) * eventMul('soc', t);
}
// a smooth curve of the best vendor CPU (log-interpolated over yearly peaks), so prices glide down
// instead of dropping the day a new flagship ships
const _frontier = [];
function frontierCpu(t) {
  if (!_frontier.length) for (let y = 1971; y <= 2061; y++) {
    let best = 1e-9;
    for (const c of VENDOR_CHIPS) if (c.tier === 'flagship' && c.release <= y + 1 && c.release > y - 2.5) best = Math.max(best, c.cpu);
    _frontier.push([y + 0.5, Math.max(best, _frontier.length ? _frontier[_frontier.length - 1][1] : 1e-9)]);
  }
  return logInterp(_frontier, t);
}
const _flagChip = new Map();
function flagshipChip(t) {
  const key = Math.floor(t * 12);
  if (_flagChip.has(key)) return _flagChip.get(key);
  let best = null;
  for (const c of vendorChipsAvailable(t)) if (c.tier === 'flagship' && (!best || c.cpu > best.cpu)) best = c;
  best = best || vendorChipsAvailable(t)[0] || VENDOR_CHIPS[0];
  _flagChip.set(key, best);
  return best;
}
function vendorChipFor(seg, t) {
  const chips = vendorChipsAvailable(t);
  const flags = chips.filter(c => c.tier === 'flagship').sort((a, b) => b.cpu - a.cpu);
  const pick = seg === 'ultra' ? flags[0] : seg === 'premium' ? (flags[1] || flags[0]) : chips.filter(c => c.tier === seg).sort((a, b) => b.cpu - a.cpu)[0] || flags[0];
  return pick || chips[0] || VENDOR_CHIPS[0];
}

// ============================================================================
//  LAYOUT: everything you can move around the body
// ============================================================================
// where an element type should exist for this spec (true = needed)
function layoutNeeds(spec, radioStats) {
  const f = formOf(spec), handset = !!FORMS[f].handset;
  const cams = spec.cams || {};
  const need = {
    earpiece: true, mic: true, speaker: true, power: f !== 'car', volume: f !== 'car' && f !== 'bag',
    port: spec.port !== 'none' && spec.port !== 'cord' && !handset, jack: spec.jack !== 'none', sim: !['none', 'esim'].includes(spec.sim), sd: !!spec.sd,
    cam: !!(cams.main || cams.ultra || cams.tele), flash: (spec.flash || 'none') !== 'none' && !!cams.main, fcam: !!cams.front,
    fp: spec.feat && spec.feat.fp === 'rear', antenna: !!(radioStats && radioStats.ext), logo: true,
    speaker2: !!(spec.feat && spec.feat.stereo), ir: !!(spec.feat && spec.feat.ir), stylus: !!(spec.feat && spec.feat.stylus),
  };
  for (const k of addonKeys(spec)) if (ADDONS[k].el) need[k] = true;
  return need;
}
// ---- add-ons ----
const LEGACY_ADDONS = ['camkey', 'action', 'led', 'lanyard'];   // older saves only had these as layout parts
function addonKeys(spec) {
  if (spec.addons) return Object.keys(spec.addons).filter(k => spec.addons[k] && ADDONS[k]);
  return [...new Set((spec.layout || []).map(e => e.t).filter(k => LEGACY_ADDONS.includes(k)))];
}
function addonCtx(spec) {
  const dp = partParams(spec.display), cams = spec.cams || {};
  return { form: formOf(spec), cam: !!cams.main, anycam: !!(cams.main || cams.front), sim: !['none', 'esim'].includes(spec.sim),
    color: !!(dp && dp.emit !== 'none' && dp.matrix !== 'segment' && (dp.color || DISP_EMIT[dp.emit].emissive)) };
}
// why an add-on can't go on this phone (null = it fits)
function addonProblem(k, ctx) {
  const A = ADDONS[k], f = ctx.form;
  if (!A) return 'unknown part';
  const handheld = f !== 'car' && f !== 'bag', touchForm = handheld && !isKeypadForm(f);
  if (A.forms === 'handheld' && !handheld) return 'not on a car or bag phone';
  if (A.forms === 'touch' && !touchForm) return 'needs a touch phone';
  if (A.forms === 'keypad' && !isKeypadForm(f)) return 'needs a keypad';
  if (A.forms === 'notflip' && !handheld) return 'not on a car or bag phone';
  if (A.forms === 'notflip' && f === 'flip') return 'a flip already has a cover display';
  if (A.needs === 'cam' && !ctx.cam) return 'needs a main camera';
  if (A.needs === 'anycam' && !ctx.anycam) return 'needs a camera';
  if (A.needs === 'color' && !ctx.color) return 'needs a color screen';
  if (A.needs === 'sim' && !ctx.sim) return 'needs a SIM card slot';
  return null;
}
// the add-on a newer one replaces (trackpad → trackball), if both are fitted
const addonReplaced = (k, keys) => Object.entries(ADDON_REPLACES).some(([n, o]) => o === k && keys.includes(n));
function defaultPlacement(type, spec) {
  const f = formOf(spec), touch = !isKeypadForm(f);
  switch (type) {
    case 'earpiece': return ['front', 0.5, f === 'flip' ? 0.97 : 0.955];
    case 'mic': return touch ? ['bottom', 0.32, 0.5] : ['front', 0.5, 0.035];
    case 'speaker': return touch ? ['bottom', 0.68, 0.5] : ['back', 0.5, 0.14];
    case 'speaker2': return ['top', 0.5, 0.5];
    case 'power': return touch ? ['right', 0.63, 0.5] : ['top', 0.3, 0.5];
    case 'volume': return ['left', 0.68, 0.5];
    case 'port': return ['bottom', 0.5, 0.5];
    case 'jack': return ['bottom', 0.22, 0.5];
    case 'sim': return ['full', 'mini'].includes(spec.sim) ? ['back', 0.5, 0.45] : ['right', 0.32, 0.5];
    case 'sd': return touch ? ['left', 0.3, 0.5] : ['left', 0.4, 0.5];
    case 'cam': return touch ? ['back', 0.22, 0.86] : ['back', 0.5, 0.82];
    case 'flash': return touch ? ['back', 0.42, 0.9] : ['back', 0.5, 0.7];
    case 'fcam': return ['front', touch ? 0.5 : 0.3, 0.955];
    case 'fp': return ['back', 0.5, 0.66];
    case 'antenna': return ['top', 0.82, 0.5];
    case 'logo': return ['back', 0.5, touch ? 0.42 : 0.35];
    case 'ir': return ['top', 0.5, 0.5];
    case 'stylus': return ['bottom', 0.86, 0.5];
    case 'camkey': return ['right', 0.18, 0.5];
    case 'action': return ['left', 0.85, 0.5];
    case 'led': return ['front', 0.82, 0.955];
    case 'lanyard': return ['bottom', 0.9, 0.5];
    case 'wheel': return ['right', 0.74, 0.5];
    case 'torch': return ['top', 0.5, 0.5];
    case 'ptt': return ['left', 0.5, 0.5];
    case 'tvant': return ['top', 0.12, 0.5];
    case 'sos': return ['back', 0.5, 0.74];
    case 'trackball': case 'trackpad': return ['front', 0.5, 0.3];
    case 'prox': return ['front', 0.82, 0.955];
    case 'mute': return ['left', 0.84, 0.5];
    case 'dualsim': return ['right', 0.18, 0.5];
    case 'solar': return ['back', 0.5, 0.28];
    case 'kickstand': return ['back', 0.5, 0.2];
    case 'hdmi': return ['top', 0.3, 0.5];
    case 'projector': return ['top', 0.62, 0.5];
    case 'irblast': return ['top', 0.78, 0.5];
    case 'frontspk': return ['front', 0.5, 0.03];
    case 'eink': return ['back', 0.5, 0.4];
    case 'hrm': return ['back', 0.5, 0.72];
    case 'uvsens': return ['back', 0.64, 0.78];
    case 'alertslider': return ['right', 0.82, 0.5];
    case 'backscreen': return ['back', 0.5, 0.55];
    case 'triggers': return ['right', 0.5, 0.5];
    case 'privacy': return ['left', 0.36, 0.5];
    case 'thermo': return ['back', 0.64, 0.86];
    case 'glyph': return ['back', 0.5, 0.5];
  }
  return ['back', 0.5, 0.5];
}
// add needed elements, drop ones the spec no longer has; keep everything the player moved
function syncLayout(spec, radioStats) {
  const need = layoutNeeds(spec, radioStats);
  const cur = Array.isArray(spec.layout) ? spec.layout : [];
  const out = [];
  for (const el of cur) {
    if (need[el.t] && LAYOUT_TYPES[el.t]) {
      if (!LAYOUT_TYPES[el.t].faces.includes(el.f)) { const [f, u, v] = defaultPlacement(el.t, spec); Object.assign(el, { f, u, v }); }
      out.push(el);
    }
  }
  for (const k in need) if (need[k] && !out.some(e => e.t === k)) {
    const [f, u, v] = defaultPlacement(k, spec);
    out.push({ t: k, f, u, v, auto: true });
  }
  spec.layout = out;
  return out;
}
// size (mm) of an element on its face for this spec
function layoutSize(el, spec, geo) {
  const lt = LAYOUT_TYPES[el.t];
  let w = lt.w, h = lt.h;
  if (el.t === 'port') { const p = PORTS[spec.port] || PORTS.barrel; w = p.w || 6; h = p.h || 3; }
  if (el.t === 'jack') { const j = JACKS[spec.jack] || JACKS.j35; w = h = j.d + 1.2; }
  if (el.t === 'sim') { const s = SIMS[spec.sim] || SIMS.nano; if (el.f === 'back') { w = s.w ? Math.max(15, s.w * 0.6) : 12; h = s.w ? s.w * 0.45 : 10; } else { w = s.w ? Math.min(s.w, 16) : 10; h = 2.4; } }
  if (el.t === 'cam' && geo && geo.camBox) { w = geo.camBox[0]; h = geo.camBox[1]; }
  if (el.t === 'antenna' && geo) { w = h = geo.antD || 8; }
  if (el.t === 'logo') { w = Math.min(26, (geo ? geo.W : 60) * 0.4); h = w * 0.28; }
  if (el.t === 'fp' && el.f === 'front') { w = 12; h = 8; }
  if (geo) {
    const W = geo.W, H = geo.H;
    if (el.t === 'solar') { w = Math.max(16, Math.min(W - 10, 56)); h = Math.max(12, H * 0.3); }
    if (el.t === 'eink') { w = Math.max(20, W - 10); h = Math.max(24, H * 0.58); }
    if (el.t === 'glyph') { w = Math.max(20, W * 0.72); h = Math.max(24, H * 0.6); }
    if (el.t === 'backscreen') { w = Math.max(18, Math.min(W * 0.62, 44)); h = w * 0.62; }
    if (el.t === 'kickstand') { w = Math.max(14, W * 0.6); }
    if (el.t === 'triggers') { w = Math.max(20, H * 0.7); }
  }
  if (el.t === 'earpiece' && geo && geo.screenRect && (geo.Hface || geo.H) - (geo.screenRect[1] + geo.screenRect[3]) < 4.5) { w = 12; h = 1.0; }
  return [w, h];
}
// face dimensions (mm): [width along u, height along v]. A flip's front is the open inner surface.
function faceDims(face, geo) {
  const W = geo.W, H = geo.H, T = geo.T;
  return face === 'front' ? [W, geo.Hface || H] : face === 'back' ? [W, H] : face === 'top' || face === 'bottom' ? [W, T] : [H, T];
}
// elements nobody has moved by hand go where an engineer would put them
function resolveLayout(spec, geo) {
  const lay = (spec.layout || []).map(e => Object.assign({}, e));
  const W = geo.W, Hf = geo.Hface || geo.H, H = geo.H;
  const sr = geo.screenRect, kr = geo.keypadRect;
  const dp = partParams(spec.display);
  const shape = dp ? dp.shape : 'bezel';
  const screenTop = sr ? sr[1] + sr[3] : Hf * 0.78;
  const topGap = Hf - screenTop;
  const earV = topGap >= 4.5 ? (screenTop + topGap / 2) / Hf : (Hf - 0.8) / Hf;
  const chinTop = kr ? kr[1] : sr ? sr[1] : Hf * 0.12;
  const cam = lay.find(e => e.t === 'cam');
  for (const el of lay) {
    if (el.auto === false) continue;
    switch (el.t) {
      case 'earpiece': el.f = 'front'; el.u = 0.5; el.v = earV; break;
      case 'fcam':
        el.f = 'front';
        if (sr && ['notch', 'punch', 'udc'].includes(shape)) { el.u = 0.5; el.v = (screenTop - 3.2) / Hf; }
        else { el.u = 0.5 - Math.min(0.3, 13 / W); el.v = earV; }
        break;
      case 'led':
        if (topGap < 4.5) { el.f = 'top'; el.u = 0.82; el.v = 0.5; }        // no forehead: the LED moves to the top edge
        else if (el.f === 'front') { el.u = 0.5 + Math.min(0.3, 13 / W); el.v = earV; }
        break;
      case 'mic': if (el.f === 'front') { el.u = 0.5; el.v = Math.max(1.6, chinTop / 2) / Hf; } break;
      case 'fp': if (el.f === 'front') { el.u = 0.5; el.v = Math.max(5, chinTop / 2) / Hf; } break;
      case 'cam':
        if (geo.camBox) {
          const [cw, ch] = geo.camBox;
          el.f = 'back';
          if (geo.kp) { el.u = 0.5; el.v = 1 - (ch / 2 + Math.min(14, H * 0.08)) / H; }
          else { el.u = (cw / 2 + 6) / W; el.v = 1 - (ch / 2 + 6) / H; }
        }
        break;
      case 'flash':
        if (cam && geo.camBox) {
          const [cw] = geo.camBox;
          el.f = 'back';
          if (geo.kp) { el.u = 0.5; el.v = cam.v - (geo.camBox[1] / 2 + 5) / H; }
          else { el.u = cam.u + (cw / 2 + 5) / W; el.v = cam.v + (geo.camBox[1] / 2 - 3) / H; }
        }
        break;
      case 'logo': if (el.f === 'back') { el.u = 0.5; el.v = geo.kp ? 0.32 : 0.42; } break;
      case 'prox': if (el.f === 'front') { el.u = 0.5 + Math.min(0.4, 19 / W); el.v = earV; } break;
      case 'trackball': case 'trackpad':
        el.f = 'front';
        if (kr) { el.u = (kr[0] + kr[2] / 2) / W; el.v = (kr[1] + kr[3] - (geo.kpNav ? 5 : 3.5)) / Hf; }   // the middle of the navigation keys
        else { el.u = geo.navRect ? 0.2 : 0.5; el.v = Math.max(3.5, chinTop / 2) / Hf; }
        break;
      case 'frontspk': if (el.f === 'front') { el.u = 0.5; el.v = Math.max(1.6, geo.navRect ? geo.navRect[1] / 2 : chinTop / 2) / Hf; } break;
    }
  }
  // nudge automatically placed edge/back elements off anything they collide with
  const placed = lay.filter(e => e.auto === false);
  const order = lay.filter(e => e.auto !== false).sort((a, b) => (LAYOUT_TYPES[a.t].cosmetic ? 1 : 0) - (LAYOUT_TYPES[b.t].cosmetic ? 1 : 0));
  for (const el of order) {
    if (el.f !== 'front' && !LAYOUT_TYPES[el.t].cosmetic) {
      const [fw] = faceDims(el.f, geo);
      const [w] = layoutSize(el, spec, geo);
      const lo = (w / 2 + 1) / fw, hi = 1 - lo;
      const hits = u => { const r = elementRect(Object.assign({}, el, { u }), spec, geo); return placed.some(o => o.f === el.f && !LAYOUT_TYPES[o.t].cosmetic && !(el.t === 'flash' && o.t === 'cam') && rectsOverlap(r, elementRect(o, spec, geo))); };
      if (hits(el.u)) {
        for (let k = 1; k <= 12; k++) {
          const c = [el.u + k * 0.06, el.u - k * 0.06].find(u => u >= lo && u <= hi && !hits(u));
          if (c != null) { el.u = c; break; }
        }
      }
    } else if (el.f !== 'front' && LAYOUT_TYPES[el.t].cosmetic) {
      // the logo steps up or down, out of the way of anything functional on its face
      const [, fh] = faceDims(el.f, geo);
      const [, h] = layoutSize(el, spec, geo);
      const lo = (h / 2 + 1) / fh, hi = 1 - lo;
      const hits = v => { const r = elementRect(Object.assign({}, el, { v }), spec, geo); return placed.some(o => o.f === el.f && !LAYOUT_TYPES[o.t].cosmetic && rectsOverlap(r, elementRect(o, spec, geo))); };
      if (hits(el.v)) {
        for (let k = 1; k <= 16; k++) {
          const c = [el.v - k * 0.04, el.v + k * 0.04].find(v => v >= lo && v <= hi && !hits(v));
          if (c != null) { el.v = c; break; }
        }
      }
    }
    placed.push(el);
  }
  return lay;
}
// keep-out zones on the front face (in mm, origin bottom-left): screen and keypad
function frontKeepOut(geo) {
  const z = [];
  if (geo.screenRect) z.push({ name: 'screen', r: geo.screenRect });
  if (geo.keypadRect) z.push({ name: 'keypad', r: geo.keypadRect });
  if (geo.navRect) z.push({ name: 'home button', r: geo.navRect });
  return z;
}
const rectsOverlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
function elementRect(el, spec, geo) {
  const [fw, fh] = faceDims(el.f, geo);
  const [w, h] = layoutSize(el, spec, geo);
  return [el.u * fw - w / 2, el.v * fh - h / 2, w, h];
}
// ergonomics: 1.0 = textbook layout. Returns {score, notes:[...], errors:[...], bad:{index:true}}
function evalLayout(spec, geo, lay) {
  lay = lay || resolveLayout(spec, geo);
  const errors = [], notes = [], bad = {};
  let pen = 0;
  const shape = spec.display && partParams(spec.display) ? partParams(spec.display).shape : 'bezel';
  lay.forEach((el, i) => {
    const lt = LAYOUT_TYPES[el.t];
    if (!lt) return;
    const [fw, fh] = faceDims(el.f, geo);
    const r = elementRect(el, spec, geo);
    // must fit on its face
    if (r[0] < -0.01 || r[1] < -0.01 || r[0] + r[2] > fw + 0.01 || r[1] + r[3] > fh + 0.01) {
      if (r[3] > fh) errors.push(`${lt.name} is ${r[3].toFixed(1)} mm tall – it does not fit on a ${fh.toFixed(1)} mm ${el.f} edge. Make the body thicker or move it.`);
      else errors.push(`${lt.name} sticks out past the ${el.f} edge.`);
      bad[i] = true;
    }
    if (el.f === 'front') {
      for (const z of frontKeepOut(geo)) {
        if (!rectsOverlap(r, z.r)) continue;
        if (z.name === 'screen' && el.t === 'fcam' && ['notch', 'punch', 'udc'].includes(shape)) continue;
        if (z.name === 'screen' && el.t === 'earpiece' && ['notch', 'punch', 'udc', 'slim'].includes(shape) && r[1] + r[3] > z.r[1] + z.r[3] - 2) continue;
        if (z.name === 'home button' && el.t === 'fp') continue;   // a fingerprint reader in the home button
        if (z.name === 'screen' && el.t === 'prox') continue;       // proximity sensors work under the glass
        if (z.name === 'keypad' && (el.t === 'trackball' || el.t === 'trackpad') && geo.kpNav && r[1] >= z.r[1] + z.r[3] - 12) continue;   // in the navigation keys
        errors.push(`${lt.name} overlaps the ${z.name}.`); bad[i] = true;
      }
    }
    for (let j = 0; j < i; j++) {
      const o = lay[j];
      if (o.f !== el.f || !LAYOUT_TYPES[o.t]) continue;
      if (lt.cosmetic || LAYOUT_TYPES[o.t].cosmetic) continue;
      if (el.t === 'flash' && o.t === 'cam' || el.t === 'cam' && o.t === 'flash') continue;
      if (rectsOverlap(r, elementRect(o, spec, geo))) { errors.push(`${lt.name} overlaps the ${LAYOUT_TYPES[o.t].name.toLowerCase()}.`); bad[i] = true; }
    }
    // distance from the ideal spot (mm)
    const ideal = lt.ideal[el.f];
    if (!lt.cosmetic && el.auto === false) {
      let d;
      if (ideal) d = Math.hypot((el.u - ideal[0]) * fw, (el.v - ideal[1]) * fh);
      else d = 30;                                         // an unusual face for this element
      const wgt = { cam: 1.4, earpiece: 1.2, mic: 1.0, power: 1.0, port: 0.8, volume: 0.6, fp: 1.0, speaker: 0.5, antenna: 0.6 }[el.t] || 0.3;
      pen += wgt * Math.min(1, Math.max(0, d - 6) / 45) * 0.05;
    }
    // specific realities
    if (el.t === 'cam' && el.f === 'back' && el.v < 0.45) { notes.push('− rear camera sits where your palm covers it'); pen += 0.05; }
    if (el.t === 'port' && (el.f === 'left' || el.f === 'right')) { notes.push('− charging cable digs into your hand'); pen += 0.03; }
    if (el.t === 'port' && el.f === 'back') { notes.push('− charging port on the back: the phone can\'t lie flat while charging'); pen += 0.03; }
    if (el.t === 'power' && el.f === 'top' && geo.H > 135) { notes.push('− power key out of thumb reach on a tall phone'); pen += 0.03; }
    if (el.t === 'speaker' && el.f === 'back') pen += 0.005;
    if (el.t === 'jack' && el.f !== 'top' && el.f !== 'bottom') { notes.push('− headphone cable sticks out the side'); pen += 0.02; }
  });
  // earpiece ↔ microphone distance: calls need mouth-to-ear spacing
  const ear = lay.find(e => e.t === 'earpiece'), mic = lay.find(e => e.t === 'mic');
  if (ear && mic) {
    const yOf = e => (e.f === 'front' || e.f === 'back' ? e.v * (geo.Hface || geo.H) : e.f === 'top' ? (geo.Hface || geo.H) : e.f === 'bottom' ? 0 : e.u * (geo.Hface || geo.H));
    const dist = Math.abs(yOf(ear) - yOf(mic));
    const needD = Math.min(95, 0.65 * (geo.Hface || geo.H));
    if (dist < needD) { notes.push('− mic too close to the earpiece: callers hear echoes'); pen += 0.08 * (1 - dist / needD); }
  }
  // headphone jack needs thickness; ports too
  const T = geo.T;
  const jack = JACKS[spec.jack];
  if (jack && jack.minT > T + 0.01) errors.push(`A ${jack.name} needs a body at least ${jack.minT} mm thick (yours is ${T.toFixed(1)} mm).`);
  const port = PORTS[spec.port];
  if (port && port.minT > T + 0.01) errors.push(`${port.name} needs ${port.minT} mm of thickness (yours is ${T.toFixed(1)} mm).`);
  if (spec.feat && spec.feat.fp === 'side' && !lay.some(e => e.t === 'power' && (e.f === 'right' || e.f === 'left'))) errors.push('A power-key fingerprint reader needs the power key on a side edge.');
  return { score: clamp(1 - pen, 0.6, 1.02), notes: [...new Set(notes)], errors: [...new Set(errors)], bad };
}

// ============================================================================
//  PHONE EVALUATION
// ============================================================================
const FILL = [[1973, 0.6], [1990, 0.7], [2005, 0.78], [2015, 0.82], [2040, 0.85]];
const ELEC_DENSITY = [[1973, 0.62], [1990, 0.9], [2005, 1.3], [2015, 1.5], [2040, 1.6]];
const BASE_POWER = [[1973, 1.2], [1983, 0.45], [1990, 0.18], [1996, 0.1], [2005, 0.07], [2015, 0.06], [2040, 0.05]];
// How thick designers of each era let a body get before they make it taller instead (mm; for flips the
// keypad half), and how tall it may get. Forms without an entry use their fixed maxT/maxH.
const FORM_FIT = {
  candybar: { t: [[1991, 30], [1996, 26], [2000, 22], [2005, 17], [2009, 13], [2013, 11]], h: [[1991, 190], [1995, 160], [2000, 135], [2010, 125]] },
  flip:     { t: [[1989, 24], [1996, 13], [2002, 13], [2004, 9], [2009, 8]], h: [[1989, 135], [1996, 110], [2002, 100], [2004, 115], [2010, 112]] },
  qwerty:   { t: [[2002, 20], [2006, 16], [2009, 14], [2012, 11]], h: [[2002, 125], [2008, 118]] },
  slider:   { t: [[2004, 21], [2007, 17], [2010, 14]], h: [[2004, 110], [2010, 115]] },
};
function formFit(form, t, G) {
  const f = FORM_FIT[form];
  return f ? { maxT: interp(f.t, t), maxH: interp(f.h, t) } : { maxT: G.maxT, maxH: G.maxH };
}
// fit a body around `internal` cm³: grow thickness up to maxT, then height up to maxH, then thickness again
function fitBody(W, H0, internal, stackT, G, fill, fit) {
  const maxT = fit ? fit.maxT : G.maxT, maxH = fit ? fit.maxH : G.maxH;
  const T0 = internal * 1000 / (W * H0 * fill) + stackT;
  if (T0 <= maxT) return [H0, Math.max(G.minT, T0)];
  const Hg = internal * 1000 / (W * Math.max(1, maxT - stackT) * fill);
  if (!maxH || Hg <= maxH) return [Math.max(H0, Hg), maxT];
  return [Math.max(H0, maxH), internal * 1000 / (W * maxH * fill) + stackT];
}
function camsList(spec) {
  const c = spec.cams || {};
  return ['main', 'ultra', 'tele', 'front'].filter(k => c[k]).map(k => [k, c[k]]);
}
// classic touch-phone bezels shrank every year (mm above/below the screen, and at the sides)
const TOUCH_BEZEL = [[2007, 18], [2010, 17], [2013, 15], [2016, 12.5], [2019, 10], [2023, 9]];
const TOUCH_SIDE = [[2007, 4.5], [2012, 4], [2016, 3.2], [2020, 2.6]];
function shapeBezels(shape, geoForm, t, form) {
  const b = form === 'touch' && t ? interp(TOUCH_BEZEL, t) : null;
  const side = b ? interp(TOUCH_SIDE, t) : geoForm.side, fore = b || geoForm.fore, chin = b || geoForm.chin;
  switch (shape) {
    case 'slim': return [2.2, 6, 6];
    case 'notch': return [2, 3.5, 5];
    case 'punch': return [1.8, 3, 4];
    case 'udc': return [1.6, 2.5, 3.2];
    case 'curved': return [0.9, fore * 0.8, chin * 0.8];
  }
  return [side, fore, chin];
}
// home button and navigation keys of a touch phone. 'auto' is what an engineer of the era would fit.
function navOf(spec, t, form, shape) {
  if (form !== 'touch' && form !== 'slate') return { home: 'none', keys: 'none', chin: 0 };
  const n = spec.nav || {};
  let home = NAV_HOME[n.home] ? n.home : 'auto', keys = NAV_KEYS[n.keys] ? n.keys : 'auto';
  if (home === 'auto') home = shape === 'bezel' && form === 'touch' && t >= techMarket('nav_home') ? 'physical' : 'none';
  if (keys === 'auto') keys = home !== 'none' ? 'none' : t >= techMarket('nav_gesture') ? 'gesture' : t >= techMarket('nav_onscreen') ? 'onscreen' : t >= techMarket('nav_capkeys') ? 'capacitive' : 'onscreen';
  if (home === 'none' && keys === 'none') keys = 'onscreen';
  return { home, keys, chin: Math.max(NAV_HOME[home].chin, NAV_KEYS[keys].chin) };
}
// Everything the UI and sim need to know about a design at time t.
// chip: stats of a vendor or custom chip.
function evalPhone(spec, t, chip) {
  const form = formOf(spec), F = FORMS[form], G = F.geo, cat = CATS[spec.cat];
  const mat = MATERIALS[spec.body.mat] || MATERIALS.plastic, fin = FINISHES[spec.body.finish] || FINISHES.gloss, water = WATER[spec.body.water] || WATER.none;
  const issues = [], notes = [];
  // ---- parts ----
  const dp = partParams(spec.display), disp = evalDisplay(dp, t);
  const camStats = {};
  for (const [k, ref] of camsList(spec)) { const p = partParams(ref); if (p) camStats[k] = evalCamera(p, t, k); }
  const bp = form === 'car' ? null : partParams(spec.battery), bat = bp ? evalBattery(bp, t) : null;
  const mp = partParams(spec.memory), mem = mp ? evalMemory(mp, t) : evalMemory({ gen: 'sram', ramDie: 0, ramN: 1, flDie: 0, flN: 0, cell: 'slc', iface: 'par', stack: 1 }, t);
  const rp = partParams(spec.radio);
  const radioGen = rp ? Math.max(0, ...rp.stds.map(s => NET_STDS[s].gen)) : 0;
  const integrated = !!(chip && chip.hasModem && chip.modemGen >= radioGen && radioGen >= 1);
  const radio = rp ? evalRadio(rp, t, integrated) : null;
  if (!radio) issues.push('Add a radio module.');
  if (rp && rp.stds.includes('imts') && form !== 'car' && form !== 'bag') issues.push('IMTS needs a 20 W transmitter – only car and bag phones can carry one. Use a cellular standard.');
  // missing DSP for digital radio
  const needDsp = radioGen >= 2 && chip && !chip.dsp && !chip.hasModem;
  // ---- electronics volume (cm³) ----
  const lv = spec.int == null ? 0 : spec.int;
  const intF = integrationFactor(lv);
  let elec = ELECTRONICS_BASE * intF * (radio ? radio.vol : 1) * (integrated ? 0.92 : 1) + (needDsp ? 6 * intF * 10 : 0);
  elec += mem.volume + (chip ? chip.area * 0.004 + 0.3 : 0.5);
  let extraVol = 0, extraW = 0;
  const feat = spec.feat || {};
  for (const [key, , , , , vol] of EXTRAS) if (feat[key]) { extraVol += vol; extraW += vol * 1.5; }
  // add-ons: they always take room, weight and money; they only count when the phone can use them
  const actx = addonCtx(spec), addonList = addonKeys(spec), addons = [];
  let addPts = 0, addDesign = 1, addPower = 0, addCost = 0;
  for (const k of addonList) {
    const A = ADDONS[k];
    extraVol += A.vol; extraW += A.wt;
    addCost += A.cost * decl(0.08, techMarket(A.tech), t, 0.3);
    const why = addonProblem(k, actx);
    if (why) { issues.push(`${A.name}: ${why}.`); continue; }
    if (addonReplaced(k, addonList)) continue;
    addPts += A.pts; addDesign *= A.design || 1; addPower += A.power || 0; addons.push(k);
  }
  const sim = SIMS[spec.sim] || SIMS.none;
  extraVol += sim.vol + (spec.sd ? 0.6 : 0) + (JACKS[spec.jack] ? JACKS[spec.jack].d * 0.15 : 0) + 1.2 /* speaker + mic */ + (F.kp ? 1.5 : 0);
  let camVol = 0, camW = 0, camZ = 0, rearCams = 0;
  for (const k in camStats) {
    const c = camStats[k];
    camVol += c.footprint[0] * c.footprint[1] * c.z / 1000;
    camW += c.weight;
    if (k !== 'front') { camZ = Math.max(camZ, c.z); rearCams++; }
  }
  const flash = FLASHES[spec.flash || 'none'];
  extraVol += flash.vol || (flash.cost ? 0.1 : 0);
  const batVol = bat ? bat.volume : 0;
  const handset = !!F.handset;
  const internal = (handset ? 0 : elec + batVol) + extraVol + camVol + (handset ? 8 : 0);   // cm³ inside the handheld body
  const fill = interp(FILL, t);
  // ---- body geometry (mm) ----
  const shape = dp ? dp.shape : 'bezel';
  const db = disp.none ? 0 : disp.seg ? 3 : dp.matrix === 'passive' ? 2.5 : 1.5;
  const mw = disp.w + 2 * db, mh = disp.h + 2 * db;
  const dStack = disp.none ? 0.8 : disp.stack;
  const shellT = mat.wall + 0.6;
  const nav = F.kp && !disp.none && !disp.seg ? 10 : 0;
  let W, H, T, Hface, screenRect = null, keypadRect = null, openH = 0, stackUsed = dStack + shellT, lidT = 0;
  // custom body size (mm, 0 = fit the parts): a wider or taller body spreads the same parts thinner,
  // extra thickness leaves spare room, and keypads grow with the body
  const sz = spec.size || {}, wantW = +sz.w || 0, wantH = +sz.h || 0, wantT = +sz.t || 0;
  // where the player dragged the screen and keypad (mm from their default spots, +y = up). Moving one
  // towards an edge shrinks that margin down to a minimum; pushing them into each other grows the body.
  const pl = spec.place || {}, sx = +pl.sx || 0, sy = +pl.sy || 0, kx = +pl.kx || 0, ky = +pl.ky || 0;
  const navk = navOf(spec, t, form, shape);
  let kpW = G.kpW, kpH = G.kpH + nav, autoW, autoH, foreP = G.fore, chinP = 0;
  const growKeys = (W0, H0) => {
    if (!F.kp) return;
    kpW = Math.min(G.kpW * 1.35, G.kpW + 0.7 * Math.max(0, W - W0));
    kpH = Math.min((G.kpH + nav) * 1.3, G.kpH + nav + 0.4 * Math.max(0, H - H0));
  };
  const fit = formFit(form, t, G);
  if (form === 'car' || form === 'bag') {
    autoW = Math.max(G.minW, mw + 2 * G.side, kpW + 2 * G.side);
    foreP = Math.max(4, G.fore - sy); chinP = Math.max(3, G.chin + 2 + ky);
    autoH = Math.max(G.fore + mh + 6 + kpH + G.chin, foreP + mh + 2 + kpH + chinP);
    W = Math.max(autoW, wantW); H = Math.max(autoH, wantH);
    growKeys(autoW, autoH);
    T = G.minT;
  } else if (form === 'brick' || form === 'candybar' || form === 'qwerty' || form === 'slider') {
    const sliderBody = form === 'slider';
    autoW = Math.max(G.minW, mw + 2 * G.side, (sliderBody ? 0 : kpW) + 2 * G.side);
    foreP = Math.max(3, G.fore - sy);
    let H0;
    if (sliderBody) { chinP = Math.max(2, G.chin + 4 + sy); H0 = Math.max(G.fore + mh + G.chin + 4, foreP + mh + chinP); }
    else { chinP = Math.max(2, G.chin + 2 + ky); H0 = Math.max(G.fore + mh + 5 + kpH + G.chin, foreP + mh + 1.5 + kpH + chinP); }
    W = Math.max(autoW, wantW);
    const stackT = Math.max(dStack, F.kp ? 2.5 : 0) + shellT + (sliderBody ? 3.5 : 0);
    [autoH] = fitBody(autoW, H0, internal, stackT, G, fill, fit);
    [H, T] = fitBody(W, Math.max(H0, wantH), internal, stackT, G, fill, fit);
    if (!sliderBody) growKeys(autoW, Math.max(H0, autoH));
    stackUsed = stackT;
  } else if (form === 'flip') {
    autoW = Math.max(G.minW, mw + 2 * G.side, kpW + 2 * G.side);
    W = Math.max(autoW, wantW);
    foreP = Math.max(3, G.fore - sy); chinP = Math.max(2, G.chin + 4 + ky);
    const Hmin = Math.max(G.fore + mh + 6, kpH + G.chin + 8, foreP + mh + 3, chinP + kpH + 3);
    // the lid holds the display, the earpiece and a little electronics; the keypad half the rest
    const lid = Math.min(internal * 0.25, 1.5 + internal * 0.08), base = internal - lid;
    [autoH] = fitBody(autoW, Hmin, base, 2 + shellT, G, fill, fit);
    const [H0, Tb] = fitBody(W, Math.max(Hmin, wantH), base, 2 + shellT, G, fill, fit);
    lidT = lid * 1000 / (W * H0 * fill) + dStack + shellT;
    H = H0; T = Math.max(G.minT, Tb + lidT); openH = H0 * 2;
    growKeys(autoW, autoH);
    stackUsed = 2 + shellT + dStack + shellT;
  } else {
    const [side, fore, chin] = shapeBezels(shape, G, t, form);
    // a home button or navigation keys need a chin; the screen can be moved up (bigger chin) or down
    const dy = form === 'fold' ? 0 : sy;
    foreP = Math.max(1.2, fore - dy); chinP = Math.max(1.2, navk.chin, Math.max(chin, navk.chin) + dy);
    autoW = Math.max(form === 'fold' ? 0 : 40, disp.w + 2 * side);
    autoH = disp.h + foreP + chinP;
    H = Math.max(autoH, wantH);
    if (form === 'fold') {
      const Wopen = Math.max(autoW, wantW * 2 - 2.4);
      const half = internal * 1000 / (Wopen * H * fill) + dStack + shellT + 0.6;
      autoW = autoW / 2 + 1.2;
      W = Wopen / 2 + 1.2; T = Math.max(G.minT * 2, 2 * half + 0.4);
      stackUsed = 2 * (dStack + shellT + 0.6) + 0.4;
    } else {
      W = Math.max(autoW, wantW);
      T = Math.max(G.minT, internal * 1000 / (W * H * fill) + dStack + shellT);
    }
  }
  const fitT = T;
  if (!F.handset && wantT > T) T = wantT;
  // ports & jacks set a minimum thickness
  const port = PORTS[spec.port] || PORTS.barrel, jack = JACKS[spec.jack] || JACKS.none;
  const needT = Math.max(port.minT || 0, jack.minT || 0);
  if (needT > T && !handset) { notes.push(`+${(needT - T).toFixed(1)} mm thicker to fit the ${needT === jack.minT ? jack.name : port.name}`); T = needT; }
  // room the parts don't use (cm³): a bigger battery would fit without growing the body
  const spareVol = handset ? 0 : Math.max(0, W * H * Math.max(0, T - stackUsed) * fill / 1000 * (form === 'fold' ? 2 : 1) - internal);
  // camera bump
  const inside = T - dStack - shellT + 1.0;
  const bump = Math.max(0, camZ - inside);
  // screen and keypad rectangles on the front face (mm, origin bottom-left); sideways only as far as they fit
  Hface = form === 'flip' ? openH : H;
  const placeX = (w, dx, m) => clamp((W - w) / 2 + dx, m, Math.max(m, W - w - m));
  if (!disp.none) {
    if (form === 'flip') screenRect = [placeX(mw, sx, 1.5), openH - foreP - mh, mw, mh];
    else if (isKeypadForm(form) || form === 'car' || form === 'bag') screenRect = [placeX(mw, sx, 1.5), H - foreP - mh, mw, mh];
    else screenRect = [form === 'fold' ? (W - disp.w) / 2 : placeX(disp.w, sx, 0.6), H - foreP - disp.h, disp.w, disp.h];
  }
  if (F.kp && form !== 'slider') keypadRect = [placeX(kpW, kx, 1.5), chinP, kpW, kpH];
  // the home button / navigation keys sit centred in the chin of a touch phone
  let navRect = null;
  if (screenRect && (navk.home !== 'none' || ['capacitive', 'physical'].includes(navk.keys))) {
    const cy = screenRect[1] / 2;
    navRect = navk.keys === 'capacitive' || navk.keys === 'physical' ? [W * 0.1, cy - 2.6, W * 0.8, 5.2] : [W / 2 - 5.5, cy - 5.5, 11, 11];
  }
  // ---- weight (g) ----
  const surf = 2 * W * H + 2 * (W + H) * T;                 // mm²
  const shellW = surf / 100 * (mat.wall / 10) * mat.dens;
  const elecDens = interp(ELEC_DENSITY, t);
  let weight = shellW + disp.weight + (bat ? bat.weight : 0) + (handset ? 0 : elec * elecDens) + camW + extraW + (F.kp ? (t < 1990 ? 25 : 8) : 0) + 6;
  let unitWeight = 0, unitVol = 0;
  if (handset) {
    unitVol = elec * 1.35 + (form === 'car' ? 450 : batVol * 1.15 + 120);
    unitWeight = elec * elecDens * 1.15 + (form === 'car' ? 1800 : (bat ? bat.weight : 0) + 450);
  }
  if (radio && radio.ext) weight += radio.antLen > 100 ? 12 : 5;
  const volume = W * H * T / 1000 + unitVol;
  const totalWeight = weight + unitWeight;
  if (F.hinge) weight += form === 'fold' ? 18 : 6;
  // ---- heat, power, battery life ----
  const footprint = W * H;
  const thermBudget = handset ? 10 : Math.max(0.8, 2.0 + 0.17 * (t - 2008)) * mat.therm * Math.pow(footprint / 7000, 0.35);
  const chipPower = chip ? chip.power : 0.5;
  const sustain = Math.min(1, Math.pow(thermBudget / Math.max(0.01, chipPower), 0.6));
  let extrasPower = 0;
  if (feat.wifi) extrasPower += 0.03;
  if (feat.gps) extrasPower += 0.02;
  if (feat.bt) extrasPower += 0.01;
  const camPower = Object.values(camStats).reduce((a, c) => a + c.power, 0) * 0.08;
  const avgPower = interp(BASE_POWER, t) + (radio ? radio.power * 0.5 : 0.5) + disp.power + chipPower * 0.12 + mem.power + camPower + extrasPower + addPower + (needDsp ? 0.05 : 0);
  const hours = form === 'car' ? null : bat ? bat.wh / avgPower * (addons.includes('solar') ? 1.04 : 1) : 0;
  // ---- network ----
  const peakFn = s => stdPeak(s, rp);
  const cov = rp ? radioCoverage(rp.stds, t, rp.bands, peakFn) : { total: 0, byRegion: {}, speed: 0 };
  let sig = radio ? radio.gain : 1;
  if (radio && mat.metal && !radio.ext && !radio.metalOk) { sig *= 0.72; notes.push('− metal body blocks the internal antenna'); }
  const sigCov = clamp(0.85 + 0.15 * sig, 0.7, 1.03);
  const coverage = { total: Math.min(1, cov.total * sigCov), byRegion: Object.fromEntries(Object.entries(cov.byRegion).map(([k, v]) => [k, Math.min(1, v * sigCov)])) };
  const liveGen = rp ? Math.max(0, ...rp.stds.filter(s => CARRIERS.some(c => c.stds[s] && netAvail(c.stds[s], t) > 0)).map(s => NET_STDS[s].gen)) : 0;
  // ---- features ----
  const os = OS[spec.os] || OS.none;
  const touchOk = disp.touch;
  let pts = (os.needsTouch && !touchOk ? os.pts * 0.4 : os.pts) + (FINGERPRINT[feat.fp] || FINGERPRINT.none).pts + sim.pts + (port.pts || 0) + (jack.pts || 0) + (spec.sd ? 3 : 0)
    + 2 * Math.log2(1 + mem.storageMB) + (chip && chip.media ? 3 : 0) + (camStats.front ? 3 : 0) + (touchOk ? 3 : 0) + water.q * 20 + (bat && bat.wireless ? 3 : 0);
  for (const [key, , label, p] of EXTRAS) {
    if (!feat[key]) continue;
    let ok = true;
    if ((key === 'sms' || key === 'wap') && liveGen < 2) { ok = false; issues.push(`${label} needs a digital (2G) network.`); }
    if (key === 'phonebook' && mem.storageMB <= 0) { ok = false; issues.push('A phonebook needs some storage memory.'); }
    if ((key === 'games' || key === 'mp3' || key === 'wap') && spec.os === 'none') { ok = false; issues.push(`${label} needs phone firmware or an OS.`); }
    if (key === 'mp3' && mem.storageMB < 8) { ok = false; issues.push('A music player needs at least 8 MB of storage.'); }
    if (key === 'stylus' && !touchOk) { ok = false; issues.push('A stylus needs a touchscreen.'); }
    if (key === 'face3d' && (!camStats.front || isKeypadForm(form))) { ok = false; issues.push('3D face unlock needs a touch phone with a front camera.'); }
    if (ok) pts += p;
  }
  pts += addPts;
  if (os.needsTouch && !touchOk) notes.push(`− ${os.name} without a touchscreen`);
  // ---- layout & ergonomics ----
  const camBox = rearCams ? (() => {
    const ds = Object.entries(camStats).filter(([k]) => k !== 'front').map(([, c]) => c.diag + 4);
    const n = ds.length, d = Math.max(...ds);
    return n === 1 ? [d, d] : n === 2 ? [d, d * 2 + 1] : [d * 2 + 1, d * 2 + 1];
  })() : null;
  const geo = { W, H, T, Hface, screenRect, keypadRect, navRect, kpNav: nav > 0, camBox, antD: radio && radio.ext ? (radio.antLen > 100 ? 9 : 8) : 8, openH, kp: !!F.kp };
  const resolved = resolveLayout(spec, geo);
  const lay = evalLayout(spec, geo, resolved);
  for (const e of lay.errors) issues.push(e);
  // ---- design ----
  const stb = screenRect ? (disp.w * disp.h) / (W * Hface) : 0;
  const drop = mat.drop * Math.sqrt(disp.none ? 0.9 : disp.drop) * (water.q ? 1.05 : 1);
  const extAnt = radio && radio.ext ? (radio.antLen > 100 ? 0.93 : 0.98) : 1;
  const bumpF = bump > 0 ? Math.max(0.85, 1 - bump * 0.025) : 1;
  const edgeF = spec.style && spec.style.edge === 'round' ? 1.02 : spec.style && spec.style.edge === 'chamfer' ? 1.015 : 1;
  const style = mat.q * fin.q * (1 + water.q) * lay.score * (0.7 + 0.3 * drop) * Math.pow(Math.max(0.05, stb), 0.35) * extAnt * bumpF * edgeF * addDesign;
  if (bump > 0.5) notes.push(`− ${bump.toFixed(1)} mm camera bump`);
  // ---- performance raw ----
  const pixels = disp.res[0] * disp.res[1];
  const perfCpu = chip ? chip.cpu * (0.5 + 0.5 * sustain) : 0;
  const perfGpu = chip ? chip.gpu * (0.3 + 0.7 * sustain) * Math.pow(1e6 / Math.max(1e4, pixels), 0.15) : 0;
  // camera total (CameraMark)
  let camScore = 0;
  if (camStats.main) camScore += camStats.main.score;
  if (camStats.ultra) camScore += 0.25 * camStats.ultra.score;
  if (camStats.tele) camScore += 0.3 * camStats.tele.score;
  if (camStats.front) camScore += 0.15 * camStats.front.score;
  if (camScore > 0) {
    camScore += flash.q * 60;
    const ispF = chip && chip.isp > 0 ? 0.85 + 0.15 * Math.min(1.5, chip.isp / Math.max(0.001, 0.1 * Math.pow(frontierNode(t, 0).density, 0.6))) : 0.7;
    camScore *= ispF * (chip && chip.tops > 0 ? 1 + Math.min(0.12, chip.tops / 200) : 1) * (chip && chip.media ? 1.03 : 1);
  }
  const raw = {
    cpu: perfCpu, gpu: perfGpu, ai: chip ? chip.tops : 0, ram: mem.ramMB, stor: mem.speed,
    cam: camScore, disp: disp.score * (0.45 + 0.55 * (disp.none ? 0 : sizeScore(form, dp.size, t))), dispSize: dp ? dp.size : 0,
    hours, charge: bat ? bat.chargeMin : null, car: form === 'car',
    speed: cov.speed * sig, gen: liveGen, sig,
    weight: totalWeight, vol: volume, style, form,
    feat: pts,
  };
  // ---- unit costs (before supplier/contract markups) ----
  const costs = { display: disp.cost, battery: bat ? bat.cost : 0, memory: mem.cost, radio: radio ? radio.cost : 0, cams: {} };
  for (const k in camStats) costs.cams[k] = camStats[k].cost;
  const fpOpt = FINGERPRINT[feat.fp] || FINGERPRINT.none;
  let featCost = fpOpt.cost * decl(0.09, techMarket(fpOpt.tech), t, 0.3) + flash.cost * decl(0.08, techMarket(flash.tech), t, 0.3);
  for (const [key, id, , , cost] of EXTRAS) if (feat[key]) featCost += cost * decl(0.1, techMarket(id), t, 0.3);
  const fp2 = footprint / 7000;
  costs.body = mat.cost * decl(0.03, techMarket(mat.tech), t, 0.6) * earlyMul(techMarket(mat.tech), t) * Math.pow(fp2, 0.7) * (form === 'car' ? 2 : 1)
    + water.cost + fin.cost + F.cost * decl(0.06, F.tech ? techMarket(F.tech) : FIRST_YEAR, t, 0.4) + (F.kp === 'num' ? 3 : F.kp === 'qwerty' ? 6 : 0)
    + (port.cost || 0) + (jack.cost || 0) + sim.cost + (spec.sd ? 0.8 : 0) + featCost + (needDsp ? 8 * decl(0.1, 1991, t, 0.2) : 0)
    + addCost;                                            // add-ons are part of "body, keys & features"
  costs.addons = addCost;                                 // (already included in costs.body)
  costs.os = os.fee * decl(0.04, techMarket(os.tech), t, 0.5);
  costs.chip = chip && chip.kind === 'vendor' ? vendorChipPrice(chip, t) : null;
  // ---- complexity tier (what contract manufacturers can build) ----
  const dEmit = dp ? dp.emit : 'none';
  let tier = 1;
  if (form === 'fold' || spec.body.mat === 'ti' || (dp && dp.matrix === 'ltpo') || dEmit === 'tandem' || (camStats.tele && partParams(spec.cams.tele).periscope) || ['punch', 'udc'].includes(shape)) tier = 5;
  else if (dEmit === 'oled' || ['glass', 'steel', 'ceramic'].includes(spec.body.mat) || rearCams >= 3 || radioGen >= 5) tier = 4;
  else if (['smart', 'touch', 'modern', 'ai'].includes(spec.os) || form === 'touch' || form === 'slate' || ['alu', 'mg'].includes(spec.body.mat) || radioGen >= 3 || (dp && ['asi', 'ltps'].includes(dp.matrix))) tier = 3;
  else if ((dp && dp.color) || rearCams || ['car', 'bag', 'brick', 'flip', 'slider', 'qwerty'].includes(form)) tier = 2;
  // simple phones need fewer parts and less hand work
  costs.misc = interp(cat.misc, t) * (0.62 + 0.12 * tier);
  costs.labor = (interp(cat.labor, t) * (0.66 + 0.11 * tier) + Math.max(0, rearCams - 1) + F.labor + (touchOk ? 1 : 0));
  // ---- sanity: does it make physical sense? ----
  if (form === 'brick' && totalWeight > 1500) issues.push(`At ${(totalWeight / 1000).toFixed(1)} kg this is no handheld – shrink the electronics (integration research) or make a bag phone.`);
  if (['candybar', 'flip', 'qwerty', 'slider'].includes(form) && totalWeight > 700) issues.push(`A ${Math.round(totalWeight)} g ${F.name.toLowerCase()} won't fit a pocket – the electronics are too big for this form factor.`);
  if (form === 'touch' && T > 22) issues.push(`A ${T.toFixed(0)} mm thick slate: the electronics are too big for a touch phone yet.`);
  if (!isKeypadForm(form) && !disp.touch) issues.push(`A ${F.name.toLowerCase()} needs a touchscreen.`);
  if (form === 'fold' && !(dp && dp.fold)) issues.push('A foldable needs a foldable display.');
  if (spec.port === 'none' && !(bat && bat.wireless)) issues.push('A portless phone needs wireless charging.');
  if (dp) for (const r of disp.rules) if (r.err) issues.push('Display: ' + r.text);
  for (const k in camStats) for (const r of camStats[k].rules) if (r.err) issues.push(CAM_ROLES[k].name + ': ' + r.text);
  if (bat) for (const r of bat.rules) if (r.err) issues.push('Battery: ' + r.text);
  for (const r of mem.rules) if (r.err) issues.push('Memory: ' + r.text);
  if (radio) for (const r of radio.rules) if (r.err) issues.push('Radio: ' + r.text);
  if (form !== 'car' && !bat) issues.push('Add a battery.');
  // ---- benchmarks (absolute numbers) ----
  const bench = {
    cpu: perfCpu, single: chip ? chip.single * (0.6 + 0.4 * sustain) : 0, gpu: perfGpu, ai: raw.ai, cam: camScore, disp: disp.score,
    batt: hours, charge: raw.charge, net: raw.speed, cov: coverage.total, ram: mem.ramMB, storage: mem.storageMB, stor: mem.speed,
    weight: totalWeight, thick: T, vol: volume, drop,
  };
  return {
    raw, bench, costs, tier, issues: [...new Set(issues)], notes, sustain, thermBudget, avgPower, hours, chipPower,
    geom: { form, W, H, T, Hface, openH, lidT, bump, camZ, stb, screenRect, keypadRect, navRect, nav: navk, camBox, footprint, volume, unitVol, unitWeight, handset, antD: geo.antD },
    weight: totalWeight, handsetWeight: weight, volume, thick: T,
    parts: { disp, cams: camStats, bat, mem, radio }, integrated, needDsp, coverage, netSpeed: raw.speed, gen: liveGen,
    layout: lay, lay: resolved, elecVol: elec, internal, res: disp.res, dims: { w: W, h: H, t: T },
    sizing: { autoW, autoH, fitT, spareVol, custom: !!(wantW || wantH || wantT) },
    addons, addonCost: addCost,
  };
}

// ============================================================================
//  STANDARD SPECS (what suppliers & rivals build) and the flagship reference
// ============================================================================
function blankSpec(cat) {
  return {
    cat, form: cat === 'tablet' ? 'slate' : 'car', name: '', color: BODY_COLORS[0], price: 1999, int: 0,
    body: { mat: 'plastic', water: 'none', finish: 'gloss' },
    style: { radius: 0.5, edge: 'round', island: 'auto', logo: '', accent: '', front: 'black', keys: 'classic', keyTone: 'auto' },
    size: { w: 0, h: 0, t: 0 },
    display: null, cams: { main: null, ultra: null, tele: null, front: null }, flash: 'none',
    battery: null, memory: null, radio: null, chip: { kind: 'vendor', id: '' },
    os: 'none', feat: { fp: 'none' }, port: 'barrel', jack: 'none', sim: 'none', sd: false, layout: [], addons: {},
  };
}
const std = p => (p ? { src: 'std', p } : null);
// fill a spec with the best of everything `ok` allows at level lvl (0 budget … 3 flagship)
function buildSpec(cat, t, ok, form, lvl, regions) {
  const s = blankSpec(cat);
  s.form = cat === 'tablet' ? 'slate' : form;
  const f = formOf(s);
  s.int = integrationLevel(ok);
  s.display = std(stdDisplay(f, cat, t, ok, lvl));
  const main = stdCamera('main', t, ok, lvl);
  s.cams.main = std(main);
  if (main) {
    if (ok('cam_front') && (lvl >= 1 || t > 2012)) s.cams.front = std(stdCamera('front', t, ok, lvl));
    const multi = ok('cam_multi') && lvl >= 2 && (cat === 'phone' || t >= 2020);
    if (multi) s.cams.ultra = std(stdCamera('ultra', t, ok, lvl));
    if (multi && cat === 'phone') s.cams.tele = std(stdCamera('tele', t, ok, lvl));
    s.flash = lvl >= 1 ? (ok('cam_dualflash') && lvl >= 2 ? 'dual' : ok('cam_flash') ? 'led' : 'none') : 'none';
  }
  s.battery = std(stdBattery(f, cat, t, ok, lvl));
  s.memory = std(stdMemory(t, ok, lvl));
  s.radio = std(stdRadio(t, ok, lvl, regions, f));
  const b = s.body;
  const matBest = ['ti', 'steel', 'glass', 'alu', 'plastic'].find(k => ok(MATERIALS[k].tech));
  b.mat = lvl === 0 ? 'plastic' : lvl === 1 ? (t >= 2019 && ok('body_glass') ? 'glass' : t >= 2013 && ok('body_alu') ? 'alu' : 'plastic')
    : lvl === 2 && (matBest === 'steel' || matBest === 'ti') ? 'glass' : matBest;
  if (f === 'car') b.mat = lvl >= 2 && ok('body_alu') ? 'alu' : 'plastic';
  const water = ['ip68', 'ip67', 'ip53', 'none'].find(k => ok(WATER[k].tech));
  b.water = lvl === 0 ? (ok('body_ip53') && t >= 2018 ? 'ip53' : 'none') : lvl === 1 ? (ok('body_ip67') && t >= 2020 ? 'ip67' : ok('body_ip53') ? 'ip53' : 'none') : water;
  b.finish = lvl >= 2 && b.mat === 'glass' && ok('fin_frosted') ? 'frosted' : lvl >= 2 && ['alu', 'mg'].includes(b.mat) && ok('fin_brushed') ? 'brushed' : lvl >= 1 && b.mat === 'plastic' && ok('fin_matte') ? 'matte' : 'gloss';
  const touchForm = !isKeypadForm(f);
  const feat = s.feat;
  feat.fp = lvl === 0 ? (t >= 2016 && ok('feat_fp') ? 'rear' : 'none') : lvl === 1 ? (t >= 2018 && ok('feat_fpside') ? 'side' : t >= 2015 && ok('feat_fp') ? 'rear' : 'none')
    : ['us', 'ud', 'side', 'rear', 'none'].find(k => ok(FINGERPRINT[k].tech) && (k !== 'ud' && k !== 'us' || touchForm));
  if (feat.fp !== 'none' && !touchForm && feat.fp !== 'rear') feat.fp = 'none';
  const gen = Math.max(...s.radio.p.stds.map(x => NET_STDS[x].gen));
  for (const [key, id] of EXTRAS) {
    let on = ok(id) && (lvl === 3 || t - TECH[id].market >= [4, 2, 0.5][lvl]);
    if (key === 'face3d') on = on && touchForm && lvl === 3 && !!s.cams.front;
    if (key === 'stereo') on = on && lvl >= 2;
    if (key === 'stylus') on = false;
    if ((key === 'sms' || key === 'wap') && gen < 2) on = false;
    if (key === 'ir' && t > 2008) on = false;
    if (key === 'fm' && t > 2015) on = false;
    feat[key] = on;
  }
  s.os = [...OS_ORDER].reverse().find(k => ok(OS[k].tech) && (touchForm || !OS[k].needsTouch)) || 'none';
  if (lvl === 0 && OS_ORDER.indexOf(s.os) > 2) s.os = OS_ORDER[OS_ORDER.indexOf(s.os) - 1];
  if (s.os === 'none' || s.os === 'firmware') { feat.games = feat.games && s.os === 'firmware'; feat.mp3 = false; feat.wap = false; }
  if (feat.phonebook && s.memory.p.flDie === 0) feat.phonebook = false;
  s.port = f === 'car' || f === 'bag' ? 'cord' : ['usbc', 'microusb', 'miniusb', 'edge', 'barrel'].find(k => ok(PORTS[k].tech));
  s.jack = f === 'car' ? 'none' : t < [2040, 2020, 2017, 2017][lvl] ? (ok('jack_35') ? 'j35' : ok('jack_25') ? 'j25' : 'none') : 'none';
  if (s.jack !== 'none' && touchForm && t > 2016 && lvl >= 2) s.jack = 'none';
  const usesSim = s.radio.p.stds.some(x => ['gsm', 'gprs', 'umts', 'hspa', 'lte', 'nr', 'tdscdma'].includes(x));
  s.sim = usesSim ? (['esim', 'nano', 'micro', 'mini', 'full'].find(k => ok(SIMS[k].tech) && (k !== 'esim' || lvl === 3)) || 'none') : 'none';
  if (s.sim === 'esim' && t < 2022) s.sim = 'nano';
  s.sd = ok('feat_sd') && lvl < 3 && t < 2020;
  s.style = { radius: touchForm ? 0.6 : f === 'car' ? 0.3 : 0.5, edge: 'round', island: 'auto', logo: '' };
  // the common add-ons of each era (lvl: from which segment up, from/until: years)
  const actx = addonCtx(s);
  const fitAddon = (k, minLvl, from, until) => {
    const A = ADDONS[k];
    if (lvl >= minLvl && ok(A.tech) && t >= Math.max(from || 0, TECH[A.tech].market + 0.5) && t < (until || 9999) && !addonProblem(k, actx)) s.addons[k] = true;
  };
  fitAddon('kblight', 0); fitAddon('led', 1, 0, 2017); fitAddon('torch', 0, 0, 2012); fitAddon('camkey', 2, 0, 2012);
  fitAddon('prox', 0); fitAddon('mute', 3); fitAddon('baro', 2); fitAddon('irblast', 2, 0, 2019); fitAddon('hrm', 3, 0, 2019);
  fitAddon('action', 3, 2023);
  syncLayout(s, { ext: ANTENNAS[s.radio.p.ant].ext });
  return s;
}
function bestForm(ok, t) {
  let best = 'car', bv = -1;
  for (const f of PHONE_FORMS) {
    if (!ok(FORMS[f].tech)) continue;
    if (f === 'touch' && !ok('disp_capacitive')) continue;
    if (f === 'brick' && !ok('int_vlsi')) continue;
    if (f === 'candybar' && !ok('int_asic')) continue;
    const v = formAppeal(f, t);
    if (v > bv) { bv = v; best = f; }
  }
  return best;
}
function flagshipSpec(cat, t) {
  const av = marketAv(t);
  const ok = cat === 'tablet' ? (id => id === 'form_tablet' || av.ok(id)) : av.ok;
  const s = buildSpec(cat, t, ok, cat === 'tablet' ? 'slate' : bestForm(ok, t), 3, t < 1991 ? ['na'] : ['eu']);
  s.chip = { kind: 'vendor', id: flagshipChip(t).id };
  s.price = segBudget(cat, 'ultra', t);
  return s;
}
// what a rival ships in a segment
function rivalSpec(cat, seg, t, rival, ok, regions) {
  const lvl = SEGMENTS.indexOf(seg);
  let form = cat === 'tablet' ? 'slate' : bestForm(ok, t);
  if (cat === 'phone') {
    if (rival && rival.form && ok(FORMS[rival.form].tech) && formAppeal(rival.form, t) >= 0.8 * formAppeal(form, t) && (rival.form !== 'touch' || ok('disp_capacitive'))) form = rival.form;
    if (form === 'touch' && seg === 'budget' && t < 2011.5) form = ok('form_candybar') ? 'candybar' : form;
    if (form === 'touch' && seg === 'mid' && t < 2009) form = rival && rival.form && rival.form !== 'touch' && ok(FORMS[rival.form].tech) ? rival.form : 'candybar';
    if (form === 'fold' && seg !== 'ultra') form = 'touch';
    if (form === 'brick' && seg === 'budget' && ok('form_bag') && t < 1990) form = 'bag';
  }
  const s = buildSpec(cat, t, ok, form, lvl, regions);
  s.chip = { kind: 'vendor', id: vendorChipFor(seg, t).id };
  return s;
}

// ============================================================================
//  EXPECTATIONS: smooth curves of what a flagship delivers, metric by metric
// ============================================================================
const EXPECT_KEYS = ['cpu', 'gpu', 'ai', 'ram', 'stor', 'cam', 'disp', 'hours', 'charge', 'speed', 'gen', 'weight', 'vol', 'style', 'feat'];
const LOWER_BETTER = { weight: 1, vol: 1, charge: 1 };
const MONOTONIC = { cpu: 1, gpu: 1, ai: 1, ram: 1, stor: 1, cam: 1, disp: 1, speed: 1, gen: 1, feat: 1 };
const _expect = {};
function buildExpectations(cat) {
  const y0 = FIRST_YEAR, y1 = 2060;
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    const tt = cat === 'tablet' ? Math.max(2010.5, y) : y + 0.5;
    const spec = flagshipSpec(cat, tt);
    const ev = evalPhone(spec, tt, vendorChipById(spec.chip.id));
    rows.push(Object.assign({}, ev.raw, { form: spec.form }));
  }
  const out = { y0, rows, forms: rows.map(r => r.form) };
  for (const k of EXPECT_KEYS) {
    let v = rows.map(r => (r[k] == null ? null : r[k]));
    // back-fill metrics that only exist later (battery life before handhelds)
    const first = v.findIndex(x => x != null && x > 0);
    if (k === 'hours' || k === 'charge') v = v.map((x, i) => (x == null || x <= 0 ? (first >= 0 ? v[first] : 1) : x));
    v = v.map(x => (x == null ? 0 : x));
    // technology never goes backwards (sizes and weights follow fashion, so they may)
    if (MONOTONIC[k]) for (let i = 1; i < v.length; i++) if (v[i] > 0) v[i] = Math.max(v[i], v[i - 1]);
    // smooth in log space
    const sm = v.map((x, i) => {
      if (x <= 0) return 0;
      const a = v[i - 1] > 0 ? v[i - 1] : x, b = v[i + 1] > 0 ? v[i + 1] : x;
      return Math.exp(0.25 * Math.log(a) + 0.5 * Math.log(x) + 0.25 * Math.log(b));
    });
    out[k] = sm;
  }
  return out;
}
function expect(cat, key, t) {
  if (!_expect[cat]) _expect[cat] = buildExpectations(cat);
  const E = _expect[cat];
  const x = clamp(t - 0.5 - E.y0, 0, E.rows.length - 1);
  const i = Math.floor(x), k = x - i;
  const a = E[key][i], b = E[key][Math.min(E.rows.length - 1, i + 1)];
  if (a <= 0 && b <= 0) return 0;
  if (a <= 0) return k > 0.5 ? b : 0;
  if (b <= 0) return a;
  return Math.exp(lerp(Math.log(a), Math.log(b), k));
}
function expectForm(cat, t) {
  if (!_expect[cat]) _expect[cat] = buildExpectations(cat);
  const E = _expect[cat];
  return E.forms[clamp(Math.round(t - 0.5 - E.y0), 0, E.forms.length - 1)];
}

// ---- Scores ----------------------------------------------------------------------
// Each sub-score is 100 = "matches what a flagship delivers right now".
const softCap = x => (x <= 100 ? x : 100 + 40 * (1 - Math.exp(-(x - 100) / 40)));
function subscores(raw, cat, t) {
  const E = key => expect(cat, key, t);
  // performance
  const parts = [];
  const eCpu = E('cpu');
  parts.push([0.55, eCpu > 0 ? Math.pow(raw.cpu / eCpu, 0.5) : 1]);
  const eGpu = E('gpu');
  if (eGpu > 0) parts.push([0.25, Math.pow(Math.max(0, raw.gpu) / eGpu, 0.45)]);
  else if (raw.gpu > 0) parts.push([0.1, 1.2]);
  const eAi = E('ai');
  if (eAi > 0) parts.push([0.08, Math.pow(Math.max(0, raw.ai) / eAi, 0.4)]);
  const eRam = E('ram');
  parts.push([0.12, Math.log2(1 + raw.ram * 1024) / Math.max(0.1, Math.log2(1 + eRam * 1024))]);
  const eStor = E('stor');
  if (eStor > 0) parts.push([0.08, Math.pow(Math.max(0.01, raw.stor) / eStor, 0.25)]);
  const wsum = parts.reduce((a, p) => a + p[0], 0);
  const perf = 100 * parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum;
  // camera
  const eCam = E('cam');
  const cam = eCam > 0 ? 100 * raw.cam / eCam : raw.cam > 0 ? 125 : 100;
  // display
  const eDisp = E('disp');
  const disp = eDisp > 0 ? 100 * raw.disp / eDisp : 100;
  // battery
  let batt;
  if (raw.car) batt = 112;
  else batt = 85 * Math.pow(Math.max(0, raw.hours || 0) / E('hours'), 0.8) + 15 * (raw.charge ? Math.pow(E('charge') / raw.charge, 0.4) : 0.5);
  // network
  const eGen = E('gen'), eSpeed = E('speed');
  const genF = Math.pow(0.8, Math.max(0, Math.round((eGen - raw.gen) * 2) / 2));
  const spdF = eSpeed > 0 ? Math.pow(Math.max(0.0001, raw.speed) / eSpeed, 0.3) : 1;
  const net = 100 * genF * Math.min(1.25, spdF) * clamp(0.9 + 0.1 * raw.sig, 0.8, 1.02);
  // design
  const refForm = expectForm(cat, t);
  const appeal = formAppeal(raw.form, t) / formAppeal(refForm, t);
  const design = 100 * (raw.style / E('style')) * Math.pow(E('weight') / raw.weight, 0.45) * Math.pow(E('vol') / raw.vol, 0.22) * appeal;
  // features
  const eFeat = E('feat');
  const feat = eFeat >= 1 ? 100 * raw.feat / eFeat : 100 + Math.min(30, raw.feat * 5);
  const s = { perf, cam, disp, batt, net, design, feat };
  for (const k in s) s[k] = Math.max(0, s[k]);
  return s;
}
// ---- Market trends: for a while, buyers care more about something --------------------------
// k: category → extra weight at the peak, segs: which buyers (everyone if omitted), demand: market boost
const TRENDS = [
  { id: 'status', title: 'Executive status symbol', start: 1977.5, end: 1980.5, k: { design: 0.5 }, segs: ['premium', 'ultra'], desc: 'A phone in the car is the ultimate executive accessory: looks matter.' },
  { id: 'yuppie', title: 'Yuppie boom', start: 1985, end: 1988.5, k: { design: 0.45, net: 0.25 }, segs: ['premium', 'ultra'], demand: 1.06, desc: 'Brick phones are the power accessory of Wall Street: style and reliable coverage sell.' },
  { id: 'pocket', title: 'Pocket-size craze', start: 1993, end: 1996, k: { design: 0.5, batt: 0.2 }, desc: 'Everyone wants a phone that disappears into a pocket.' },
  { id: 'snake', title: 'Snake on every phone', start: 1998, end: 2000.5, k: { feat: 0.45 }, segs: ['budget', 'mid'], desc: 'Built-in games are the hit of the year.' },
  { id: 'sms', title: 'Texting boom', start: 1999.5, end: 2002.5, k: { feat: 0.35, batt: 0.2 }, desc: 'Teenagers send hundreds of texts a day: keyboards, features and stamina sell.' },
  { id: 'color', title: 'Color screen fever', start: 2002, end: 2004, k: { disp: 0.5 }, desc: 'Monochrome screens suddenly look ancient.' },
  { id: 'camera', title: 'Camera phone boom', start: 2003.5, end: 2006, k: { cam: 0.6 }, desc: 'Snap, send, share: everyone wants a camera in their phone.' },
  { id: 'music', title: 'Mobile music craze', start: 2005.5, end: 2007.5, k: { feat: 0.35, perf: 0.15, batt: 0.2 }, desc: 'Music phones take on MP3 players: storage, features and battery life.' },
  { id: 'apps', title: 'App store gold rush', start: 2008.5, end: 2011, k: { perf: 0.4, feat: 0.3, disp: 0.15 }, segs: ['mid', 'premium', 'ultra'], desc: 'Apps for everything: fast phones with big touchscreens win.' },
  { id: 'gaming', title: 'Mobile gaming explosion', start: 2010.5, end: 2013, k: { perf: 0.55, disp: 0.25, batt: 0.15 }, demand: 1.04, desc: 'Casual hits keep the whole world tapping: performance and screens sell phones.' },
  { id: 'phablet', title: 'Phablet boom', start: 2012.5, end: 2015, k: { disp: 0.45, batt: 0.2 }, desc: 'Bigger screens are suddenly what everybody wants.' },
  { id: 'selfie', title: 'Selfie craze', start: 2013.5, end: 2016, k: { cam: 0.45 }, segs: ['budget', 'mid', 'premium'], desc: 'Front cameras and photo quality are the talk of social media.' },
  { id: 'arcraze', title: 'AR game craze', start: 2016.5, end: 2017.6, k: { batt: 0.4, perf: 0.25, net: 0.2 }, desc: 'Millions walk the streets catching monsters – batteries drain fast.' },
  { id: 'esports', title: 'Mobile esports', start: 2018, end: 2021, k: { perf: 0.5, disp: 0.3, batt: 0.2 }, demand: 1.03, desc: 'Battle royales go mobile: high frame rates and long sessions.' },
  { id: '5g', title: '5G hype', start: 2019.5, end: 2021.5, k: { net: 0.6 }, segs: ['mid', 'premium', 'ultra'], desc: 'Carriers market 5G everywhere: buyers want to be future-proof.' },
  { id: 'wfh', title: 'Work & school from home', start: 2020.2, end: 2021.8, k: { cam: 0.3, batt: 0.25, disp: 0.15 }, desc: 'Video calls all day: front cameras and stamina matter.' },
  { id: 'creator', title: 'Short-video creator boom', start: 2021.5, end: 2024, k: { cam: 0.45, disp: 0.2 }, desc: 'Everyone is a creator: video quality sells phones.' },
  { id: 'ai', title: 'AI phone hype', start: 2023.8, end: 2026.5, k: { perf: 0.5, feat: 0.3 }, segs: ['premium', 'ultra'], desc: 'On-device AI is the new must-have: buyers want NPUs and smart features.' },
  { id: 'longevity', title: 'Battery anxiety', start: 2025, end: 2027.5, k: { batt: 0.5 }, desc: 'Buyers keep phones longer and want them to last all day – and for years.' },
  { id: 'foldfash', title: 'Foldable fashion', start: 2028.5, end: 2031, k: { design: 0.45, disp: 0.25 }, segs: ['premium', 'ultra'], desc: 'Folding phones become the style statement of the decade.' },
  { id: 'satnet', title: 'Satellite everywhere', start: 2031.5, end: 2033.5, k: { net: 0.5 }, desc: 'Direct-to-phone satellites make coverage the selling point.' },
  { id: 'holo', title: 'Holo-gaming wave', start: 2034, end: 2036.5, k: { perf: 0.5, disp: 0.35 }, demand: 1.03, desc: 'Glasses-free 3D games: the fastest chips and screens win.' },
  { id: 'health', title: 'Health-tracking boom', start: 2037, end: 2039.5, k: { feat: 0.45, batt: 0.2 }, desc: 'Phones become personal doctors: sensors and features sell.' },
  { id: 'lens', title: 'Pro-camera arms race', start: 2040, end: 2042.5, k: { cam: 0.55 }, segs: ['mid', 'premium', 'ultra'], desc: 'Phones replace the last dedicated cameras.' },
  { id: 'light', title: 'Ultra-light fashion', start: 2043, end: 2045.5, k: { design: 0.5 }, desc: 'The lightest, thinnest phone is what everybody wants.' },
];
const easeEdge = x => clamp(x, 0, 1) * clamp(x, 0, 1) * (3 - 2 * clamp(x, 0, 1));
const trendLevel = (tr, t) => easeEdge((t - tr.start) / 0.5) * easeEdge((tr.end - t) / 0.5);   // eases in and out over ~6 months
function activeTrends(t) { return TRENDS.filter(tr => t > tr.start && t < tr.end); }
// extra weight a trend gives one category for one segment right now (0 = none)
function trendBoost(k, seg, t) {
  let b = 0;
  for (const tr of activeTrends(t)) if (tr.k[k] && (!tr.segs || tr.segs.includes(seg))) b += tr.k[k] * trendLevel(tr, t);
  return b;
}
const trendDemand = t => activeTrends(t).reduce((a, tr) => a * (1 + ((tr.demand || 1) - 1) * trendLevel(tr, t)), 1);
function segWeights(seg, t) {
  const w = interp(ERA_WEIGHTS, t), tilt = SEG_INFO[seg].tilt;
  let tot = 0;
  const out = {};
  for (const k in w) { out[k] = w[k] * tilt[k] * (1 + trendBoost(k, seg, t)); tot += out[k]; }
  for (const k in out) out[k] /= tot;
  return out;
}
function segQuality(subs, seg, t) {
  const w = segWeights(seg, t);
  let q = 0;
  for (const k in w) q += w[k] * softCap(subs[k]);
  return q;
}
// how relevant a price is to a segment's buyers (log-normal window around their budget)
function priceFit(price, B) { const x = Math.log(price / B) / 0.42; return Math.exp(-0.5 * x * x); }
// buyer attraction to a device in a segment, without brand presence
function valueTerm(q, price, cat, seg, t) {
  const B = segBudget(cat, seg, t), si = SEG_INFO[seg];
  return priceFit(price, B) * Math.pow(Math.max(1, q) / 100, si.k) * Math.pow(B / price, si.e);
}
function segmentForPrice(cat, price, t) {
  let best = 'budget', bd = 1e9;
  for (const seg of SEGMENTS) { const d = Math.abs(Math.log(price / segBudget(cat, seg, t))); if (d < bd) { bd = d; best = seg; } }
  return best;
}
