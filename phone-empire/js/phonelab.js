'use strict';
// ============================================================================
//  Phone Lab: assemble a device around a live 3D model. Every part is either a
//  standard supplier part (configurable within what suppliers sell) or one of
//  your own designs from the Parts Lab. The Layout tab lets you move every
//  port, button, grille, camera and sensor around the body.
// ============================================================================

const PL_TABS = [
  ['body', '🧩', 'Body'], ['layout', '📐', 'Layout'], ['screen', '🖥️', 'Screen'], ['chip', '🧠', 'Chip'], ['camera', '📷', 'Camera'],
  ['battery', '🔋', 'Battery'], ['memory', '💾', 'Memory'], ['radio', '📶', 'Radio'], ['features', '✨', 'Features'],
];
const TAB_PART = { screen: 'display', camera: 'camera', battery: 'battery', memory: 'memory', radio: 'radio' };
const clone = o => JSON.parse(JSON.stringify(o));

// ---- keeping a draft valid ----------------------------------------------------------------------
function stdBuilder(type, d, role) {
  const av = playerAv(), t = now(), f = formOf(d);
  switch (type) {
    case 'display': return stdDisplay(f, d.cat, t, av.std, 2);
    case 'camera': return stdCamera(role || 'main', t, av.std, 2);
    case 'battery': return stdBattery(f, d.cat, t, av.std, 2);
    case 'memory': return stdMemory(t, av.std, 2);
    case 'radio': return stdRadio(t, av.std, 2, null, f);
  }
  return null;
}
function stdPartOk(type, p, role, d) {
  if (!p) return false;
  const av = playerAv();
  if (!PART_TECHS[type](p, role).every(id => !TECH[id] || av.std(id))) return false;
  if (type === 'radio' && !['car', 'bag'].includes(formOf(d)) && p.stds.includes('imts')) return false;
  if (type === 'display' && d && !isKeypadForm(formOf(d)) && p.touch === 'none') return false;
  if (type === 'display' && d && formOf(d) === 'fold' && !p.fold) return false;
  return true;
}
function sanitizeDraft(d) {
  const av = playerAv(), t = now();
  const blank = blankSpec(d.cat);
  for (const k in blank) if (d[k] == null) d[k] = clone(blank[k]);
  for (const k of ['body', 'style', 'cams', 'feat']) for (const kk in blank[k]) if (d[k][kk] == null) d[k][kk] = clone(blank[k][kk]);
  if (d.cat === 'tablet') d.form = 'slate';
  else if (!FORMS[d.form] || d.form === 'slate' || !av.ok(FORMS[d.form].tech)) d.form = bestForm(av.std, t);
  const f = formOf(d);
  // processor
  const okChip = d.chip.kind === 'custom' ? S.chips.some(c => c.id === d.chip.id && c.status === 'ready') : vendorChipsAvailable(t).some(c => c.id === d.chip.id);
  if (!okChip) {
    const vs = vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu);
    d.chip = { kind: 'vendor', id: (vs.find(c => c.tier !== 'flagship') || vs[0] || VENDOR_CHIPS[0]).id };
  }
  // parts: keep own designs that exist, rebuild supplier parts that are no longer sellable
  const fixRef = (ref, type, role) => {
    if (ref && ref.src === 'own') return S.designs.some(x => x.id === ref.id) ? ref : { src: 'std', p: stdBuilder(type, d, role) };
    if (ref && ref.src === 'std' && stdPartOk(type, ref.p, role, d)) return ref;
    const p = stdBuilder(type, d, role);
    return p ? { src: 'std', p } : null;
  };
  d.display = fixRef(d.display, 'display');
  if (f === 'car') d.battery = null; else d.battery = fixRef(d.battery, 'battery');
  d.memory = fixRef(d.memory, 'memory');
  d.radio = fixRef(d.radio, 'radio');
  for (const role of ['main', 'ultra', 'tele', 'front']) {
    if (!d.cams[role]) continue;
    if (!av.ok(CAM_ROLES[role].tech) || (role !== 'main' && role !== 'front' && !d.cams.main)) { d.cams[role] = null; continue; }
    d.cams[role] = fixRef(d.cams[role], 'camera', role);
  }
  if (!d.cams.main) d.flash = 'none';
  if (!av.ok((FLASHES[d.flash] || FLASHES.none).tech)) d.flash = 'none';
  // body & features
  if (!MATERIALS[d.body.mat] || !av.ok(MATERIALS[d.body.mat].tech)) d.body.mat = 'plastic';
  if (!WATER[d.body.water] || !av.ok(WATER[d.body.water].tech)) d.body.water = 'none';
  const fin = FINISHES[d.body.finish];
  if (!fin || !av.ok(fin.tech) || (fin.metalOnly && !MATERIALS[d.body.mat].metal) || (fin.glassOnly && !['glass', 'steel', 'ceramic', 'ti'].includes(d.body.mat))) d.body.finish = 'gloss';
  if (!FINGERPRINT[d.feat.fp] || !av.ok(FINGERPRINT[d.feat.fp].tech)) d.feat.fp = 'none';
  for (const [k, id] of EXTRAS) if (d.feat[k] && !av.ok(id)) d.feat[k] = false;
  if (!OS[d.os] || !av.ok(OS[d.os].tech)) d.os = 'none';
  if (f === 'car' || f === 'bag') d.port = 'cord';
  else if (!PORTS[d.port] || d.port === 'cord' || !av.ok(PORTS[d.port].tech)) d.port = ['usbc', 'microusb', 'miniusb', 'edge', 'barrel'].find(k => av.std(PORTS[k].tech)) || 'barrel';
  if (!JACKS[d.jack] || !av.ok(JACKS[d.jack].tech)) d.jack = 'none';
  if (!SIMS[d.sim] || !av.ok(SIMS[d.sim].tech)) d.sim = 'none';
  if (d.sd && !av.ok('feat_sd')) d.sd = false;
  const lvMax = integrationLevel(av.ok);
  if (d.int == null || d.int > lvMax) d.int = lvMax;
  const rp = partParams(d.radio);
  syncLayout(d, rp ? { ext: ANTENNAS[rp.ant].ext } : null);
  d.price = clamp(Math.round(d.price) || 99, 9, 19999);
  return d;
}
function suggestPrice(d) {
  const pc = productCosts(d, now(), 'pearl');
  const raw = pc.ev.raw, cov = pc.ev.coverage.byRegion, cut = retailCut();
  let best = null;
  const lo = Math.max(pc.est / (1 - cut) * 1.02, segBudget(d.cat, 'budget', now()) * 0.3), hi = segBudget(d.cat, 'ultra', now()) * 1.8;
  for (let p = lo; p <= hi; p *= 1.04) {
    const pr = roundPrice(p);
    const rv = predictReview(raw, d.cat, pr, 0);
    const u = estimateDemand(raw, d.cat, pr, rv.score, cov).units;
    const prof = u * (pr * (1 - cut) - pc.est);
    if (!best || prof > best.prof) best = { pr, prof };
  }
  return best ? best.pr : d.price;
}

// ---- the lab --------------------------------------------------------------------------------
const PhoneLab = {
  name: 'Phone Lab', icon: '📱', live: false, tab: 'body', partMode: {}, sel: null,
  render(el) {
    if (!S.draft) S.draft = defaultDraft('phone', now());
    sanitizeDraft(S.draft);
    el.innerHTML = `
      <div class="pl">
        <div class="pl-head card" id="plHead"></div>
        <div class="pl-body">
          <nav class="pl-cats" id="plCats"></nav>
          <section class="pl-opts card" id="plOpts"></section>
          <section class="pl-stage card">
            <div class="stage3d" id="stage3d"></div>
            <div class="stage-chips" id="stageChips"></div>
            <div class="stage-ctl" id="stageCtl"></div>
          </section>
          <aside class="pl-stats" id="plStats"></aside>
        </div>
        <div class="pl-foot card" id="plFoot"></div>
      </div>`;
    this.mount3d();
    this.refresh();
    this.bind(el);
  },
  mount3d() {
    const box = $('#stage3d');
    this.has3d = typeof Device3D !== 'undefined' && Device3D.mount(box);
    if (!this.has3d) box.innerHTML = '<div class="no3d"><div class="big">📱</div><div class="tiny faint center">The 3D preview needs WebGL and an internet connection (three.js).</div></div>';
  },
  eval() {
    const d = S.draft;
    this.pc = productCosts(d, now(), 'pearl');
    return this.pc;
  },
  refresh() {
    const d = sanitizeDraft(S.draft);
    const pc = this.eval();
    $('#plHead').innerHTML = this.head(d);
    $('#plCats').innerHTML = PL_TABS.map(([id, ic, nm]) => `<button class="${this.tab === id ? 'on' : ''}" data-tab="${id}"><span class="ci">${ic}</span><span>${nm}</span><span class="cs">${esc(this.summary(id, d, pc))}</span></button>`).join('');
    const tabInfo = PL_TABS.find(c => c[0] === this.tab);
    $('#plOpts').innerHTML = `<h2>${tabInfo[1]} ${tabInfo[2]}</h2>` + this[this.tab](d, pc);
    if (this.tab === 'layout') this.drawNet();
    this.light(pc);
    $('#plFoot').innerHTML = this.foot(d, pc);
    const f = formOf(d);
    const openable = FORMS[f].hinge || FORMS[f].slide;
    $('#stageCtl').innerHTML = ['front', 'back', 'side', 'top'].map(v => `<button class="btn sm" data-view3d="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('') +
      `<button class="btn sm" data-view3d="spin">⟳ Spin</button>` + (openable ? `<button class="btn sm" data-view3d="open">${FORMS[f].slide ? '⇕ Slide' : '◫ Open / close'}</button>` : '');
  },
  // cheap update while dragging: stats, chips and the model
  light(pc) {
    pc = pc || this.eval();
    const d = S.draft, ev = pc.ev, g = ev.geom;
    $('#plStats').innerHTML = this.stats(d, pc);
    $('#stageChips').innerHTML = [`${Math.round(g.H)} × ${Math.round(g.W)} × ${g.T.toFixed(1)} mm`, fmtWeight(ev.weight), ev.hours == null ? 'car power' : `${ev.hours.toFixed(1)} h battery`,
      `${fmtPct(ev.coverage.total, 0)} coverage`].map(x => `<span>${x}</span>`).join('');
    if (this.has3d) Device3D.setSpec(d, ev);
  },
  summary(id, d, pc) {
    const ev = pc.ev;
    switch (id) {
      case 'body': return `${FORMS[formOf(d)].name}`;
      case 'layout': return `ergonomics ${Math.round(ev.layout.score * 100)}`;
      case 'screen': return partSummary('display', partParams(d.display));
      case 'chip': return pc.chip ? pc.chip.name.replace(/^(Quasar|Helix Semi|Arcadia) /, '') : '—';
      case 'camera': return d.cams.main ? partSummary('camera', partParams(d.cams.main)).split(' ').slice(0, 2).join(' ') : 'None';
      case 'battery': return d.battery ? partSummary('battery', partParams(d.battery)).split(' ').slice(0, 2).join(' ') : 'car power';
      case 'memory': return partSummary('memory', partParams(d.memory));
      case 'radio': return GEN_LABEL(ev.gen) + ' · ' + fmtPct(ev.coverage.total, 0);
      case 'features': return OS[d.os].name.replace(' OS', '');
    }
    return '';
  },
  head(d) {
    const forms = d.cat === 'tablet' ? ['slate'] : PHONE_FORMS;
    return `<div class="row wrap" style="gap:12px">
      <input type="text" id="devName" data-path="name" value="${esc(d.name)}" placeholder="Name your device…" maxlength="32" style="width:200px;font-weight:700">
      ${segBtn('cat', [{ v: 'phone', label: '📱 Phone' }, { v: 'tablet', label: '📟 Tablet', disabled: !playerAv().ok('form_tablet'), title: playerAv().ok('form_tablet') ? '' : 'Research Tablets first' }], d.cat)}
      <div class="forms">${forms.map(f => {
        const u = techUI(FORMS[f].tech), sel = formOf(d) === f;
        return `<button class="form ${sel ? 'on' : ''} ${u.ok ? '' : 'locked'}" ${u.ok ? `data-form="${f}"` : 'data-tab="body"'} title="${esc(FORMS[f].desc + (u.ok ? '' : ' — ' + (u.msg || 'locked')))}"><span class="fi">${FORMS[f].icon}</span>${FORMS[f].name}${u.ok ? '' : ' 🔒'}</button>`;
      }).join('')}</div>
      <span class="grow"></span>
      ${S.products.length ? `<select id="loadFrom" title="Start from one of your devices"><option value="">Start from…</option>${S.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>` : ''}
      <button class="btn sm" data-act="reset" title="Start over with a fresh standard design">↺ New design</button>
    </div>`;
  },

  // ---- tabs ------------------------------------------------------------------------------
  body(d, pc) {
    const t = now(), av = playerAv();
    const formOpts = (d.cat === 'tablet' ? ['slate'] : PHONE_FORMS).map(f => ({ v: f, title: `${FORMS[f].icon} ${FORMS[f].name}`, sub: `${FORMS[f].desc} Trend: ${Math.round(formAppeal(f, t) * 100)}%`, tech: FORMS[f].tech }));
    const metal = MATERIALS[d.body.mat].metal, glassy = ['glass', 'steel', 'ceramic', 'ti'].includes(d.body.mat);
    const finOpts = Object.entries(FINISHES).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech, disabled: (f.metalOnly && !metal) ? 'Metal bodies only' : (f.glassOnly && !glassy) ? 'Glass backs only' : null }));
    const lvMax = integrationLevel(av.ok);
    const ints = INTEGRATION.map(([id, f, name], i) => ({ i, id, name })).filter(x => x.i <= lvMax);
    const nextInt = INTEGRATION[lvMax + 1];
    return `<h3>Form factor</h3>${optCards('form', formOpts, formOf(d), 1)}
      <h3>Material</h3>${optCards('body.mat', MATERIAL_ORDER.map(k => ({ v: k, title: MATERIALS[k].name, sub: `Feel ${Math.round(MATERIALS[k].q * 100)} · ${MATERIALS[k].dens} g/cm³${MATERIALS[k].metal ? ' · blocks internal antennas' : ''}`, tech: MATERIALS[k].tech })), d.body.mat)}
      <h3>Finish</h3>${optCards('body.finish', finOpts, d.body.finish)}
      <h3>Color</h3><div class="row wrap">${BODY_COLORS.map(c => `<button class="swatch-btn ${c === d.color ? 'on' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        <label class="tiny dim row" style="gap:4px">Custom <input type="color" id="colorPick" value="${esc(d.color)}"></label></div>
      <h3>Shape</h3>
      ${capSlider('style.radius', 'Corner roundness', 0, 1, 0.05, d.style.radius, v => Math.round(v * 100) + '%')}
      ${segBtn('edge', [{ v: 'round', label: 'Rounded edges' }, { v: 'flat', label: 'Flat sides' }, { v: 'chamfer', label: 'Chamfered' }], d.style.edge)}
      <h3>Water resistance</h3>${optCards('body.water', Object.entries(WATER).map(([k, w]) => ({ v: k, title: w.name, tech: w.tech })), d.body.water)}
      <h3>Board integration</h3>
      <select id="intSel" class="full">${ints.map(x => `<option value="${x.i}" ${x.i === d.int ? 'selected' : ''}>${x.name}${x.id !== 'int_discrete' && !av.market(x.id) ? ' ◆' : ''}</option>`).join('')}</select>
      <div class="tiny faint mt-s">Electronics take up <b>${pc.ev.elecVol.toFixed(0)} cm³</b>. Every integration step shrinks them – that's what turns a car-trunk radio into a pocket phone.</div>
      ${nextInt ? `<div class="mt-s">${lockFoot(techUI(nextInt[0]))}</div>` : ''}
      <h3>Logo</h3><input type="text" data-path="style.logo" value="${esc(d.style.logo || '')}" placeholder="${esc(S.company.split(' ')[0].toUpperCase())}" maxlength="14" class="full">`;
  },
  layout(d, pc) {
    const ev = pc.ev, lay = ev.lay;
    const sel = lay.find(e => e.t === this.sel);
    const opt = OPTIONAL_LAYOUT.filter(t => !d.layout.some(e => e.t === t));
    return `<div class="tiny dim mb-s">Drag anything onto any face it fits. Front, back and the four edges are unfolded below. Red = doesn't fit.</div>
      <div class="net-wrap" id="netWrap"></div>
      <div class="row wrap mt-s">
        <button class="btn sm" data-act="autolayout" title="Let your engineers place everything">✨ Auto-arrange</button>
        ${opt.map(t => `<button class="btn sm" data-addel="${t}">+ ${LAYOUT_TYPES[t].name}</button>`).join('')}
      </div>
      ${sel ? `<div class="card sub mt"><div class="row between"><b>${LAYOUT_TYPES[sel.t].name}</b>${OPTIONAL_LAYOUT.includes(sel.t) ? `<button class="btn sm danger" data-delel="${sel.t}">Remove</button>` : ''}</div>
        <div class="tiny dim">${LAYOUT_TYPES[sel.t].desc}</div>
        <div class="tiny faint mt-s">On the <b>${sel.f}</b> face · allowed: ${LAYOUT_TYPES[sel.t].faces.join(', ')}</div>
        <label class="chk small mt-s"><input type="checkbox" id="elAuto" ${d.layout.find(e => e.t === sel.t).auto !== false ? 'checked' : ''}> Let engineers place it automatically</label></div>` : '<div class="tiny faint mt">Click an element to see where it works best.</div>'}
      <h3>Ergonomics <span class="faint">${Math.round(ev.layout.score * 100)} / 100</span></h3>
      ${ev.layout.notes.length ? ev.layout.notes.map(n => `<div class="tiny warn">${esc(n)}</div>`).join('') : '<div class="tiny good">Everything is where hands and faces expect it.</div>'}
      <h3>Ports</h3>
      ${optCards('port', PORT_ORDER.filter(k => (PORTS[k].only ? PORTS[k].only.includes(formOf(d)) : !['car', 'bag'].includes(formOf(d)))).map(k => ({ v: k, title: PORTS[k].name, sub: PORTS[k].w ? `${PORTS[k].w}×${PORTS[k].h} mm · needs ${PORTS[k].minT} mm` : '', tech: PORTS[k].tech })), d.port)}
      <h3>Headphone jack</h3>${optCards('jack', Object.entries(JACKS).map(([k, j]) => ({ v: k, title: j.name, sub: j.d ? `needs ${j.minT} mm thickness` : '', tech: j.tech })), d.jack, 3)}
      <h3>SIM card</h3>${optCards('sim', SIM_ORDER.map(k => ({ v: k, title: SIMS[k].name, tech: SIMS[k].tech })), d.sim, 3)}
      <div class="mt-s">${toggleCard('sd', 'Memory card slot', 'microSD on an edge or under the cover', 'feat_sd', d.sd)}</div>
      <h3>Camera island</h3>${segBtn('island', [{ v: 'auto', label: 'Auto' }, { v: 'square', label: 'Square' }, { v: 'circle', label: 'Circle' }, { v: 'bar', label: 'Bar' }, { v: 'none', label: 'Flush lenses' }], d.style.island)}`;
  },
  screen(d) {
    return this.partSwitch('display', d) + (this.mode('display', d) === 'own' ? this.ownList('display', d, null) : this.stdScreen(d));
  },
  camera(d) {
    const av = playerAv();
    if (!av.has('cam_cmos')) return `<div class="note">No camera technology yet – the first camera phones appear around 2000.</div><div class="mt">${lockFoot(techUI('cam_cmos'))}</div>`;
    const slot = role => {
      const ref = d.cams[role];
      const roleTech = CAM_ROLES[role].tech;
      const u = techUI(roleTech);
      const dis = role !== 'main' && role !== 'front' && !d.cams.main ? 'Needs a main camera' : null;
      const p = partParams(ref);
      const own = S.designs.filter(x => x.type === 'camera' && x.status === 'ready');
      let body = '';
      if (ref) {
        const st = evalCamera(p, now(), role);
        body = `<div class="row wrap mt-s"><select data-camsrc="${role}"><option value="std" ${ref.src === 'std' ? 'selected' : ''}>Supplier module</option>${own.map(x => `<option value="${x.id}" ${ref.src === 'own' && ref.id === x.id ? 'selected' : ''}>${esc(x.name)} (yours)</option>`).join('')}</select>
          <span class="tiny faint">CameraMark ${Math.round(st.score)} · ${st.effMP.toFixed(1)} eff. MP</span></div>`;
        if (ref.src === 'std') {
          let fmtMax = 0; CAM_FORMAT_TECH.forEach((id, i) => { if (av.std(id)) fmtMax = i; });
          const mps = CAM_MP.filter((m, i) => av.std(CAM_MP_TECH[i]) && (m < 40 || CAM_SENSOR[p.sensor].bin));
          body += `<div class="row wrap mt-s"><select data-cam="${role}.fmt" data-num>${CAM_FORMATS.map((f, i) => `<option value="${i}" ${i === p.fmt ? 'selected' : ''} ${i > fmtMax ? 'disabled' : ''}>${f.name} sensor</option>`).join('')}</select>
            <select data-cam="${role}.mp" data-num>${mps.map(m => `<option value="${m}" ${m === p.mp ? 'selected' : ''}>${m} MP</option>`).join('')}</select>
            ${role !== 'front' ? `<label class="chk small"><input type="checkbox" data-camois="${role}" ${p.ois !== 'none' ? 'checked' : ''} ${av.std('cam_ois') ? '' : 'disabled'}> OIS</label>` : ''}
            <span class="tiny ${st.pitch < 1 && !st.binned ? 'warn' : 'faint'}">${st.pitch.toFixed(2)} µm pixels · f/${p.ap} · ${p.lens} elements</span></div>`;
          body += st.rules.filter(r => r.err).map(r => `<div class="tiny bad">⛔ ${esc(r.text)}</div>`).join('');
        }
      }
      return `<div class="cam-slot ${ref ? '' : 'off'}">${toggleCard('cam.' + role, CAM_ROLES[role].name, role === 'tele' ? 'Optical zoom' : role === 'ultra' ? 'Wide-angle shots' : role === 'front' ? 'Video calls & selfies' : 'Your main shooter', roleTech, !!ref, dis)}${u.ok ? body : ''}</div>`;
    };
    return `${['main', 'front', 'ultra', 'tele'].map(slot).join('')}
      ${d.cams.main ? `<h3>Flash</h3>${optCards('flash', Object.entries(FLASHES).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech })), d.flash)}` : ''}
      <div class="tiny faint mt-s">Supplier modules use standard lenses. Design your own in the 🛠️ Parts Lab: bigger apertures, more lens elements, sensor-shift stabilization, exclusive sensors.</div>`;
  },
  battery(d) {
    if (formOf(d) === 'car') return '<div class="note">Car phones run off the car\'s 12 V battery – no cells needed.</div>';
    return this.partSwitch('battery', d) + (this.mode('battery', d) === 'own' ? this.ownList('battery', d) : this.stdBattery(d));
  },
  memory(d) { return this.partSwitch('memory', d) + (this.mode('memory', d) === 'own' ? this.ownList('memory', d) : this.stdMemory(d)) + `<div class="mt">${toggleCard('sd', 'Memory card slot', 'Expandable storage', 'feat_sd', d.sd)}</div>`; },
  radio(d, pc) { return this.partSwitch('radio', d) + (this.mode('radio', d) === 'own' ? this.ownList('radio', d) : this.stdRadio(d)) + this.coverage(pc); },
  chip(d, pc) {
    const t = now();
    const rows = [];
    for (const c of S.chips.filter(x => x.status === 'ready')) {
      const { e, fab } = customChipCost(c.stats, t);
      rows.push({ key: 'custom:' + c.id, c: c.stats, custom: true, price: fab ? e.own : e.foundry });
    }
    for (const c of vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu)) rows.push({ key: 'vendor:' + c.id, c, price: vendorChipPrice(c, t) });
    const sel = d.chip.kind + ':' + d.chip.id;
    const ev = pc.ev;
    return `${ev.integrated ? '<div class="note good mb-s">📶 Baseband integrated in the chip: cheaper, smaller radio.</div>' : ev.gen >= 1 ? '<div class="note mb-s">Separate baseband chip (the processor has no compatible modem block).</div>' : ''}
      ${ev.needDsp ? '<div class="note warn mb-s">Digital radio needs a DSP: an extra DSP chip is added (cost, power, volume). Pick a chip with a DSP or modem block.</div>' : ''}
      <div class="chip-cards">${rows.map(r => `<div class="ocard ${sel === r.key ? 'on' : ''}" data-chip="${r.key}">
        <div class="row between"><div class="oc-t">${r.custom ? '💠 ' : ''}${esc(r.c.name)}</div><b class="mono">${fmtMoney(r.price)}</b></div>
        <div class="oc-s mono">${nodeLabel(r.c.nm)} · CPU ${fmtSci(r.c.cpu)} · GPU ${r.c.gpu ? fmtSci(r.c.gpu) : '—'}${r.c.tops ? ' · AI ' + r.c.tops.toFixed(1) : ''} · ${r.c.power.toFixed(2)} W${r.c.hasModem ? ' · ' + GEN_LABEL(r.c.modemGen) + ' modem' : ''}${r.c.dsp ? ' · DSP' : ''}</div>
        ${r.custom ? '<span class="oc-ex">your design</span>' : `<span class="tag">${r.c.tier}</span>`}</div>`).join('')}</div>
      <div class="tiny faint mt-s">Design your own processor in the 💠 Chip Lab – off-the-shelf chips carry a big markup.</div>`;
  },
  features(d) {
    const touch = (partParams(d.display) || {}).touch && partParams(d.display).touch !== 'none';
    return `<h3>Software</h3>${optCards('os', OS_ORDER.map(k => ({ v: k, title: OS[k].name, sub: (OS[k].needsTouch && !touch ? 'Needs a touchscreen to shine. ' : '') + (OS[k].fee ? `License ${fmtMoney(OS[k].fee)}/unit` : 'No license fee'), tech: OS[k].tech })), d.os)}
      ${S.researched.os_own ? '<div class="note good mt-s">You use your own OS: no license fees.</div>' : ''}
      <h3>Biometrics</h3>${optCards('feat.fp', Object.entries(FINGERPRINT).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech })), d.feat.fp)}
      <h3>Extras</h3>${EXTRAS.map(([k, id, label]) => toggleCard('feat.' + k, label, TECH[id] ? TECH[id].desc : '', id, !!d.feat[k])).join('')}`;
  },

  // ---- part source switch and supplier configurators -------------------------------------------
  mode(type, d) {
    const ref = type === 'display' ? d.display : d[type];
    return ref && ref.src === 'own' ? 'own' : this.partMode[type] === 'own' ? 'own' : 'std';
  },
  partSwitch(type, d) {
    const n = S.designs.filter(x => x.type === type).length;
    return `<div class="row between mb-s">${segBtn('src-' + type, [{ v: 'std', label: `Supplier part (${SUPPLIERS[type]})` }, { v: 'own', label: `Your designs (${n})` }], this.mode(type, d))}
      <button class="btn sm" data-golab="${type}">🛠️ ${PART_INFO[type].lab}</button></div>`;
  },
  ownList(type, d) {
    const ref = type === 'display' ? d.display : d[type];
    const list = S.designs.filter(x => x.type === type);
    if (!list.length) return `<div class="note">You haven't designed a ${PART_INFO[type].name.toLowerCase()} yet. Open the <b>${PART_INFO[type].lab}</b> to engineer one: cheaper per unit, tuned to your phone, and able to use exclusive tech.</div>
      <div class="mt-s"><button class="btn primary" data-golab="${type}">Open ${PART_INFO[type].lab} →</button></div>`;
    return '<div class="chip-cards">' + list.map(x => {
      const st = PART_EVAL[type](x.p, now(), x.role);
      const on = ref && ref.src === 'own' && ref.id === x.id;
      return `<div class="ocard ${on ? 'on' : ''} ${x.status !== 'ready' ? 'locked' : ''}" ${x.status === 'ready' ? `data-own="${type}:${x.id}"` : ''}>
        <div class="row between"><div class="oc-t">🛠️ ${esc(x.name)}</div><b class="mono">${fmtMoney(st.cost)}</b></div>
        <div class="oc-s">${esc(partSummary(type, x.p))}${designExclusive(x) ? ' · <span class="excl">◆ exclusive</span>' : ''}</div>
        ${x.status === 'ready' ? '' : `<span class="oc-lock">engineering · ${Math.max(0, x.readyDay - S.day)} days</span>`}</div>`;
    }).join('') + '</div><div class="tiny faint mt-s">Your designs cost what they cost to make: ×1.22 at contract part makers, ×1.0 in your own plant – vs ×1.45 for supplier parts.</div>';
  },
  stdScreen(d) {
    const p = partParams(d.display), av = playerAv(), f = formOf(d);
    if (!p || p.emit === 'none') return '<div class="note">Dial-only handset: no display.</div>' + (av.std('disp_led') ? '<button class="btn sm mt-s" data-act="stddisp">Add a display</button>' : '');
    const st = evalDisplay(p, now());
    const combos = DISP_COMBOS.filter(([e, m]) => av.has(DISP_EMIT[e].tech) && av.has(DISP_MATRIX[m].tech));
    const keypad = isKeypadForm(f);
    const sizeLadder = f === 'slate' ? TABLET_SIZE_CAPS : DISP_SIZE_CAPS;
    const sizeMax = Math.min(f === 'slate' ? ladderCap(TABLET_SIZE_CAPS, av.std) : ladderCap(DISP_SIZE_CAPS, av.std), p.matrix === 'segment' ? 2.2 : p.matrix === 'passive' ? 2.8 : 99, f === 'fold' ? 8.1 : 99);
    const ppiMax = Math.min(ladderCap(PPI_CAPS, av.std), DISP_MATRIX[p.matrix].ppiMax || 0);
    return `<h3>Panel</h3>${optCards('dispcombo', combos.map(([e, m]) => ({ v: e + ':' + m, title: m === 'asi' && e === 'lcd' ? 'TFT LCD' : DISP_EMIT[e].name.replace(' liquid crystal', ' LCD') + (m !== 'segment' && !(e === 'oled' || e === 'tandem') ? '' : ''),
        sub: DISP_MATRIX[m].name, tech: av.std(DISP_EMIT[e].tech) ? DISP_MATRIX[m].tech : DISP_EMIT[e].tech, tip: DISP_EMIT[e].desc + ' ' + DISP_MATRIX[m].desc })), p.emit + ':' + p.matrix, 2, 'std')}
      ${p.matrix !== 'segment' ? `<div class="mt-s">${toggleCard('disp.color', 'Color', p.emit === 'oled' || p.emit === 'tandem' ? 'OLED is always color' : 'Red/green/blue color filters', 'disp_color', !!p.color || DISP_EMIT[p.emit].emissive, DISP_EMIT[p.emit].emissive ? 'Built in' : null, 'std')}</div>` : ''}
      ${capSlider('disp.size', 'Screen size', 0.6, Math.max(0.7, sizeMax), 0.1, p.size, v => (+v).toFixed(1) + '"', sizeLadder, 1, 'std')}
      <div class="tiny faint">Buyers want about ${prefSize(f, now()).toFixed(1)}" on a ${FORMS[f].name.toLowerCase()} right now.</div>
      ${p.matrix !== 'segment' ? capSlider('disp.ppi', 'Pixel density', 60, Math.max(70, ppiMax), 10, p.ppi, v => v + ' ppi', PPI_CAPS, 1, 'std') + `<div class="tiny faint">${st.res[0]} × ${st.res[1]} px · ${Math.round(st.nits)} nits</div>` : ''}
      <h3>Aspect</h3><select id="aspectSel" class="full">${ASPECTS.map(a => `<option value="${a.a}" ${Math.abs(a.a - p.aspect) < 0.01 ? 'selected' : ''}>${a.name} (${a.a})</option>`).join('')}</select>
      ${DISP_EMIT[p.emit].emissive ? '' : `<h3>Backlight</h3>${optCards('disp.bl', Object.entries(DISP_BL).map(([k, b]) => ({ v: k, title: b.name, tech: b.tech, tip: b.desc })), p.bl, 3, 'std')}`}
      ${p.matrix !== 'segment' ? `<h3>Touch</h3>${optCards('disp.touch', Object.entries(DISP_TOUCH).map(([k, v]) => ({ v: k, title: v.name, tech: v.tech, disabled: keypad || k === 'none' ? null : null })), p.touch, 2, 'std')}` : ''}
      <h3>Cover</h3>${optCards('disp.cover', DISP_COVER_ORDER.map(k => ({ v: k, title: DISP_COVER[k].name, tech: DISP_COVER[k].tech })), p.cover, 2, 'std')}
      ${keypad ? '' : `<h3>Refresh rate</h3>${optCards('disp.hz', REFRESH.map(r => ({ v: r.hz, title: r.hz + ' Hz', tech: r.tech })), p.hz, 4, 'std')}
      <h3>Shape</h3>${optCards('disp.shape', DISP_SHAPE_ORDER.map(k => ({ v: k, title: DISP_SHAPE[k].name, tech: DISP_SHAPE[k].tech })), p.shape, 2, 'std')}`}
      ${st.rules.length ? st.rules.map(r => `<div class="tiny ${r.err ? 'bad' : 'warn'} mt-s">${r.err ? '⛔' : '⚠️'} ${esc(r.text)}</div>`).join('') : ''}`;
  },
  stdBattery(d) {
    const p = partParams(d.battery), av = playerAv(), f = formOf(d);
    const st = evalBattery(p, now());
    const cap = batteryCap(f, d.cat, av.std);
    return `${capSlider('bat.mah', 'Capacity', f === 'bag' ? 1500 : 300, cap, 50, p.mah, v => (+v).toLocaleString('en-US') + ' mAh', BAT_CAPS, f === 'bag' ? 6 : d.cat === 'tablet' ? 2.2 : 1, 'std')}
      <div class="tiny faint">${st.wh.toFixed(1)} Wh · ${st.volume.toFixed(1)} cm³ · ${Math.round(st.weight)} g. Bigger batteries make the device thicker and heavier.</div>
      <h3>Chemistry</h3>${optCards('bat.chem', CHEM_ORDER.map(k => ({ v: k, title: CHEM[k].name, sub: `${CHEM[k].whl} Wh/L · ${CHEM[k].whkg} Wh/kg`, tech: CHEM[k].tech, tip: CHEM[k].desc })), p.chem, 2, 'std')}
      <h3>Charging</h3>${optCards('bat.charge', CHARGE.map(c => ({ v: c.w, title: c.w + ' W', tech: c.tech })), p.charge, 4, 'std')}
      <div class="tiny faint">0–100% in ~${Math.round(st.chargeMin)} min (the cells accept up to ${Math.round(st.maxW)} W).</div>
      <h3>Wireless charging</h3>${optCards('bat.wireless', Object.entries(WIRELESS).map(([k, w]) => ({ v: k, title: w.name, tech: w.tech })), p.wireless, 2, 'std')}`;
  },
  memOptions(kind) {
    const av = playerAv();
    const dies = kind === 'ram' ? DRAM_DIES : FLASH_DIES;
    const avail = dies.map((v, i) => i).filter(i => i > 0 && av.std(kind === 'ram' ? 'dram_' + i : 'fl_' + i));
    const maxN = Math.max(ladderCap(STACK_CAPS, av.std), now() < 1999 ? 8 : 1);
    const opts = new Map();
    for (const i of avail.slice(-4)) for (const n of [1, 2, 4, 8, 16]) {
      if (n > maxN) continue;
      const mb = dies[i] * n / 8;
      if (!opts.has(mb) || opts.get(mb).n > n) opts.set(mb, { i, n, mb });
    }
    if (kind === 'ram' && !avail.length) opts.set(DRAM_DIES[0] / 8, { i: 0, n: 1, mb: DRAM_DIES[0] / 8 });
    return [...opts.values()].sort((a, b) => a.mb - b.mb).slice(-10);
  },
  stdMemory(d) {
    const p = partParams(d.memory);
    const ram = this.memOptions('ram'), sto = this.memOptions('flash');
    const curR = DRAM_DIES[p.ramDie] * p.ramN / 8, curS = FLASH_DIES[p.flDie] * p.flN / 8;
    const st = evalMemory(p, now());
    return `<h3>RAM <span class="faint">${DRAM_GENS[p.gen].name}</span></h3>${optCards('memram', ram.map(o => ({ v: o.i + ':' + o.n, title: fmtMB(o.mb), sub: `${o.n}× ${fmtMB(DRAM_DIES[o.i] / 8)} die` })), ram.find(o => o.mb === curR) ? ram.find(o => o.mb === curR).i + ':' + ram.find(o => o.mb === curR).n : '', 3)}
      <h3>Storage <span class="faint">${p.flDie ? FLASH_NAMES[p.flDie] : ''}</span></h3>${sto.length ? optCards('memsto', [{ v: '0:0', title: 'None', sub: 'no user storage' }].concat(sto.map(o => ({ v: o.i + ':' + o.n, title: fmtMB(o.mb), sub: `${o.n}× ${fmtMB(FLASH_DIES[o.i] / 8)} die` }))), p.flDie ? (sto.find(o => o.mb === curS) || { i: p.flDie, n: p.flN }).i + ':' + (sto.find(o => o.mb === curS) || { n: p.flN }).n : '0:0', 3) : '<div class="tiny faint">No non-volatile memory yet (EEPROM arrives in 1983).</div>'}
      <div class="tiny faint mt-s">Bandwidth ${st.bw >= 1 ? st.bw.toFixed(1) + ' GB/s' : Math.round(st.bw * 1000) + ' MB/s'} · storage ${st.speed ? Math.round(st.speed) + ' MB/s' : '—'} · ${st.pkgs} package${st.pkgs === 1 ? '' : 's'} · ${fmtMoney(st.cost * SUPPLIER_MARKUP)}</div>`;
  },
  stdRadio(d) {
    const p = partParams(d.radio), av = playerAv(), f = formOf(d);
    const vehicle = f === 'car' || f === 'bag';
    const groups = {};
    for (const s of NET_ORDER) { const g = Math.floor(NET_STDS[s].gen); (groups[g] = groups[g] || []).push(s); }
    const st = evalRadio(p, now(), false);
    const bandCap = ladderCap(BAND_CAPS, av.std);
    return `<h3>Network standards</h3><div class="tiny faint mb-s">Each carrier runs its own standards. Support more to sell in more places – every extra radio adds cost.</div>
      ${Object.keys(groups).map(g => `<div class="std-row"><span class="tag">${GEN_LABEL(+g)}</span>${groups[g].map(s => {
        const n = NET_STDS[s];
        const u = techUI(n.tech, 'std');
        const dis = !u.ok || (n.vehicle && !vehicle);
        const inUse = standardsInUse(now()).includes(s);
        return `<label class="chk small ${dis ? 'disabled' : ''}" title="${esc((n.vehicle && !vehicle ? 'Needs a car/bag phone transmitter. ' : '') + (u.ok ? '' : u.msg || '') + (n.needs ? ' Requires ' + NET_STDS[n.needs].name + '.' : ''))}"><input type="checkbox" data-std="${s}" ${p.stds.includes(s) ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${n.short}${inUse ? '' : ' <span class="faint">(no network)</span>'}${n.niche ? ' <span class="faint">niche</span>' : ''}</label>`;
      }).join('')}</div>`).join('')}
      ${capSlider('radio.bands', 'RF bands', 1, bandCap, 1, p.bands, v => v + ' bands', BAND_CAPS, 1, 'std')}
      <div class="tiny faint">A phone needs about ${Math.round(interp(BANDS_NEEDED, now()))} bands to work everywhere today.</div>
      <h3>Antenna</h3>${optCards('radio.ant', Object.entries(ANTENNAS).map(([k, a]) => ({ v: k, title: a.name, sub: a.desc, tech: a.tech })), p.ant, 2, 'std')}
      <div class="tiny faint mt-s">${fmtSpeed(radioPeak(p))} peak · ${st.power.toFixed(2)} W · ${fmtMoney(st.cost * SUPPLIER_MARKUP)}</div>
      ${st.rules.map(r => `<div class="tiny ${r.err ? 'bad' : 'warn'}">${r.err ? '⛔' : '⚠️'} ${esc(r.text)}</div>`).join('')}`;
  },
  coverage(pc) {
    const ev = pc.ev, reg = regionShares(now());
    return `<h3>Where it works</h3><div class="bars">${REGION_ORDER.filter(r => reg[r] > 0.001).map(r => `<div class="bar" style="grid-template-columns:120px 1fr 44px"><span class="dim">${REGIONS[r].icon} ${REGIONS[r].name}</span>
      <div class="track"><div class="fill" style="width:${(ev.coverage.byRegion[r] || 0) * 100}%"></div></div><b class="right mono">${fmtPct(ev.coverage.byRegion[r] || 0, 0)}</b></div>`).join('')}</div>
      <div class="tiny faint mt-s">Region sizes today: ${REGION_ORDER.filter(r => reg[r] > 0.001).map(r => `${REGIONS[r].name} ${fmtPct(reg[r], 0)}`).join(' · ')}. Real-world speed ${fmtSpeed(ev.netSpeed)}.</div>`;
  },

  // ---- layout editor (unfolded body) -----------------------------------------------------------
  netGeom() {
    const ev = this.pc.ev, g = ev.geom;
    const wrap = $('#netWrap');
    const avail = Math.max(260, (wrap ? wrap.clientWidth : 320) - 8);
    const W = g.W, Hf = g.Hface || g.H, H = g.H, T = g.T;
    let k = (avail - 40) / (2 * W + 2 * T);
    if (T * k < 18) k = (avail - 40 - 36) / (2 * W);
    k = Math.min(k, 380 / Math.max(Hf, H), 3.2);
    const tp = Math.max(18, T * k);                 // edge strips are drawn at least 18 px thick
    const fx = tp + 2, fy = tp + 2;
    const faces = {
      front: { x: fx, y: fy, w: W * k, h: Hf * k },
      left: { x: fx - tp - 2, y: fy, w: tp, h: H * k },
      right: { x: fx + W * k + 2, y: fy, w: tp, h: H * k },
      top: { x: fx, y: fy - tp - 2, w: W * k, h: tp },
      bottom: { x: fx, y: fy + Hf * k + 2, w: W * k, h: tp },
      back: { x: fx + W * k + tp + 30, y: fy, w: W * k, h: H * k },
    };
    if (g.form === 'flip') { faces.left.y = faces.right.y = fy + (Hf - H) * k; }
    return { k, tp, faces, W, H, Hf, T, width: faces.back.x + W * k + 4, height: fy + Hf * k + tp + 6 };
  },
  // element (face, u, v) → px rect within the net
  elRectPx(el, N) {
    const fc = N.faces[el.f];
    const [w, h] = layoutSize(el, S.draft, this.pc.ev.geom);
    const ex = N.tp / Math.max(0.1, N.T * N.k);       // thickness exaggeration
    switch (el.f) {
      case 'front': case 'back': return [fc.x + el.u * fc.w - w * N.k / 2, fc.y + (1 - el.v) * fc.h - h * N.k / 2, w * N.k, h * N.k];
      case 'top': return [fc.x + el.u * fc.w - w * N.k / 2, fc.y + el.v * fc.h - h * N.k * ex / 2, w * N.k, h * N.k * ex];
      case 'bottom': return [fc.x + el.u * fc.w - w * N.k / 2, fc.y + (1 - el.v) * fc.h - h * N.k * ex / 2, w * N.k, h * N.k * ex];
      case 'left': return [fc.x + el.v * fc.w - h * N.k * ex / 2, fc.y + (1 - el.u) * fc.h - w * N.k / 2, h * N.k * ex, w * N.k];
      case 'right': return [fc.x + (1 - el.v) * fc.w - h * N.k * ex / 2, fc.y + (1 - el.u) * fc.h - w * N.k / 2, h * N.k * ex, w * N.k];
    }
    return [0, 0, 0, 0];
  },
  // px → (face, u, v)
  pxToFace(x, y, N, allowed) {
    let best = null, bd = 1e9;
    for (const f of allowed) {
      const fc = N.faces[f];
      const cx = clamp(x, fc.x, fc.x + fc.w), cy = clamp(y, fc.y, fc.y + fc.h);
      const dd = Math.hypot(cx - x, cy - y);
      if (dd < bd) { bd = dd; best = f; }
    }
    const fc = N.faces[best];
    const rx = clamp((x - fc.x) / fc.w, 0, 1), ry = clamp((y - fc.y) / fc.h, 0, 1);
    switch (best) {
      case 'front': case 'back': return { f: best, u: rx, v: 1 - ry };
      case 'top': return { f: best, u: rx, v: 0.5 };
      case 'bottom': return { f: best, u: rx, v: 0.5 };
      case 'left': return { f: best, u: 1 - ry, v: 0.5 };
      case 'right': return { f: best, u: 1 - ry, v: 0.5 };
    }
    return null;
  },
  drawNet() {
    const wrap = $('#netWrap');
    if (!wrap) return;
    const N = this.netGeom(), ev = this.pc.ev, g = ev.geom;
    this.N = N;
    const lay = ev.lay, bad = ev.layout.bad || {};
    const col = S.draft.color;
    let h = `<div class="net" style="width:${N.width}px;height:${N.height}px">`;
    for (const [f, fc] of Object.entries(N.faces)) h += `<div class="net-face ${f}" style="left:${fc.x}px;top:${fc.y}px;width:${fc.w}px;height:${fc.h}px;background:${col}"><span>${f}</span></div>`;
    const fr = N.faces.front;
    if (g.screenRect) { const [x, y, w, hh] = g.screenRect; h += `<div class="net-zone screen" style="left:${fr.x + x * N.k}px;top:${fr.y + (N.Hf - y - hh) * N.k}px;width:${w * N.k}px;height:${hh * N.k}px">screen</div>`; }
    if (g.keypadRect) { const [x, y, w, hh] = g.keypadRect; h += `<div class="net-zone keypad" style="left:${fr.x + x * N.k}px;top:${fr.y + (N.Hf - y - hh) * N.k}px;width:${w * N.k}px;height:${hh * N.k}px">keys</div>`; }
    lay.forEach((el, i) => {
      const [x, y, w, hh] = this.elRectPx(el, N);
      const lt = LAYOUT_TYPES[el.t];
      const idx = (S.draft.layout || []).findIndex(e => e.t === el.t);
      h += `<div class="net-el ${bad[i] ? 'bad' : ''} ${this.sel === el.t ? 'sel' : ''} ${el.auto === false ? 'manual' : ''} t-${el.t}" data-el="${el.t}" data-idx="${idx}" title="${esc(lt.name)}"
        style="left:${x}px;top:${y}px;width:${Math.max(6, w)}px;height:${Math.max(6, hh)}px"></div>`;
    });
    h += '</div>';
    wrap.innerHTML = h;
    this.bindNet();
  },
  bindNet() {
    const net = $('.net', $('#netWrap'));
    if (!net) return;
    let drag = null;
    net.onpointerdown = e => {
      const elDiv = e.target.closest('[data-el]');
      if (!elDiv) return;
      e.preventDefault();
      const type = elDiv.dataset.el;
      this.sel = type;
      const d = S.draft;
      const resolved = this.pc.ev.lay.find(x => x.t === type);
      const rec = d.layout.find(x => x.t === type);
      if (rec && rec.auto !== false) Object.assign(rec, { f: resolved.f, u: resolved.u, v: resolved.v, auto: false });
      drag = { type, moved: false };
      net.setPointerCapture(e.pointerId);
      if (this.has3d && Device3D.highlight) Device3D.highlight(type);
    };
    net.onpointermove = e => {
      if (!drag) {
        const elDiv = e.target.closest('[data-el]');
        if (this.has3d && Device3D.highlight) Device3D.highlight(elDiv ? elDiv.dataset.el : this.sel);
        return;
      }
      const r = net.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const rec = S.draft.layout.find(z => z.t === drag.type);
      const pos = this.pxToFace(x, y, this.N, LAYOUT_TYPES[drag.type].faces);
      if (!pos) return;
      Object.assign(rec, pos, { auto: false });
      drag.moved = true;
      // move the box without a full rebuild
      const box = $(`[data-el="${drag.type}"]`, net);
      const [bx, by, bw, bh] = this.elRectPx(rec, this.N);
      Object.assign(box.style, { left: bx + 'px', top: by + 'px', width: Math.max(6, bw) + 'px', height: Math.max(6, bh) + 'px' });
      clearTimeout(this._lt);
      this._lt = setTimeout(() => this.light(), 60);
    };
    net.onpointerup = () => {
      if (!drag) return;
      drag = null;
      this.refresh();
    };
  },

  // ---- right column ----
  stats(d, pc) {
    const t = now(), chip = pc.chip, ev = pc.ev;
    if (!chip) return '<div class="card">Pick a processor.</div>';
    const cut = retailCut();
    const raw = Object.assign({ cov: ev.coverage.byRegion }, ev.raw);
    const excl = exclusiveTechs(d);
    const rv = predictReview(raw, d.cat, d.price, excl.length);
    const dem = estimateDemand(raw, d.cat, d.price, rv.score, ev.coverage.byRegion);
    const margin = d.price * (1 - cut) - pc.est;
    const probs = specProblems(Object.assign({}, d, { name: d.name || 'x' }));
    const warn = [];
    if (probs.length) warn.push(issuesList(probs.slice(0, 6)));
    if (ev.sustain < 0.75) warn.push(`<div class="note warn">🔥 Chip draws ${chip.power.toFixed(1)} W, body sheds ~${ev.thermBudget.toFixed(1)} W: ${Math.round(ev.sustain * 100)}% sustained performance.</div>`);
    if (margin < 0) warn.push(`<div class="note bad">💸 You lose ${fmtMoney(-margin)} on every unit.</div>`);
    if (ev.notes.length) warn.push(`<div class="note">${ev.notes.map(esc).join('<br>')}</div>`);
    if (excl.length) warn.push(`<div class="note" style="border-color:var(--excl)">◆ Exclusive tech: ${excl.slice(0, 4).map(id => TECH[id].name).join(', ')}</div>`);
    const b = ev.bench;
    const R = k => expect(d.cat, k, t);
    const bench = [
      ['CPU', fmtSci(b.cpu), b.cpu / Math.max(1e-12, R('cpu'))], ['Graphics', b.gpu ? fmtSci(b.gpu) : '—', R('gpu') ? b.gpu / R('gpu') : null],
      ['Camera', b.cam ? Math.round(b.cam) : '—', R('cam') ? b.cam / R('cam') : null], ['Display', Math.round(b.disp), b.disp / Math.max(1e-9, R('disp'))],
      ['Battery', b.batt == null ? '∞' : b.batt.toFixed(1) + ' h', b.batt == null ? 1 : b.batt / R('hours')], ['Network', fmtSpeed(b.net), R('speed') ? b.net / R('speed') : null],
      ['Weight', fmtWeight(b.weight), R('weight') / b.weight],
    ];
    return `<div class="card">
        <h2>Buyer scores <span class="sub">100 = today's flagship · ▮ rivals</span></h2>
        ${scoreBars(rv.subs, rv.avgSubs)}
        <div class="row between mt"><span class="dim small">${SEG_INFO[rv.seg].name} quality</span><b>${rv.q.toFixed(0)}</b></div>
      </div>
      <div class="card"><h2>Forecast</h2><div class="spec-list">
        <span class="k">Expected review</span><span class="v">${reviewTag(rv.score)}</span>
        <span class="k">Demand at full ramp</span><span class="v">${fmtNum(dem.units)}/mo</span>
        <span class="k">Unit cost</span><span class="v">${fmtMoney(pc.est)}</span>
        <span class="k">Margin / unit</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin)}</span>
        <span class="k">Gross profit</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin * dem.units)}/mo</span>
        <span class="k">Build tier</span><span class="v">${TIER_NAMES[ev.tier]}</span>
      </div></div>
      ${warn.join('')}
      <div class="card"><h2>Benchmarks <span class="sub">vs today's flagship</span></h2><div class="spec-list">
        ${bench.map(([l, v, r]) => `<span class="k">${l}</span><span class="v">${v}${r != null ? ` <span class="tiny ${r >= 1 ? 'good' : r < 0.6 ? 'bad' : 'faint'}">${Math.round(r * 100)}%</span>` : ''}</span>`).join('')}
      </div></div>
      <div class="card"><h2>Bill of materials</h2><table class="tbl bom">${pc.comps.map(c => {
        const v = c.own != null ? c.own : c.buy != null ? c.buy : 0;
        const src = c.own != null ? '<span class="tag good">own plant</span>' : c.buy == null ? '<span class="tag bad">needs plant</span>' : `<span class="tag">${c.std ? 'supplier' : c.buyLabel || 'bought'}</span>`;
        return `<tr><td>${esc(c.label)}</td><td>${src}</td><td class="num">${fmtMoney(v)}</td></tr>`;
      }).join('')}<tr><td><b>Total</b></td><td></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table></div>`;
  },
  foot(d, pc) {
    const proto = protoCost(d), dev = devCost(d.cat);
    const seg = segmentForPrice(d.cat, d.price, now());
    return `<div class="row wrap" style="gap:10px">
      <span class="dim">Price</span><span class="row" style="gap:4px">$<input type="number" id="priceIn" data-path="price" data-num min="9" max="19999" step="10" value="${d.price}"></span>
      <button class="btn sm" data-act="suggest">💡 Suggest</button>
      <span class="tiny faint" title="${esc(SEGMENTS.map(s => `${SEG_INFO[s].name} buyers spend ~${fmtMoney(segBudget(d.cat, s, now()))}`).join(' · '))}">${SEG_INFO[seg].name} buyers · you keep ${fmtMoney(d.price * (1 - retailCut()))}</span>
      <span class="grow"></span>
      <button class="btn" data-act="proto" title="A hand-built unit to show investors and reviewers">🧪 Prototype · ${fmtMoney(proto)}</button>
      <button class="btn primary" data-act="launch">🚀 Develop & launch · ${fmtMoney(dev)}</button>
    </div>`;
  },

  // ---- events ----
  setPart(type, role, ref) {
    const d = S.draft;
    if (type === 'camera') d.cams[role] = ref; else d[type] = ref;
  },
  setForm(f) {
    const d = S.draft, av = playerAv(), was = formOf(d);
    d.form = f;
    // re-fit supplier parts to the new body
    if (d.display && d.display.src === 'std') d.display = { src: 'std', p: stdDisplay(f, d.cat, now(), av.std, 2) };
    if (f === 'car') d.battery = null;
    else if (!d.battery || d.battery.src === 'std') d.battery = { src: 'std', p: stdBattery(f, d.cat, now(), av.std, 2) };
    if (d.radio && d.radio.src === 'std' && (((was === 'car' || was === 'bag') !== (f === 'car' || f === 'bag')) || d.radio.p.stds.includes('imts'))) d.radio = { src: 'std', p: stdRadio(now(), av.std, 2, null, f) };
    d.layout = (d.layout || []).filter(e => e.auto !== false);
    d.port = f === 'car' || f === 'bag' ? 'cord' : d.port === 'cord' ? 'barrel' : d.port;
  },
  bind(el) {
    const d = () => S.draft;
    const changed = () => this.refresh();
    el.onclick = e => {
      const rs = e.target.closest('[data-rs]');
      if (rs) { e.stopPropagation(); if (report(startResearch(rs.dataset.rs))) { toast('Research started: ' + TECH[rs.dataset.rs].name, 'good'); renderNav(); changed(); } return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; changed(); return; }
      const v3 = e.target.closest('[data-view3d]');
      if (v3) { if (this.has3d) Device3D.view(v3.dataset.view3d); return; }
      const gl = e.target.closest('[data-golab]');
      if (gl) { if (VIEWS.labs) { VIEWS.labs.tab = gl.dataset.golab; showView('labs'); } return; }
      const fm = e.target.closest('[data-form]');
      if (fm) { this.setForm(fm.dataset.form); changed(); return; }
      const el2 = e.target.closest('.net-el');
      if (el2) { this.sel = el2.dataset.el; changed(); return; }
      const add = e.target.closest('[data-addel]');
      if (add) { const [f, u, v] = defaultPlacement(add.dataset.addel, d()); d().layout.push({ t: add.dataset.addel, f, u, v, auto: true }); this.sel = add.dataset.addel; changed(); return; }
      const del = e.target.closest('[data-delel]');
      if (del) { d().layout = d().layout.filter(x => x.t !== del.dataset.delel); this.sel = null; changed(); return; }
      const own = e.target.closest('[data-own]');
      if (own) { const [type, id] = own.dataset.own.split(':'); this.setPart(type, null, { src: 'own', id }); changed(); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const raw = pick.dataset.v, val = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        const path = pick.dataset.pick;
        if (path === 'form') this.setForm(val);
        else if (path === 'dispcombo') { const [em, m] = raw.split(':'); const p = d().display.p; p.emit = em; p.matrix = m; if (m === 'segment') { p.color = false; p.touch = 'none'; p.ppi = 0; p.aspect = 0.28; p.size = Math.min(p.size, 2.2); } else { p.ppi = Math.max(60, p.ppi || 100); if (p.aspect < 0.5) p.aspect = isKeypadForm(formOf(d())) ? 1.25 : 1.78; if (DISP_MATRIX[m].ppiMax) p.ppi = Math.min(p.ppi, DISP_MATRIX[m].ppiMax); } if (DISP_EMIT[em].emissive) p.bl = 'none'; if (!DISP_SHAPE[p.shape] || (DISP_SHAPE[p.shape].oled && !DISP_EMIT[em].emissive)) p.shape = 'bezel'; }
        else if (path.startsWith('disp.')) setPath(d().display.p, path.slice(5), val);
        else if (path.startsWith('bat.')) setPath(d().battery.p, path.slice(4), val);
        else if (path.startsWith('radio.')) setPath(d().radio.p, path.slice(6), val);
        else if (path === 'memram') { const [i, n] = raw.split(':').map(Number); const p = d().memory.p; p.ramDie = i; p.ramN = n; p.gen = i === 0 ? 'sram' : bestOf(DRAM_GEN_ORDER, DRAM_GENS, playerAv().std); p.stack = Math.max(p.stack || 1, Math.min(n, ladderCap(STACK_CAPS, playerAv().std))); }
        else if (path === 'memsto') { const [i, n] = raw.split(':').map(Number); const p = d().memory.p; p.flDie = i; p.flN = n; if (!i) p.iface = 'par'; else if (p.iface === 'par') p.iface = STORAGE_IF_ORDER.filter(k => playerAv().std(STORAGE_IF[k].tech)).pop(); p.stack = Math.max(p.stack || 1, Math.min(n, ladderCap(STACK_CAPS, playerAv().std))); }
        else setPath(d(), path, val);
        changed(); return;
      }
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        const path = tg.dataset.toggle;
        if (path.startsWith('cam.')) {
          const role = path.slice(4);
          this.setPart('camera', role, d().cams[role] ? null : (stdCamera(role, now(), playerAv().std, 2) ? { src: 'std', p: stdCamera(role, now(), playerAv().std, 2) } : null));
          if (role === 'main' && !d().cams.main) { d().cams.ultra = null; d().cams.tele = null; }
          if (role === 'main' && d().cams.main && d().flash === 'none' && playerAv().std('cam_flash')) d().flash = 'led';
        } else if (path === 'disp.color') d().display.p.color = !d().display.p.color;
        else setPath(d(), path, !getPath(d(), path));
        changed(); return;
      }
      const ch = e.target.closest('[data-chip]');
      if (ch) { const [kind, id] = ch.dataset.chip.split(':'); d().chip = { kind, id }; changed(); return; }
      const col = e.target.closest('[data-color]');
      if (col) { d().color = col.dataset.color; changed(); return; }
      const segB = e.target.closest('.segbtn button');
      if (segB && !segB.disabled) {
        const seg = segB.parentElement.dataset.seg, v = segB.dataset.v;
        if (seg === 'cat' && v !== d().cat) { const keep = { name: d().name, color: d().color }; S.draft = Object.assign(defaultDraft(v, now()), keep); this.tab = 'body'; }
        if (seg === 'edge') d().style.edge = v;
        if (seg === 'island') d().style.island = v;
        if (seg && seg.startsWith('src-')) {
          const type = seg.slice(4);
          this.partMode[type] = v;
          if (v === 'std') { const ref = type === 'display' ? d().display : d()[type]; if (ref && ref.src === 'own') this.setPart(type, null, { src: 'std', p: stdBuilder(type, d()) }); }
          else { const ready = S.designs.find(x => x.type === type && x.status === 'ready'); if (ready) this.setPart(type, null, { src: 'own', id: ready.id }); }
        }
        changed(); return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'suggest') { d().price = suggestPrice(d()); changed(); toast(`Suggested price: ${fmtMoney(d().price)}`); }
      if (a === 'autolayout') { d().layout = d().layout.map(x => Object.assign(x, { auto: true })); d().layout.forEach(x => { const [f, u, v] = defaultPlacement(x.t, d()); Object.assign(x, { f, u, v }); }); changed(); }
      if (a === 'reset') { const keep = { color: d().color }; S.draft = Object.assign(defaultDraft(d().cat, now()), keep); changed(); }
      if (a === 'stddisp') { d().display = { src: 'std', p: stdDisplay(formOf(d()), d().cat, now(), playerAv().std, 2) }; changed(); }
      if (a === 'proto') { if (report(buildPrototype(d()))) toast('Prototype on the bench – ready in 14 days.', 'good'); changed(); }
      if (a === 'launch') {
        const name = d().name;
        if (report(launchProduct(d()))) {
          S.draft = Object.assign(defaultDraft(d().cat, now()), { color: d().color });
          toast(`${name} is in development! Its production line will build stock for the launch.`, 'good');
          showView('production');
        }
      }
    };
    el.oninput = e => {
      const inp = e.target;
      if (inp.id === 'colorPick') { d().color = inp.value; this.light(); return; }
      if (!inp.dataset.path) return;
      const v = inp.dataset.num != null ? Number(inp.value) : inp.value;
      const path = inp.dataset.path;
      this.setPathAny(path, v);
      if (inp.type === 'range') {
        const show = $(`[data-show="${path}"]`, el);
        if (show) show.textContent = path === 'disp.size' ? (+v).toFixed(1) + '"' : path === 'disp.ppi' ? v + ' ppi' : path === 'bat.mah' ? v.toLocaleString('en-US') + ' mAh' : path === 'radio.bands' ? v + ' bands' : path === 'style.radius' ? Math.round(v * 100) + '%' : v;
        this.light();
      }
    };
    el.onchange = e => {
      const inp = e.target;
      if (inp.id === 'loadFrom') {
        const p = S.products.find(x => x.id === inp.value);
        if (p) { S.draft = clone(p.spec); S.draft.name = p.name + ' II'; changed(); toast('Loaded ' + p.name + ' as a starting point.'); }
        return;
      }
      if (inp.id === 'colorPick') { changed(); return; }
      if (inp.id === 'intSel') { d().int = +inp.value; changed(); return; }
      if (inp.id === 'aspectSel') { d().display.p.aspect = +inp.value; changed(); return; }
      if (inp.id === 'elAuto') { const rec = d().layout.find(x => x.t === this.sel); if (rec) rec.auto = inp.checked; changed(); return; }
      if (inp.dataset.std) {
        const p = d().radio.p, s = inp.dataset.std;
        if (inp.checked) { let n = s; while (n) { if (!p.stds.includes(n)) p.stds.push(n); n = NET_STDS[n].needs; } }
        else p.stds = p.stds.filter(x => x !== s && NET_STDS[x].needs !== s);
        p.stds = NET_ORDER.filter(x => p.stds.includes(x));
        changed(); return;
      }
      if (inp.dataset.camsrc) {
        const role = inp.dataset.camsrc;
        this.setPart('camera', role, inp.value === 'std' ? { src: 'std', p: stdCamera(role, now(), playerAv().std, 2) } : { src: 'own', id: inp.value });
        changed(); return;
      }
      if (inp.dataset.cam) {
        const [role, key] = inp.dataset.cam.split('.');
        const p = d().cams[role].p;
        p[key] = Number(inp.value);
        if (key === 'mp' && p.mp >= 40 && !CAM_SENSOR[p.sensor].bin) p.sensor = bestOf(CAM_SENSOR_ORDER, CAM_SENSOR, playerAv().std);
        changed(); return;
      }
      if (inp.dataset.camois) { const p = d().cams[inp.dataset.camois].p; p.ois = inp.checked ? 'lens' : 'none'; changed(); return; }
      if (!inp.dataset.path || inp.type === 'text') return;
      this.setPathAny(inp.dataset.path, inp.dataset.num != null ? Number(inp.value) : inp.value);
      changed();
    };
  },
  setPathAny(path, v) {
    const d = S.draft;
    if (path.startsWith('disp.')) setPath(d.display.p, path.slice(5), v);
    else if (path.startsWith('bat.')) setPath(d.battery.p, path.slice(4), v);
    else if (path.startsWith('radio.')) setPath(d.radio.p, path.slice(6), v);
    else setPath(d, path, v);
  },
};
registerView('phonelab', PhoneLab);
