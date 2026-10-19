'use strict';
// ============================================================================
//  Parts Lab: engineer your own displays, camera modules, battery cells,
//  memory packages and radio modules. Each part has its own real-world design
//  system (layer stacks, optics, electrochemistry, die stacking, network
//  standards), a live visualization, design-rule checks and a comparison with
//  what a supplier would sell you. Engineering a design costs tooling money
//  and time; afterwards it can be used in the Phone Lab.
// ============================================================================

const LAB_TABS = [['display', '🖥️', 'Display'], ['camera', '📷', 'Camera'], ['battery', '🔋', 'Battery'], ['memory', '💾', 'Memory'], ['radio', '📶', 'Radio']];
const LAB_NOUN = { display: 'Panel', camera: 'Optic', battery: 'Cell', memory: 'Mem', radio: 'RF' };
const LAB_FMT = {};       // slider path -> formatter (for live labels)

// ---- small helpers ----------------------------------------------------------------
// In the labs you may use anything you have researched – pre-market tech is "exclusive"
function labUI(id) {
  if (!id || !TECH[id]) return { ok: true };
  const av = playerAv();
  if (av.has(id)) return { ok: true, ex: !av.market(id) };
  return techUI(id);
}
// research footer; in narrow card grids just the price and time (full text in the tooltip)
function labFoot(u, compact) {
  if (!compact || u.ok || !u.rs) return lockFoot(u);
  const tc = TECH[u.rs];
  return `<button class="btn sm oc-rs" data-rs="${u.rs}" title="${esc(u.msg)}">🔬 ${fmtMoney(researchCost(tc))} · ${researchDays(tc)}d</button>`;
}
// keep the menu short: everything researched (last few) plus the next couple of steps
function labWindow(opts, value, keepOk, extra) {
  const has = playerAv().has;
  let last = -1;
  opts.forEach((o, i) => { if (!o.tech || has(o.tech)) last = i; });
  return opts.filter((o, i) => String(o.v) === String(value) || (i <= last && i > last - (keepOk || 99)) || (i > last && i <= last + (extra == null ? 2 : extra)));
}
function labCards(path, options, value, cols) {
  const compact = (cols || 2) >= 3;
  return `<div class="ocards" style="--cols:${cols || 2}">` + options.map(o => {
    const u = o.disabled ? { ok: false, msg: o.disabled } : labUI(o.tech);
    const sel = String(o.v) === String(value);
    const tip = o.tip || (o.tech && TECH[o.tech] ? TECH[o.tech].desc : '');
    return `<div class="ocard ${sel ? 'on' : ''} ${u.ok ? '' : 'locked'} ${u.ex ? 'ex' : ''}" ${u.ok ? `data-pick="${path}" data-v="${esc(o.v)}"` : ''} title="${esc(tip)}">
      <div class="oc-t">${o.title}</div>${o.sub ? `<div class="oc-s">${o.sub}</div>` : ''}${labFoot(u, compact)}</div>`;
  }).join('') + '</div>';
}
function labToggle(path, title, sub, tech, value, disabledMsg) {
  const u = labUI(tech);
  const dis = !u.ok || disabledMsg;
  return `<div class="ocard tog ${value ? 'on' : ''} ${dis ? 'locked' : ''} ${u.ex ? 'ex' : ''}" ${dis ? '' : `data-toggle="${path}"`} title="${esc(tech && TECH[tech] ? TECH[tech].desc : '')}">
    <div class="row between"><div class="oc-t">${title}</div><span class="sw ${value ? 'on' : ''}"></span></div>
    ${sub ? `<div class="oc-s">${sub}</div>` : ''}${disabledMsg && u.ok ? `<span class="oc-lock">${esc(disabledMsg)}</span>` : lockFoot(u)}</div>`;
}
// slider gated by a research ladder [[tech, max], ...] (only researched steps count)
function labSlider(path, label, min, max, step, value, fmt, ladder, scale, hint) {
  LAB_FMT[path] = fmt;
  const has = playerAv().has;
  const next = ladder ? ladder.find(([id]) => id && !has(id)) : null;
  const u = next ? labUI(next[0]) : null;
  return `<div class="cap">
    <div class="row between"><span class="dim small">${label}</span><b class="mono" data-show="${path}">${fmt(value)}</b></div>
    <input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${value}" ${min >= max ? 'disabled' : ''}>
    <div class="row between tiny faint"><span>${fmt(min)}</span><span>${hint ? esc(hint) : 'max ' + fmt(max)}</span></div>
    ${next ? `<div class="cap-next"><span class="tiny">Next: <b>${TECH[next[0]].name}</b> → ${fmt(next[1] * (scale || 1))}</span>${lockFoot(u)}</div>` : ''}
  </div>`;
}
const labRows = rows => `<div class="spec-list">${rows.filter(Boolean).map(([k, v, cls, tip]) => `<span class="k" ${tip ? `title="${esc(tip)}"` : ''}>${k}</span><span class="v ${cls || ''}">${v}</span>`).join('')}</div>`;
const labRules = rules => (rules || []).map(r => `<div class="note ${r.err ? 'bad' : 'warn'}">${r.err ? '⛔' : '⚠️'} ${esc(r.text)}</div>`).join('');
function dieLabel(mbit) {
  if (mbit >= 1048576) return (mbit / 1048576) + ' Tb';
  if (mbit >= 1024) return (mbit / 1024) + ' Gb';
  if (mbit >= 1) return mbit + ' Mb';
  return Math.round(mbit * 1024) + ' Kb';
}
const fmtMm = v => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' mm';
function labForm() { return S.draft ? formOf(S.draft) : 'candybar'; }
function labCat() { return S.draft ? S.draft.cat : 'phone'; }
function labEval(type, p, role, t) {
  t = t == null ? now() : t;
  if (!p) return null;
  if (type === 'camera') return evalCamera(p, t, role);
  if (type === 'radio') return evalRadio(p, t, false);
  return PART_EVAL[type](p, t);
}
function bumpName(n) {
  const m = /^(.*?)(\d+)$/.exec(n);
  if (m) return m[1] + (+m[2] + 1);
  const v = / v(\d+)$/.exec(n);
  return v ? n.replace(/ v\d+$/, ' v' + (+v[1] + 1)) : n + ' v2';
}
// a seeded PRNG so procedural art stays stable between redraws
function labRng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ---- default drafts ---------------------------------------------------------------------
function labDefaultParams(type, role) {
  const av = playerAv(), t = now(), has = av.has;
  const form = labForm(), cat = labCat();
  switch (type) {
    case 'display': { const p = stdDisplay(form === 'car' || form === 'bag' ? 'candybar' : form, cat, t, has, 2); return p.emit === 'none' ? stdDisplay('candybar', cat, t, () => true, 0) : p; }
    case 'camera': return stdCamera(role || 'main', t, has, 2);
    case 'battery': return stdBattery(form === 'car' ? 'candybar' : form, cat, t, has, 2);
    case 'memory': return stdMemory(t, has, 2);
    case 'radio': return stdRadio(t, has, 2, null, form);
  }
  return null;
}
function labNextName(type) {
  const brand = (S.company || 'Nimbus').split(' ')[0];
  let n = S.designs.filter(d => d.type === type).length + 1;
  const used = new Set(S.designs.map(d => d.name));
  while (used.has(`${brand} ${LAB_NOUN[type]} ${n}`)) n++;
  return `${brand} ${LAB_NOUN[type]} ${n}`;
}

const PartsLab = {
  name: 'Parts Lab', icon: '🛠️', live: false, tab: 'display', night: false, pending: 0,

  draft(type) {
    if (!S.partDrafts) S.partDrafts = {};
    let dr = S.partDrafts[type];
    if (!dr) {
      dr = { name: labNextName(type), p: null, role: type === 'camera' ? 'main' : null };
      S.partDrafts[type] = dr;
    }
    if (!dr.p) dr.p = labDefaultParams(type, dr.role);
    if (dr.p) this.fix(type, dr);
    return dr;
  },

  // keep a draft physically consistent after every change
  fix(type, dr) {
    const p = dr.p, has = playerAv().has;
    if (!p) return;
    if (type === 'display') {
      if (!DISP_EMIT[p.emit] || p.emit === 'none') p.emit = 'led';
      const em = DISP_EMIT[p.emit];
      if (!em.matrices.includes(p.matrix)) p.matrix = em.matrices.find(m => has(DISP_MATRIX[m].tech)) || em.matrices[0];
      if (em.emissive) p.bl = 'none';
      if (!DISP_BL[p.bl]) p.bl = 'none';
      if (!DISP_TOUCH[p.touch]) p.touch = 'none';
      if (!DISP_COVER[p.cover]) p.cover = 'acrylic';
      if (!DISP_SHAPE[p.shape]) p.shape = 'bezel';
      if (!REFRESH.some(r => r.hz === p.hz)) p.hz = 60;
      if (p.matrix === 'segment') { p.color = false; p.touch = 'none'; p.ppi = 0; p.hz = 60; }
      else if (!p.ppi || p.ppi < 60) p.ppi = 80;
      if (em.emissive && p.emit !== 'led') p.color = true;
      const lim = this.dispLimits(p);
      p.size = +clamp(p.size || 1, lim.sizeMin, lim.sizeMax).toFixed(1);
      if (p.matrix !== 'segment') p.ppi = clamp(Math.round(p.ppi / 10) * 10, 60, lim.ppiMax);
      p.drive = +clamp(p.drive || 1, 0.6, lim.driveMax).toFixed(2);
      if (!p.aspect) p.aspect = 1.25;
    } else if (type === 'camera') {
      const r = CAM_ROLES[dr.role] || CAM_ROLES.main;
      if (!CAM_ROLES[dr.role]) dr.role = 'main';
      p.focal = clamp(Math.round(p.focal || r.dflt), r.focal[0], r.focal[1]);
      if (dr.role !== 'tele') p.periscope = false;
      if (!CAM_MP.includes(p.mp)) p.mp = CAM_MP[0];
      if (!APERTURES.includes(p.ap)) p.ap = 2.8;
      p.lens = clamp(Math.round(p.lens || 1), 1, 8);
      p.fmt = clamp(p.fmt | 0, 0, CAM_FORMATS.length - 1);
    } else if (type === 'battery') {
      const c = CHEM[p.chem] || CHEM.nicd;
      if (!CHEM[p.chem]) p.chem = 'nicd';
      if (c.nickel) { p.volt = 0; p.dual = false; if (BAT_FORMAT[p.fmt].lithium) p.fmt = has('bat_prism') ? 'prism' : 'cyl'; }
      p.dgen = c.nickel ? 0 : DENSITY_STEPS.filter(id => has(id)).length;
      p.safetySys = has('bat_safety');
      const lim = this.batLimits();
      p.mah = clamp(Math.round(p.mah / 50) * 50, lim.min, lim.max);
      p.elec = clamp(+p.elec || 0, 0, 1); p.safety = clamp(+p.safety || 0, 0, 1);
      if (!CHARGE.some(c2 => c2.w === p.charge)) p.charge = 3;
      if (!WIRELESS[p.wireless]) p.wireless = 'none';
    } else if (type === 'memory') {
      if (!DRAM_GENS[p.gen]) p.gen = 'sram';
      p.ramN = clamp(Math.round(p.ramN || 1), 1, 16);
      p.ramDie = clamp(p.ramDie | 0, 0, DRAM_DIES.length - 1);
      p.flDie = clamp(p.flDie | 0, 0, FLASH_DIES.length - 1);
      p.flN = p.flDie ? clamp(Math.round(p.flN || 1), 1, 16) : 0;
      if (!p.flDie) p.iface = 'par';
      if (!FLASH_CELL[p.cell]) p.cell = 'slc';
      if (!STORAGE_IF[p.iface]) p.iface = 'par';
      p.stack = clamp(Math.round(p.stack || 1), 1, ladderCap(STACK_CAPS, has));
    } else if (type === 'radio') {
      p.stds = (p.stds || []).filter(s => NET_STDS[s]).sort((a, b) => NET_ORDER.indexOf(a) - NET_ORDER.indexOf(b));
      p.bands = clamp(Math.round(p.bands || 1), 1, ladderCap(BAND_CAPS, has));
      if (!MIMO.some(m => m.n === p.mimo)) p.mimo = 1;
      if (!CARRIER_AGG.some(c => c.n === p.ca)) p.ca = 1;
      if (!ANTENNAS[p.ant]) p.ant = 'whip';
      if (!PAS[p.pa]) p.pa = 'si';
    }
  },
  dispLimits(p) {
    const has = playerAv().has;
    const tablet = labCat() === 'tablet';
    const cap = tablet ? ladderCap(TABLET_SIZE_CAPS, has) : ladderCap(DISP_SIZE_CAPS, has);
    let sizeMin = 0.6, sizeMax = cap;
    if (p.fold) { sizeMin = 7.0; sizeMax = 8.1; }
    else if (tablet) { sizeMin = 7.0; sizeMax = Math.max(7.0, cap); }
    else if (p.matrix === 'segment') sizeMax = Math.min(cap, 2.2);
    else if (DISP_MATRIX[p.matrix].sizeMax) sizeMax = Math.min(cap, DISP_MATRIX[p.matrix].sizeMax);
    sizeMax = Math.max(sizeMin, sizeMax);
    const ppiMax = Math.max(60, Math.min(ladderCap(PPI_CAPS, has), DISP_MATRIX[p.matrix].ppiMax || 60));
    return { sizeMin, sizeMax, ppiMax, driveMax: has('disp_hbm') ? 1.4 : 1.0, cap };
  },
  batLimits() {
    const has = playerAv().has, form = labForm(), cat = labCat();
    const f = form === 'car' ? 'candybar' : form;
    return { min: cat === 'tablet' ? 2000 : 300, max: batteryCap(f, cat, has), scale: f === 'bag' ? 6 : cat === 'tablet' ? 2.2 : 1 };
  },

  // ---- render -----------------------------------------------------------------------
  render(el) {
    const type = this.tab;
    const dr = this.draft(type);
    const info = PART_INFO[type];
    el.innerHTML = `
      <div class="view-title"><h1>🛠️ Parts Lab</h1><p>Engineer your own components instead of buying standard parts. Every part type has its own real-world design system.</p></div>
      <div class="lab-tabs">${LAB_TABS.map(([id, ic, nm]) => {
        const n = S.designs.filter(d => d.type === id).length;
        return `<button class="lab-tab ${id === type ? 'on' : ''}" data-labtab="${id}"><span class="lab-tab-ic">${ic}</span><span>${nm}</span>${n ? `<span class="lab-tab-n">${n}</span>` : ''}</button>`;
      }).join('')}</div>
      ${dr.p ? `<div class="lab3">
        <section class="lab-ctl card">
          <div class="lab-name"><span class="dim small">${info.icon} ${info.name} design</span>
            <input type="text" id="labName" value="${esc(dr.name)}" maxlength="28" placeholder="Name your design"></div>
          ${this['ctl_' + type](dr)}
        </section>
        <section class="lab-viz" id="labViz"></section>
        <aside class="lab-side" id="labSide"></aside>
      </div>` : this.lockedTab(type)}
      <div class="card mt" id="labDesigns">${this.designsList(type)}</div>`;
    this.bind(el);
    if (dr.p) this.refresh(true);
  },
  lockedTab(type) {
    if (type === 'camera') {
      const u = techUI('cam_cmos');
      return `<div class="card lab-locked"><div class="lab-locked-ic">📷</div><div><h2>No camera technology yet</h2>
        <p class="dim">Phones get cameras when tiny CMOS image sensors become possible (standard from ${dateLabel(TECH.cam_cmos.market)}). ${suppliedOnly(TECH.cam_cmos) ? 'Your suppliers bring them then, and you can start designing optics.' : 'Research the CMOS camera module to start designing optics.'}</p>
        <div class="mt-s">${lockFoot(u) || ''}</div></div></div>`;
    }
    return '<div class="card">Nothing to design yet.</div>';
  },
  // refresh the visualization and stats (not the controls) – used while dragging sliders
  refresh(now_) {
    const run = () => {
      this.pending = 0;
      const type = this.tab, dr = S.partDrafts[type];
      if (!dr || !dr.p || !$('#labViz')) return;
      const st = labEval(type, dr.p, dr.role);
      $('#labViz').innerHTML = this['viz_' + type](dr, st);
      $('#labSide').innerHTML = this.side(type, dr, st);
      if (this['draw_' + type]) this['draw_' + type](dr, st);
    };
    if (now_) { run(); return; }
    if (!this.pending) this.pending = requestAnimationFrame(run);
  },

  // ---- right column: stats, compare, exclusivity, engineer ----------------------------
  side(type, dr, st) {
    const p = dr.p, t = now();
    const av = playerAv();
    const excl = PART_TECHS[type](p, dr.role).filter(id => TECH[id] && av.has(id) && t < TECH[id].market);
    const plant = factoryActive(type);
    const base = st ? st.cost : 0;
    const contract = excl.length ? null : base * CONTRACT_MARKUP * supplyMul();
    const own = plant ? base * perk('inMul', 1) : null;
    const probs = designProblems(type, p, dr.role);
    if (!dr.name || !dr.name.trim()) probs.unshift('Name your design.');
    const cost = designCost(type), days = designDays(type);
    // the supplier's standard equivalent
    let stdP = null;
    const form = labForm(), cat = labCat();
    if (type === 'display') stdP = stdDisplay(form === 'car' || form === 'bag' ? 'candybar' : form, cat, t, av.std, 2);
    if (type === 'camera') stdP = stdCamera(dr.role, t, av.std, 2);
    if (type === 'battery') stdP = stdBattery(form === 'car' ? 'candybar' : form, cat, t, av.std, 2);
    if (type === 'memory') stdP = stdMemory(t, av.std, 2);
    if (type === 'radio') stdP = stdRadio(t, av.std, 2, null, form);
    if (stdP && type === 'display' && stdP.emit === 'none') stdP = null;
    const sst = stdP ? labEval(type, stdP, dr.role) : null;
    const key = this.keyStats(type, p, st, dr.role);
    const skey = sst ? this.keyStats(type, stdP, sst, dr.role) : null;
    return `
      <div class="card"><h2>${PART_INFO[type].icon} Specs</h2>${this['stats_' + type](dr, st)}</div>
      <div class="card"><h2>⚖️ vs. supplier standard</h2>
        ${sst ? `<table class="tbl lab-cmp"><thead><tr><th></th><th class="num">${esc(SUPPLIERS[type])}</th><th class="num">Yours</th></tr></thead><tbody>
          ${key.map((k, i) => `<tr><td class="dim">${k[0]}</td><td class="num">${skey[i][1]}</td><td class="num ${k[2] == null ? '' : k[2](k[3], skey[i][3]) ? 'good' : 'bad'}"><b>${k[1]}</b></td></tr>`).join('')}
          <tr><td class="dim">Price per unit</td><td class="num">${fmtMoney(sst.cost * SUPPLIER_MARKUP * supplyMul())}</td><td class="num"><b>${fmtMoney(own != null ? own : contract != null ? contract : base)}</b></td></tr>
          </tbody></table>
          <div class="tiny faint mt-s">Standard part: ${esc(partSummary(type, stdP, dr.role))}. Suppliers add a ${Math.round((SUPPLIER_MARKUP - 1) * 100)}% markup.</div>`
        : `<div class="note">Suppliers don't sell any ${PART_INFO[type].name.toLowerCase()} you could use yet – designing your own is the only way.</div>`}
        <div class="lab-prices mt-s">
          <div><span class="tiny faint">Contract maker ×${CONTRACT_MARKUP}</span><b>${contract != null ? fmtMoney(contract) : '—'}</b></div>
          <div><span class="tiny faint">Your ${FACTORY_TYPES[type].name}</span><b class="${plant ? 'good' : 'faint'}">${own != null ? fmtMoney(own) : 'not built'}</b></div>
        </div>
      </div>
      ${excl.length ? `<div class="note lab-excl">◆ <b>Exclusive tech:</b> ${excl.slice(0, 4).map(id => esc(TECH[id].name)).join(', ')}${excl.length > 4 ? '…' : ''}. Nobody else can make this yet –
        only your own <b>${FACTORY_TYPES[type].name}</b> can build it ${plant ? '<span class="good">(you have one ✓)</span>' : `(build one in 🏭 Factories · ${fmtMoney(factoryBuildCost(type))})`}.</div>` : ''}
      <div class="card lab-eng">
        ${labRules(st && st.rules)}
        ${probs.filter(x => !(st && st.rules || []).some(r => r.err && r.text === x)).map(x => `<div class="note bad">⛔ ${esc(x)}</div>`).join('')}
        <button class="btn primary lg lab-go" data-act="engineer" ${probs.length ? 'disabled' : ''} title="${esc(probs[0] || '')}">🛠️ Engineer & tool up · ${fmtMoney(cost)} · ${days} d</button>
        <div class="tiny faint">Prototypes, validation and production tooling. Then the design shows up in the Phone Lab under “Your designs”.
          Own designs skip the supplier markup (contract makers charge ×${CONTRACT_MARKUP}, your own plant builds at cost), can use exclusive tech, and let you tune what suppliers keep standard.</div>
      </div>`;
  },
  // [label, formatted, better(a,b)?, raw]
  keyStats(type, p, st, role) {
    const eps = b => Math.abs(b) * 0.001 + 1e-9, hi = (a, b) => a >= b - eps(b), lo = (a, b) => a <= b + eps(b);
    if (!st) return [];
    switch (type) {
      case 'display': return [['DisplayMark', Math.round(st.score), hi, st.score], ['Brightness', Math.round(st.nits) + ' nits', hi, st.nits], ['Power', st.power.toFixed(2) + ' W', lo, st.power], ['Stack', fmtMm(st.stack), lo, st.stack]];
      case 'camera': return [['CameraMark', Math.round(st.score), hi, st.score], ['Effective MP', st.effMP.toFixed(st.effMP < 10 ? 1 : 0), hi, st.effMP], ['Low light', st.light.toFixed(1) + ' stops', hi, st.light], ['Module height', fmtMm(st.z), lo, st.z]];
      case 'battery': return [['Energy', st.wh.toFixed(1) + ' Wh', hi, st.wh], ['Volume', st.volume.toFixed(1) + ' cm³', lo, st.volume], ['Charge 0–100%', Math.round(st.chargeMin) + ' min', lo, st.chargeMin], ['Risk', st.risk.toFixed(1) + '/M', lo, st.risk]];
      case 'memory': return [['RAM', fmtMB(st.ramMB), hi, st.ramMB], ['Storage', fmtMB(st.storageMB), hi, st.storageMB], ['Bandwidth', st.bw + ' GB/s', hi, st.bw], ['Packages', st.pkgs, lo, st.pkgs]];
      case 'radio': {
        const cov = radioCoverage(p.stds, now(), p.bands, s => stdPeak(s, p));
        return [['Coverage', fmtPct(cov.total, 0), hi, cov.total], ['Real speed', fmtSpeed(cov.speed), hi, cov.speed], ['Power', st.power.toFixed(2) + ' W', lo, st.power], ['Standards', p.stds.length, null, p.stds.length]];
      }
    }
    return [];
  },

  // ---- designs list -------------------------------------------------------------------
  designsList(type) {
    const list = S.designs.filter(d => d.type === type).slice().reverse();
    const head = `<h2>📁 Your ${PART_INFO[type].name.toLowerCase()} designs <span class="sub">${list.length ? list.length + ' engineered' : ''}</span></h2>`;
    if (!list.length) return head + `<div class="dim small">None yet. Tune the design above and hit <b>Engineer & tool up</b>.</div>`;
    const t = now();
    return head + `<div class="lab-dlist">${list.map(d => {
      const st = labEval(type, d.p, d.role, t);
      const excl = designExclusive(d);
      const score = type === 'display' ? `DisplayMark ${Math.round(st.score)}` : type === 'camera' ? `CameraMark ${Math.round(st.score)}` : type === 'battery' ? `${st.wh.toFixed(1)} Wh · risk ${st.risk.toFixed(1)}/M`
        : type === 'memory' ? `${st.bw} GB/s · ${Math.round(st.speed)} MB/s` : `${fmtPct(radioCoverage(d.p.stds, t, d.p.bands, s => stdPeak(s, d.p)).total, 0)} coverage`;
      const inUse = S.products.some(p => p.status !== 'retired' && [p.spec.display, p.spec.battery, p.spec.memory, p.spec.radio, ...Object.values(p.spec.cams || {})].some(r => r && r.src === 'own' && r.id === d.id));
      return `<div class="lab-drow" data-did="${d.id}">
        <div class="lab-dmain"><b>${esc(d.name)}</b> ${d.status === 'ready' ? '<span class="tag good">ready</span>' : `<span class="tag warn">engineering · ${Math.max(0, d.readyDay - S.day)} d</span>`}
          ${excl ? '<span class="tag excl">◆ exclusive</span>' : ''}${inUse ? '<span class="tag acc">in production</span>' : ''}${d.role ? `<span class="tag">${CAM_ROLES[d.role].name}</span>` : ''}
          <div class="tiny faint">${esc(partSummary(type, d.p, d.role))} · ${score} · cost ${fmtMoney(st.cost)} → ${excl ? 'own plant only' : fmtMoney(st.cost * CONTRACT_MARKUP) + ' contract'}</div></div>
        <div class="lab-dact"><button class="btn sm" data-act="revise" data-id="${d.id}">Load as revision</button>
          <button class="btn sm primary" data-act="use" data-id="${d.id}">Use in Phone Lab →</button></div></div>`;
    }).join('')}</div>`;
  },

  // ============================ DISPLAY ======================================
  ctl_display(dr) {
    const p = dr.p, lim = this.dispLimits(p);
    const em = DISP_EMIT[p.emit];
    const seg = p.matrix === 'segment';
    const emitOpts = DISP_EMIT_ORDER.filter(k => k !== 'none').map(k => {
      const e = DISP_EMIT[k];
      return { v: k, title: e.name, sub: `${e.emissive ? 'emissive' : 'needs light'} · ${e.matrices.map(m => DISP_MATRIX[m].name.replace(' matrix', '')).join('/')}`, tech: e.tech, tip: e.desc };
    });
    const matOpts = DISP_MATRIX_ORDER.map(k => {
      const m = DISP_MATRIX[k];
      return { v: k, title: m.name, sub: m.ppiMax ? `≤ ${m.ppiMax} ppi${m.vrr ? ' · 1–120 Hz' : ''}` : 'digits only', tech: m.tech, tip: m.desc,
        disabled: em.matrices.includes(k) ? null : `${em.name} can't use it` };
    });
    const sizeLadder = labCat() === 'tablet' ? TABLET_SIZE_CAPS : p.fold ? null : DISP_SIZE_CAPS;
    return `
      <h3>1 · Emitter / light modulator</h3>${labCards('p.emit', emitOpts, p.emit, 2)}
      <h3>2 · Backplane (pixel transistors)</h3>${labCards('p.matrix', matOpts, p.matrix, 2)}
      ${!em.emissive && !seg ? `<div class="mt-s">${labToggle('p.color', 'Color filter', 'Red, green and blue sub-pixels. Absorbs ~55% of the light.', 'disp_color', p.color)}</div>` : ''}
      ${!em.emissive ? `<h3>3 · Backlight</h3>${labCards('p.bl', Object.entries(DISP_BL).map(([k, b]) => ({ v: k, title: b.name, sub: b.desc, tech: b.tech })), p.bl, 3)}` : ''}
      <h3>Touch layer</h3>${labCards('p.touch', Object.entries(DISP_TOUCH).map(([k, tc]) => ({ v: k, title: tc.name, tech: tc.tech, disabled: seg && k !== 'none' ? 'Not on segments' : null })), p.touch, 2)}
      <h3>Cover lens</h3>${labCards('p.cover', DISP_COVER_ORDER.map(k => ({ v: k, title: DISP_COVER[k].name, sub: `drop ${Math.round(DISP_COVER[k].drop * 100)} · scratch ${Math.round(DISP_COVER[k].scratch * 100)}`, tech: DISP_COVER[k].tech })), p.cover, 2)}
      <h3>Geometry</h3>
      ${labSlider('p.size', 'Diagonal', lim.sizeMin, lim.sizeMax, 0.1, p.size, v => (+v).toFixed(1) + '"', sizeLadder, 1, lim.sizeMax < lim.cap ? `max ${lim.sizeMax}" on this backplane` : null)}
      ${labCards('p.aspect', ASPECTS.map(a => ({ v: a.a, title: a.name, sub: a.a.toFixed(2) })), p.aspect, 5)}
      ${seg ? '' : labSlider('p.ppi', 'Pixel density', 60, lim.ppiMax, 10, p.ppi, v => v + ' ppi', PPI_CAPS, 1, lim.ppiMax < ladderCap(PPI_CAPS, playerAv().has) ? `backplane max ${lim.ppiMax}` : null)}
      ${seg ? '' : `<h3>Refresh rate</h3>${labCards('p.hz', REFRESH.map(r => ({ v: r.hz, title: r.hz + ' Hz', tech: r.tech, disabled: r.hz > 60 && !['ltps', 'ltpo'].includes(p.matrix) ? 'Needs LTPS/LTPO' : null })), p.hz, 4)}`}
      <h3>Shape</h3>${labCards('p.shape', DISP_SHAPE_ORDER.map(k => ({ v: k, title: DISP_SHAPE[k].name, sub: DISP_SHAPE[k].oled ? 'OLED only' : '', tech: DISP_SHAPE[k].tech })), p.shape, 3)}
      <h3>Drive</h3>
      ${labSlider('p.drive', 'Brightness drive', 0.6, lim.driveMax, 0.05, p.drive, v => Math.round(v * 100) + '%', [[null, 1.0], ['disp_hbm', 1.4]], 1, 'more light = more power, shorter OLED life')}
      ${labToggle('p.fold', 'Foldable panel', 'Plastic OLED on a flexible substrate (7–8.1").', 'disp_fold', !!p.fold, ['oled', 'tandem'].includes(p.emit) ? null : 'Needs an OLED emitter')}`;
  },
  viz_display(dr, st) {
    const layers = st.layers || [];
    const total = layers.reduce((a, l) => a + l[2], 0) || 1;
    const colors = { Cover: '#9fd3ff', Touch: '#7fe0c6', Polarizer: '#b19cff', Emitter: '#ff9f6b', 'Liquid crystal': '#ffd36b', Backplane: '#8fa3c7', Backlight: '#fff3b0' };
    const gap = 6, scale = (190 - gap * layers.length) / total;
    let y = 14, ly = 0;
    const rows = layers.map(([nm, desc, th]) => {
      const h = Math.max(8, th * scale);
      const c = colors[nm] || '#aab';
      const cy = y + 8 + h / 2;
      ly = Math.max(ly + 30, cy);
      const r = `<g><path d="M30 ${y + 8} L64 ${y} L284 ${y} L250 ${y + 8} Z" fill="${c}" opacity=".55"/>
        <rect x="30" y="${y + 8}" width="220" height="${h}" fill="${c}" opacity=".88" rx="2"/>
        <path d="M250 ${y + 8} L284 ${y} L284 ${y + h} L250 ${y + 8 + h} Z" fill="${c}" opacity=".42"/>
        <path d="M288 ${cy} L300 ${cy} L310 ${ly}" class="lab-lead"/>
        <text x="316" y="${ly - 2}" class="lab-svg-t">${esc(nm)}</text>
        <text x="316" y="${ly + 12}" class="lab-svg-s">${desc ? esc(desc) + ' · ' : ''}${th.toFixed(2)} mm</text></g>`;
      y += h + gap;
      return r;
    }).join('');
    const H = Math.max(y + 10, ly + 24);
    const light = st.emissive ? 'light is made in the emitter layer' : DISP_BL[dr.p.bl].nits ? 'light starts in the backlight and passes up through every layer' : 'no backlight: room light reflects off a mirror behind the LCD';
    return `<div class="card"><h2>Layer stack <span class="sub">${st.stack.toFixed(2)} mm total</span></h2>
        <svg class="lab-svg" viewBox="0 0 560 ${H}" preserveAspectRatio="xMinYMin meet">${rows}</svg>
        <div class="tiny faint">Exploded cross-section, top = cover glass. ${esc(light)}.</div></div>
      <div class="card"><h2>Preview <span class="sub">${st.seg ? st.res[0] + ' digits' : st.res[0] + ' × ' + st.res[1] + ' px'} · ${Math.round(st.nits)} nits</span></h2>
        <div class="lab-dprev"><canvas id="labScreen" class="lab-screen"></canvas>
          <div class="lab-zoom"><canvas id="labPixels" width="150" height="150"></canvas><div class="tiny faint center">Pixel close-up</div></div></div></div>`;
  },
  stats_display(dr, st) {
    const p = dr.p;
    return labRows([
      ['Resolution', st.seg ? `${st.res[0]} digits` : `${st.res[0]} × ${st.res[1]}`],
      st.seg ? null : ['Pixel density', p.ppi + ' ppi'],
      ['Active area', `${st.w.toFixed(0)} × ${st.h.toFixed(0)} mm`],
      ['Brightness', Math.round(st.nits) + ' nits', st.nits < 60 ? 'warn' : ''],
      ['Contrast', st.contrast >= 1e5 ? '∞ (per-pixel)' : Math.round(st.contrast) + ':1'],
      ['Color gamut', st.gamut ? Math.round(st.gamut * 100) + '% sRGB' : 'monochrome'],
      ['Refresh', (p.hz || 60) + ' Hz' + (DISP_MATRIX[p.matrix].vrr ? ' (adaptive)' : '')],
      ['Average power', st.power.toFixed(2) + ' W'],
      ['Stack thickness', st.stack.toFixed(2) + ' mm'],
      ['Weight', st.weight.toFixed(1) + ' g'],
      ['Panel yield', Math.round(st.yield * 100) + '%', st.yield < 0.7 ? 'warn' : '', 'Bigger, denser and newer panels have more defects'],
      ['Drop / scratch', `${Math.round(st.drop * 100)} / ${Math.round(st.scratch * 100)}`],
      ['Unit cost (at cost)', fmtMoney(st.cost)],
      ['DisplayMark', '<b class="acc">' + Math.round(st.score) + '</b>'],
    ]);
  },
  draw_display(dr, st) {
    const cv = $('#labScreen'), px = $('#labPixels');
    if (!cv) return;
    const p = dr.p, e = DISP_EMIT[p.emit];
    const dpr = window.devicePixelRatio || 1;
    const maxW = Math.min(240, (cv.parentElement.clientWidth || 380) - 170);
    let w = Math.max(120, maxW), h = w * p.aspect;
    if (h > 300) { h = 300; w = h / p.aspect; }
    if (h < 46) h = 46;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    const lightF = st.nits > 0 ? clamp(Math.log2(1 + st.nits / 40) / Math.log2(1 + 800 / 40), 0.25, 1) : 0.3;
    const lcdBg = st.color ? null : DISP_BL[p.bl].nits ? (p.bl === 'el' ? '#9fd88b' : '#d9e6d0') : '#a8b49a';
    if (st.seg) {
      g.fillStyle = e.emissive ? '#120404' : lcdBg; g.fillRect(0, 0, cv.width, cv.height);
      const txt = '5550173';
      const n = Math.min(txt.length, st.res[0]);
      const cw = cv.width / (n + 1), ch = Math.min(cv.height * 0.7, cw * 1.7);
      const on = e.emissive ? `rgba(255,${60 + 40 * lightF},40,${0.5 + 0.5 * lightF})` : '#1d241a';
      const off = e.emissive ? 'rgba(255,60,40,0.06)' : 'rgba(0,0,0,0.06)';
      for (let i = 0; i < n; i++) labSeg7(g, cw * (0.6 + i), (cv.height - ch) / 2, cw * 0.72, ch, txt[txt.length - n + i], on, off, e.emissive ? 8 * dpr * lightF : 0);
    } else {
      // render at the real resolution, then blow it up: low PPI looks blocky
      const rw = clamp(st.res[0], 8, 360), rh = clamp(Math.round(rw * p.aspect), 6, 720);
      const off = document.createElement('canvas'); off.width = rw; off.height = rh;
      const o = off.getContext('2d');
      labScreenArt(o, rw, rh, st, p, lcdBg);
      g.imageSmoothingEnabled = rw > cv.width * 0.8;
      g.drawImage(off, 0, 0, cv.width, cv.height);
      // brightness and contrast (LCD blacks glow grey)
      g.fillStyle = `rgba(0,0,0,${(1 - lightF) * 0.55})`; g.fillRect(0, 0, cv.width, cv.height);
      if (!st.emissive && st.color) { g.fillStyle = `rgba(120,130,150,${clamp(0.32 - Math.log10(Math.max(2, st.contrast)) * 0.09, 0, 0.3)})`; g.fillRect(0, 0, cv.width, cv.height); }
    }
    // glass reflection
    const gr = g.createLinearGradient(0, 0, cv.width, cv.height);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    if (px) labPixelCloseup(px.getContext('2d'), 150, st, p);
  },

  // ============================ CAMERA =======================================
  ctl_camera(dr) {
    const p = dr.p;
    const fArea = f => (f.w * f.h).toFixed(1);
    const area = CAM_FORMATS[p.fmt].w * CAM_FORMATS[p.fmt].h;
    const r = CAM_ROLES[dr.role];
    const seen = new Set();
    const mpOpts = CAM_MP.map((m, i) => ({ m, i })).filter(({ m }) => (seen.has(m) ? false : seen.add(m))).map(({ m, i }) => ({
      v: m, title: m + ' MP', sub: `${Math.sqrt(area / m).toFixed(2)} µm`, tech: CAM_MP_TECH[i] }));
    return `
      <h3>Role in the phone</h3>${labCards('role', Object.entries(CAM_ROLES).map(([k, x]) => ({ v: k, title: x.name, sub: `${x.focal[0]}–${x.focal[1]} mm`, tech: x.tech })), dr.role, 2)}
      <h3>1 · Image sensor</h3>${labCards('p.sensor', CAM_SENSOR_ORDER.map(k => ({ v: k, title: CAM_SENSOR[k].name, sub: `QE ${Math.round(CAM_SENSOR[k].qe * 100)}%${CAM_SENSOR[k].bin ? ' · binning' : ''}`, tech: CAM_SENSOR[k].tech, tip: CAM_SENSOR[k].desc })), p.sensor, 2)}
      <h3>Optical format <span class="tiny faint">(sensor size)</span></h3>${labCards('p.fmt', labWindow(CAM_FORMATS.map((f, i) => ({ v: i, title: f.name, sub: `${fArea(f)} mm²`, tech: CAM_FORMAT_TECH[i] })), p.fmt, 6), p.fmt, 3)}
      <h3>Resolution</h3>${labCards('p.mp', labWindow(mpOpts, p.mp, 8), p.mp, 4)}
      <h3>2 · Lens</h3>
      ${labSlider('p.lens', 'Lens elements', 1, Math.max(1, ladderCap(LENS_CAPS, playerAv().has)), 1, p.lens, v => v + (v == 1 ? ' element' : ' elements'), LENS_CAPS, 1, 'more = sharper, taller, pricier')}
      ${labCards('p.ap', APERTURES.map((a, i) => ({ v: a, title: 'f/' + a, sub: i < 2 ? 'slow' : '', tech: APERTURE_TECH[i] })), p.ap, 5)}
      ${labSlider('p.focal', 'Focal length (35 mm equiv.)', r.focal[0], r.focal[1], 1, p.focal, v => v + ' mm', null, 1, dr.role === 'tele' ? 'longer = more zoom, taller module' : 'wider ↔ tighter')}
      ${dr.role === 'tele' ? labToggle('p.periscope', 'Periscope (folded optics)', 'A prism turns the light 90°: long zoom lenses lie flat in the phone.', 'cam_periscope', !!p.periscope) : ''}
      <h3>3 · Focus & stabilization</h3>${labCards('p.af', CAM_AF_ORDER.map(k => ({ v: k, title: CAM_AF[k].name, tech: CAM_AF[k].tech })), p.af, 3)}
      <div class="mt-s">${labCards('p.ois', Object.entries(CAM_OIS).map(([k, o]) => ({ v: k, title: o.name, sub: o.stops ? `+${o.stops} stops` : 'handheld blur', tech: o.tech })), p.ois, 3)}</div>`;
  },
  viz_camera(dr, st) {
    return `<div class="card"><h2>Optical bench <span class="sub">${st.z.toFixed(1)} mm module · f = ${st.fReal.toFixed(1)} mm</span></h2>${labLensSVG(dr.p, st, dr.role)}</div>
      <div class="card"><h2>Sample photo <span class="sub">${segBtn('labLight', [{ v: 'day', label: '☀️ Day' }, { v: 'night', label: '🌙 Night' }], this.night ? 'night' : 'day')}</span></h2>
        <div class="lab-photo"><canvas id="labPhoto"></canvas><div><canvas id="labCrop"></canvas><div class="tiny faint center">100% crop of the sign</div></div></div>
        <div class="tiny faint mt-s">Rendered at ${st.effMP.toFixed(st.effMP < 1 ? 2 : 1)} effective MP with noise from ${st.light.toFixed(1)} stops of light gathering. Bigger sensors and faster apertures fight noise; megapixels alone don't.</div></div>`;
  },
  stats_camera(dr, st) {
    const p = dr.p;
    const diffLimited = st.airy * 0.25 > st.pitch;
    return labRows([
      ['Sensor', `${CAM_FORMATS[p.fmt].name} · ${st.A.toFixed(1)} mm²`],
      ['Pixel pitch', st.pitch.toFixed(2) + ' µm' + (st.binned ? ` (${(st.pitch * 2).toFixed(2)} binned)` : ''), st.pitch < 0.95 && !st.binned ? 'warn' : ''],
      ['Effective resolution', `${st.effMP.toFixed(st.effMP < 10 ? 2 : 0)} of ${p.mp} MP`, st.effMP < p.mp * 0.5 ? 'warn' : ''],
      ['Diffraction spot', st.airy.toFixed(2) + ' µm' + (diffLimited ? ' · diffraction-limited' : ''), diffLimited ? 'warn' : '', 'Airy disk = 2.44 × λ × f-number'],
      ['Lens blur', st.blur.toFixed(2) + ' µm', '', 'Aberrations: fewer elements and faster apertures blur more'],
      ['Light gathering', st.light.toFixed(1) + ' stops'],
      ['Dynamic range', st.dr.toFixed(1) + ' stops'],
      ['Real focal length', st.fReal.toFixed(1) + ' mm' + (st.zoom > 1.3 ? ` · ${st.zoom.toFixed(1)}× zoom` : '')],
      ['Module height', st.z.toFixed(1) + ' mm', st.z > 7 ? 'warn' : '', 'Taller than the phone body = camera bump'],
      ['Footprint', `${st.footprint[0].toFixed(0)} × ${st.footprint[1].toFixed(0)} mm`],
      ['Weight / power', `${st.weight.toFixed(1)} g · ${st.power.toFixed(2)} W`],
      ['Unit cost (at cost)', fmtMoney(st.cost)],
      ['CameraMark', '<b class="acc">' + Math.round(st.score) + '</b>'],
    ]);
  },
  draw_camera(dr, st) {
    const a = $('#labPhoto'), b = $('#labCrop');
    if (!a) return;
    labPhoto(a, st, dr.p, this.night, false);
    labPhoto(b, st, dr.p, this.night, true);
  },

  // ============================ BATTERY ======================================
  ctl_battery(dr) {
    const p = dr.p, lim = this.batLimits(), c = CHEM[p.chem];
    const nickel = c.nickel;
    const form = labForm();
    return `
      ${form === 'car' ? '<div class="note mb">🚗 Your current Phone Lab draft is a car phone – it runs on the car battery. Cells you design here fit handhelds and bag phones.</div>' : ''}
      <h3>1 · Chemistry</h3>${labCards('p.chem', CHEM_ORDER.map(k => ({ v: k, title: CHEM[k].name, sub: `${CHEM[k].whl} Wh/L · ${CHEM[k].whkg} Wh/kg`, tech: CHEM[k].tech, tip: CHEM[k].desc })), p.chem, 2)}
      <h3>2 · Cell format</h3>${labCards('p.fmt', BAT_FORMAT_ORDER.map(k => ({ v: k, title: BAT_FORMAT[k].name, sub: `packing ${Math.round(BAT_FORMAT[k].pack * 100)}%`, tech: BAT_FORMAT[k].tech, tip: BAT_FORMAT[k].desc,
        disabled: BAT_FORMAT[k].lithium && nickel ? 'Lithium only' : null })), p.fmt, 2)}
      <h3>3 · Capacity</h3>
      ${labSlider('p.mah', 'Rated capacity', lim.min, lim.max, 50, p.mah, v => (+v).toLocaleString('en-US') + ' mAh', BAT_CAPS, lim.scale, lim.scale !== 1 ? `×${lim.scale} for a ${form === 'bag' ? 'bag phone' : 'tablet'}` : null)}
      <h3>4 · Electrode & safety design</h3>
      ${labSlider('p.elec', 'Electrodes: power ← → energy', 0, 1, 0.05, p.elec, v => (+v < 0.35 ? 'power cell ' : +v > 0.65 ? 'energy cell ' : 'balanced ') + Math.round(v * 100) + '%', null, 1, 'thick electrodes store more, charge slower')}
      ${labSlider('p.safety', 'Separator & swelling margin', 0, 1, 0.05, p.safety, v => (+v < 0.3 ? 'aggressive ' : +v > 0.7 ? 'conservative ' : 'standard ') + Math.round(v * 100) + '%', null, 1, 'thin = more energy, more fires')}
      ${nickel ? '' : `<h3>Charge voltage</h3>${labCards('p.volt', CHARGE_V.map((v, i) => ({ v: i, title: v.v.toFixed(2) + ' V', sub: `+${Math.round((v.e - 1) * 100)}% energy · ${Math.round(v.cyc * 100)}% cycles`, tech: v.tech })), p.volt, 4)}`}
      <h3>5 · Charging</h3>${labCards('p.charge', CHARGE.map(x => ({ v: x.w, title: x.w + ' W', tech: x.tech })), p.charge, 4)}
      ${nickel ? '' : labToggle('p.dual', 'Dual-cell pack', 'Two cells in series halve the charging current (needed for 65 W+).', 'bat_dual', !!p.dual)}
      <h3>Wireless</h3>${labCards('p.wireless', Object.entries(WIRELESS).map(([k, w]) => ({ v: k, title: w.name, tech: w.tech })), p.wireless, 2)}
      <div class="tiny faint mt-s">Electrode generation ${p.dgen}/${DENSITY_STEPS.length} (+${p.dgen * 6}% density, from research) · safety systems ${p.safetySys ? '✓ (−55% risk)' : '✗ (research Battery safety systems)'}</div>`;
  },
  viz_battery(dr, st) {
    return `<div class="card"><h2>Cell cross-section <span class="sub">${BAT_FORMAT[dr.p.fmt].name} · ${CHEM[dr.p.chem].name}</span></h2>${labCellSVG(dr.p, st)}</div>
      <div class="card"><h2>Charging curve <span class="sub">${Math.round(st.chargeW)} W into ${st.wh.toFixed(1)} Wh</span></h2>${labChargeSVG(st)}</div>`;
  },
  stats_battery(dr, st) {
    const p = dr.p;
    const riskCls = st.risk < 1.6 ? 'good' : st.risk < 4 ? 'warn' : 'bad';
    const side = Math.sqrt(st.volume * 1000 / 4.5);
    return labRows([
      ['Capacity', p.mah.toLocaleString('en-US') + ' mAh'],
      ['Energy', st.wh.toFixed(2) + ' Wh'],
      ['Energy density', Math.round(st.whl) + ' Wh/L'],
      ['Volume', st.volume.toFixed(1) + ' cm³', '', `About ${Math.round(side)} × ${Math.round(side)} × 4.5 mm as a flat cell`],
      ['Weight', Math.round(st.weight) + ' g'],
      ['Max charge rate', `${Math.round(st.chargeW)} W${st.chargeW < p.charge - 0.5 ? ` (cell limits the ${p.charge} W charger)` : ''}`, st.chargeW < p.charge - 0.5 ? 'warn' : ''],
      ['0–100% charge', Math.round(st.chargeMin) + ' min'],
      ['Cycle life', Math.round(st.cycles) + ' cycles'],
      ['Incident risk', st.risk.toFixed(2) + ' per million', riskCls, 'Expected thermal incidents. High-volume products with risky cells will eventually face a costly recall.'],
      st.wireless ? ['Wireless charging', st.wireless + ' W'] : null,
      ['Unit cost (at cost)', fmtMoney(st.cost)],
    ]) + `<div class="tiny faint mt-s">Risky cells pack more energy, but every million units you ship rolls the dice on a fire, a recall and a reputation hit.</div>`;
  },

  // ============================ MEMORY =======================================
  ctl_memory(dr) {
    const p = dr.p, has = playerAv().has;
    const window_ = (dies, prefix, current, start) => {
      let maxHas = 0;
      dies.forEach((d, i) => { if (i >= start && (i === 0 || has(prefix + i))) maxHas = i; });
      const out = [];
      for (let i = start; i < dies.length && i <= maxHas + 2; i++) if (i >= maxHas - 3 || i === current) out.push(i);
      return out;
    };
    const ramOpts = window_(DRAM_DIES, 'dram_', p.ramDie, 0).map(i => ({ v: i, title: dieLabel(DRAM_DIES[i]), sub: DRAM_YEARS[i] ? 'std ' + Math.floor(DRAM_YEARS[i]) : '', tech: i ? 'dram_' + i : null }));
    const flOpts = [{ v: 0, title: 'No flash', sub: 'no user storage' }].concat(window_(FLASH_DIES, 'fl_', p.flDie, 1).filter(i => i > 0)
      .map(i => ({ v: i, title: dieLabel(FLASH_DIES[i]), sub: FLASH_NAMES[i], tech: 'fl_' + i })));
    return `
      <h3>1 · DRAM generation</h3>${labCards('p.gen', labWindow(DRAM_GEN_ORDER.map(k => ({ v: k, title: DRAM_GENS[k].name, sub: `${DRAM_GENS[k].bw} GB/s`, tech: DRAM_GENS[k].tech })), p.gen, 5), p.gen, 3)}
      <h3>DRAM die density</h3>${labCards('p.ramDie', ramOpts, p.ramDie, 3)}
      ${labSlider('p.ramN', 'DRAM dies', 1, 16, 1, p.ramN, v => v + (v == 1 ? ' die' : ' dies'), null, 1, `= ${fmtMB(DRAM_DIES[p.ramDie] * p.ramN / 8)} RAM`)}
      <h3>2 · Flash (storage) die</h3>${labCards('p.flDie', flOpts, p.flDie, 3)}
      ${p.flDie ? labSlider('p.flN', 'Flash dies', 1, 16, 1, p.flN, v => v + (v == 1 ? ' die' : ' dies'), null, 1, `= ${fmtMB(FLASH_DIES[p.flDie] * p.flN / 8)} storage`) : ''}
      ${p.flDie ? `<h3>Bits per cell</h3>${labCards('p.cell', Object.entries(FLASH_CELL).map(([k, c]) => ({ v: k, title: c.name, sub: `${Math.round(c.cost * 100)}% cost · ${Math.round(c.speed * 100)}% speed`, tech: c.tech })), p.cell, 2)}
        <h3>Storage interface</h3>${labCards('p.iface', STORAGE_IF_ORDER.map(k => ({ v: k, title: STORAGE_IF[k].name, sub: STORAGE_IF[k].mbs + ' MB/s', tech: STORAGE_IF[k].tech })), p.iface, 3)}` : ''}
      <h3>3 · Packaging</h3>
      ${labSlider('p.stack', 'Dies per package', 1, Math.max(1, ladderCap(STACK_CAPS, has)), 1, p.stack, v => v + '-high stack', STACK_CAPS, 1, 'stacking saves board space')}`;
  },
  viz_memory(dr, st) {
    const t = now();
    const fr = logInterp(FLAG_RAM, t), fs = logInterp(FLAG_STORAGE, Math.max(1983, t));
    const bar = (v, ref, label, color) => {
      const f = ref > 0 ? clamp(Math.log2(1 + v * 1024) / Math.log2(1 + ref * 1024 * 2), 0, 1) : 0;
      return `<div class="lab-cbar"><span class="dim small">${label}</span><div class="lab-ctrack"><div style="width:${f * 100}%;background:${color}"></div><i style="left:${clamp(Math.log2(1 + ref * 1024) / Math.log2(1 + ref * 1024 * 2), 0, 1) * 100}%" title="Today's flagship"></i></div><b class="mono">${fmtMB(v)}</b></div>`;
    };
    return `<div class="card"><h2>Package cross-sections <span class="sub">${st.pkgs} package${st.pkgs === 1 ? '' : 's'} · ${st.volume.toFixed(2)} cm³</span></h2>${labMemSVG(dr.p, st)}</div>
      <div class="card"><h2>Capacity <span class="sub">▮ = today's flagship</span></h2>
        ${bar(st.ramMB, fr, 'RAM', '#5b8def')}${bar(st.storageMB, fs, 'Storage', '#43b883')}
        <div class="tiny faint mt-s">Flagships now ship about ${fmtMB(fr)} RAM and ${fmtMB(fs)} storage.</div></div>`;
  },
  stats_memory(dr, st) {
    return labRows([
      ['RAM', fmtMB(st.ramMB)], ['Storage', fmtMB(st.storageMB)],
      ['Memory bandwidth', st.bw + ' GB/s'], ['Storage speed', st.speed ? Math.round(st.speed) + ' MB/s' : '—'],
      ['Packages', st.pkgs], ['Board volume', st.volume.toFixed(2) + ' cm³'], ['Power', st.power.toFixed(3) + ' W'],
      ['Flash endurance', dr.p.flDie ? Math.round(st.endurance * 100) + '%' : '—'],
      ['Unit cost (at cost)', fmtMoney(st.cost)],
    ]);
  },

  // ============================ RADIO ========================================
  ctl_radio(dr) {
    const p = dr.p, t = now(), has = playerAv().has;
    const gens = [...new Set(NET_ORDER.map(s => NET_STDS[s].gen))];
    const usedIn = s => {
      const regs = new Set();
      let live = false;
      for (const c of CARRIERS) { const rg = c.stds[s]; if (!rg) continue; regs.add(REGIONS[c.region].name); if (netAvail(rg, t) > 0) live = true; }
      return { regs: [...regs], live };
    };
    const need = Math.ceil(interp(BANDS_NEEDED, t));
    return `
      <h3>1 · Network standards <span class="tiny faint">(multi-mode costs more)</span></h3>
      ${gens.map(g => {
        const stds = NET_ORDER.filter(s => NET_STDS[s].gen === g);
        return `<div class="lab-gen"><div class="lab-gen-h">${GEN_LABEL(g)}</div><div class="ocards" style="--cols:2">${stds.map(s => {
          const st = NET_STDS[s], u = usedIn(s);
          const tags = [st.niche ? 'niche' : '', st.vehicle ? 'car/bag only' : '', st.needs ? 'needs ' + NET_STDS[st.needs].short : ''].filter(Boolean).join(' · ');
          return labToggle('std.' + s, st.name, `${u.live ? '🟢 live' : t < Math.min(...CARRIERS.filter(c => c.stds[s]).map(c => c.stds[s][0])) ? '⏳ not launched' : '⚫ shut down'} · ${u.regs.slice(0, 3).join(', ')}${tags ? ' · ' + tags : ''}`, st.tech, p.stds.includes(s));
        }).join('')}</div></div>`;
      }).join('')}
      <h3>2 · RF front-end</h3>
      ${labSlider('p.bands', 'RF bands', 1, Math.max(1, ladderCap(BAND_CAPS, has)), 1, p.bands, v => v + (v == 1 ? ' band' : ' bands'), BAND_CAPS, 1, `world needs ~${need}`)}
      <h3>MIMO antennas</h3>${labCards('p.mimo', MIMO.map(m => ({ v: m.n, title: m.n + '×' + m.n, tech: m.tech })), p.mimo, 4)}
      <h3>Carrier aggregation</h3>${labCards('p.ca', CARRIER_AGG.map(c => ({ v: c.n, title: c.n === 1 ? 'None' : c.n + ' carriers', tech: c.tech })), p.ca, 4)}
      <h3>Antenna</h3>${labCards('p.ant', Object.entries(ANTENNAS).map(([k, a]) => ({ v: k, title: a.name, sub: `gain ${a.gain.toFixed(2)}${a.ext ? ' · sticks out' : ''}`, tech: a.tech, tip: a.desc })), p.ant, 2)}
      <h3>Power amplifier</h3>${labCards('p.pa', Object.entries(PAS).map(([k, a]) => ({ v: k, title: a.name, sub: `${Math.round(a.pwr * 100)}% power`, tech: a.tech })), p.pa, 3)}`;
  },
  viz_radio(dr, st) {
    const p = dr.p, t = now();
    const cov = radioCoverage(p.stds, t, p.bands, s => stdPeak(s, p));
    const shares = regionShares(t);
    const rows = REGION_ORDER.map(r => {
      const v = cov.byRegion[r] || 0;
      const carriers = carrierShares(r, t);
      return `<div class="lab-reg">
        <div class="lab-reg-h"><span>${REGIONS[r].icon} <b>${REGIONS[r].name}</b> <span class="tiny faint">${fmtPct(shares[r], 0)} of buyers</span></span><b class="mono ${v > 0.8 ? 'good' : v > 0.3 ? 'warn' : 'bad'}">${fmtPct(v, 0)}</b></div>
        <div class="lab-ctrack"><div style="width:${v * 100}%"></div></div>
        ${carriers.length ? `<div class="lab-carriers">${carriers.map(({ c, w }) => {
          const nets = Object.keys(c.stds).filter(s => netAvail(c.stds[s], t) > 0);
          return `<div class="lab-car"><span class="tiny dim">${esc(c.name)} · ${Math.round(w * 100)}%</span><span>${nets.map(s => {
            const a = netAvail(c.stds[s], t);
            return `<span class="lab-net ${p.stds.includes(s) ? 'yes' : 'no'}" title="${esc(NET_STDS[s].name)}: ${Math.round(a * 100)}% rolled out${c.stds[s][1] ? ', shuts down ' + Math.floor(c.stds[s][1]) : ''}">${NET_STDS[s].short}${a < 0.99 ? ' ' + Math.round(a * 100) + '%' : ''}</span>`;
          }).join('') || '<span class="tiny faint">no network</span>'}</span></div>`;
        }).join('')}</div>` : '<div class="tiny faint">No cellular networks here yet.</div>'}
      </div>`;
    }).join('');
    return `<div class="card"><h2>World coverage <span class="sub">${fmtPct(cov.total, 0)} of buyers · ${fmtSpeed(cov.speed)} real-world</span></h2>
      ${cov.bandF < 0.999 ? `<div class="note warn mb">📻 Only ${p.bands} band${p.bands === 1 ? '' : 's'}: travellers and some carriers fall outside – coverage ×${cov.bandF.toFixed(2)}.</div>` : ''}
      ${rows}
      <div class="tiny faint mt-s">Green chips are networks your radio speaks. Carriers keep old networks for years, then shut them down – a phone that only speaks a dying standard loses its market. Pick your branch: GSM, CDMA or both?</div></div>`;
  },
  stats_radio(dr, st) {
    const p = dr.p, t = now();
    const cov = radioCoverage(p.stds, t, p.bands, s => stdPeak(s, p));
    const integ = evalRadio(p, t, true);
    return labRows([
      ['Generation', GEN_LABEL(st.gen)],
      ['Standards', p.stds.length ? `<span class="small">${p.stds.map(s => NET_STDS[s].short).join(', ')}</span>` : 'none', p.stds.length ? '' : 'bad'],
      ['Peak downlink', fmtSpeed(st.peak)],
      ['Real-world speed', fmtSpeed(cov.speed)],
      ['Global coverage', fmtPct(cov.total, 1), cov.total < 0.3 ? 'bad' : cov.total < 0.6 ? 'warn' : 'good'],
      ['Bands', `${p.bands} (world needs ~${Math.ceil(interp(BANDS_NEEDED, t))})`],
      ['Talk power', st.power.toFixed(2) + ' W'],
      ['Antenna gain', st.gain.toFixed(2) + (st.ext ? ' · external' : '') + (st.metalOk ? ' · metal-body OK' : '')],
      ['Unit cost', fmtMoney(st.cost), '', 'With a separate baseband chip'],
      ['…with SoC modem', fmtMoney(integ.cost), 'good', 'If the phone\'s chip has an integrated baseband block of this generation'],
    ]);
  },

  // ---- events ------------------------------------------------------------------------
  bind(el) {
    const self = this;
    const dr = () => S.partDrafts[self.tab];
    el.onclick = e => {
      const rs = e.target.closest('[data-rs]');
      if (rs) { e.stopPropagation(); if (report(startResearch(rs.dataset.rs))) { toast('Research started: ' + TECH[rs.dataset.rs].name, 'good'); renderNav(); self.render(el); } return; }
      const tab = e.target.closest('[data-labtab]');
      if (tab) { self.tab = tab.dataset.labtab; self.render(el); return; }
      const light = e.target.closest('.segbtn[data-seg="labLight"] button');
      if (light) { self.night = light.dataset.v === 'night'; self.refresh(true); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const d = dr(), raw = pick.dataset.v, val = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        if (pick.dataset.pick === 'role') {
          d.role = val;
          const r = CAM_ROLES[val];
          d.p.focal = clamp(d.p.focal, r.focal[0], r.focal[1]);
          if (val !== 'main' && d.p.focal === 26 && r.dflt !== 26) d.p.focal = r.dflt;
          if (val === 'tele' || val === 'ultra') d.p.focal = r.dflt;
        } else setPath(d, pick.dataset.pick, val);
        self.fix(self.tab, d); self.render(el); return;
      }
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        const d = dr(), path = tg.dataset.toggle;
        if (path.startsWith('std.')) labToggleStd(d.p, path.slice(4));
        else setPath(d, path, !getPath(d, path));
        if (path === 'p.fold' && d.p.fold) d.p.size = Math.max(d.p.size, 7.6);
        self.fix(self.tab, d); self.render(el); return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'engineer') {
        const d = dr();
        const err = engineerPart(self.tab, d.name, d.p, d.role);
        if (report(err)) {
          toast(`${d.name} sent to engineering (${designDays(self.tab)} days).`, 'good');
          d.name = bumpName(d.name);
          while (S.designs.some(x => x.name === d.name)) d.name = bumpName(d.name);
          renderNav(); self.render(el);
        }
      }
      if (a === 'revise' || a === 'use') {
        const des = S.designs.find(x => x.id === act.dataset.id);
        if (!des) return;
        if (a === 'revise') {
          const d = dr();
          d.p = JSON.parse(JSON.stringify(des.p));
          if (des.role) d.role = des.role;
          d.name = bumpName(des.name);
          while (S.designs.some(x => x.name === d.name)) d.name = bumpName(d.name);
          self.fix(self.tab, d);
          toast(`Loaded ${des.name} – change it and engineer a new revision.`);
          self.render(el); el.scrollTop = 0;
        } else {
          if (!S.draft) S.draft = defaultDraft('phone', now());
          const ref = { src: 'own', id: des.id };
          if (des.type === 'camera') { S.draft.cams = S.draft.cams || {}; S.draft.cams[des.role || 'main'] = ref; }
          else S.draft[des.type] = ref;
          toast(`${des.name} is now in your Phone Lab draft${des.status !== 'ready' ? ' (you can launch once it is engineered)' : ''}.`, 'good');
          showView('phonelab');
        }
      }
    };
    el.oninput = e => {
      const inp = e.target;
      if (inp.id === 'labName') { const d = dr(); if (d) d.name = inp.value; self.refresh(); return; }
      if (inp.type !== 'range' || !inp.dataset.path) return;
      const d = dr();
      setPath(d, inp.dataset.path, Number(inp.value));
      self.fix(self.tab, d);
      const show = $(`[data-show="${inp.dataset.path}"]`, el);
      if (show && LAB_FMT[inp.dataset.path]) show.textContent = LAB_FMT[inp.dataset.path](getPath(d, inp.dataset.path));
      self.refresh();
    };
    el.onchange = e => {
      const inp = e.target;
      if (inp.type === 'range' && inp.dataset.path) {
        const sc = el.scrollTop;
        self.render(el);
        el.scrollTop = sc;
      }
    };
  },
  key(e) { return false; },
};
registerView('labs', PartsLab);

function labToggleStd(p, s) {
  const has = playerAv().has;
  if (p.stds.includes(s)) {
    // drop it and everything that falls back on it
    const rm = new Set([s]);
    let changed = true;
    while (changed) { changed = false; for (const x of p.stds) if (!rm.has(x) && NET_STDS[x].needs && rm.has(NET_STDS[x].needs)) { rm.add(x); changed = true; } }
    p.stds = p.stds.filter(x => !rm.has(x));
  } else {
    let x = s;
    while (x) { if (!p.stds.includes(x) && has(NET_STDS[x].tech)) p.stds.push(x); x = NET_STDS[x].needs; }
  }
  p.stds.sort((a, b) => NET_ORDER.indexOf(a) - NET_ORDER.indexOf(b));
}

// ============================================================================
//  Drawing helpers (canvas / SVG)
// ============================================================================
// a seven-segment digit
function labSeg7(g, x, y, w, h, ch, on, off, glow) {
  const map = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const lit = map[ch] || '';
  const t = Math.max(2, w * 0.16), hh = h / 2;
  const seg = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + hh - t / 2, w - 2 * t, t],
    f: [x, y + t, t, hh - t], b: [x + w - t, y + t, t, hh - t], e: [x, y + hh, t, hh - t], c: [x + w - t, y + hh, t, hh - t] };
  for (const k in seg) {
    const [sx, sy, sw, sh] = seg[k];
    g.shadowBlur = lit.includes(k) ? glow : 0; g.shadowColor = on;
    g.fillStyle = lit.includes(k) ? on : off;
    roundRect2(g, sx + 1, sy + 1, sw - 2, sh - 2, Math.min(sw, sh) / 2); g.fill();
  }
  g.shadowBlur = 0;
}
function roundRect2(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// what the screen shows at its native resolution
function labScreenArt(o, w, h, st, p, lcdBg) {
  const u = Math.min(w, h) / 100;
  if (!st.color) {
    o.fillStyle = lcdBg; o.fillRect(0, 0, w, h);
    o.fillStyle = '#1d2a1b';
    o.fillRect(0, 0, w, Math.max(1, Math.round(9 * u)));
    o.fillStyle = lcdBg;
    for (let i = 0; i < 4; i++) o.fillRect(Math.round(3 * u + i * 4 * u), Math.round(6 * u - i * 1.2 * u), Math.max(1, Math.round(2.5 * u)), Math.max(1, Math.round(1.5 * u + i * 1.2 * u)));
    o.fillStyle = '#1d2a1b'; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.font = `bold ${Math.max(5, Math.round(h * 0.2))}px monospace`; o.fillText('12:45', w / 2, h * 0.42);
    o.font = `${Math.max(4, Math.round(h * 0.09))}px monospace`; o.fillText((S.company || 'NIMBUS').split(' ')[0].toUpperCase(), w / 2, h * 0.64);
    o.textAlign = 'left'; o.fillText('Menu', 3 * u, h - 6 * u); o.textAlign = 'right'; o.fillText('Names', w - 3 * u, h - 6 * u);
    return;
  }
  const grd = o.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, `hsl(215,${Math.round(40 + st.gamut * 30)}%,42%)`); grd.addColorStop(0.55, `hsl(265,${Math.round(35 + st.gamut * 30)}%,32%)`);
  grd.addColorStop(1, `hsl(320,${Math.round(30 + st.gamut * 35)}%,${st.emissive ? 10 : 20}%)`);
  o.fillStyle = grd; o.fillRect(0, 0, w, h);
  const touch = p.touch !== 'none';
  if (!touch) {
    o.fillStyle = 'rgba(0,0,0,0.35)'; o.fillRect(0, 0, w, Math.max(2, 10 * u));
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.font = `bold ${Math.max(5, Math.round(h * 0.2))}px sans-serif`; o.fillText('12:45', w / 2, h * 0.42);
    o.font = `${Math.max(4, Math.round(h * 0.07))}px sans-serif`; o.fillText('Tue 14 May', w / 2, h * 0.58);
    o.fillStyle = 'rgba(0,0,0,0.35)'; o.fillRect(0, h - 12 * u, w, 12 * u);
    return;
  }
  const cols = w > h ? 7 : 4, cell = w / cols, icon = cell * 0.62;
  const rows = Math.max(1, Math.floor((h * 0.72) / cell));
  const rnd = labRng(7);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    o.fillStyle = `hsl(${Math.floor(rnd() * 360)},${Math.round(45 + st.gamut * 25)}%,${50 + Math.floor(rnd() * 12)}%)`;
    roundRect2(o, c * cell + (cell - icon) / 2, cell * 0.45 + r * cell, icon, icon, icon * 0.24); o.fill();
  }
  o.fillStyle = 'rgba(255,255,255,0.18)'; roundRect2(o, cell * 0.2, h - cell * 1.1, w - cell * 0.4, cell * 0.9, cell * 0.3); o.fill();
  o.fillStyle = '#fff'; o.font = `600 ${Math.max(4, Math.round(cell * 0.2))}px sans-serif`; o.textAlign = 'left'; o.textBaseline = 'middle';
  o.fillText('9:41', cell * 0.25, cell * 0.2);
}
function labPixelCloseup(g, S2, st, p) {
  g.clearRect(0, 0, S2, S2);
  g.fillStyle = st.emissive ? '#050506' : '#1b1e24'; g.fillRect(0, 0, S2, S2);
  const e = p.emit;
  if (st.seg) {
    g.fillStyle = e === 'led' ? '#ff4630' : '#2a3326';
    if (e === 'led') { g.shadowBlur = 12; g.shadowColor = '#ff4630'; }
    roundRect2(g, 25, 60, 100, 26, 13); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText(e === 'led' ? 'LED segment' : 'LCD segment', 75, 120);
    return;
  }
  const n = 6, c = S2 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x * c, py = y * c;
    if (!st.color) {
      g.fillStyle = (x + y) % 3 ? '#9fb497' : '#2b3627';
      g.fillRect(px + 2, py + 2, c - 4, c - 4);
    } else if (!st.emissive) {
      ['#ff3b30', '#34c759', '#0a84ff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(px + 2 + i * (c - 4) / 3, py + 2, (c - 4) / 3 - 1.5, c - 4); });
    } else {
      // diamond pentile: big red/blue, small green
      g.fillStyle = (x + y) % 2 ? '#ff3b30' : '#0a84ff';
      g.beginPath(); g.ellipse(px + c * 0.32, py + c * 0.5, c * 0.22, c * 0.22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#34c759';
      g.beginPath(); g.ellipse(px + c * 0.78, py + c * 0.28, c * 0.12, c * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(px + c * 0.78, py + c * 0.74, c * 0.12, c * 0.12, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (p.touch === 'capacitive' || p.touch === 'incell') {
    g.strokeStyle = 'rgba(160,220,255,0.22)'; g.lineWidth = 1;
    for (let i = 0; i <= S2; i += c * 1.5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S2); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S2, i); g.stroke(); }
  }
  if (p.touch === 'resistive') { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, S2, S2); }
}

// ---- camera: optical bench SVG -----------------------------------------------------------
function labLensSVG(p, st, role) {
  const W = 560, H = 230, cy = 112;
  const diag = Math.hypot(CAM_FORMATS[p.fmt].w, CAM_FORMATS[p.fmt].h);
  const pupilMm = st.fReal / p.ap;
  const len = p.periscope ? st.fReal * 1.1 + 4 : st.z;           // optical path drawn horizontally
  const k = Math.min(360 / (len + 1.5), 150 / Math.max(diag, pupilMm, 1));   // px per mm, true to scale
  const sx = 500, front = sx - len * k;
  const sensH = diag * k, pupH = Math.max(6, pupilMm * k);
  const parts = [];
  // rays: parallel light enters through the aperture and converges on the sensor
  for (let i = -2; i <= 2; i++) {
    const yIn = cy + i * pupH / 4.6, yOut = cy - i * sensH / 5.2;
    if (p.periscope) parts.push(`<line x1="${front + 10 + i * pupH / 4.6}" y1="8" x2="${front + 10 + i * pupH / 4.6}" y2="${yIn}" class="lab-ray"/>`);
    else parts.push(`<line x1="16" y1="${yIn}" x2="${front}" y2="${yIn}" class="lab-ray"/>`);
    parts.push(`<line x1="${front + 6}" y1="${yIn}" x2="${sx}" y2="${yOut}" class="lab-ray"/>`);
  }
  if (p.periscope) parts.push(`<path d="M${front - 24} ${cy - pupH / 2 - 14} L${front + 26} ${cy - pupH / 2 - 14} L${front - 24} ${cy + pupH / 2 + 14} Z" class="lab-prism"/><text x="${front - 30}" y="${cy + pupH / 2 + 30}" class="lab-svg-s" text-anchor="end">prism (folds light 90°)</text>`);
  // barrel and elements: small front element near the stop, big rear element near the sensor
  const lx0 = front + 8, lx1 = sx - Math.max(6, len * k * 0.18);
  const maxH = Math.max(pupH * 1.3, sensH * 0.95) + 10;
  parts.push(`<rect x="${front}" y="${cy - maxH / 2 - 8}" width="${sx - front}" height="${maxH + 16}" rx="7" class="lab-barrel"/>`);
  for (let i = 0; i < p.lens; i++) {
    const f = p.lens === 1 ? 0.3 : i / (p.lens - 1);
    const x = lx0 + f * (lx1 - lx0);
    const hh = (pupH * 1.25 + (sensH * 0.9 - pupH * 1.25) * Math.pow(f, 1.4)) / 2 + 3;
    const bulge = Math.min(14, 4 + hh * 0.25) * (i % 2 ? -0.6 : 1);
    parts.push(`<path d="M${x} ${cy - hh} Q${x + bulge} ${cy} ${x} ${cy + hh} Q${x - Math.abs(bulge) * 0.5} ${cy} ${x} ${cy - hh} Z" class="lab-lens"/>`);
  }
  // aperture stop
  const ax = front + 3;
  parts.push(`<rect x="${ax - 2}" y="${cy - maxH / 2 - 8}" width="4" height="${maxH / 2 + 8 - pupH / 2}" class="lab-stop"/><rect x="${ax - 2}" y="${cy + pupH / 2}" width="4" height="${maxH / 2 + 8 - pupH / 2}" class="lab-stop"/>`);
  parts.push(`<text x="${ax}" y="${cy - maxH / 2 - 14}" class="lab-svg-s" text-anchor="middle">f/${p.ap} · ⌀${pupilMm.toFixed(1)} mm</text>`);
  if (p.af !== 'fixed') parts.push(`<rect x="${lx0}" y="${cy + maxH / 2 + 10}" width="${Math.max(10, lx1 - lx0)}" height="6" rx="3" class="lab-vcm"/><text x="${(lx0 + lx1) / 2}" y="${cy + maxH / 2 + 30}" class="lab-svg-s" text-anchor="middle">${esc(CAM_AF[p.af].name)}</text>`);
  if (p.ois !== 'none') parts.push(`<text x="${p.ois === 'shift' ? sx + 5 : (front + sx) / 2}" y="${cy - maxH / 2 - 30}" class="lab-svg-t" text-anchor="middle">⇅ ${p.ois === 'shift' ? 'sensor-shift' : 'OIS'}</text>`);
  // sensor
  parts.push(`<rect x="${sx}" y="${cy - sensH / 2}" width="7" height="${sensH}" class="lab-sensor"/>
    <text x="${sx + 12}" y="${cy - 2}" class="lab-svg-t">${esc(CAM_FORMATS[p.fmt].name)}</text><text x="${sx + 12}" y="${cy + 12}" class="lab-svg-s">${p.mp} MP</text>`);
  // dimensions + scale bar
  const dy = H - 14;
  parts.push(`<line x1="${front}" y1="${dy}" x2="${sx + 7}" y2="${dy}" class="lab-dim"/><line x1="${front}" y1="${dy - 6}" x2="${front}" y2="${dy + 6}" class="lab-dim"/><line x1="${sx + 7}" y1="${dy - 6}" x2="${sx + 7}" y2="${dy + 6}" class="lab-dim"/>
    <text x="${(front + sx) / 2}" y="${dy - 6}" class="lab-svg-s" text-anchor="middle">${p.periscope ? `optical path ${len.toFixed(1)} mm · module height ${st.z.toFixed(1)} mm` : `module height ${st.z.toFixed(1)} mm`}</text>
    <line x1="18" y1="${dy}" x2="${18 + k}" y2="${dy}" stroke="#93a0ba" stroke-width="3"/><text x="18" y="${dy - 6}" class="lab-svg-s">1 mm</text>`);
  return `<svg class="lab-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
// ---- camera: procedural sample photo ----------------------------------------------------
// draws the scene in a 480×360 coordinate space onto any canvas (vector, so crops stay sharp)
function labScene(g, night) {
  const W = 480, H = 360;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  if (night) { sky.addColorStop(0, '#04070f'); sky.addColorStop(1, '#17223b'); } else { sky.addColorStop(0, '#3f86da'); sky.addColorStop(1, '#d2e8ff'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const rnd = labRng(42);
  if (night) {
    g.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H * 0.5, r = rnd() * 0.9 + 0.3; g.fillRect(x, y, r, r); }
    g.fillStyle = '#f2efd6'; g.beginPath(); g.arc(395, 58, 17, 0, Math.PI * 2); g.fill();
  } else {
    const sun = g.createRadialGradient(400, 55, 6, 400, 55, 70); sun.addColorStop(0, '#fffbe6'); sun.addColorStop(0.25, '#fff2b8'); sun.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = sun; g.fillRect(320, 0, 160, 140);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [cx, cy, s] of [[90, 60, 1], [210, 40, 0.7], [300, 85, 0.8]]) { for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx + i * 16 * s, cy + (i % 2) * 6 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2); g.fill(); } }
  }
  // hills
  g.fillStyle = night ? '#0f1826' : '#86b673';
  g.beginPath(); g.moveTo(0, 210); for (let x = 0; x <= W; x += 20) g.lineTo(x, 200 - 22 * Math.sin(x / 70) - 10 * Math.sin(x / 23)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.fillStyle = night ? '#0b131e' : '#5e9a4e';
  g.beginPath(); g.moveTo(0, 262); for (let x = 0; x <= W; x += 20) g.lineTo(x, 255 - 12 * Math.sin(x / 55 + 1)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  // house
  g.fillStyle = night ? '#3a342c' : '#eadcc3'; g.fillRect(60, 175, 140, 100);
  g.fillStyle = night ? '#3d1f1b' : '#a8473b'; g.beginPath(); g.moveTo(48, 180); g.lineTo(130, 120); g.lineTo(212, 180); g.fill();
  g.fillStyle = night ? '#2a1d14' : '#6b4630'; g.fillRect(118, 225, 26, 50);
  const win = night ? '#ffd76a' : '#9cc7e8';
  for (const [x, y] of [[75, 195], [160, 195]]) {
    g.fillStyle = win; g.fillRect(x, y, 26, 22);
    g.strokeStyle = night ? '#6b5a2a' : '#ffffff'; g.lineWidth = 1.5; g.strokeRect(x, y, 26, 22);
    g.beginPath(); g.moveTo(x + 13, y); g.lineTo(x + 13, y + 22); g.moveTo(x, y + 11); g.lineTo(x + 26, y + 11); g.stroke();
    if (night) { const gl = g.createRadialGradient(x + 13, y + 11, 2, x + 13, y + 11, 40); gl.addColorStop(0, 'rgba(255,215,106,0.35)'); gl.addColorStop(1, 'rgba(255,215,106,0)'); g.fillStyle = gl; g.fillRect(x - 30, y - 30, 86, 82); }
  }
  // roof tiles (fine detail)
  g.strokeStyle = night ? 'rgba(0,0,0,0.4)' : 'rgba(80,20,15,0.5)'; g.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(60 + i * 8, 172 - i * 5.5); g.lineTo(200 - i * 8, 172 - i * 5.5); g.stroke(); }
  // tree
  g.fillStyle = night ? '#1d140c' : '#6b4a2b'; g.fillRect(372, 190, 12, 80);
  g.fillStyle = night ? '#0e1f15' : '#3f7d3a';
  for (const [x, y, r] of [[378, 170, 34], [352, 188, 24], [404, 188, 24], [378, 145, 24]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // sign with fine print
  g.fillStyle = '#5a4630'; g.fillRect(262, 262, 4, 26); g.fillRect(320, 262, 4, 26);
  g.fillStyle = night ? '#bdb698' : '#f6f2e6'; g.fillRect(246, 228, 94, 38);
  g.strokeStyle = '#7a6040'; g.lineWidth = 1.2; g.strokeRect(246, 228, 94, 38);
  g.fillStyle = '#1e2a44'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = 'bold 10px sans-serif'; g.fillText((S && S.company ? S.company : 'PHONE EMPIRE').toUpperCase().slice(0, 16), 293, 243);
  g.font = '5.5px sans-serif'; g.fillText('MOBILE TELEPHONES · EST. ' + (S ? S.start : 1973), 293, 252);
  g.font = '4px sans-serif'; g.fillText('open 9–5 · ask about car phones · free installation', 293, 260);
  // fence
  g.strokeStyle = night ? '#2b2b2b' : '#f4f4f4'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 7) { g.beginPath(); g.moveTo(x, 292); g.lineTo(x, 312); g.stroke(); }
  g.beginPath(); g.moveTo(0, 297); g.lineTo(W, 297); g.moveTo(0, 307); g.lineTo(W, 307); g.stroke();
  // grass
  g.strokeStyle = night ? 'rgba(40,70,40,0.6)' : 'rgba(40,90,30,0.6)';
  for (let i = 0; i < 260; i++) { const x = rnd() * W, y = 318 + rnd() * 42; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 2 - 1, y - 4 - rnd() * 4); g.stroke(); }
  if (night) {
    g.fillStyle = '#333'; g.fillRect(228, 190, 3, 100);
    const lamp = g.createRadialGradient(229, 190, 2, 229, 190, 90); lamp.addColorStop(0, 'rgba(255,235,180,0.55)'); lamp.addColorStop(1, 'rgba(255,235,180,0)');
    g.fillStyle = lamp; g.fillRect(140, 100, 180, 190);
  }
}
function labPhoto(canvas, st, p, night, crop) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(80, canvas.parentElement ? Math.min(crop ? 170 : 340, canvas.parentElement.clientWidth || 340) : 300);
  const cssH = crop ? cssW * 0.62 : cssW * 0.75;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  // how many real pixels this crop or frame holds
  const fullW = Math.sqrt(Math.max(0.01, st.effMP) * 1e6 * 4 / 3);
  const reg = crop ? [240, 222, 106, 66] : [0, 0, 480, 360];
  const outW = Math.round(clamp(fullW * reg[2] / 480, 6, crop ? 340 : 480));
  const outH = Math.max(4, Math.round(outW * reg[3] / reg[2]));
  const tmp = document.createElement('canvas'); tmp.width = outW; tmp.height = outH;
  const tg = tmp.getContext('2d');
  tg.save();
  tg.scale(outW / reg[2], outH / reg[3]); tg.translate(-reg[0], -reg[1]);
  if (CAM_AF[p.af].q < 0.7) tg.filter = `blur(${0.35 * reg[2] / outW}px)`;
  labScene(tg, night);
  tg.restore();
  // sensor noise and exposure
  const ev = night ? 2.6 : 9;
  const photons = Math.pow(2, st.light + ev);
  const sigma = clamp(0.5 / Math.sqrt(photons), 0.003, 0.42);
  const gain = night ? 1.35 : 1;
  const clipAt = night ? 1 : clamp(0.78 + (st.dr - 9) * 0.06, 0.78, 1);
  const img = tg.getImageData(0, 0, outW, outH), d = img.data;
  const rnd = labRng(1234 + (night ? 7 : 0));
  const gauss = () => { const u = rnd() || 1e-6, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  for (let i = 0; i < d.length; i += 4) {
    const n = gauss() * sigma;
    for (let c = 0; c < 3; c++) {
      let v = d[i + c] / 255 * gain + n + gauss() * sigma * 0.45;
      if (v > clipAt) v = clipAt + (v - clipAt) * 0.25;
      d[i + c] = clamp(Math.round(v / clipAt * 255), 0, 255);
    }
  }
  tg.putImageData(img, 0, 0);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = outW >= canvas.width * 0.85;
  g.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

// ---- battery: cell cross-section & charge curve -------------------------------------------
function labCellSVG(p, st) {
  const f = p.fmt, W = 560, H = 250;
  const parts = [];
  const ox = 30, oy = 22, ow = 200, oh = 150;
  if (f === 'cyl') {
    const r = 34;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) parts.push(`<circle cx="${ox + 34 + i * 68}" cy="${oy + 40 + j * 70}" r="${r}" class="lab-can"/><circle cx="${ox + 34 + i * 68}" cy="${oy + 40 + j * 70}" r="${r - 8}" class="lab-roll"/>`);
    parts.push(`<rect x="${ox - 4}" y="${oy + 2}" width="${ow + 8}" height="${oh - 6}" rx="10" class="lab-pack"/>`);
  } else if (f === 'prism') {
    parts.push(`<rect x="${ox}" y="${oy}" width="${ow}" height="${oh}" rx="14" class="lab-can"/><rect x="${ox + 9}" y="${oy + 9}" width="${ow - 18}" height="${oh - 18}" rx="8" class="lab-roll"/>`);
  } else {
    const swell = 4 + p.safety * 12;
    parts.push(`<rect x="${ox - 10}" y="${oy - 4}" width="${ow + 20}" height="${oh + 8}" rx="${f === 'stacked' ? 3 : 10}" class="lab-pouch"/>
      <rect x="${ox + 4}" y="${oy + swell / 2}" width="${ow - 8}" height="${oh - swell}" rx="${f === 'stacked' ? 2 : 6}" class="lab-roll"/>
      <text x="${ox + ow / 2}" y="${oy + oh + 22}" class="lab-svg-s" text-anchor="middle">swelling room ${Math.round(4 + p.safety * 8)}% · sealed foil edges</text>`);
  }
  parts.push(`<text x="${ox + ow / 2}" y="${oy + oh / 2 + 4}" class="lab-svg-t" text-anchor="middle">${p.mah.toLocaleString('en-US')} mAh</text>`);
  // zoomed layer stack
  const zx = 286, zy = 18, zw = 150;
  const cath = 14 + p.elec * 26, anode = 12 + p.elec * 22, sep = 4 + p.safety * 10, foil = 4;
  const unit = [['Al foil', foil, '#c8cdd6'], ['Cathode ' + (CHEM[p.chem].nickel ? 'NiOOH' : 'LiCoO₂'), cath, '#5b6fd6'], ['Separator', sep, '#f2f2f2'], ['Anode ' + (p.chem === 'sic' ? 'Si-C' : CHEM[p.chem].nickel ? (p.chem === 'nicd' ? 'Cd' : 'MH') : 'graphite'), anode, '#3a3d44'], ['Cu foil', foil, '#d58a4a']];
  let y = zy, ly = 0;
  for (let rep = 0; rep < 2; rep++) for (const [nm, th, col] of unit) {
    parts.push(`<rect x="${zx}" y="${y}" width="${zw * 0.55}" height="${th}" fill="${col}" />`);
    if (rep === 0) {
      const cy = y + th / 2;
      ly = Math.max(ly + 15, cy);
      parts.push(`<path d="M${zx + zw * 0.55 + 2} ${cy} L${zx + zw * 0.55 + 12} ${ly}" class="lab-lead"/><text x="${zx + zw * 0.55 + 16}" y="${ly + 4}" class="lab-svg-s">${esc(nm)} · ${(th / 4 * 10).toFixed(0)} µm</text>`);
    }
    y += th;
  }
  parts.push(`<line x1="${ox + ow}" y1="${oy + 20}" x2="${zx}" y2="${zy}" class="lab-dim"/><line x1="${ox + ow}" y1="${oy + 60}" x2="${zx}" y2="${y}" class="lab-dim"/>
    <text x="${zx}" y="${y + 18}" class="lab-svg-s">electrodes ${p.elec < 0.35 ? 'thin (power)' : p.elec > 0.65 ? 'thick (energy)' : 'balanced'} · separator ${p.safety < 0.3 ? 'thin!' : p.safety > 0.7 ? 'thick' : 'standard'}</text>`);
  return `<svg class="lab-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
function labChargeSVG(st) {
  const W = 560, H = 170, L = 40, R = 14, T = 12, B = 26;
  const total = Math.max(1, st.chargeMin);
  const tcc = Math.min(total * 0.85, 0.8 * st.wh / Math.max(0.5, st.chargeW) * 60);
  const pts = [], pw = [];
  for (let i = 0; i <= 60; i++) {
    const tm = total * i / 60;
    let soc, p;
    if (tm <= tcc) { soc = 0.8 * tm / Math.max(0.01, tcc); p = 1; }
    else { const k = (tm - tcc) / Math.max(0.01, total - tcc); soc = 0.8 + 0.2 * (1 - Math.exp(-4 * k)) / (1 - Math.exp(-4)); p = Math.exp(-3 * k); }
    const x = L + (W - L - R) * i / 60;
    pts.push(`${x.toFixed(1)},${(T + (1 - soc) * (H - T - B)).toFixed(1)}`);
    pw.push(`${x.toFixed(1)},${(T + (1 - p * 0.9) * (H - T - B)).toFixed(1)}`);
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => `<text x="${L + (W - L - R) * f}" y="${H - 8}" class="lab-svg-s" text-anchor="middle">${Math.round(total * f)}′</text>`).join('');
  return `<svg class="lab-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" class="lab-plot"/>
    <text x="${L - 6}" y="${T + 8}" class="lab-svg-s" text-anchor="end">100%</text><text x="${L - 6}" y="${H - B}" class="lab-svg-s" text-anchor="end">0%</text>
    <polyline points="${pw.join(' ')}" class="lab-pw"/><polyline points="${pts.join(' ')}" class="lab-soc"/>
    <line x1="${L + (W - L - R) * tcc / total}" y1="${T}" x2="${L + (W - L - R) * tcc / total}" y2="${H - B}" class="lab-dim"/>
    <text x="${L + (W - L - R) * tcc / total + 4}" y="${T + 12}" class="lab-svg-s">constant current → constant voltage</text>${ticks}
  </svg><div class="legend"><span><span class="swatch" style="background:#43c88a"></span>Charge level</span><span><span class="swatch" style="background:#f5b546"></span>Charging power</span></div>`;
}
// ---- memory: package cross-sections ---------------------------------------------------
function labMemSVG(p, st) {
  const W = 520, H = 176;
  const pkg = (x, label, dies, color, n) => {
    const stack = Math.min(p.stack, dies) || 1;
    const pk = dies ? Math.ceil(dies / stack) : 0;
    const out = [];
    out.push(`<rect x="${x}" y="130" width="220" height="12" rx="2" class="lab-sub"/>`);
    for (let i = 0; i < 7; i++) out.push(`<circle cx="${x + 16 + i * 31}" cy="146" r="4.5" class="lab-ball"/>`);
    const dh = Math.min(20, 96 / Math.max(1, stack));
    for (let i = 0; i < stack; i++) {
      const w = 190 - i * 4;
      out.push(`<rect x="${x + 110 - w / 2}" y="${126 - (i + 1) * dh}" width="${w}" height="${dh - 2}" rx="1.5" fill="${color}" opacity="${0.75 + 0.25 * (i % 2)}"/>`);
      out.push(`<path d="M${x + 110 - w / 2} ${126 - (i + 1) * dh + 2} Q${x + 4} ${126 - i * dh} ${x + 8} 130" class="lab-wire"/>`);
    }
    out.push(`<rect x="${x - 4}" y="${126 - stack * dh - 6}" width="228" height="${stack * dh + 18}" rx="6" class="lab-mold"/>`);
    out.push(`<text x="${x + 110}" y="${116 - stack * dh}" class="lab-svg-t" text-anchor="middle">${label}</text>`);
    out.push(`<text x="${x + 110}" y="${168}" class="lab-svg-s" text-anchor="middle">${n} · ${dies ? pk + ' package' + (pk === 1 ? '' : 's') + ' × ' + stack + '-high' : 'none'}</text>`);
    return out.join('');
  };
  return `<svg class="lab-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${pkg(20, 'DRAM · ' + DRAM_GENS[p.gen].name, p.ramN, '#5b8def', p.ramN + ' × ' + dieLabel(DRAM_DIES[p.ramDie]))}
    ${p.flDie ? pkg(280, 'Flash · ' + FLASH_CELL[p.cell].name.split(' ')[0], p.flN, '#43b883', p.flN + ' × ' + dieLabel(FLASH_DIES[p.flDie])) : `<text x="390" y="90" class="lab-svg-s" text-anchor="middle">no flash storage</text>`}
  </svg>`;
}
