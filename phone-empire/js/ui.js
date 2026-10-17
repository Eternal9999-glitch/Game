'use strict';
// ============================================================================
//  Shared UI plumbing: view router, top bar, toasts, modal dialogs, charts.
// ============================================================================

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const VIEWS = {};          // id -> {name, icon, render(el), live?}
const VIEW_ORDER = ['hq', 'phonelab', 'chiplab', 'factories', 'research', 'market', 'finance'];
let currentView = 'hq';
let pointerDown = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; }, true);

function registerView(id, v) { VIEWS[id] = v; }
function showView(id) {
  currentView = id;
  renderNav();
  const el = $('#view');
  el.scrollTop = 0;
  renderCurrent(true);
}
// force: always re-render. 'month': re-render even static views (labs) unless the player is typing.
function renderCurrent(force) {
  const v = VIEWS[currentView], el = $('#view');
  if (!v) return;
  if (force !== true) {
    // never yank an input (or a half-finished click) out from under the player
    if (pointerDown) return;
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
  const freeSlots = S ? researchSlots() - S.research.length : 0;
  const badges = { research: freeSlots > 0 && TECHS.some(tc => techState(tc) === 'available') ? freeSlots : 0 };
  nav.innerHTML = VIEW_ORDER.map((id, i) => {
    const v = VIEWS[id];
    const b = badges[id] ? `<span class="badge">${badges[id]}</span>` : '';
    return (i === 3 ? '<div class="sep"></div>' : '') +
      `<button data-view="${id}" class="${id === currentView ? 'on' : ''}"><span class="ico">${v.icon}</span>${v.name}${b}</button>`;
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
  const cashCls = S.cash < 0 ? 'bad' : '';
  $('#topStats').innerHTML = [
    [`<b class="${cashCls}">${fmtMoney(S.cash)}</b>`, 'Cash'],
    [`<b class="${prof > 0 ? 'good' : prof < 0 ? 'bad' : ''}">${prof > 0 ? '+' : ''}${fmtMoney(prof)}</b>`, 'Last month'],
    [`<b>${fmtMoney(netWorth())}</b>`, 'Net worth'],
    [`<b>${fmtNum(units)}</b>`, 'Demand / mo'],
    [`<b>${fmtPct(S.aware)}</b>`, 'Brand awareness'],
    [`<b>${S.rep.toFixed(1)}</b>`, 'Reputation'],
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
function modal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = `<div class="dialog">${html}</div>`;
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
    const cls = v >= 100 ? 'excl' : '';
    return `<div class="bar"><span class="dim">${SUB_LABELS[k]}</span><div class="track"><div class="fill" style="width:${w}%"></div>
      <div class="mark100" style="left:66.6%"></div>${mk}</div><b class="mono right ${cls}">${Math.round(v)}</b></div>`;
  }).join('') + '</div>';
}
function meter(frac, cls) { return `<div class="meter ${cls || ''}"><div style="width:${clamp(frac * 100, 0, 100)}%"></div></div>`; }
function reviewTag(r) {
  if (r == null) return '<span class="tag">—</span>';
  const cls = r >= 8 ? 'good' : r >= 6 ? 'acc' : r >= 4.5 ? 'warn' : 'bad';
  return `<span class="tag ${cls}">${r.toFixed(1)}</span>`;
}
function segBtn(name, options, value, attrs) {
  // options: [{v, label, disabled, ex, title}]
  return `<div class="segbtn" data-seg="${name}" ${attrs || ''}>` + options.map(o =>
    `<button data-v="${esc(o.v)}" class="${String(o.v) === String(value) ? 'on' : ''} ${o.ex ? 'ex' : ''}" ${o.disabled ? 'disabled' : ''} title="${esc(o.title || '')}">${o.label}</button>`).join('') + '</div>';
}
function lockReason(id) {
  if (!id) return '';
  const tc = TECH[id];
  return `${tc.name}: industry standard ${dateLabel(tc.market)}${S.researched[id] ? ' · researched – needs your own ' + FACTORY_TYPES[TECH_CATS[tc.cat].factory]?.name : ' · research it to get it early'}`;
}

// ---- charts ---------------------------------------------------------------------------
function drawChart(canvas, series, opts) {
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

// ---- device drawing (SVG) ----------------------------------------------------------------
function deviceSVG(spec, ev, scale) {
  const k = scale || 34;                   // px per inch
  const w = ev.dims.w * k, h = ev.dims.h * k;
  const sw = ev.dims.screenW * k, sh = ev.dims.screenH * k;
  const r = Math.min(w, h) * (spec.display.fullview ? 0.13 : 0.1);
  const col = spec.color || '#1f2430';
  const sx = (w - sw) / 2, sy = (h - sh) / 2 + (spec.display.fullview ? 0 : h * 0.005);
  const homeBtn = !spec.display.fullview && spec.cat === 'phone' && (h - sh) / 2 > 14;
  const front = `<svg width="${w + 8}" height="${h + 8}" viewBox="-4 -4 ${w + 8} ${h + 8}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${col}" stroke="#5b6a8c" stroke-width="1.5"/>
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${spec.display.fullview ? r * 0.8 : 3}" fill="url(#scr)"/>
    <defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22345c"/><stop offset=".55" stop-color="#3a3176"/><stop offset="1" stop-color="#14203a"/></linearGradient></defs>
    ${spec.display.fullview ? `<circle cx="${w / 2}" cy="${sy + 9}" r="3.2" fill="#05070c"/>` : `<rect x="${w / 2 - 12}" y="${sy / 2 - 1.5}" width="24" height="3" rx="1.5" fill="#05070c88"/>`}
    ${homeBtn ? `<circle cx="${w / 2}" cy="${h - (h - sh - sy) / 2}" r="${Math.min(9, (h - sh) / 5)}" fill="none" stroke="#ffffff33" stroke-width="1.5"/>` : ''}
    <text x="${w / 2}" y="${sy + sh * 0.18}" fill="#ffffffcc" font-size="${Math.max(9, sw / 6)}" text-anchor="middle" font-weight="700" font-family="system-ui">9:41</text>
  </svg>`;
  // back: camera island
  const cams = camerasList(spec.cams).filter(([kk]) => kk !== 'front');
  const lens = cams.map(([kk, c]) => 5 + Math.sqrt(SENSORS[c.sensor].area) * 0.9 + (kk === 'main' ? 2 : 0));
  const pad = 6, ix = 10, iy = 10;
  const cols = cams.length > 2 ? 2 : 1;
  const cell = Math.max(...lens) * 2 + 4;
  const iw = cols * cell + pad, ih = Math.ceil(cams.length / cols) * cell + pad;
  const lensSvg = cams.map(([kk, c], i) => {
    const cx = ix + pad / 2 + (i % cols) * cell + cell / 2, cy = iy + pad / 2 + Math.floor(i / cols) * cell + cell / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${lens[i]}" fill="#0b0e15" stroke="#7d8aa8" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${lens[i] * 0.45}" fill="#1b2a4a"/><circle cx="${cx - lens[i] * 0.25}" cy="${cy - lens[i] * 0.25}" r="${lens[i] * 0.15}" fill="#ffffff55"/>` +
      (kk === 'tele' && c.periscope ? `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="#22334f"/>` : '');
  }).join('');
  const back = `<svg width="${w + 8}" height="${h + 8}" viewBox="-4 -4 ${w + 8} ${h + 8}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${col}" stroke="#5b6a8c" stroke-width="1.5"/>
    ${spec.body.mat === 'glass' || spec.body.mat === 'steel' || spec.body.mat === 'ceramic' ? `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${r - 1}" fill="url(#gl)"/><defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff22"/><stop offset=".5" stop-color="#ffffff00"/><stop offset="1" stop-color="#ffffff11"/></linearGradient></defs>` : ''}
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${Math.min(14, iw / 3)}" fill="#00000040" stroke="#ffffff22"/>
    ${lensSvg}
    <circle cx="${ix + iw + 8}" cy="${iy + 8}" r="3" fill="#ffe9a8aa"/>
    ${spec.feat.fp === 'rear' ? `<circle cx="${w / 2}" cy="${h * 0.32}" r="${Math.min(11, w / 8)}" fill="none" stroke="#ffffff30" stroke-width="2"/>` : ''}
    <text x="${w / 2}" y="${h * 0.82}" fill="#ffffff55" font-size="${Math.max(8, w / 9)}" text-anchor="middle" font-family="system-ui" font-weight="800">${esc(S.company.split(' ')[0].toUpperCase())}</text>
  </svg>`;
  return front + back;
}
