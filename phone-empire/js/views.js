'use strict';
// ============================================================================
//  HQ, Production, Factories, Research, Market, Investors and Finance screens.
// ============================================================================

function lastMonth() { return S.history[S.history.length - 1] || emptyMonth(); }
function phoneShare() {
  const s = S.shareHist[S.shareHist.length - 1];
  return s ? s.phone.you / s.phone.total : 0;
}
// the next thing a new player should do, in order
function nextStep() {
  const ps = S.products, f = S.funding;
  if (!S.protos.length && !ps.length) return ['Design your first phone and build a prototype to show investors.', 'phonelab', 'Open Phone Lab'];
  if (!Object.keys(f.done).length && !f.pitch && !f.offer) return ['Raise money: pitch friends & family, then angels with your prototype.', 'investors', 'Find investors'];
  if (f.offer) return ['An investor made you an offer – answer it before it expires.', 'investors', 'See the offer'];
  if (!ps.length) return ['Develop and launch your device.', 'phonelab', 'Open Phone Lab'];
  if (!S.orders.length && !ps.some(p => p.inventory > 0)) return ['Order a production run from a contract manufacturer.', 'production', 'Go to Production'];
  if (!S.marketing) return ['Set a marketing budget – nobody buys a brand they have never heard of.', 'finance', 'Set marketing'];
  return null;
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
      ${step ? `<div class="note good mb row between"><span>👉 <b>Next step:</b> ${step[0]}</span><button class="btn sm primary" data-go="${step[1]}">${step[2]} →</button></div>` : ''}
      <div class="grid g4">
        <div class="kpi"><div class="l">Revenue last month</div><div class="v">${fmtMoney(m.revenue + (m.b2b || 0) + (m.spare || 0))}</div><div class="d dim">${fmtNum(m.units)} devices sold${m.b2b ? ' · ' + fmtMoney(m.b2b) + ' from other brands' : ''}</div></div>
        <div class="kpi"><div class="l">Profit last month</div><div class="v ${m.profit > 0 ? 'good' : m.profit < 0 ? 'bad' : ''}">${fmtMoney(m.profit || 0)}</div><div class="d dim">factories & funding not included</div></div>
        <div class="kpi"><div class="l">Your stake</div><div class="v">${fmtMoney(Math.max(0, netWorth()) * S.own)}</div><div class="d dim">${fmtPct(S.own, 1)} of a ${fmtMoney(netWorth())} company</div></div>
        <div class="kpi"><div class="l">Brand</div><div class="v">${fmtPct(S.aware)}</div><div class="d dim">awareness · reputation ${S.rep.toFixed(1)}/10 · share ${fmtPct(phoneShare(), 2)}</div></div>
      </div>
      ${ev.length ? `<div class="mt">${ev.map(e => `<div class="note warn">🌍 <b>${e.title}</b> — ${e.desc} (until ${dateLabel(e.end)})</div>`).join('')}</div>` : ''}
      <div class="card mt">
        <h2>Product line <span class="sub">prices can change any time · production in 📦 Production</span></h2>
        ${prods.length ? this.products(prods) : `<div class="note">No devices yet. Design one in the <b>📱 Phone Lab</b>.
          <div class="mt-s"><button class="btn primary" data-go="phonelab">Open Phone Lab →</button></div></div>`}
        ${S.protos.length ? `<div class="tiny faint mt-s">Prototypes: ${S.protos.slice(-5).map(x => `${esc(x.name)} ${x.review == null ? '(on the bench)' : x.review.toFixed(1) + '/10'}`).join(' · ')}</div>` : ''}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>📰 News</h2><div class="news">${S.news.slice(0, 60).map(n => `<div class="n ${n.kind}"><span class="d">${dateLabel(n.t)}</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>
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
    const t = now();
    return `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Device</th><th>Status</th><th class="num">Price</th><th class="num">Stock</th><th class="num">In production</th><th class="num">Demand/mo</th><th class="num">Sold last mo</th><th class="num">Unit cost</th><th class="num">Margin</th><th>Review</th><th class="num">Quality</th><th></th></tr></thead><tbody>
      ${prods.map(p => {
        const cost = p.unitCostLast || productCosts(p.spec, t, playerAv()).est;
        const margin = p.price * (1 - RETAIL_CUT) - cost;
        const seg = segmentForPrice(p.spec.cat, p.price);
        const pending = S.orders.filter(o => o.pid === p.id && !o.done).reduce((a, o) => a + o.qty - o.made, 0);
        const status = p.status === 'dev' ? `<span class="tag warn">dev ${p.devUntil - S.day}d</span>` : p.discontinued ? '<span class="tag">clearing stock</span>' : '<span class="tag good">on sale</span>';
        const flags = [];
        if (p.status === 'active' && p.inventory === 0 && p.demand > 0) flags.push('<span class="tag bad" title="No stock – buyers walk away">sold out</span>');
        if (p.autoMsg) flags.push(`<span class="tag warn" title="${esc(p.autoMsg)}">auto-order paused</span>`);
        return `<tr data-pid="${p.id}">
          <td><b>${FORMS[formOf(p.spec)].icon} ${esc(p.name)}</b><div class="tiny faint">${FORMS[formOf(p.spec)].name} · ${SEG_INFO[seg].name}</div></td>
          <td>${status} ${flags.join(' ')}</td>
          <td class="num"><input type="number" data-price value="${p.price}" min="19" max="3999" step="10" style="width:76px"></td>
          <td class="num">${fmtNum(p.inventory)}</td><td class="num">${pending ? fmtNum(pending) : '—'}</td>
          <td class="num">${p.status === 'active' ? fmtNum(p.demand || 0) : '~' + fmtNum(p.forecast || 0)}</td>
          <td class="num">${fmtNum(p.soldLastMonth || 0)}</td>
          <td class="num">${fmtMoney(cost)}</td>
          <td class="num ${margin >= 0 ? 'good' : 'bad'}">${fmtMoney(margin)}</td>
          <td>${reviewTag(p.review)}</td>
          <td class="num">${p.q ? Math.round(p.q[seg]) : '—'}</td>
          <td class="right" style="white-space:nowrap"><button class="btn sm" data-order>📦 Order</button> <button class="btn sm" data-detail>Details</button>${p.discontinued ? '' : ' <button class="btn sm danger" data-disc>End</button>'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="tiny faint mt-s">Quality is relative to today's flagship in the device's price segment – it falls as the industry moves on.</div>`;
  },
  bind(el) {
    el.onclick = e => {
      const go = e.target.closest('[data-go]');
      if (go) return showView(go.dataset.go);
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.closest('[data-disc]')) confirmBox('End ' + esc(p.name) + '?', 'No new production runs; remaining stock keeps selling until it runs out.', 'End production', () => { p.discontinued = true; p.auto.on = false; renderCurrent(true); });
      if (e.target.closest('[data-detail]')) productDetail(p);
      if (e.target.closest('[data-order]')) showOrderDialog(p);
    };
    el.onchange = e => {
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.dataset.price != null) { p.price = clamp(Math.round(+e.target.value) || p.price, 19, 3999); toast(`${p.name} now ${fmtMoney(p.price)}`); computeDemand(); }
      renderCurrent(true);
    };
  },
};
function productDetail(p) {
  const pc = productCosts(p.spec, now(), playerAv());
  const segs = p.segUnits || {};
  modal(`<h2>${FORMS[formOf(p.spec)].icon} ${esc(p.name)}</h2>
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
    <h3>Unit cost today (cheapest maker)</h3>
    <table class="tbl bom">${pc.comps.map(c => `<tr><td>${c.label}</td><td class="num">${fmtMoney((c.per || 1) * ((c.stock || c.pool) ? c.in : (c.buy != null ? c.buy : c.in)))}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="num"><b>${fmtMoney(pc.est)}</b></td></tr></table>
    <div class="actions"><button class="btn" data-copy>Use as template</button><button class="btn primary" data-x>Close</button></div>`, d => {
    $('[data-x]', d).onclick = closeModal;
    $('[data-copy]', d).onclick = () => { S.draft = JSON.parse(JSON.stringify(p.spec)); S.draft.name = p.name + ' II'; closeModal(); showView('phonelab'); };
  });
}
registerView('hq', HQ);

// ---- Production ----------------------------------------------------------------------------
const Production = {
  name: 'Production', icon: '📦',
  render(el) {
    const prods = S.products.filter(p => p.status !== 'retired');
    const open = S.orders.filter(o => !o.done);
    const t = now(), av = playerAv();
    el.innerHTML = `
      <div class="view-title"><h1>📦 Production</h1><p>Factories build your devices: hire contract manufacturers, or run your own lines. Stock sells; no stock, no sales.</p></div>
      <div class="card"><h2>Devices <span class="sub">auto re-order keeps ~1 month of stock</span></h2>
        ${prods.length ? `<table class="tbl"><thead><tr><th>Device</th><th class="num">Stock</th><th class="num">Demand/mo</th><th class="num">In production</th><th>Auto re-order</th><th></th></tr></thead><tbody>
          ${prods.map(p => {
            const pending = open.filter(o => o.pid === p.id).reduce((a, o) => a + o.qty - o.made, 0);
            const cover = p.demand > 0 ? (p.inventory / p.demand * 30) : null;
            return `<tr data-pid="${p.id}"><td><b>${esc(p.name)}</b><div class="tiny faint">${p.status === 'dev' ? 'in development' : p.discontinued ? 'discontinued' : 'on sale'}</div></td>
              <td class="num">${fmtNum(p.inventory)}${cover != null ? `<div class="tiny ${cover < 7 ? 'bad' : 'faint'}">${Math.round(cover)} days</div>` : ''}</td>
              <td class="num">${p.status === 'active' ? fmtNum(p.demand) : '~' + fmtNum(p.forecast || 0)}</td><td class="num">${pending ? fmtNum(pending) : '—'}</td>
              <td>${p.discontinued ? '—' : `<label class="chk small"><input type="checkbox" data-auto ${p.auto.on ? 'checked' : ''}> on</label>
                <select data-maker class="small"><option value="auto" ${p.auto.maker === 'auto' ? 'selected' : ''}>Best I can afford</option>${(factoryActive('assembly') ? ['own'] : []).concat(PARTNERS.map(x => x.id)).map(m => `<option value="${m}" ${p.auto.maker === m ? 'selected' : ''} ${makerProblem(m, p.spec, av) ? 'disabled' : ''}>${esc(makerName(m))}</option>`).join('')}</select>
                ${p.autoMsg ? `<div class="tiny warn">${esc(p.autoMsg)}</div>` : ''}`}</td>
              <td class="right"><button class="btn sm primary" data-order ${p.discontinued ? 'disabled' : ''}>New order</button></td></tr>`;
          }).join('')}</tbody></table>` : '<div class="dim">Launch a device first (📱 Phone Lab).</div>'}
      </div>
      <div class="card mt"><h2>Production runs <span class="sub">${open.length} open</span></h2>
        ${open.length ? `<table class="tbl"><thead><tr><th>Device</th><th>Maker</th><th class="num">Ordered</th><th style="min-width:160px">Progress</th><th>Status</th><th></th></tr></thead><tbody>
          ${open.map(o => {
            const p = S.products.find(x => x.id === o.pid);
            const status = S.day < o.startDay ? `starts in ${o.startDay - S.day} d` : p && p.status === 'dev' ? 'waiting for launch' : o.cashStalled ? '<span class="bad">waiting for cash</span>' : p && p.capLimited ? '<span class="warn">waiting for exclusive parts</span>' : 'building';
            return `<tr data-oid="${o.id}"><td>${esc(p ? p.name : '?')}</td><td>${esc(makerName(o.maker))}</td><td class="num">${fmtNum(o.qty)}</td>
              <td>${meter(o.made / o.qty, 'good')}<span class="tiny faint">${fmtNum(o.made)} built</span></td><td class="small">${status}</td>
              <td class="right">${o.made < o.qty ? '<button class="btn sm danger" data-cancel>Cancel</button>' : ''}</td></tr>`;
          }).join('')}</tbody></table>` : '<div class="dim">No production runs. Use “New order” above.</div>'}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>🏭 Manufacturers</h2>
          <table class="tbl"><thead><tr><th>Company</th><th class="num">Fee</th><th class="num">Min order</th><th class="num">Capacity/mo</th><th>Builds up to</th></tr></thead><tbody>
          ${factoryActive('assembly') ? `<tr><td><b>Your assembly line</b><div class="tiny faint">~${Math.round(ownAssemblyMul() * 100)}% of contract labor cost</div></td><td class="num">${Math.round(ownAssemblyMul() * 100)}%</td><td class="num">1</td><td class="num">${fmtNum(factoryPool('assembly'))}</td><td>anything you've researched</td></tr>` : ''}
          ${PARTNERS.map(pt => {
            const ok = t >= pt.since, need = pt.minRev * fundScale();
            return `<tr class="${ok ? '' : 'dim'}"><td><b>${esc(pt.name)}</b><div class="tiny faint">${ok ? esc(pt.desc) : 'Founded ' + Math.floor(pt.since)}${need > 0 ? ` · clients earning ${fmtMoney(need)}+/mo` : ''}</div></td>
              <td class="num">${Math.round(pt.fee * perk('feeMul', 1) * 100)}%</td><td class="num">${fmtNum(pt.moq)}</td><td class="num">${fmtNum(pt.cap)}</td><td>${TIER_NAMES[pt.tier]}</td></tr>`;
          }).join('')}</tbody></table>
          <div class="tiny faint mt-s">Fees are relative to the era's standard assembly price. Contract makers buy all parts from suppliers – except parts your own plants have in stock.</div>
        </div>
        <div class="card"><h2>🔩 Parts stock <span class="sub">made by your component plants</span></h2>
          ${STOCK_TYPES.some(k => factoryActive(k)) ? `<table class="tbl"><thead><tr><th>Part</th><th class="num">In stock</th><th class="num">Unit cost</th><th class="num">Plant capacity/mo</th></tr></thead><tbody>
            ${STOCK_TYPES.filter(k => factoryActive(k)).map(k => `<tr><td>${FACTORY_TYPES[k].icon} ${FACTORY_TYPES[k].unit}</td><td class="num">${fmtNum(S.stock[k].qty)}</td><td class="num">${fmtMoney(S.stock[k].cost)}</td><td class="num">${fmtNum(factoryPool(k))}</td></tr>`).join('')}
          </tbody></table><div class="tiny faint mt-s">Plants build parts ahead of your production runs. Leftover capacity is sold to other brands.</div>`
          : '<div class="dim small">You buy all parts from suppliers. Build a camera, battery, display or memory plant (🏭 Factories) to make your own – cheaper, and the only way to use exclusive tech before it is industry standard.</div>'}
        </div>
      </div>`;
    el.onclick = e => {
      const row = e.target.closest('[data-pid]');
      if (row && e.target.closest('[data-order]')) return showOrderDialog(S.products.find(x => x.id === row.dataset.pid));
      const orow = e.target.closest('[data-oid]');
      if (orow && e.target.closest('[data-cancel]')) {
        const o = S.orders.find(x => x.id === orow.dataset.oid);
        confirmBox('Cancel this production run?', `The manufacturer keeps a third of the unused deposit (${fmtMoney(o.credit * 0.34)}).`, 'Cancel run', () => { cancelOrder(o); renderCurrent(true); });
      }
    };
    el.onchange = e => {
      const row = e.target.closest('[data-pid]');
      if (!row) return;
      const p = S.products.find(x => x.id === row.dataset.pid);
      if (e.target.dataset.auto != null) p.auto.on = e.target.checked;
      if (e.target.dataset.maker != null) p.auto.maker = e.target.value;
      p.autoMsg = null;
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
      <div class="view-title"><h1>🏭 Factories</h1><p>Own plants make devices and parts at cost – and you can sell their capacity to rival brands.</p></div>
      ${S.offers.length || S.contracts.length ? `<div class="card mb"><h2>🤝 Supply contracts <span class="sub">rival brands want your capacity</span></h2>
        ${S.contracts.length ? `<h3>Active</h3><table class="tbl">${S.contracts.map(c => `<tr><td><b>${esc(c.buyer)}</b></td><td>${fmtNum(c.qty)} ${c.label}/mo</td><td class="num">${fmtMoney(c.price)} each</td><td class="num">${c.monthsLeft} months left</td><td class="num tiny faint">cost ~${fmtMoney(contractUnitCost(c.type))}</td></tr>`).join('')}</table>` : ''}
        ${S.offers.length ? `<h3>Offers</h3><table class="tbl">${S.offers.map(o => `<tr data-off="${o.id}"><td><b>${esc(o.buyer)}</b></td><td>${fmtNum(o.qty)} ${o.label}/month for ${o.months} months</td><td class="num">${fmtMoney(o.price)} each</td>
          <td class="num good">≈ ${fmtMoney((o.price - contractUnitCost(o.type)) * o.qty)}/mo profit</td><td class="num tiny faint">expires in ${o.expires - S.day} d</td><td class="right"><button class="btn sm primary" data-acc>Sign</button></td></tr>`).join('')}</table>
          <div class="tiny faint mt-s">Contracts take priority on your lines. Missing more than 5% of a month's quantity costs a penalty.</div>` : ''}
      </div>` : ''}
      ${owned.length ? `<div class="card mb"><h2>Your plants</h2><table class="tbl"><thead><tr><th>Plant</th><th>Status</th><th class="num">Level</th><th class="num">Capacity / mo</th><th>Used last month</th><th class="num">Upkeep / mo</th><th>Sell spare</th><th></th></tr></thead><tbody>
        ${owned.map(f => {
          const ft = FACTORY_TYPES[f.type], cap = factoryCap(f);
          const util = cap ? f.usedLast / cap : 0;
          const st = f.status === 'building' ? `<span class="tag warn">building · ${f.readyDay - S.day}d</span>` : f.upgradeUntil ? `<span class="tag acc">expanding · ${f.upgradeUntil - S.day}d</span>` : '<span class="tag good">online</span>';
          return `<tr data-fid="${f.id}"><td>${ft.icon} <b>${factoryName(f)}</b></td><td>${st}</td><td class="num">${f.level}</td>
            <td class="num">${cap ? fmtNum(cap) + ' ' + ft.unit : '—'}</td>
            <td style="min-width:130px">${cap && f.status === 'active' ? meter(util, util > 0.95 ? 'warn' : 'good') + `<span class="tiny faint">${Math.round(util * 100)}%</span>` : ''}</td>
            <td class="num">${fmtMoney(factoryUpkeep(f))}</td>
            <td>${cap ? `<label class="chk small" title="Sell unused capacity on the open market"><input type="checkbox" data-spare ${f.sellSpare ? 'checked' : ''}> on</label>` : ''}</td>
            <td class="right">${f.level < FACTORY_MAX_LEVEL && f.status === 'active' && !f.upgradeUntil ? `<button class="btn sm" data-up>Expand · ${fmtMoney(upgradeCost(f))}</button>` : ''} <button class="btn sm danger" data-sell>Sell</button></td></tr>`;
        }).join('')}</tbody></table></div>` : ''}
      <div class="grid auto">
        ${['workshop', 'assembly', 'camera', 'battery', 'display', 'memory', 'rnd'].map(type => {
          const ft = FACTORY_TYPES[type], cost = factoryBuildCost(type);
          const n = owned.filter(f => f.type === type).length;
          return `<div class="card fac"><div class="hd"><div class="ic">${ft.icon}</div><div><div class="nm">${ft.name}</div><div class="tiny faint">${n ? n + ' owned' : 'not owned'}</div></div></div>
            <div class="small dim" style="flex:1">${ft.desc}</div>
            <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(cost)}</span>
              <span class="k">Construction</span><span class="v">${Math.max(1, Math.round(ft.days / 30))} month${ft.days > 45 ? 's' : ''}</span>
              <span class="k">Upkeep</span><span class="v">${fmtMoney(ft.upkeep * eraFactory() * perk('upkeepMul', 1))}/mo</span>
              ${ft.cap ? `<span class="k">Capacity</span><span class="v">${fmtNum(ft.cap)} ${ft.unit}/mo</span>` : ''}</div>
            <button class="btn primary" data-build="${type}">Build · ${fmtMoney(cost)}</button></div>`;
        }).join('')}
        <div class="card fac"><div class="hd"><div class="ic">💠</div><div><div class="nm">Chip Fab</div><div class="tiny faint">${owned.filter(f => f.type === 'fab').length} owned</div></div></div>
          <div class="small dim">${FACTORY_TYPES.fab.desc}</div>
          <div class="field"><span class="lbl">Process node</span><select id="fabNode">${fabNodes.map(n => `<option value="${n.nm}" ${n.nm === this.fabNode ? 'selected' : ''}>${nodeLabel(n.nm)}${n.year > t ? ' ◆ ahead of foundries' : ''}</option>`).join('')}</select></div>
          <div class="spec-list small"><span class="k">Build cost</span><span class="v">${fmtMoney(factoryBuildCost('fab', fn.nm))}</span>
            <span class="k">Construction</span><span class="v">${Math.round((FACTORY_TYPES.fab.days + 15 * NODES.indexOf(fn)) / 30)} months</span>
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

// ---- Research -------------------------------------------------------------------------------
const Research = {
  name: 'Research', icon: '🔬', filter: 'next', open: {},
  render(el) {
    const slots = researchSlots(), spd = researchSpeed(), t = now();
    const counts = { done: 0, available: 0 };
    for (const tc of TECHS) { const s = techState(tc); if (s === 'done') counts.done++; if (s === 'available') counts.available++; }
    el.innerHTML = `
      <div class="view-title"><h1>🔬 Research</h1><p>Every part, feature and size upgrade must be researched before you can use it. Being first is expensive – catching up is cheap.</p></div>
      <div class="grid g4 mb">
        <div class="kpi"><div class="l">Research slots</div><div class="v">${S.research.length} / ${slots}</div><div class="d dim">R&D Centers add more</div></div>
        <div class="kpi"><div class="l">Research speed</div><div class="v">${Math.round(spd * 100)}%</div><div class="d dim">+25% per R&D Center level</div></div>
        <div class="kpi"><div class="l">Researched</div><div class="v">${counts.done} / ${TECHS.length}</div><div class="d dim">${counts.available} available now</div></div>
        <div class="kpi"><div class="l">Exclusive tech</div><div class="v excl">${TECHS.filter(tc => S.researched[tc.id] && t < tc.market && !tc.never).length}</div><div class="d dim">yours before the industry</div></div>
      </div>
      ${S.research.length ? `<div class="card mb"><h2>In progress</h2>${S.research.map(r => {
        const tc = TECH[r.id];
        return `<div class="row" style="padding:5px 0"><b style="min-width:240px">${tc.name}</b><div class="grow">${meter(r.progress / r.days)}</div><span class="small dim" style="min-width:150px;text-align:right">${r.days - r.progress} days left</span></div>`;
      }).join('')}</div>` : ''}
      <div class="row mb">${segBtn('rsf', [{ v: 'next', label: 'Available & upcoming' }, { v: 'all', label: 'Everything' }], this.filter)}</div>
      ${Object.keys(TECH_CATS).map(cat => {
        const info = TECH_CATS[cat];
        let list = TECHS.filter(tc => tc.cat === cat).sort((a, b) => (a.never ? a.opens : a.market) - (b.never ? b.opens : b.market));
        const done = list.filter(tc => S.researched[tc.id]).length;
        if (this.filter === 'next') list = list.filter(tc => techState(tc) !== 'done').slice(0, 6);
        return `<div class="rs-cat"><h2>${info.icon} ${info.name} <span class="small faint" style="font-weight:400">${done}/${TECHS.filter(tc => tc.cat === cat).length} · ${info.note}</span></h2>
          <div class="rs-grid">${list.map(tc => this.card(tc)).join('') || '<div class="dim small">Everything here is researched.</div>'}</div></div>`;
      }).join('')}`;
    el.onclick = e => {
      const b = e.target.closest('[data-rs]');
      if (b && report(startResearch(b.dataset.rs))) { toast('Research started: ' + TECH[b.dataset.rs].name, 'good'); renderCurrent(true); renderNav(); }
      const lic = e.target.closest('[data-lic]');
      if (lic) confirmBox('License ' + esc(TECH[lic.dataset.lic].name) + '?', 'Rivals get to use it too – you lose your exclusive edge – but they pay you royalties every month until it becomes industry standard.', 'License it', () => { report(licenseTech(lic.dataset.lic)); renderCurrent(true); });
      const sb = e.target.closest('.segbtn button');
      if (sb) { this.filter = sb.dataset.v; renderCurrent(true); }
    };
  },
  card(tc) {
    const st = techState(tc), t = now();
    let foot = '';
    if (st === 'available') foot = `<button class="btn sm primary" data-rs="${tc.id}">Research · ${fmtMoney(researchCost(tc))} · ${researchDays(tc)}d</button>`;
    else if (st === 'active') foot = '<span class="tag acc">in progress</span>';
    else if (st === 'done') foot = !tc.never && t < tc.market ? (S.licensed[tc.id] ? `<span class="tag excl">licensed · ${fmtMoney(S.licensed[tc.id].monthly)}/mo</span>` : `<span class="tag excl">◆ exclusive until ${dateLabel(tc.market)}</span> <button class="btn sm" data-lic="${tc.id}" title="Earn royalties from rivals">License</button>`) : '<span class="tag good">researched</span>';
    else if (st === 'future') foot = `<span class="tag">opens ${dateLabel(tc.never ? tc.opens : tc.market - tc.lead)}</span>`;
    else foot = `<span class="tag warn">needs ${tc.req.filter(id => !S.researched[id]).map(id => TECH[id].name).join(', ')}</span>`;
    const when = tc.never ? 'In-house only' : t < tc.market ? `Standard ${dateLabel(tc.market)} – researching now makes it exclusive` : `Industry standard since ${dateLabel(tc.market)}`;
    return `<div class="rs ${st}"><div class="row between"><span class="nm">${tc.name}</span><span class="tiny faint">${tc.never ? '' : Math.floor(tc.market)}</span></div>
      <div class="ds">${tc.desc}</div><div class="tiny faint">${when}</div>${foot}</div>`;
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
    const brands = [{ id: 'you', name: S.company, color: '#6aa8ff' }].concat(RIVALS.filter(r => r.start[cat] != null && r.start[cat] <= t + 1).map(r => ({ id: r.id, name: r.name, color: r.color })));
    const total = marketSize(cat, t);
    const phones = [];
    for (const r of S.rivalPhones) if (r.active && r.cat === cat) { const rv = RIVALS.find(x => x.id === r.rival); phones.push({ name: r.name, brand: rv.name, color: rv.color, price: r.price, seg: r.seg, q: r.q, demand: r.demand || 0, launch: r.launch, subs: r.subs, form: r.form, yourChip: !!r.playerChip }); }
    for (const p of S.products) if (p.status === 'active' && p.spec.cat === cat) phones.push({ name: p.name, brand: S.company, color: '#6aa8ff', mine: true, price: p.price, seg: segmentForPrice(cat, p.price), q: p.q, demand: p.demand || 0, launch: p.launch, subs: p.subs, form: formOf(p.spec) });
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
            <span class="k">Form factor</span><span class="v">${FORMS[formOf(fs)].icon} ${FORMS[formOf(fs)].name}</span>
            <span class="k">Chip</span><span class="v">${fchip.name} (${nodeLabel(fchip.nm)})</span>
            <span class="k">Display</span><span class="v">${fs.display.size}" ${DISPLAY_TECH[fs.display.tech].name} · ${fs.display.ppi} ppi${fs.display.touch !== 'none' ? ' · ' + TOUCH[fs.display.touch].name : ''}</span>
            <span class="k">Camera</span><span class="v">${fs.cams.main.on ? `${fs.cams.main.mp} MP ${SENSORS[fs.cams.main.sensor].name}${fs.cams.ultra.on ? ' + ultra-wide' : ''}${fs.cams.tele.on ? ' + tele' : ''}` : 'none yet'}</span>
            <span class="k">Battery</span><span class="v">${fs.battery.mah} mAh ${CHEM[fs.battery.chem].name}</span>
            <span class="k">Memory</span><span class="v">${fmtMB(fs.memory.ram)} RAM · ${fmtMB(fs.memory.storage)}</span>
            <span class="k">Software</span><span class="v">${OS[fs.os].name}</span>
            <span class="k">Body</span><span class="v">${MATERIALS[fs.body.mat].name} · ${WATER[fs.body.water].name}</span>
            <span class="k">Network</span><span class="v">${MODEM_GENS[marketModemGen(t)]}</span>
          </div>
          <h3>Buyer segments</h3>
          <table class="tbl"><thead><tr><th>Segment</th><th class="num">Typical budget</th><th class="num">Buyers / mo</th><th>Cares most about</th></tr></thead><tbody>
            ${SEGMENTS.map((sg, i) => { const w = SEG_INFO[sg].w; const top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 2).map(k => SUB_LABELS[k]).join(', '); return `<tr><td>${SEG_INFO[sg].name}</td><td class="num">${fmtMoney(segBudget(cat, sg, t))}</td><td class="num">${fmtNum(total * split[i])}</td><td class="dim">${top}${sg === 'budget' ? ', price' : ''}</td></tr>`; }).join('')}
          </tbody></table>
          <h3>Form factor trends</h3>
          <div class="cluster">${PHONE_FORMS.filter(f => t >= techMarket(FORMS[f].tech) - 0.01).map(f => `<span class="pill">${FORMS[f].icon} ${FORMS[f].name} <b>${Math.round(formAppeal(f, t) * 100)}%</b></span>`).join('')}</div>
        </div>
      </div>
      <div class="card mt"><h2>Devices on sale <span class="sub">${segBtn('mseg', [{ v: 'all', label: 'All' }].concat(SEGMENTS.map(sg => ({ v: sg, label: SEG_INFO[sg].name }))), this.seg)}</span></h2>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Device</th><th>Brand</th><th>Segment</th><th class="num">Price</th><th class="num">Quality</th><th class="num">Perf</th><th class="num">Camera</th><th class="num">Display</th><th class="num">Battery</th><th class="num">Est. sales/mo</th><th class="num">Launched</th></tr></thead><tbody>
          ${list.slice(0, 60).map(p => `<tr class="${p.mine ? 'mine' : ''}"><td><b>${FORMS[p.form || 'touch'].icon} ${esc(p.name)}</b>${p.yourChip ? ' <span class="tag excl" title="Uses your chip">your chip</span>' : ''}</td><td><span class="swatch" style="background:${p.color}"></span>${esc(p.brand)}</td><td>${SEG_INFO[p.seg].name}</td>
            <td class="num">${fmtMoney(p.price)}</td><td class="num"><b>${p.q ? Math.round(p.q[p.seg]) : '—'}</b></td>
            ${['perf', 'cam', 'disp', 'batt'].map(k => `<td class="num dim">${p.subs ? Math.round(p.subs[k]) : '—'}</td>`).join('')}
            <td class="num">${fmtNum(p.demand)}</td><td class="num dim">${p.launch ? dateLabel(p.launch) : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card mt"><h2>Off-the-shelf chips</h2>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Chip</th><th>Tier</th><th>Node</th><th class="num">CPU</th><th class="num">GPU</th><th class="num">AI</th><th class="num">Power</th><th>Modem</th><th class="num">Price</th><th class="num">Released</th></tr></thead><tbody>
          ${vendorChipsAvailable(t).sort((a, b) => b.release - a.release).map(c => `<tr><td>${c.name}</td><td><span class="tag">${c.tier}</span></td><td>${nodeLabel(c.nm)}</td><td class="num">${fmtNum(c.cpu)}</td><td class="num">${c.gpu ? c.gpu.toFixed(c.gpu < 10 ? 1 : 0) : '—'}</td><td class="num">${c.tops ? c.tops.toFixed(1) : '—'}</td><td class="num">${c.power.toFixed(2)} W</td><td>${MODEM_GENS[c.modemGen]}</td><td class="num">${fmtMoney(vendorChipPrice(c, t))}</td><td class="num dim">${dateLabel(c.release)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    const hist = S.shareHist.slice(-180);
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
        <div class="row wrap mt">${[10e3, 100e3, 1e6, 10e6, 100e6].filter(v => v <= Math.max(10e3, loanLimit() * 1.0001)).map(v => `<button class="btn sm" data-borrow="${v}" ${loanLimit() < 1 ? 'disabled' : ''}>Borrow ${fmtMoney(Math.min(v, loanLimit()))}</button>`).join('')}
          <button class="btn sm" data-repay ${S.debt > 0 && S.cash > 0 ? '' : 'disabled'}>Repay ${fmtMoney(Math.min(S.debt, Math.max(0, S.cash)))}</button></div>
        <div class="tiny faint mt-s">Banks lend against your assets and revenue – keeps your ownership, but interest is due every month.</div>
      </div>`;
    el.onclick = e => {
      const p = e.target.closest('[data-pitch]');
      if (p) { if (report(startPitch(p.dataset.pitch))) toast('Meetings booked!', 'good'); renderCurrent(true); return; }
      if (e.target.closest('[data-yes]')) { answerOffer(true); renderCurrent(true); }
      if (e.target.closest('[data-no]')) { answerOffer(false); renderCurrent(true); }
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
      ['Components & production', 'cogs', -1], ['Factory upkeep', 'upkeep', -1], ['Research', 'rnd', -1], ['Development, prototypes & tape-outs', 'dev', -1],
      ['Marketing', 'marketing', -1], ['Overhead & staff', 'overhead', -1], ['Interest', 'interest', -1], ['Contract penalties', 'penalty', -1], ['Corporate tax (22%)', 'tax', -1]];
    const maxMk = Math.max(20e3 * fundScale() * 5, Math.ceil(avgRevenue() * 0.25 / 1e3) * 1e3, S.marketing * 1.5);
    el.innerHTML = `
      <div class="view-title"><h1>💰 Finance</h1><p>Cash is king: you pay for parts when you build, and get paid when you sell.</p></div>
      <div class="grid g4">
        <div class="kpi"><div class="l">Cash</div><div class="v ${S.cash < 0 ? 'bad' : ''}">${fmtMoney(S.cash)}</div><div class="d dim">overdraft limit ${fmtMoney(creditLimit())}</div></div>
        <div class="kpi"><div class="l">Debt</div><div class="v">${fmtMoney(S.debt)}</div><div class="d dim">${(loanRate() * 100).toFixed(0)}% APR · loans in 💼 Investors</div></div>
        <div class="kpi"><div class="l">Assets</div><div class="v">${fmtMoney(factoryValue() + inventoryValue())}</div><div class="d dim">factories ${fmtMoney(factoryValue())} · stock ${fmtMoney(inventoryValue())}</div></div>
        <div class="kpi"><div class="l">Net worth</div><div class="v">${fmtMoney(netWorth())}</div><div class="d dim">cash − debt + assets</div></div>
      </div>
      ${S.cash < 0 ? `<div class="note bad mt">⚠️ You are overdrawn (18% interest). Stay below −${fmtMoney(creditLimit())} for 90 days and the company goes bankrupt. ${S.overdraftDays ? `<b>${90 - S.overdraftDays} days left.</b>` : ''}</div>` : ''}
      <div class="card mt"><h2>📣 Marketing</h2>
        <div class="field"><span class="lbl">Monthly budget</span><div class="row"><input type="range" id="mk" min="0" max="${maxMk}" step="${Math.max(100, maxMk / 100)}" value="${S.marketing}"><span class="val" id="mkVal">${fmtMoney(S.marketing)}</span></div></div>
        <div class="small dim mt-s">Ads, retail placement and sponsorships raise brand awareness (now <b>${fmtPct(S.aware)}</b>). Awareness fades ~3% per month without support. Big rivals sit at 30–90%.</div>
      </div>
      <div class="card mt"><h2>Profit & loss <span class="sub">last ${h.length} months</span></h2>
        ${h.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th>${h.map(m => `<th class="num">${dateLabel(m.t)}</th>`).join('')}</tr></thead><tbody>
          ${rows.filter(([, k]) => h.some(m => m[k])).map(([label, k, sg]) => `<tr><td class="dim">${label}</td>${h.map(m => `<td class="num ${sg < 0 && m[k] ? 'bad' : ''}">${m[k] ? (sg < 0 ? '−' : '') + fmtMoney(Math.abs(m[k])) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td><b>Profit</b></td>${h.map(m => `<td class="num ${m.profit >= 0 ? 'good' : 'bad'}"><b>${fmtMoney(m.profit)}</b></td>`).join('')}</tr>
          <tr><td class="dim">Factory construction</td>${h.map(m => `<td class="num dim">${m.capex ? fmtMoney(m.capex) : '—'}</td>`).join('')}</tr>
          <tr><td class="dim">Investment raised</td>${h.map(m => `<td class="num good">${m.funding ? fmtMoney(m.funding) : '—'}</td>`).join('')}</tr>
        </tbody></table></div>` : '<div class="dim">The first books close at the end of this month.</div>'}
      </div>
      <div class="grid g2 mt">
        <div class="card"><h2>Revenue & profit</h2><canvas class="chart" id="pnlChart"></canvas>${legend([{ name: 'Revenue', color: '#6aa8ff' }, { name: 'Profit', color: '#43c88a' }])}</div>
        <div class="card"><h2>Net worth</h2><canvas class="chart" id="nwChart"></canvas>${legend([{ name: 'Net worth', color: '#f2cc5b' }, { name: 'Your stake', color: '#8b7bff' }])}</div>
      </div>`;
    const hh = S.history.slice(-240);
    drawChart($('#pnlChart'), [{ name: 'Revenue', color: '#6aa8ff', data: hh.map(m => [m.t, m.revenue + (m.b2b || 0) + (m.spare || 0)]), fill: 'rgba(106,168,255,.08)' }, { name: 'Profit', color: '#43c88a', data: hh.map(m => [m.t, m.profit]) }], { yFmt: v => fmtMoney(v) });
    drawChart($('#nwChart'), [{ name: 'Net worth', color: '#f2cc5b', data: hh.map(m => [m.t, m.worth]) }, { name: 'Your stake', color: '#8b7bff', data: hh.map(m => [m.t, Math.max(0, m.worth) * (m.own || 1)]) }], { yFmt: v => fmtMoney(v) });
    const mk = $('#mk');
    mk.oninput = () => { S.marketing = Math.round(+mk.value / 100) * 100; $('#mkVal').textContent = fmtMoney(S.marketing); };
    mk.onchange = () => toast(`Marketing budget: ${fmtMoney(S.marketing)}/month`);
  },
};
registerView('finance', Finance);
