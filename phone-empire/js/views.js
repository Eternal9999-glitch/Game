'use strict';
// ============================================================================
//  HQ, Production, Factories, Research (tech tree), Market, Benchmarks,
//  Investors and Finance screens.
// ============================================================================

function lastMonth() { return S.history[S.history.length - 1] || emptyMonth(); }
function phoneShare() { const s = S.shareHist[S.shareHist.length - 1]; return s ? s.phone.you / s.phone.total : 0; }
// the next thing a new player should do, in order
function nextStep() {
  const ps = S.products, f = S.funding;
  if (!S.protos.length && !ps.length) return ['Design your first phone and build a prototype to show investors.', 'phonelab', 'Open Phone Lab'];
  if (!Object.keys(f.done).length && !f.pitch && !f.offer) return ['Raise money: pitch friends & family, then angels with your prototype.', 'investors', 'Find investors'];
  if (f.offer) return ['An investor made you an offer – answer it before it expires.', 'investors', 'See the offer'];
  if (!ps.length) return ['Develop and launch your device.', 'phonelab', 'Open Phone Lab'];
  if (!S.marketing) return ['Set a marketing budget – nobody buys a brand they have never heard of.', 'finance', 'Set marketing'];
  if (S.research.length < researchSlots() && TECHS.some(tc => techState(tc) === 'available')) return ['Keep your research slots busy – rivals adopt new tech every year.', 'research', 'Research'];
  return null;
}
const statusTag = p => p.status === 'dev' ? `<span class="tag warn">dev ${Math.max(0, p.devUntil - S.day)}d</span>` : p.discontinued ? '<span class="tag">clearing stock</span>' : p.status === 'retired' ? '<span class="tag">retired</span>' : '<span class="tag good">on sale</span>';
function lineStatus(p) {
  if (p.discontinued) return '<span class="faint">ended</span>';
  if (!p.lineMaker) return `<span class="bad">${esc(p.lineMsg || 'no manufacturer')}</span>`;
  if (S.day < p.lineReady) return `<span class="warn">setting up · ${p.lineReady - S.day} d</span>`;
  if (p.cashStalled) return '<span class="bad">waiting for cash</span>';
  return `<span class="good">running</span>`;
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
    const step = nextStep();
    const ps = PLAYSTYLES[S.playstyle];
    el.innerHTML = `
      <div class="view-title"><h1>🏢 ${esc(S.company)}</h1><p>${ps.icon} ${ps.name} · ${dateLabel(t)} · you own ${fmtPct(S.own, 1)}${S.public ? ' · publicly traded' : ''}</p></div>
      ${step ? `<div class="note good mb row between wrap"><span>👉 <b>Next step:</b> ${step[0]}</span><button class="btn sm primary" data-go="${step[1]}">${step[2]} →</button></div>` : ''}
      <div class="grid g4">
        <div class="kpi"><div class="l">Revenue last month</div><div class="v">${fmtMoney(m.revenue + (m.b2b || 0) + (m.spare || 0))}</div><div class="d dim">${fmtNum(m.units)} devices sold${m.b2b ? ' · ' + fmtMoney(m.b2b) + ' from other brands' : ''}</div></div>
        <div class="kpi"><div class="l">Profit last month</div><div class="v ${m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : ''}">${fmtMoney(m.profit || 0)}</div><div class="d dim">factories & funding not included</div></div>
        <div class="kpi"><div class="l">Your stake</div><div class="v">${fmtMoney(Math.max(0, netWorth()) * S.own)}</div><div class="d dim">${fmtPct(S.own, 1)} of a ${fmtMoney(netWorth())} company</div></div>
        <div class="kpi"><div class="l">Brand</div><div class="v">${fmtPct(S.aware)}</div><div class="d dim">awareness · reputation ${S.rep.toFixed(1)}/10 · share ${fmtPct(phoneShare(), 2)}</div></div>
      </div>
      ${ev.length ? `<div class="mt">${ev.map(e => `<div class="note warn">🌍 <b>${e.title}</b> — ${e.desc} (until ${dateLabel(e.end)})</div>`).join('')}</div>` : ''}
      <div class="card mt">
        <h2>Product line <span class="sub">change prices any time · production lines in 📦 Production</span></h2>
        ${prods.length ? this.products(prods) : `<div class="note">No devices yet. Design one in the <b>📱 Phone Lab</b>.
          <div class="mt-s"><button class="btn primary" data-go="phonelab">Open Phone Lab →</button></div></div>`}
        ${S.protos.length ? `<div class="tiny faint mt-s">Prototypes: ${S.protos.slice(-5).map(x => `${esc(x.name)} ${x.review == null ? '(on the bench)' : x.review.toFixed(1) + '/10'}`).join(' · ')}</div>` : ''}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>📰 News</h2><div class="news">${S.news.slice(0, 70).map(n => `<div class="n ${n.kind}"><span class="d">${dateLabel(n.t)}</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>
        <div class="col">
          <div class="card"><h2>🏆 Goals <span class="sub">${goalsDone}/${GOALS.length}</span></h2>
            ${nextGoals.map(g => `<div class="row" style="padding:5px 0;align-items:flex-start"><span>⬜</span><div><div>${g.text}</div><div class="tiny faint">${g.hint}</div></div></div>`).join('') || '<div class="good">All goals complete — you built an empire!</div>'}
            ${goalsDone ? `<div class="tiny faint mt-s">Done: ${GOALS.filter(g => S.goals[g.id]).map(g => '✅ ' + g.text).join(' · ')}</div>` : ''}
          </div>
          <div class="card"><h2>${ps.icon} Your playstyle: ${ps.name}</h2>
            <div class="small dim">${ps.tagline}</div>
            <ul class="small dim" style="margin:6px 0 0 18px;line-height:1.6">${ps.perks.map(p => `<li>${p}</li>`).join('')}</ul>
          </div>
        </div>
      </div>`;
    this.bind(el);
  },
  products(prods) {
    const t = now(), cut = retailCut();
    return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Device</th><th>Status</th><th class="num">Price</th><th class="num">Stock</th><th class="num">Demand/mo</th><th class="num">Sold last mo</th><th class="num">Unit cost</th><th class="num">Margin</th><th>Review</th><th class="num">Quality</th><th></th></tr></thead><tbody>
      ${prods.map(p => {
        const cost = p.unitCostLast || (p.lineMaker ? lineCosts(p, p.lineMaker).est : 0);
        const margin = p.price * (1 - cut) - cost;
        const seg = segmentForPrice(p.spec.cat, p.price, t);
        const flags = [];
        if (p.status === 'active' && p.inventory === 0 && p.demand > 1) flags.push('<span class="tag bad" title="No stock – buyers walk away">sold out</span>');
        if (!p.lineMaker && !p.discontinued) flags.push(`<span class="tag warn" title="${esc(p.lineMsg || '')}">no line</span>`);
        return `<tr data-pid="${p.id}">
          <td><b>${FORMS[formOf(p.spec)].icon} ${esc(p.name)}</b><div class="tiny faint">${FORMS[formOf(p.spec)].name} · ${SEG_INFO[seg].name}</div></td>
          <td>${statusTag(p)} ${flags.join(' ')}</td>
          <td class="num"><input type="number" data-price value="${p.price}" min="9" max="19999" step="10" style="width:80px"></td>
          <td class="num">${fmtNum(p.inventory)}</td>
          <td class="num">${p.status === 'active' ? fmtNum(p.demand || 0) : '~' + fmtNum(p.forecast || 0)}</td>
          <td class="num">${fmtNum(p.soldLastMonth || 0)}</td>
          <td class="num">${cost ? fmtMoney(cost) : '—'}</td>
          <td class="num ${margin >= 0 ? 'good' : 'bad'}">${cost ? fmtMoney(margin) : '—'}</td>
          <td>${reviewTag(p.review)}</td>
          <td class="num">${p.q ? Math.round(p.q[seg]) : '—'}</td>
          <td class="right nowrap"><button class="btn sm" data-detail>Details</button>${p.discontinued ? '' : ' <button class="btn sm danger" data-disc>End</button>'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="tiny faint mt-s">Quality is relative to today's flagship in the device's price segment – it falls slowly as the industry moves on. Demand follows changes over a few weeks.</div>`;
  },
  bind(el) {
    el.onclick = e => {
      const go = e.target.closest('[data-go]');
      if (go) return showView(go.dataset.go);
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.closest('[data-disc]')) confirmBox('End ' + esc(p.name) + '?', 'The production line stops; remaining stock keeps selling until it runs out.', 'End production', () => { p.discontinued = true; renderCurrent(true); });
      if (e.target.closest('[data-detail]')) productDetail(p);
    };
    el.onchange = e => {
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.dataset.price != null) { p.price = clamp(Math.round(+e.target.value) || p.price, 9, 19999); toast(`${p.name} now ${fmtMoney(p.price)}`); computeDemand(); }
      renderCurrent(true);
    };
  },
};
function productDetail(p) {
  const pc = lineCosts(p, p.lineMaker || 'pearl');
  const segs = p.segUnits || {};
  const ev = pc.ev, b = ev.bench;
  modal(`<h2>${FORMS[formOf(p.spec)].icon} ${esc(p.name)}</h2>
    <div class="row wrap small dim">${reviewTag(p.review)} <span>${p.notes.map(esc).join(' · ') || 'No standout strengths or weaknesses.'}</span></div>
    <div class="grid g2 mt">
      <div><h3>Scores today</h3>${p.subs ? scoreBars(p.subs) : ''}
        <h3>Specs</h3><div class="spec-list small">
          <span class="k">Size</span><span class="v">${Math.round(ev.geom.H)} × ${Math.round(ev.geom.W)} × ${ev.geom.T.toFixed(1)} mm · ${fmtWeight(ev.weight)}</span>
          <span class="k">Display</span><span class="v">${esc(partSummary('display', partParams(p.spec.display)))}</span>
          <span class="k">Camera</span><span class="v">${p.spec.cams.main ? esc(partSummary('camera', partParams(p.spec.cams.main))) : 'none'}</span>
          <span class="k">Battery</span><span class="v">${p.spec.battery ? esc(partSummary('battery', partParams(p.spec.battery))) : 'car power'}</span>
          <span class="k">Memory</span><span class="v">${esc(partSummary('memory', partParams(p.spec.memory)))}</span>
          <span class="k">Radio</span><span class="v">${esc(partSummary('radio', partParams(p.spec.radio)))}</span>
          <span class="k">Chip</span><span class="v">${esc(pc.chip ? pc.chip.name : '?')}</span>
        </div></div>
      <div><h3>Lifetime</h3><div class="spec-list">
        <span class="k">Units sold</span><span class="v">${fmtNum(p.sold)}</span>
        <span class="k">Revenue (after retail)</span><span class="v">${fmtMoney(p.revenue)}</span>
        <span class="k">Gross profit</span><span class="v ${p.profit >= 0 ? 'good' : 'bad'}">${fmtMoney(p.profit)}</span>
        <span class="k">Lost sales (no stock)</span><span class="v">${fmtNum(p.lost)}</span>
        <span class="k">On sale since</span><span class="v">${p.launch ? dateLabel(p.launch) : '—'}</span>
      </div>
      <h3>Benchmarks</h3><div class="spec-list small">
        <span class="k">CPU / GPU</span><span class="v">${fmtSci(b.cpu)} / ${fmtSci(b.gpu)}</span>
        <span class="k">CameraMark / DisplayMark</span><span class="v">${Math.round(b.cam)} / ${Math.round(b.disp)}</span>
        <span class="k">Battery</span><span class="v">${b.batt == null ? 'car power' : b.batt.toFixed(1) + ' h'}</span>
        <span class="k">Network</span><span class="v">${fmtSpeed(b.net)} · ${fmtPct(b.cov, 0)} coverage</span>
      </div>
      <h3>Demand by buyer segment</h3><div class="spec-list">${SEGMENTS.map(s => `<span class="k">${SEG_INFO[s].name}</span><span class="v">${fmtNum(segs[s] || 0)}/mo</span>`).join('')}</div></div>
    </div>
    <h3>Unit cost today</h3>
    <table class="tbl bom">${pc.comps.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${fmtMoney(c.own != null ? c.own : c.buy || 0)}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table>
    <div class="actions"><button class="btn" data-copy>Use as template</button><button class="btn primary" data-x>Close</button></div>`, d => {
    $('[data-x]', d).onclick = closeModal;
    $('[data-copy]', d).onclick = () => { S.draft = JSON.parse(JSON.stringify(p.spec)); S.draft.name = p.name + ' II'; closeModal(); showView('phonelab'); };
  }, true);
}
registerView('hq', HQ);

// ---- Production ----------------------------------------------------------------------------
const Production = {
  name: 'Production', icon: '📦',
  render(el) {
    const prods = S.products.filter(p => p.status !== 'retired');
    el.innerHTML = `
      <div class="view-title"><h1>📦 Production</h1><p>Every device has a production line at one manufacturer. Lines run continuously and you pay for units as they come off the line.</p></div>
      <div class="card"><h2>Production lines</h2>
        ${prods.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Device</th><th>Manufacturer</th><th>Output</th><th>Status</th><th class="num">Stock</th><th class="num">Demand/mo</th><th class="num">Built last mo</th><th class="num">Unit cost</th></tr></thead><tbody>
          ${prods.map(p => {
            const cover = p.demand > 1 ? p.inventory / p.demand * 30 : null;
            const opts = makerOptions(p);
            return `<tr data-pid="${p.id}"><td><b>${esc(p.name)}</b><div class="tiny faint">${statusTag(p)}</div></td>
              <td>${p.discontinued ? '—' : `<select data-maker class="small"><option value="auto" ${p.line.maker === 'auto' ? 'selected' : ''}>Auto (cheapest)${p.line.maker === 'auto' && p.lineMaker ? ': ' + esc(makerName(p.lineMaker)) : ''}</option>
                ${opts.map(o => `<option value="${o.m}" ${p.line.maker === o.m ? 'selected' : ''} ${o.prob ? 'disabled' : ''}>${esc(makerName(o.m))}${o.prob ? ' – ' + esc(o.prob.slice(0, 50)) : ' · ' + fmtMoney(o.unit)}</option>`).join('')}</select>`}</td>
              <td>${p.discontinued ? '—' : `<select data-mode class="small"><option value="auto" ${p.line.mode === 'auto' ? 'selected' : ''}>Match demand</option><option value="manual" ${p.line.mode === 'manual' ? 'selected' : ''}>Fixed rate</option></select>
                ${p.line.mode === 'manual' ? `<input type="number" data-rate value="${p.line.rate}" min="0" step="100" style="width:90px"> /mo` : ''}`}</td>
              <td class="small">${lineStatus(p)}</td>
              <td class="num">${fmtNum(p.inventory)}${cover != null ? `<div class="tiny ${cover < 7 ? 'bad' : 'faint'}">${Math.round(cover)} days</div>` : ''}</td>
              <td class="num">${p.status === 'active' ? fmtNum(p.demand) : '~' + fmtNum(p.forecast || 0)}</td>
              <td class="num">${fmtNum(p.producedLast || 0)}</td>
              <td class="num">${p.unitCostLast ? fmtMoney(p.unitCostLast) : '—'}</td></tr>`;
          }).join('')}</tbody></table></div>
          <div class="tiny faint mt-s">"Match demand" keeps about three weeks of stock. A new line takes the manufacturer's lead time to set up; switching makers starts over.</div>` : '<div class="dim">Launch a device first (📱 Phone Lab).</div>'}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>🏭 Contract manufacturers</h2>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Company</th><th class="num">Fee</th><th class="num">Capacity/mo</th><th class="num">Lead</th><th class="num">Line fee/mo</th><th>Builds up to</th></tr></thead><tbody>
          ${factoryActive('assembly') ? `<tr><td><b>Your assembly line</b><div class="tiny faint">~${Math.round(ownAssemblyMul() * 100)}% of the labor price</div></td><td class="num">${Math.round(ownAssemblyMul() * 100)}%</td><td class="num">${fmtNum(factoryPool('assembly'))}</td><td class="num">5 d</td><td class="num">—</td><td>anything you've researched</td></tr>` : ''}
          ${PARTNERS.map(pt => {
            const t = now(), ok = t >= pt.since && (!pt.until || t <= pt.until), need = pt.minRev * fundScale();
            return `<tr class="${ok ? '' : 'dim'}"><td><b>${esc(pt.name)}</b><div class="tiny faint">${ok ? esc(pt.desc) : t < pt.since ? 'Founded ' + Math.floor(pt.since) : 'Closed'}${need > 0 ? ` · clients earning ${fmtMoney(need)}+/mo` : ''}</div></td>
              <td class="num">${Math.round(pt.fee * perk('feeMul', 1) * 100)}%</td><td class="num">${fmtNum(pt.cap)}</td><td class="num">${pt.lead} d</td><td class="num">${fmtMoney(pt.lineFee * ecoNow() * 0.25)}</td><td>${TIER_NAMES[pt.tier]}</td></tr>`;
          }).join('')}</tbody></table></div>
          <div class="tiny faint mt-s">Fees multiply the era's standard assembly price. Every line you run costs its monthly line fee.</div>
        </div>
        <div class="card"><h2>🔩 Where parts come from</h2>
          <div class="small dim">Standard parts are bought from suppliers at a 45% markup. Your own designs (🛠️ Parts Lab) are built by contract part makers at cost +22% – or at cost in your own plant, which is also the only way to use exclusive tech.</div>
          <table class="tbl mt-s">${PART_TYPES.map(k => `<tr><td>${PART_INFO[k].icon} ${PART_INFO[k].name}</td><td>${factoryActive(k) ? `<span class="tag good">own plant · ${fmtNum(factoryPool(k))}/mo</span>` : '<span class="tag">contract makers</span>'}</td><td class="num">${S.designs.filter(d => d.type === k).length} designs</td></tr>`).join('')}</table>
        </div>
      </div>`;
    el.onchange = e => {
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.dataset.maker != null) { p.line.maker = e.target.value; assignMaker(p); }
      if (e.target.dataset.mode != null) { p.line.mode = e.target.value; if (p.line.mode === 'manual' && !p.line.rate) p.line.rate = Math.round((p.demand || p.forecast || 100) / 100) * 100; }
      if (e.target.dataset.rate != null) p.line.rate = Math.max(0, Math.round(+e.target.value) || 0);
      renderCurrent(true);
    };
  },
};
registerView('production', Production);

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
      <div class="view-title"><h1>🏭 Factories</h1><p>Own plants build devices and your part designs at cost, unlock exclusive tech – and can sell their capacity to rivals.</p></div>
      ${S.offers.length || S.contracts.length ? `<div class="card mb"><h2>🤝 Supply contracts <span class="sub">rival brands want your capacity</span></h2>
        ${S.contracts.length ? `<h3>Active</h3><table class="tbl">${S.contracts.map(c => `<tr><td><b>${esc(c.buyer)}</b></td><td>${fmtNum(c.qty)} ${c.label}/mo</td><td class="num">${fmtMoney(c.price)} each</td><td class="num">${c.monthsLeft} months left</td><td class="num tiny faint">cost ~${fmtMoney(contractUnitCost(c.type))}</td></tr>`).join('')}</table>` : ''}
        ${S.offers.length ? `<h3>Offers</h3><div class="scroll-x"><table class="tbl">${S.offers.map(o => `<tr data-off="${o.id}"><td><b>${esc(o.buyer)}</b></td><td>${fmtNum(o.qty)} ${o.label}/month for ${o.months} months</td><td class="num">${fmtMoney(o.price)} each</td>
          <td class="num good">≈ ${fmtMoney((o.price - contractUnitCost(o.type)) * o.qty)}/mo profit</td><td class="num tiny faint">expires in ${o.expires - S.day} d</td><td class="right"><button class="btn sm primary" data-acc>Sign</button></td></tr>`).join('')}</table></div>
          <div class="tiny faint mt-s">Contracts take priority on your lines. Missing more than 5% of a month's quantity costs a penalty.</div>` : ''}
      </div>` : ''}
      ${owned.length ? `<div class="card mb"><h2>Your plants</h2><div class="scroll-x"><table class="tbl"><thead><tr><th>Plant</th><th>Status</th><th class="num">Level</th><th class="num">Capacity / mo</th><th>Used last month</th><th class="num">Upkeep / mo</th><th>Sell spare</th><th></th></tr></thead><tbody>
        ${owned.map(f => {
          const ft = FACTORY_TYPES[f.type], cap = factoryCap(f);
          const util = cap ? f.usedLast / cap : 0;
          const st = f.status === 'building' ? `<span class="tag warn">building · ${f.readyDay - S.day}d</span>` : f.upgradeUntil ? `<span class="tag acc">expanding · ${f.upgradeUntil - S.day}d</span>` : '<span class="tag good">online</span>';
          return `<tr data-fid="${f.id}"><td>${ft.icon} <b>${factoryName(f)}</b></td><td>${st}</td><td class="num">${f.level}</td>
            <td class="num">${cap ? fmtNum(cap) + ' ' + ft.unit : '—'}</td>
            <td style="min-width:130px">${cap && f.status === 'active' ? meter(util, util > 0.95 ? 'warn' : 'good') + `<span class="tiny faint">${Math.round(util * 100)}%</span>` : ''}</td>
            <td class="num">${fmtMoney(factoryUpkeep(f))}</td>
            <td>${cap ? `<label class="chk small" title="Sell unused capacity on the open market"><input type="checkbox" data-spare ${f.sellSpare ? 'checked' : ''}> on</label>` : ''}</td>
            <td class="right nowrap">${f.level < FACTORY_MAX_LEVEL && f.status === 'active' && !f.upgradeUntil ? `<button class="btn sm" data-up>Expand · ${fmtMoney(upgradeCost(f))}</button>` : ''} <button class="btn sm danger" data-sell>Sell</button></td></tr>`;
        }).join('')}</tbody></table></div></div>` : ''}
      <div class="grid auto">
        ${['workshop', 'assembly', 'radio', 'display', 'camera', 'battery', 'memory', 'rnd'].map(type => {
          const ft = FACTORY_TYPES[type], cost = factoryBuildCost(type);
          const n = owned.filter(f => f.type === type).length;
          return `<div class="card fac"><div class="hd"><div class="ic">${ft.icon}</div><div><div class="nm">${ft.name}</div><div class="tiny faint">${n ? n + ' owned' : 'not owned'}</div></div></div>
            <div class="small dim grow">${ft.desc}</div>
            <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(cost)}</span>
              <span class="k">Construction</span><span class="v">${Math.max(1, Math.round(ft.days / 30))} month${ft.days > 45 ? 's' : ''}</span>
              <span class="k">Upkeep</span><span class="v">${fmtMoney(ft.upkeep * ecoNow() * perk('upkeepMul', 1))}/mo</span>
              ${ft.cap ? `<span class="k">Capacity</span><span class="v">${fmtNum(ft.cap)} ${ft.unit}/mo</span>` : ''}</div>
            <button class="btn primary" data-build="${type}">Build · ${fmtMoney(cost)}</button></div>`;
        }).join('')}
        <div class="card fac"><div class="hd"><div class="ic">💠</div><div><div class="nm">Chip Fab</div><div class="tiny faint">${owned.filter(f => f.type === 'fab').length} owned</div></div></div>
          <div class="small dim">${FACTORY_TYPES.fab.desc}</div>
          <div class="field"><span class="lbl">Process node</span><select id="fabNode">${fabNodes.map(n => `<option value="${n.nm}" ${n.nm === this.fabNode ? 'selected' : ''}>${nodeLabel(n.nm)}${n.year > t ? ' ◆ ahead of foundries' : ''}</option>`).join('')}</select></div>
          <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(factoryBuildCost('fab', fn.nm))}</span>
            <span class="k">Upkeep</span><span class="v">${fmtMoney(fn.fab * 0.004 * perk('upkeepMul', 1))}/mo</span>
            <span class="k">Capacity</span><span class="v">${fmtNum(FACTORY_TYPES.fab.cap)} wafers/mo</span>
            <span class="k">Your wafer cost</span><span class="v good">${fmtMoney(fn.wafer * 0.3)} <span class="faint">vs ${fmtMoney(waferPrice(fn, t))}</span></span></div>
          <button class="btn primary" data-build="fab">Build ${nodeLabel(fn.nm)} fab</button></div>
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
      const off = e.target.closest('[data-off]');
      if (off && e.target.closest('[data-acc]')) { if (report(acceptOffer(off.dataset.off))) renderCurrent(true); return; }
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

// ---- Research: tech tree -------------------------------------------------------------------------
const Research = {
  name: 'Research', icon: '🔬', cat: 'network', mode: 'tree', filter: 'next', sel: null, _scrollToNow: true,
  render(el) {
    const slots = researchSlots(), spd = researchSpeed(), t = now();
    const counts = { done: 0, available: 0 };
    for (const tc of TECHS) { const s = techState(tc); if (s === 'done') counts.done++; if (s === 'available') counts.available++; }
    const catCounts = Object.fromEntries(Object.keys(TECH_CATS).map(c => [c, TECHS.filter(tc => tc.cat === c && techState(tc) === 'available').length]));
    el.innerHTML = `
      <div class="view-title"><h1>🔬 Research</h1><p>Every part, network, feature and size step must be researched before you can use it. Being first is expensive and exclusive – catching up is cheap.</p></div>
      <div class="grid g4 mb">
        <div class="kpi"><div class="l">Research slots</div><div class="v">${S.research.length} / ${slots}</div><div class="d dim">R&D Centers add more</div></div>
        <div class="kpi"><div class="l">Research speed</div><div class="v">${Math.round(spd * 100)}%</div><div class="d dim">+25% per R&D Center level</div></div>
        <div class="kpi"><div class="l">Researched</div><div class="v">${counts.done} / ${TECHS.length}</div><div class="d dim">${counts.available} available now</div></div>
        <div class="kpi"><div class="l">Exclusive tech</div><div class="v excl">${TECHS.filter(tc => S.researched[tc.id] && t < tc.market && !tc.never).length}</div><div class="d dim">yours before the industry</div></div>
      </div>
      ${S.research.length ? `<div class="card mb"><h2>In progress</h2>${S.research.map(r => {
        const tc = TECH[r.id];
        return `<div class="row wrap" style="padding:5px 0"><b class="rs-prog-name">${TECH_CATS[tc.cat].icon} ${tc.name}</b><div class="grow" style="min-width:120px">${meter(r.progress / r.days)}</div><span class="small dim nowrap">${r.days - r.progress} days left</span></div>`;
      }).join('')}</div>` : ''}
      <div class="row wrap mb">${segBtn('rcat', Object.entries(TECH_CATS).map(([k, c]) => ({ v: k, label: `${c.icon} ${c.name}${catCounts[k] ? ` <span class="pill-n">${catCounts[k]}</span>` : ''}` })), this.cat)}</div>
      <div class="row wrap mb between">${segBtn('rmode', [{ v: 'tree', label: '🌳 Tree' }, { v: 'list', label: '☰ List' }], this.mode)}
        ${this.mode === 'list' ? segBtn('rsf', [{ v: 'next', label: 'Available & upcoming' }, { v: 'all', label: 'Everything' }], this.filter) : '<span class="tiny faint">Scroll sideways through time · click a node</span>'}</div>
      <div class="tiny faint mb">${TECH_CATS[this.cat].note}</div>
      ${this.mode === 'tree' ? `<div class="tree-wrap card" id="treeWrap">${this.tree()}</div><div id="treeInfo" class="mt">${this.sel ? this.card(TECH[this.sel]) : ''}</div>` : this.list()}`;
    const tw = $('#treeWrap');
    if (tw && this._scrollToNow) {
      const x = this._nowX || 0;
      tw.scrollLeft = Math.max(0, x - tw.clientWidth * 0.2);
      this._scrollToNow = false;
    }
    el.onclick = e => {
      const b = e.target.closest('[data-rs]');
      if (b) { if (report(startResearch(b.dataset.rs))) { toast('Research started: ' + TECH[b.dataset.rs].name, 'good'); renderCurrent(true); renderNav(); } return; }
      const lic = e.target.closest('[data-lic]');
      if (lic) { confirmBox('License ' + esc(TECH[lic.dataset.lic].name) + '?', 'Rivals get to use it too – you lose your exclusive edge – but they pay you royalties every month until it becomes industry standard.', 'License it', () => { report(licenseTech(lic.dataset.lic)); renderCurrent(true); }); return; }
      const node = e.target.closest('[data-node]');
      if (node) { this.sel = node.dataset.node; $('#treeInfo').innerHTML = this.card(TECH[this.sel]); $$('.tnode', el).forEach(n => n.classList.toggle('sel', n.dataset.node === this.sel)); return; }
      const sb = e.target.closest('.segbtn button');
      if (sb) {
        const seg = sb.parentElement.dataset.seg;
        if (seg === 'rcat') { this.cat = sb.dataset.v; this.sel = null; this._scrollToNow = true; }
        if (seg === 'rmode') { this.mode = sb.dataset.v; this._scrollToNow = true; }
        if (seg === 'rsf') this.filter = sb.dataset.v;
        renderCurrent(true);
      }
    };
  },
  tree() {
    const list = TECHS.filter(tc => tc.cat === this.cat && !tc.never).sort((a, b) => a.market - b.market);
    const never = TECHS.filter(tc => tc.cat === this.cat && tc.never);
    const y0 = Math.max(Math.min(...list.map(tc => Math.floor(tc.market))) - 1, Math.floor(S.start) - 3), y1 = Math.max(2030, ...list.map(tc => Math.ceil(tc.market))) + 1;
    const PX = 64, NW = 150, NH = 34, GAP = 8, TOP = 26;
    // greedy lanes: a node takes the first lane that is free at its x
    const lanes = [];
    const pos = {};
    for (const tc of list) {
      const x = Math.max(0, (tc.market - y0) * PX);
      let lane = lanes.findIndex(end => end + 10 <= x);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = x + NW;
      pos[tc.id] = { x, y: TOP + lane * (NH + GAP) };
    }
    const W = (y1 - y0) * PX + NW, H = TOP + Math.max(1, lanes.length) * (NH + GAP) + 10;
    const t = now();
    this._nowX = (t - y0) * PX;
    let svg = `<svg class="tree" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (let y = Math.ceil(y0); y <= y1; y++) {
      const x = (y - y0) * PX;
      svg += `<line x1="${x}" y1="18" x2="${x}" y2="${H}" class="${y % 10 === 0 ? 'gl10' : 'gl'}"/>`;
      if (y % 2 === 0 || PX > 50) svg += `<text x="${x + 3}" y="13" class="yr">${y}</text>`;
    }
    svg += `<rect x="0" y="18" width="${Math.max(0, this._nowX)}" height="${H - 18}" class="past"/><line x1="${this._nowX}" y1="16" x2="${this._nowX}" y2="${H}" class="nowl"/><text x="${this._nowX + 4}" y="${H - 4}" class="nowt">now</text>`;
    // edges
    for (const tc of list) for (const r of tc.req.concat(tc.reqAny || [])) {
      const a = pos[r], b = pos[tc.id];
      if (!a || !b) continue;
      const x1 = a.x + NW, y1e = a.y + NH / 2, x2 = b.x, y2e = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1e} C${Math.max(x1 + 10, mx)},${y1e} ${Math.min(x2 - 10, mx)},${y2e} ${x2},${y2e}" class="edge ${S.researched[r] ? 'done' : ''} ${(tc.reqAny || []).includes(r) ? 'any' : ''}"/>`;
    }
    svg += '</svg>';
    let html = `<div class="tree-inner" style="width:${W}px;height:${H}px">${svg}`;
    for (const tc of list) {
      const p = pos[tc.id], st = techState(tc);
      const ex = st === 'done' && t < tc.market;
      const cross = tc.req.concat(tc.reqAny || []).filter(r => !pos[r]);
      html += `<div class="tnode ${st} ${ex ? 'ex' : ''} ${this.sel === tc.id ? 'sel' : ''}" data-node="${tc.id}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px" title="${esc(tc.desc)}">
        <span class="tn-name">${esc(tc.name)}</span><span class="tn-sub">${st === 'done' ? (ex ? '◆ exclusive' : '✓') : st === 'active' ? 'researching…' : st === 'available' ? fmtMoney(researchCost(tc)) : st === 'future' ? 'opens ' + Math.floor(tc.market - tc.lead) : '🔒'}${cross.length ? ' · ' + cross.map(r => TECH_CATS[TECH[r].cat].icon).join('') : ''}</span></div>`;
    }
    html += '</div>';
    if (never.length) html += `<div class="row wrap mt-s">${never.map(tc => `<button class="btn sm" data-node="${tc.id}">${esc(tc.name)}</button>`).join('')}</div>`;
    return html;
  },
  list() {
    let list = TECHS.filter(tc => tc.cat === this.cat).sort((a, b) => (a.never ? a.opens : a.market) - (b.never ? b.opens : b.market));
    if (this.filter === 'next') list = list.filter(tc => techState(tc) !== 'done').slice(0, 18);
    return `<div class="rs-grid">${list.map(tc => this.card(tc)).join('') || '<div class="dim small">Everything here is researched.</div>'}</div>`;
  },
  card(tc) {
    if (!tc) return '';
    const st = techState(tc), t = now();
    let foot = '';
    if (st === 'available') foot = `<button class="btn sm primary" data-rs="${tc.id}">Research · ${fmtMoney(researchCost(tc))} · ${researchDays(tc)}d</button>`;
    else if (st === 'active') foot = '<span class="tag acc">in progress</span>';
    else if (st === 'done') foot = !tc.never && t < tc.market && TECH_CATS[tc.cat].factory ? (S.licensed[tc.id] ? `<span class="tag excl">licensed · ${fmtMoney(S.licensed[tc.id].monthly)}/mo</span>` : `<span class="tag excl">◆ exclusive until ${dateLabel(tc.market)}</span> <button class="btn sm" data-lic="${tc.id}" title="Earn royalties from rivals">License</button>`) : '<span class="tag good">researched</span>';
    else if (st === 'future') foot = `<span class="tag">opens ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}</span>`;
    else foot = `<span class="tag warn">needs ${esc(missingReqs(tc).join(', '))}</span>`;
    const when = tc.never ? 'In-house only' : t < tc.market ? `Standard ${dateLabel(tc.market)} – researching now makes it exclusive` : `Industry standard since ${dateLabel(tc.market)}`;
    return `<div class="rs ${st}"><div class="row between"><span class="nm">${TECH_CATS[tc.cat].icon} ${tc.name}</span><span class="tiny faint">${tc.never ? '' : Math.floor(tc.market)}</span></div>
      <div class="ds">${tc.desc}</div><div class="tiny faint">${when}</div><div class="rs-foot">${foot}</div></div>`;
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
    const brands = [{ id: 'you', name: S.company, color: '#6aa8ff' }].concat(RIVALS.filter(r => r.start[cat] != null && r.start[cat] <= t + 1 && (!r.end || t < r.end + 2)).map(r => ({ id: r.id, name: r.name, color: r.color })));
    const total = marketSize(cat, t);
    const phones = [];
    for (const r of S.rivalPhones) if (r.active && r.cat === cat) { const rv = RIVALS.find(x => x.id === r.rival); phones.push({ name: r.name, brand: rv.name, color: rv.color, price: r.price, seg: r.seg, q: r.q, demand: r.demand || 0, launch: r.launch, subs: r.subs, form: r.form, yourChip: !!r.playerChip, spec: r.spec }); }
    for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat) phones.push({ name: p.name, brand: S.company, color: '#6aa8ff', mine: true, price: p.price, seg: segmentForPrice(cat, p.price, t), q: p.q, demand: p.demand || 0, launch: p.launch, subs: p.subs, form: formOf(p.spec) });
    const list = phones.filter(p => this.seg === 'all' || p.seg === this.seg).sort((a, b) => b.demand - a.demand);
    const split = segSplit(t), reg = regionShares(t);
    const fs = flagshipSpec(cat, t), fev = evalPhone(fs, t, vendorChipById(fs.chip.id));
    el.innerHTML = `
      <div class="view-title"><h1>📊 Market</h1><p>Who sells what, to whom, on which networks – and what buyers expect right now.</p></div>
      <div class="row mb">${segBtn('mcat', [{ v: 'phone', label: '📱 Phones' }, { v: 'tablet', label: '📟 Tablets' }], cat)}</div>
      <div class="grid g2">
        <div class="card"><h2>Market share <span class="sub">${fmtNum(total)} units / month</span></h2>
          ${by ? '<div class="bars">' + brands.map(b => ({ b, v: (by[b.id] || 0) / by.total })).sort((a, c) => c.v - a.v).map(({ b, v }) => `<div class="bar" style="grid-template-columns:110px 1fr 54px"><span class="${b.id === 'you' ? '' : 'dim'}"><span class="swatch" style="background:${b.color}"></span>${esc(b.name)}</span><div class="track"><div class="fill" style="width:${clamp(v * 250, 0, 100)}%;background:${b.color}"></div></div><b class="right mono">${fmtPct(v)}</b></div>`).join('') + '</div>' : '<div class="dim">Data after the first month.</div>'}
          <canvas class="chart mt" id="shareChart"></canvas>${legend(brands)}
        </div>
        <div class="card"><h2>What a flagship looks like today</h2>
          <div class="spec-list">
            <span class="k">Form factor</span><span class="v">${FORMS[formOf(fs)].icon} ${FORMS[formOf(fs)].name}</span>
            <span class="k">Size</span><span class="v">${Math.round(fev.geom.H)} × ${Math.round(fev.geom.W)} × ${fev.geom.T.toFixed(1)} mm · ${fmtWeight(fev.weight)}</span>
            <span class="k">Chip</span><span class="v">${esc(vendorChipById(fs.chip.id).name)} (${nodeLabel(vendorChipById(fs.chip.id).nm)})</span>
            <span class="k">Display</span><span class="v">${esc(partSummary('display', fs.display.p))}</span>
            <span class="k">Camera</span><span class="v">${fs.cams.main ? esc(partSummary('camera', fs.cams.main.p)) : 'none yet'}${fs.cams.ultra ? ' + ultra-wide' : ''}${fs.cams.tele ? ' + tele' : ''}</span>
            <span class="k">Battery</span><span class="v">${fs.battery ? esc(partSummary('battery', fs.battery.p)) + ' · ' + (fev.hours || 0).toFixed(1) + ' h' : 'car power'}</span>
            <span class="k">Memory</span><span class="v">${esc(partSummary('memory', fs.memory.p))}</span>
            <span class="k">Network</span><span class="v">${esc(partSummary('radio', fs.radio.p))}</span>
            <span class="k">Software</span><span class="v">${OS[fs.os].name}</span>
          </div>
          <h3>Buyer segments</h3>
          <table class="tbl"><thead><tr><th>Segment</th><th class="num">Budget</th><th class="num">Buyers / mo</th><th>Cares most about</th></tr></thead><tbody>
            ${SEGMENTS.map((sg, i) => { const w = segWeights(sg, t); const top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 3).map(k => SUB_LABELS[k]).join(', '); return `<tr><td>${SEG_INFO[sg].name}</td><td class="num">${fmtMoney(segBudget(cat, sg, t))}</td><td class="num">${fmtNum(total * split[i])}</td><td class="dim">${top}</td></tr>`; }).join('')}
          </tbody></table>
          <h3>Form factor trends</h3>
          <div class="cluster">${PHONE_FORMS.filter(f => t >= techMarket(FORMS[f].tech) - 0.01).map(f => `<span class="pill">${FORMS[f].icon} ${FORMS[f].name} <b>${Math.round(formAppeal(f, t) * 100)}%</b></span>`).join('')}</div>
        </div>
      </div>
      <div class="card mt"><h2>📡 Networks around the world</h2>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Region</th><th class="num">Buyers</th><th>Carriers & live networks</th></tr></thead><tbody>
          ${REGION_ORDER.filter(r => reg[r] > 0.001).map(r => `<tr><td>${REGIONS[r].icon} <b>${REGIONS[r].name}</b></td><td class="num">${fmtPct(reg[r], 0)}</td><td class="small">${carrierShares(r, t).map(({ c, w }) => `<div><span class="dim">${esc(c.name)} (${fmtPct(w, 0)}):</span> ${Object.keys(c.stds).filter(s2 => netAvail(c.stds[s2], t) > 0).map(s2 => `<span class="tag ${netAvail(c.stds[s2], t) < 0.99 ? 'warn' : ''}" title="${esc(NET_STDS[s2].name)} · ${fmtPct(netAvail(c.stds[s2], t), 0)} rolled out">${NET_STDS[s2].short}</span>`).join(' ') || '<span class="faint">none</span>'}</div>`).join('')}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="tiny faint mt-s">Your phones only sell to buyers whose carrier runs a standard your radio supports. Amber = still rolling out or shutting down.</div>
      </div>
      <div class="card mt"><h2>Devices on sale <span class="sub">${segBtn('mseg', [{ v: 'all', label: 'All' }].concat(SEGMENTS.map(sg => ({ v: sg, label: SEG_INFO[sg].name }))), this.seg)}</span></h2>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Device</th><th>Brand</th><th>Segment</th><th class="num">Price</th><th class="num">Quality</th>${Object.keys(SUB_LABELS).map(k => `<th class="num" title="${SUB_LABELS[k]}">${SUB_ICONS[k]}</th>`).join('')}<th class="num">Sales/mo</th><th class="num">Launched</th></tr></thead><tbody>
          ${list.slice(0, 60).map(p => `<tr class="${p.mine ? 'mine' : ''}" title="${p.spec ? esc(`${p.spec.dims} · ${p.spec.weight} g · ${p.spec.display} · ${p.spec.cam} · ${p.spec.battery} · ${p.spec.radio}`) : ''}"><td><b>${FORMS[p.form || 'touch'].icon} ${esc(p.name)}</b>${p.yourChip ? ' <span class="tag excl" title="Uses your chip">your chip</span>' : ''}</td><td><span class="swatch" style="background:${p.color}"></span>${esc(p.brand)}</td><td>${SEG_INFO[p.seg].name}</td>
            <td class="num">${fmtMoney(p.price)}</td><td class="num"><b>${p.q ? Math.round(p.q[p.seg]) : '—'}</b></td>
            ${Object.keys(SUB_LABELS).map(k => `<td class="num dim">${p.subs ? Math.round(p.subs[k]) : '—'}</td>`).join('')}
            <td class="num">${fmtNum(p.demand)}</td><td class="num dim">${p.launch ? dateLabel(p.launch) : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card mt"><h2>Off-the-shelf chips</h2>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Chip</th><th>Tier</th><th>Node</th><th class="num">CPU</th><th class="num">GPU</th><th class="num">AI</th><th class="num">Power</th><th>Modem</th><th class="num">Price</th><th class="num">Released</th></tr></thead><tbody>
          ${vendorChipsAvailable(t).sort((a, b) => b.release - a.release).map(c => `<tr><td>${c.name}</td><td><span class="tag">${c.tier}</span></td><td>${nodeLabel(c.nm)}</td><td class="num">${fmtSci(c.cpu)}</td><td class="num">${c.gpu ? fmtSci(c.gpu) : '—'}</td><td class="num">${c.tops ? c.tops.toFixed(1) : '—'}</td><td class="num">${c.power.toFixed(2)} W</td><td>${c.hasModem ? GEN_LABEL(c.modemGen) : c.dsp ? 'DSP' : '—'}</td><td class="num">${fmtMoney(vendorChipPrice(c, t))}</td><td class="num dim">${dateLabel(c.release)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    const hist = S.shareHist.slice(-240);
    drawChart($('#shareChart'), brands.map(b => ({ name: b.name, color: b.color, width: b.id === 'you' ? 3 : 1.5, data: hist.map(h => [h.t, (h[cat][b.id] || 0) / h[cat].total * 100]) })), { yFmt: v => v.toFixed(0) + '%' });
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

// ---- Benchmarks ----------------------------------------------------------------------------------
const BENCH_COLS = [
  ['mark', 'PhoneMark', v => Math.round(v), 'Overall: 1,000 = today\'s flagship'],
  ['cpu', 'CPU', fmtSci, 'CoreMark multi-core'], ['single', 'CPU 1-core', fmtSci, 'Single-core'], ['gpu', 'Graphics', fmtSci, 'GFLOPS at the screen\'s resolution'],
  ['ai', 'AI', v => (v ? v.toFixed(1) : '—'), 'TOPS'], ['cam', 'Camera', v => (v ? Math.round(v) : '—'), 'CameraMark'], ['disp', 'Display', v => Math.round(v), 'DisplayMark'],
  ['batt', 'Battery', v => (v == null ? '∞' : v.toFixed(1) + ' h'), 'Mixed-use hours'], ['charge', 'Charge', v => (v == null ? '—' : Math.round(v) + ' min'), '0–100%', true],
  ['net', 'Download', fmtSpeed, 'Real-world speed'], ['cov', 'Coverage', v => fmtPct(v, 0), 'Share of world buyers it works for'],
  ['stor', 'Storage', v => (v ? Math.round(v) + ' MB/s' : '—'), 'Sequential read'], ['weight', 'Weight', fmtWeight, 'Lighter is better', true], ['thick', 'Thickness', v => v.toFixed(1) + ' mm', '', true],
];
const Benchmarks = {
  name: 'Benchmarks', icon: '🏁', sort: 'mark', cat: 'phone',
  render(el) {
    const t = now(), cat = this.cat;
    const rows = [];
    for (const r of S.rivalPhones) if (r.active && r.cat === cat && r.bench && r.subs) { const rv = RIVALS.find(x => x.id === r.rival); rows.push({ name: r.name, brand: rv.name, color: rv.color, b: r.bench, subs: r.subs, price: r.price }); }
    for (const p of S.products) if (p.status !== 'retired' && p.spec.cat === cat && p.bench && p.subs) rows.push({ name: p.name, brand: S.company, color: '#6aa8ff', mine: true, b: p.bench, subs: p.subs, price: p.price, dev: p.status === 'dev' });
    if (S.draft && S.draft.cat === cat) {
      try {
        const chip = chipFor(S.draft);
        if (chip) { const ev = evalPhone(S.draft, t, chip); rows.push({ name: (S.draft.name || 'Draft') + ' (draft)', brand: S.company, color: '#8b7bff', mine: true, draft: true, b: ev.bench, subs: subscores(ev.raw, cat, t), price: S.draft.price }); }
      } catch (e) { /* draft incomplete */ }
    }
    const w = segWeights('premium', t);
    for (const r of rows) r.b = Object.assign({}, r.b, { mark: 10 * Object.keys(w).reduce((a, k) => a + w[k] * softCap(r.subs[k]), 0) });
    const col = BENCH_COLS.find(c => c[0] === this.sort);
    const lower = col[4];
    rows.sort((a, b) => {
      const va = a.b[this.sort], vb = b.b[this.sort];
      if (va == null && vb == null) return 0;
      if (va == null) return lower ? 1 : -1;
      if (vb == null) return lower ? -1 : 1;
      return lower ? va - vb : vb - va;
    });
    const best = {};
    for (const c of BENCH_COLS) {
      const vals = rows.filter(r => !r.draft).map(r => r.b[c[0]]).filter(v => v != null && (c[4] || v > 0));
      if (!vals.length) continue;
      const top = c[4] ? Math.min(...vals) : Math.max(...vals);
      if (vals.filter(v => Math.abs(v - top) <= Math.abs(top) * 1e-6).length <= 2) best[c[0]] = top;   // ties are not crowns
    }
    el.innerHTML = `
      <div class="view-title"><h1>🏁 Benchmarks</h1><p>Every device on sale, measured the same way. Reviewers and buyers read these charts – click a column to rank by it.</p></div>
      <div class="row mb">${segBtn('bcat', [{ v: 'phone', label: '📱 Phones' }, { v: 'tablet', label: '📟 Tablets' }], cat)}</div>
      <div class="card"><div class="scroll-x"><table class="tbl bench"><thead><tr><th>#</th><th>Device</th><th class="num">Price</th>${BENCH_COLS.map(c => `<th class="num click ${this.sort === c[0] ? 'sorted' : ''}" data-sort="${c[0]}" title="${esc(c[3])}">${c[1]}${this.sort === c[0] ? ' ▾' : ''}</th>`).join('')}</tr></thead><tbody>
        ${rows.map((r, i) => `<tr class="${r.mine ? 'mine' : ''} ${r.draft ? 'draft' : ''}"><td class="dim">${i + 1}</td><td class="nowrap"><span class="swatch" style="background:${r.color}"></span><b>${esc(r.name)}</b><div class="tiny faint">${esc(r.brand)}${r.dev ? ' · in development' : ''}</div></td>
          <td class="num">${fmtMoney(r.price)}</td>${BENCH_COLS.map(c => { const v = r.b[c[0]]; const top = v != null && best[c[0]] != null && Math.abs(v - best[c[0]]) <= Math.abs(best[c[0]]) * 1e-6 && !r.draft; return `<td class="num nowrap ${top ? 'crown' : ''}">${v == null && c[0] !== 'batt' ? '—' : c[2](v)}${top ? ' 👑' : ''}</td>`; }).join('')}</tr>`).join('') || '<tr><td colspan="16" class="dim">No devices on sale yet.</td></tr>'}
      </tbody></table></div>
      <div class="tiny faint mt-s">👑 = best on sale. Your current Phone Lab draft is listed in purple so you can see where it would land.</div></div>`;
    el.onclick = e => {
      const th = e.target.closest('[data-sort]');
      if (th) { this.sort = th.dataset.sort; renderCurrent(true); return; }
      const b = e.target.closest('.segbtn button');
      if (b) { this.cat = b.dataset.v; renderCurrent(true); }
    };
  },
};
registerView('bench', Benchmarks);

// ---- Investors ----------------------------------------------------------------------------------
const Investors = {
  name: 'Investors', icon: '💼',
  render(el) {
    const f = S.funding;
    const rounds = ROUNDS.map(rd => ({ rd, info: roundInfo(rd) }));
    el.innerHTML = `
      <div class="view-title"><h1>💼 Investors</h1><p>Sell a slice of the company for the cash to grow. Every round needs proof you're worth it.</p></div>
      <div class="grid g4 mb">
        <div class="kpi"><div class="l">You own</div><div class="v">${fmtPct(S.own, 1)}</div><div class="d dim">of ${esc(S.company)}</div></div>
        <div class="kpi"><div class="l">Raised so far</div><div class="v">${fmtMoney(Object.values(f.done).reduce((a, r) => a + r.amount, 0))}</div><div class="d dim">${Object.keys(f.done).length} rounds</div></div>
        <div class="kpi"><div class="l">Your stake</div><div class="v">${fmtMoney(Math.max(0, netWorth()) * S.own)}</div><div class="d dim">net worth × ownership</div></div>
        <div class="kpi"><div class="l">Loans</div><div class="v">${fmtMoney(S.debt)}</div><div class="d dim">${fmtMoney(loanLimit())} more available</div></div>
      </div>
      ${f.offer ? `<div class="card mb" style="border-color:var(--good)"><h2>💼 Offer on the table</h2>
        <p><b>${esc(f.offer.investor)}</b> offers <b class="good">${fmtMoney(f.offer.amount)}</b> for <b>${fmtPct(f.offer.equity, 1)}</b> of the company
          (a ${fmtMoney(f.offer.amount / f.offer.equity)} valuation). After the deal you would own ${fmtPct(S.own * (1 - f.offer.equity), 1)}.</p>
        <div class="row mt"><button class="btn good" data-yes>Accept</button><button class="btn danger" data-no>Decline</button><span class="tiny faint">Expires in ${f.offer.expires - S.day} days.</span></div></div>` : ''}
      ${f.pitch ? `<div class="note mb">🗣️ Pitching the ${ROUNDS.find(r => r.id === f.pitch.round).name}: answer in ${f.pitch.until - S.day} days.</div>` : ''}
      <div class="card"><h2>Funding rounds</h2>
        ${rounds.map(({ rd, info }) => {
          const fs = fundScale();
          const range = rd.need === 'ipo' ? 'sell 15–20% to the public' : `${fmtMoney(rd.min * fs)}–${fmtMoney(rd.max * fs)} for ${Math.round(rd.eq[0] * 100)}–${Math.round(rd.eq[1] * 100)}%`;
          let action;
          if (info.done) action = `<span class="tag good">raised ${fmtMoney(f.done[rd.id].amount)} for ${fmtPct(f.done[rd.id].equity, 0)}</span>`;
          else if (info.blocked) action = '<span class="tag">skipped</span>';
          else if (info.cool) action = `<span class="tag warn">try again in ${info.cool} d</span>`;
          else action = `<button class="btn sm primary" data-pitch="${rd.id}" ${info.ok && !f.pitch && !f.offer ? '' : 'disabled'}>Pitch · ${rd.days} days</button>`;
          return `<div class="round"><div><b>${rd.name}</b> <span class="small dim">· ${range}</span>
            <div class="tiny ${info.ok || info.done ? 'faint' : 'warn'}">${info.done ? 'Closed ' + dateLabel(f.done[rd.id].t) + ' with ' + esc(f.done[rd.id].investor) : info.need}</div>
            ${!info.done && !info.blocked && info.progress < 1 ? `<div style="max-width:260px" class="mt-s">${meter(info.progress)}</div>` : ''}</div>${action}</div>`;
        }).join('')}
        <div class="tiny faint mt-s">Investors look at your prototype reviews early on, then at monthly revenue, growth and reputation. During market crashes they are much harder to convince.</div>
      </div>
      <div class="card mt"><h2>🏦 Bank loans</h2>
        <div class="spec-list"><span class="k">Outstanding</span><span class="v">${fmtMoney(S.debt)}</span><span class="k">Available</span><span class="v">${fmtMoney(loanLimit())}</span><span class="k">Rate</span><span class="v">${(loanRate() * 100).toFixed(0)}% APR</span></div>
        <div class="row wrap mt">${[1e3, 10e3, 100e3, 1e6, 10e6, 100e6, 1e9].filter(v => v <= Math.max(1e3, loanLimit() * 1.0001)).map(v => `<button class="btn sm" data-borrow="${v}" ${loanLimit() < 1 ? 'disabled' : ''}>Borrow ${fmtMoney(Math.min(v, loanLimit()))}</button>`).join('')}
          <button class="btn sm" data-repay ${S.debt > 0 && S.cash > 0 ? '' : 'disabled'}>Repay ${fmtMoney(Math.min(S.debt, Math.max(0, S.cash)))}</button></div>
        <div class="tiny faint mt-s">Banks lend against your assets and revenue – keeps your ownership, but interest is due every month.</div>
      </div>`;
    el.onclick = e => {
      const p = e.target.closest('[data-pitch]');
      if (p) { if (report(startPitch(p.dataset.pitch))) toast('Meetings booked!', 'good'); renderCurrent(true); return; }
      if (e.target.closest('[data-yes]')) { answerOffer(true); renderCurrent(true); renderNav(); }
      if (e.target.closest('[data-no]')) { answerOffer(false); renderCurrent(true); renderNav(); }
      const b = e.target.closest('[data-borrow]');
      if (b) { borrow(+b.dataset.borrow); renderCurrent(true); }
      if (e.target.closest('[data-repay]')) { repay(S.debt); renderCurrent(true); }
    };
  },
};
registerView('investors', Investors);

// ---- Finance -----------------------------------------------------------------------------------
const Finance = {
  name: 'Finance', icon: '💰',
  render(el) {
    const h = S.history.slice(-12);
    const rows = [['Device sales (after retail cut)', 'revenue', 1], ['From other brands (contracts, chips, royalties)', 'b2b', 1], ['Spare capacity sales', 'spare', 1],
      ['Cost of devices sold', 'sold', -1], ['Contract & chip production', 'cogs', -1], ['Manufacturer line fees', 'lines', -1], ['Factory upkeep', 'upkeep', -1], ['Research', 'rnd', -1], ['Development, tooling & tape-outs', 'dev', -1],
      ['Marketing', 'marketing', -1], ['Overhead & staff', 'overhead', -1], ['Interest', 'interest', -1], ['Penalties & recalls', 'penalty', -1], ['Corporate tax (22%)', 'tax', -1]];
    const mkt = marketSize('phone', now()) * segBudget('phone', 'mid', now());
    const maxMk = Math.max(5e3, Math.ceil(Math.max(avgRevenue() * 0.3, mkt * 0.004, S.marketing * 1.5) / 1e3) * 1e3);
    el.innerHTML = `
      <div class="view-title"><h1>💰 Finance</h1><p>Cash is king: you pay for parts as phones are built, and get paid when they sell.</p></div>
      <div class="grid g4">
        <div class="kpi"><div class="l">Cash</div><div class="v ${S.cash < 0 ? 'bad' : ''}">${fmtMoney(S.cash)}</div><div class="d dim">overdraft limit ${fmtMoney(creditLimit())}</div></div>
        <div class="kpi"><div class="l">Debt</div><div class="v">${fmtMoney(S.debt)}</div><div class="d dim">${(loanRate() * 100).toFixed(0)}% APR · loans in 💼 Investors</div></div>
        <div class="kpi"><div class="l">Assets</div><div class="v">${fmtMoney(factoryValue() + inventoryValue())}</div><div class="d dim">factories ${fmtMoney(factoryValue())} · stock ${fmtMoney(inventoryValue())}</div></div>
        <div class="kpi"><div class="l">Net worth</div><div class="v">${fmtMoney(netWorth())}</div><div class="d dim">cash − debt + assets</div></div>
      </div>
      ${S.cash < 0 ? `<div class="note bad mt">⚠️ You are overdrawn (18% interest). Stay below −${fmtMoney(creditLimit())} for 90 days and the company goes bankrupt. ${S.overdraftDays ? `<b>${90 - S.overdraftDays} days left.</b>` : ''}</div>` : ''}
      <div class="card mt"><h2>📣 Marketing</h2>
        <div class="field"><span class="lbl">Monthly budget</span><div class="row"><input type="range" id="mk" min="0" max="${maxMk}" step="${Math.max(100, maxMk / 200)}" value="${Math.min(S.marketing, maxMk)}"><span class="val" id="mkVal">${fmtMoney(S.marketing)}</span></div></div>
        <div class="small dim mt-s">Ads, retail placement and sponsorships raise brand awareness (now <b>${fmtPct(S.aware)}</b>). It fades ~2.5% per month without support; happy customers spread the word. Big rivals sit at 30–90%. The whole market spends about ${fmtMoney(mkt)} a month on phones.</div>
      </div>
      <div class="card mt"><h2>Profit & loss <span class="sub">last ${h.length} months</span></h2>
        ${h.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th></th>${h.map(m => `<th class="num">${dateLabel(m.t)}</th>`).join('')}</tr></thead><tbody>
          ${rows.filter(([, k]) => h.some(m => m[k])).map(([label, k, sg]) => `<tr><td class="dim nowrap">${label}</td>${h.map(m => `<td class="num ${sg < 0 && m[k] ? 'bad' : ''}">${m[k] ? (sg < 0 ? '−' : '') + fmtMoney(Math.abs(m[k])) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td><b>Profit</b></td>${h.map(m => `<td class="num ${m.profit >= 0 ? 'good' : 'bad'}"><b>${fmtMoney(m.profit)}</b></td>`).join('')}</tr>
          <tr><td class="dim">Production spend (into stock)</td>${h.map(m => `<td class="num dim">${m.build ? fmtMoney(m.build) : '—'}</td>`).join('')}</tr>
          <tr><td class="dim">Factory construction</td>${h.map(m => `<td class="num dim">${m.capex ? fmtMoney(m.capex) : '—'}</td>`).join('')}</tr>
          <tr><td class="dim">Investment raised</td>${h.map(m => `<td class="num good">${m.funding ? fmtMoney(m.funding) : '—'}</td>`).join('')}</tr>
        </tbody></table></div>` : '<div class="dim">The first books close at the end of this month.</div>'}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>Revenue & profit</h2><canvas class="chart" id="pnlChart"></canvas>${legend([{ name: 'Revenue', color: '#6aa8ff' }, { name: 'Profit', color: '#43c88a' }])}</div>
        <div class="card"><h2>Net worth</h2><canvas class="chart" id="nwChart"></canvas>${legend([{ name: 'Net worth', color: '#f2cc5b' }, { name: 'Your stake', color: '#8b7bff' }])}</div>
      </div>`;
    const hh = S.history.slice(-300);
    drawChart($('#pnlChart'), [{ name: 'Revenue', color: '#6aa8ff', data: hh.map(m => [m.t, m.revenue + (m.b2b || 0) + (m.spare || 0)]), fill: 'rgba(106,168,255,.08)' }, { name: 'Profit', color: '#43c88a', data: hh.map(m => [m.t, m.profit]) }], { yFmt: v => fmtMoney(v) });
    drawChart($('#nwChart'), [{ name: 'Net worth', color: '#f2cc5b', data: hh.map(m => [m.t, m.worth]) }, { name: 'Your stake', color: '#8b7bff', data: hh.map(m => [m.t, Math.max(0, m.worth) * (m.own || 1)]) }], { yFmt: v => fmtMoney(v) });
    const mk = $('#mk');
    mk.oninput = () => { S.marketing = Math.round(+mk.value / 100) * 100; $('#mkVal').textContent = fmtMoney(S.marketing); };
    mk.onchange = () => toast(`Marketing budget: ${fmtMoney(S.marketing)}/month`);
  },
};
registerView('finance', Finance);
