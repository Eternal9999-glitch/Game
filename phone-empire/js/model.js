'use strict';
// ============================================================================
//  Pure model: chip physics & economics, component pricing, device evaluation,
//  market references ("what a flagship looks like right now") and demand.
//  Nothing here touches the DOM or mutates game state.
// ============================================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
function interp(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      const k = (t - t0) / (t1 - t0);
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return table[table.length - 1][1];
}
// price decline curve: falls `rate` per year after `since`, never below `floor` of the launch price
const decl = (rate, since, t, floor) => Math.max(floor, Math.pow(1 - rate, Math.max(0, t - since)));
const techMarket = id => (id ? TECH[id].market : 2000);

function activeEvents(t) { return EVENTS.filter(e => t >= e.start && t < e.end); }
function eventMul(key, t) {
  let m = 1;
  for (const e of activeEvents(t)) if (e.fx[key]) m *= e.fx[key];
  return m;
}

// ---- Availability -----------------------------------------------------------
// An "availability" object answers: can this tech be used, and is it exclusive
// to us (researched early, needs our own factory)?
function marketAv(t) {
  return { t, market: id => !id || t >= TECH[id].market, inhouse: () => false, ok(id) { return this.market(id); } };
}

// ---- Market timeline helpers ---------------------------------------------------
function frontierNode(t, lag) {
  let i = -1;
  NODES.forEach((n, k) => { if (n.year <= t - 0.25) i = k; });
  return NODES[Math.max(0, i - (lag || 0))];
}
const marketArchGen = t => clamp(1 + Math.floor((t - 2008) / 1.5 + 1e-9), 1, 14);
const marketModemGen = t => (t >= 2019.5 ? 3 : t >= 2011 ? 2 : 1);
const prefSize = (cat, t) => interp(CATS[cat].prefSize, t);
function sizeScore(cat, size, t) {
  const d = size - prefSize(cat, t), sg = CATS[cat].sigma;
  const s = d < 0 ? sg[0] : sg[1];
  return Math.exp(-(d / s) * (d / s));
}
function marketSize(cat, t) { return interp(MARKET_SIZE[cat], t) * eventMul('demand', t); }
function segSplit(t) { return interp(SEG_SPLIT, t); }
const segBudget = (cat, seg, t) => interp(SEG_BUDGET[cat], t)[SEGMENTS.indexOf(seg)];

// ---- Silicon economics ----------------------------------------------------------
function waferPrice(node, t) {
  const age = t - node.year;
  let p = node.wafer;
  if (age < 1) p *= 1.25;                               // early-access premium
  else if (age > 3) p *= Math.max(0.45, Math.pow(0.92, age - 3)); // mature nodes get cheap
  return p * eventMul('wafer', t);
}
function defectDensity(node, t) {             // defects per cm²
  const age = t - node.year;
  if (age < 0) return 0.6 + Math.min(0.6, -age * 0.3);
  return 0.07 + 0.45 * Math.exp(-age / 1.1);
}
function diesPerWafer(A) {                    // A in mm², 300 mm wafer, edge loss
  const r = 150;
  return Math.max(1, Math.floor(Math.PI * r * r / A - Math.PI * 2 * r / Math.sqrt(2 * A)));
}
function chipEconomics(area, nm, t) {
  const node = nodeByNm(nm);
  const dpw = diesPerWafer(area);
  const D0 = defectDensity(node, t);
  const yld = Math.exp(-(area / 100) * D0);   // Poisson yield model
  const good = Math.max(1, dpw * yld);
  const wp = waferPrice(node, t);
  const pack = 1.5 + area * 0.015;
  const ip = 2.5;                              // CPU/GPU architecture license royalty per custom chip
  return { dpw, D0, yield: yld, good, waferPrice: wp, pack, ip,
    foundry: wp / good + pack + ip, own: node.wafer * 0.30 / good + pack + ip, ownWafer: node.wafer * 0.30 };
}

// ---- Chip performance ----------------------------------------------------------
function blockPower(type, node, clock) {
  const fRel = clock / node.fnom, fb = node.fnom / 0.45, p = node.pwr;
  switch (type) {
    case 'pcore': return 0.25 * fb * p * Math.pow(fRel, 3);
    case 'ecore': return 0.05 * Math.pow(fb, 0.8) * p;
    case 'gpu':   return 0.25 * Math.pow(fb, 0.8) * p * fRel * fRel;
    case 'npu':   return 0.12 * Math.pow(fb, 0.8) * p;
    case 'isp':   return 0.05 * Math.pow(fb, 0.6) * p;
    case 'modem': return 0.35 * p;
    case 'io':    return 0.08 * Math.pow(fb, 0.5) * p;
    case 'cache': return 0.01;
    case 'media': return 0.04 * Math.pow(fb, 0.5) * p;
  }
  return 0;
}
// units: [{type, adj (cache cells touching), valid}]
function evalChipCore(c) {
  const node = nodeByNm(c.nm);
  const ipc = Math.pow(1.12, c.arch - 1);
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
  for (const u of live) {
    const adj = u.adj || 0;
    if (u.type === 'pcore') cores.push(100 * ipc * Math.pow(ds, 0.35) * c.clock * (1 + 0.10 * Math.min(adj, 4)) * bwCpu);
    else if (u.type === 'ecore') cores.push(33 * ipc * Math.pow(ds, 0.35) * node.fnom * 0.8 * (1 + 0.06 * Math.min(adj, 3)) * bwCpu);
    else if (u.type === 'gpu') gpu += 1.2 * Math.pow(ds, 0.9) * Math.sqrt(node.fnom / 0.45) * Math.sqrt(ipc) * fRel * (1 + 0.04 * Math.min(adj, 5)) * bwGpu;
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
    hotT: c.hotT, hotFactor, modemGen, media: n('media') > 0,
    pCores: n('pcore'), eCores: n('ecore'), ioN,
    transistors: c.area * node.density * (0.35 + 0.65 * fill) / 1000, // billions
  };
}

// Full floorplan evaluation for the chip lab.
// d = {nm, w, h, clock, arch, modemGen, blocks:[{type,x,y,w,h}]}
function evalChipDesign(d) {
  const node = nodeByNm(d.nm);
  const W = d.w, H = d.h;
  const grid = new Array(W * H).fill(-1);
  d.blocks.forEach((b, i) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) grid[y * W + x] = i;
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -2 : grid[y * W + x]);
  const issues = [];
  const units = d.blocks.map((b, i) => {
    let adj = 0, edge = false;
    const seen = new Set();
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (j >= 0 && j !== i && d.blocks[j].type === 'cache') {
          const key = (y + dy) * W + (x + dx);
          if (!seen.has(key)) { seen.add(key); adj++; }
        }
      }
    }
    const valid = !BLOCKS[b.type].edge || edge;
    return { type: b.type, adj, valid, edge };
  });
  // heat map: power density per cell, blurred by neighbours
  const pc = new Array(W * H).fill(0);
  d.blocks.forEach(b => {
    const p = blockPower(b.type, node, d.clock) / (b.w * b.h);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) pc[y * W + x] = p;
  });
  const heat = new Array(W * H).fill(0);
  let hotT = 30;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      s += pc[yy * W + xx] * (dx === 0 && dy === 0 ? 1 : dx === 0 || dy === 0 ? 0.5 : 0.25);
    }
    const T = 30 + (s / 4) * 175;
    heat[y * W + x] = T;
    if (T > hotT) hotT = T;
  }
  const area = W * H * CELL_MM2;
  const usedCells = d.blocks.reduce((a, b) => a + b.w * b.h, 0);
  const fill = usedCells / (W * H);
  const has = t => units.some(u => u.type === t);
  const hasLive = t => units.some(u => u.type === t && u.valid);
  if (!hasLive('io')) issues.push({ err: true, text: has('io') ? 'Memory controllers must touch the die edge.' : 'Add at least one memory controller (IO) on the die edge.' });
  if (!has('pcore') && !has('ecore')) issues.push({ err: true, text: 'Add at least one CPU core.' });
  if (!has('gpu')) issues.push({ err: true, text: 'Add a GPU cluster – the OS needs graphics.' });
  if (has('modem') && !hasLive('modem')) issues.push({ err: false, text: 'Modem is not on the die edge – it will not work (phones will need a discrete modem).' });
  if (!has('modem')) issues.push({ err: false, text: 'No integrated modem: devices using this chip need a discrete modem chip (+cost, +power).' });
  if (!has('isp')) issues.push({ err: false, text: 'No ISP: camera quality will suffer heavily.' });
  if (fill < 0.7 && d.blocks.length) issues.push({ err: false, text: `${Math.round((1 - fill) * 100)}% of the die is empty – you pay for that silicon. Shrink the die.` });
  if (hotT > 90) issues.push({ err: false, text: `Hotspot ${Math.round(hotT)}°C: the chip will throttle. Spread hot blocks apart or lower the clock.` });
  const core = evalChipCore({ nm: d.nm, arch: d.arch, clock: d.clock, area, units, hotT, modemGen: d.modemGen, fill });
  return Object.assign(core, { heat, issues, ok: !issues.some(i => i.err), fill, units });
}

// ---- Off-the-shelf SoCs ------------------------------------------------------------
function vendorChipCounts(tier, tr) {
  const yrs = Math.max(0, tr - 2008), little = tr >= 2011.5;
  const flagGpu = Math.min(5, 1 + Math.floor(yrs / 5));
  if (tier === 'flagship') return {
    pcore: tr < 2010 ? 1 : tr < 2012 ? 2 : 4, ecore: little ? 4 : 0, gpu: flagGpu, cache: 5 + Math.floor(yrs / 4),
    npu: tr >= 2021 ? 2 : tr >= 2017.7 ? 1 : 0, isp: 2, io: tr >= 2010 ? 2 : 1, modem: 1, media: tr >= 2012 ? 1 : 0,
    modemGen: marketModemGen(tr) };
  if (tier === 'mid') return {
    pcore: tr < 2011 ? 1 : 2, ecore: little ? (tr >= 2015 ? 6 : 4) : 0, gpu: Math.max(1, flagGpu - 1), cache: 2 + Math.floor(Math.max(0, yrs) / 5),
    npu: tr >= 2019 ? 1 : 0, isp: 1, io: tr >= 2016 ? 2 : 1, modem: 1, media: tr >= 2014 ? 1 : 0,
    modemGen: tr >= 2020.5 ? 3 : tr >= 2012 ? 2 : 1 };
  return {
    pcore: tr < 2018 ? 1 : 2, ecore: little ? 4 : 0, gpu: 1, cache: 2, npu: tr >= 2021 ? 1 : 0, isp: 1, io: 1, modem: 1, media: 0,
    modemGen: tr >= 2021.5 ? 3 : tr >= 2013 ? 2 : 1 };
}
const VENDOR_CHIPS = [];
(function buildVendorChips() {
  const assumedAdj = { pcore: 2, ecore: 1, gpu: 2, npu: 1 };
  for (let y = 2005; y <= 2060; y++) {
    for (const v of VENDORS) {
      v.tiers.forEach((tier, ti) => {
        const tr = y + (v.month + ti * 0.4) / 12;
        const lag = { flagship: 0, mid: 1, budget: 2 }[tier];
        const node = frontierNode(tr, lag);
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
        const clock = +(node.fnom * ({ flagship: 1, mid: 0.95, budget: 0.88 }[tier])).toFixed(2);
        const st = evalChipCore({ nm: node.nm, arch, clock, area, units, hotT: 85, modemGen: counts.modemGen, fill: 0.8 });
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
const vendorChipById = id => VENDOR_CHIPS.find(c => c.id === id);
function vendorChipsAvailable(t) { return VENDOR_CHIPS.filter(c => c.release <= t && t < c.release + 3.5); }
function vendorChipPrice(chip, t) {
  const e = chipEconomics(chip.area, chip.nm, t);
  const tierMul = { flagship: 3.2, mid: 2.6, budget: 2.2 }[chip.tier];
  const ip = { flagship: 16, mid: 10, budget: 6 }[chip.tier];        // IP licensing, software & support
  return ((e.waferPrice / e.good) * tierMul + ip + e.pack) * eventMul('soc', t);
}
function flagshipChip(t) {
  let best = null;
  for (const c of vendorChipsAvailable(t)) if (c.tier === 'flagship' && (!best || c.cpu > best.cpu)) best = c;
  return best || vendorChipsAvailable(t)[0];
}

// ---- Component pricing (supplier/market prices) ----------------------------------------
function displayGeom(cat, size, fullview) {
  const aspect = cat === 'tablet' ? (fullview ? 1.45 : 1.33) : (fullview ? 2.17 : 1.78);
  const w = size / Math.sqrt(1 + aspect * aspect);
  return { w, h: w * aspect, area: w * w * aspect, aspect };
}
function earlyMul(since, t) { return t < since ? 1 + (since - t) * 0.3 : 1; }
function displayPrice(d, cat, t) {
  const dt = DISPLAY_TECH[d.tech], g = displayGeom(cat, d.size, d.fullview);
  const per = dt.cost * decl(dt.rate, dt.since, t, dt.floor) * earlyMul(dt.since, t);
  const touch = 2.0 * decl(0.09, 2007, t, 0.2);
  const hz = (REFRESH.find(r => r.hz === d.hz) || REFRESH[0]).cost;
  const ea = 5.2 * Math.pow(g.area / 5.2, 0.55);   // big panels cost less per in² (mother-glass efficiency)
  return (ea * (per * Math.pow(d.ppi / 250, 0.6) * hz + touch) + 2) * (d.fullview ? 1.1 : 1) * eventMul('display', t);
}
function camModulePrice(c, t, periscope) {
  const area = SENSORS[c.sensor].area;
  const sensor = area * 0.5 * decl(0.08, 2007, t, 0.15) + c.mp * 0.5 * decl(0.18, 2007, t, 0.03);
  const lens = 2 * decl(0.04, 2007, t, 0.5) + (c.ois ? 5 * decl(0.1, 2012.7, t, 0.35) : 0) + (periscope ? 12 * decl(0.1, 2019.2, t, 0.4) : 0);
  return sensor + lens;
}
function camerasList(cams) {
  const l = [['main', cams.main]];
  if (cams.ultra.on) l.push(['ultra', cams.ultra]);
  if (cams.tele.on) l.push(['tele', cams.tele]);
  l.push(['front', cams.front]);
  return l;
}
function camerasPrice(cams, t) {
  return camerasList(cams).reduce((a, [k, c]) => a + camModulePrice(c, t, k === 'tele' && c.periscope), 0);
}
function batteryPrice(b, t) {
  const wh = b.mah * VOLTAGE / 1000, ch = CHARGE.find(x => x.w === b.charge) || CHARGE[0];
  const perWh = 0.9 * decl(0.07, 2007, t, 0.12) * CHEM[b.chem].cost;
  return wh * perWh + 1 + ch.cost * decl(0.1, techMarket(ch.tech), t, 0.3) + (b.wireless ? 4 * decl(0.1, 2012.5, t, 0.3) : 0);
}
function memoryPrice(m, t) {
  const dram = 18 * Math.pow(0.85, t - 2008), nand = Math.max(0.03, 2 * Math.pow(0.78, t - 2008));
  return (m.ram / 1024 * dram + m.storage * nand + 1.5 + (m.sd ? 0.5 : 0)) * eventMul('memory', t);
}
function bodyPrice(body, bodyAreaCm2, t) {
  const m = MATERIALS[body.mat];
  return m.cost * decl(0.03, techMarket(m.tech), t, 0.6) * earlyMul(techMarket(m.tech), t) * Math.pow(bodyAreaCm2 / 70, 0.7) + WATER[body.water].cost;
}
function featuresPrice(f, t) {
  const fp = FINGERPRINT[f.fp];
  return fp.cost * decl(0.09, fp.since, t, 0.3) + (f.face3d ? 25 * decl(0.08, 2017.7, t, 0.35) : 0) + (f.nfc ? 3 * decl(0.1, 2011, t, 0.3) : 0) +
    (f.stereo ? 3 : 0) + (f.jack ? 0.5 : 0);
}
function discreteModemPrice(gen, t) {
  const base = [0, 14, 25, 40][gen], since = [2005, 2005, 2011, 2019.5][gen];
  return base * decl(0.12, since, t, 0.3);
}
function screenToBody(cat, t, fullview) {
  const base = fullview ? clamp(0.83 + 0.015 * (t - 2017.3), 0.83, 0.91) : clamp(0.52 + 0.022 * (t - 2008), 0.52, 0.73);
  return cat === 'tablet' ? Math.min(0.92, base + 0.08) : base;
}

// ---- Device evaluation -------------------------------------------------------------
function camModuleRaw(c, av, periscope) {
  const s = SENSORS[c.sensor];
  const pitch = Math.sqrt(s.area / c.mp);
  const quad = av.ok('cam_g6');
  const limit = quad && c.mp >= 40 ? 0.6 : 1.0;
  const noise = pitch < limit ? Math.pow(pitch / limit, 0.8) : 1;
  const bsi = av.ok('cam_g3') ? 1.15 : 1;
  return Math.pow(c.mp, 0.35) * Math.sqrt(s.area) * noise * (c.ois ? 1.1 : 1) * bsi * (periscope ? 1.3 : 1);
}
function cameraRaw(cams, av, media) {
  let r = camModuleRaw(cams.main, av) + 0.25 * camModuleRaw(cams.front, av);
  if (cams.ultra.on) r += 0.35 * camModuleRaw(cams.ultra, av);
  if (cams.tele.on) r += 0.4 * camModuleRaw(cams.tele, av, cams.tele.periscope);
  return r * (media ? 1.03 : 1);
}
function featurePoints(spec, chip) {
  const f = spec.feat;
  const modemGen = chip.modemGen || spec.modem || 1;
  return [0, 10, 20, 30][modemGen] + 6 * Math.log2(spec.memory.storage) + (f.nfc ? 4 : 0) + (f.stereo ? 4 : 0) + (f.jack ? 3 : 0) +
    (spec.memory.sd ? 3 : 0) + FINGERPRINT[f.fp].pts + (f.face3d ? 8 : 0) + (chip.media ? 3 : 0);
}

// Returns everything the UI/sim need to know about a device design at time t.
// chip: chip stats object (vendor chip or custom chip stats)
function evalPhone(spec, t, av, chip) {
  const cat = CATS[spec.cat];
  const d = spec.display, b = spec.battery, body = spec.body;
  const dt = DISPLAY_TECH[d.tech], mat = MATERIALS[body.mat], chem = CHEM[b.chem];
  const g = displayGeom(spec.cat, d.size, d.fullview);
  const stb = screenToBody(spec.cat, t, d.fullview);
  const bodyAreaIn2 = g.area / stb, bodyAreaCm2 = bodyAreaIn2 * 6.4516;
  const sideBezel = spec.cat === 'tablet' ? (d.fullview ? 0.22 : 0.38) : (d.fullview ? 0.07 : 0.16);
  const bodyW = g.w + sideBezel * 2, bodyH = bodyAreaIn2 / bodyW;
  const wh = b.mah * VOLTAGE / 1000;
  const battVol = wh / chem.whl * 1000;
  const techBase = Math.max(2.4, 5 - 0.26 * (t - 2008));   // board/stack miniaturization
  const thick = dt.stack + mat.shell + techBase + (battVol + cat.intVol) / bodyAreaCm2 * 10;
  const weight = bodyAreaCm2 * thick / 10 * mat.dens + wh * 4;
  const hzInfo = REFRESH.find(r => r.hz === d.hz) || REFRESH[0];
  const adaptive = d.tech === 'ltpo' || d.tech === 'tandem';
  const dispPower = g.area * 0.06 * dt.pwr * Math.pow(d.ppi / 300, 0.3) * (adaptive ? 1 : hzInfo.pwr);
  const integrated = chip.modemGen > 0;
  const modemGen = integrated ? chip.modemGen : (spec.modem || 1);
  const avgPower = cat.basePower + dispPower + chip.power * 0.12 + (integrated ? 0.08 : 0.2);
  const hours = wh / avgPower;
  const budget = (2.0 + 0.17 * (t - 2008)) * mat.therm * Math.pow(bodyAreaCm2 / 70, 0.35);
  const sustain = Math.min(1, Math.pow(budget / chip.power, 0.6));
  const ppiQ = Math.pow(Math.min(d.ppi, 570), 0.5);
  const wpa = weight / bodyAreaCm2;
  const raw = {
    cpu: chip.cpu * (0.5 + 0.5 * sustain),
    gpu: chip.gpu * (0.3 + 0.7 * sustain),
    ai: chip.tops, isp: chip.isp, ram: spec.memory.ram,
    cam: cameraRaw(spec.cams, av, chip.media),
    disp: ppiQ * dt.q * hzInfo.q * (d.fullview ? 1.06 : 1),
    size: d.size,
    hours, charge: b.charge + (b.wireless ? 8 : 0),
    design: mat.q * Math.pow(8 / thick, 0.7) * Math.pow(1.3 / wpa, 0.35) * Math.pow(stb, 1.2) * (1 + WATER[body.water].q),
    feat: featurePoints(spec, chip), modem: modemGen,
  };
  // ---- bill of materials (supplier prices) ----
  const nCams = camerasList(spec.cams).length;
  const bom = {
    chip: chip.kind === 'vendor' ? vendorChipPrice(chip, t) : null,   // custom chips priced by the sim
    modem: integrated ? 0 : discreteModemPrice(modemGen, t),
    display: displayPrice(d, spec.cat, t),
    camera: camerasPrice(spec.cams, t),
    battery: batteryPrice(b, t),
    memory: memoryPrice(spec.memory, t),
    body: bodyPrice(body, bodyAreaCm2, t) + featuresPrice(spec.feat, t),
    misc: cat.misc,
    assembly: cat.assembly + (nCams - 2),
  };
  return {
    raw, bom, nCams, thick, weight, hours, sustain, budget, avgPower, wh,
    dims: { w: bodyW, h: bodyH, screenW: g.w, screenH: g.h, stb, aspect: g.aspect, bodyAreaCm2 },
    res: [Math.round(g.w * d.ppi / 8) * 8, Math.round(g.h * d.ppi / 8) * 8],
    chipPower: chip.power, modemGen, integrated,
  };
}

// ---- Flagship reference ("100 points" for each score) ----------------------------------
function bestOf(list, av) { return list.find(x => av.ok(x)) || null; }
function camCaps(av) {
  let gen = CAM_GENS[0];
  for (const gg of CAM_GENS) if (av.ok(gg[0])) gen = gg;
  return { maxSensor: gen[1], maxMP: gen[2] };
}
function memCaps(av) {
  let gen = MEM_GENS[0];
  for (const gg of MEM_GENS) if (av.ok(gg[0])) gen = gg;
  return { ram: gen[1], storage: gen[2] };
}
function ppiCap(av) { let p = 0; for (const [id, v] of PPI_CAPS) if (av.ok(id)) p = Math.max(p, v); return p; }
function bestMP(sensor, maxMP, av) {
  const quad = av.ok('cam_g6');
  let best = MP_OPTIONS[0];
  for (const mp of MP_OPTIONS) {
    if (mp > maxMP) break;
    const pitch = Math.sqrt(SENSORS[sensor].area / mp);
    if (pitch >= (quad && mp >= 40 ? 0.6 : 1.0)) best = mp;
  }
  return best;
}
function flagshipSpec(cat, t) {
  const av = marketAv(t);
  const chip = flagshipChip(t);
  const cc = camCaps(av), mc = memCaps(av);
  const tech = ['tandem', 'ltpo', 'amoled', 'ips', 'tn'].find(k => av.ok(DISPLAY_TECH[k].tech));
  const hz = [...REFRESH].reverse().find(r => av.ok(r.tech)).hz;
  const multi = av.ok('cam_multi') && (cat === 'phone' || t >= 2020);
  const subS = Math.max(0, cc.maxSensor - 3);
  const ramIdx = RAM_OPTIONS.indexOf(mc.ram);
  return {
    cat, chip: { kind: 'vendor', id: chip.id },
    display: { tech, size: +prefSize(cat, t).toFixed(1), ppi: Math.min(ppiCap(av), cat === 'tablet' ? 300 : 460), hz, fullview: av.ok('disp_fullview') },
    cams: {
      main: { sensor: cc.maxSensor, mp: bestMP(cc.maxSensor, cc.maxMP, av), ois: av.ok('cam_ois') },
      ultra: { on: multi, sensor: subS, mp: bestMP(subS, Math.min(cc.maxMP, 12), av) },
      tele: { on: multi && cat === 'phone', periscope: av.ok('cam_periscope'), sensor: subS, mp: bestMP(subS, Math.min(cc.maxMP, 12), av), ois: av.ok('cam_ois') },
      front: { sensor: Math.min(2, cc.maxSensor), mp: bestMP(Math.min(2, cc.maxSensor), Math.min(cc.maxMP, 12), av) },
    },
    battery: { mah: Math.round(interp(CATS[cat].flagMah, t) / 50) * 50, chem: ['sic', 'hv', 'lipo', 'liion'].find(k => av.ok(CHEM[k].tech)),
      charge: [...CHARGE].reverse().find(c => av.ok(c.tech)).w, wireless: av.ok('bat_wireless') },
    memory: { ram: RAM_OPTIONS[Math.max(0, ramIdx - (t > 2012 ? 1 : 0))], storage: Math.max(16, mc.storage / 2), sd: false },
    body: { mat: ['ti', 'steel', 'glass', 'alu', 'plastic'].find(k => av.ok(MATERIALS[k].tech)), water: ['ip68', 'ip67', 'ip53'].find(k => av.ok(WATER[k].tech)) },
    feat: { fp: ['ud', 'side', 'rear', 'none'].find(k => av.ok(FINGERPRINT[k].tech)), face3d: av.ok('feat_face3d'), nfc: av.ok('feat_nfc'),
      stereo: av.ok('feat_stereo'), jack: t < 2017 },
    modem: 0, price: segBudget(cat, 'ultra', t),
  };
}
// What a rival ships in a segment: the flagship, downgraded part by part.
function rivalSpec(cat, seg, t) {
  const av = marketAv(t);
  const fs = JSON.parse(JSON.stringify(flagshipSpec(cat, t)));
  if (seg === 'ultra') return fs;
  const lvl = { budget: 0, mid: 1, premium: 2 }[seg];
  const chips = vendorChipsAvailable(t);
  const best = list => list.sort((a, b) => b.cpu - a.cpu)[0];
  const flags = chips.filter(c => c.tier === 'flagship').sort((a, b) => b.cpu - a.cpu);
  const chip = seg === 'premium' ? (flags[1] || flags[0]) : best(chips.filter(c => c.tier === seg)) || flags[0];
  fs.chip = { kind: 'vendor', id: chip.id };
  const since = id => t - TECH[id].market;
  const d = fs.display;
  if (seg === 'budget') d.tech = t >= 2019 ? 'amoled' : av.ok('disp_ips') ? 'ips' : 'tn';
  else if (seg === 'mid') d.tech = t >= 2015 ? 'amoled' : av.ok('disp_ips') ? 'ips' : 'tn';
  else d.tech = av.ok('disp_amoled') ? (av.ok('disp_ltpo') && since('disp_ltpo') > 2 ? 'ltpo' : 'amoled') : av.ok('disp_ips') ? 'ips' : 'tn';
  d.size = +(d.size - [0.3, 0.1, 0][lvl] * CATS[cat].budget).toFixed(1);
  d.ppi = Math.round(ppiCap(av) * [0.62, 0.8, 0.92][lvl] / 10) * 10;
  const hzI = REFRESH.findIndex(r => r.hz === d.hz);
  d.hz = REFRESH[Math.max(0, hzI - (2 - lvl))].hz;
  d.fullview = av.ok('disp_fullview') && since('disp_fullview') >= [1.5, 0.7, 0][lvl];
  const cc = camCaps(av), cams = fs.cams;
  const ms = Math.max(0, cc.maxSensor - (3 - lvl));
  cams.main = { sensor: ms, mp: bestMP(ms, cc.maxMP, av), ois: av.ok('cam_ois') && since('cam_ois') >= [99, 4, 0][lvl] };
  const multi = av.ok('cam_multi') ? since('cam_multi') : -1;
  cams.ultra.on = cams.ultra.on && multi >= [2.5, 1.5, 0][lvl];
  cams.tele.on = cams.tele.on && seg === 'premium' && multi >= 1;
  cams.tele.periscope = false;
  cams.front = { sensor: Math.min(lvl, cc.maxSensor), mp: bestMP(Math.min(lvl, cc.maxSensor), Math.min(cc.maxMP, 8 + lvl * 2), av) };
  const b = fs.battery;
  b.mah = Math.round(b.mah * [1.05, 1.0, 0.97][lvl] / 50) * 50;
  if (seg === 'budget') b.chem = ({ sic: 'hv', hv: 'lipo', lipo: 'liion', liion: 'liion' })[b.chem];
  const chI = CHARGE.findIndex(c => c.w === b.charge);
  b.charge = CHARGE[Math.max(0, chI - (2 - lvl))].w;
  b.wireless = b.wireless && seg === 'premium';
  const mc = memCaps(av), ri = RAM_OPTIONS.indexOf(mc.ram);
  fs.memory = { ram: RAM_OPTIONS[Math.max(0, ri - (3 - lvl))], storage: Math.max(4, mc.storage / [8, 4, 2][lvl]), sd: seg !== 'premium' };
  const body = fs.body;
  if (seg === 'budget') body.mat = 'plastic';
  else if (seg === 'mid') body.mat = t >= 2019 && av.ok('body_glass') ? 'glass' : t >= 2013 && av.ok('body_alu') ? 'alu' : 'plastic';
  else if (body.mat === 'steel' || body.mat === 'ti') body.mat = 'glass';
  body.water = seg === 'budget' ? (t >= 2018 ? 'ip53' : 'none') : seg === 'mid' ? (t >= 2020 && av.ok('body_ip67') ? 'ip67' : 'ip53') : body.water;
  const f = fs.feat;
  if (seg === 'budget') f.fp = t >= 2016 && av.ok('feat_fp') ? 'rear' : 'none';
  if (seg === 'mid') f.fp = t >= 2018 && av.ok('feat_fpside') ? 'side' : t >= 2015 && av.ok('feat_fp') ? 'rear' : 'none';
  f.face3d = false;
  f.nfc = av.ok('feat_nfc') && t >= [2018, 2014, 0][lvl];
  f.stereo = f.stereo && seg === 'premium';
  f.jack = t < [2040, 2020, 2017][lvl];
  return fs;
}
const _refCache = {};
function getRefs(cat, t) {
  const key = cat + '|' + Math.floor(t * 12);
  if (_refCache[key]) return _refCache[key];
  const tm = Math.floor(t * 12) / 12;
  const spec = flagshipSpec(cat, tm);
  const chip = vendorChipById(spec.chip.id);
  const ev = evalPhone(spec, tm, marketAv(tm), chip);
  const r = Object.assign({}, ev.raw);
  _refCache[key] = r;
  return r;
}

// ---- Scores ----------------------------------------------------------------------
// Each sub-score is 100 = "matches today's flagship". Above 100 you are ahead of the market.
function subscores(raw, cat, t) {
  const R = getRefs(cat, t);
  const cpuN = 100 * raw.cpu / R.cpu, gpuN = 100 * raw.gpu / R.gpu;
  const ramN = 100 * Math.log2(raw.ram / 64) / Math.log2(R.ram / 64);
  const perf = R.ai > 0 ? 0.42 * cpuN + 0.33 * gpuN + 0.10 * (100 * raw.ai / R.ai) + 0.15 * ramN : 0.47 * cpuN + 0.38 * gpuN + 0.15 * ramN;
  const ispF = r => (r > 0 ? 0.75 + 0.25 * Math.min(1.4, r) : 0.6);
  const cam = 100 * raw.cam * ispF(raw.isp / R.isp) / R.cam;
  const disp = 100 * raw.disp / R.disp * (0.45 + 0.55 * sizeScore(cat, raw.size, t));
  const batt = 85 * Math.pow(raw.hours / R.hours, 0.85) + 15 * Math.pow(raw.charge / R.charge, 0.4);
  const design = 100 * raw.design / R.design;
  const feat = 100 * raw.feat / R.feat - 25 * Math.max(0, R.modem - raw.modem);
  const s = { perf, cam, disp, batt, design, feat };
  for (const k in s) s[k] = Math.max(0, s[k]);
  return s;
}
const soft = x => (x <= 100 ? x : Math.min(180, 100 + (x - 100) * 0.5));
function segQuality(subs, seg) {
  const w = SEG_INFO[seg].w;
  let q = 0;
  for (const k in w) q += w[k] * soft(subs[k]);
  return q;
}
// buyer utility in a segment; null when the price is outside what these buyers consider
function utility(t, q, price, cat, seg, aware, rep, novelty, review) {
  const B = segBudget(cat, seg, t), si = SEG_INFO[seg];
  if (price > 1.7 * B || price < 0.3 * B) return null;
  const lp = Math.log(price / B);
  return si.a * q / 10 - 3 * si.b * (lp > 0 ? lp : lp * si.under) + 1.15 * Math.log(Math.max(0.002, aware)) + 0.3 * (rep - 6.5) + 0.3 * ((review || rep) - 6.5) + (novelty || 0);
}
const SUB_LABELS = { perf: 'Performance', cam: 'Camera', disp: 'Display', batt: 'Battery', design: 'Design', feat: 'Features' };
