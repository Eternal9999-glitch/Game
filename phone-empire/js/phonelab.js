'use strict';
// ============================================================================
//  Phone Lab: configure a device part by part, see live engineering numbers,
//  cost, market fit, and launch it.
// ============================================================================

const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

// clamp every choice to what is actually available right now
function sanitizeDraft(d) {
  const av = playerAv(), cat = CATS[d.cat];
  const chip = chipFor(d);
  const okChip = d.chip.kind === 'custom' ? S.chips.some(c => c.id === d.chip.id && c.status === 'ready') : vendorChipsAvailable(now()).some(c => c.id === d.chip.id);
  if (!chip || !okChip) {
    const vs = vendorChipsAvailable(now()).filter(c => c.tier !== 'flagship').sort((a, b) => b.release - a.release);
    d.chip = { kind: 'vendor', id: (vs[0] || vendorChipsAvailable(now())[0]).id };
  }
  if (!av.ok(DISPLAY_TECH[d.display.tech].tech)) d.display.tech = 'tn';
  d.display.size = clamp(d.display.size, cat.size[0], cat.size[1]);
  d.display.ppi = clamp(d.display.ppi, 120, ppiCap(av));
  if (!av.ok((REFRESH.find(r => r.hz === d.display.hz) || REFRESH[0]).tech)) d.display.hz = 60;
  if (d.display.fullview && !av.ok('disp_fullview')) d.display.fullview = false;
  const cc = camCaps(av);
  for (const k of ['main', 'ultra', 'tele', 'front']) {
    const c = d.cams[k];
    c.sensor = Math.min(c.sensor, k === 'front' ? Math.min(3, cc.maxSensor) : cc.maxSensor);
    if (c.mp > cc.maxMP) c.mp = MP_OPTIONS.filter(m => m <= cc.maxMP).pop();
    if (c.ois && !av.ok('cam_ois')) c.ois = false;
  }
  if (!av.ok('cam_multi')) { d.cams.ultra.on = false; d.cams.tele.on = false; }
  if (!av.ok('cam_periscope')) d.cams.tele.periscope = false;
  d.battery.mah = clamp(d.battery.mah, cat.mah[0], cat.mah[1]);
  if (!av.ok(CHEM[d.battery.chem].tech)) d.battery.chem = 'liion';
  if (!av.ok((CHARGE.find(c => c.w === d.battery.charge) || CHARGE[0]).tech)) d.battery.charge = 5;
  if (d.battery.wireless && !av.ok('bat_wireless')) d.battery.wireless = false;
  const mc = memCaps(av);
  if (d.memory.ram > mc.ram) d.memory.ram = mc.ram;
  if (d.memory.storage > mc.storage) d.memory.storage = mc.storage;
  if (!av.ok(MATERIALS[d.body.mat].tech)) d.body.mat = 'plastic';
  if (!av.ok(WATER[d.body.water].tech)) d.body.water = 'none';
  if (!av.ok(FINGERPRINT[d.feat.fp].tech)) d.feat.fp = 'none';
  for (const [k, id] of [['face3d', 'feat_face3d'], ['nfc', 'feat_nfc'], ['stereo', 'feat_stereo']]) if (d.feat[k] && !av.ok(id)) d.feat[k] = false;
  const c2 = chipFor(d);
  if (c2 && !c2.modemGen) { if (!d.modem || d.modem > marketModemGen(now())) d.modem = marketModemGen(now()); } else d.modem = 0;
  d.price = clamp(Math.round(d.price) || 99, 29, 3999);
}

function optFor(id, label, v, extraTitle) {
  const av = playerAv();
  const ok = av.ok(id), ex = ok && !av.market(id);
  return { v, label: label + (ex ? ' ◆' : ''), disabled: !ok, ex, title: (ok ? (ex ? 'Exclusive in-house tech' : '') : lockReason(id)) + (extraTitle ? ' ' + extraTitle : '') };
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

const PhoneLab = {
  name: 'Phone Lab', icon: '📱', live: false,
  render(el) {
    if (!S.draft) S.draft = defaultDraft('phone', now());
    const d = S.draft;
    sanitizeDraft(d);
    el.innerHTML = `
      <div class="view-title"><h1>📱 Phone Lab</h1><p>Engineer a device part by part. Every choice changes cost, size, power and how buyers rate it.</p></div>
      <div class="lab">
        <div class="col" id="plForm">${this.form(d)}</div>
        <div class="side" id="plSide"></div>
      </div>`;
    this.bind(el);
    this.side();
  },
  form(d) {
    const av = playerAv(), t = now(), cat = CATS[d.cat];
    const cc = camCaps(av), mc = memCaps(av);
    const chips = this.chipRows(d);
    const chip = chipFor(d);
    const prods = S.products;
    const sensorOpts = (c, max) => SENSORS.map((s, i) => `<option value="${i}" ${i === c.sensor ? 'selected' : ''} ${i > max ? 'disabled' : ''}>${s.name} (${s.area} mm²)${i > camCaps(marketAv(t)).maxSensor && i <= max ? ' ◆' : ''}</option>`).join('');
    const mpOpts = c => MP_OPTIONS.map(m => `<option value="${m}" ${m === c.mp ? 'selected' : ''} ${m > cc.maxMP ? 'disabled' : ''}>${m} MP${m > camCaps(marketAv(t)).maxMP && m <= cc.maxMP ? ' ◆' : ''}</option>`).join('');
    const pitch = c => Math.sqrt(SENSORS[c.sensor].area / c.mp);
    const pitchTag = c => {
      const p = pitch(c), quad = av.ok('cam_g6') && c.mp >= 40;
      const bad = p < (quad ? 0.6 : 1.0);
      return `<span class="tiny ${bad ? 'warn' : 'faint'}" title="Pixel pitch: bigger pixels gather more light. Below ${quad ? '0.6' : '1.0'} µm images get noisy.">${p.toFixed(2)} µm px${quad ? ' · 4-in-1' : ''}${bad ? ' · noisy' : ''}</span>`;
    };
    const camSlot = (key, title, c, opts) => `
      <div class="cam-slot">
        <div class="hd">${opts.toggle ? `<label class="chk ${av.ok('cam_multi') ? '' : 'disabled'}" title="${av.ok('cam_multi') ? '' : esc(lockReason('cam_multi'))}"><input type="checkbox" data-path="cams.${key}.on" ${c.on ? 'checked' : ''} ${av.ok('cam_multi') ? '' : 'disabled'}> ${title}</label>` : title}
          <span class="grow"></span>${(!opts.toggle || c.on) ? pitchTag(c) : ''}</div>
        ${(!opts.toggle || c.on) ? `<div class="row wrap">
          <select data-path="cams.${key}.sensor" data-num>${sensorOpts(c, opts.maxS)}</select>
          <select data-path="cams.${key}.mp" data-num>${mpOpts(c)}</select>
          ${opts.ois ? `<label class="chk ${av.ok('cam_ois') ? '' : 'disabled'}" title="${esc(av.ok('cam_ois') ? 'Optical image stabilization' : lockReason('cam_ois'))}"><input type="checkbox" data-path="cams.${key}.ois" ${c.ois ? 'checked' : ''} ${av.ok('cam_ois') ? '' : 'disabled'}> OIS</label>` : ''}
          ${opts.peri ? `<label class="chk ${av.ok('cam_periscope') ? '' : 'disabled'}" title="${esc(av.ok('cam_periscope') ? '5× folded zoom' : lockReason('cam_periscope'))}"><input type="checkbox" data-path="cams.${key}.periscope" ${c.periscope ? 'checked' : ''} ${av.ok('cam_periscope') ? '' : 'disabled'}> Periscope 5×</label>` : ''}
        </div>` : ''}
      </div>`;
    const ppiMax = ppiCap(av);
    return `
    <div class="card">
      <h2>1 · Device <span class="sub">${cat.icon} ${cat.name} — market ${fmtNum(marketSize(d.cat, t))} units/mo</span></h2>
      <div class="field"><span class="lbl">Type</span>${segBtn('cat', [{ v: 'phone', label: '📱 Phone' }, { v: 'tablet', label: '📟 Tablet' }], d.cat)}</div>
      <div class="field"><span class="lbl">Name</span><input type="text" data-path="name" value="${esc(d.name)}" placeholder="e.g. ${esc(S.company.split(' ')[0])} One" maxlength="32"></div>
      <div class="field"><span class="lbl">Color</span><div class="row">${BODY_COLORS.map(c => `<button class="btn sm" data-color="${c}" style="background:${c};width:24px;height:24px;padding:0;border-radius:50%;${c === d.color ? 'outline:2px solid var(--accent);outline-offset:2px' : ''}"></button>`).join('')}</div></div>
      ${prods.length ? `<div class="field"><span class="lbl">Start from</span><select data-load><option value="">— current draft —</option>${prods.map(p => `<option value="${p.id}">${esc(p.name)} (${dateLabel(p.created)})</option>`).join('')}</select></div>` : ''}
    </div>

    <div class="card">
      <h2>2 · Processor (SoC) <span class="sub">${chips.length} available · click to choose</span></h2>
      <div class="chips-list"><table class="tbl">
        <thead><tr><th>Chip</th><th>Node</th><th class="num">CPU</th><th class="num">GPU</th><th class="num">AI</th><th class="num">Power</th><th>Modem</th><th class="num">Unit cost</th></tr></thead>
        <tbody>${chips.map(r => `<tr class="click ${r.sel ? 'sel' : ''} ${r.custom ? 'mine' : ''}" data-chip="${r.key}">
          <td>${r.custom ? '💠 ' : ''}${esc(r.c.name)} ${r.c.tier ? `<span class="tag">${r.c.tier}</span>` : '<span class="tag excl">custom</span>'}</td>
          <td>${nodeLabel(r.c.nm)}</td><td class="num">${fmtNum(r.c.cpu)}</td><td class="num">${r.c.gpu.toFixed(r.c.gpu < 10 ? 1 : 0)}</td>
          <td class="num">${r.c.tops ? r.c.tops.toFixed(1) : '—'}</td><td class="num">${r.c.power.toFixed(1)} W</td>
          <td>${MODEM_GENS[r.c.modemGen] || '—'}</td><td class="num">${fmtMoney(r.price)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${chip && !chip.modemGen ? `<div class="field mt-s"><span class="lbl">Discrete modem</span>${segBtn('modem', [1, 2, 3].map(g => ({ v: g, label: MODEM_GENS[g], disabled: g > marketModemGen(t) })), d.modem)}<span class="tiny faint">Your chip has no integrated modem.</span></div>` : ''}
      <div class="tiny faint mt-s">CPU/GPU are peak benchmark scores; AI in TOPS. Design your own SoC in the 💠 Chip Lab.</div>
    </div>

    <div class="card">
      <h2>3 · Display</h2>
      <div class="field"><span class="lbl">Panel</span>${segBtn('display.tech', Object.entries(DISPLAY_TECH).map(([k, v]) => optFor(v.tech, v.name, k)), d.display.tech)}</div>
      <div class="field"><span class="lbl">Size</span><div class="row"><input type="range" data-path="display.size" data-num min="${cat.size[0]}" max="${cat.size[1]}" step="0.1" value="${d.display.size}"><span class="val" data-show="display.size">${d.display.size.toFixed(1)}"</span></div></div>
      <div class="field"><span class="lbl">Pixel density</span><div class="row"><input type="range" data-path="display.ppi" data-num min="120" max="${ppiMax}" step="10" value="${d.display.ppi}"><span class="val" data-show="display.ppi">${d.display.ppi} ppi</span></div></div>
      <div class="field"><span class="lbl">Refresh</span>${segBtn('display.hz', REFRESH.map(r => optFor(r.tech, r.hz + ' Hz', r.hz)), d.display.hz)}</div>
      <div class="field"><span class="lbl">Bezels</span><label class="chk ${av.ok('disp_fullview') ? '' : 'disabled'}" title="${esc(av.ok('disp_fullview') ? '' : lockReason('disp_fullview'))}"><input type="checkbox" data-path="display.fullview" ${d.display.fullview ? 'checked' : ''} ${av.ok('disp_fullview') ? '' : 'disabled'}> Edge-to-edge (slim bezels, taller screen)${av.ok('disp_fullview') && !av.market('disp_fullview') ? ' ◆' : ''}</label></div>
      <div class="tiny faint mt-s">Buyers currently prefer ~${prefSize(d.cat, t).toFixed(1)}" screens. Max density available to you: ${ppiMax} ppi.</div>
    </div>

    <div class="card">
      <h2>4 · Cameras <span class="sub">largest sensor ${SENSORS[cc.maxSensor].name}, up to ${cc.maxMP} MP</span></h2>
      ${camSlot('main', 'Main camera', d.cams.main, { maxS: cc.maxSensor, ois: true })}
      ${camSlot('ultra', 'Ultra-wide', d.cams.ultra, { toggle: true, maxS: cc.maxSensor })}
      ${camSlot('tele', 'Telephoto', d.cams.tele, { toggle: true, maxS: cc.maxSensor, ois: true, peri: true })}
      ${camSlot('front', 'Front / selfie', d.cams.front, { maxS: Math.min(3, cc.maxSensor) })}
      <div class="tiny faint">Image quality = light gathered (sensor area) × detail (MP) × stabilization × your chip's ISP. Cramming MP onto small sensors makes noisy pixels.</div>
    </div>

    <div class="card">
      <h2>5 · Battery</h2>
      <div class="field"><span class="lbl">Capacity</span><div class="row"><input type="range" data-path="battery.mah" data-num min="${cat.mah[0]}" max="${cat.mah[1]}" step="50" value="${d.battery.mah}"><span class="val" data-show="battery.mah">${d.battery.mah} mAh</span></div></div>
      <div class="field"><span class="lbl">Chemistry</span>${segBtn('battery.chem', Object.entries(CHEM).map(([k, v]) => optFor(v.tech, `${v.name} <span class="tiny">${v.whl} Wh/L</span>`, k)), d.battery.chem)}</div>
      <div class="field"><span class="lbl">Charging</span>${segBtn('battery.charge', CHARGE.map(c => optFor(c.tech, c.w + ' W', c.w)), d.battery.charge)}</div>
      <div class="field"><span class="lbl">Wireless</span><label class="chk ${av.ok('bat_wireless') ? '' : 'disabled'}" title="${esc(av.ok('bat_wireless') ? '' : lockReason('bat_wireless'))}"><input type="checkbox" data-path="battery.wireless" ${d.battery.wireless ? 'checked' : ''} ${av.ok('bat_wireless') ? '' : 'disabled'}> Qi wireless charging${av.ok('bat_wireless') && !av.market('bat_wireless') ? ' ◆' : ''}</label></div>
      <div class="tiny faint mt-s">Bigger batteries last longer but make the device thicker and heavier. Denser chemistry fits more Wh in the same space.</div>
    </div>

    <div class="card">
      <h2>6 · Memory</h2>
      <div class="field"><span class="lbl">RAM</span>${segBtn('memory.ram', RAM_OPTIONS.filter(r => r <= mc.ram && r >= mc.ram / 16).map(r => ({ v: r, label: r >= 1024 ? (r / 1024) + ' GB' : r + ' MB', ex: r > memCaps(marketAv(t)).ram })), d.memory.ram)}</div>
      <div class="field"><span class="lbl">Storage</span>${segBtn('memory.storage', STORAGE_OPTIONS.filter(s => s <= mc.storage && s >= mc.storage / 32).map(s => ({ v: s, label: s >= 1024 ? '1 TB' : s + ' GB', ex: s > memCaps(marketAv(t)).storage })), d.memory.storage)}</div>
      <div class="field"><span class="lbl">Expansion</span><label class="chk"><input type="checkbox" data-path="memory.sd" ${d.memory.sd ? 'checked' : ''}> microSD slot</label></div>
    </div>

    <div class="card">
      <h2>7 · Body & features</h2>
      <div class="field"><span class="lbl">Material</span>${segBtn('body.mat', Object.entries(MATERIALS).map(([k, v]) => optFor(v.tech, v.name, k)), d.body.mat)}</div>
      <div class="field"><span class="lbl">Water resistance</span>${segBtn('body.water', Object.entries(WATER).map(([k, v]) => optFor(v.tech, v.name, k)), d.body.water)}</div>
      <div class="field"><span class="lbl">Biometrics</span>${segBtn('feat.fp', Object.entries(FINGERPRINT).map(([k, v]) => optFor(v.tech, v.name, k)), d.feat.fp)}</div>
      <div class="field"><span class="lbl">Extras</span><div class="row wrap">
        ${[['face3d', 'feat_face3d', '3D face unlock'], ['nfc', 'feat_nfc', 'NFC'], ['stereo', 'feat_stereo', 'Stereo speakers'], ['jack', null, '3.5 mm jack']].map(([k, id, label]) => {
          const ok = av.ok(id), ex = ok && !av.market(id);
          return `<label class="chk ${ok ? '' : 'disabled'}" title="${esc(ok ? '' : lockReason(id))}"><input type="checkbox" data-path="feat.${k}" ${d.feat[k] ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${label}${ex ? ' ◆' : ''}</label>`;
        }).join('')}
      </div></div>
    </div>

    <div class="card">
      <h2>8 · Price & launch</h2>
      <div class="field"><span class="lbl">Retail price</span><div class="row"><span>$</span><input type="number" data-path="price" data-num min="29" max="3999" step="10" value="${d.price}">
        <button class="btn sm" data-act="suggest" title="Find the price that maximizes monthly profit against current rivals">💡 Suggest price</button></div></div>
      <div class="tiny faint">Retailers, distribution, warranty & patent royalties take ${Math.round(RETAIL_CUT * 100)}% of the sticker price. Price decides which buyers consider you: ${SEGMENTS.map(s => `${SEG_INFO[s].name} ~${fmtMoney(segBudget(d.cat, s, t))}`).join(' · ')}.</div>
      <div class="row mt">
        <button class="btn primary lg" data-act="launch">🚀 Start development · ${fmtMoney(devCost(d.cat))} · 45 days</button>
        <button class="btn" data-act="reset">Reset draft</button>
      </div>
    </div>`;
  },
  chipRows(d) {
    const t = now();
    const rows = [];
    for (const c of S.chips.filter(x => x.status === 'ready')) {
      const e = chipEconomics(c.stats.area, c.stats.nm, t);
      rows.push({ key: 'custom:' + c.id, c: c.stats, custom: true, price: hasFab(c.stats.nm) ? e.own : e.foundry, sel: d.chip.kind === 'custom' && d.chip.id === c.id });
    }
    const vs = vendorChipsAvailable(t).sort((a, b) => b.cpu - a.cpu);
    for (const c of vs) rows.push({ key: 'vendor:' + c.id, c, price: vendorChipPrice(c, t), sel: d.chip.kind === 'vendor' && d.chip.id === c.id });
    return rows;
  },
  bind(el) {
    const d = S.draft;
    const rerender = () => { sanitizeDraft(d); $('#plForm').innerHTML = this.form(d); this.side(); };
    el.onclick = e => {
      const segB = e.target.closest('.segbtn button');
      if (segB && !segB.disabled) {
        const path = segB.parentElement.dataset.seg, raw = segB.dataset.v;
        const v = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
        if (path === 'cat') {
          if (v !== d.cat) { const keep = { name: d.name, color: d.color }; S.draft = Object.assign(defaultDraft(v, now()), keep); this.render(el); }
          return;
        }
        setPath(d, path, v);
        rerender();
        return;
      }
      const chipRow = e.target.closest('[data-chip]');
      if (chipRow) {
        const [kind, id] = chipRow.dataset.chip.split(':');
        d.chip = { kind, id };
        rerender();
        return;
      }
      const col = e.target.closest('[data-color]');
      if (col) { d.color = col.dataset.color; rerender(); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'suggest') { d.price = suggestPrice(d); rerender(); toast(`Suggested price: ${fmtMoney(d.price)}`); }
      if (act.dataset.act === 'reset') { S.draft = defaultDraft(d.cat, now()); this.render(el); }
      if (act.dataset.act === 'launch') {
        const err = launchProduct(d);
        if (report(err)) {
          toast(`${d.name} is in development!`, 'good');
          S.draft = Object.assign(defaultDraft(d.cat, now()), { color: d.color });
          showView('hq');
        }
      }
    };
    el.oninput = e => {
      const inp = e.target;
      if (!inp.dataset.path) return;
      if (inp.type === 'range' || inp.type === 'number' || inp.type === 'text') {
        const v = inp.dataset.num != null ? Number(inp.value) : inp.value;
        setPath(d, inp.dataset.path, v);
        const show = $(`[data-show="${inp.dataset.path}"]`, el);
        if (show) show.textContent = inp.dataset.path === 'display.size' ? v.toFixed(1) + '"' : inp.dataset.path === 'display.ppi' ? v + ' ppi' : v + ' mAh';
        this.side();
      }
    };
    el.onchange = e => {
      const inp = e.target;
      if (inp.dataset.load != null) {
        const p = S.products.find(x => x.id === inp.value);
        if (p) { S.draft = JSON.parse(JSON.stringify(p.spec)); S.draft.name = p.name + ' II'; this.render(el); toast('Loaded ' + p.name + ' as a starting point.'); }
        return;
      }
      if (!inp.dataset.path) return;
      if (inp.type === 'checkbox') setPath(d, inp.dataset.path, inp.checked);
      else if (inp.tagName === 'SELECT') setPath(d, inp.dataset.path, inp.dataset.num != null ? Number(inp.value) : inp.value);
      else if (inp.type === 'number') setPath(d, inp.dataset.path, Number(inp.value));
      else return;
      rerender();
    };
  },
  side() {
    const d = S.draft, side = $('#plSide');
    if (!side) return;
    const t = now(), av = playerAv();
    const chip = chipFor(d);
    if (!chip) { side.innerHTML = '<div class="card">Pick a processor.</div>'; return; }
    const pc = productCosts(d, t, av);
    const ev = pc.ev;
    const avail = specAvailability(d, av);
    const rv = predictReview(ev.raw, d.cat, d.price);
    const dem = estimateDemand(ev.raw, d.cat, d.price, rv.score);
    const margin = d.price * (1 - RETAIL_CUT) - pc.est;
    const R = getRefs(d.cat, t);
    const q = segQuality(rv.subs, rv.seg);
    const exclusiveParts = Object.keys(avail.exclusive).filter(k => avail.exclusive[k]);
    const srcTag = c => c.pool ? (c.buy == null ? '<span class="tag excl">in-house ◆</span>' : '<span class="tag good">in-house</span>')
      : `<span class="tag">${c.buyLabel || 'supplier'}</span>`;
    const warn = [];
    if (ev.sustain < 0.75) warn.push(`<div class="note warn">🔥 The chip draws ${chip.power.toFixed(1)} W but this body can only shed ~${ev.budget.toFixed(1)} W: sustained performance ${Math.round(ev.sustain * 100)}%. Metal bodies and bigger devices dissipate more heat.</div>`);
    if (!ev.integrated) warn.push(`<div class="note">📶 Discrete ${MODEM_GENS[ev.modemGen]} modem adds cost and power.</div>`);
    if (ev.modemGen < R.modem) warn.push(`<div class="note warn">📶 Buyers now expect ${MODEM_GENS[R.modem]}. Your ${MODEM_GENS[ev.modemGen]} modem hurts the features score.</div>`);
    if (exclusiveParts.length) warn.push(`<div class="note" style="border-color:var(--excl)">◆ Uses exclusive in-house tech (${exclusiveParts.join(', ')}). Production is limited by your own factory capacity.</div>`);
    if (margin < 0) warn.push(`<div class="note bad">💸 You lose ${fmtMoney(-margin)} on every unit at this price.</div>`);
    if (!avail.ok) warn.push(`<div class="note bad">Unavailable parts selected.</div>`);
    side.innerHTML = `
      <div class="card"><div class="preview">${deviceSVG(d, ev, d.cat === 'tablet' ? 18 : 34)}</div>
        <div class="spec-list mt-s">
          <span class="k">Dimensions</span><span class="v">${(ev.dims.h * 25.4).toFixed(1)} × ${(ev.dims.w * 25.4).toFixed(1)} × ${ev.thick.toFixed(1)} mm</span>
          <span class="k">Weight</span><span class="v">${Math.round(ev.weight)} g</span>
          <span class="k">Screen</span><span class="v">${d.display.size.toFixed(1)}" ${ev.res[1]}×${ev.res[0]} · ${Math.round(ev.dims.stb * 100)}% screen-to-body</span>
          <span class="k">Battery life</span><span class="v">${ev.hours.toFixed(1)} h screen-on <span class="faint">(flagship ${R.hours.toFixed(1)} h)</span></span>
          <span class="k">Battery</span><span class="v">${ev.wh.toFixed(1)} Wh</span>
          <span class="k">Sustained perf.</span><span class="v ${ev.sustain < 0.75 ? 'warn' : ''}">${Math.round(ev.sustain * 100)}%</span>
        </div>
      </div>
      <div class="card">
        <h2>Buyer scores <span class="sub">100 = today's flagship · ▮ rival avg (${SEG_INFO[rv.seg].name})</span></h2>
        ${scoreBars(rv.subs, rv.avgSubs)}
        <div class="row between mt"><span class="dim">Quality for ${SEG_INFO[rv.seg].name.toLowerCase()} buyers</span><b>${q.toFixed(0)}</b></div>
      </div>
      <div class="card">
        <h2>Market forecast</h2>
        <div class="spec-list">
          <span class="k">Expected review</span><span class="v">${reviewTag(rv.score)}</span>
          <span class="k">Est. demand</span><span class="v">${fmtNum(dem.units)} / month</span>
          <span class="k">Unit cost</span><span class="v">${fmtMoney(pc.est)}${pc.allBuy - pc.est > 0.5 ? ` <span class="good tiny">(−${fmtMoney(pc.allBuy - pc.est)} in-house)</span>` : ''}</span>
          <span class="k">You keep per unit</span><span class="v">${fmtMoney(d.price * (1 - RETAIL_CUT))}</span>
          <span class="k">Margin per unit</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin)} (${Math.round(margin / (d.price * (1 - RETAIL_CUT)) * 100)}%)</span>
          <span class="k">Est. gross profit</span><span class="v ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin * dem.units)} / month</span>
        </div>
        <div class="tiny faint mt-s">Demand grows with brand awareness (now ${fmtPct(S.aware)}) — boost it with marketing in 💰 Finance.</div>
      </div>
      ${warn.join('')}
      <div class="card">
        <h2>Bill of materials</h2>
        <table class="tbl bom">${pc.comps.map(c => {
          const v = c.pool ? c.in : (c.buy != null ? c.buy : c.in);
          return `<tr><td>${c.label}</td><td>${srcTag(c)}</td><td class="num">${fmtMoney(v)}</td></tr>`;
        }).join('')}
        <tr><td><b>Total</b></td><td></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table>
      </div>`;
  },
};
registerView('phonelab', PhoneLab);
