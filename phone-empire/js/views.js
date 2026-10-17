'use strict';
// ============================================================================
//  HQ, Factories, Research, Market and Finance screens.
// ============================================================================

function lastMonth() { return S.history[S.history.length - 1] || emptyMonth(); }
function phoneShare() {
  const s = S.shareHist[S.shareHist.length - 1];
  return s ? s.phone.you / s.phone.total : 0;
}

// ---- HQ -------------------------------------------------------------------------------
const HQ = {
  name: 'Headquarters', icon: '🏢',
  render(el) {
    const m = lastMonth(), t = now();
    const prods = S.products.filter(p => p.status !== 'retired');
    const ev = activeEvents(t);
    const goalsDone = GOALS.filter(g => S.goals[g.id]).length;
    const nextGoals = GOALS.filter(g => !S.goals[g.id]).slice(0, 4);
    el.innerHTML = `
      <div class="view-title"><h1>🏢 ${esc(S.company)}</h1><p>${dateLabel(t)} · ${prods.filter(p => p.status === 'active').length} devices on sale · ${S.factories.filter(f => f.status === 'active').length} factories</p></div>
      <div class="grid g4">
        <div class="kpi"><div class="l">Revenue last month</div><div class="v">${fmtMoney(m.revenue + (m.spare || 0))}</div><div class="d dim">${fmtNum(m.units)} devices sold</div></div>
        <div class="kpi"><div class="l">Profit last month</div><div class="v ${m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : ''}">${fmtMoney(m.profit || 0)}</div><div class="d dim">capex ${fmtMoney(m.capex || 0)} not included</div></div>
        <div class="kpi"><div class="l">Phone market share</div><div class="v">${fmtPct(phoneShare(), 2)}</div><div class="d dim">of ${fmtNum(marketSize('phone', t))} phones / month</div></div>
        <div class="kpi"><div class="l">Brand</div><div class="v">${fmtPct(S.aware)}</div><div class="d dim">awareness · reputation ${S.rep.toFixed(1)}/10</div></div>
      </div>
      ${ev.length ? `<div class="mt">${ev.map(e => `<div class="note warn">🌍 <b>${e.title}</b> — ${e.desc} (until ${dateLabel(e.end)})</div>`).join('')}</div>` : ''}
      <div class="card mt">
        <h2>Product line <span class="sub">prices & production can be changed any time</span></h2>
        ${prods.length ? this.products(prods) : `<div class="note">You have no devices yet. Head to the <b>📱 Phone Lab</b>, pick parts from suppliers, and start development. Your first device will be on shelves 45 days later.
          <div class="mt-s"><button class="btn primary" data-go="phonelab">Open Phone Lab →</button></div></div>`}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>📰 News</h2><div class="news">${S.news.slice(0, 60).map(n => `<div class="n ${n.kind}"><span class="d">${dateLabel(n.t)}</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>
        <div class="col">
          <div class="card"><h2>🏆 Goals <span class="sub">${goalsDone}/${GOALS.length}</span></h2>
            ${nextGoals.map(g => `<div class="row" style="padding:5px 0;align-items:flex-start"><span>⬜</span><div><div>${g.text}</div><div class="tiny faint">${g.hint}</div></div></div>`).join('') || '<div class="good">All goals complete — you built an empire!</div>'}
            ${goalsDone ? `<div class="tiny faint mt-s">Done: ${GOALS.filter(g => S.goals[g.id]).map(g => '✅ ' + g.text).join(' · ')}</div>` : ''}
          </div>
          <div class="card"><h2>🧭 How the business works</h2>
            <div class="small dim" style="line-height:1.55">
              <b>1.</b> Design devices in the Phone Lab using off-the-shelf parts. Thin margins, but no risk.<br>
              <b>2.</b> Spend on marketing — unknown brands barely sell, no matter how good the phone.<br>
              <b>3.</b> Build factories to make parts at cost: assembly first (cheap, fast payback), then cameras/batteries, then displays & memory.<br>
              <b>4.</b> Design your own SoC in the Chip Lab and fab it at a foundry — off-the-shelf chips carry a 3× markup.<br>
              <b>5.</b> Research tech <i>before</i> it becomes industry standard: exclusive features nobody else can buy.<br>
              <b>6.</b> Eventually, build your own chip fabs and own the whole stack.
            </div>
          </div>
        </div>
      </div>`;
    this.bind(el);
  },
  products(prods) {
    const t = now();
    return `<table class="tbl"><thead><tr><th>Device</th><th>Status</th><th class="num">Price</th><th>Production</th><th class="num">Stock</th><th class="num">Demand/mo</th><th class="num">Sold last mo</th><th class="num">Unit cost</th><th class="num">Margin</th><th>Review</th><th class="num">Quality</th><th></th></tr></thead><tbody>
      ${prods.map(p => {
        const cost = p.unitCostLast || (p.costs ? p.costs.est : productCosts(p.spec, t, playerAv()).est);
        const margin = p.price * (1 - RETAIL_CUT) - cost;
        const seg = segmentForPrice(p.spec.cat, p.price);
        const status = p.status === 'dev' ? `<span class="tag warn">dev ${p.devUntil - S.day}d</span>` : p.discontinued ? '<span class="tag">clearing stock</span>' : '<span class="tag good">on sale</span>';
        const flags = [];
        if (p.status === 'active' && p.lost > 0 && p.inventory === 0) flags.push('<span class="tag bad" title="Demand exceeded stock">stock-out</span>');
        if (p.capLimited) flags.push('<span class="tag excl" title="Exclusive tech limited by your factory capacity — expand the factory">capacity-limited</span>');
        return `<tr data-pid="${p.id}">
          <td><b>${CATS[p.spec.cat].icon} ${esc(p.name)}</b><div class="tiny faint">${esc(chipFor(p.spec)?.name || '')} · ${SEG_INFO[seg].name}</div></td>
          <td>${status} ${flags.join(' ')}</td>
          <td class="num"><input type="number" data-price value="${p.price}" min="29" max="3999" step="10" style="width:76px" ${p.status === 'retired' ? 'disabled' : ''}></td>
          <td>${p.discontinued ? '—' : `<label class="chk small"><input type="checkbox" data-auto ${p.auto ? 'checked' : ''}> auto</label>
            ${p.auto ? '' : `<input type="number" data-rate value="${p.rate}" min="0" step="1000" style="width:86px" title="Units per month">`}`}</td>
          <td class="num">${fmtNum(p.inventory)}</td>
          <td class="num">${p.status === 'active' ? fmtNum(p.demand || 0) : '—'}</td>
          <td class="num">${fmtNum(p.soldLastMonth || 0)}</td>
          <td class="num">${fmtMoney(cost)}</td>
          <td class="num ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin)}</td>
          <td>${reviewTag(p.review)}</td>
          <td class="num">${p.q ? Math.round(p.q[seg]) : '—'}</td>
          <td class="right">${p.status === 'active' && !p.discontinued ? '<button class="btn sm" data-detail>Details</button> <button class="btn sm danger" data-disc>End</button>' : p.status === 'active' ? '<button class="btn sm" data-detail>Details</button>' : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div class="tiny faint mt-s">Auto production keeps ~3 weeks of stock. Quality is relative to today's flagship in the device's price segment – it falls as rivals launch newer devices.</div>`;
  },
  bind(el) {
    el.onclick = e => {
      const go = e.target.closest('[data-go]');
      if (go) return showView(go.dataset.go);
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.closest('[data-disc]')) {
        confirmBox('End production of ' + esc(p.name) + '?', 'Production stops; remaining stock keeps selling until it runs out.', 'End production', () => { p.discontinued = true; renderCurrent(true); });
      }
      if (e.target.closest('[data-detail]')) productDetail(p);
    };
    el.onchange = e => {
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.dataset.price != null) { p.price = clamp(Math.round(+e.target.value) || p.price, 29, 3999); toast(`${p.name} now ${fmtMoney(p.price)}`); computeDemand(); }
      if (e.target.dataset.auto != null) p.auto = e.target.checked;
      if (e.target.dataset.rate != null) p.rate = Math.max(0, Math.round(+e.target.value) || 0);
      renderCurrent(true);
    };
  },
};
function productDetail(p) {
  const t = now();
  const pc = productCosts(p.spec, t, playerAv());
  const segs = p.segUnits || {};
  modal(`<h2>${CATS[p.spec.cat].icon} ${esc(p.name)}</h2>
    <div class="row wrap small dim">${reviewTag(p.review)} <span>${p.notes.map(esc).join(' · ') || 'No standout strengths or weaknesses.'}</span></div>
    <div class="grid g2 mt">
      <div><h3>Scores today</h3>${p.subs ? scoreBars(p.subs) : ''}</div>
      <div><h3>Lifetime</h3><div class="spec-list">
        <span class="k">Units sold</span><span class="v">${fmtNum(p.sold)}</span>
        <span class="k">Revenue (after retail)</span><span class="v">${fmtMoney(p.revenue)}</span>
        <span class="k">Gross profit</span><span class="v ${p.profit >= 0 ? 'good' : 'bad'}">${fmtMoney(p.profit)}</span>
        <span class="k">Lost sales (no stock)</span><span class="v">${fmtNum(p.lost)}</span>
        <span class="k">On sale since</span><span class="v">${p.launch ? dateLabel(p.launch) : '—'}</span>
      </div>
      <h3>Demand by buyer segment</h3><div class="spec-list">${SEGMENTS.map(s => `<span class="k">${SEG_INFO[s].name}</span><span class="v">${fmtNum(segs[s] || 0)}/mo</span>`).join('')}</div></div>
    </div>
    <h3>Unit cost today</h3>
    <table class="tbl bom">${pc.comps.map(c => `<tr><td>${c.label}</td><td>${c.pool ? '<span class="tag good">in-house</span>' : `<span class="tag">${c.buyLabel || 'supplier'}</span>`}</td><td class="num">${fmtMoney(c.pool ? c.in : (c.buy != null ? c.buy : c.in))}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table>
    <div class="actions"><button class="btn" data-copy>Use as template in Phone Lab</button><button class="btn primary" data-x>Close</button></div>`, d => {
    $('[data-x]', d).onclick = closeModal;
    $('[data-copy]', d).onclick = () => { S.draft = JSON.parse(JSON.stringify(p.spec)); S.draft.name = p.name + ' II'; closeModal(); showView('phonelab'); };
  });
}
registerView('hq', HQ);

// ---- Factories ----------------------------------------------------------------------------
const Factories = {
  name: 'Factories', icon: '🏭', fabNode: null,
  render(el) {
    const t = now();
    const owned = S.factories;
    const fabNodes = NODES.filter(n => n.year <= t || S.researched['proc_' + n.nm]);
    if (!this.fabNode || !fabNodes.some(n => n.nm === this.fabNode)) this.fabNode = fabNodes[fabNodes.length - 1].nm;
    const fn = nodeByNm(this.fabNode);
    el.innerHTML = `
      <div class="view-title"><h1>🏭 Factories</h1><p>Make parts at cost instead of paying supplier markups. Factories have fixed monthly upkeep — they pay off at volume.</p></div>
      ${owned.length ? `<div class="card mb"><h2>Your plants</h2><table class="tbl"><thead><tr><th>Plant</th><th>Status</th><th class="num">Level</th><th class="num">Capacity / mo</th><th>Utilization (last month)</th><th class="num">Upkeep / mo</th><th>Sell spare</th><th></th></tr></thead><tbody>
        ${owned.map(f => {
          const ft = FACTORY_TYPES[f.type], cap = factoryCap(f);
          const util = cap ? f.usedLast / cap : 0;
          const st = f.status === 'building' ? `<span class="tag warn">building · ${f.readyDay - S.day}d</span>` : f.upgradeUntil ? `<span class="tag acc">expanding · ${f.upgradeUntil - S.day}d</span>` : '<span class="tag good">online</span>';
          return `<tr data-fid="${f.id}"><td>${ft.icon} <b>${factoryName(f)}</b></td><td>${st}</td><td class="num">${f.level}</td>
            <td class="num">${cap ? fmtNum(cap) + ' ' + ft.unit : '—'}</td>
            <td style="min-width:140px">${cap && f.status === 'active' ? meter(util, util > 0.95 ? 'warn' : 'good') + `<span class="tiny faint">${Math.round(util * 100)}%</span>` : ''}</td>
            <td class="num">${fmtMoney(factoryUpkeep(f))}</td>
            <td>${cap ? `<label class="chk small" title="Sell unused capacity to other device makers"><input type="checkbox" data-spare ${f.sellSpare ? 'checked' : ''}> on</label>` : ''}</td>
            <td class="right">${f.level < FACTORY_MAX_LEVEL && f.status === 'active' && !f.upgradeUntil ? `<button class="btn sm" data-up>Expand · ${fmtMoney(upgradeCost(f))}</button>` : ''} <button class="btn sm danger" data-sell>Sell</button></td></tr>`;
        }).join('')}</tbody></table>
        <div class="tiny faint mt-s">Spare capacity is sold to other brands at a small margin. Your own devices always get priority; anything beyond your capacity is bought from suppliers automatically (except exclusive tech).</div></div>` : ''}
      <div class="grid auto">
        ${['assembly', 'camera', 'battery', 'display', 'memory', 'rnd'].map(type => {
          const ft = FACTORY_TYPES[type];
          const n = owned.filter(f => f.type === type).length;
          return `<div class="card fac"><div class="hd"><div class="ic">${ft.icon}</div><div><div class="nm">${ft.name}</div><div class="tiny faint">${n ? n + ' owned' : 'not owned'}</div></div></div>
            <div class="small dim" style="flex:1">${ft.desc}</div>
            <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(ft.cost)}</span>
              <span class="k">Construction</span><span class="v">${Math.round(ft.days / 30)} months</span>
              <span class="k">Upkeep</span><span class="v">${fmtMoney(ft.upkeep)}/mo</span>
              ${ft.cap ? `<span class="k">Capacity</span><span class="v">${fmtNum(ft.cap)} ${ft.unit}/mo</span>` : ''}</div>
            <button class="btn primary" data-build="${type}">Build · ${fmtMoney(ft.cost)}</button></div>`;
        }).join('')}
        <div class="card fac"><div class="hd"><div class="ic">💠</div><div><div class="nm">Chip Fab</div><div class="tiny faint">${owned.filter(f => f.type === 'fab').length} owned</div></div></div>
          <div class="small dim">${FACTORY_TYPES.fab.desc}</div>
          <div class="field"><span class="lbl">Process node</span><select id="fabNode">${fabNodes.map(n => `<option value="${n.nm}" ${n.nm === this.fabNode ? 'selected' : ''}>${nodeLabel(n.nm)}${n.year > t ? ' ◆ ahead of foundries' : ''}</option>`).join('')}</select></div>
          <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(fn.fab)}</span>
            <span class="k">Construction</span><span class="v">${Math.round((FACTORY_TYPES.fab.days + 15 * NODES.indexOf(fn)) / 30)} months</span>
            <span class="k">Upkeep</span><span class="v">${fmtMoney(fn.fab * 0.004)}/mo</span>
            <span class="k">Capacity</span><span class="v">${fmtNum(FACTORY_TYPES.fab.cap)} wafers/mo</span>
            <span class="k">Your wafer cost</span><span class="v good">${fmtMoney(fn.wafer * 0.3)} <span class="faint">vs foundry ${fmtMoney(waferPrice(fn, t))}</span></span></div>
          <button class="btn primary" data-build="fab">Build ${nodeLabel(fn.nm)} fab · ${fmtMoney(fn.fab)}</button></div>
      </div>`;
    el.onclick = e => {
      const b = e.target.closest('[data-build]');
      if (b) {
        const type = b.dataset.build;
        const cost = factoryBuildCost(type, this.fabNode);
        confirmBox(`Build ${type === 'fab' ? nodeLabel(this.fabNode) + ' Chip Fab' : FACTORY_TYPES[type].name}?`, `Costs <b>${fmtMoney(cost)}</b> now, plus monthly upkeep once it's online.`, 'Build', () => {
          if (report(buildFactory(type, type === 'fab' ? this.fabNode : null))) { toast('Construction started!', 'good'); renderCurrent(true); }
        });
        return;
      }
      const row = e.target.closest('[data-fid]');
      if (!row) return;
      const f = S.factories.find(x => x.id === row.dataset.fid);
      if (e.target.closest('[data-up]')) { if (report(upgradeFactory(f))) renderCurrent(true); }
      if (e.target.closest('[data-sell]')) confirmBox('Sell ' + factoryName(f) + '?', `You recover ${fmtMoney(f.invested * (f.status === 'active' ? 0.35 : 0.2))} of the ${fmtMoney(f.invested)} invested.`, 'Sell', () => { sellFactory(f); renderCurrent(true); });
    };
    el.onchange = e => {
      if (e.target.id === 'fabNode') { this.fabNode = Number(e.target.value); renderCurrent(true); }
      const row = e.target.closest('[data-fid]');
      if (row && e.target.dataset.spare != null) S.factories.find(x => x.id === row.dataset.fid).sellSpare = e.target.checked;
    };
  },
};
registerView('factories', Factories);

// ---- Research -------------------------------------------------------------------------------
const Research = {
  name: 'Research', icon: '🔬', showAll: false,
  render(el) {
    const slots = researchSlots(), spd = researchSpeed();
    el.innerHTML = `
      <div class="view-title"><h1>🔬 Research</h1><p>Every technology becomes industry standard on a set date. Research it earlier and it is yours alone — usable in-house only.</p></div>
      <div class="grid g3 mb">
        <div class="kpi"><div class="l">Research slots</div><div class="v">${S.research.length} / ${slots}</div><div class="d dim">Build R&D Centers for more</div></div>
        <div class="kpi"><div class="l">Research speed</div><div class="v">${Math.round(spd * 100)}%</div><div class="d dim">+25% per R&D Center level</div></div>
        <div class="kpi"><div class="l">Exclusive tech owned</div><div class="v excl">${TECHS.filter(tc => S.researched[tc.id] && now() < tc.market).length}</div><div class="d dim">${Object.keys(S.researched).length} researched in total</div></div>
      </div>
      ${S.research.length ? `<div class="card mb"><h2>In progress</h2>${S.research.map(r => {
        const tc = TECH[r.id], left = Math.ceil((tc.days - r.progress) / spd);
        return `<div class="row" style="padding:5px 0"><b style="min-width:240px">${tc.name}</b><div class="grow">${meter(r.progress / tc.days)}</div><span class="small dim" style="min-width:150px;text-align:right">${left} days · standard ${dateLabel(tc.market)}</span></div>`;
      }).join('')}</div>` : ''}
      <label class="chk small mb"><input type="checkbox" id="rsAll" ${this.showAll ? 'checked' : ''}> Show techs that are already industry standard</label>
      ${Object.keys(TECH_CATS).map(cat => {
        const info = TECH_CATS[cat];
        const list = TECHS.filter(tc => tc.cat === cat && (this.showAll || techState(tc) !== 'standard')).sort((a, b) => a.market - b.market);
        if (!list.length) return '';
        const facOk = !info.factory || info.factory === 'fab' || factoryActive(info.factory);
        return `<div class="rs-cat"><h2>${info.icon} ${info.name} <span class="small faint" style="font-weight:400">${info.note}${facOk ? '' : ' <span class="warn">(you have none yet)</span>'}</span></h2>
          <div class="rs-grid">${list.slice(0, this.showAll ? 99 : 8).map(tc => this.card(tc)).join('')}</div></div>`;
      }).join('')}`;
    el.onclick = e => {
      const b = e.target.closest('[data-rs]');
      if (b && report(startResearch(b.dataset.rs))) { toast('Research started: ' + TECH[b.dataset.rs].name, 'good'); renderCurrent(true); renderNav(); }
    };
    el.onchange = e => { if (e.target.id === 'rsAll') { this.showAll = e.target.checked; renderCurrent(true); } };
  },
  card(tc) {
    const st = techState(tc), t = now();
    const cost = researchCost(tc), days = Math.ceil(tc.days / researchSpeed());
    let foot = '';
    if (st === 'available') foot = `<button class="btn sm primary" data-rs="${tc.id}">Research · ${fmtMoney(cost)} · ${days}d</button>`;
    else if (st === 'active') foot = '<span class="tag acc">in progress</span>';
    else if (st === 'done') foot = t < tc.market ? `<span class="tag excl">◆ exclusive until ${dateLabel(tc.market)}</span>` : '<span class="tag">researched</span>';
    else if (st === 'standard') foot = '<span class="tag">industry standard</span>';
    else if (st === 'future') foot = `<span class="tag">opens ${dateLabel(tc.market - tc.lead)}</span>`;
    else foot = `<span class="tag warn">needs ${tc.req.filter(id => !S.researched[id] && t < TECH[id].market).map(id => TECH[id].name).join(', ')}</span>`;
    return `<div class="rs ${st}"><div class="row between"><span class="nm">${tc.name}</span><span class="tiny faint">${Math.floor(tc.market)}</span></div>
      <div class="ds">${tc.desc}</div><div class="tiny faint">Standard: ${dateLabel(tc.market)}</div>${foot}</div>`;
  },
};
registerView('research', Research);

// ---- Market ----------------------------------------------------------------------------------
const Market = {
  name: 'Market', icon: '📊', cat: 'phone', seg: 'all',
  render(el) {
    const t = now(), cat = this.cat;
    const s = S.shareHist[S.shareHist.length - 1];
    const by = s ? s[cat] : null;
    const brands = [{ id: 'you', name: S.company, color: '#6aa8ff' }].concat(RIVALS.map(r => ({ id: r.id, name: r.name, color: r.color })));
    const total = marketSize(cat, t);
    const phones = [];
    for (const r of S.rivalPhones) if (r.active && r.cat === cat) phones.push({ name: r.name, brand: RIVALS.find(x => x.id === r.rival).name, color: RIVALS.find(x => x.id === r.rival).color, price: r.price, seg: r.seg, q: r.q, demand: r.demand || 0, launch: r.launch, subs: r.subs });
    for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat) phones.push({ name: p.name, brand: S.company, color: '#6aa8ff', mine: true, price: p.price, seg: segmentForPrice(cat, p.price), q: p.q, demand: p.demand || 0, launch: p.launch, subs: p.subs });
    const list = phones.filter(p => this.seg === 'all' || p.seg === this.seg).sort((a, b) => b.demand - a.demand);
    const fs = flagshipSpec(cat, t), fchip = vendorChipById(fs.chip.id);
    const split = segSplit(t);
    el.innerHTML = `
      <div class="view-title"><h1>📊 Market</h1><p>Who sells what, to whom, and what buyers expect right now.</p></div>
      <div class="row mb">${segBtn('mcat', [{ v: 'phone', label: '📱 Phones' }, { v: 'tablet', label: '📟 Tablets' }], cat)}</div>
      <div class="grid g2">
        <div class="card"><h2>Market share <span class="sub">${fmtNum(total)} units / month</span></h2>
          ${by ? '<div class="bars">' + brands.map(b => ({ b, v: (by[b.id] || 0) / by.total })).sort((a, c) => c.v - a.v).map(({ b, v }) => `<div class="bar" style="grid-template-columns:110px 1fr 54px"><span class="${b.id === 'you' ? '' : 'dim'}"><span class="swatch" style="background:${b.color}"></span>${esc(b.name)}</span><div class="track"><div class="fill" style="width:${clamp(v * 250, 0, 100)}%;background:${b.color}"></div></div><b class="right mono">${fmtPct(v)}</b></div>`).join('') + '</div>' : '<div class="dim">Data after the first month.</div>'}
          <canvas class="chart mt" id="shareChart"></canvas>${legend(brands)}
        </div>
        <div class="card"><h2>What a flagship looks like today</h2>
          <div class="spec-list">
            <span class="k">Chip</span><span class="v">${fchip.name} (${nodeLabel(fchip.nm)})</span>
            <span class="k">Display</span><span class="v">${fs.display.size}" ${DISPLAY_TECH[fs.display.tech].name} · ${fs.display.ppi} ppi · ${fs.display.hz} Hz${fs.display.fullview ? ' · edge-to-edge' : ''}</span>
            <span class="k">Main camera</span><span class="v">${fs.cams.main.mp} MP ${SENSORS[fs.cams.main.sensor].name}${fs.cams.main.ois ? ' OIS' : ''}${fs.cams.ultra.on ? ' + ultra-wide' : ''}${fs.cams.tele.on ? ' + tele' : ''}</span>
            <span class="k">Battery</span><span class="v">${fs.battery.mah} mAh ${CHEM[fs.battery.chem].name} · ${fs.battery.charge} W${fs.battery.wireless ? ' · wireless' : ''}</span>
            <span class="k">Memory</span><span class="v">${fs.memory.ram >= 1024 ? fs.memory.ram / 1024 + ' GB' : fs.memory.ram + ' MB'} RAM · ${fs.memory.storage} GB</span>
            <span class="k">Body</span><span class="v">${MATERIALS[fs.body.mat].name} · ${WATER[fs.body.water].name}</span>
            <span class="k">Modem</span><span class="v">${MODEM_GENS[marketModemGen(t)]}</span>
            <span class="k">Preferred screen size</span><span class="v">${prefSize(cat, t).toFixed(1)}"</span>
          </div>
          <h3>Buyer segments</h3>
          <table class="tbl"><thead><tr><th>Segment</th><th class="num">Typical budget</th><th class="num">Buyers / mo</th><th>Cares most about</th></tr></thead><tbody>
            ${SEGMENTS.map((sg, i) => { const w = SEG_INFO[sg].w; const top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 2).map(k => SUB_LABELS[k]).join(', '); return `<tr><td>${SEG_INFO[sg].name}</td><td class="num">${fmtMoney(segBudget(cat, sg, t))}</td><td class="num">${fmtNum(total * split[i])}</td><td class="dim">${top}${sg === 'budget' ? ', price' : ''}</td></tr>`; }).join('')}
          </tbody></table>
        </div>
      </div>
      <div class="card mt"><h2>Devices on sale <span class="sub">${segBtn('mseg', [{ v: 'all', label: 'All' }].concat(SEGMENTS.map(sg => ({ v: sg, label: SEG_INFO[sg].name }))), this.seg)}</span></h2>
        <table class="tbl"><thead><tr><th>Device</th><th>Brand</th><th>Segment</th><th class="num">Price</th><th class="num">Quality</th><th class="num">Perf</th><th class="num">Camera</th><th class="num">Display</th><th class="num">Battery</th><th class="num">Est. sales/mo</th><th class="num">Launched</th></tr></thead><tbody>
          ${list.slice(0, 60).map(p => `<tr class="${p.mine ? 'mine' : ''}"><td><b>${esc(p.name)}</b></td><td><span class="swatch" style="background:${p.color}"></span>${esc(p.brand)}</td><td>${SEG_INFO[p.seg].name}</td>
            <td class="num">${fmtMoney(p.price)}</td><td class="num"><b>${p.q ? Math.round(p.q[p.seg]) : '—'}</b></td>
            ${['perf', 'cam', 'disp', 'batt'].map(k => `<td class="num dim">${p.subs ? Math.round(p.subs[k]) : '—'}</td>`).join('')}
            <td class="num">${fmtNum(p.demand)}</td><td class="num dim">${p.launch ? dateLabel(p.launch) : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="card mt"><h2>Off-the-shelf chips <span class="sub">what your rivals (and you) can buy</span></h2>
        <table class="tbl"><thead><tr><th>Chip</th><th>Tier</th><th>Node</th><th class="num">CPU</th><th class="num">GPU</th><th class="num">AI</th><th class="num">Power</th><th class="num">Area</th><th class="num">Price</th><th class="num">Released</th></tr></thead><tbody>
          ${vendorChipsAvailable(t).sort((a, b) => b.release - a.release).map(c => `<tr><td>${c.name}</td><td><span class="tag">${c.tier}</span></td><td>${nodeLabel(c.nm)}</td><td class="num">${fmtNum(c.cpu)}</td><td class="num">${c.gpu.toFixed(c.gpu < 10 ? 1 : 0)}</td><td class="num">${c.tops ? c.tops.toFixed(1) : '—'}</td><td class="num">${c.power.toFixed(1)} W</td><td class="num">${c.area} mm²</td><td class="num">${fmtMoney(vendorChipPrice(c, t))}</td><td class="num dim">${dateLabel(c.release)}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
    const hist = S.shareHist.slice(-180);
    const series = brands.map(b => ({ name: b.name, color: b.color, width: b.id === 'you' ? 3 : 1.5, data: hist.map(h => [h.t, (h[cat][b.id] || 0) / h[cat].total * 100]) }));
    drawChart($('#shareChart'), series, { yFmt: v => v.toFixed(0) + '%' });
    el.onclick = e => {
      const b = e.target.closest('.segbtn button');
      if (!b) return;
      if (b.parentElement.dataset.seg === 'mcat') this.cat = b.dataset.v;
      if (b.parentElement.dataset.seg === 'mseg') this.seg = b.dataset.v;
      renderCurrent(true);
    };
  },
};
registerView('market', Market);

// ---- Finance -----------------------------------------------------------------------------------
const Finance = {
  name: 'Finance', icon: '💰',
  render(el) {
    const h = S.history.slice(-12);
    const rows = [['Device revenue (after retail cut)', 'revenue', 1], ['Spare capacity sales', 'spare', 1], ['Components & assembly', 'cogs', -1], ['Factory upkeep', 'upkeep', -1],
      ['Research', 'rnd', -1], ['Development & tape-outs', 'dev', -1], ['Marketing', 'marketing', -1], ['Overhead & staff', 'overhead', -1], ['Interest', 'interest', -1], ['Corporate tax (22%)', 'tax', -1]];
    const maxMk = Math.max(2e6, Math.ceil(avgRevenue() * 0.25 / 1e5) * 1e5, S.marketing * 1.5);
    el.innerHTML = `
      <div class="view-title"><h1>💰 Finance</h1><p>Cash is king: you pay for parts when you build, and get paid when you sell.</p></div>
      <div class="grid g4">
        <div class="kpi"><div class="l">Cash</div><div class="v ${S.cash < 0 ? 'bad' : ''}">${fmtMoney(S.cash)}</div><div class="d dim">overdraft limit ${fmtMoney(creditLimit())}</div></div>
        <div class="kpi"><div class="l">Debt</div><div class="v">${fmtMoney(S.debt)}</div><div class="d dim">${(loanRate() * 100).toFixed(0)}% APR</div></div>
        <div class="kpi"><div class="l">Factories (book value)</div><div class="v">${fmtMoney(factoryValue())}</div><div class="d dim">inventory ${fmtMoney(inventoryValue())}</div></div>
        <div class="kpi"><div class="l">Net worth</div><div class="v">${fmtMoney(netWorth())}</div><div class="d dim">cash − debt + assets</div></div>
      </div>
      ${S.cash < 0 ? `<div class="note bad mt">⚠️ You are overdrawn (18% interest). If you stay below −${fmtMoney(creditLimit())} for 60 days the company goes bankrupt. ${S.overdraftDays ? `<b>${60 - S.overdraftDays} days left.</b>` : ''}</div>` : ''}
      <div class="grid g2 mt">
        <div class="card"><h2>📣 Marketing</h2>
          <div class="field"><span class="lbl">Monthly budget</span><div class="row"><input type="range" id="mk" min="0" max="${maxMk}" step="${maxMk / 100}" value="${S.marketing}"><span class="val" id="mkVal">${fmtMoney(S.marketing)}</span></div></div>
          <div class="small dim mt-s">Ads, retail placement and sponsorships raise brand awareness (now <b>${fmtPct(S.aware)}</b>). Awareness fades ~3% per month without support; word of mouth from sales and great reviews helps too. Rivals sit at 30–80% awareness.</div>
        </div>
        <div class="card"><h2>🏦 Loans</h2>
          <div class="spec-list"><span class="k">Outstanding</span><span class="v">${fmtMoney(S.debt)}</span><span class="k">Available to borrow</span><span class="v">${fmtMoney(loanLimit())}</span><span class="k">Monthly interest</span><span class="v">${fmtMoney(S.debt * loanRate() / 12)}</span></div>
          <div class="row wrap mt">
            ${[1e6, 10e6, 100e6, 1e9].filter(v => v <= loanLimit() * 1.0001 || v === 1e6).map(v => `<button class="btn sm" data-borrow="${v}" ${loanLimit() < 1 ? 'disabled' : ''}>Borrow ${fmtMoney(Math.min(v, loanLimit()))}</button>`).join('')}
            <button class="btn sm" data-repay="all" ${S.debt > 0 && S.cash > 0 ? '' : 'disabled'}>Repay ${fmtMoney(Math.min(S.debt, Math.max(0, S.cash)))}</button>
          </div>
        </div>
      </div>
      <div class="card mt"><h2>Profit & loss <span class="sub">last ${h.length} months</span></h2>
        ${h.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th>${h.map(m => `<th class="num">${dateLabel(m.t)}</th>`).join('')}</tr></thead><tbody>
          ${rows.map(([label, k, sg]) => `<tr><td class="dim">${label}</td>${h.map(m => `<td class="num ${sg < 0 && m[k] ? 'bad' : ''}">${m[k] ? (sg < 0 ? '−' : '') + fmtMoney(m[k]).replace('−', '') : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td><b>Profit</b></td>${h.map(m => `<td class="num ${m.profit >= 0 ? 'good' : 'bad'}"><b>${fmtMoney(m.profit)}</b></td>`).join('')}</tr>
          <tr><td class="dim">Capital spending (factories)</td>${h.map(m => `<td class="num dim">${m.capex ? fmtMoney(m.capex) : '—'}</td>`).join('')}</tr>
        </tbody></table></div>` : '<div class="dim">The first books close at the end of this month.</div>'}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>Revenue & profit</h2><canvas class="chart" id="pnlChart"></canvas>${legend([{ name: 'Revenue', color: '#6aa8ff' }, { name: 'Profit', color: '#43c88a' }])}</div>
        <div class="card"><h2>Net worth</h2><canvas class="chart" id="nwChart"></canvas>${legend([{ name: 'Net worth', color: '#f2cc5b' }, { name: 'Cash', color: '#8b7bff' }])}</div>
      </div>`;
    const hh = S.history.slice(-240);
    drawChart($('#pnlChart'), [{ name: 'Revenue', color: '#6aa8ff', data: hh.map(m => [m.t, m.revenue + (m.spare || 0)]), fill: 'rgba(106,168,255,.08)' }, { name: 'Profit', color: '#43c88a', data: hh.map(m => [m.t, m.profit]) }], { yFmt: v => fmtMoney(v) });
    drawChart($('#nwChart'), [{ name: 'Net worth', color: '#f2cc5b', data: hh.map(m => [m.t, m.worth]) }, { name: 'Cash', color: '#8b7bff', data: hh.map(m => [m.t, m.cash]) }], { yFmt: v => fmtMoney(v) });
    const mk = $('#mk');
    mk.oninput = () => { S.marketing = Math.round(+mk.value / 1000) * 1000; $('#mkVal').textContent = fmtMoney(S.marketing); };
    mk.onchange = () => toast(`Marketing budget: ${fmtMoney(S.marketing)}/month`);
    el.onclick = e => {
      const b = e.target.closest('[data-borrow]');
      if (b) { borrow(+b.dataset.borrow); renderCurrent(true); }
      if (e.target.closest('[data-repay]')) { repay(S.debt); renderCurrent(true); }
    };
  },
};
registerView('finance', Finance);
