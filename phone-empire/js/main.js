'use strict';
// ============================================================================
//  Boot: start screen, real-time loop, menu, keyboard shortcuts.
// ============================================================================

const DAYS_PER_SEC = [0, 1.5, 5, 15];
let lastFrame = 0, dayAcc = 0, lastRender = 0, lastViewRender = 0, dirty = false;

function startScreen() {
  const canContinue = hasSave();
  let era = 2008, cash = 2e6;
  modal(`
    <div class="start-hero"><div style="font-size:44px">📱</div><div class="big">Phone Empire Tycoon</div>
      <div class="dim">Engineer devices part by part. Design your own chips. Build the factories. Own the stack.</div></div>
    <div class="field"><span class="lbl">Company name</span><input type="text" id="coName" value="Nimbus Devices" maxlength="28"></div>
    <h3>Starting era</h3>
    <div class="choice" id="eraC">
      <button data-era="2008" class="on"><b>2008 · Dawn</b><span>Touchscreens are new. 65nm chips, 3 MP cameras, 3G.</span></button>
      <button data-era="2014"><b>2014 · Boom</b><span>Huge market, 28nm, full-HD screens, 4G.</span></button>
      <button data-era="2020"><b>2020 · Modern</b><span>7nm, 5G arriving, camera wars, a pandemic.</span></button>
    </div>
    <h3>Starting capital</h3>
    <div class="choice" id="cashC">
      <button data-cash="5000000"><b>$5M · Funded</b><span>Room for mistakes.</span></button>
      <button data-cash="2000000" class="on"><b>$2M · Startup</b><span>The intended experience.</span></button>
      <button data-cash="750000"><b>$750k · Garage</b><span>Every dollar counts.</span></button>
    </div>
    <div class="actions">${canContinue ? '<button class="btn" id="contBtn">Continue saved game</button>' : ''}<button class="btn primary lg" id="newBtn">Found company →</button></div>
  `, d => {
    $('#modal').dataset.sticky = '1';
    $$('#eraC button', d).forEach(b => { b.onclick = () => { era = +b.dataset.era; $$('#eraC button', d).forEach(x => x.classList.toggle('on', x === b)); }; });
    $$('#cashC button', d).forEach(b => { b.onclick = () => { cash = +b.dataset.cash; $$('#cashC button', d).forEach(x => x.classList.toggle('on', x === b)); }; });
    $('#newBtn', d).onclick = () => {
      newGame({ company: ($('#coName', d).value || 'Nimbus Devices').trim(), start: era, cash });
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
  modal(`<h2>Welcome, CEO 👋</h2>
    <div class="small" style="line-height:1.6">
      <p>It's <b>${dateLabel(now())}</b>. You have <b>${fmtMoney(S.cash)}</b> and an empty office. Your rivals already sell millions of devices.</p>
      <p class="mt-s"><b>Your first moves:</b></p>
      <ol style="margin-left:20px">
        <li>Open the <b>📱 Phone Lab</b>. Pick an off-the-shelf chip and parts, hit <b>💡 Suggest price</b>, and start development.</li>
        <li>In <b>💰 Finance</b>, set a marketing budget — nobody buys a brand they've never heard of.</li>
        <li>Build an <b>🏭 Assembly Plant</b> early: it pays for itself fast.</li>
        <li>When you have cash, design a chip in the <b>💠 Chip Lab</b>, research exclusive tech, and build component factories.</li>
      </ol>
      <p class="mt-s dim">Time is paused. Use <b>▶</b> (or keys <b>1–3</b>, <b>Space</b> to pause) to run the clock. The game autosaves every month.</p>
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
            try { const s = JSON.parse(txt); if (s.version !== 1) throw new Error(); S = s; monthlyRefresh(); computeDemand(); save(); closeModal(); showView('hq'); toast('Save imported.', 'good'); }
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
    if (currentView === 'chiplab' && ChipLab.key(e)) return;
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
