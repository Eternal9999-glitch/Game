'use strict';
// ============================================================================
//  Chip Lab: floorplan your own SoC on a silicon die. Block placement matters:
//  cache next to cores boosts them, hot blocks next to each other throttle,
//  I/O and modems must sit on the die edge, and every mm² costs money & yield.
// ============================================================================

// a modest, valid 5×5 starter: one P-core wrapped in cache, GPU fed by two memory channels
const PRESET = [
  ['io', 0, 0], ['cache', 1, 0], ['pcore', 2, 0], ['cache', 3, 0], ['cache', 4, 0],
  ['cache', 0, 1], ['cache', 1, 1], ['cache', 3, 1], ['isp', 4, 1],
  ['gpu', 0, 2], ['cache', 2, 2], ['ecore', 3, 2], ['ecore', 4, 2],
  ['cache', 2, 3], ['ecore', 3, 3], ['ecore', 4, 3],
  ['io', 0, 4], ['media', 1, 4], ['cache', 2, 4], ['modem', 3, 4],
];

function blockLocked(type, av) {
  const id = BLOCKS[type].tech;
  return id && !av.ok(id) ? id : null;
}
function chipDesignFromDraft(dr, av) {
  return Object.assign({}, dr, { arch: archGenFor(av), modemGen: modemGenFor(av) });
}

const ChipLab = {
  name: 'Chip Lab', icon: '💠', live: false,
  sel: 'pcore', rot: false, heat: false, hover: null,
  render(el) {
    if (!S.chipDraft) S.chipDraft = defaultChipDraft(now());
    const dr = S.chipDraft;
    const nodes = nodesForDesign();
    if (!nodes.some(n => n.nm === dr.nm)) { dr.nm = nodes[nodes.length - 1].nm; }
    const node = nodeByNm(dr.nm);
    dr.clock = clamp(dr.clock, +(node.fnom * 0.6).toFixed(2), +(node.fnom * 1.25).toFixed(2));
    const av = playerAv();
    el.innerHTML = `
      <div class="view-title"><h1>💠 Chip Lab</h1><p>Floorplan a system-on-chip. Place blocks on the die, balance speed against heat, area and yield, then tape it out.</p></div>
      <div class="chiplab">
        <div class="col">
          <div class="card"><h2>Blocks <span class="sub">R rotate · right-click remove</span></h2>
            <div class="palette">${BLOCK_ORDER.map(type => {
              const b = BLOCKS[type], lock = blockLocked(type, av);
              return `<button class="pal ${this.sel === type ? 'on' : ''} ${lock ? 'locked' : ''}" data-pal="${type}" title="${esc(b.desc + (lock ? '\n🔒 ' + lockReason(lock) : ''))}">
                <div class="ic" style="background:${b.color}">${b.short}</div>
                <div><div class="nm">${b.name}${lock ? ' 🔒' : ''}</div><div class="ds">${b.w}×${b.h} cells · ${blockPower(type, node, dr.clock).toFixed(2)} W${b.edge ? ' · edge' : ''}</div></div></button>`;
            }).join('')}
              <button class="pal ${this.sel === 'erase' ? 'on' : ''}" data-pal="erase"><div class="ic" style="background:#3a4560;color:#fff">✕</div><div><div class="nm">Erase</div><div class="ds">Click blocks to remove</div></div></button>
            </div>
          </div>
          <div class="card"><h2>Your chips</h2>${this.myChips()}</div>
        </div>
        <div class="col">
          <div class="card">
            <div class="die-ctl">
              <input type="text" id="chipName" value="${esc(dr.name)}" maxlength="24" style="width:150px" title="Chip name">
              <select id="chipNode" title="Process node">${nodes.map(n => `<option value="${n.nm}" ${n.nm === dr.nm ? 'selected' : ''}>${nodeLabel(n.nm)} · ${fmtMoney(waferPrice(n, now()))}/wafer${hasFab(n.nm) ? ' · your fab' : ''}</option>`).join('')}</select>
              <span class="dim small">Die</span>
              <span class="stepper"><button data-act="w-">−</button><span>${dr.w}</span><button data-act="w+">+</button></span>
              <span class="dim">×</span>
              <span class="stepper"><button data-act="h-">−</button><span>${dr.h}</span><button data-act="h+">+</button></span>
            </div>
            <div class="die-ctl mt-s">
              <span class="dim small">Clock</span>
              <input type="range" id="chipClock" min="${(node.fnom * 0.6).toFixed(2)}" max="${(node.fnom * 1.25).toFixed(2)}" step="0.01" value="${dr.clock}" style="width:180px">
              <b id="clockVal" class="mono">${dr.clock.toFixed(2)} GHz</b>
              <label class="chk"><input type="checkbox" id="heatT" ${this.heat ? 'checked' : ''}> 🌡 Heat map</label>
              <button class="btn sm" data-act="rot">⟳ Rotate (R)</button>
              <button class="btn sm" data-act="preset" title="Fill a 5×5 die with a simple, valid starter layout you can improve on">✨ Starter layout</button>
              <button class="btn sm danger" data-act="clear">Clear</button>
            </div>
          </div>
          <div class="die-wrap" id="dieWrap"></div>
          <div class="note small">💡 <b>How it works:</b> each block's power and performance scale with the process node — the same GPU block on 5nm holds ~90× more transistors than on 90nm.
            SRAM cache boosts every core it touches. P-cores and GPUs are hot: pack them together and the hotspot throttles the whole chip.
            Empty cells are wasted silicon you still pay for, and bigger dies have lower yield.</div>
        </div>
        <div class="col stats-col" id="chipStats"></div>
      </div>`;
    this.bind(el);
    this.drawDie();
    this.stats();
  },
  myChips() {
    if (!S.chips.length) return '<div class="dim small">No chips yet. Design one and tape it out!</div>';
    return `<table class="tbl">${S.chips.slice().reverse().map(c => `<tr>
      <td><b>${esc(c.name)}</b><div class="tiny faint">${nodeLabel(c.stats.nm)} · ${c.stats.area} mm² · CPU ${fmtNum(c.stats.cpu)}</div></td>
      <td class="num">${c.status === 'ready' ? '<span class="tag good">ready</span>' : `<span class="tag warn">${Math.max(0, c.readyDay - S.day)}d</span>`}
      <div><button class="btn sm mt-s" data-edit="${c.id}" title="Load as a new revision">Revise</button></div></td></tr>
      ${c.status === 'ready' ? `<tr><td colspan="2"><label class="chk small" title="Rival brands may buy it if it beats the vendors' chips on value"><input type="checkbox" data-list="${c.id}" ${c.listed ? 'checked' : ''}> Sell to other brands at</label>
        $<input type="number" data-lprice="${c.id}" value="${(c.listPrice || Math.round(customChipCost(c.stats, now()).e.foundry * 2.2 * 100) / 100).toFixed(2)}" step="0.5" min="1" style="width:76px">
        <div class="tiny faint">Cost ${fmtMoney(customChipCost(c.stats, now()).e[hasFab(c.stats.nm) ? 'own' : 'foundry'])}/chip · sold ${fmtNum(c.sold || 0)}</div></td></tr>` : ''}`).join('')}</table>`;
  },
  cellPx() { const dr = S.chipDraft; return Math.floor(Math.min(56, 470 / Math.max(dr.w, dr.h))); },
  drawDie() {
    const dr = S.chipDraft, wrap = $('#dieWrap');
    if (!wrap) return;
    const ev = evalChipDesign(chipDesignFromDraft(dr, playerAv()));
    const C = this.cellPx();
    let h = `<div class="die" id="die" style="width:${dr.w * C}px;height:${dr.h * C}px">`;
    for (let y = 0; y < dr.h; y++) for (let x = 0; x < dr.w; x++) h += `<div class="cell" style="left:${x * C}px;top:${y * C}px;width:${C}px;height:${C}px"></div>`;
    dr.blocks.forEach((b, i) => {
      const u = ev.units[i];
      const bonus = (b.type === 'pcore' || b.type === 'ecore' || b.type === 'gpu' || b.type === 'npu') && u.adj ? `<span class="bn">+${u.adj}$</span>` : '';
      h += `<div class="blk ${u.valid ? '' : 'bad'}" data-blk="${i}" style="left:${b.x * C + 1}px;top:${b.y * C + 1}px;width:${b.w * C - 2}px;height:${b.h * C - 2}px;background:${BLOCKS[b.type].color}" title="${esc(BLOCKS[b.type].name + (u.valid ? '' : ' — must touch the die edge!'))}">${BLOCKS[b.type].short}${bonus}</div>`;
    });
    if (this.heat) {
      ev.heat.forEach((T, k) => {
        const x = k % dr.w, y = Math.floor(k / dr.w);
        const a = clamp((T - 45) / 60, 0, 0.85);
        const col = T > 90 ? `rgba(255,40,40,${a})` : `rgba(255,${Math.round(200 - (T - 45) * 2)},60,${a * 0.8})`;
        h += `<div class="heat" style="left:${x * C}px;top:${y * C}px;width:${C}px;height:${C}px;background:${col}"></div>`;
      });
    }
    if (!dr.blocks.length) h += `<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:16px;pointer-events:none" class="small dim">Pick a block on the left, then click the die to place it.<br>New to chips? Try <b>✨ Starter layout</b>.</div>`;
    h += '<div class="ghost hidden" id="ghost"></div></div>';
    h += `<div class="tiny faint">${(dr.w * CELL_MM).toFixed(1)} × ${(dr.h * CELL_MM).toFixed(1)} mm die · each cell ${CELL_MM2} mm² · selected: <b>${this.sel === 'erase' ? 'Erase' : BLOCKS[this.sel].name}${this.rot ? ' (rotated)' : ''}</b></div>`;
    wrap.innerHTML = h;
    this.bindDie();
  },
  blockDims(type) { const b = BLOCKS[type]; return this.rot ? [b.h, b.w] : [b.w, b.h]; },
  fits(x, y, w, h) {
    const dr = S.chipDraft;
    if (x < 0 || y < 0 || x + w > dr.w || y + h > dr.h) return false;
    return !dr.blocks.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
  },
  bindDie() {
    const die = $('#die'), ghost = $('#ghost'), C = this.cellPx(), dr = S.chipDraft;
    const cellAt = e => { const r = die.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / C), Math.floor((e.clientY - r.top) / C)]; };
    die.onmousemove = e => {
      if (this.sel === 'erase' || !BLOCKS[this.sel]) { ghost.classList.add('hidden'); return; }
      const [w, h] = this.blockDims(this.sel);
      let [x, y] = cellAt(e);
      x = clamp(x - Math.floor((w - 1) / 2), 0, dr.w - w); y = clamp(y - Math.floor((h - 1) / 2), 0, dr.h - h);
      this.hover = [x, y];
      const ok = this.fits(x, y, w, h) && !blockLocked(this.sel, playerAv());
      ghost.className = 'ghost ' + (ok ? 'ok' : 'no');
      Object.assign(ghost.style, { left: x * C + 'px', top: y * C + 'px', width: w * C + 'px', height: h * C + 'px' });
    };
    die.onmouseleave = () => { ghost.classList.add('hidden'); this.hover = null; };
    die.onclick = e => {
      const blk = e.target.closest('[data-blk]');
      if (this.sel === 'erase' && blk) { dr.blocks.splice(+blk.dataset.blk, 1); return this.changed(); }
      if (!BLOCKS[this.sel]) return;
      const lock = blockLocked(this.sel, playerAv());
      if (lock) return toast('🔒 ' + lockReason(lock), 'bad');
      const [w, h] = this.blockDims(this.sel);
      if (!this.hover) die.onmousemove(e);
      const [x, y] = this.hover;
      if (this.fits(x, y, w, h)) { dr.blocks.push({ type: this.sel, x, y, w, h }); this.changed(); }
      else if (blk) { dr.blocks.splice(+blk.dataset.blk, 1); this.changed(); }
    };
    die.oncontextmenu = e => {
      e.preventDefault();
      const blk = e.target.closest('[data-blk]');
      if (blk) { dr.blocks.splice(+blk.dataset.blk, 1); this.changed(); }
    };
  },
  changed() { this.drawDie(); this.stats(); },
  bind(el) {
    const dr = S.chipDraft;
    el.onclick = e => {
      const pal = e.target.closest('[data-pal]');
      if (pal) {
        const type = pal.dataset.pal;
        const lock = type !== 'erase' && blockLocked(type, playerAv());
        if (lock) return toast('🔒 ' + lockReason(lock), 'bad');
        this.sel = type; this.render(el); return;
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const c = S.chips.find(x => x.id === ed.dataset.edit);
        S.chipDraft = JSON.parse(JSON.stringify(c.design));
        S.chipDraft.name = c.name.replace(/( v\d+)?$/, m => ' v' + ((parseInt((m || '').replace(/\D/g, '')) || 1) + 1));
        this.render(el); toast('Loaded ' + c.name + ' as a new revision.');
        return;
      }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'w-' || act === 'w+' || act === 'h-' || act === 'h+') {
        const k = act[0], d = act[1] === '+' ? 1 : -1;
        dr[k] = clamp(dr[k] + d, 3, 10);
        dr.blocks = dr.blocks.filter(b => b.x + b.w <= dr.w && b.y + b.h <= dr.h);
        this.render(el);
      }
      if (act === 'rot') { this.rot = !this.rot; this.drawDie(); }
      if (act === 'clear') { dr.blocks = []; this.changed(); }
      if (act === 'preset') {
        const av = playerAv();
        dr.w = 5; dr.h = 5;
        dr.blocks = [];
        for (const [type, x, y] of PRESET) {
          if (!blockLocked(type, av)) { dr.blocks.push({ type, x, y, w: BLOCKS[type].w, h: BLOCKS[type].h }); continue; }
          // a locked block's cells become SRAM cache instead
          for (let yy = y; yy < y + BLOCKS[type].h; yy++) for (let xx = x; xx < x + BLOCKS[type].w; xx++) dr.blocks.push({ type: 'cache', x: xx, y: yy, w: 1, h: 1 });
        }
        this.render(el);
      }
      if (act === 'tapeout') {
        const design = chipDesignFromDraft(dr, playerAv());
        confirmBox('Tape out ' + esc(dr.name) + '?', `Mask set + engineering: <b>${fmtMoney(tapeOutCost(design))}</b>. First silicon arrives in ~4 months, then the chip can be used in any device.`, 'Tape out', () => {
          const err = tapeOut(design);
          if (report(err)) {
            toast(dr.name + ' sent to the fab!', 'good');
            dr.name = dr.name.replace(/\d+$/, n => +n + 1);
            if (!/\d+$/.test(dr.name)) dr.name += ' 2';
            this.render(el);
          }
        });
      }
    };
    $('#chipName').oninput = e => { dr.name = e.target.value; };
    el.onchange = e => {
      const l = e.target.dataset.list || e.target.dataset.lprice;
      if (!l) return;
      const c = S.chips.find(x => x.id === l);
      const price = +$(`[data-lprice="${l}"]`, el).value;
      const on = $(`[data-list="${l}"]`, el).checked;
      listChip(c, on ? price : 0);
      this.render(el);
    };
    $('#chipNode').onchange = e => { dr.nm = Number(e.target.value); dr.clock = nodeByNm(dr.nm).fnom; this.render(el); };
    $('#chipClock').oninput = e => { dr.clock = Number(e.target.value); $('#clockVal').textContent = dr.clock.toFixed(2) + ' GHz'; this.changed(); };
    $('#heatT').onchange = e => { this.heat = e.target.checked; this.drawDie(); };
  },
  stats() {
    const box = $('#chipStats');
    if (!box) return;
    const dr = S.chipDraft, av = playerAv(), t = now();
    const design = chipDesignFromDraft(dr, av);
    const ev = evalChipDesign(design);
    const e = chipEconomics(ev.area, dr.nm, t);
    const node = nodeByNm(dr.nm);
    const vs = vendorChipsAvailable(t);
    const flag = flagshipChip(t);
    const mid = vs.filter(c => c.tier === 'mid').sort((a, b) => b.cpu - a.cpu)[0];
    const cmp = (v, ref) => ref ? `<span class="${v >= ref ? 'good' : 'dim'}">${Math.round(v / ref * 100)}%</span>` : '';
    const fab = hasFab(dr.nm);
    const early = t < node.year;
    box.innerHTML = `
      <div class="card"><h2>Performance <span class="sub">arch v${design.arch} · ${MODEM_GENS[design.modemGen]} modem tech</span></h2>
        <table class="tbl">
          <tr><th></th><th class="num">Yours</th><th class="num" title="${esc(mid ? mid.name : '')}">vs mid</th><th class="num" title="${esc(flag.name)}">vs flagship</th></tr>
          <tr><td>CPU (multi)</td><td class="num"><b>${fmtNum(ev.cpu)}</b></td><td class="num">${cmp(ev.cpu, mid && mid.cpu)}</td><td class="num">${cmp(ev.cpu, flag.cpu)}</td></tr>
          <tr><td>CPU (single)</td><td class="num">${fmtNum(ev.single)}</td><td class="num">${cmp(ev.single, mid && mid.single)}</td><td class="num">${cmp(ev.single, flag.single)}</td></tr>
          <tr><td>GPU (GFLOPS)</td><td class="num"><b>${ev.gpu.toFixed(ev.gpu < 10 ? 1 : 0)}</b></td><td class="num">${cmp(ev.gpu, mid && mid.gpu)}</td><td class="num">${cmp(ev.gpu, flag.gpu)}</td></tr>
          <tr><td>AI (TOPS)</td><td class="num">${ev.tops ? ev.tops.toFixed(1) : '—'}</td><td class="num">${mid && mid.tops ? cmp(ev.tops, mid.tops) : ''}</td><td class="num">${flag.tops ? cmp(ev.tops, flag.tops) : ''}</td></tr>
          <tr><td>ISP</td><td class="num">${ev.isp ? ev.isp.toFixed(2) : '—'}</td><td class="num">${mid ? cmp(ev.isp, mid.isp) : ''}</td><td class="num">${cmp(ev.isp, flag.isp)}</td></tr>
          <tr><td>Peak power</td><td class="num"><b>${ev.power.toFixed(2)} W</b></td><td class="num dim">${mid ? mid.power.toFixed(1) : ''}</td><td class="num dim">${flag.power.toFixed(1)}</td></tr>
          <tr><td>Hotspot</td><td class="num ${ev.hotT > 90 ? 'bad' : ev.hotT > 80 ? 'warn' : 'good'}"><b>${Math.round(ev.hotT)}°C</b></td><td colspan="2" class="num tiny ${ev.hotFactor < 1 ? 'bad' : 'faint'}">${ev.hotFactor < 1 ? 'throttling −' + Math.round((1 - ev.hotFactor) * 100) + '%' : 'limit 90°C'}</td></tr>
        </table>
        <div class="tiny faint mt-s">Cores: ${ev.pCores}P + ${ev.eCores}E · ${ev.ioN} memory channel${ev.ioN === 1 ? '' : 's'} · ${MODEM_GENS[ev.modemGen] === 'None' ? 'no modem' : MODEM_GENS[ev.modemGen] + ' modem'}</div>
      </div>
      <div class="card"><h2>Silicon economics</h2>
        <div class="spec-list">
          <span class="k">Die area</span><span class="v">${ev.area} mm² <span class="faint">(${Math.round(ev.fill * 100)}% used)</span></span>
          <span class="k">Transistors</span><span class="v">${ev.transistors >= 1 ? ev.transistors.toFixed(1) + ' B' : Math.round(ev.transistors * 1000) + ' M'}</span>
          <span class="k">Dies per 300 mm wafer</span><span class="v">${e.dpw}</span>
          <span class="k" title="Defects per cm² — falls as a node matures">Defect density</span><span class="v">${e.D0.toFixed(2)} /cm²</span>
          <span class="k">Yield</span><span class="v ${e.yield < 0.6 ? 'warn' : ''}">${Math.round(e.yield * 100)}%</span>
          <span class="k">Good dies / wafer</span><span class="v">${Math.round(e.good)}</span>
          <span class="k">Cost per chip (foundry)</span><span class="v">${early ? '<span class="faint">not offered yet</span>' : fmtMoney(e.foundry)}</span>
          <span class="k">Cost per chip (own fab)</span><span class="v ${fab ? 'good' : 'faint'}">${fmtMoney(e.own)}${fab ? '' : ' · no fab'}</span>
          <span class="k">Off-the-shelf flagship</span><span class="v dim">${fmtMoney(vendorChipPrice(flag, t))}</span>
        </div>
        <div class="tiny faint mt-s">Yield = e<sup>−area × defects</sup>. Packaging & test add ${fmtMoney(e.pack)} and the CPU/GPU IP license ${fmtMoney(e.ip)} per chip.</div>
      </div>
      ${ev.issues.length ? `<div class="col">${ev.issues.map(i => `<div class="note ${i.err ? 'bad' : 'warn'}">${i.err ? '⛔' : '⚠️'} ${i.text}</div>`).join('')}</div>` : '<div class="note good">✅ Design rule check passed.</div>'}
      <button class="btn primary lg" data-act="tapeout" ${ev.ok ? '' : 'disabled'}>📤 Tape out · ${fmtMoney(tapeOutCost(design))}</button>
      <div class="tiny faint">Mask set ${fmtMoney(node.mask)} + design team. Masks are a one-time cost: high-volume chips amortize them best.</div>`;
  },
  key(e) {
    if (e.key === 'r' || e.key === 'R') { this.rot = !this.rot; this.drawDie(); return true; }
    if (e.key === 'Escape') { this.sel = 'erase'; this.render($('#view')); return true; }
    return false;
  },
};
registerView('chiplab', ChipLab);
