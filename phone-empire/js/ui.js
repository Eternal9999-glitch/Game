'use strict';
// ============================================================================
//  Shared UI plumbing: view router, top bar, toasts, modal dialogs, charts and
//  the option widgets (cards, toggles, research-gated sliders) used by the labs.
// ============================================================================

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

const VIEWS = {};          // id -> {name, icon, render(el), live?}
const VIEW_ORDER = ['hq', 'phonelab', 'labs', 'chiplab', 'research', 'production', 'factories', 'market', 'bench', 'investors', 'finance'];
const NAV_SEPS = [4, 7];
let currentView = 'hq';
let pointerDown = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; }, true);
document.addEventListener('pointercancel', () => { pointerDown = false; }, true);

function registerView(id, v) { VIEWS[id] = v; }
function showView(id) {
  if (!VIEWS[id]) return;
  currentView = id;
  renderNav();
  const el = $('#view');
  el.scrollTop = 0;
  renderCurrent(true);
}
// force: always re-render. 'month': re-render even static views (labs) unless the player is busy.
function renderCurrent(force) {
  const v = VIEWS[currentView], el = $('#view');
  if (!v) return;
  if (force !== true) {
    if (pointerDown) return;                      // never yank a half-finished click
    const a = document.activeElement;
    if (a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    if (v.live === false && force !== 'month') return;
  }
  const scroll = el.scrollTop;
  v.render(el);
  el.scrollTop = scroll;
}
function renderNav() {
  const nav = $('#nav');
  if (!S) return;
  const freeSlots = researchSlots() - S.research.length;
  const badges = {
    research: freeSlots > 0 && TECHS.some(tc => techState(tc) === 'available') ? freeSlots : 0,
    investors: S.funding.offer ? '!' : 0, factories: S.offers.length,
    labs: S.designs.filter(d => d.status === 'engineering').length || 0,
  };
  nav.innerHTML = VIEW_ORDER.map((id, i) => {
    const v = VIEWS[id];
    if (!v) return '';
    const b = badges[id] ? `<span class="badge">${badges[id]}</span>` : '';
    return (NAV_SEPS.includes(i) ? '<div class="sep"></div>' : '') +
      `<button data-view="${id}" class="${id === currentView ? 'on' : ''}"><span class="ico">${v.icon}</span><span class="nm">${v.name}</span>${b}</button>`;
  }).join('');
  $$('button', nav).forEach(b => { b.onclick = () => showView(b.dataset.view); });
}

// ---- top bar -------------------------------------------------------------------------
function renderTop() {
  $('#companyName').textContent = S.company;
  $('#date').textContent = dateLabel(now());
  $$('.speed').forEach(b => b.classList.toggle('on', +b.dataset.speed === S.speed));
  const last = S.history[S.history.length - 1];
  const prof = last ? last.profit : 0;
  const units = S.products.reduce((a, p) => a + (p.status === 'active' ? p.demand || 0 : 0), 0);
  $('#topStats').innerHTML = [
    [`<b class="${S.cash < 0 ? 'bad' : ''}">${fmtMoney(S.cash)}</b>`, 'Cash'],
    [`<b class="${prof > 0 ? 'good' : prof < 0 ? 'bad' : ''}">${prof > 0 ? '+' : ''}${fmtMoney(prof)}</b>`, 'Last month'],
    [`<b>${fmtMoney(netWorth())}</b>`, 'Net worth'],
    [`<b>${fmtNum(units)}</b>`, 'Demand / mo'],
    [`<b>${fmtPct(S.aware)}</b>`, 'Awareness'],
    [`<b>${S.rep.toFixed(1)}</b>`, 'Reputation'],
    [`<b>${fmtPct(S.own, 0)}</b>`, 'You own'],
  ].map(([v, l]) => `<div class="stat">${v}<span>${l}</span></div>`).join('');
}

// ---- toasts & modal -------------------------------------------------------------------
function toast(text, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 5200);
  setTimeout(() => t.remove(), 5700);
  const all = $$('.toast');
  if (all.length > 4) all[0].remove();
}
function modal(html, onMount, wide) {
  const m = $('#modal');
  m.innerHTML = `<div class="dialog ${wide ? 'wide' : ''}">${html}</div>`;
  m.classList.remove('hidden');
  m.onclick = e => { if (e.target === m && !m.dataset.sticky) closeModal(); };
  if (onMount) onMount($('.dialog', m));
}
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; delete m.dataset.sticky; }
function confirmBox(title, body, okLabel, onOk) {
  modal(`<h2>${title}</h2><div class="dim">${body}</div>
    <div class="actions"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${okLabel}</button></div>`, d => {
    $('[data-x]', d).onclick = closeModal;
    $('[data-ok]', d).onclick = () => { closeModal(); onOk(); };
  });
}
function report(err) { if (err) toast(err, 'bad'); return !err; }

// ---- small widgets --------------------------------------------------------------------
function scoreBars(subs, compare) {
  return '<div class="bars">' + Object.keys(SUB_LABELS).map(k => {
    const v = subs[k], w = clamp(v / 1.5, 0, 100);
    const mk = compare ? `<div class="mark" style="left:${clamp(compare[k] / 1.5, 0, 100)}%" title="Rival average ${Math.round(compare[k])}"></div>` : '';
    return `<div class="bar"><span class="dim">${SUB_ICONS[k]} ${SUB_LABELS[k]}</span><div class="track"><div class="fill" style="width:${w}%"></div>
      <div class="mark100" style="left:66.6%"></div>${mk}</div><b class="mono right ${v >= 100 ? 'excl' : ''}">${Math.round(v)}</b></div>`;
  }).join('') + '</div>';
}
function meter(frac, cls) { return `<div class="meter ${cls || ''}"><div style="width:${clamp(frac * 100, 0, 100)}%"></div></div>`; }
function reviewTag(r) {
  if (r == null) return '<span class="tag">—</span>';
  const cls = r >= 8 ? 'good' : r >= 6 ? 'acc' : r >= 4.5 ? 'warn' : 'bad';
  return `<span class="tag ${cls}">${r.toFixed(1)}</span>`;
}
function segBtn(name, options, value, attrs) {
  return `<div class="segbtn" data-seg="${name}" ${attrs || ''}>` + options.map(o =>
    `<button data-v="${esc(o.v)}" class="${String(o.v) === String(value) ? 'on' : ''} ${o.ex ? 'ex' : ''}" ${o.disabled ? 'disabled' : ''} title="${esc(o.title || '')}">${o.label}</button>`).join('') + '</div>';
}
// a tech's state for the player. mode 'std': a supplier part (needs to be industry standard too)
function techUI(id, mode) {
  if (!id || !TECH[id]) return { ok: true };
  const av = playerAv(), tc = TECH[id];
  if (mode === 'std') {
    if (av.std(id)) return { ok: true };
    if (av.has(id)) return { ok: false, msg: `Suppliers sell it from ${dateLabel(tc.market)} – design your own part to use it now` };
  } else if (av.ok(id)) return { ok: true, ex: !av.market(id) };
  const st = techState(tc);
  if (st === 'supplied') return { ok: false, msg: `${supplierWord(tc)} from ${dateLabel(tc.market)}` };
  if (st === 'done') return { ok: false, msg: `Researched – needs your own ${FACTORY_TYPES[TECH_CATS[tc.cat].factory].name} until ${dateLabel(tc.market)}` };
  if (st === 'active') { const r = S.research.find(x => x.id === id); return { ok: false, msg: `Researching… ${Math.round(r.progress / r.days * 100)}%` }; }
  if (st === 'future') return { ok: false, msg: `Can't be researched before ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}` };
  if (st === 'locked') return { ok: false, msg: 'Needs ' + missingReqs(tc).join(', ') };
  return { ok: false, rs: id, msg: `${tc.name}: ${fmtMoney(researchCost(tc))} · ${researchDays(tc)} d${now() < tc.market ? ' · exclusive' : ''}` };
}
function lockFoot(u) {
  if (u.ok) return u.ex ? '<span class="oc-ex">◆ exclusive</span>' : '';
  return u.rs ? `<button class="btn sm oc-rs" data-rs="${u.rs}">🔬 ${esc(u.msg)}</button>` : `<span class="oc-lock">🔒 ${esc(u.msg)}</span>`;
}
// options: [{v, title, sub, tech}]  →  clickable cards that set `path`
function optCards(path, options, value, cols, mode) {
  return `<div class="ocards" style="--cols:${cols || 2}">` + options.map(o => {
    const u = o.disabled ? { ok: false, msg: o.disabled } : techUI(o.tech, mode);
    const sel = String(o.v) === String(value);
    const tip = o.tip || (o.tech && TECH[o.tech] ? TECH[o.tech].desc : '');
    return `<div class="ocard ${sel ? 'on' : ''} ${u.ok ? '' : 'locked'} ${u.ex ? 'ex' : ''}" ${u.ok ? `data-pick="${path}" data-v="${esc(o.v)}"` : ''} title="${esc(tip)}">
      <div class="oc-t">${o.title}</div>${o.sub ? `<div class="oc-s">${o.sub}</div>` : ''}${lockFoot(u)}</div>`;
  }).join('') + '</div>';
}
function toggleCard(path, title, sub, tech, value, disabledMsg, mode) {
  const u = techUI(tech, mode);
  const dis = !u.ok || disabledMsg;
  return `<div class="ocard tog ${value ? 'on' : ''} ${dis ? 'locked' : ''} ${u.ex ? 'ex' : ''}" ${dis ? '' : `data-toggle="${path}"`} title="${esc(tech && TECH[tech] ? TECH[tech].desc : '')}">
    <div class="row between"><div class="oc-t">${title}</div><span class="sw ${value ? 'on' : ''}"></span></div>
    ${sub ? `<div class="oc-s">${sub}</div>` : ''}${disabledMsg && u.ok ? `<span class="oc-lock">${esc(disabledMsg)}</span>` : lockFoot(u)}</div>`;
}
// slider limited by a research ladder [[techId, maxValue], ...]
function capSlider(path, label, min, max, step, value, fmt, ladder, scale, mode) {
  const av = playerAv();
  const okFn = mode === 'std' ? av.std : av.ok;
  const next = ladder ? ladder.find(([id]) => id && !okFn(id)) : null;
  const u = next ? techUI(next[0], mode) : null;
  return `<div class="cap">
    <div class="row between"><span class="dim small">${label}</span><b class="mono" data-show="${path}">${fmt(value)}</b></div>
    <input type="range" data-path="${path}" data-num data-fmt="${esc(label)}" min="${min}" max="${max}" step="${step}" value="${value}" ${min >= max ? 'disabled' : ''}>
    <div class="row between tiny faint"><span>${fmt(min)}</span><span>max ${fmt(max)}</span></div>
    ${next ? `<div class="cap-next"><span class="tiny">Next: <b>${TECH[next[0]].name}</b> → ${fmt(next[1] * (scale || 1))}</span>${lockFoot(u)}</div>` : ''}
  </div>`;
}
function issuesList(list, cls) { return list.map(x => `<div class="note ${cls || 'bad'}">${cls === 'warn' ? '⚠️' : '⛔'} ${esc(x)}</div>`).join(''); }

// ---- charts ---------------------------------------------------------------------------
function drawChart(canvas, series, opts) {
  if (!canvas) return;
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  const pts = series.flatMap(s => s.data);
  if (!pts.length) { g.fillStyle = '#66728b'; g.font = '12px system-ui'; g.fillText('No data yet – play a few months.', 12, H / 2); return; }
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]), x0 + 1 / 12);
  let y0 = Math.min(0, ...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]), 1e-9);
  if (opts.yMax) y1 = Math.max(y1, opts.yMax);
  const L = 58, R = 10, T = 10, B = 22;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R);
  const Y = y => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
  g.strokeStyle = '#222b3f'; g.fillStyle = '#66728b'; g.font = '11px system-ui'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4, y = Y(v);
    g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
    g.fillText((opts.yFmt || fmtNum)(v), 4, y + 4);
  }
  const yrs = Math.max(1, Math.round((x1 - x0) / 6));
  for (let yr = Math.ceil(x0); yr <= x1; yr += yrs) g.fillText(String(yr), X(yr) - 12, H - 6);
  if (y0 < 0) { g.strokeStyle = '#46557a'; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(W - R, Y(0)); g.stroke(); }
  for (const s of series) {
    if (!s.data.length) continue;
    g.strokeStyle = s.color; g.lineWidth = s.width || 2;
    g.beginPath();
    s.data.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    g.stroke();
    if (s.fill) {
      g.lineTo(X(s.data[s.data.length - 1][0]), Y(0)); g.lineTo(X(s.data[0][0]), Y(0)); g.closePath();
      g.fillStyle = s.fill; g.fill();
    }
  }
}
function legend(series) { return '<div class="legend">' + series.map(s => `<span><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('') + '</div>'; }
