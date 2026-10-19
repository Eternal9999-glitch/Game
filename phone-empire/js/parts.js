'use strict';
// ============================================================================
//  Shared math, plus the engineering model of every part you can design:
//  displays (layer stacks), camera modules (optics), battery cells,
//  memory packages and radio modules. Each evaluator turns a parameter set
//  into physical stats (size, weight, power, performance) and a unit cost.
//  "Standard" builders pick what a supplier would sell for a given era.
// ============================================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
function interp(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      const k = (t - t0) / (t1 - t0);
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k))
        : typeof v0 === 'object' ? Object.fromEntries(Object.keys(v0).map(key => [key, lerp(v0[key], v1[key], k)])) : lerp(v0, v1, k);
    }
  }
  return table[table.length - 1][1];
}
// interpolate in log space (for quantities that grow exponentially)
function logInterp(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      const k = (t - t0) / (t1 - t0);
      return Math.exp(lerp(Math.log(Math.max(1e-12, v0)), Math.log(Math.max(1e-12, v1)), k));
    }
  }
  return table[table.length - 1][1];
}
// price decline: falls `rate` per year after `since`, never below `floor` of the launch price
const decl = (rate, since, t, floor) => Math.max(floor, Math.pow(1 - rate, Math.max(0, t - since)));
// being earlier than the industry is expensive
const earlyMul = (since, t) => (t < since ? 1 + (since - t) * 0.3 : 1);
const techMarket = id => (id ? TECH[id].market : 1900);
const econ = t => interp(ECON, t);

// World events ease in and out over EVENT_EASE years instead of switching on and off.
const EVENT_EASE = 2 / 12;
function activeEvents(t) { return EVENTS.filter(e => t >= e.start && t < e.end); }
function eventWeight(e, t) {
  if (t <= e.start || t >= e.end) return 0;
  const s = x => { x = Math.min(1, x); return x * x * (3 - 2 * x); };
  return s((t - e.start) / EVENT_EASE) * s((e.end - t) / EVENT_EASE);
}
function eventMul(key, t) {
  let m = 1;
  for (const e of EVENTS) if (e.fx[key] && t > e.start && t < e.end) m *= 1 + (e.fx[key] - 1) * eventWeight(e, t);
  return m;
}

// ---- Price dynamics ----------------------------------------------------------------
// Parts get cheaper along a learning curve (Wright's law): every doubling of all the handsets the
// industry has ever built takes a fixed share off the price. Volume doubles fast in the 1980s–90s
// boom and slowly once the market matures, so prices fall quickly early and gently later. A new
// technology also learns fast in its first few years. Shortages (EVENTS) push prices up, and the
// same part can never get cheaper than MAX_DROP a year (guardCost).
const LEARN_FROM = 1960;
const _volLog2 = (() => {
  const out = [];
  let v = 3e5;                                            // radio-telephones built before 1973
  for (let m = 0; m <= (2062 - LEARN_FROM) * 12; m++) {
    out.push(Math.log2(v));
    v += logInterp(MARKET_SIZE.phone, LEARN_FROM + m / 12);
  }
  return out;
})();
// doublings of cumulative industry volume (log2 of handsets built) at time t
function volDoublings(t) {
  const x = clamp((t - LEARN_FROM) * 12, 0, _volLog2.length - 1.001), i = Math.floor(x);
  return lerp(_volLog2[i], _volLog2[i + 1], x - i);
}
// price multiplier for something that became industry standard at `since`. pr = share of the price
// left after each doubling of industry volume; young = extra share a new technology sheds over its
// first few years; floor = the price never falls below this share. Before `since` it costs more.
const YOUNG_YEARS = 2.5;
function learn(since, t, pr, young, floor) {
  if (t <= since) return earlyMul(since, t);
  const ind = Math.pow(pr, volDoublings(t) - volDoublings(since));
  const y = (1 + young * Math.exp(-(t - since) / YOUNG_YEARS)) / (1 + young);
  return floor + (1 - floor) * ind * y;
}
// Stat levels (pixel density, screen size, refresh, sensor size, charging watts, RF bands …) are priced
// by how new they are: a level costs most the moment it becomes industry standard and its premium fades
// as the industry learns to make it. levelYear interpolates when a value became standard between the
// research ladder's steps, so the premium is smooth in both the value and time. The newest levels are
// the priciest, and anything beyond what the industry makes (exclusive research) costs more still.
const LEVELS = {
  ppi: () => PPI_CAPS.map(([id, v]) => [id, v]),
  size: () => DISP_SIZE_CAPS.map(([id, v]) => [id, v]),
  tabSize: () => [[null, 7], ['form_tablet', 10.1], ['disp_tab13', 13]],
  hz: () => REFRESH.map(r => [r.tech, r.hz]),
  drive: () => [[null, 1], ['disp_hbm', 1.4]],
  camArea: () => CAM_FORMATS.map((f, i) => [i ? CAM_FORMAT_TECH[i] : null, f.w * f.h]),
  mp: () => CAM_MP.map((m, i) => [i ? CAM_MP_TECH[i] : null, m]),
  lens: () => LENS_CAPS.map(([id, v]) => [id, v]),
  light: () => APERTURES.map((a, i) => [APERTURE_TECH[i], 1 / (a * a)]),
  stab: () => CAM_OIS_ORDER.map(k => [CAM_OIS[k].tech, 1 + CAM_OIS[k].stops]),
  charge: () => CHARGE.map(c => [c.tech, c.w]),
  bands: () => BAND_CAPS.map(([id, v]) => [id, v]),
  mimo: () => MIMO.map(m => [m.tech, m.n]),
  ca: () => CARRIER_AGG.map(c => [c.tech, c.n]),
};
const _levelPts = {};
function levelPoints(name) {
  if (!_levelPts[name]) {
    // [year, value], ascending; the base level counts as four years older than the first step
    const raw = LEVELS[name]().filter((x, i, a) => i === 0 || x[1] > a[i - 1][1]);
    const pts = raw.map(([id, v]) => [id ? techMarket(id) : null, v]);
    pts[0][0] = (pts.length > 1 ? pts[1][0] : 1980) - 4;
    for (let i = 1; i < pts.length; i++) pts[i][0] = Math.max(pts[i][0], pts[i - 1][0] + 0.25);
    _levelPts[name] = pts;
  }
  return _levelPts[name];
}
function levelYear(name, v) {
  const pts = levelPoints(name);
  if (!(v > pts[0][1])) return -1e4;
  for (let i = 1; i < pts.length; i++) {
    const [y0, v0] = pts[i - 1], [y1, v1] = pts[i];
    if (v <= v1) return y0 + (y1 - y0) * Math.log(v / v0) / Math.log(v1 / v0);
  }
  if (pts.length < 2) return pts[0][0];
  const [y0, v0] = pts[pts.length - 2], [y1, v1] = pts[pts.length - 1];
  return y1 + (y1 - y0) * Math.log(v / v1) / Math.log(v1 / v0);     // beyond the last step: extrapolate
}
// premium for a stat level at time t: 1 + Y when it is brand new, fading with time constant K years;
// before it is standard it costs more (up to +50% at two years early)
function levelPrem(name, v, t, Y, K) {
  const age = t - levelYear(name, v);
  if (age >= 0) return 1 + Y * Math.exp(-age / K);
  return (1 + Y) * (1 + 0.25 * Math.min(2, -age));
}
// No part may get cheaper than MAX_DROP a year for the same spec: the price at t is held up by what
// the same spec cost in the previous three years while it was on the market (shortages and launch
// premiums fade gradually instead of crashing).
const MAX_DROP = { display: 0.28, camera: 0.28, battery: 0.28, memory: 0.35, radio: 0.28 };
const GUARD_MONTHS = 36;
function guardCost(kind, rawCost, t, since) {
  const r = -Math.log(1 - MAX_DROP[kind]) / 12;
  let c = rawCost(t);
  for (let m = 1; m <= GUARD_MONTHS; m++) {
    if (t - m / 12 < since) break;
    c = Math.max(c, rawCost(t - m / 12) * Math.exp(-r * m));
  }
  return c;
}

// ---- Availability -----------------------------------------------------------
// An availability object answers: is a tech usable at all (ok), standard in the industry
// (market), researched by us (has)? `std` = what a supplier can sell us: standard AND researched.
function marketAv(t, extra) {
  const m = id => !id || t >= TECH[id].market || !!(extra && extra[id]);
  return { t, market: m, has: m, ok: m, std: m };
}
// best value a research ladder allows: [[tech, value], ...]
function ladderCap(caps, okFn) { let v = caps[0][1]; for (const [id, x] of caps) if (!id || okFn(id)) v = Math.max(v, x); return v; }
// first ladder step that allows `v` (the tech you need for it)
function ladderTech(caps, v) { const s = caps.find(c => v <= c[1] + 1e-9); return s ? s[0] : caps[caps.length - 1][0]; }
const bestOf = (order, table, okFn) => [...order].reverse().find(k => okFn(table[k].tech)) || order[0];

// part stats are pure functions of (params, month): cache them
const _partCache = new Map();
function cachedKey(key, fn) {
  let v = _partCache.get(key);
  if (v === undefined) {
    v = fn();
    if (_partCache.size > 40000) _partCache.clear();
    _partCache.set(key, v);
  }
  return v;
}
function cached(kind, p, t, fn) { return cachedKey(kind + Math.floor(t * 12) + JSON.stringify(p), fn); }
// stats at t from rawFn(t), with the cost held up by what the same spec cost before (guardCost);
// techs: what the spec needs – the guard only looks back to when all of it was on the market
function priced(kind, guard, p, t, rawFn, techs) {
  const js = JSON.stringify(p);
  return cachedKey(kind + '$' + Math.floor(t * 12) + js, () => {
    const raw = tt => cachedKey(kind + Math.floor(tt * 12) + js, () => rawFn(Math.floor(tt * 12) / 12 + 1 / 24));
    const st = raw(t);
    const since = Math.max(FIRST_YEAR, ...techs.map(id => (TECH[id] ? TECH[id].market : 0)));
    const cost = guardCost(guard, tt => raw(tt).cost, t, since);
    return cost > st.cost ? Object.assign({}, st, { cost, rawCost: st.cost }) : st;
  });
}

// ============================================================================
//  DISPLAY: cover → touch → emitter / liquid crystal → backplane → backlight
// ============================================================================
function displayGeom(p) {
  if (!p || p.emit === 'none') return { dw: 0, dh: 0, area: 0 };
  const a = p.aspect, d = p.size * 25.4;
  const dw = d / Math.sqrt(1 + a * a), dh = dw * a;
  return { dw, dh, area: (dw * dh) / 645.16 };       // area in in²
}
function displayTechs(p) {
  if (!p || p.emit === 'none') return [];
  const out = [DISP_EMIT[p.emit].tech, DISP_MATRIX[p.matrix].tech, DISP_BL[p.bl].tech, DISP_TOUCH[p.touch].tech, DISP_COVER[p.cover].tech,
    (REFRESH.find(r => r.hz === p.hz) || REFRESH[0]).tech, DISP_SHAPE[p.shape].tech, ladderTech(DISP_SIZE_CAPS, p.size)];
  if (p.matrix !== 'segment') out.push(ladderTech(PPI_CAPS, p.ppi));
  if (p.color) out.push('disp_color');
  if (p.drive > 1.0001) out.push('disp_hbm');
  if (p.fold) out.push('disp_fold');
  for (const k of DISP_OPT_ORDER) if (p[k]) out.push(DISP_OPTS[k].tech);
  if (p.dim && DIMMING[p.dim]) out.push(DIMMING[p.dim].tech);
  if (p.tsr > 60) out.push((TOUCH_RATE.find(r => r.hz === p.tsr) || TOUCH_RATE[0]).tech);
  return out.filter(Boolean);
}
// design-rule check: returns a list of problems ({err, text})
function displayRules(p) {
  const out = [];
  if (!p || p.emit === 'none') return out;
  const e = DISP_EMIT[p.emit], m = DISP_MATRIX[p.matrix];
  const oled = e.emissive && p.emit !== 'led';
  if (!e.matrices.includes(p.matrix)) out.push({ err: true, text: `${e.name} cannot be driven by a ${m.name.toLowerCase()} backplane (use ${e.matrices.map(k => DISP_MATRIX[k].name).join(' or ')}).` });
  if (p.matrix === 'segment' && p.color) out.push({ err: true, text: 'Segment displays are monochrome.' });
  if (p.matrix === 'segment' && p.size > 2.2) out.push({ err: true, text: 'Segment displays only come in small strips (≤2.2").' });
  if (m.sizeMax && p.size > m.sizeMax) out.push({ err: true, text: `Passive matrices smear above ${m.sizeMax}" – use an active-matrix (TFT) backplane.` });
  if (p.matrix !== 'segment' && m.ppiMax && p.ppi > m.ppiMax) out.push({ err: true, text: `${m.name} transistors are too big for ${p.ppi} PPI (max ${m.ppiMax}).` });
  if (p.hz > 60 && !['ltps', 'ltpo'].includes(p.matrix)) out.push({ err: true, text: 'High refresh rates need an LTPS or LTPO backplane.' });
  if (p.color && !e.emissive && p.bl === 'none') out.push({ err: true, text: 'Color filters absorb 2/3 of the light – a color LCD needs a backlight.' });
  if (p.touch === 'incell' && !['ltps', 'ltpo'].includes(p.matrix)) out.push({ err: true, text: 'In-cell touch needs an LTPS/LTPO backplane.' });
  if (p.touch !== 'none' && p.matrix === 'segment') out.push({ err: true, text: 'A touch layer on a segment display is pointless.' });
  if (DISP_SHAPE[p.shape].oled && !e.emissive) out.push({ err: true, text: `${DISP_SHAPE[p.shape].name} needs an OLED panel (an LCD backlight cannot bend or have holes).` });
  if (p.fold && !['oled', 'tandem'].includes(p.emit)) out.push({ err: true, text: 'Only plastic OLED can fold.' });
  for (const k of DISP_OPT_ORDER) if (p[k] && DISP_OPTS[k].oled && !oled) out.push({ err: true, text: `${DISP_OPTS[k].name} only works on an OLED panel.` });
  if (p.tsr > 60 && p.touch === 'none') out.push({ err: true, text: 'Touch sampling needs a touch layer.' });
  if (p.matrix === 'segment' && (p.hdr || p.calib)) out.push({ err: true, text: 'HDR and calibration need a pixel matrix.' });
  if (!e.emissive && p.bl === 'none' && p.matrix !== 'segment') out.push({ err: false, text: 'No backlight: unreadable in the dark.' });
  return out;
}
// what a display costs: panel (emitter × backplane × area × pixel density × refresh × brightness), drivers, layers and
// coatings – each on its own learning curve – plus launch premiums for the newest stat levels
const DISP_K = { scale: 0.42, ppiExp: 1.7, areaExp: 1.05, ppiY: 1.5, sizeY: 1.0 };
function displayRaw(p, t) {
  const e = DISP_EMIT[p.emit], m = DISP_MATRIX[p.matrix], bl = DISP_BL[p.bl], tc = DISP_TOUCH[p.touch], cv = DISP_COVER[p.cover];
  const sh = DISP_SHAPE[p.shape] || DISP_SHAPE.bezel;
  const g = displayGeom(p);
  const seg = p.matrix === 'segment';
  const oled = e.emissive && p.emit !== 'led';
  const ppi = seg ? 0 : p.ppi;
  const res = seg ? [Math.max(4, Math.floor(g.dw / 4.2)), 1] : [Math.max(8, Math.round(g.dw / 25.4 * ppi)), Math.max(8, Math.round(g.dh / 25.4 * ppi))];
  const drive = p.drive || 1;
  const coe = !!(p.coe && oled);
  // light output
  const grow = since => Math.min(2.2, 1 + 0.06 * Math.max(0, t - since));
  let nits;
  if (e.emissive) nits = e.nits * drive * grow(techMarket(e.tech)) * tc.trans * (coe ? 1.3 : 1);
  else nits = bl.nits * grow(techMarket(bl.tech)) * e.trans * (p.color ? 0.45 : 1) * tc.trans * drive;
  const contrast = (e.emissive ? e.contrast : e.contrast * m.contrast) * (p.ar ? 1.25 : 1);
  const gamut = (p.color || e.emissive && p.emit !== 'led' ? e.gamut : 0) * (p.hdr && !seg ? 1.06 : 1);
  // power (average, W)
  const hzi = REFRESH.findIndex(r => r.hz === p.hz);
  const hzF = m.vrr ? 0.78 : Math.pow((p.hz || 60) / 60, 0.7);
  const pxF = seg ? 1 : Math.pow(Math.max(40, ppi) / 300, 0.25);
  let power;
  if (p.emit === 'led') power = g.area * e.pwr * 0.3;                 // digits are only lit while dialing
  else if (e.emissive) power = g.area * 0.045 * (e.pwr / 0.55) * drive * hzF * pxF * Math.max(0.55, decl(0.04, techMarket(e.tech), t, 0.55)) * (coe ? 0.8 : 1);
  else power = g.area * (0.004 + (bl.pwr ? bl.pwr * 0.22 * (nits / 230) / (p.color ? 0.45 : 1) * (p.color ? 0.6 : 1) : 0)) * hzF * pxF;
  power += seg ? 0.002 : 0.004 + res[0] * res[1] * 2e-9;               // driver chip
  if (p.aod && oled) power += m.vrr ? 0.004 : 0.012;
  if (p.tsr > 60) power += 0.004 * Math.log2(p.tsr / 60);
  // stack-up (mm) and weight
  const layers = [['Cover', cv.name + (p.ar ? ' + AR coating' : ''), cv.stack], ['Touch', tc.name, tc.stack], ['Polarizer', '', p.emit === 'led' || coe ? 0 : 0.15],
    [e.emissive ? 'Emitter' : 'Liquid crystal', e.name + (p.color && !e.emissive ? ' + color filter' : '') + (coe ? ' + on-cell color filter' : ''), e.stack], ['Backplane', m.name, seg ? 0.2 : 0.35],
    ['Backlight', bl.name, e.emissive ? 0 : bl.stack]].filter(l => l[2] > 0);
  const stack = layers.reduce((a, l) => a + l[2], 0);
  const weight = (g.dw + 3) * (g.dh + 3) * stack * 1.5 / 1000;
  // ---- cost ----
  const since = techMarket(e.tech);
  const per = DISP_K.scale * e.cost * learn(techMarket(e.tech), t, 0.85, 1.3, 0.16) * m.cost * learn(techMarket(m.tech), t, 0.93, 0.5, 0.5);
  const pxCost = seg ? 1 : (0.5 + 0.5 * Math.pow(Math.max(60, ppi) / 250, DISP_K.ppiExp)) * (p.color && !e.emissive ? 1.2 : 1);
  const hzCost = Math.pow((p.hz || 60) / 60, 0.45);
  const driveCost = Math.pow(drive, 2.5);
  const shapeCost = 1 + (sh.cost - 1) * (1 + 1.5 * learn(techMarket(sh.tech), t, 0.9, 1, 0));
  const D = (0.006 + 0.015 * Math.exp(-Math.max(0, t - since) / 1.5)) * (seg ? 0.3 : Math.pow(Math.max(60, ppi) / 400, 1.8)) * (drive > 1 ? drive * drive : 1);
  const yld = Math.exp(-g.area * D * (p.fold ? 2.5 : 1));
  // the newest sizes, pixel densities, refresh rates and brightness levels cost extra (low-volume lines, rejects)
  const prem = 1 + (seg ? 0 : levelPrem('ppi', ppi, t, DISP_K.ppiY, 1.5) - 1) + (p.fold ? 0 : levelPrem(p.size > 7.25 ? 'tabSize' : 'size', p.size, t, DISP_K.sizeY, 1.5) - 1)
    + (p.hz > 60 ? levelPrem('hz', p.hz, t, 1.5, 1.5) - 1 : 0) + (drive > 1 ? levelPrem('drive', drive, t, 2.0, 1.5) - 1 : 0);
  const panel = per * pxCost * hzCost * driveCost * shapeCost * Math.pow(0.6 + g.area, DISP_K.areaExp) * (p.fold ? 3 : 1) * prem;
  const driver = seg ? 1.2 * learn(1975, t, 0.9, 0.5, 0.3) : 2.5 * learn(1988, t, 0.88, 0.5, 0.25) + res[0] * res[1] * 1e-6 * learn(2000, t, 0.8, 1, 0.05) * (p.hz > 60 ? p.hz / 60 : 1);
  const a5 = Math.pow((0.5 + g.area) / 5, 0.6);
  let extras = (e.emissive ? 0 : bl.cost * learn(techMarket(bl.tech), t, 0.9, 0.6, 0.3) * Math.pow(0.5 + g.area, 0.6))
    + tc.cost * learn(techMarket(tc.tech), t, 0.88, 0.8, 0.25) * Math.pow((0.5 + g.area) / 5, 0.5)
    + cv.cost * learn(techMarket(cv.tech), t, 0.92, 0.8, 0.4) * Math.pow((0.5 + g.area) / 5, 0.7);
  for (const k of DISP_OPT_ORDER) if (p[k]) extras += DISP_OPTS[k].cost * learn(techMarket(DISP_OPTS[k].tech), t, 0.88, 1.2, 0.25) * a5;
  if (oled && p.dim && DIMMING[p.dim]) extras += DIMMING[p.dim].cost * learn(techMarket(DIMMING[p.dim].tech), t, 0.88, 1, 0.3);
  if (p.tsr > 60) extras += 0.4 * Math.log2(p.tsr / 60) * learn(techMarket((TOUCH_RATE.find(r => r.hz === p.tsr) || TOUCH_RATE[0]).tech), t, 0.88, 1, 0.3);
  const cost = ((panel + driver) / yld + extras) * eventMul('display', t);
  // quality: DisplayMark points
  const sharp = seg ? 0.22 : Math.sqrt(Math.min(ppi, 600) / 300);
  const info = seg ? res[0] / 30 : Math.min(1.25, Math.log2(res[0] * res[1]) / 20);
  const light = nits > 0 ? Math.log2(1 + nits / 50) / Math.log2(11) : 0.25;
  const contr = Math.min(1.4, Math.log10(Math.max(2, contrast)) / 3);
  const tsr = p.tsr > 60 && p.touch !== 'none' ? 1 + 0.15 * Math.log2(p.tsr / 60) : 1;
  const motion = Math.pow((p.hz || 60) / 60, 0.3) * m.resp * Math.pow(tsr, 0.5);
  const raw = 0.28 * Math.min(1.45, sharp) + 0.12 * info + 0.18 * Math.min(1.3, light) + 0.12 * contr + 0.15 * gamut + 0.08 * motion + 0.07 * e.q;
  let optQ = 1;
  for (const k of DISP_OPT_ORDER) {
    if (!p[k] || (DISP_OPTS[k].oled && !oled)) continue;
    optQ *= k === 'hdr' ? 1 + (DISP_OPTS.hdr.q - 1) * clamp((nits - 250) / 350, 0, 1) : DISP_OPTS[k].q;
  }
  const dimQ = oled ? (DIMMING[p.dim] || DIMMING.pwm).q : 1;
  const score = 100 * raw * tc.q * cv.q * sh.q * (p.fold ? 1.05 : 1) * optQ * dimQ;
  return { w: g.dw, h: g.dh, area: g.area, ppi, res, nits, contrast, gamut, power, stack, weight, layers, cost, yield: yld, score, prem,
    costParts: { panel: panel / yld, driver: driver / yld, extras, per, pxCost, hzCost, driveCost, shapeCost },
    seg, emissive: !!e.emissive, color: !!(p.color || (e.emissive && p.emit !== 'led')), touch: p.touch !== 'none', hz: p.hz || 60,
    drop: cv.drop, scratch: cv.scratch, rules: displayRules(p) };
}
function evalDisplay(p, t) {
  if (!p || p.emit === 'none') {
    return { none: true, w: 0, h: 0, area: 0, stack: 0, weight: 0, power: 0, cost: 0, nits: 0, contrast: 0, gamut: 0, ppi: 0, res: [0, 0], score: 0, rules: [] };
  }
  return priced('d', 'display', p, t, tt => displayRaw(p, tt), displayTechs(p));
}
// emitter + backplane combinations suppliers sell, oldest first
const DISP_COMBOS = [['led', 'segment'], ['lcd', 'segment'], ['lcd', 'passive'], ['stn', 'passive'], ['lcd', 'asi'], ['ips', 'asi'], ['ips', 'ltps'],
                     ['oled', 'ltps'], ['oled', 'ltpo'], ['tandem', 'ltpo']];
// lvl: 0 budget … 3 flagship. Flagships take the newest panel but stay a step short of the frontier
// in sharpness, refresh and brightness – maxing every stat is a deliberate (and costly) choice.
function stdDisplay(form, cat, t, ok, lvl) {
  const touchForm = !isKeypadForm(form);
  if (!ok('disp_led')) return { emit: 'none' };
  let combos = DISP_COMBOS.filter(([e, m]) => ok(DISP_EMIT[e].tech) && ok(DISP_MATRIX[m].tech));
  if (touchForm && combos.some(([, m]) => m !== 'segment')) combos = combos.filter(([, m]) => m !== 'segment');
  if (touchForm && combos.some(([, m]) => m !== 'segment' && m !== 'passive')) combos = combos.filter(([, m]) => m !== 'passive');
  if (!combos.length) return { emit: 'none' };
  // newly standard panels go to flagships first
  let ci = combos.length - 1 - [2, 1, 0, 0][lvl];
  while (ci > 0 && lvl < 3 && t - Math.max(techMarket(DISP_EMIT[combos[ci][0]].tech), techMarket(DISP_MATRIX[combos[ci][1]].tech)) < [5, 2.5, 1][lvl]) ci--;
  const [emit, matrix] = combos[Math.max(0, ci)];
  const em = DISP_EMIT[emit].emissive, oled = em && emit !== 'led';
  const color = matrix !== 'segment' && ok('disp_color') && (lvl >= 1 || ok('disp_asi'));
  const bl = em ? 'none' : ok('disp_ledbl') ? 'led' : ok('disp_el') && matrix !== 'segment' ? 'el' : 'none';
  const touch = touchForm ? (ok('disp_incell') && ['ltps', 'ltpo'].includes(matrix) && lvl >= 2 ? 'incell' : ok('disp_capacitive') && matrix !== 'passive' ? 'capacitive' : 'resistive') : 'none';
  const cover = DISP_COVER_STD[Math.max(0, DISP_COVER_STD.indexOf(bestOf(DISP_COVER_STD, DISP_COVER, ok)) - [2, 1, 0, 0][lvl])];
  const ppiCap = ladderCap(PPI_CAPS, ok);
  const mMax = DISP_MATRIX[matrix].ppiMax || 0;
  let ppi = Math.round(Math.min(ppiCap, mMax || 999) * [0.55, 0.68, 0.82, 0.9][lvl] / 10) * 10;
  if (lvl === 3) ppi = Math.min(ppi, cat === 'tablet' ? 300 : 460);
  const hzOk = REFRESH.filter(r => ok(r.tech) && (r.hz === 60 || ['ltps', 'ltpo'].includes(matrix)));
  const hz = hzOk[Math.max(0, hzOk.length - 1 - [3, 2, 1, 1][lvl])].hz;
  let shape = 'bezel';
  if (touchForm && lvl >= 1) {
    shape = ['punch', 'notch', 'slim'].find(k => ok(DISP_SHAPE[k].tech) && (!DISP_SHAPE[k].oled || em)) || 'bezel';
    if (shape === 'notch' && ok('disp_punch') && !em) shape = 'slim';
  }
  const aspect = matrix === 'segment' ? 0.28 : form === 'slate' ? (shape !== 'bezel' ? 1.45 : 1.33) : form === 'fold' ? 1.15 : form === 'qwerty' ? 0.75
    : touchForm ? (shape !== 'bezel' ? (t > 2019 ? 2.17 : 2.0) : t < 2011 ? 1.5 : 1.78) : 1.25;
  const sizeCap = form === 'slate' ? ladderCap(TABLET_SIZE_CAPS, ok) : ladderCap(DISP_SIZE_CAPS, ok);
  let size = prefSize(form, t) - [0.3, 0.15, 0.05, 0][lvl] * (cat === 'tablet' ? 1.5 : 1);
  if (matrix === 'segment') size = Math.min(1.0 + 0.1 * lvl, 2.2);
  size = +clamp(size, 0.6, Math.min(sizeCap, matrix === 'passive' ? 2.8 : 99, form === 'fold' ? 8.1 : 99)).toFixed(1);
  if (form === 'fold') size = Math.max(size, 7.0);
  const out = { emit, matrix, color, bl, touch, cover, size, aspect, ppi: matrix === 'segment' ? 0 : Math.max(60, ppi), hz, shape, drive: 1, fold: form === 'fold' };
  // coatings and features suppliers fit once they are a couple of years old (flagships get them first)
  const age = id => t - techMarket(DISP_OPTS[id].tech);
  const keep = (k, minLvl) => ok(DISP_OPTS[k].tech) && lvl >= minLvl && age(k) >= [4, 2.5, 1, 0][lvl] && (!DISP_OPTS[k].oled || oled);
  if (touchForm && keep('oleo', 0)) out.oleo = true;
  if (matrix !== 'segment' && keep('calib', 1)) out.calib = true;
  if (keep('aod', 1)) out.aod = true;
  if (keep('hdr', 2)) out.hdr = true;
  if (keep('coe', 3)) out.coe = true;
  if (oled) out.dim = lvl >= 2 && ok('disp_pwm') ? 'hfpwm' : lvl >= 1 && ok('disp_dc') ? 'dc' : 'pwm';
  if (touch !== 'none') { const rates = TOUCH_RATE.filter(r => ok(r.tech)); out.tsr = rates[Math.max(0, rates.length - 1 - [3, 2, 1, 1][lvl])].hz; }
  return out;
}

// ============================================================================
//  CAMERA: sensor + lens stack + focus + stabilization
// ============================================================================
function cameraTechs(p, role) {
  if (!p) return [];
  const out = [CAM_SENSOR[p.sensor].tech, CAM_FORMAT_TECH[p.fmt], CAM_MP_TECH[Math.max(0, CAM_MP.indexOf(p.mp))], ladderTech(LENS_CAPS, p.lens),
    APERTURE_TECH[Math.max(0, APERTURES.indexOf(p.ap))], CAM_AF[p.af].tech, CAM_OIS[p.ois].tech, CAM_ROLES[role || 'main'].tech];
  if (p.periscope) out.push('cam_periscope');
  return out.filter(Boolean);
}
function cameraRules(p, role) {
  const out = [];
  const f = CAM_FORMATS[p.fmt], s = CAM_SENSOR[p.sensor];
  const pitch = Math.sqrt(f.w * f.h / p.mp);
  if (p.mp >= 40 && !s.bin) out.push({ err: true, text: `${p.mp} MP needs a pixel-binning (Quad-Bayer) sensor.` });
  if (pitch < 0.55) out.push({ err: true, text: `Pixels of ${pitch.toFixed(2)} µm are smaller than a wavelength of light – use fewer MP or a bigger sensor.` });
  else if (pitch < (s.bin && p.mp >= 40 ? 0.6 : 0.95)) out.push({ err: false, text: `Tiny ${pitch.toFixed(2)} µm pixels: noisy in low light.` });
  if (p.periscope && role !== 'tele') out.push({ err: true, text: 'A periscope only makes sense for a telephoto camera.' });
  if (role === 'tele' && p.focal >= 85 && !p.periscope) out.push({ err: false, text: `A ${p.focal} mm lens without a periscope makes a huge camera bump.` });
  if (p.ap <= 1.8 && p.lens < 5) out.push({ err: false, text: `An f/${p.ap} aperture with only ${p.lens} lens elements is soft at the edges.` });
  return out;
}
function evalCamera(p, t, role) {
  if (!p) return null;
  return priced('c' + (role || ''), 'camera', p, t, tt => cameraRaw(p, tt, role), cameraTechs(p, role));
}
function cameraRaw(p, t, role) {
  return (() => {
    const f = CAM_FORMATS[p.fmt], s = CAM_SENSOR[p.sensor], af = CAM_AF[p.af], ois = CAM_OIS[p.ois];
    const A = f.w * f.h, diag = Math.hypot(f.w, f.h);
    const N = p.ap, el = p.lens, mp = p.mp;
    const pitch = Math.sqrt(A / mp);                         // µm
    const binned = s.bin && mp >= 40;
    const airy = 2.44 * 0.55 * N;                            // diffraction spot (µm)
    const blur = 0.9 * Math.pow(2.4 / N, 1.5) * Math.pow(6 / el, 0.85) * Math.pow(diag / 7, 0.35);
    const spot = Math.sqrt(pitch * pitch + Math.pow(0.25 * airy, 2) + Math.pow(0.6 * blur, 2));
    const effMP = Math.min(mp, A / (spot * spot));
    const light = Math.log2(A * s.qe / (N * N)) + ois.stops;  // stops of light gathered
    const dr = 9 + 0.8 * Math.log2(Math.max(0.4, binned ? pitch * 2 : pitch)) + s.dr;
    const fReal = p.focal * diag / 43.27;
    const z = p.periscope ? f.h + 3.4 : fReal * 1.05 + 1.1 + ois.z;
    const zoom = p.focal / 26;
    const detail = Math.log2(effMP) + 3.5;
    let score = Math.max(0, 7.2 * detail + 4.8 * (light + 2) + 1.8 * (dr - 8) + 9 * af.q);
    if (role === 'tele') score *= 0.6 + 0.4 * Math.min(2.5, Math.log2(zoom) / 1.58);
    // cost
    const st = techMarket(s.tech);
    // the newest sensor sizes, resolutions, lens stacks and apertures carry launch premiums (added up)
    const prem = 1 + (levelPrem('camArea', A, t, 1.5, 1.5) - 1) + (levelPrem('mp', mp, t, 1.0, 1.5) - 1) + (levelPrem('lens', el, t, 1.0, 1.5) - 1) + (levelPrem('light', 1 / (N * N), t, 1.2, 1.5) - 1);
    const sensor = (Math.pow(A, 1.3) * 0.35 * s.cost * learn(2001, t, 0.88, 0.8, 0.1) * earlyMul(st, t) + mp * 0.45 * learn(2001, t, 0.82, 1, 0.02)) * prem;
    const lens = el * 0.55 * learn(2002, t, 0.92, 0.5, 0.4) * Math.pow(2.8 / N, 2) * Math.pow(diag / 5, 0.9) * prem;
    const extra = af.cost * decl(0.08, techMarket(af.tech), t, 0.3) + ois.cost * decl(0.1, techMarket(ois.tech), t, 0.35)
      + (p.periscope ? 10 * decl(0.1, 2019.2, t, 0.4) : 0) + 1.5 * decl(0.05, 2001, t, 0.5);
    const cost = (sensor + lens + extra) * (t < 2004 ? 1 + (2004 - t) * 0.15 : 1);
    const power = 0.15 * s.pwr * Math.pow(mp / 10, 0.3);
    const weight = 0.6 + A * 0.04 + el * 0.12 + (ois.z ? 0.4 : 0) + (p.periscope ? 2 : 0);
    const footprint = p.periscope ? [diag + 4, diag + 14] : [diag + 3.5, diag + 3.5];
    return { A, diag, pitch, effMP, light, dr, z, zoom, score, cost, power, weight, footprint, binned, airy, blur, spot, fReal, rules: cameraRules(p, role) };
  });
}
function stdCamera(role, t, ok, lvl, sizeLimit) {
  if (!ok('cam_cmos') || !ok(CAM_ROLES[role].tech)) return null;
  const sensor = bestOf(CAM_SENSOR_ORDER.filter(k => k !== 'ccd'), CAM_SENSOR, ok);
  let fmtMax = 0;
  CAM_FORMAT_TECH.forEach((id, i) => { if (ok(id)) fmtMax = i; });
  const down = { main: 3 - lvl, ultra: 4 - Math.min(lvl, 2), tele: 4 - Math.min(lvl, 2), front: 5 - Math.min(lvl, 2) }[role];
  let fmt = Math.max(0, fmtMax - down);
  if (sizeLimit != null) fmt = Math.min(fmt, sizeLimit);
  // pick the most megapixels that still have healthy pixels
  const area = CAM_FORMATS[fmt].w * CAM_FORMATS[fmt].h;
  const bin = CAM_SENSOR[sensor].bin;
  let mp = CAM_MP[0];
  CAM_MP.forEach((m, i) => {
    if (!ok(CAM_MP_TECH[i])) return;
    if (m >= 40 && !bin) return;
    if (Math.sqrt(area / m) >= (bin && m >= 40 ? 0.62 : 1.0) && (role === 'main' || m <= 16 || t > 2021)) mp = Math.max(mp, m);
  });
  if (lvl === 0 && role === 'main') mp = CAM_MP[Math.max(0, CAM_MP.indexOf(mp) - 1)];
  const lens = Math.max(1, ladderCap(LENS_CAPS, ok) - (lvl >= 2 ? 0 : 1));
  const apOk = APERTURES.filter((a, i) => ok(APERTURE_TECH[i]));
  const ap = apOk[Math.max(0, apOk.length - 1 - (lvl >= 2 ? 0 : 1) - (role === 'main' ? 0 : 1))];
  const afOrder = CAM_AF_ORDER.filter(k => ok(CAM_AF[k].tech) && k !== 'laser');
  const af = role === 'front' ? (afOrder.length > 2 && lvl >= 2 ? afOrder[1] : 'fixed') : afOrder[Math.max(0, afOrder.length - 1 - (lvl >= 2 ? 0 : 1))];
  const ois = role === 'main' && lvl >= 2 ? (ok('cam_shift') && lvl === 3 ? 'shift' : ok('cam_ois') ? 'lens' : 'none') : role === 'tele' && ok('cam_ois') ? 'lens' : 'none';
  const periscope = role === 'tele' && ok('cam_periscope') && lvl === 3;
  const focal = role === 'tele' ? (periscope ? 120 : 52) : CAM_ROLES[role].dflt;
  return { sensor, fmt, mp, lens, ap, af, ois, periscope, focal };
}

// ============================================================================
//  BATTERY: chemistry, format, electrode design, safety margin, charging
// ============================================================================
function batteryTechs(p) {
  if (!p) return [];
  const out = [CHEM[p.chem].tech, BAT_FORMAT[p.fmt].tech, (CHARGE.find(c => c.w === p.charge) || CHARGE[0]).tech,
    (CHARGE_V[p.volt] || CHARGE_V[0]).tech, WIRELESS[p.wireless].tech];
  if (p.dual) out.push('bat_dual');
  for (let i = 0; i < (p.dgen || 0); i++) out.push(DENSITY_STEPS[i]);
  if (p.safetySys) out.push('bat_safety');
  return out.filter(Boolean);
}
function batteryRules(p) {
  const out = [];
  const c = CHEM[p.chem], f = BAT_FORMAT[p.fmt];
  if (f.lithium && c.nickel) out.push({ err: true, text: 'Nickel cells come in metal cans, not pouches.' });
  if (c.nickel && p.volt > 0) out.push({ err: true, text: 'Charge-voltage tuning only applies to lithium cells.' });
  if (c.nickel && p.dual) out.push({ err: false, text: 'Nickel packs are already many cells in series.' });
  if (p.safety < 0.25) out.push({ err: false, text: 'Razor-thin separators and no swelling room: high incident risk.' });
  return out;
}
function evalBattery(p, t) {
  if (!p) return null;
  return cached('b', p, t, () => {
    const c = CHEM[p.chem], f = BAT_FORMAT[p.fmt], v = CHARGE_V[p.volt] || CHARGE_V[0], wl = WIRELESS[p.wireless];
    const li = !c.nickel;
    const wh = p.mah * VOLTAGE / 1000;
    const whl = c.whl * f.pack * (li ? 1 + 0.06 * (p.dgen || 0) : 1) * (li ? v.e : 1) * (0.9 + 0.17 * p.elec) * (1.06 - 0.12 * p.safety);
    const volume = wh / whl * 1000;                                  // cm³
    const weight = wh / (c.whkg * (li ? 1 + 0.03 * (p.dgen || 0) : 1)) * 1000 * (1 + 0.1 * (1 - f.pack)) + 2;
    const maxC = c.maxC * (1.6 - 0.8 * p.elec) * (p.dual ? 2 : 1);
    const maxW = wh * maxC;
    const chargeW = Math.min(p.charge, maxW);
    const chargeMin = 60 * wh / Math.max(0.5, chargeW) * 1.25 + 10;
    const cycles = c.cycles * (li ? v.cyc : 1) * (0.8 + 0.4 * (1 - p.elec)) * (0.9 + 0.2 * p.safety);
    const risk = c.risk * f.risk * (li ? v.risk : 1) * Math.pow(2.5 - 2 * p.safety, 1.6) * (chargeW / wh > 2 ? 1.3 : 1) * (p.safetySys ? 0.45 : 1);
    const perWh = 0.9 * (t < 2007 ? 1 + 0.08 * (2007 - t) : decl(0.07, 2007, t, 0.12)) * c.cost * earlyMul(techMarket(c.tech), t);
    const chg = CHARGE.find(x => x.w === p.charge) || CHARGE[0];
    const cost = wh * perWh * f.cost * (1 + 0.12 * (1 - p.safety)) + 0.8 * decl(0.05, 1990, t, 0.4)
      + 0.025 * Math.pow(p.charge, 0.85) * decl(0.1, techMarket(chg.tech), t, 0.3) + wl.cost * decl(0.1, techMarket(wl.tech), t, 0.3) + (p.dual ? 1.2 : 0);
    return { wh, whl, volume, weight, maxW, chargeW, chargeMin, cycles, risk, cost, wireless: wl.w, rules: batteryRules(p) };
  });
}
function batteryCap(form, cat, ok) {
  const base = ladderCap(BAT_CAPS, ok);
  return form === 'bag' ? base * 6 : cat === 'tablet' ? Math.max(3000, Math.round(base * 2.2 / 50) * 50) : base;
}
const FLAG_MAH = { phone: [[1973, 0], [1983, 900], [1990, 800], [1994, 650], [1997, 700], [2000, 850], [2004, 950], [2007, 1150], [2010, 1420], [2012, 2000], [2014, 2800], [2016, 3000], [2018, 3400], [2020, 4200], [2022, 4800], [2025, 5100], [2040, 6000]],
  tablet: [[1973, 6000], [2012, 11500], [2016, 7300], [2020, 7600], [2025, 8100], [2040, 9000]] };
function stdBattery(form, cat, t, ok, lvl) {
  if (form === 'car') return null;
  const chem = CHEM_ORDER[Math.max(0, CHEM_ORDER.indexOf(bestOf(CHEM_ORDER.filter(k => k !== 'solid'), CHEM, ok)) - (lvl === 0 ? 1 : 0))];
  const lithium = !CHEM[chem].nickel;
  const fmt = !lithium ? (ok('bat_prism') ? 'prism' : 'cyl') : ok('bat_stack') && lvl >= 2 ? 'stacked' : ok('bat_lipo') && chem !== 'liion' ? 'pouch' : ok('bat_prism') ? 'prism' : 'cyl';
  const cap = batteryCap(form, cat, ok);
  let mah = interp(FLAG_MAH[cat], t) * [1.05, 1.0, 0.97, 1][lvl];
  if (form === 'bag') mah = 4500 + 2000 * lvl;
  if (form === 'brick') mah = Math.max(mah, 900);
  mah = Math.round(Math.min(cap, Math.max(300, mah)) / 50) * 50;
  const chg = CHARGE.filter(c => ok(c.tech) && (c.w < 65 || ok('bat_dual')));
  const charge = chg[Math.max(0, chg.length - 1 - (3 - lvl))].w;
  const vs = CHARGE_V.map((v, i) => i).filter(i => ok(CHARGE_V[i].tech));
  const volt = lithium ? vs[Math.max(0, vs.length - 2)] : 0;
  const wireless = lvl >= 2 ? bestOf(['none', 'qi', 'qi15', 'mag'], WIRELESS, ok) : 'none';
  const dgen = lithium ? DENSITY_STEPS.filter(id => ok(id)).length : 0;
  return { chem, fmt, mah, volt, elec: 0.55, safety: 0.6, charge, wireless, dual: charge >= 65, dgen, safetySys: ok('bat_safety') };
}

// ============================================================================
//  MEMORY: DRAM dies × stack + flash dies × stack behind an interface
// ============================================================================
const DRAM_PER_MB = [[1973, 40000], [1980, 6000], [1985, 300], [1990, 60], [1995, 30], [2000, 1.2], [2005, 0.12], [2010, 0.012], [2015, 0.005], [2020, 0.003], [2025, 0.0022], [2040, 0.001]];
const FLASH_PER_MB = [[1983, 300], [1990, 40], [1995, 15], [2000, 1.2], [2003, 0.25], [2005, 0.04], [2008, 0.006], [2010, 0.002], [2015, 0.0004], [2020, 0.00012], [2025, 0.00006], [2040, 0.00003]];
const PKG_VOL = [[1973, 0.8], [1985, 0.4], [1995, 0.15], [2005, 0.05], [2015, 0.03], [2040, 0.02]];
function memoryTechs(p) {
  if (!p) return [];
  const out = [DRAM_GENS[p.gen].tech, p.ramDie > 0 ? 'dram_' + p.ramDie : null, p.flDie > 0 ? 'fl_' + p.flDie : null,
    FLASH_CELL[p.cell].tech, STORAGE_IF[p.iface].tech, ladderTech(STACK_CAPS, p.stack)];
  return out.filter(Boolean);
}
function memoryRules(p) {
  const out = [];
  if (p.gen !== 'sram' && p.ramDie === 0) out.push({ err: true, text: 'Dynamic RAM needs at least a 4 Kb die.' });
  if (p.flDie === 0 && p.iface !== 'par') out.push({ err: true, text: 'A storage interface without flash dies?' });
  if (STORAGE_IF[p.iface].mbs > 300 && p.flDie > 0 && FLASH_DIES[p.flDie] < 16384) out.push({ err: false, text: 'A fast interface on tiny flash dies is wasted.' });
  return out;
}
function evalMemory(p, t) {
  if (!p) return null;
  return cached('m', p, t, () => {
    const g = DRAM_GENS[p.gen], c = FLASH_CELL[p.cell], ifc = STORAGE_IF[p.iface];
    const ramMB = DRAM_DIES[p.ramDie] * p.ramN / 8;
    const storageMB = FLASH_DIES[p.flDie] * p.flN / 8;
    // per-MB price: older (smaller) dies cost more per bit; each die carries a packaging floor
    let latest = 0; DRAM_YEARS.forEach((y, i) => { if (y <= t) latest = i; });
    let latestF = 0; FLASH_YEARS.forEach((y, i) => { if (i && y <= t) latestF = i; });
    const dramMB = logInterp(DRAM_PER_MB, t) * 1.3 * g.cost * Math.pow(Math.max(1, DRAM_DIES[latest] / DRAM_DIES[p.ramDie]), 0.35) * earlyMul(techMarket(p.ramDie ? 'dram_' + p.ramDie : null), t);
    const flashMB = p.flDie ? logInterp(FLASH_PER_MB, Math.max(1983, t)) * c.cost * Math.pow(Math.max(1, FLASH_DIES[latestF] / FLASH_DIES[p.flDie]), 0.35) * earlyMul(techMarket('fl_' + p.flDie), t) : 0;
    const dieFloor = 0.35 * decl(0.04, 1975, t, 0.3);
    const stack = Math.max(1, p.stack || 1);
    const pkgs = Math.ceil(p.ramN / stack) + (p.flN && p.flDie ? Math.ceil(p.flN / stack) : 0);
    const cost = (ramMB * dramMB + p.ramN * dieFloor + storageMB * flashMB + (p.flDie ? p.flN * dieFloor : 0)) * (1 + 0.04 * (stack - 1))
      + pkgs * 0.4 * decl(0.04, 1975, t, 0.3) + ifc.cost * decl(0.08, techMarket(ifc.tech), t, 0.3);
    const bw = g.bw;
    const speed = p.flDie ? ifc.mbs * c.speed : 0;
    const power = 0.02 + g.pwr * 0.05 * Math.pow(Math.max(0.001, ramMB), 0.15) + (p.flDie ? 0.01 : 0);
    const volume = pkgs * interp(PKG_VOL, t);
    return { ramMB, storageMB, bw, speed, power, volume, pkgs, cost: cost * eventMul('memory', t), endurance: c.endur, rules: memoryRules(p) };
  });
}
const FLAG_RAM = [[1973, 0.000125], [1983, 0.002], [1990, 0.008], [1996, 0.25], [2000, 1], [2003, 16], [2007, 128], [2010, 512], [2013, 2048], [2016, 4096], [2020, 12288], [2024, 16384], [2040, 32768]];
const FLAG_STORAGE = [[1983, 0.008], [1990, 0.03], [1996, 0.125], [2000, 1], [2003, 64], [2007, 8192], [2012, 32768], [2016, 131072], [2020, 524288], [2024, 1048576], [2040, 2097152]];
function stdMemory(t, ok, lvl) {
  const gen = bestOf(DRAM_GEN_ORDER, DRAM_GENS, ok);
  const stackMax = ladderCap(STACK_CAPS, ok);
  const target = logInterp(FLAG_RAM, t) / Math.pow(2, 3 - lvl);
  let ramDie = 0;
  DRAM_DIES.forEach((d, i) => { if (i === 0 || ok('dram_' + i)) ramDie = i; });
  if (gen === 'sram') ramDie = 0;
  const gen2 = ramDie === 0 ? 'sram' : gen;
  const maxN = Math.max(stackMax, t < 1999 ? 8 : stackMax);
  let ramN = clamp(Math.ceil(target * 8 / DRAM_DIES[ramDie] - 1e-9), 1, maxN);
  // use the cheapest die that gets there with few chips
  while (ramDie > 1 && ramN === 1 && DRAM_DIES[ramDie - 1] * 2 / 8 >= target && ok('dram_' + (ramDie - 1))) { ramDie--; ramN = clamp(Math.ceil(target * 8 / DRAM_DIES[ramDie] - 1e-9), 1, maxN); }
  let flDie = 0;
  FLASH_DIES.forEach((d, i) => { if (i && ok('fl_' + i)) flDie = i; });
  let flN = 0;
  if (flDie) {
    const sTarget = logInterp(FLAG_STORAGE, Math.max(1983, t)) / Math.pow(2, 3 - lvl);
    flN = clamp(Math.ceil(sTarget * 8 / FLASH_DIES[flDie] - 1e-9), 1, Math.max(stackMax, 2));
  }
  const cells = ['slc', 'mlc', 'tlc', 'qlc'].filter(k => ok(FLASH_CELL[k].tech));
  const cell = cells[Math.max(0, cells.length - 1 - (lvl === 3 ? 1 : 0))];
  const ifs = STORAGE_IF_ORDER.filter(k => ok(STORAGE_IF[k].tech));
  const iface = flDie ? ifs[Math.max(0, ifs.length - 1 - (lvl >= 2 ? 0 : 1))] : 'par';
  return { gen: gen2, ramDie, ramN, flDie, flN: flDie ? flN : 0, cell, iface, stack: Math.min(stackMax, Math.max(ramN, flN, 1)) };
}

// ============================================================================
//  RADIO: which standards, how many bands, MIMO, carrier aggregation, antenna, PA
// ============================================================================
function radioTechs(p) {
  if (!p) return [];
  const out = p.stds.map(s => NET_STDS[s].tech);
  out.push(ladderTech(BAND_CAPS, p.bands), (MIMO.find(m => m.n === p.mimo) || MIMO[0]).tech, (CARRIER_AGG.find(c => c.n === p.ca) || CARRIER_AGG[0]).tech,
    ANTENNAS[p.ant].tech, PAS[p.pa].tech);
  return out.filter(Boolean);
}
function radioRules(p) {
  const out = [];
  if (!p.stds.length) out.push({ err: true, text: 'Pick at least one network standard.' });
  for (const s of p.stds) {
    const n = NET_STDS[s].needs;
    if (n && !p.stds.includes(n)) out.push({ err: true, text: `${NET_STDS[s].name} phones must also support ${NET_STDS[n].name} as a fallback.` });
  }
  const g = Math.max(0, ...p.stds.map(s => NET_STDS[s].gen));
  if (p.mimo > 1 && g < 3.5) out.push({ err: false, text: 'MIMO only helps on 3.5G+ networks.' });
  if (p.ca > 1 && g < 4) out.push({ err: false, text: 'Carrier aggregation needs LTE.' });
  if (p.stds.includes('mmw') && p.ant !== 'frame' && p.ant !== 'internal') out.push({ err: true, text: 'mmWave needs internal antenna modules.' });
  if (p.stds.length > 1 && p.stds.includes('imts')) out.push({ err: false, text: 'An IMTS transmitter in a cellular phone: only worth it while IMTS networks last.' });
  return out;
}
// downlink peak (Mbps) of one standard on this radio, and the share of it you see in real life
function stdPeak(s, p) {
  const st = NET_STDS[s];
  if (st.gen >= 5) return st.peak * (p.mimo / 4) * (1 + 0.25 * (p.ca - 1));
  if (st.gen >= 4) return st.peak * (p.mimo / 2) * Math.pow(p.ca, 0.8);
  if (s === 'hspa' && p.mimo >= 2) return st.peak * 3;   // HSPA+ MIMO
  return st.peak;
}
const realShare = s => (NET_STDS[s].gen >= 5 ? 0.12 : NET_STDS[s].gen >= 4 ? 0.2 : 0.3);
function radioPeak(p) { return Math.max(0, ...p.stds.map(s => stdPeak(s, p))); }
function evalRadio(p, t, integrated) {
  if (!p) return null;
  return cached('r' + (integrated ? 'i' : ''), p, t, () => {
    const stds = p.stds.map(s => NET_STDS[s]);
    const gen = Math.max(0, ...stds.map(s => s.gen));
    const sorted = stds.slice().sort((a, b) => b.cost - a.cost);
    let rf = 0;
    sorted.forEach((s, i) => { rf += s.cost * decl(s.gen ? 0.2 : 0.08, techMarket(s.tech), t, 0.05) * earlyMul(techMarket(s.tech), t) * (i ? 0.4 : 1); });
    const baseband = integrated ? 0 : rf * 0.3;
    const ant = ANTENNAS[p.ant], pa = PAS[p.pa];
    const extras = 1.2 * Math.pow(p.bands, 0.8) * decl(0.08, 1997, t, 0.25) + (p.mimo - 1) * 3 * decl(0.12, 2008, t, 0.3)
      + (p.ca - 1) * 1.5 * decl(0.12, 2013, t, 0.3) + ant.cost * decl(0.05, techMarket(ant.tech), t, 0.4);
    const cost = (rf + baseband) * pa.cost + extras;
    const maxPwr = Math.max(...stds.map(s => s.pwr));
    const power = (maxPwr * pa.pwr / ant.gain + 0.04 * (stds.length - 1) + 0.01 * Math.sqrt(p.bands) + 0.015 * (p.mimo - 1)) * (integrated ? 0.85 : 1);
    const vol = Math.max(...stds.map(s => s.vol)) + 0.25 * (stds.reduce((a, s) => a + s.vol, 0) - Math.max(...stds.map(s => s.vol)));
    return { gen, peak: radioPeak(p), cost, power, vol: vol * (integrated ? 0.8 : 1), gain: ant.gain, ext: ant.ext, antLen: ant.len || 0, metalOk: !!ant.metal, rules: radioRules(p) };
  });
}
// coverage: share of worldwide buyers whose carrier the radio works on, per region.
// speed: typical real-world download (Mbps) across those buyers.
function netAvail(range, t) {
  const [a, b] = range;
  if (t < a) return 0;
  let v = clamp((t - a) / NET_RAMP, 0, 1);
  if (b != null) { if (t >= b) return 0; v = Math.min(v, clamp((b - t) / NET_SUNSET, 0, 1)); }
  return v;
}
function carrierShares(region, t) {
  const cs = CARRIERS.filter(c => c.region === region && t >= c.from);
  const tot = cs.reduce((a, c) => a + c.share, 0) || 1;
  return cs.map(c => ({ c, w: c.share / tot }));
}
function radioCoverage(stds, t, bands, peakFn, regions) {
  const need = interp(BANDS_NEEDED, t);
  const bandF = clamp(0.55 + 0.45 * (bands || 1) / need, 0, 1);
  const byRegion = {};
  const sorted = stds.slice().sort((a, b) => (peakFn ? peakFn(b) - peakFn(a) : NET_STDS[b].peak - NET_STDS[a].peak) || NET_STDS[b].gen - NET_STDS[a].gen);
  let covSum = 0, speedSum = 0, wSum = 0;
  for (const r of regions || REGION_ORDER) {
    let cov = 0, spd = 0;
    for (const { c, w } of carrierShares(r, t)) {
      // customers inside the best network's footprint get its speed, the rest fall back to older networks
      let covered = 0, sp = 0;
      for (const s of sorted) {
        const rg = c.stds[s];
        if (!rg) continue;
        const v = netAvail(rg, t);
        if (v > covered) { sp += (v - covered) * (peakFn ? peakFn(s) : NET_STDS[s].peak) * realShare(s); covered = v; }
      }
      cov += w * covered; spd += w * sp;
    }
    byRegion[r] = cov * bandF;
    const rs = interp(REGIONS[r].share, t);
    covSum += rs * byRegion[r]; speedSum += rs * spd * bandF; wSum += rs;
  }
  return { total: covSum / (wSum || 1), byRegion, speed: speedSum / (wSum || 1), bandF };
}
// which standards are in use somewhere in these regions right now
function standardsInUse(t, regions) {
  const set = new Set();
  for (const c of CARRIERS) {
    if (regions && !regions.includes(c.region)) continue;
    if (t < c.from) continue;
    for (const s in c.stds) if (netAvail(c.stds[s], t) > 0 || (t >= c.stds[s][0] - 0.01 && t < c.stds[s][0] + 0.5)) set.add(s);
  }
  return [...set];
}
// the standard plus its whole fallback chain
function withFallbacks(s, ok) { const out = [s]; let n = NET_STDS[s].needs; while (n) { out.push(n); n = NET_STDS[n].needs; } return out.every(x => ok(NET_STDS[x].tech)) ? out : null; }
const _stdRadioCache = new Map();
function stdRadio(t, ok, lvl, regions, form) {
  const vehicle = !form || form === 'car' || form === 'bag';
  const okList = NET_ORDER.filter(s => ok(NET_STDS[s].tech));
  const key = [Math.floor(t * 12), lvl, (regions || []).join(), vehicle, okList.join(), ok('rf_frame'), ok('rf_internal'), ok('rf_stub'), ok('rf_pa_et'), ok('rf_pa_gaas'),
    BAND_CAPS.filter(c => !c[0] || ok(c[0])).length, MIMO.filter(m => ok(m.tech)).length, CARRIER_AGG.filter(c => ok(c.tech)).length].join('|');
  const hit = _stdRadioCache.get(key);
  if (hit) return JSON.parse(hit);
  const inUse = standardsInUse(t, regions);
  // budget phones lag behind the newest networks
  const maxAge = [4, 1.5, 0, 0][lvl];
  let cands = okList.filter(s => !NET_STDS[s].niche && (vehicle || !NET_STDS[s].vehicle) && inUse.includes(s));
  const young = cands.filter(s => NET_STDS[s].gen >= 2.5 && t - techMarket(NET_STDS[s].tech) < maxAge);
  if (young.length < cands.length) cands = cands.filter(s => !young.includes(s));
  cands.sort((a, b) => NET_STDS[b].gen - NET_STDS[a].gen);
  // greedy: add a standard (with its fallbacks) only if it adds real coverage
  let stds = [];
  let cov = 0;
  for (const s of cands) {
    if (stds.includes(s)) continue;
    const chain = withFallbacks(s, ok);
    if (!chain) continue;
    const next = [...new Set([...stds, ...chain])];
    const c = radioCoverage(next, t, 1, null, regions).total;
    const fresh = !stds.length || NET_STDS[s].gen > Math.max(...stds.map(x => NET_STDS[x].gen));
    if (!stds.length || c > cov + 0.015 || (fresh && c >= cov - 1e-9 && NET_STDS[s].gen >= 2.5)) { stds = next; cov = c; }
  }
  if (!stds.length) stds = [okList.find(s => vehicle || !NET_STDS[s].vehicle) || 'imts'];
  const bands = Math.min(ladderCap(BAND_CAPS, ok), Math.ceil(interp(BANDS_NEEDED, t) * (lvl >= 2 ? 1.1 : 0.85)));
  const mimos = MIMO.filter(m => ok(m.tech)).map(m => m.n);
  const cas = CARRIER_AGG.filter(c => ok(c.tech)).map(c => c.n);
  const g = Math.max(...stds.map(s => NET_STDS[s].gen));
  const mimo = g >= 3.5 ? mimos[Math.max(0, mimos.length - 1 - (lvl >= 2 ? 0 : 1))] : 1;
  const ca = g >= 4 ? cas[Math.max(0, cas.length - 1 - (3 - lvl))] : 1;
  const ant = ok('rf_frame') && lvl >= 1 ? 'frame' : ok('rf_internal') ? 'internal' : ok('rf_stub') ? 'stub' : 'whip';
  const pa = bestOf(['si', 'gaas', 'et'], PAS, ok);
  const out = { stds, bands: Math.max(1, bands), mimo, ca, ant, pa };
  if (_stdRadioCache.size > 3000) _stdRadioCache.clear();
  _stdRadioCache.set(key, JSON.stringify(out));
  return out;
}

// ---- generic dispatch ---------------------------------------------------------------
const PART_EVAL = { display: evalDisplay, camera: evalCamera, battery: evalBattery, memory: evalMemory, radio: evalRadio };
const PART_TECHS = { display: displayTechs, camera: cameraTechs, battery: batteryTechs, memory: memoryTechs, radio: radioTechs };
// a part reference in a phone spec: {src:'std', p:{...}} or {src:'own', id}
function partParams(ref) {
  if (!ref) return null;
  if (ref.src === 'std') return ref.p;
  const d = typeof S !== 'undefined' && S ? S.designs.find(x => x.id === ref.id) : null;
  return d ? d.p : null;
}
function partRecord(ref) { return ref && ref.src === 'own' && typeof S !== 'undefined' && S ? S.designs.find(x => x.id === ref.id) : null; }
function partSummary(type, p, role) {
  if (!p) return 'None';
  switch (type) {
    case 'display': return p.emit === 'none' ? 'No display' : `${p.size.toFixed(1)}" ${DISP_EMIT[p.emit].name.replace(' liquid crystal', ' LCD')}${p.matrix !== 'segment' ? ' · ' + p.ppi + ' ppi' : ''}`;
    case 'camera': return `${p.mp} MP ${CAM_FORMATS[p.fmt].name} f/${p.ap}`;
    case 'battery': return `${p.mah.toLocaleString('en-US')} mAh ${CHEM[p.chem].name}`;
    case 'memory': return `${fmtMB(DRAM_DIES[p.ramDie] * p.ramN / 8)} / ${fmtMB(FLASH_DIES[p.flDie] * p.flN / 8)}`;
    case 'radio': return p.stds.map(s => NET_STDS[s].short).join(' + ');
  }
  return '';
}
