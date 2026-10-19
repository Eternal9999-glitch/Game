'use strict';
// ============================================================================
//  Boot: start screen, real-time loop, menu, keyboard shortcuts.
// ============================================================================

const DAYS_PER_SEC = [0, 1.7, 5, 17];
let lastFrame = 0, dayAcc = 0, lastRender = 0, lastViewRender = 0, dirty = false;

function startScreen() {
  const canContinue = hasSave();
  let era = 1973, style = 'brand', cash = 10e3;
  modal(`
    <div class="start-hero"><div style="font-size:40px">📱</div><div class="big">Phone Empire Tycoon</div>
      <div class="dim">Start with ${fmtMoney(10e3)} and a sketch at the dawn of mobile phones. Win investors, engineer every part yourself, build the factories, own the stack.</div></div>
    <div class="field"><span class="lbl">Company name</span><input type="text" id="coName" value="Nimbus Devices" maxlength="28"></div>
    <h3>Playstyle</h3>
    <div class="style-pick" id="styleC">${Object.entries(PLAYSTYLES).map(([k, p]) => `<button data-style="${k}" class="${k === style ? 'on' : ''}">
      <span class="big">${p.icon}</span><b>${p.name}</b><span class="tiny dim">${p.tagline}</span><ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul></button>`).join('')}</div>
    <h3>Starting era</h3>
    <div class="choice c5" id="eraC">
      <button data-era="1973" class="on"><b>1973 · Car phones</b><span>The dawn of mobile: 6 kg radio-telephones in car trunks. Cellular networks are still a dream.</span></button>
      <button data-era="1983"><b>1983 · First handhelds</b><span>AMPS and NMT cellular networks switch on. The brick phone era begins.</span></button>
      <button data-era="1996"><b>1996 · Flip phones</b><span>GSM vs CDMA, monochrome screens, NiMH and Li-ion. No cameras yet.</span></button>
      <button data-era="2007"><b>2007 · Smartphones</b><span>Touchscreens arrive. 3G, megapixel cameras, the app era begins.</span></button>
      <button data-era="2016"><b>2016 · Modern</b><span>A crowded smartphone market, 14nm chips, the camera wars.</span></button>
    </div>
    <h3>Starting money</h3>
    <div class="choice" id="cashC">
      <button data-cash="10000" class="on"><b>$10k · Garage</b><span>The intended experience: raise money to grow.</span></button>
      <button data-cash="50000"><b>$50k · Savings</b><span>A little more room for mistakes.</span></button>
      <button data-cash="250000"><b>$250k · Backed</b><span>Skip the scrappy part.</span></button>
    </div>
    <div class="actions">${canContinue ? '<button class="btn" id="contBtn">Continue saved game</button>' : ''}<button class="btn primary lg" id="newBtn">Found company →</button></div>
  `, d => {
    $('#modal').dataset.sticky = '1';
    const group = (sel, attr, set) => $$(sel + ' button', d).forEach(b => { b.onclick = () => { set(b.dataset[attr]); $$(sel + ' button', d).forEach(x => x.classList.toggle('on', x === b)); }; });
    group('#eraC', 'era', v => { era = +v; });
    group('#styleC', 'style', v => { style = v; });
    group('#cashC', 'cash', v => { cash = +v; });
    $('#newBtn', d).onclick = () => {
      newGame({ company: ($('#coName', d).value || 'Nimbus Devices').trim(), start: era, cash, playstyle: style });
      enterGame();
      howToPlay();
    };
    if (canContinue) $('#contBtn', d).onclick = () => { if (load()) enterGame(); else toast('Save could not be loaded.', 'bad'); };
  });
}
function enterGame() {
  closeModal();
  $('#app').classList.remove('hidden');
  S.speed = S.speed || 0;
  showView('hq');
  renderTop();
}
function howToPlay() {
  const ps = PLAYSTYLES[S.playstyle];
  modal(`<h2>Welcome, founder 👋</h2>
    <div class="small" style="line-height:1.6">
      <p>It's <b>${dateLabel(now())}</b>. You have <b>${fmtMoney(S.cash)}</b>, a garage, and a plan. Playstyle: <b>${ps.icon} ${ps.name}</b> – ${ps.tagline}</p>
      <ol style="margin:8px 0 0 20px">
        <li><b>📱 Phone Lab</b>: build a phone around the live 3D model from supplier parts – or your own designs. <b>📐 Layout</b> lets you move every port, key, grille and camera.</li>
        <li><b>🛠️ Parts Lab</b>: engineer your own processors (node, cores, clock), displays (layer stacks), cameras (optics), batteries (cell chemistry), memory and radios. Your parts are produced into stock – phones can't be built without them.</li>
        <li>Hit <b>🧪 Prototype</b> – investors want to hold something. Then <b>💼 Investors</b>: friends & family, angels, and later rounds that need real revenue.</li>
        <li><b>🚀 Develop & launch</b>. A production line at a contract manufacturer starts building stock automatically (<b>📦 Production</b>).</li>
        <li>Spend on <b>marketing</b> (💰 Finance), keep <b>researching</b> (🔬) – networks change, electronics shrink, rivals move on – compare your devices in <b>🏁 Benchmarks</b>, and build <b>factories</b> (🏭) when the volume is there.</li>
      </ol>
      <p class="mt-s dim">Time is paused. Press <b>▶</b> (or keys <b>1–3</b>, <b>Space</b> to pause). The game autosaves every month.</p>
    </div>
    <div class="actions"><button class="btn primary" data-x>Let's go</button></div>`, d => { $('[data-x]', d).onclick = closeModal; });
}
function menu() {
  const was = S.speed; S.speed = 0;
  modal(`<h2>Menu</h2>
    <div class="col">
      <button class="btn" data-m="save">💾 Save now</button>
      <button class="btn" data-m="help">❓ How to play</button>
      <button class="btn" data-m="export">⬇️ Export save file</button>
      <button class="btn" data-m="import">⬆️ Import save file</button>
      <button class="btn danger" data-m="new">🗑 New game (erases save)</button>
    </div>
    <div class="actions"><button class="btn primary" data-m="close">Resume</button></div>`, d => {
    d.onclick = e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const m = b.dataset.m;
      if (m === 'close') { closeModal(); S.speed = was; renderTop(); }
      if (m === 'save') toast(save() ? 'Game saved.' : 'Saving failed (storage blocked?)', save() ? 'good' : 'bad');
      if (m === 'help') howToPlay();
      if (m === 'new') confirmBox('Start over?', 'Your current company and its save will be erased.', 'Erase & restart', () => { wipeSave(); location.reload(); });
      if (m === 'export') {
        const blob = new Blob([serialize()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = S.company.replace(/\W+/g, '_') + '_' + Math.floor(now()) + '.json'; a.click();
      }
      if (m === 'import') {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          f.text().then(txt => {
            try { if (!loadState(JSON.parse(txt))) throw new Error(); save(); closeModal(); showView('hq'); toast('Save imported.', 'good'); }
            catch (err) { toast('That file is not a valid save.', 'bad'); }
          });
        };
        inp.click();
      }
    };
  });
}

function frame(ts) {
  const dt = Math.min(0.25, (ts - lastFrame) / 1000 || 0);
  lastFrame = ts;
  if (S && !S.over && $('#modal').classList.contains('hidden')) {
    dayAcc += dt * DAYS_PER_SEC[S.speed];
    let n = 0;
    while (dayAcc >= 1 && n < 40) { tickDay(); dayAcc -= 1; n++; dirty = true; if (S.over) break; }
  }
  if (S && ts - lastRender > 350) {
    lastRender = ts;
    renderTop();
    if (dirty && ts - lastViewRender > 1000) { renderCurrent(false); dirty = false; lastViewRender = ts; }
  }
  requestAnimationFrame(frame);
}

function bootUI() {
  $$('.speed').forEach(b => { b.onclick = () => { S.speed = +b.dataset.speed; renderTop(); }; });
  $('#menuBtn').onclick = menu;
  document.addEventListener('keydown', e => {
    if (!S || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape' && !$('#modal').dataset.sticky) closeModal(); return; }
    if (e.key === ' ') { e.preventDefault(); document.activeElement?.blur?.(); S.speed = S.speed ? 0 : 1; renderTop(); }
    if (e.key >= '1' && e.key <= '3') { S.speed = +e.key; renderTop(); }
  });
  on('news', n => { if (n.important) toast(n.text, n.kind === 'bad' ? 'bad' : n.kind === 'good' ? 'good' : ''); });
  on('month', () => { renderNav(); if (VIEWS[currentView].live === false) renderCurrent('month'); });
  on('gameover', () => {
    modal(`<h2>💀 Bankrupt</h2><p class="dim">${esc(S.company)} ran out of credit in ${dateLabel(now())}. Creditors seized the factories.</p>
      <div class="spec-list mt"><span class="k">Devices sold</span><span class="v">${fmtNum(S.stats.sold)}</span><span class="k">Devices launched</span><span class="v">${S.stats.launched}</span><span class="k">Best review</span><span class="v">${S.stats.bestReview.toFixed(1)}</span></div>
      <div class="actions"><button class="btn primary" id="again">Try again</button></div>`, d => {
      $('#modal').dataset.sticky = '1';
      $('#again', d).onclick = () => { wipeSave(); location.reload(); };
    });
  });
  window.addEventListener('resize', () => { if (S) renderCurrent(true); });
  window.addEventListener('beforeunload', () => { if (S && !S.over) save(); });
  startScreen();
  requestAnimationFrame(frame);
}
bootUI();
