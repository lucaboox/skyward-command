// ============================================================================
// SKYWARD COMMAND — boot, title flow, main loop, autosave
// ============================================================================
let map, lastFrame = performance.now(), foldBlocked = false, chosenDiff = 'veteran', chosenMode = 'campaign', autosaveT = 20;

function boot() {
  map = L.map('map', {
    zoomControl: false, worldCopyJump: false, minZoom: 2, maxZoom: 10, zoomSnap: 0.5,
    maxBounds: [[-80, -200], [85, 200]], maxBoundsViscosity: 0.8,
  });
  // OpenStreetMap tiles, recolored to a dark gray command-center theme via CSS (see .leaflet-tile-pane)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, noWrap: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.setView([40, 20], 3);
  guardCamera(map);
  Settings.apply();
  initRender(map);
  initUI(map);

  const pickOne = (sel, attr, set) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => {
    set(b.dataset[attr]);
    document.querySelectorAll(sel).forEach(x => x.classList.toggle('on', x === b));
  }));
  pickOne('#diff button', 'diff', v => { chosenDiff = v; });
  pickOne('#mode button', 'mode', v => { chosenMode = v; });
  $('btn-start').addEventListener('click', () => {
    if (readSave()) confirmBox('START A NEW GAME?', 'Your saved game will be overwritten.', 'START NEW', () => startGame(chosenMode), false);
    else startGame(chosenMode);
  });
  $('btn-continue').addEventListener('click', continueGame);
  $('btn-menu').addEventListener('click', openMenu);
  $('btn-settings').addEventListener('click', () => openSettings());
  $('btn-zin').addEventListener('click', () => map.zoomIn(1));
  $('btn-zout').addEventListener('click', () => map.zoomOut(1));
  $('btn-home').addEventListener('click', () => {
    if (!G) return;
    const hot = G.zones.filter(z => z.active && !z.neutralized);
    const pts = (hot.length ? hot : G.zones).map(z => [z.center.lat, z.center.lng]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 6, duration: 0.8 });
  });

  // Fold / narrow-display detection: pause and show the "unfold" screen
  const mq = window.matchMedia('(max-width: 719px)');
  const onFold = () => { foldBlocked = mq.matches; $('fold-w').textContent = Math.round(window.innerWidth); if (!foldBlocked) setTimeout(() => map.invalidateSize(), 50); };
  mq.addEventListener ? mq.addEventListener('change', onFold) : mq.addListener(onFold);
  window.addEventListener('resize', onFold);
  onFold();

  // Backgrounding: pause + save so the game can be resumed even if Android kills the app
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !G || G.over) return;
    if (!G.paused) setSpeed(0);
    saveGame();
  });
  window.addEventListener('pagehide', () => { if (G && !G.over) saveGame(); });

  // Android hardware back button (Capacitor App plugin) opens/closes the pause menu
  const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (App && App.addListener) {
    App.addListener('backButton', () => {
      if (!G || G.over) { if ($('title').classList.contains('hidden')) return; App.exitApp(); return; }
      if (menuOpen()) { $('modal').classList.add('hidden'); if (G.paused) setSpeed(0); }
      else openMenu();
    });
  }

  showTitle();
  requestAnimationFrame(frame);
}

function showTitle() {
  closeStrike();
  $('coach').className = '';
  // Tear down the previous game's map layers / overlays
  Object.values(UI.polys).forEach(p => p.remove());
  UI.polys = {};
  UI.sel = null; updateSel(true);
  $('toasts').innerHTML = ''; $('comms').innerHTML = ''; $('panel-body').innerHTML = '';
  document.body.classList.remove('paused');
  $('title').classList.remove('hidden');

  const best = k => { try { return +(localStorage.getItem(k) || 0) || '—'; } catch (e) { return '—'; } };
  $('best').innerHTML = `BEST · CAMPAIGN ${['recruit', 'veteran', 'ace'].map(k => `${DIFFS[k].name} ${best('skyward_best_' + k)}`).join('  ')}<br>BEST · ENDLESS ${['recruit', 'veteran', 'ace'].map(k => `${DIFFS[k].name} ${best('skyward_best_endless_' + k)}`).join('  ')}`;

  const sv = readSave();
  const cont = $('btn-continue');
  cont.classList.toggle('hidden', !sv);
  if (sv) {
    const g = sv.g;
    cont.innerHTML = `▶ CONTINUE<small>${g.mode === 'endless' ? `ENDLESS · LVL ${g.level}` : `CAMPAIGN · ${g.stats.zonesSecured}/8 SECURED`} · ${DIFFS[g.diffKey].name} · T+${fmtTime(g.time)}</small>`;
  }
}

function enterGame() {
  resetUI();
  $('title').classList.add('hidden');
  $('modal').classList.add('hidden');
  renderComms();
  autosaveT = 20;
}

function startGame(mode = 'campaign') {
  newGame(chosenDiff, mode);
  enterGame();
  setSpeed(1);
  const first = G.zones.filter(z => z.activateAt === 0);
  map.flyTo([first[0].center.lat, first[0].center.lng], 4.5, { duration: 0.8 });
  saveGame();
  Coach.start();
  if (mode === 'endless') setTimeout(() => { if (G && G.time < 5) toast('<b class="chip hud">ENDLESS</b> Crises keep coming and your bases will be attacked. Tap a base under attack to DEFEND it. Survive as long as you can.', '', null, 9000); }, 1500);
}

function continueGame() {
  if (!loadGame()) { toast('<b class="chip red">NO SAVE</b> Could not read the saved game', 'err', null, 3000); showTitle(); return; }
  enterGame();
  G.paused = false; setSpeed(0); // resume paused so the player can re-orient
  const live = G.zones.filter(z => z.active && !z.neutralized);
  if (live.length) map.fitBounds(L.latLngBounds(live.map(z => [z.center.lat, z.center.lng])).pad(0.3), { maxZoom: 5 });
  toast('<b class="chip hud">RESTORED</b> Game loaded and paused. Tap ▶ 1× to resume.', '', null, 5000);
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (G && !G.over && !G.paused && !foldBlocked) {
    let s = dt * G.speed;
    while (s > 1e-6) { const st = Math.min(0.05, s); update(st); s -= st; }
    updateFx(dt * Math.min(G.speed, 2));
    autosaveT -= dt;
    if (autosaveT <= 0 && G && !G.over) { autosaveT = 20; saveGame(); }
  }
  render();
  uiTick(dt);
  // Feed new projectiles / effects to the audio engine (positional combat sounds)
  if (G && Sound.unlocked()) {
    for (const p of G.proj) if (!p._s && !(p.delay > 0)) { p._s = 1; Sound.onProj(p); }
    for (const f of G.fx) if (!f._s) { f._s = 1; Sound.onFx(f); }
  }
  Sound.ambientTick(dt);
  requestAnimationFrame(frame);
}

window.addEventListener('load', boot);

// Animated camera moves divide by the map's size, so on a zero-size map (hidden page, app
// launching in the background, mid fold/rotate) they produce NaN coordinates and throw.
// In that case jump straight to the target instead; animations resume once the map has a size.
function guardCamera(map) {
  for (const m of ['flyTo', 'flyToBounds', 'fitBounds', 'panTo']) {
    const orig = map[m].bind(map);
    map[m] = (...a) => {
      const sz = map.getSize();
      if (sz.x && sz.y) return orig(...a);
      try {
        if (m === 'flyTo') map.setView(a[0], a[1] ?? map.getZoom(), { animate: false });
        else if (m === 'panTo') map.setView(a[0], map.getZoom(), { animate: false });
        else map.setView(L.latLngBounds(a[0]).getCenter(), (a[1] && a[1].maxZoom) || map.getZoom(), { animate: false });
      } catch (e) { /* nothing sensible to do without a viewport */ }
      return map;
    };
  }
}

