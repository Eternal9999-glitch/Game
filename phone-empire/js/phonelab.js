'use strict';
// ============================================================================
//  Phone Lab: pick parts category by category around a live 3D model.
//  Locked parts show what research unlocks them, with a button to start it.
// ============================================================================

const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

// clamp every choice to what is actually available right now
function sanitizeDraft(d) {
  const av = playerAv(), t = now();
  const blank = blankSpec(d.cat);
  for (const k in blank) if (d[k] == null) d[k] = JSON.parse(JSON.stringify(blank[k]));
  for (const k of ['display', 'cams', 'battery', 'memory', 'body', 'feat']) for (const kk in blank[k]) if (d[k][kk] == null) d[k][kk] = JSON.parse(JSON.stringify(blank[k][kk]));
  if (d.cat === 'tablet') d.form = 'slate';
  else if (!av.ok(FORMS[d.form].tech) || d.form === 'slate') d.form = 'candybar';
  const chip = chipFor(d);
  const okChip = d.chip.kind === 'custom' ? S.chips.some(c => c.id === d.chip.id && c.status === 'ready') : vendorChipsAvailable(t).some(c => c.id === d.chip.id);
  if (!chip || !okChip) {
    const vs = vendorChipsAvailable(t).filter(c => av.ok(MODEM_TECH[c.modemGen])).sort((a, b) => b.cpu - a.cpu);
    d.chip = { kind: 'vendor', id: (vs.find(c => c.tier !== 'flagship') || vs[0] || vendorChipsAvailable(t)[0]).id };
  }
  const disp = d.display;
  if (!av.ok(DISPLAY_TECH[disp.tech].tech)) disp.tech = 'mono';
  if (!av.ok(TOUCH[disp.touch].tech)) disp.touch = 'none';
  if (!isKeypad(formOf(d)) && disp.touch === 'none') disp.touch = av.ok('disp_touchc') ? 'capacitive' : av.ok('disp_touchr') ? 'resistive' : 'none';
  const [smin, smax] = sizeRange(av, d);
  disp.size = +clamp(disp.size, smin, smax).toFixed(1);
  disp.ppi = clamp(disp.ppi, 60, ppiCap(av));
  if (!av.ok((REFRESH.find(r => r.hz === disp.hz) || REFRESH[0]).tech)) disp.hz = 60;
  if (disp.fullview && (!av.ok('disp_fullview') || isKeypad(formOf(d)))) disp.fullview = false;
  const cc = camCaps(av);
  for (const k of ['main', 'ultra', 'tele', 'front']) {
    const c = d.cams[k];
    if (!cc.has) c.on = false;
    c.sensor = Math.min(c.sensor, k === 'front' ? Math.min(3, cc.maxSensor) : cc.maxSensor);
    if (c.mp > cc.maxMP) c.mp = MP_OPTIONS.filter(m => m <= cc.maxMP).pop();
    if (c.ois && !av.ok('cam_ois')) c.ois = false;
  }
  if (!av.ok('cam_front')) d.cams.front.on = false;
  if (!av.ok('cam_multi') || !d.cams.main.on) { d.cams.ultra.on = false; d.cams.tele.on = false; }
  if (!av.ok('cam_periscope')) d.cams.tele.periscope = false;
  if (!av.ok('cam_flash') || !d.cams.main.on) d.cams.flash = false;
  const b = d.battery;
  b.mah = clamp(Math.round(b.mah / 50) * 50, d.cat === 'tablet' ? 2000 : 300, mahCap(av, d.cat));
  if (!av.ok(CHEM[b.chem].tech)) b.chem = bestKey(CHEM_ORDER, CHEM, av);
  if (!av.ok((CHARGE.find(c => c.w === b.charge) || CHARGE[0]).tech)) b.charge = 5;
  if (b.wireless && !av.ok('bat_wireless')) b.wireless = false;
  const mc = memCaps(av);
  if (d.memory.ram > mc.ram) d.memory.ram = mc.ram;
  if (d.memory.storage > mc.storage) d.memory.storage = mc.storage;
  if (d.memory.sd && !av.ok('feat_sd')) d.memory.sd = false;
  if (!av.ok(MATERIALS[d.body.mat].tech)) d.body.mat = 'plastic';
  if (!av.ok(WATER[d.body.water].tech)) d.body.water = 'none';
  if (d.body.antenna === 'internal' && !av.ok('body_intant')) d.body.antenna = 'external';
  if (!av.ok(FINGERPRINT[d.feat.fp].tech)) d.feat.fp = 'none';
  for (const [k, id] of EXTRAS) if (d.feat[k] && !av.ok(id)) d.feat[k] = false;
  if (!av.ok(OS[d.os].tech)) d.os = bestOS(av, d.display.touch !== 'none') || 'basic';
  const c2 = chipFor(d);
  if (c2 && !c2.modemGen) { if (!d.modem || !av.ok(MODEM_TECH[d.modem])) d.modem = modemGenFor(av); } else d.modem = 0;
  d.price = clamp(Math.round(d.price) || 99, 19, 3999);
}

function suggestPrice(d) {
  const pc = productCosts(d, now(), playerAv());
  let best = null;
  const lo = segBudget(d.cat, 'budget', now()) * 0.35, hi = segBudget(d.cat, 'ultra', now()) * 1.6;
  for (let p = lo; p <= hi; p *= 1.03) {
    const pr = Math.round(p / 10) * 10 - 1;
    const rv = predictReview(pc.ev.raw, d.cat, pr);
    const e = estimateDemand(pc.ev.raw, d.cat, pr, rv.score);
    const prof = e.units * (pr * (1 - RETAIL_CUT) - pc.est);
    if (!best || prof > best.prof) best = { pr, prof };
  }
  return best ? best.pr : d.price;
}

// ---- small option widgets --------------------------------------------------------------------
// state of a tech for the player: ok / ex (exclusive, usable) / research info
function techUI(id) {
  if (!id) return { ok: true };
  const av = playerAv(), tc = TECH[id];
  if (av.ok(id)) return { ok: true, ex: !av.market(id) };
  const st = techState(tc);
  if (st === 'done') return { ok: false, msg: `Researched – needs your own ${FACTORY_TYPES[TECH_CATS[tc.cat].factory].name} until ${dateLabel(tc.market)}` };
  if (st === 'active') { const r = S.research.find(x => x.id === id); return { ok: false, msg: `Researching… ${Math.round(r.progress / r.days * 100)}%` }; }
  if (st === 'future') return { ok: false, msg: `Can't be researched before ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}` };
  if (st === 'locked') return { ok: false, msg: 'Needs ' + tc.req.filter(r => !S.researched[r]).map(r => TECH[r].name).join(', ') };
  return { ok: false, rs: id, msg: `${fmtMoney(researchCost(tc))} · ${researchDays(tc)} days${now() < tc.market ? ' · exclusive' : ''}` };
}
function lockFoot(u) {
  if (u.ok) return u.ex ? '<span class="oc-ex">◆ exclusive</span>' : '';
  return u.rs ? `<button class="btn sm oc-rs" data-rs="${u.rs}">🔬 Research · ${u.msg}</button>` : `<span class="oc-lock">🔒 ${esc(u.msg)}</span>`;
}
// options: [{v, title, sub, tech}]
function optCards(path, options, value, cols) {
  return `<div class="ocards" style="--cols:${cols || 2}">` + options.map(o => {
    const u = techUI(o.tech);
    const sel = String(o.v) === String(value);
    return `<div class="ocard ${sel ? 'on' : ''} ${u.ok ? '' : 'locked'} ${u.ex ? 'ex' : ''}" ${u.ok ? `data-pick="${path}" data-v="${esc(o.v)}"` : ''} title="${esc(o.tech ? TECH[o.tech].desc : '')}">
      <div class="oc-t">${o.title}</div>${o.sub ? `<div class="oc-s">${o.sub}</div>` : ''}${lockFoot(u)}</div>`;
  }).join('') + '</div>';
}
function toggleCard(path, title, sub, tech, value, disabledMsg) {
  const u = techUI(tech);
  const dis = !u.ok || disabledMsg;
  return `<div class="ocard tog ${value ? 'on' : ''} ${dis ? 'locked' : ''} ${u.ex ? 'ex' : ''}" ${dis ? '' : `data-toggle="${path}"`} title="${esc(tech ? TECH[tech].desc : '')}">
    <div class="row between"><div class="oc-t">${title}</div><span class="sw ${value ? 'on' : ''}"></span></div>
    ${sub ? `<div class="oc-s">${sub}</div>` : ''}${disabledMsg && u.ok ? `<span class="oc-lock">${esc(disabledMsg)}</span>` : lockFoot(u)}</div>`;
}
// slider limited by a research ladder: [[techId, maxValue], ...]
function capSlider(path, label, min, max, step, value, fmt, ladder, scale) {
  const av = playerAv();
  const next = ladder ? ladder.find(([id]) => id && !av.ok(id)) : null;
  const u = next ? techUI(next[0]) : null;
  return `<div class="cap">
    <div class="row between"><span class="dim small">${label}</span><b class="mono" data-show="${path}">${fmt(value)}</b></div>
    <input type="range" id="sl-${path.replace(/\./g, '-')}" data-path="${path}" data-num min="${min}" max="${max}" step="${step}" value="${value}" ${min >= max ? 'disabled' : ''}>
    <div class="row between tiny faint"><span>${fmt(min)}</span><span>max ${fmt(max)}</span></div>
    ${next ? `<div class="cap-next"><span class="tiny">Next: <b>${TECH[next[0]].name}</b> → ${fmt(next[1] * (scale || 1))}</span>${lockFoot(u)}</div>` : ''}
  </div>`;
}
const PL_CATS = [
  ['body', '🧩', 'Body'], ['screen', '🖥️', 'Screen'], ['chip', '🧠', 'Chip'], ['camera', '📷', 'Camera'],
  ['battery', '🔋', 'Battery'], ['memory', '💾', 'Memory'], ['connect', '📶', 'Connect'], ['features', '✨', 'Features'],
];

const PhoneLab = {
  name: 'Phone Lab', icon: '📱', live: false, tab: 'body',
  render(el) {
    if (!S.draft) S.draft = defaultDraft('phone', now());
    const d = S.draft;
    sanitizeDraft(d);
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
    this.has3d = Device3D.mount(box);
    if (!this.has3d) box.innerHTML = '<div class="preview" id="svgPrev"></div><div class="tiny faint center">3D preview needs an internet connection (three.js) and WebGL.</div>';
  },
  refresh() {
    const d = S.draft;
    sanitizeDraft(d);
    const av = playerAv(), t = now();
    const chip = chipFor(d);
    const pc = productCosts(d, t, av);
    this.pc = pc;
    $('#plHead').innerHTML = this.head(d);
    $('#plCats').innerHTML = PL_CATS.map(([id, ic, nm]) => `<button class="${this.tab === id ? 'on' : ''}" data-tab="${id}"><span class="ci">${ic}</span><span>${nm}</span><span class="cs">${esc(this.summary(id, d, chip))}</span></button>`).join('');
    $('#plOpts').innerHTML = `<h2>${PL_CATS.find(c => c[0] === this.tab)[1]} ${PL_CATS.find(c => c[0] === this.tab)[2]}</h2>` + this[this.tab](d, av, chip);
    $('#plStats').innerHTML = this.stats(d, pc);
    $('#plFoot').innerHTML = this.foot(d, pc);
    const ev = pc.ev;
    $('#stageChips').innerHTML = [`${(ev.dims.h * 25.4).toFixed(0)} × ${(ev.dims.w * 25.4).toFixed(0)} × ${ev.thick.toFixed(1)} mm`, `${Math.round(ev.weight)} g`,
      `${ev.hours.toFixed(1)} h battery`, `${d.display.size.toFixed(1)}" ${DISPLAY_TECH[d.display.tech].name}`].map(x => `<span>${x}</span>`).join('');
    const openable = ['flip', 'slider', 'fold'].includes(formOf(d));
    $('#stageCtl').innerHTML = ['front', 'back', 'side'].map(v => `<button class="btn sm" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('') +
      `<button class="btn sm" data-view="spin">⟳ Spin</button>` + (openable ? `<button class="btn sm" data-view="open">${formOf(d) === 'slider' ? '⇕ Slide' : '◫ Open / close'}</button>` : '');
    if (this.has3d) Device3D.setSpec(d, ev);
    else { const sv = $('#svgPrev'); if (sv) sv.innerHTML = deviceSVG(d, ev, d.cat === 'tablet' ? 18 : 34); }
  },
  summary(id, d, chip) {
    switch (id) {
      case 'body': return `${FORMS[formOf(d)].name}, ${MATERIALS[d.body.mat].name.split(' ')[0]}`;
      case 'screen': return `${d.display.size.toFixed(1)}" ${DISPLAY_TECH[d.display.tech].name.replace(' LCD', '')}`;
      case 'chip': return chip ? chip.name.replace(/^(Quasar|Helix Semi|Arcadia) /, '') : '—';
      case 'camera': return d.cams.main.on ? `${d.cams.main.mp} MP${d.cams.ultra.on || d.cams.tele.on ? ' +' : ''}` : 'None';
      case 'battery': return `${d.battery.mah} mAh`;
      case 'memory': return `${fmtMB(d.memory.ram)} / ${fmtMB(d.memory.storage)}`;
      case 'connect': return MODEM_GENS[chip && chip.modemGen ? chip.modemGen : d.modem || 1];
      case 'features': return OS[d.os].name.replace(' OS', '');
    }
    return '';
  },
  head(d) {
    const forms = d.cat === 'tablet' ? ['slate'] : PHONE_FORMS;
    return `<div class="row wrap" style="gap:14px">
      <input type="text" id="devName" data-path="name" value="${esc(d.name)}" placeholder="Name your device…" maxlength="32" style="width:210px;font-weight:700">
      ${segBtn('cat', [{ v: 'phone', label: '📱 Phone' }, { v: 'tablet', label: '📟 Tablet', disabled: !playerAv().ok('form_tablet'), title: playerAv().ok('form_tablet') ? '' : 'Research Tablets first' }], d.cat)}
      <div class="forms">${forms.map(f => {
        const u = techUI(FORMS[f].tech), sel = formOf(d) === f;
        return `<button class="form ${sel ? 'on' : ''} ${u.ok ? '' : 'locked'}" ${u.ok ? `data-form="${f}"` : `data-tab="body"`} title="${esc(FORMS[f].desc + (u.ok ? '' : ' — ' + (u.msg || 'locked')))}"><span class="fi">${FORMS[f].icon}</span>${FORMS[f].name}${u.ok ? '' : ' 🔒'}</button>`;
      }).join('')}</div>
      <div class="row grow" style="justify-content:flex-end;gap:6px">${BODY_COLORS.map(c => `<button class="swatch-btn ${c === d.color ? 'on' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
      ${S.products.length ? `<select id="loadFrom" title="Start from one of your devices"><option value="">Start from…</option>${S.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>` : ''}
    </div>`;
  },
  // ---- tabs ----
  body(d) {
    const t = now();
    const formOpts = (d.cat === 'tablet' ? ['slate'] : PHONE_FORMS).map(f => ({ v: f, title: `${FORMS[f].icon} ${FORMS[f].name}`, sub: `${FORMS[f].desc} Trend: ${Math.round(formAppeal(f, t) * 100)}%`, tech: FORMS[f].tech }));
    return `<h3>Form factor</h3>${optCards('form', formOpts, formOf(d), 1)}
      <h3>Material</h3>${optCards('body.mat', Object.entries(MATERIALS).map(([k, m]) => ({ v: k, title: m.name, sub: `Feel ${Math.round(m.q * 100)} · ${m.dens} g/cm³`, tech: m.tech })), d.body.mat)}
      <h3>Water resistance</h3>${optCards('body.water', Object.entries(WATER).map(([k, w]) => ({ v: k, title: w.name, tech: w.tech })), d.body.water)}
      <h3>Antenna</h3>${optCards('body.antenna', [{ v: 'external', title: 'External stub', sub: 'Cheap, but looks dated once internal antennas are standard.' }, { v: 'internal', title: 'Internal antenna', sub: 'Clean lines.', tech: 'body_intant' }], d.body.antenna)}`;
  },
  screen(d, av) {
    const [smin, smax] = sizeRange(av, d);
    const keypad = isKeypad(formOf(d));
    const sizeLadder = formOf(d) === 'slate' ? TABLET_SIZE_CAPS : formOf(d) === 'fold' ? null : SIZE_CAPS.filter(([, v]) => v <= FORMS[formOf(d)].maxSize + 0.01);
    const g = bodyGeom(d, now());
    return `${capSlider('display.size', 'Screen size', smin, smax, 0.1, d.display.size, v => (+v).toFixed(1) + '"', sizeLadder)}
      <div class="tiny faint">Buyers want about ${prefSize(formOf(d), now()).toFixed(1)}" on a ${FORMS[formOf(d)].name.toLowerCase()} right now. A ${FORMS[formOf(d)].name.toLowerCase()} fits at most ${FORMS[formOf(d)].maxSize < 50 ? FORMS[formOf(d)].maxSize + '"' : 'any size'}.</div>
      ${capSlider('display.ppi', 'Pixel density', 60, ppiCap(av), 10, d.display.ppi, v => v + ' ppi', PPI_CAPS)}
      <div class="tiny faint">Resolution: ${Math.max(8, Math.round(g.sw * d.display.ppi))} × ${Math.max(8, Math.round(g.sh * d.display.ppi))} px</div>
      <h3>Panel</h3>${optCards('display.tech', DISPLAY_ORDER.map(k => ({ v: k, title: DISPLAY_TECH[k].name, sub: `Quality ${Math.round(DISPLAY_TECH[k].q * 100)} · power ${DISPLAY_TECH[k].pwr}×`, tech: DISPLAY_TECH[k].tech })), d.display.tech)}
      <h3>Touch</h3>${optCards('display.touch', Object.entries(TOUCH).map(([k, v]) => ({ v: k, title: v.name, tech: v.tech })), d.display.touch, 3)}
      ${keypad ? '' : `<h3>Refresh rate</h3>${optCards('display.hz', REFRESH.map(r => ({ v: r.hz, title: r.hz + ' Hz', tech: r.tech })), d.display.hz, 3)}
      <h3>Bezels</h3>${toggleCard('display.fullview', 'Edge-to-edge', 'Slim bezels, taller 19.5:9 screen.', 'disp_fullview', d.display.fullview)}`}`;
  },
  chip(d, av, chip) {
    const t = now();
    const rows = [];
    for (const c of S.chips.filter(x => x.status === 'ready')) {
      const { e, fab } = customChipCost(c.stats, t);
      rows.push({ key: 'custom:' + c.id, c: c.stats, custom: true, price: fab ? e.own : e.foundry, ok: true });
    }
    for (const c of vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu)) rows.push({ key: 'vendor:' + c.id, c, price: vendorChipPrice(c, t), modemTech: MODEM_TECH[c.modemGen] });
    const sel = d.chip.kind + ':' + d.chip.id;
    return `<div class="chip-cards">${rows.map(r => {
      const u = r.modemTech ? techUI(r.modemTech) : { ok: true };
      return `<div class="ocard ${sel === r.key ? 'on' : ''} ${u.ok ? '' : 'locked'}" ${u.ok ? `data-chip="${r.key}"` : ''}>
        <div class="row between"><div class="oc-t">${r.custom ? '💠 ' : ''}${esc(r.c.name)}</div><b class="mono">${fmtMoney(r.price)}</b></div>
        <div class="oc-s mono">${nodeLabel(r.c.nm)} · CPU ${fmtNum(r.c.cpu)} · GPU ${r.c.gpu ? r.c.gpu.toFixed(r.c.gpu < 10 ? 1 : 0) : '—'}${r.c.tops ? ' · AI ' + r.c.tops.toFixed(1) : ''} · ${r.c.power.toFixed(2)} W · ${MODEM_GENS[r.c.modemGen] || 'no modem'}</div>
        ${r.custom ? '<span class="oc-ex">your design</span>' : `<span class="tag">${r.c.tier}</span>`} ${u.ok ? '' : lockFoot(u)}</div>`;
    }).join('')}</div>
    ${chip && !chip.modemGen ? `<h3>Discrete modem</h3>${optCards('modem', [1, 2, 3, 4, 5].map(g => ({ v: g, title: MODEM_GENS[g], tech: MODEM_TECH[g] })), d.modem, 3)}` : ''}
    <div class="tiny faint mt-s">Design your own processor in the 💠 Chip Lab – off-the-shelf chips carry a big markup.</div>`;
  },
  camera(d, av) {
    const cc = camCaps(av);
    if (!cc.has) {
      const u = techUI('cam_cif');
      return `<div class="note">No camera technology yet. Camera phones arrive around 2001.</div><div class="mt">${toggleCard('cams.main.on', 'Built-in camera', TECH.cam_cif.desc, 'cam_cif', false)}</div>${u.ok ? '' : ''}`;
    }
    const mkt = camCaps(marketAv(now()));
    const slot = (key, title, c, opt) => {
      const sensors = SENSORS.map((s, i) => `<option value="${i}" ${i === c.sensor ? 'selected' : ''} ${i > opt.maxS ? 'disabled' : ''}>${s.name} (${s.area} mm²)${i > mkt.maxSensor && i <= opt.maxS ? ' ◆' : ''}</option>`).join('');
      const mps = MP_OPTIONS.map(m => `<option value="${m}" ${m === c.mp ? 'selected' : ''} ${m > cc.maxMP ? 'disabled' : ''}>${m} MP${m > mkt.maxMP && m <= cc.maxMP ? ' ◆' : ''}</option>`).join('');
      const pitch = Math.sqrt(SENSORS[c.sensor].area / c.mp), quad = av.ok('cam_g6') && c.mp >= 40, noisy = pitch < (quad ? 0.6 : 1.0);
      return `<div class="cam-slot ${c.on ? '' : 'off'}">
        <div class="row between">${opt.toggle ? toggleCard(`cams.${key}.on`, title, '', opt.tech, c.on, opt.dis) : `<b>${title}</b>`}</div>
        ${c.on ? `<div class="row wrap mt-s"><select data-path="cams.${key}.sensor" data-num>${sensors}</select><select data-path="cams.${key}.mp" data-num>${mps}</select>
          <span class="tiny ${noisy ? 'warn' : 'faint'}" title="Bigger pixels gather more light.">${pitch.toFixed(2)} µm pixels${noisy ? ' · noisy' : ''}</span></div>
          ${opt.ois ? `<div class="row wrap mt-s">${toggleCard(`cams.${key}.ois`, 'OIS', '', 'cam_ois', c.ois)}${opt.peri ? toggleCard(`cams.${key}.periscope`, 'Periscope 5×', '', 'cam_periscope', c.periscope) : ''}</div>` : ''}` : ''}
      </div>`;
    };
    return `${slot('main', 'Main camera', d.cams.main, { toggle: true, tech: 'cam_cif', maxS: cc.maxSensor, ois: true })}
      ${d.cams.main.on ? toggleCard('cams.flash', 'LED flash', 'Indoor and night shots.', 'cam_flash', d.cams.flash) : ''}
      ${slot('front', 'Front camera', d.cams.front, { toggle: true, tech: 'cam_front', maxS: Math.min(3, cc.maxSensor) })}
      ${slot('ultra', 'Ultra-wide', d.cams.ultra, { toggle: true, tech: 'cam_multi', maxS: cc.maxSensor, dis: d.cams.main.on ? null : 'Needs a main camera' })}
      ${slot('tele', 'Telephoto', d.cams.tele, { toggle: true, tech: 'cam_multi', maxS: cc.maxSensor, ois: true, peri: true, dis: d.cams.main.on ? null : 'Needs a main camera' })}
      <div class="tiny faint">Largest sensor you can use: ${SENSORS[cc.maxSensor].name}, up to ${cc.maxMP} MP. Research camera generations for more.</div>`;
  },
  battery(d, av) {
    const cap = mahCap(av, d.cat);
    const b = d.battery, wh = b.mah * VOLTAGE / 1000;
    return `${capSlider('battery.mah', 'Capacity', d.cat === 'tablet' ? 2000 : 300, cap, 50, b.mah, v => (+v).toLocaleString('en-US') + ' mAh', MAH_CAPS, d.cat === 'tablet' ? 2.2 : 1)}
      <div class="tiny faint">${wh.toFixed(1)} Wh · ${(wh / CHEM[b.chem].whl * 1000).toFixed(1)} cm³ of cells. Bigger batteries make the device thicker and heavier.</div>
      <h3>Chemistry</h3>${optCards('battery.chem', CHEM_ORDER.map(k => ({ v: k, title: CHEM[k].name, sub: `${CHEM[k].whl} Wh/L`, tech: CHEM[k].tech })), b.chem)}
      <h3>Charging</h3>${optCards('battery.charge', CHARGE.map(c => ({ v: c.w, title: c.w + ' W', tech: c.tech })), b.charge, 3)}
      <div class="mt-s">${toggleCard('battery.wireless', 'Wireless charging', 'Qi coil', 'bat_wireless', b.wireless)}</div>`;
  },
  memory(d, av) {
    const mc = memCaps(av), m = d.memory;
    const nextGen = MEM_GENS.find(g => g[0] && !av.ok(g[0]));
    const ramOpts = RAM_OPTIONS.filter(r => r <= (nextGen ? nextGen[1] : mc.ram) && r >= mc.ram / 16).map(r => ({ v: r, title: fmtMB(r), tech: r > mc.ram && nextGen ? nextGen[0] : null }));
    const stoOpts = STORAGE_OPTIONS.filter(s => s <= (nextGen ? nextGen[2] : mc.storage) && s >= mc.storage / 64).map(s => ({ v: s, title: fmtMB(s), tech: s > mc.storage && nextGen ? nextGen[0] : null }));
    return `<h3>RAM</h3>${optCards('memory.ram', ramOpts, m.ram, 3)}
      <h3>Storage</h3>${optCards('memory.storage', stoOpts, m.storage, 3)}
      <div class="mt-s">${toggleCard('memory.sd', 'Memory card slot', 'Expandable storage', 'feat_sd', m.sd)}</div>`;
  },
  connect(d, av, chip) {
    const gen = chip && chip.modemGen ? chip.modemGen : d.modem || 1;
    const exp = marketModemGen(now());
    const ex = k => EXTRAS.find(e => e[0] === k);
    return `<div class="note">📶 Cellular: <b>${MODEM_GENS[gen]}</b> ${chip && chip.modemGen ? '(built into your chip)' : '(discrete modem)'}${gen < exp ? ` — buyers now expect ${MODEM_GENS[exp]}. Pick a newer chip.` : ''}</div>
      <div class="mt">${['bt', 'wifi', 'gps', 'nfc'].map(k => toggleCard('feat.' + k, ex(k)[2], TECH[ex(k)[1]].desc, ex(k)[1], d.feat[k])).join('')}</div>`;
  },
  features(d) {
    const touch = d.display.touch !== 'none';
    const ex = k => EXTRAS.find(e => e[0] === k);
    return `<h3>Operating system</h3>${optCards('os', OS_ORDER.map(k => ({ v: k, title: OS[k].name, sub: (OS[k].needsTouch && !touch ? 'Needs a touchscreen to shine. ' : '') + (OS[k].fee ? `License ${fmtMoney(OS[k].fee)}/unit` : 'Free'), tech: OS[k].tech })), d.os)}
      ${S.researched.os_own ? '<div class="note good mt-s">You use your own OS: no license fees.</div>' : ''}
      <h3>Biometrics</h3>${optCards('feat.fp', Object.entries(FINGERPRINT).map(([k, f]) => ({ v: k, title: f.name, tech: f.tech })), d.feat.fp)}
      <h3>Extras</h3>${['poly', 'mp3', 'stereo', 'jack', 'face3d'].map(k => toggleCard('feat.' + k, ex(k)[2], ex(k)[1] ? TECH[ex(k)[1]].desc : '3.5 mm audio port.', ex(k)[1], d.feat[k], k === 'face3d' && !touch ? 'Needs a touchscreen phone' : null)).join('')}`;
  },
  // ---- right column ----
  stats(d, pc) {
    const t = now(), av = playerAv(), chip = pc.chip, ev = pc.ev;
    if (!chip) return '<div class="card">Pick a processor.</div>';
    const avail = specAvailability(d, av);
    const rv = predictReview(ev.raw, d.cat, d.price);
    const dem = estimateDemand(ev.raw, d.cat, d.price, rv.score);
    const margin = d.price * (1 - RETAIL_CUT) - pc.est;
    const R = getRefs(d.cat, t);
    const q = segQuality(rv.subs, rv.seg);
    const warn = [];
    for (const p of avail.problems) warn.push(`<div class="note bad">⛔ ${esc(p)}</div>`);
    if (avail.missing.length) warn.push(`<div class="note bad">🔒 Research needed: ${avail.missing.map(id => TECH[id].name).join(', ')}</div>`);
    if (ev.sustain < 0.75) warn.push(`<div class="note warn">🔥 Chip draws ${chip.power.toFixed(1)} W, body sheds ~${ev.budget.toFixed(1)} W: ${Math.round(ev.sustain * 100)}% sustained performance.</div>`);
    if (ev.modemGen < R.modem) warn.push(`<div class="note warn">📶 Buyers expect ${MODEM_GENS[R.modem]} now.</div>`);
    if (margin < 0) warn.push(`<div class="note bad">💸 You lose ${fmtMoney(-margin)} on every unit.</div>`);
    const ex = Object.keys(avail.exclusive).filter(k => avail.exclusive[k]);
    if (ex.length) warn.push(`<div class="note" style="border-color:var(--excl)">◆ Exclusive tech (${ex.join(', ')}): production is limited by your own plants.</div>`);
    return `<div class="card">
        <h2>Buyer scores <span class="sub">100 = flagship · ▮ rivals</span></h2>
        ${scoreBars(rv.subs, rv.avgSubs)}
        <div class="row between mt"><span class="dim small">${SEG_INFO[rv.seg].name} quality</span><b>${q.toFixed(0)}</b></div>
      </div>
      <div class="card"><h2>Forecast</h2><div class="spec-list">
        <span class="k">Expected review</span><span class="v">${reviewTag(rv.score)}</span>
        <span class="k">Demand</span><span class="v">${fmtNum(dem.units)}/mo</span>
        <span class="k">Unit cost</span><span class="v">${fmtMoney(pc.est)}</span>
        <span class="k">Margin</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin)}</span>
        <span class="k">Gross profit</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin * dem.units)}/mo</span>
        <span class="k">Build tier</span><span class="v">${TIER_NAMES[ev.tier]}</span>
      </div></div>
      ${warn.join('')}
      <div class="card"><h2>Bill of materials</h2><table class="tbl bom">${pc.comps.map(c => {
        const per = c.per || 1, v = per * ((c.stock || c.pool) ? c.in : (c.buy != null ? c.buy : c.in));
        const src = c.stock || c.pool ? (c.buy == null ? '<span class="tag excl">own ◆</span>' : '<span class="tag good">own plant</span>') : `<span class="tag">${c.buyLabel || 'supplier'}</span>`;
        return `<tr><td>${c.label}</td><td>${src}</td><td class="num">${fmtMoney(v)}</td></tr>`;
      }).join('')}<tr><td><b>Total</b></td><td></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table></div>`;
  },
  foot(d, pc) {
    const proto = protoCost(d), dev = devCost(d.cat);
    const seg = segmentForPrice(d.cat, d.price);
    return `<div class="row" style="gap:10px;flex-wrap:wrap">
      <span class="dim">Price</span><span class="row" style="gap:4px">$<input type="number" id="priceIn" data-path="price" data-num min="19" max="3999" step="10" value="${d.price}"></span>
      <button class="btn sm" data-act="suggest">💡 Suggest</button>
      <span class="tiny faint" title="${esc(SEGMENTS.map(s => `${SEG_INFO[s].name} buyers spend ~${fmtMoney(segBudget(d.cat, s, now()))}`).join(' · '))}">${SEG_INFO[seg].name} buyers · you keep ${fmtMoney(d.price * (1 - RETAIL_CUT))}</span>
      <span class="grow"></span>
      <button class="btn" data-act="proto" title="A hand-built unit to show investors and reviewers">🧪 Prototype · ${fmtMoney(proto)}</button>
      <button class="btn primary" data-act="launch">🚀 Develop & launch · ${fmtMoney(dev)}</button>
    </div>`;
  },
  bind(el) {
    const d = () => S.draft;
    const changed = () => this.refresh();
    el.onclick = e => {
      const rs = e.target.closest('[data-rs]');
      if (rs) { e.stopPropagation(); if (report(startResearch(rs.dataset.rs))) { toast('Research started: ' + TECH[rs.dataset.rs].name, 'good'); renderNav(); changed(); } return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; changed(); return; }
      const v = e.target.closest('[data-view]');
      if (v) { Device3D.view(v.dataset.view); return; }
      const fm = e.target.closest('[data-form]');
      if (fm) { this.setForm(fm.dataset.form); changed(); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const raw = pick.dataset.v, val = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        if (pick.dataset.pick === 'form') this.setForm(val); else setPath(d(), pick.dataset.pick, val);
        changed(); return;
      }
      const tg = e.target.closest('[data-toggle]');
      if (tg) { setPath(d(), tg.dataset.toggle, !getPath(d(), tg.dataset.toggle)); changed(); return; }
      const ch = e.target.closest('[data-chip]');
      if (ch) { const [kind, id] = ch.dataset.chip.split(':'); d().chip = { kind, id }; changed(); return; }
      const col = e.target.closest('[data-color]');
      if (col) { d().color = col.dataset.color; changed(); return; }
      const segB = e.target.closest('.segbtn button');
      if (segB && !segB.disabled && segB.parentElement.dataset.seg === 'cat') {
        const cat = segB.dataset.v;
        if (cat !== d().cat) { const keep = { name: d().name, color: d().color }; S.draft = Object.assign(defaultDraft(cat, now()), keep); this.tab = 'body'; changed(); }
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'suggest') { d().price = suggestPrice(d()); changed(); toast(`Suggested price: ${fmtMoney(d().price)}`); }
      if (act.dataset.act === 'proto') { if (report(buildPrototype(d()))) toast('Prototype on the bench – ready in 14 days.', 'good'); changed(); }
      if (act.dataset.act === 'launch') {
        const name = d().name;
        if (report(launchProduct(d()))) {
          const p = S.products[S.products.length - 1];
          S.draft = Object.assign(defaultDraft(d().cat, now()), { color: d().color });
          showOrderDialog(p, `${name} is in development! Order its first production run now so it is in stock at launch.`);
        }
      }
    };
    el.oninput = e => {
      const inp = e.target;
      if (!inp.dataset.path) return;
      const v = inp.dataset.num != null ? Number(inp.value) : inp.value;
      setPath(d(), inp.dataset.path, v);
      if (inp.type === 'range') {
        const show = $(`[data-show="${inp.dataset.path}"]`, el);
        if (show) show.textContent = inp.dataset.path === 'display.size' ? v.toFixed(1) + '"' : inp.dataset.path === 'display.ppi' ? v + ' ppi' : v.toLocaleString('en-US') + ' mAh';
        this.light();
      }
    };
    el.onchange = e => {
      const inp = e.target;
      if (inp.id === 'loadFrom') {
        const p = S.products.find(x => x.id === inp.value);
        if (p) { S.draft = JSON.parse(JSON.stringify(p.spec)); S.draft.name = p.name + ' II'; changed(); toast('Loaded ' + p.name + ' as a starting point.'); }
        return;
      }
      if (!inp.dataset.path) return;
      if (inp.type === 'text') return;
      setPath(d(), inp.dataset.path, inp.dataset.num != null ? Number(inp.value) : inp.value);
      changed();
    };
  },
  // cheap update while dragging a slider: stats + model, keep the controls in place
  light() {
    const d = S.draft;
    const pc = productCosts(d, now(), playerAv());
    $('#plStats').innerHTML = this.stats(d, pc);
    const ev = pc.ev;
    $('#stageChips').innerHTML = [`${(ev.dims.h * 25.4).toFixed(0)} × ${(ev.dims.w * 25.4).toFixed(0)} × ${ev.thick.toFixed(1)} mm`, `${Math.round(ev.weight)} g`,
      `${ev.hours.toFixed(1)} h battery`, `${d.display.size.toFixed(1)}" ${DISPLAY_TECH[d.display.tech].name}`].map(x => `<span>${x}</span>`).join('');
    if (this.has3d) Device3D.setSpec(d, ev);
  },
  setForm(f) {
    const d = S.draft, av = playerAv();
    d.form = f;
    const touchForm = !isKeypad(f);
    if (touchForm && d.display.touch === 'none') d.display.touch = av.ok('disp_touchc') ? 'capacitive' : 'resistive';
    if (!touchForm) { d.display.fullview = false; }
    const [smin, smax] = sizeRange(av, d);
    d.display.size = +clamp(prefSize(f, now()), smin, smax).toFixed(1);
  },
};
registerView('phonelab', PhoneLab);

// ---- production order dialog (shared with the Production tab) ------------------------------------
function showOrderDialog(p, intro) {
  const av = playerAv();
  const want = Math.max(100, Math.ceil(Math.max(p.forecast || 0, p.demand || 0) / 100) * 100);
  const makers = (factoryActive('assembly') ? ['own'] : []).concat(PARTNERS.map(x => x.id));
  let maker = (pickMaker(p, want) || {}).m || makers.find(m => !makerProblem(m, p.spec, av)) || makers[0];
  let qty = maker === 'own' ? want : Math.max(partnerById(maker).moq, Math.min(want, (pickMaker(p, want) || {}).qty || want));
  const body = () => {
    const prob = orderProblem(p, maker, qty);
    const q = !makerProblem(maker, p.spec, av) ? orderQuote(p, maker, qty) : null;
    return `<h2>📦 Production order: ${esc(p.name)}</h2>
      ${intro ? `<p class="dim mb">${esc(intro)}</p>` : ''}
      <table class="tbl"><thead><tr><th>Manufacturer</th><th class="num">Unit cost</th><th class="num">Min order</th><th class="num">Capacity/mo</th><th class="num">Lead time</th><th class="num">Defects</th></tr></thead><tbody>
      ${makers.map(m => {
        const pr = makerProblem(m, p.spec, av);
        const pt = m === 'own' ? null : partnerById(m);
        const unit = pr ? null : productCosts(p.spec, now(), av, m).est;
        return `<tr class="click ${m === maker ? 'sel' : ''} ${pr ? 'dim' : ''}" data-mk="${m}" title="${esc(pr || (pt ? pt.desc : 'Your own production line'))}">
          <td><b>${m === 'own' ? '🏭 Your assembly line' : esc(pt.name)}</b>${pr ? `<div class="tiny bad">${esc(pr)}</div>` : pt ? `<div class="tiny faint">${esc(pt.desc)}</div>` : ''}</td>
          <td class="num">${unit ? fmtMoney(unit) : '—'}</td><td class="num">${pt ? fmtNum(pt.moq) : '1'}</td>
          <td class="num">${fmtNum(pt ? pt.cap : factoryPool('assembly'))}</td><td class="num">${pt ? pt.lead : 3} d</td><td class="num">${fmtPct(pt ? pt.defect : 0.01, 1)}</td></tr>`;
      }).join('')}</tbody></table>
      <div class="field mt"><span class="lbl">Quantity</span><div class="row"><input type="number" id="oq" value="${qty}" min="1" step="100" style="width:120px"><span class="tiny faint">Forecast demand: ~${fmtNum(want)}/month</span></div></div>
      ${q ? `<div class="spec-list mt-s">
        <span class="k">Total cost</span><span class="v">${fmtMoney(q.total)} (${fmtMoney(q.unit)} each)</span>
        <span class="k">Deposit now</span><span class="v">${fmtMoney(q.deposit)}</span>
        <span class="k">Production starts</span><span class="v">${dateLabel(S.start + q.startDay / 365)}</span>
        <span class="k">Takes about</span><span class="v">${q.days} days</span>
        <span class="k">Cash available</span><span class="v ${spendable() < q.deposit ? 'bad' : ''}">${fmtMoney(spendable())}</span></div>` : ''}
      ${prob ? `<div class="note bad mt-s">${esc(prob)}</div>` : ''}
      <div class="tiny faint mt-s">You pay a 30% deposit now and the rest as units come off the line. Parts from your own plants are used first.</div>
      <label class="chk mt-s"><input type="checkbox" id="oauto" ${p.auto.on ? 'checked' : ''}> Re-order automatically when stock runs low (picks the best manufacturer you can afford)</label>
      <div class="actions"><button class="btn" data-x>Later</button><button class="btn primary" data-ok ${prob ? 'disabled' : ''}>Place order</button></div>`;
  };
  modal(body(), dlg => {
    const wire = () => {
      dlg.onclick = e => {
        const r = e.target.closest('[data-mk]');
        if (r) { maker = r.dataset.mk; if (maker !== 'own') qty = Math.max(qty, partnerById(maker).moq); dlg.innerHTML = body(); wire(); return; }
        if (e.target.closest('[data-x]')) { p.auto.on = $('#oauto', dlg).checked; closeModal(); renderCurrent(true); }
        if (e.target.closest('[data-ok]')) {
          p.auto.on = $('#oauto', dlg).checked;
          if (report(placeOrder(p, maker, qty))) { toast(`Ordered ${fmtNum(qty)} × ${p.name}`, 'good'); closeModal(); showView('production'); }
        }
      };
      const oq = $('#oq', dlg);
      oq.onchange = () => { qty = Math.max(1, Math.round(+oq.value) || 1); dlg.innerHTML = body(); wire(); };
    };
    wire();
  });
}
