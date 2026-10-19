'use strict';
// ============================================================================
//  Processor designer: the 💠 Processor tab of the Parts Lab. Pick a process
//  node and how many of each block go on the die; area, yield, heat, speed and
//  price follow. A tape-out costs a mask set and a few months, then the chip is
//  produced into stock (Production tab) at a foundry or in your own fab.
//  Pushing everything is possible – but big dies yield badly and only a few
//  dies on a wafer reach a high clock, so the price climbs steeply.
// ============================================================================

function fmtClock(ghz) { return ghz >= 1 ? ghz.toFixed(2) + ' GHz' : ghz >= 0.001 ? (ghz * 1000).toFixed(ghz < 0.01 ? 1 : 0) + ' MHz' : (ghz * 1e6).toFixed(0) + ' kHz'; }
const CHIP_OPTS = [['b64', 'chip_64', '64-bit cores', '+15% CPU'], ['dvfs', 'chip_dvfs', 'Dynamic voltage scaling', '−15% power'],
  ['brt', 'chip_rt', 'Ray-tracing GPU', '+20% GPU'], ['b3d', 'chip_3d', '3D-stacked cache', '+12% CPU & GPU']];

// pack the blocks into a near-square die for the picture (memory controllers and modems on the rim)
function packDie(n) {
  const list = [];
  for (const ty of ['gpu', 'npu', 'modem', 'io', 'pcore', 'cache', 'ecore', 'isp', 'dsp', 'media']) for (let k = 0; k < (n[ty] || 0); k++) list.push(ty);
  const cells = list.reduce((a, ty) => a + BLOCKS[ty].w * BLOCKS[ty].h, 0);
  const W = Math.max(3, Math.ceil(Math.sqrt(cells * 1.1)));
  const grid = [], placed = [];
  const busy = (x, y) => !!(grid[y] && grid[y][x]);
  const fits = (x, y, w, h) => x + w <= W && [...Array(h)].every((_, j) => [...Array(w)].every((__, i) => !busy(x + i, y + j)));
  const mark = (x, y, w, h) => { for (let j = 0; j < h; j++) { grid[y + j] = grid[y + j] || []; for (let i = 0; i < w; i++) grid[y + j][x + i] = true; } };
  for (const ty of list) {
    const b = BLOCKS[ty];
    let done = false;
    for (let y = 0; !done && y < 400; y++) for (let x = 0; !done && x < W; x++) {
      for (const [w, h] of [[b.w, b.h], [b.h, b.w]]) {
        if (!fits(x, y, w, h) || (b.edge && !(x === 0 || y === 0 || x + w === W))) continue;
        mark(x, y, w, h); placed.push({ ty, x, y, w, h }); done = true; break;
      }
    }
  }
  return { W, H: Math.max(3, grid.length), placed };
}

Object.assign(PartsLab, {
  chipCfg() {
    let c = S.chipDraft;
    if (!c || !c.n) c = S.chipDraft = defaultChipDraft();
    const nodes = nodesForDesign(), av = playerAv();
    if (!nodes.some(x => x.nm === c.nm)) c.nm = nodes[nodes.length - 1].nm;
    for (const ty of BLOCK_ORDER) {
      const [lo, hi] = CHIP_LIMITS[ty];
      let v = c.n[ty] == null ? lo : c.n[ty];
      if (BLOCKS[ty].tech && !av.ok(BLOCKS[ty].tech)) v = 0;
      c.n[ty] = clamp(v, ty === 'pcore' || ty === 'io' || ty === 'cache' ? lo : 0, hi);
    }
    c.clk = clamp(c.clk || 1, 0.6, 1.25);
    return c;
  },
  chipEval() { return evalProcessor(this.chipCfg(), playerAv().ok, now()); },

  renderChip(el) {
    const c = this.chipCfg(), av = playerAv();
    const node = nodeByNm(c.nm), nodes = nodesForDesign();
    el.innerHTML = `
      <div class="view-title"><h1>🛠️ Parts Lab</h1><p>Engineer your own components instead of buying standard parts. Every part type has its own real-world design system.</p></div>
      <div class="lab-tabs">${LAB_TABS.map(([id, ic, nm]) => {
        const k = id === 'chip' ? S.chips.length : S.designs.filter(d => d.type === id).length;
        return `<button class="lab-tab ${id === 'chip' ? 'on' : ''}" data-labtab="${id}"><span class="lab-tab-ic">${ic}</span><span>${nm}</span>${k ? `<span class="lab-tab-n">${k}</span>` : ''}</button>`;
      }).join('')}</div>
      <div class="lab3">
        <section class="lab-ctl card">
          <div class="lab-name"><span class="dim small">💠 Processor design</span>
            <input type="text" id="chipName" value="${esc(c.name)}" maxlength="24" placeholder="Name your chip"></div>
          <h3>Process node</h3>
          <select id="chipNode" class="full">${nodes.slice().reverse().map(x => `<option value="${x.nm}" ${x.nm === c.nm ? 'selected' : ''}>${nodeLabel(x.nm)} · ${fmtMoney(waferPrice(x, now()))}/wafer${hasFab(x.nm) ? ' · your fab' : ''}${now() < x.year ? ' ◆ ahead of the foundries' : ''}</option>`).join('')}</select>
          <div class="tiny faint mt-s">${node.density >= 1 ? node.density.toFixed(0) : node.density.toPrecision(2)} M transistors/mm² · nominal clock ${fmtClock(node.fnom)} · ${defectDensity(node, now()).toFixed(2)} defects/cm² right now</div>
          <h3>Blocks on the die</h3>
          <div class="chip-blocks">${BLOCK_ORDER.map(ty => this.chipBlockRow(ty, c, node, av)).join('')}</div>
          <h3>Clock</h3>
          <div class="cap"><div class="row between"><span class="dim small">Clock speed</span><b class="mono" id="clkShow">${fmtClock(node.fnom * c.clk)} · ${Math.round(c.clk * 100)}%</b></div>
            <input type="range" id="chipClock" min="0.6" max="1.25" step="0.01" value="${c.clk}">
            <div class="row between tiny faint"><span>cool & cheap</span><span>only the best dies (binning)</span></div></div>
          <h3>Options</h3>
          ${CHIP_OPTS.map(([k, id, title, sub]) => labToggle('chipopt.' + k, title, sub, id, !!c[k] && av.ok(id))).join('')}
        </section>
        <section class="lab-viz" id="chipViz"></section>
        <aside class="lab-side" id="chipSide"></aside>
      </div>
      <div class="card mt">${this.chipList()}</div>`;
    this.chipRefresh();
    this.bindChip(el);
  },
  chipBlockRow(ty, c, node, av) {
    const b = BLOCKS[ty], [lo, hi] = CHIP_LIMITS[ty], v = c.n[ty] || 0;
    const locked = b.tech && !av.ok(b.tech);
    const min = ty === 'pcore' || ty === 'io' || ty === 'cache' ? lo : 0;
    return `<div class="chip-row ${locked ? 'locked' : ''}" title="${esc(b.desc)}">
      <span class="chip-ic" style="background:${b.color}">${b.short}</span>
      <div class="chip-nm"><b>${b.name}</b><span class="tiny faint">${b.w * b.h * CELL_MM2 * 1.25} mm² · ${blockPower(ty, node, node.fnom * c.clk).toFixed(2)} W each${b.edge ? ' · die edge' : ''}</span>
        ${locked ? lockFoot(techUI(b.tech)) : ''}</div>
      ${locked ? '' : `<span class="stepper"><button data-cstep="${ty}:-1" ${v <= min ? 'disabled' : ''}>−</button><span>${v}</span><button data-cstep="${ty}:1" ${v >= hi ? 'disabled' : ''}>+</button></span>`}
    </div>`;
  },
  chipRefresh() {
    const c = this.chipCfg(), st = this.chipEval(), t = now();
    const viz = $('#chipViz'), side = $('#chipSide');
    if (!viz || !side) return;
    viz.innerHTML = this.chipViz(c, st);
    side.innerHTML = this.chipSide(c, st, t);
    const show = $('#clkShow');
    if (show) show.textContent = `${fmtClock(nodeByNm(c.nm).fnom * c.clk)} · ${Math.round(c.clk * 100)}%`;
  },
  chipViz(c, st) {
    const pk = packDie(c.n), C = Math.max(10, Math.min(30, Math.floor(380 / Math.max(pk.W, pk.H))));
    const hot = st.hotT > 75 ? clamp((st.hotT - 75) / 40, 0, 0.6) : 0;
    const side = Math.sqrt(st.area);
    let svg = `<svg class="chip-die" width="${pk.W * C + 16}" height="${pk.H * C + 16}" viewBox="-8 -8 ${pk.W * C + 16} ${pk.H * C + 16}">
      <rect x="-6" y="-6" width="${pk.W * C + 12}" height="${pk.H * C + 12}" rx="4" class="chip-pkg"/>`;
    for (const b of pk.placed) {
      const B = BLOCKS[b.ty], heat = B.hot ? hot : 0;
      svg += `<rect x="${b.x * C + 1}" y="${b.y * C + 1}" width="${b.w * C - 2}" height="${b.h * C - 2}" rx="3" fill="${B.color}"/>`;
      if (heat) svg += `<rect x="${b.x * C + 1}" y="${b.y * C + 1}" width="${b.w * C - 2}" height="${b.h * C - 2}" rx="3" fill="rgba(255,40,30,${heat.toFixed(2)})"/>`;
      if (C * Math.min(b.w, b.h) >= 18) svg += `<text x="${(b.x + b.w / 2) * C}" y="${(b.y + b.h / 2) * C + 4}" class="chip-lbl">${B.short}</text>`;
    }
    svg += '</svg>';
    const pc = processorCost(st, now());
    return `<div class="card"><h2>Die <span class="sub">${side.toFixed(1)} × ${side.toFixed(1)} mm · ${st.area} mm² · ${st.transistors >= 1 ? st.transistors.toFixed(1) + ' B' : Math.round(st.transistors * 1000) + ' M'} transistors</span></h2>
        <div class="chip-die-wrap">${svg}</div>
        <div class="tiny faint center">${st.hotT > 75 ? `Red tint = heat. Hotspot ${Math.round(st.hotT)}°C${st.hotT > 90 ? ` – throttles to ${Math.round(st.hotFactor * 100)}%` : ''}.` : `Hotspot ${Math.round(st.hotT)}°C – runs cool.`}</div></div>
      <div class="card"><h2>Where the money goes <span class="sub">per good chip</span></h2>
        ${labRows([
          ['Silicon', fmtMoney(pc.e.waferPrice / pc.e.good), '', `${fmtMoney(pc.e.waferPrice)} wafer ÷ ${Math.round(pc.e.good)} good dies`],
          ['Clock binning', pc.bin < 0.995 ? '+' + fmtMoney(pc.e.waferPrice / pc.e.good * (1 / pc.bin - 1)) : '—', pc.bin < 0.5 ? 'bad' : '', `${Math.round(pc.bin * 100)}% of good dies reach this clock`],
          ['Package & test', fmtMoney(pc.e.pack)], ['CPU/GPU IP license', fmtMoney(pc.e.ip)],
          ['Total (foundry)', `<b>${fmtMoney(pc.foundry)}</b>`],
        ])}
        <div class="note small mt-s">💡 More blocks = a bigger die: fewer dies per wafer, and each mm² raises the chance a die has a defect (Poisson yield). Clocks above nominal only come from the best dies. Cache feeds the cores and GPU; memory controllers keep a big GPU fed.</div></div>`;
  },
  chipSide(c, st, t) {
    const pc = processorCost(st, t), fab = hasFab(c.nm), early = t < nodeByNm(c.nm).year;
    const vs = vendorChipsAvailable(t);
    const mid = vs.filter(x => x.tier === 'mid').sort((a, b) => b.cpu - a.cpu)[0], flag = flagshipChip(t);
    const col = (x, own) => x ? [fmtSci(x.cpu), x.gpu ? fmtSci(x.gpu) : '—', x.tops ? x.tops.toFixed(1) : '—', x.power.toFixed(2) + ' W', own ? fmtMoney(fab ? pc.own : pc.foundry) : fmtMoney(vendorChipPrice(x, t))] : ['—', '—', '—', '—', '—'];
    const rows = ['CPU', 'GPU', 'AI (TOPS)', 'Power', 'Price / chip'];
    const a = col(mid), f = col(flag), y = col(st, true);
    const prob = chipProblems(c), cost = tapeOutCost(c.nm, st.area), days = tapeOutDays(st.area);
    const sustain = st.power > 0 ? clamp(4.5 / st.power, 0.35, 1) : 1;
    return `<div class="card"><h2>💠 Specs</h2>${labRows([
        ['CPU', fmtSci(st.cpu)], ['Single core', fmtSci(st.single)], ['GPU', st.gpu ? fmtSci(st.gpu) : '—'], ['AI', st.tops ? st.tops.toFixed(1) + ' TOPS' : '—'],
        ['Cores', `${st.pCores} big${st.eCores ? ' + ' + st.eCores + ' efficiency' : ''}`], ['Architecture', 'v' + st.arch],
        ['Modem', st.hasModem ? GEN_LABEL(st.modemGen) : st.dsp ? 'DSP only' : 'separate chip'],
        ['Power', st.power.toFixed(2) + ' W', st.power > 6 ? 'bad' : ''], ['Hotspot', Math.round(st.hotT) + '°C', st.hotT > 90 ? 'bad' : ''],
        ['In a phone', `~${Math.round(sustain * 100)}% sustained`, sustain < 0.75 ? 'bad' : '', 'A typical phone body sheds ~4–5 W; more than that throttles'],
      ])}</div>
      <div class="card"><h2>⚖️ vs. vendor chips</h2>
        <table class="tbl lab-cmp"><thead><tr><th></th><th class="num">Mid</th><th class="num">Flagship</th><th class="num">Yours</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td class="dim">${r}</td><td class="num">${a[i]}</td><td class="num">${f[i]}</td><td class="num"><b>${y[i]}</b></td></tr>`).join('')}</tbody></table>
        <div class="tiny faint mt-s">${flag ? esc(flag.name) + ' is today\'s top vendor chip.' : ''} Vendors charge for performance; your own chip costs only its silicon.</div></div>
      <div class="card"><h2>🏭 Production</h2>${labRows([
        ['Dies per wafer', fmtNum(pc.e.dpw)], ['Yield', fmtPct(pc.e.yield, 0), pc.e.yield < 0.5 ? 'bad' : ''], ['Clock bin', fmtPct(pc.bin, 0), pc.bin < 0.5 ? 'bad' : ''],
        ['Foundry price', early ? 'not offered yet' : fmtMoney(pc.foundry)], ['Your fab', fab ? fmtMoney(pc.own) : 'not built'],
      ])}<div class="tiny faint mt-s">Chips are produced into stock from the 📦 Production tab. Foundry wafers take ~2½ months to come back.</div></div>
      <div class="card lab-eng">
        ${st.issues.map(i => `<div class="note ${i.err ? 'bad' : 'warn'}">${i.err ? '⛔' : '⚠️'} ${esc(i.text)}</div>`).join('')}
        ${prob && !st.issues.some(i => i.err && i.text === prob) ? `<div class="note bad">⛔ ${esc(prob)}</div>` : ''}
        <button class="btn primary lg lab-go" data-act="tapeout" ${prob ? 'disabled' : ''} title="${esc(prob || '')}">📤 Tape out · ${fmtMoney(cost)} · ${Math.round(days / 30)} mo</button>
        <div class="tiny faint">Mask set, verification and first silicon. Afterwards the chip shows up in the Phone Lab's chip list and in Production.</div></div>`;
  },
  chipList() {
    const head = `<h2>📁 Your processors <span class="sub">${S.chips.length ? S.chips.length + ' taped out' : ''}</span></h2>`;
    if (!S.chips.length) return head + '<div class="dim small">None yet. Tune the design above and hit <b>Tape out</b>.</div>';
    const t = now();
    return head + `<div class="lab-dlist">${S.chips.slice().reverse().map(c => {
      const pc = processorCost(c.stats, t), cost = hasFab(c.stats.nm) ? pc.own : pc.foundry;
      const inUse = S.products.some(p => p.status !== 'retired' && p.spec.chip && p.spec.chip.kind === 'custom' && p.spec.chip.id === c.id);
      return `<div class="lab-drow">
        <div class="lab-dmain"><b>${esc(c.name)}</b> ${c.status === 'ready' ? '<span class="tag good">ready</span>' : `<span class="tag warn">first silicon in ${Math.max(0, c.readyDay - S.day)} d</span>`}${inUse ? '<span class="tag acc">in production</span>' : ''}
          <div class="tiny faint">${nodeLabel(c.stats.nm)} · ${c.stats.area} mm² · CPU ${fmtSci(c.stats.cpu)} · GPU ${c.stats.gpu ? fmtSci(c.stats.gpu) : '—'} · ${c.stats.power.toFixed(2)} W · ${fmtMoney(cost)}/chip · stock ${fmtNum(c.stock || 0)}</div>
          ${c.status === 'ready' ? `<label class="chk small" title="Rival brands may buy it if it beats the vendors' chips on value"><input type="checkbox" data-list="${c.id}" ${c.listed ? 'checked' : ''}> Sell to other brands at</label>
            $<input type="number" data-lprice="${c.id}" value="${(c.listPrice || Math.round(cost * 2.2 * 100) / 100).toFixed(2)}" step="0.5" min="1" style="width:80px"> <span class="tiny faint">sold ${fmtNum(c.sold || 0)}</span>` : ''}</div>
        <div class="lab-dact">${c.cfg ? `<button class="btn sm" data-act="crevise" data-id="${c.id}">Load as revision</button>` : ''}
          ${c.status === 'ready' ? `<button class="btn sm primary" data-act="cuse" data-id="${c.id}">Use in Phone Lab →</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  },
  bindChip(el) {
    const self = this;
    el.onclick = e => {
      const tab = e.target.closest('[data-labtab]');
      if (tab) { self.tab = tab.dataset.labtab; self.render(el); return; }
      const rs = e.target.closest('[data-rs]');
      if (rs) { if (report(startResearch(rs.dataset.rs))) { toast('Research started: ' + TECH[rs.dataset.rs].name, 'good'); renderNav(); self.renderChip(el); } return; }
      const stp = e.target.closest('[data-cstep]');
      if (stp && !stp.disabled) { const [ty, d] = stp.dataset.cstep.split(':'); const c = self.chipCfg(); c.n[ty] = (c.n[ty] || 0) + Number(d); self.renderChip(el); return; }
      const tg = e.target.closest('[data-toggle]');
      if (tg && tg.dataset.toggle.startsWith('chipopt.')) { const k = tg.dataset.toggle.slice(8), c = self.chipCfg(); c[k] = !c[k]; self.renderChip(el); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act, c = self.chipCfg();
      if (a === 'tapeout') {
        const st = self.chipEval();
        confirmBox('Tape out ' + esc(c.name) + '?', `Mask set + engineering: <b>${fmtMoney(tapeOutCost(c.nm, st.area))}</b>. First silicon arrives in ~${Math.round(tapeOutDays(st.area) / 30)} months. Then produce it into stock in the Production tab.`, 'Tape out', () => {
          if (report(tapeOut(c))) { toast(`${c.name} taped out!`, 'good'); S.chipDraft = Object.assign(JSON.parse(JSON.stringify(c)), { name: bumpName(c.name) }); renderNav(); self.renderChip(el); }
        });
      }
      if (a === 'crevise') { const ch = S.chips.find(x => x.id === act.dataset.id); if (ch && ch.cfg) { S.chipDraft = Object.assign(JSON.parse(JSON.stringify(ch.cfg)), { name: bumpName(ch.name) }); self.renderChip(el); } }
      if (a === 'cuse') { if (S.draft) { S.draft.chip = { kind: 'custom', id: act.dataset.id }; showView('phonelab'); } }
    };
    el.oninput = e => {
      const inp = e.target, c = self.chipCfg();
      if (inp.id === 'chipName') { c.name = inp.value; return; }
      if (inp.id === 'chipClock') { c.clk = Number(inp.value); self.chipRefresh(); }
    };
    el.onchange = e => {
      const inp = e.target, c = self.chipCfg();
      if (inp.id === 'chipNode') { c.nm = Number(inp.value); self.renderChip(el); return; }
      if (inp.id === 'chipClock') { self.renderChip(el); return; }
      const lc = inp.dataset.list || inp.dataset.lprice;
      if (lc) {
        const ch = S.chips.find(x => x.id === lc);
        if (!ch) return;
        const priceEl = $(`[data-lprice="${lc}"]`, el), box = $(`[data-list="${lc}"]`, el);
        listChip(ch, box && box.checked ? Number(priceEl.value) : 0);
        self.renderChip(el);
      }
    };
  },
});
