// ============================================================================
// SKYWARD COMMAND — player settings (persisted in localStorage)
// ============================================================================
const Settings = (() => {
  const KEY = 'skyward_settings_v1';
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const DEFAULTS = {
    volume: 0.7, uiSfx: true, alerts: true, radio: true, combat: true, ambient: true, haptics: true,
    layout: touch ? 'thumb' : 'classic',   // classic | thumb | rail
    side: 'right',                         // which side the command panel sits on
    panelW: 'regular',                     // compact | regular | wide
    scale: 1,                              // UI size multiplier
    comms: 'compact',                      // full | compact | off
    scanlines: true, autoTrack: true, pauseOnAlert: false, advanced: false,
  };
  let S = { ...DEFAULTS };
  try { S = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) {}

  const get = () => S;
  function set(k, v) {
    S[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    apply();
  }
  function reset() {
    S = { ...DEFAULTS };
    try { localStorage.removeItem(KEY); } catch (e) {}
    apply();
  }

  let zoomCtl = null;
  function apply() {
    const b = document.body, root = document.documentElement;
    if (!b) return;
    ['classic', 'thumb', 'rail'].forEach(l => b.classList.toggle('layout-' + l, S.layout === l));
    b.classList.toggle('dock-float', S.layout !== 'classic');
    b.classList.toggle('panel-left', S.side === 'left');
    b.classList.toggle('no-scan', !S.scanlines);
    b.classList.toggle('advanced', !!S.advanced);
    b.classList.toggle('comms-compact', S.comms === 'compact');
    b.classList.toggle('comms-off', S.comms === 'off');
    root.style.setProperty('--ui-scale', S.scale);
    root.style.setProperty('--panel-w', { compact: '300px', regular: 'clamp(320px, 33vw, 410px)', wide: 'clamp(360px, 42vw, 480px)' }[S.panelW]);

    // Controls live in the top bar (classic) or in a floating thumb dock on the map
    const dock = document.getElementById('dock');
    if (dock) {
      const host = S.layout === 'classic' ? document.getElementById('topbar') : document.getElementById('mapwrap');
      if (dock.parentElement !== host) host.appendChild(dock);
    }
    if (typeof map !== 'undefined' && map) {
      if (!zoomCtl) zoomCtl = L.control.zoom({ position: 'bottomright' });
      if (S.layout === 'classic') { if (!zoomCtl._map) zoomCtl.addTo(map); }
      else if (zoomCtl._map) zoomCtl.remove();
      setTimeout(() => { map.invalidateSize(); if (typeof resizeCanvas === 'function' && R.map) resizeCanvas(); }, 80);
    }
    if (typeof Sound !== 'undefined') Sound.applyVolumes();
    if (typeof UI !== 'undefined') UI.logDirty = true;
  }

  return { get, set, reset, apply, DEFAULTS };
})();

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------
function openSettings(back) {
  const S = Settings.get();
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) => `<button class="${S[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${label}</button>`).join('')}</div>`;
  const tog = (key, label, sub = '') => `<button class="tog ${S[key] ? 'on' : ''}" data-tog="${key}"><span class="sw"><i></i></span><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  const card = $('modal-card');
  card.className = 'modal-card settings';
  card.innerHTML = `<div class="t-kicker mono">SYSTEM CONFIGURATION</div><h2 style="margin:4px 0 12px">SETTINGS</h2>
    <div class="set-sec">LAYOUT</div>
    <div class="layout-pick">
      ${[['classic', 'CLASSIC', 'Controls in the top bar, tabs on top'], ['thumb', 'THUMB DOCK', 'Tabs along the bottom, controls in a corner dock'], ['rail', 'SIDE RAIL', 'Big vertical tab rail on the screen edge']].map(([v, n, d]) =>
        `<button class="lp ${S.layout === v ? 'on' : ''}" data-set="layout" data-val="${v}"><span class="lp-pic ${v}"><i class="a"></i><i class="b"></i><i class="c"></i></span><b>${n}</b><small>${d}</small></button>`).join('')}
    </div>
    <div class="set-row"><label>PANEL SIDE</label>${seg('side', [['left', 'LEFT'], ['right', 'RIGHT']])}</div>
    <div class="set-row"><label>PANEL WIDTH</label>${seg('panelW', [['compact', 'COMPACT'], ['regular', 'REGULAR'], ['wide', 'WIDE']])}</div>
    <div class="set-row"><label>UI SIZE</label>${seg('scale', [[0.9, 'S'], [1, 'M'], [1.12, 'L'], [1.25, 'XL']])}</div>
    <div class="set-row"><label>COMMS LOG</label>${seg('comms', [['full', 'FULL'], ['compact', 'COMPACT'], ['off', 'OFF']])}</div>
    <div class="set-sec">AUDIO</div>
    <div class="set-row"><label>VOLUME</label><input type="range" min="0" max="100" value="${Math.round(S.volume * 100)}" data-range="volume"><span class="mono" id="vol-val">${Math.round(S.volume * 100)}</span></div>
    <div class="tog-grid">
      ${tog('radio', 'Radio chatter', 'Static, squelch and voice bursts')}
      ${tog('combat', 'Combat sounds', 'Explosions, missiles, guns on screen')}
      ${tog('ambient', 'Battle ambience', 'Hear the front when zoomed in')}
      ${tog('alerts', 'Alerts', 'Missile warnings, klaxons, chimes')}
      ${tog('uiSfx', 'Interface clicks')}
      ${tog('haptics', 'Haptics', 'Vibration on taps and alerts')}
    </div>
    <div class="btn-row" style="margin-top:6px"><button class="btn" data-test="radio">▶ TEST RADIO</button><button class="btn" data-test="boom">▶ TEST EXPLOSION</button></div>
    <div class="set-sec">GAMEPLAY &amp; HUD</div>
    <div class="tog-grid">
      ${tog('autoTrack', 'Follow new packages', 'Camera tracks a package after launch')}
      ${tog('pauseOnAlert', 'Pause on alerts', 'Auto-pause for new crises and base attacks')}
      ${tog('scanlines', 'CRT scanlines', 'HUD overlay effect on the map')}
      ${tog('advanced', 'Advanced planner', 'Adds the PLANNER tab: hand-pick aircraft and weapons')}
    </div>
    <div class="btn-row" style="margin-top:6px"><button class="btn" id="set-coach">↺ REPLAY TUTORIAL</button></div>
    <div class="btn-row" style="margin-top:16px"><button class="btn pri" id="set-done" style="padding:12px">DONE</button><button class="btn" id="set-reset" style="padding:12px">RESET DEFAULTS</button></div>`;
  $('modal').classList.remove('hidden');

  const rerender = () => openSettings(back);
  card.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
    const v = b.dataset.val, cur = Settings.get()[b.dataset.set];
    Settings.set(b.dataset.set, typeof cur === 'number' ? +v : v);
    rerender();
  });
  card.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { Settings.set(b.dataset.tog, !Settings.get()[b.dataset.tog]); rerender(); });
  const range = card.querySelector('[data-range]');
  range.oninput = () => { $('vol-val').textContent = range.value; Settings.set('volume', range.value / 100); };
  card.querySelector('[data-test="radio"]').onclick = () => { Sound.ensure(); setTimeout(() => Sound.radioStatic(4), 60); };
  card.querySelector('[data-test="boom"]').onclick = () => {
    Sound.ensure(); setTimeout(Sound.testBoom, 60);
  };
  $('set-done').onclick = () => { $('modal').classList.add('hidden'); if (back) back(); };
  $('set-reset').onclick = () => { Settings.reset(); rerender(); };
  $('set-coach').onclick = () => { Coach.reset(); $('modal').classList.add('hidden'); if (G) Coach.start(); else if (back) back(); toast('<b class="chip hud">TUTORIAL</b> It will run again on your next game', '', null, 2500); };
}
