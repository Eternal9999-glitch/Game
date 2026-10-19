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
// the techs a supplier model needs that you haven't researched yet
const stdPartMissing = (type, p, role) => PART_TECHS[type](p, role).filter(id => TECH[id] && !playerAv().std(id));
const partKey = (type, d, role) => catalogKey(type, formOf(d), d.cat, role);
// a supplier part from the catalogs: the model closest to `like` (or the mainstream pick); falls back to a
// built-to-order standard part when nobody sells one yet
function stdRef(type, d, role, like, vendor) {
  const x = catalogClosest(type, partKey(type, d, role), now(), like || null, p => stdPartOk(type, p, role, d), vendor);
  if (x) return { src: 'std', p: clone(x.p), vid: x.id };
  const p = stdBuilder(type, d, role);
  return p && stdPartOk(type, p, role, d) ? { src: 'std', p } : null;
}
// ---- drawn art: key-shape presets and a logo from your initial ----
const KEY_PRESETS = [['circle', '●'], ['square', '■'], ['heart', '♥'], ['star', '★'], ['diamond', '◆'], ['pill', '▬']];
function presetMask(name, n) {
  const star = Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.21 : 0.5; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  let out = '';
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n - 0.5, y = 0.5 - (j + 0.5) / n, ax = Math.abs(x), ay = Math.abs(y);
    let on = false;
    if (name === 'circle') on = x * x + y * y < 0.23;
    else if (name === 'square') on = ax < 0.46 && ay < 0.46 && !(ax > 0.3 && ay > 0.3 && (ax - 0.3) ** 2 + (ay - 0.3) ** 2 > 0.026);
    else if (name === 'heart') { const X = x * 2.4, Y = (y + 0.06) * 2.4; on = Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y < 0; }
    else if (name === 'star') on = inPoly(x, y, star);
    else if (name === 'diamond') on = ax + ay < 0.5;
    else if (name === 'pill') on = ay < 0.3 && (ax < 0.2 || (ax - 0.2) ** 2 + y * y < 0.09);
    out += on ? '1' : '0';
  }
  return out;
}
const hexLum = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return 0.5; const v = parseInt(m[1], 16); return (((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) / 255; };
function initialLogo(letter, col) {
  const n = ART_N.logo, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  g.font = `900 ${n + 1}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';
  g.fillText(letter || 'N', n / 2, n / 2 + 1);
  const px = g.getImageData(0, 0, n, n).data;
  let out = '';
  for (let i = 0; i < n * n; i++) out += px[i * 4 + 3] > 110 ? col : '0';
  return out;
}
// ---- what a part does and the room it takes (for supplier lists) ----
function partPerf(type, st) {
  switch (type) {
    case 'display': case 'camera': return st.score;
    case 'battery': return st.wh;
    case 'memory': return Math.log2(1 + st.ramMB) + 0.5 * Math.log2(1 + st.storageMB) + st.speed / 2000;
    case 'radio': return st.peak;
  }
  return 0;
}
const camVolOf = st => st.footprint[0] * st.footprint[1] * st.z / 1000;
function partRoom(type, st) {
  switch (type) {
    case 'display': return st.stack;
    case 'camera': return camVolOf(st);
    case 'battery': return st.volume;
    case 'memory': return st.volume;
    case 'radio': return st.vol;
  }
  return 0;
}
function partPerfLine(type, p, st) {
  switch (type) {
    case 'display': return p.emit === 'none' ? 'No display' : `${p.size.toFixed(1)}" ${DISP_EMIT[p.emit].name.replace(' liquid crystal', ' LCD')}${st.seg ? '' : ` · ${st.ppi} ppi · ${st.hz} Hz`} · ${Math.round(st.nits)} nits · DisplayMark ${Math.round(st.score)}`;
    case 'camera': return `${p.mp} MP ${CAM_FORMATS[p.fmt].name} f/${p.ap}${p.ois !== 'none' ? ' · OIS' : ''} · CameraMark ${Math.round(st.score)}`;
    case 'battery': return `${p.mah.toLocaleString('en-US')} mAh · ${st.wh.toFixed(1)} Wh · ${CHEM[p.chem].name} · ${Math.round(st.chargeW)} W${p.wireless !== 'none' ? ' · wireless' : ''}`;
    case 'memory': return `${fmtMB(st.ramMB)} RAM · ${st.storageMB ? fmtMB(st.storageMB) : 'no'} storage · ${DRAM_GENS[p.gen].name}${st.speed ? ' · ' + Math.round(st.speed) + ' MB/s' : ''}`;
    case 'radio': return `${p.stds.map(x => NET_STDS[x].short).join(' + ')} · ${p.bands} band${p.bands === 1 ? '' : 's'} · ${fmtSpeed(st.peak)}`;
  }
  return '';
}
function partRoomLine(type, p, st, d) {
  switch (type) {
    case 'display': return `${st.stack.toFixed(1)} mm thick · ${Math.round(st.w)}×${Math.round(st.h)} mm · ${Math.round(st.weight)} g`;
    case 'camera': return `${st.footprint[0].toFixed(0)}×${st.footprint[1].toFixed(0)}×${st.z.toFixed(1)} mm tall · ${camVolOf(st).toFixed(2)} cm³`;
    case 'battery': return `${st.volume.toFixed(1)} cm³ · cells ≥${st.z.toFixed(1)} mm · ${Math.round(st.weight)} g`;
    case 'memory': return `${st.volume.toFixed(2)} cm³ · ${st.pkgs} package${st.pkgs === 1 ? '' : 's'}`;
    case 'radio': return `board ${(ELECTRONICS_BASE * integrationFactor(d && d.int != null ? d.int : 0) * st.vol).toFixed(1)} cm³ · ${st.power.toFixed(2)} W`;
  }
  return '';
}
function sanitizeDraft(d) {
  const av = playerAv(), t = now();
  // older drafts kept add-ons only as layout parts
  if (!d.addons) { d.addons = {}; for (const e of d.layout || []) if (LEGACY_ADDONS.includes(e.t)) d.addons[e.t] = true; }
  const blank = blankSpec(d.cat);
  for (const k in blank) if (d[k] == null) d[k] = clone(blank[k]);
  for (const k of ['body', 'style', 'cams', 'feat', 'size', 'place', 'nav', 'up', 'art']) for (const kk in blank[k]) if (d[k][kk] == null) d[k][kk] = clone(blank[k][kk]);
  if (!Array.isArray(d.stamps)) d.stamps = [];
  d.stamps = d.stamps.filter(st => st && LAYOUT_TYPES.stamp.faces.includes(st.f)).slice(0, 8);
  if (d.cat === 'tablet') d.form = 'slate';
  else if (!FORMS[d.form] || d.form === 'slate' || !av.ok(FORMS[d.form].tech)) d.form = bestForm(av.std, t);
  const f = formOf(d);
  // processor
  const okChip = d.chip.kind === 'custom' ? S.chips.some(c => c.id === d.chip.id && c.status === 'ready') : vendorChipsAvailable(t).some(c => c.id === d.chip.id);
  if (!okChip) {
    const vs = vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu);
    d.chip = { kind: 'vendor', id: (vs.find(c => c.tier !== 'flagship') || vs[0] || VENDOR_CHIPS[0]).id };
  }
  // parts: keep own designs that exist; supplier parts must be a model on sale today that fits this body
  const fixRef = (ref, type, role) => {
    if (ref && ref.src === 'own') return S.designs.some(x => x.id === ref.id) ? ref : stdRef(type, d, role);
    if (ref && ref.src === 'std') {
      const x = catalogItem(ref.vid);
      if (x && x.key === partKey(type, d, role) && x.release <= t && t < x.release + CATALOG_LIFE && stdPartOk(type, ref.p, role, d)) return ref;
      // discontinued, made for another body, or an old built-to-order part: the closest model on sale
      const v = catalogVendor(ref.vid);
      return stdRef(type, d, role, ref.p, v && v.id) || (stdPartOk(type, ref.p, role, d) ? { src: 'std', p: ref.p } : null);
    }
    return stdRef(type, d, role);
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
  for (const k in BODY_UPGRADES) { const o = BODY_UPGRADES[k][d.up[k]]; if (!o || !av.ok(o.tech)) d.up[k] = Object.keys(BODY_UPGRADES[k])[0]; }
  if (d.nav.home !== 'auto' && (!NAV_HOME[d.nav.home] || !av.ok(NAV_HOME[d.nav.home].tech))) d.nav.home = 'auto';
  if (d.nav.keys !== 'auto' && (!NAV_KEYS[d.nav.keys] || !av.ok(NAV_KEYS[d.nav.keys].tech))) d.nav.keys = 'auto';
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
  name: 'Phone Lab', icon: '📱', live: false, tab: 'body', partMode: {}, catVendor: {}, catSort: {}, camOpen: 'main', sel: null, selKey: null, selStamp: null, paintCol: 1,
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
      <h3>Accent color</h3><div class="tiny faint mb-s">Buttons, camera island${isKeypadForm(formOf(d)) ? ' and (optionally) keys' : ''} in a second color.</div>
      <div class="row wrap"><button class="swatch-btn none ${!d.style.accent ? 'on' : ''}" data-accent="" title="Same as the body">✕</button>${BODY_COLORS.map(c => `<button class="swatch-btn ${c === d.style.accent ? 'on' : ''}" data-accent="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        <label class="tiny dim row" style="gap:4px">Custom <input type="color" id="accentPick" value="${esc(d.style.accent || d.color)}"></label></div>
      <h3>Front panel</h3>${segBtn('front', [{ v: 'black', label: '⬛ Black' }, { v: 'white', label: '⬜ White' }], d.style.front || 'black')}
      ${isKeypadForm(formOf(d)) || ['car', 'bag'].includes(formOf(d)) ? `<h3>Keys</h3>
        ${segBtn('keys', [{ v: 'classic', label: 'Classic' }, { v: 'round', label: 'Round' }, { v: 'flush', label: 'Flush pad' }, { v: 'bubble', label: 'Bubble' }].concat([0, 1, 2].filter(i => artDrawn(d.art.shapes[i])).map(i => ({ v: 'c' + i, label: '✏️ Drawn ' + (i + 1) }))), d.style.keys || 'classic')}
        <div class="mt-s">${segBtn('keytone', [{ v: 'auto', label: 'Auto' }, { v: 'light', label: 'Light keys' }, { v: 'dark', label: 'Dark keys' }, { v: 'accent', label: 'Accent' }], d.style.keyTone || 'auto')}</div>
        <h3>Key shapes <span class="faint">draw your own</span></h3>
        <div class="tiny faint mb-s">Paint a shape, then use it for all keys (above) or for single keys in 📐 Layout. Start from a preset if you like.</div>
        <div class="paint-row">${[0, 1, 2].map(i => `<div class="paint-slot"><div class="tiny dim">Shape ${i + 1}</div>${this.painter('shape' + i, d.art.shapes[i] || '', ART_N.shape)}
          <div class="row wrap" style="gap:3px">${KEY_PRESETS.map(([k, ic]) => `<button class="btn xs" data-preset="${i}:${k}" title="${k}">${ic}</button>`).join('')}<button class="btn xs" data-paintclear="shape${i}" title="Clear">✕</button></div></div>`).join('')}</div>` : ''}
      <h3>Shape</h3>
      ${capSlider('style.radius', 'Corner roundness', 0, 1, 0.05, d.style.radius, v => Math.round(v * 100) + '%')}
      ${segBtn('edge', [{ v: 'round', label: 'Rounded edges' }, { v: 'flat', label: 'Flat sides' }, { v: 'chamfer', label: 'Chamfered' }], d.style.edge)}
      <h3>Size</h3>${this.sizeCtl(d, pc)}
      <h3>Water resistance</h3>${optCards('body.water', Object.entries(WATER).map(([k, w]) => ({ v: k, title: w.name, tech: w.tech })), d.body.water)}
      ${this.upgradeCards(d)}
      <h3>Board integration</h3>
      <select id="intSel" class="full">${ints.map(x => `<option value="${x.i}" ${x.i === d.int ? 'selected' : ''}>${x.name}${x.id !== 'int_discrete' && !av.market(x.id) ? ' ◆' : ''}</option>`).join('')}</select>
      <div class="tiny faint mt-s">Electronics take up <b>${pc.ev.elecVol.toFixed(0)} cm³</b>. Every integration step shrinks them – that's what turns a car-trunk radio into a pocket phone.</div>
      ${nextInt ? `<div class="mt-s">${lockFoot(techUI(nextInt[0]))}</div>` : ''}
      <h3>Logo</h3><input type="text" data-path="style.logo" value="${esc(d.style.logo || '')}" placeholder="${esc(S.company.split(' ')[0].toUpperCase())}" maxlength="14" class="full">
      <div class="mt-s">${optCards('up.logostyle', Object.entries(LOGO_STYLES).map(([k, o]) => ({ v: k, title: o.name, sub: o.desc, tech: o.tech })), d.up.logostyle, 4)}</div>
      <h3>Logo art <span class="faint">${artDrawn(d.art.logo) ? 'drawn' : 'using your brand name'}</span></h3>
      <div class="tiny faint mb-s">Draw a 16×16 logo. It replaces the printed name, and you can stamp it anywhere on the body (📐 Layout → 🔖 Logo stamp) – a few stamps look designed.</div>
      <div class="row wrap" style="gap:12px;align-items:flex-start">${this.painter('logo', d.art.logo || '', ART_N.logo)}
        <div><div class="pal">${LOGO_PALETTE.map((c, i) => `<button class="pal-c ${(this.paintCol == null ? 1 : this.paintCol) === i ? 'on' : ''}" data-pal="${i}" title="${i ? '' : 'Eraser'}" style="background:${i ? this.palColor(i, d) : 'transparent'}">${i ? '' : '⌫'}</button>`).join('')}</div>
          <div class="row wrap mt-s" style="gap:4px"><button class="btn xs" data-act="logoinitial">Start from my initial</button><button class="btn xs" data-paintclear="logo">Clear</button></div>
          <div class="row wrap mt-s" style="gap:4px"><button class="btn sm" data-act="addstamp" ${d.stamps.length >= 8 ? 'disabled' : ''}>🔖 + Stamp it on the body</button><span class="tiny faint">${d.stamps.length} stamp${d.stamps.length === 1 ? '' : 's'}</span></div></div></div>`;
  },
  // a pixel grid you paint on (shapes: on/off; the logo: palette colors)
  painter(id, art, n) {
    let h = '';
    for (let j = 0; j < n * n; j++) { const c = +(art[j] || 0); h += `<i style="${c ? 'background:' + (id === 'logo' ? this.palColor(c, S.draft) : '#e9edf5') : ''}"></i>`; }
    return `<div class="paint ${id === 'logo' ? 'logo' : ''}" data-paint="${id}" data-n="${n}" style="--n:${n}">${h}</div>`;
  },
  palColor(i, d) { const c = LOGO_PALETTE[i]; return c === 'accent' ? (d && d.style.accent) || '#f08a3c' : c; },
  // frames, cooling, ruggedness, textures, coatings and frame finishes
  upgradeCards(d) {
    const t = now(), price = o => (o.cost ? ' · ' + fmtMoney(o.cost * decl(0.08, o.tech ? techMarket(o.tech) : 2000, t, 0.3)) : '');
    const eff = o => [o.therm && o.therm !== 1 ? `heat ×${o.therm.toFixed(2)}` : '', o.drop && o.drop !== 1 ? `toughness ×${o.drop.toFixed(2)}` : '', o.wt ? `${o.wt > 0 ? '+' : ''}${o.wt} g` : '', o.vol ? `${o.vol} cm³` : '', o.t ? `+${o.t} mm` : ''].filter(Boolean).join(' · ');
    const sec = (k, title, cols) => `<h3>${title}</h3>${optCards('up.' + k, Object.entries(BODY_UPGRADES[k]).map(([v, o]) => ({ v, title: o.name, sub: [o.desc, eff(o)].filter(Boolean).join(' ') + price(o), tech: o.tech })), d.up[k], cols || 2)}`;
    return sec('frame', 'Inner frame') + sec('cooling', 'Cooling') + sec('rugged', 'Ruggedness', 3) + sec('texture', 'Back texture', 3) + sec('coating', 'Coating') + sec('framefin', 'Frame finish', 3);
  },
  layout(d, pc) {
    const ev = pc.ev, lay = ev.lay;
    const sel = this.sel === 'stamp' ? null : lay.find(e => e.t === this.sel && e.t !== 'stamp');
    return `<div class="tiny dim mb-s">Drag anything onto any face it fits. Front, back and the four edges are unfolded below. Red = doesn't fit.</div>
      <div class="net-wrap" id="netWrap"></div>
      <div class="row wrap mt-s">
        <button class="btn sm" data-act="autolayout" title="Let your engineers place everything">✨ Auto-arrange</button>
        <button class="btn sm" data-act="addstamp" ${(d.stamps || []).length >= 8 ? 'disabled' : ''} title="Stamp your logo anywhere on the body">🔖 + Logo stamp</button>
        ${['sx', 'sy', 'kx', 'ky'].some(k => +(d.place || {})[k]) || Object.keys(d.keyPos || {}).length ? '<button class="btn sm" data-placereset="1">↺ Default screen & key positions</button>' : ''}
        <span class="tiny faint">Drag the screen and keypad too. Add keys, sensors and other extras under ✨ Features → Add-ons.</span>
      </div>
      ${this.selPanel(d, ev)}
      ${sel ? `<div class="card sub mt"><div class="row between"><b>${LAYOUT_TYPES[sel.t].name}</b>${ADDONS[sel.t] ? `<button class="btn sm danger" data-delel="${sel.t}">Remove</button>` : ''}</div>
        <div class="tiny dim">${LAYOUT_TYPES[sel.t].desc}</div>
        <div class="tiny faint mt-s">On the <b>${sel.f}</b> face · allowed: ${LAYOUT_TYPES[sel.t].faces.join(', ')}</div>
        <label class="chk small mt-s"><input type="checkbox" id="elAuto" ${d.layout.find(e => e.t === sel.t).auto !== false ? 'checked' : ''}> Let engineers place it automatically</label></div>` : ['screen', 'keypad', 'stamp'].includes(this.sel) ? '' : '<div class="tiny faint mt">Click an element to see where it works best. Click the keypad to move single keys.</div>'}
      ${this.navCtl(d, ev)}
      <h3>Ergonomics <span class="faint">${Math.round(ev.layout.score * 100)} / 100</span></h3>
      ${ev.layout.notes.length ? ev.layout.notes.map(n => `<div class="tiny warn">${esc(n)}</div>`).join('') : '<div class="tiny good">Everything is where hands and faces expect it.</div>'}
      <h3>Ports</h3>
      ${optCards('port', PORT_ORDER.filter(k => (PORTS[k].only ? PORTS[k].only.includes(formOf(d)) : !['car', 'bag'].includes(formOf(d)))).map(k => ({ v: k, title: PORTS[k].name, sub: PORTS[k].w ? `${PORTS[k].w}×${PORTS[k].h} mm · needs ${PORTS[k].minT} mm` : '', tech: PORTS[k].tech })), d.port)}
      <h3>Headphone jack</h3>${optCards('jack', Object.entries(JACKS).map(([k, j]) => ({ v: k, title: j.name, sub: j.d ? `needs ${j.minT} mm thickness` : '', tech: j.tech })), d.jack, 3)}
      <h3>SIM card</h3>${optCards('sim', SIM_ORDER.map(k => ({ v: k, title: SIMS[k].name, tech: SIMS[k].tech })), d.sim, 3)}
      <div class="mt-s">${toggleCard('sd', 'Memory card slot', 'microSD on an edge or under the cover', 'feat_sd', d.sd)}</div>
      <h3>Camera island</h3>${segBtn('island', [{ v: 'auto', label: 'Auto' }, { v: 'square', label: 'Square' }, { v: 'circle', label: 'Circle' }, { v: 'bar', label: 'Bar' }, { v: 'none', label: 'Flush lenses' }], d.style.island)}`;
  },
  // the selected screen, keypad, key or logo stamp
  selPanel(d, ev) {
    if (this.sel === 'screen' && ev.geom.screenRect) return `<div class="card sub mt"><b>Screen</b><div class="tiny dim">Drag it around the front. The body grows if it has to; margins never go below what the parts need.</div></div>`;
    if (this.sel === 'keypad' && ev.geom.keypadRect) {
      const k = this.selKey ? keypadKeys(d, ev.geom.keypadRect, ev.geom.form).find(x => x.id === this.selKey) : null;
      const shapes = [['', 'Body style'], ['classic', 'Classic'], ['round', 'Round'], ['flush', 'Flush'], ['bubble', 'Bubble']].concat([0, 1, 2].filter(i => artDrawn(d.art.shapes[i])).map(i => ['c' + i, '✏️ Drawn ' + (i + 1)]));
      return `<div class="card sub mt"><b>Keypad</b><div class="tiny dim">Drag the pad to move all keys, or drag single keys to rearrange them. Keys can't overlap, sit on the screen or hang off the front.</div>
        ${k ? `<div class="mt-s"><b class="small">Key ${esc(k.l || k.id)}</b> <span class="tiny faint">${k.moved ? 'moved' : 'in its default spot'}</span></div>
          <div class="mt-s">${segBtn('keyshape', shapes.map(([v, label]) => ({ v, label })), (d.keyShape || {})[k.id] || '')}</div>
          <div class="row wrap mt-s"><button class="btn sm" data-keyall="1">Use this shape on every key</button>${k.moved ? '<button class="btn sm" data-keyreset="1">↺ Put this key back</button>' : ''}</div>` : '<div class="tiny faint mt-s">Click a key to pick its shape. Draw your own shapes in 🧩 Body → Key shapes.</div>'}</div>`;
    }
    if (this.sel === 'stamp' && d.stamps[this.selStamp]) {
      const st = d.stamps[this.selStamp];
      return `<div class="card sub mt"><div class="row between"><b>Logo stamp ${this.selStamp + 1}</b><button class="btn sm danger" data-stampdel="1">Remove</button></div>
        <div class="tiny dim">On the ${st.f}. ${artDrawn(d.art.logo) ? 'Uses your drawn logo.' : 'Uses your brand name – draw a logo in 🧩 Body → Logo art.'} A few stamps make a design; more than four look cluttered.</div>
        <div class="mt-s">${segBtn('stampsize', [{ v: 6, label: 'Small' }, { v: 10, label: 'Medium' }, { v: 16, label: 'Large' }, { v: 24, label: 'Huge' }], st.s || 10)}</div></div>`;
    }
    return '';
  },
  // home button and navigation keys of a touch phone
  navCtl(d, ev) {
    const f = formOf(d), touch = !isKeypadForm(f) && f !== 'car' && f !== 'bag';
    if (!touch || f === 'fold') return '';
    const opt = (tbl, rename) => Object.entries(tbl).map(([k, o]) => ({ v: k, label: rename(o.name), disabled: o.tech && !playerAv().ok(o.tech), title: o.tech ? techUI(o.tech).msg || TECH[o.tech].desc : '' }));
    return `<h3>Navigation</h3>
      <div class="tiny faint mb-s">Now: ${NAV_HOME[ev.geom.nav.home].name} · ${NAV_KEYS[ev.geom.nav.keys].name}. A home button or keys need a chin below the screen.</div>
      ${segBtn('navhome', [{ v: 'auto', label: 'Auto' }].concat(opt(NAV_HOME, n => n.replace(' home button', ''))), d.nav.home)}
      <div class="mt-s">${segBtn('navkeys', [{ v: 'auto', label: 'Auto' }].concat(opt(NAV_KEYS, n => n.replace(' (home button only)', '').replace('On-screen navigation bar', 'On-screen bar').replace('Gesture navigation', 'Gestures'))), d.nav.keys)}</div>`;
  },
  screen(d) {
    return this.partSwitch('display', d) + (this.mode('display', d) === 'own' ? this.ownList('display', d, null) : this.catalogList('display', d));
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
        const st = evalCamera(p, now(), role), x = ref.src === 'std' ? catalogItem(ref.vid) : null;
        body = `<div class="row wrap mt-s"><select data-camsrc="${role}"><option value="std" ${ref.src === 'std' ? 'selected' : ''}>Supplier module</option>${own.map(x => `<option value="${x.id}" ${ref.src === 'own' && ref.id === x.id ? 'selected' : ''}>${esc(x.name)} (yours)</option>`).join('')}</select>
          <span class="tiny faint">${x ? '<b>' + esc(x.name) + '</b> · ' : ''}${esc(partPerfLine('camera', p, st))} · 📦 ${esc(partRoomLine('camera', p, st, d))}</span>
          ${ref.src === 'std' ? `<button class="btn sm" data-camopen="${role}">${this.camOpen === role ? 'Hide models' : 'Choose model…'}</button>` : ''}</div>`;
        if (ref.src === 'std' && this.camOpen === role) body += `<div class="mt-s">${this.catalogList('camera', d, role)}</div>`;
      }
      return `<div class="cam-slot ${ref ? '' : 'off'}">${toggleCard('cam.' + role, CAM_ROLES[role].name, role === 'tele' ? 'Optical zoom' : role === 'ultra' ? 'Wide-angle shots' : role === 'front' ? 'Video calls & selfies' : 'Your main shooter', roleTech, !!ref, dis)}${u.ok ? body : ''}</div>`;
    };
    return `${['main', 'front', 'ultra', 'tele'].map(slot).join('')}
      ${d.cams.main ? `<h3>Flash</h3>${optCards('flash', Object.entries(FLASHES).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech })), d.flash)}` : ''}
      <div class="tiny faint mt-s">Taller modules make a camera bump on thin phones. Design your own in the 🛠️ Parts Lab: bigger apertures, more lens elements, sensor-shift stabilization, exclusive sensors.</div>`;
  },
  // body size: every dimension is auto (fits the parts) or a target. Thinner than the parts need makes the
  // body taller; with the height fixed too, the parts must fit – or you pick smaller ones.
  sizeCtl(d, pc) {
    const ev = pc.ev, z = ev.sizing, g = ev.geom, F = FORMS[formOf(d)], hand = !!F.handset, sz = d.size || {};
    const sl = (k, label, min, max, cur, note) => {
      const set = +sz[k] > 0, val = clamp(set ? +sz[k] : cur, min, max);
      return `<div class="cap"><div class="row between"><span class="dim small">${label}</span>
          <span class="row" style="gap:6px"><b class="mono" data-show="size.${k}">${set ? (+sz[k]).toFixed(1) + ' mm' : 'auto · ' + cur.toFixed(1) + ' mm'}</b>${set ? `<button class="btn xs" data-sizeauto="${k}" title="Let the parts decide">auto</button>` : ''}</span></div>
        <input type="range" data-path="size.${k}" data-num min="${min.toFixed(1)}" max="${max.toFixed(1)}" step="0.1" value="${val.toFixed(1)}">
        <div class="row between tiny faint"><span>${note}</span><span>${max.toFixed(0)} mm</span></div></div>`;
    };
    const Hmin = z.faceH || g.H, Hmax = Math.max(z.autoH || 0, g.H, Hmin) + 40;
    const Tmin = Math.ceil(z.Tabs * 10) / 10, Tmax = Math.max(z.fitT, g.T, Tmin) + 8;
    const big = !hand ? this.biggerBattery(d, ev) : null;
    return `<div class="tiny faint mb-s">Set any dimension, or leave it on auto. Go thinner than the parts need and the body grows taller; fix the height too and the parts must fit – or pick smaller ones. Thin bodies shed less heat.</div>
      ${sl('w', 'Width', z.autoW, z.autoW + 25, g.W, `min ${z.autoW.toFixed(1)} · screen${F.kp ? ' & keys' : ''}`)}
      ${sl('h', 'Height', Hmin, Hmax, g.H, `min ${Hmin.toFixed(1)} · front face`)}
      ${hand ? '' : sl('t', 'Thickness', Tmin, Tmax, g.T, `min ${Tmin.toFixed(1)} · ${z.tallest}`)}
      ${z.short > 0 ? `<div class="note bad">⛔ ${z.short.toFixed(1)} cm³ of parts don't fit – they need ${z.fitT.toFixed(1)} mm at this size.</div>` : ''}
      ${z.grewBy > 0.5 ? `<div class="tiny warn">↕ ${z.grewBy.toFixed(0)} mm taller than the front needs, to fit the parts at this thickness.</div>` : ''}
      ${hand ? '<div class="tiny faint mt-s">The electronics live in the car unit, not the handset.</div>' : this.spaceBars(ev)}
      <div class="row wrap mt-s">${z.custom ? '<button class="btn sm" data-act="autosize">↺ All auto</button>' : ''}
        ${big ? `<button class="btn sm" data-act="fillbat">🔋 Biggest battery that fits: ${esc(big.name)} (+${(big.p.mah - d.battery.p.mah).toLocaleString('en-US')} mAh)</button>` : ''}</div>`;
  },
  // where the room inside goes
  spaceBars(ev) {
    const s = ev.space, cap = Math.max(s.room, s.total, 0.01);
    const parts = [['🔋 Battery', s.battery], ['🧠 Processor', s.chip], ['🔌 Board & radio', s.board], ['💾 Memory', s.memory], ['📷 Cameras', s.cameras], ['✨ Other', s.other]];
    return `<div class="space mt-s"><div class="row between tiny"><b>Room inside</b><span class="mono ${s.total > s.room + 0.05 ? 'bad' : ''}">${s.total.toFixed(1)} of ${s.room.toFixed(1)} cm³ used</span></div>
      <div class="space-bar">${parts.map(([l, v], i) => `<span class="sp${i}" style="width:${(v / cap * 100).toFixed(2)}%" title="${l}: ${v.toFixed(1)} cm³"></span>`).join('')}</div>
      <div class="tiny dim">${parts.filter(x => x[1] >= 0.05).map(([l, v]) => `${l} ${v.toFixed(1)}`).join(' · ')}${s.room > s.total + 0.05 ? ` · free ${(s.room - s.total).toFixed(1)}` : ''} cm³</div>
      <div class="tiny faint">Tallest inside: battery cells ${s.batZ.toFixed(1)} mm · board + processor ${(s.chipZ + 0.7).toFixed(1)} mm</div></div>`;
  },
  battery(d) {
    if (formOf(d) === 'car') return '<div class="note">Car phones run off the car\'s 12 V battery – no cells needed.</div>';
    return this.partSwitch('battery', d) + (this.mode('battery', d) === 'own' ? this.ownList('battery', d) : this.catalogList('battery', d));
  },
  memory(d) { return this.partSwitch('memory', d) + (this.mode('memory', d) === 'own' ? this.ownList('memory', d) : this.catalogList('memory', d)) + `<div class="mt">${toggleCard('sd', 'Memory card slot', 'Expandable storage', 'feat_sd', d.sd)}</div>`; },
  radio(d, pc) { return this.partSwitch('radio', d) + (this.mode('radio', d) === 'own' ? this.ownList('radio', d) : this.catalogList('radio', d)) + this.coverage(pc); },
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
      <div class="tiny faint mb-s">Performance is what the chip delivers at full speed; in this ${ev.geom.T.toFixed(1)} mm body it can shed ${ev.thermBudget.toFixed(1)} W before it throttles. 📦 is the room it takes on the board.</div>
      <div class="chip-cards">${rows.map(r => {
        const sp = chipSpace(r.c), sus = Math.min(1, Math.pow(ev.thermBudget / Math.max(0.01, r.c.power), 0.6));
        return `<div class="ocard ${sel === r.key ? 'on' : ''}" data-chip="${r.key}">
        <div class="row between"><div class="oc-t">${r.custom ? '💠 ' : ''}${esc(r.c.name)}</div><b class="mono">${fmtMoney(r.price)}</b></div>
        <div class="oc-s mono">⚡ CPU ${fmtSci(r.c.cpu)} · GPU ${r.c.gpu ? fmtSci(r.c.gpu) : '—'}${r.c.tops ? ' · AI ' + r.c.tops.toFixed(1) : ''} · ${nodeLabel(r.c.nm)}${r.c.hasModem ? ' · ' + GEN_LABEL(r.c.modemGen) + ' modem' : ''}${r.c.dsp ? ' · DSP' : ''}</div>
        <div class="oc-s mono">📦 ${sp.vol.toFixed(1)} cm³ · ${sp.z.toFixed(1)} mm tall · ${r.c.area} mm² die · ${r.c.power.toFixed(2)} W <span class="${sus < 0.8 ? 'warn' : sus < 0.999 ? '' : 'good'}">${sus >= 0.999 ? '· full speed here' : `· ${Math.round(sus * 100)}% sustained here`}</span></div>
        ${r.custom ? '<span class="oc-ex">your design</span>' : `<span class="tag">${r.c.tier}</span>`}</div>`;
      }).join('')}</div>
      ${this.chipPitch(t)}`;
  },
  // what designing your own processor would save, in this year's money
  chipPitch(t) {
    const f = flagshipChip(t), e = chipEconomics(f.area, f.nm, t);
    return `<div class="note mt-s">💠 <b>Your own chip?</b> Vendors charge for performance: ${esc(f.name)} costs ${fmtMoney(vendorChipPrice(f, t))}, but the same silicon would cost you about ${fmtMoney(e.foundry)} from a foundry.
      Design one in the 🛠️ Parts Lab → 💠 Processor (tape-out about ${fmtMoney(tapeOutCost(f.nm, f.area))}). The 🧠 Chip design research track only affects chips you design yourself.</div>`;
  },
  // researched optional hardware: keys, sensors, lights, panels…
  addonCards(d) {
    const t = now(), ctx = addonCtx(d), on = d.addons || {};
    const keys = Object.keys(ADDONS).sort((a, b) => TECH[ADDONS[a].tech].market - TECH[ADDONS[b].tech].market);
    const shown = keys.filter(k => on[k] || t >= TECH[ADDONS[k].tech].market - 6);
    return `<h3>Add-ons <span class="faint">${keys.filter(k => on[k]).length} fitted</span></h3>
      <div class="tiny faint mb-s">Extra keys, sensors and gadgets. Each one adds cost, room and weight – and feature points if the phone can use it. Placeable ones show up in 📐 Layout.</div>
      <div class="ocards" style="--cols:2">${shown.map(k => {
        const A = ADDONS[k], why = addonProblem(k, ctx);
        const cost = A.cost * decl(0.08, techMarket(A.tech), t, 0.3);
        return toggleCard('addons.' + k, A.name, `${esc(A.desc)} · ${fmtMoney(cost)}${A.design && A.design < 1 ? ' · looks clunky' : A.design > 1 ? ' · looks great' : ''}`, A.tech, !!on[k], on[k] ? null : why);
      }).join('')}</div>`;
  },
  features(d) {
    const touch = (partParams(d.display) || {}).touch && partParams(d.display).touch !== 'none';
    return `<h3>Software</h3>${optCards('os', OS_ORDER.map(k => ({ v: k, title: OS[k].name, sub: (OS[k].needsTouch && !touch ? 'Needs a touchscreen to shine. ' : '') + (OS[k].fee ? `License ${fmtMoney(OS[k].fee)}/unit` : 'No license fee'), tech: OS[k].tech })), d.os)}
      ${S.researched.os_own ? '<div class="note good mt-s">You use your own OS: no license fees.</div>' : ''}
      <h3>Biometrics</h3>${optCards('feat.fp', Object.entries(FINGERPRINT).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech })), d.feat.fp)}
      ${this.addonCards(d)}
      <h3>Extras</h3>${EXTRAS.map(([k, id, label]) => toggleCard('feat.' + k, label, TECH[id] ? TECH[id].desc : '', id, !!d.feat[k])).join('')}`;
  },

  // ---- part source switch and supplier configurators -------------------------------------------
  mode(type, d) {
    const ref = type === 'display' ? d.display : d[type];
    return ref && ref.src === 'own' ? 'own' : this.partMode[type] === 'own' ? 'own' : 'std';
  },
  partSwitch(type, d) {
    const n = S.designs.filter(x => x.type === type).length;
    return `<div class="row between mb-s">${segBtn('src-' + type, [{ v: 'std', label: `Suppliers (${PART_VENDORS[type].length} companies)` }, { v: 'own', label: `Your designs (${n})` }], this.mode(type, d))}
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
  // every supplier's models on sale for this body: what each does, the room it takes and its price
  catalogList(type, d, role) {
    const t = now(), ref = type === 'camera' ? d.cams[role] : d[type], vend = PART_VENDORS[type], sm = supplyMul();
    const fv = this.catVendor[type] || 'all', sort = this.catSort[type] || 'new';
    let rows = catalogOnSale(type, partKey(type, d, role), t).map(x => {
      const st = PART_EVAL[type](x.p, t, role), v = catalogVendor(x.id);
      return { x, st, v, ok: stdPartOk(type, x.p, role, d), price: stdPartPrice(type, { src: 'std', p: x.p, vid: x.id }, st.cost, t, role) * sm, room: partRoom(type, st), perf: partPerf(type, st) };
    });
    if (!rows.length) return `<div class="note">Nobody sells a ${PART_INFO[type].name.toLowerCase()} for this kind of device yet.</div>`;
    if (fv !== 'all') rows = rows.filter(r => r.x.vendor === fv);
    rows.sort({ new: (a, b) => b.x.release - a.x.release, perf: (a, b) => b.perf - a.perf, small: (a, b) => a.room - b.room, cheap: (a, b) => a.price - b.price }[sort]);
    const cur = ref && ref.src === 'std' ? catalogItem(ref.vid) : null, cst = cur ? PART_EVAL[type](cur.p, t, role) : null;
    return `${cur ? `<div class="note mb-s">Fitted: <b>${esc(cur.name)}</b> ’${String(Math.floor(cur.release)).slice(2)} from ${esc(cur.vname)} · ${esc(partPerfLine(type, cur.p, cst))} · 📦 ${esc(partRoomLine(type, cur.p, cst, d))}</div>` : ''}
      <div class="row wrap mb-s" style="gap:6px">${segBtn('catv-' + type, [{ v: 'all', label: 'All makers' }].concat(vend.map(v => ({ v: v.id, label: v.name.split(' ')[0], title: v.desc }))), fv)}
        <select data-catsort="${type}">${[['new', 'Newest first'], ['perf', 'Best first'], ['small', 'Smallest first'], ['cheap', 'Cheapest first']].map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="tiny faint mb-s">${fv === 'all' ? vend.map(v => `<b>${esc(v.name)}</b> – ${esc(v.desc)}`).join('<br>') : esc(vend.find(v => v.id === fv).desc)}</div>
      <div class="chip-cards">${rows.map(r => this.catCard(type, role, r, cur ? cur.id : null, d)).join('')}</div>
      <div class="tiny faint mt-s">Every company releases a new range each year; models stay on sale for ${CATALOG_LIFE} years. 📦 is the room a part takes inside the body.</div>`;
  },
  catCard(type, role, r, cur, d) {
    const { x, st, v } = r, miss = r.ok ? [] : stdPartMissing(type, x.p, role);
    return `<div class="ocard ${cur === x.id ? 'on' : ''} ${r.ok ? '' : 'locked'}" ${r.ok ? `data-cat="${type}|${role || ''}|${x.id}"` : ''} title="${esc(v.name + ' – ' + v.desc)}">
      <div class="row between"><div class="oc-t">${esc(x.name)} <span class="faint tiny">’${String(Math.floor(x.release)).slice(2)}</span>${x.tag ? ` <span class="tag">${esc(x.tag)}</span>` : ''}</div><b class="mono">${fmtMoney(r.price)}</b></div>
      <div class="oc-s">${esc(partPerfLine(type, x.p, st))}</div>
      <div class="oc-s mono">📦 ${esc(partRoomLine(type, x.p, st, d))}</div>
      ${r.ok ? '' : `<span class="oc-lock">🔒 needs ${esc(miss.slice(0, 2).map(id => TECH[id].name).join(', '))}${miss.length > 2 ? '…' : ''}</span>`}</div>`;
  },
  // the biggest supplier battery that fits the room the parts leave
  biggerBattery(d, ev) {
    const ref = d.battery;
    if (!ref || ref.src !== 'std' || ev.sizing.short > 0) return null;
    const t = now(), cur = evalBattery(ref.p, t), room = cur.volume + ev.sizing.spareVol - 0.05, free = ev.geom.T - (ev.sizing.Tabs - Math.max(ev.space.batZ, ev.space.chipZ + 0.7));
    const fits = catalogOnSale('battery', partKey('battery', d), t).filter(x => stdPartOk('battery', x.p, null, d) && x.p.mah > ref.p.mah && evalBattery(x.p, t).volume <= room && batteryZ(x.p) <= free);
    return fits.sort((a, b) => b.p.mah - a.p.mah)[0] || null;
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
    const fr = N.faces.front, d = S.draft;
    const zone = (r, cls, label, drag) => { const [x, y, w, hh] = r; return `<div class="net-zone ${cls} ${this.sel === cls ? 'sel' : ''} ${drag ? 'drag' : ''}" ${drag ? `data-zone="${cls}"` : ''} title="${drag ? 'Drag to move' : ''}" style="left:${fr.x + x * N.k}px;top:${fr.y + (N.Hf - y - hh) * N.k}px;width:${w * N.k}px;height:${hh * N.k}px">${label}</div>`; };
    if (g.screenRect) h += zone(g.screenRect, 'screen', 'screen', g.form !== 'fold');
    if (g.keypadRect) h += zone(g.keypadRect, 'keypad', this.sel === 'keypad' ? '' : 'keys', true);
    // with the keypad selected, every key can be dragged on its own
    if (g.keypadRect && this.sel === 'keypad') for (const k of keypadKeys(d, g.keypadRect, g.form)) {
      h += `<div class="net-key ${this.selKey === k.id ? 'sel' : ''}" data-key="${k.id}" style="left:${fr.x + (k.x - k.w / 2) * N.k}px;top:${fr.y + (N.Hf - k.y - k.h / 2) * N.k}px;width:${k.w * N.k}px;height:${k.h * N.k}px">${esc(k.l && k.l.length < 3 ? k.l : '')}</div>`;
    }
    lay.forEach((el, i) => {
      const [x, y, w, hh] = this.elRectPx(el, N);
      if (el.t === 'stamp') { h += `<div class="net-el t-stamp ${this.sel === 'stamp' && this.selStamp === el.i ? 'sel' : ''}" data-stamp="${el.i}" title="Logo stamp" style="left:${x}px;top:${y}px;width:${Math.max(6, w)}px;height:${Math.max(6, hh)}px"></div>`; return; }
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
    const r05 = v => Math.round(v * 2) / 2;
    const at = e => { const r = net.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    net.onpointerdown = e => {
      const ky = e.target.closest('[data-key]'), zn = e.target.closest('[data-zone]'), st = e.target.closest('[data-stamp]'), elDiv = e.target.closest('[data-el]');
      if (!ky && !zn && !st && !elDiv) return;
      e.preventDefault();
      const d = S.draft, [x0, y0] = at(e);
      if (ky) { this.selKey = ky.dataset.key; drag = { kind: 'key', id: ky.dataset.key, x0, y0, o: (d.keyPos[ky.dataset.key] || [0, 0]).slice(), box: ky }; }
      else if (zn) {
        const z = zn.dataset.zone, pl = d.place;
        if (this.sel !== z) this.selKey = null;
        this.sel = z;
        drag = { kind: 'zone', zone: z, x0, y0, o: z === 'screen' ? [+pl.sx || 0, +pl.sy || 0] : [+pl.kx || 0, +pl.ky || 0], box: zn };
      } else if (st) { this.sel = 'stamp'; this.selStamp = +st.dataset.stamp; drag = { kind: 'stamp', i: +st.dataset.stamp, box: st }; }
      else {
        const type = elDiv.dataset.el;
        this.sel = type;
        const resolved = this.pc.ev.lay.find(x => x.t === type), rec = d.layout.find(x => x.t === type);
        if (rec && rec.auto !== false) Object.assign(rec, { f: resolved.f, u: resolved.u, v: resolved.v, auto: false });
        drag = { kind: 'el', type, box: elDiv };
        if (this.has3d && Device3D.highlight) Device3D.highlight(type);
      }
      net.setPointerCapture(e.pointerId);
    };
    net.onpointermove = e => {
      if (!drag) {
        const elDiv = e.target.closest('[data-el]');
        if (this.has3d && Device3D.highlight) Device3D.highlight(elDiv ? elDiv.dataset.el : this.sel);
        return;
      }
      const [x, y] = at(e), d = S.draft, k = this.N.k;
      drag.moved = true;
      if (drag.kind === 'key' || drag.kind === 'zone') {
        const dx = (x - drag.x0) / k, dy = -(y - drag.y0) / k;
        if (drag.kind === 'key') d.keyPos[drag.id] = [r05(drag.o[0] + dx), r05(drag.o[1] + dy)];
        else if (drag.zone === 'screen') { d.place.sx = clamp(r05(drag.o[0] + dx), -15, 15); d.place.sy = clamp(r05(drag.o[1] + dy), -15, 25); }
        else { d.place.kx = clamp(r05(drag.o[0] + dx), -15, 15); d.place.ky = clamp(r05(drag.o[1] + dy), -12, 25); }
        drag.box.style.transform = `translate(${x - drag.x0}px, ${y - drag.y0}px)`;
      } else {
        const faces = drag.kind === 'stamp' ? LAYOUT_TYPES.stamp.faces : LAYOUT_TYPES[drag.type].faces;
        const pos = this.pxToFace(x, y, this.N, faces);
        if (!pos) return;
        const rec = drag.kind === 'stamp' ? d.stamps[drag.i] : d.layout.find(z => z.t === drag.type);
        Object.assign(rec, pos, drag.kind === 'el' ? { auto: false } : {});
        const [bx, by, bw, bh] = this.elRectPx(drag.kind === 'stamp' ? { t: 'stamp', f: rec.f, u: rec.u, v: rec.v, s: rec.s } : rec, this.N);
        Object.assign(drag.box.style, { left: bx + 'px', top: by + 'px', width: Math.max(6, bw) + 'px', height: Math.max(6, bh) + 'px' });
      }
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
        <div class="row between mt"><span class="dim small">${SEG_INFO[rv.seg].name} quality</span><b>${(typeof rv.q === 'number' ? rv.q : rv.q[rv.seg]).toFixed(0)}</b></div>
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
    const d = S.draft, was = formOf(d);
    d.form = f;
    // re-fit supplier parts to the new body
    if (d.display && d.display.src === 'std') d.display = stdRef('display', d, null, null, (catalogVendor(d.display.vid) || {}).id);
    if (f === 'car') d.battery = null;
    else if (!d.battery || d.battery.src === 'std') d.battery = stdRef('battery', d, null, d.battery && d.battery.p, d.battery && (catalogVendor(d.battery.vid) || {}).id);
    if (d.radio && d.radio.src === 'std' && (((was === 'car' || was === 'bag') !== (f === 'car' || f === 'bag')) || d.radio.p.stds.includes('imts'))) d.radio = stdRef('radio', d, null, d.radio.p);
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
      if (del) { d().layout = d().layout.filter(x => x.t !== del.dataset.delel); if (d().addons) d().addons[del.dataset.delel] = false; this.sel = null; changed(); return; }
      const own = e.target.closest('[data-own]');
      if (own) { const [type, id] = own.dataset.own.split(':'); this.setPart(type, null, { src: 'own', id }); changed(); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const raw = pick.dataset.v, val = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        const path = pick.dataset.pick;
        if (path === 'form') this.setForm(val);
        else setPath(d(), path, val);
        changed(); return;
      }
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        const path = tg.dataset.toggle;
        if (path.startsWith('cam.')) {
          const role = path.slice(4);
          this.setPart('camera', role, d().cams[role] ? null : stdRef('camera', d(), role));
          if (d().cams[role]) this.camOpen = role;
          if (role === 'main' && !d().cams.main) { d().cams.ultra = null; d().cams.tele = null; }
          if (role === 'main' && d().cams.main && d().flash === 'none' && playerAv().std('cam_flash')) d().flash = 'led';
        } else setPath(d(), path, !getPath(d(), path));
        changed(); return;
      }
      const ct = e.target.closest('[data-cat]');
      if (ct) { const [type, role, id] = ct.dataset.cat.split('|'), x = catalogItem(id); if (x) this.setPart(type, role || null, { src: 'std', p: clone(x.p), vid: x.id }); changed(); return; }
      const co = e.target.closest('[data-camopen]');
      if (co) { this.camOpen = this.camOpen === co.dataset.camopen ? null : co.dataset.camopen; changed(); return; }
      const sa = e.target.closest('[data-sizeauto]');
      if (sa) { d().size[sa.dataset.sizeauto] = 0; changed(); return; }
      const pr = e.target.closest('[data-placereset]');
      if (pr) { d().place = { sx: 0, sy: 0, kx: 0, ky: 0 }; d().keyPos = {}; changed(); return; }
      const pal = e.target.closest('[data-pal]');
      if (pal) { this.paintCol = +pal.dataset.pal; changed(); return; }
      const pre = e.target.closest('[data-preset]');
      if (pre) { const [i, name] = pre.dataset.preset.split(':'); d().art.shapes[+i] = presetMask(name, ART_N.shape); changed(); return; }
      const pcl = e.target.closest('[data-paintclear]');
      if (pcl) { const id = pcl.dataset.paintclear; if (id === 'logo') d().art.logo = ''; else d().art.shapes[+id.slice(5)] = ''; changed(); return; }
      if (e.target.closest('[data-keyall]') && this.selKey) { const sh = (d().keyShape || {})[this.selKey] || ''; d().keyShape = {}; if (sh) d().style.keys = sh; changed(); return; }
      if (e.target.closest('[data-keyreset]') && this.selKey) { delete d().keyPos[this.selKey]; changed(); return; }
      if (e.target.closest('[data-stampdel]')) { d().stamps.splice(this.selStamp, 1); this.sel = null; changed(); return; }
      const ch = e.target.closest('[data-chip]');
      if (ch) { const [kind, id] = ch.dataset.chip.split(':'); d().chip = { kind, id }; changed(); return; }
      const col = e.target.closest('[data-color]');
      if (col) { d().color = col.dataset.color; changed(); return; }
      const acc = e.target.closest('[data-accent]');
      if (acc) { d().style.accent = acc.dataset.accent; if (!acc.dataset.accent && d().style.keyTone === 'accent') d().style.keyTone = 'auto'; changed(); return; }
      const segB = e.target.closest('.segbtn button');
      if (segB && !segB.disabled) {
        const seg = segB.parentElement.dataset.seg, v = segB.dataset.v;
        if (seg === 'cat' && v !== d().cat) { const keep = { name: d().name, color: d().color }; S.draft = Object.assign(defaultDraft(v, now()), keep); this.tab = 'body'; }
        if (seg === 'edge') d().style.edge = v;
        if (seg === 'island') d().style.island = v;
        if (seg === 'front') d().style.front = v;
        if (seg === 'keys') d().style.keys = v;
        if (seg === 'keytone') { d().style.keyTone = v; if (v === 'accent' && !d().style.accent) d().style.accent = BODY_COLORS[11]; }
        if (seg && seg.startsWith('catv-')) this.catVendor[seg.slice(5)] = v;
        if (seg === 'keyshape' && this.selKey) { if (v) d().keyShape[this.selKey] = v; else delete d().keyShape[this.selKey]; }
        if (seg === 'stampsize' && d().stamps[this.selStamp]) d().stamps[this.selStamp].s = +v;
        if (seg === 'navhome') d().nav.home = v;
        if (seg === 'navkeys') d().nav.keys = v;
        if (seg && seg.startsWith('up-')) d().up[seg.slice(3)] = v;
        if (seg && seg.startsWith('src-')) {
          const type = seg.slice(4);
          this.partMode[type] = v;
          if (v === 'std') { const ref = type === 'display' ? d().display : d()[type]; if (ref && ref.src === 'own') this.setPart(type, null, stdRef(type, d(), null, partParams(ref))); }
          else { const ready = S.designs.find(x => x.type === type && x.status === 'ready'); if (ready) this.setPart(type, null, { src: 'own', id: ready.id }); }
        }
        changed(); return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'suggest') { d().price = suggestPrice(d()); changed(); toast(`Suggested price: ${fmtMoney(d().price)}`); }
      if (a === 'autolayout') { d().layout = d().layout.map(x => Object.assign(x, { auto: true })); d().layout.forEach(x => { const [f, u, v] = defaultPlacement(x.t, d()); Object.assign(x, { f, u, v }); }); changed(); }
      if (a === 'autosize') { d().size = { w: 0, h: 0, t: 0 }; changed(); }
      if (a === 'logoinitial') { const dd = d(), col = dd.style.accent ? '3' : hexLum(dd.color) > 0.55 ? '2' : '1'; dd.art.logo = initialLogo(((dd.style.logo || S.company || 'N').trim()[0] || 'N').toUpperCase(), col); changed(); }
      if (a === 'addstamp' && d().stamps.length < 8) { d().stamps.push({ f: 'back', u: 0.5, v: 0.62 - 0.08 * d().stamps.length, s: 10 }); this.sel = 'stamp'; this.selStamp = d().stamps.length - 1; changed(); }
      if (a === 'fillbat') {
        const x = this.biggerBattery(d(), this.eval().ev);
        if (x) { d().battery = { src: 'std', p: clone(x.p), vid: x.id }; changed(); toast(`Battery: ${x.name} · ${x.p.mah.toLocaleString('en-US')} mAh`); }
      }
      if (a === 'reset') { const keep = { color: d().color }; S.draft = Object.assign(defaultDraft(d().cat, now()), keep); changed(); }
      if (a === 'stddisp') { d().display = stdRef('display', d()); changed(); }
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
    // paint on a pixel grid: drag to draw; shapes toggle on/off from the first cell, the logo uses the picked color
    el.onpointerdown = e => {
      const pt = e.target.closest('.paint');
      if (!pt) return;
      e.preventDefault();
      const id = pt.dataset.paint, n = +pt.dataset.n, dd = S.draft;
      const arr = (id === 'logo' ? dd.art.logo || '' : dd.art.shapes[+id.slice(5)] || '').padEnd(n * n, '0').slice(0, n * n).split('');
      const cell = ev => { const r = pt.getBoundingClientRect(), i = Math.floor((ev.clientX - r.left) / r.width * n), j = Math.floor((ev.clientY - r.top) / r.height * n); return i >= 0 && j >= 0 && i < n && j < n ? j * n + i : -1; };
      const c0 = cell(e);
      if (c0 < 0) return;
      const val = id === 'logo' ? String(this.paintCol == null ? 1 : this.paintCol) : arr[c0] === '1' ? '0' : '1';
      const paint = i => { if (i < 0 || arr[i] === val) return; arr[i] = val; pt.children[i].style.background = val === '0' ? '' : id === 'logo' ? this.palColor(+val, dd) : '#e9edf5'; };
      paint(c0);
      pt.setPointerCapture(e.pointerId);
      pt.onpointermove = ev => paint(cell(ev));
      pt.onpointerup = () => {
        pt.onpointermove = pt.onpointerup = null;
        const str = arr.join('');
        if (id === 'logo') dd.art.logo = artDrawn(str) ? str : ''; else dd.art.shapes[+id.slice(5)] = str.indexOf('1') >= 0 ? str : '';
        changed();
      };
    };
    el.oninput = e => {
      const inp = e.target;
      if (inp.id === 'colorPick') { d().color = inp.value; this.light(); return; }
      if (inp.id === 'accentPick') { d().style.accent = inp.value; this.light(); return; }
      if (!inp.dataset.path) return;
      const v = inputVal(inp);
      const path = inp.dataset.path;
      this.setPathAny(path, v);
      if (inp.type === 'range') {
        const show = $(`[data-show="${path}"]`, el);
        if (show) show.textContent = path.startsWith('size.') || path.startsWith('place.') ? (+v).toFixed(1) + ' mm' : path === 'style.radius' ? Math.round(v * 100) + '%' : v;
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
      if (inp.id === 'colorPick' || inp.id === 'accentPick') { changed(); return; }
      if (inp.id === 'intSel') { d().int = +inp.value; changed(); return; }
      if (inp.dataset.catsort) { this.catSort[inp.dataset.catsort] = inp.value; changed(); return; }
      if (inp.id === 'elAuto') { const rec = d().layout.find(x => x.t === this.sel); if (rec) rec.auto = inp.checked; changed(); return; }
      if (inp.dataset.camsrc) {
        const role = inp.dataset.camsrc;
        this.setPart('camera', role, inp.value === 'std' ? stdRef('camera', d(), role, partParams(d().cams[role])) : { src: 'own', id: inp.value });
        changed(); return;
      }
      if (!inp.dataset.path || inp.type === 'text') return;
      this.setPathAny(inp.dataset.path, inputVal(inp));
      changed();
    };
  },
  setPathAny(path, v) { setPath(S.draft, path, v); },
};
function inputVal(inp) { return inp.dataset.num == null ? inp.value : Number(inp.value); }
registerView('phonelab', PhoneLab);
