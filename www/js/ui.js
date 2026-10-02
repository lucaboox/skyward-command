// ============================================================================
// SKYWARD COMMAND — DOM UI (top bar, side panel, overlays)
// ============================================================================
const UI = {
  tab: 'theater', zoneSel: null, sel: null, trackPkg: null, dirty: true, lastPanel: 0, pointerDown: false,
  plan: null, buyType: 'f16', buyBase: null, openDeb: null, commsOpen: false, polys: {}, logDirty: true, selT: 0, trackT: 0,
};
const $ = id => document.getElementById(id);

function closeStrikeIfZone(z) { if (Strike.open && Strike.info && Strike.info.zone === z) closeStrike(); }

function resetUI() {
  closeStrike();
  Object.assign(UI, { tab: 'theater', zoneSel: null, sel: null, trackPkg: null, dirty: true, buyType: 'f16', buyBase: null, openDeb: null, logDirty: true });
  UI.plan = { mission: 'strike', zoneId: null, pilotId: null, friendlyId: null, baseId: null, acIds: new Set(), loadouts: {} };
  Object.values(UI.polys).forEach(p => p.remove());
  UI.polys = {};
  styleZones();
  $('toasts').innerHTML = '';
  setTab('theater');
}

function styleZones() {
  for (const z of G.zones) {
    if (!UI.polys[z.id]) UI.polys[z.id] = L.polygon(z.poly, { interactive: false }).addTo(R.map);
    const p = UI.polys[z.id];
    const sel = UI.zoneSel === z.id;
    if (!z.active) p.setStyle({ color: '#7d8f8c', weight: 1, dashArray: '2 7', opacity: 0.45, fillColor: '#7d8f8c', fillOpacity: 0.02 });
    else if (z.neutralized) p.setStyle({ color: '#62f0cf', weight: sel ? 2 : 1.2, dashArray: '3 6', opacity: 0.7, fillColor: '#62f0cf', fillOpacity: sel ? 0.08 : 0.04 });
    else p.setStyle({ color: '#ff4d4d', weight: sel ? 2.6 : 1.6, dashArray: '9 5', opacity: 0.9, fillColor: '#ff2a2a', fillOpacity: sel ? 0.17 : 0.09 });
  }
}

// ---------------------------------------------------------------------------
// Hooks from the simulation
// ---------------------------------------------------------------------------
Hooks.log = () => {
  UI.logDirty = true; UI.dirty = true;
  const e = G.log[G.log.length - 1];
  Sound.onLog(e);
  if (e.cls === 'alert' && /SHOT DOWN/.test(e.text)) Callout.show('AIRCRAFT DOWN', esc(e.text.split(' (')[0]), 'bad');
};
Hooks.kill = (u, pkg, funds) => Callout.kill(funds);
Hooks.zone = z => {
  styleZones(); UI.dirty = true;
  if (z.neutralized) { Callout.show('SECTOR SECURED', `${esc(z.name)} · +$60M · +25 RP · threat −10`, 'big'); Haptic.fire('success'); closeStrikeIfZone(z); }
  else if (!z.active) toast(`<b class="chip warn">UNREST</b> ${esc(z.name)} — ${esc(z.region)}`, '', () => selectZone(z.id));
  else { toast(`<b class="chip red pulse">NEW CRISIS</b> ${esc(z.name)} — ${esc(z.region)}`, '', () => selectZone(z.id)); alertPause(); }
};
// Optional auto-pause so you never miss a crisis while planning elsewhere
function alertPause() {
  if (!Settings.get().pauseOnAlert || !G || G.paused || G.over) return;
  setSpeed(0);
  toast('<b class="chip warn">AUTO-PAUSED</b> New alert. Resume with ▶ when ready.', '', null, 3500);
}
Hooks.zoneRemoved = z => {
  if (UI.polys[z.id]) { UI.polys[z.id].remove(); delete UI.polys[z.id]; }
  if (UI.zoneSel === z.id) UI.zoneSel = null;
  UI.dirty = true;
};
Hooks.homefront = (base, eta) => {
  toast(`<b class="chip red pulse">HOMEFRONT</b> Attack inbound to <b>${esc(base.name)}</b> · ETA ${eta}s<br><span class="dim">Tap to launch a DEFEND patrol</span>`, 'err', () => planDefend(base.id), 9000);
  alertPause();
};
Hooks.flash = kind => { Haptic.fire(kind === 'amber' ? 'warning' : 'heavy'); const f = $('flash'); f.className = ''; void f.offsetWidth; f.className = kind; };
Hooks.float = (text, loss) => { const f = $('tb-float'); f.textContent = text; f.classList.toggle('loss', !!loss); f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); setTimeout(() => f.classList.remove('show'), 1600); };
Hooks.debrief = d => {
  UI.dirty = true;
  if ((d.grade === 'S' || d.grade === 'A') && killTotal(d.kills)) setTimeout(() => Callout.show(`MISSION ${d.grade}`, `${esc(d.name)} · ${killTotal(d.kills)} kills · all aircraft home`.replace(' · all aircraft home', d.lost.length ? '' : ' · all aircraft home'), 'good'), 1600);
  toast(`<div style="display:flex;gap:8px;align-items:center"><div class="grade ${d.grade}">${d.grade}</div><div><b>MISSION REPORT — ${esc(d.name)}</b><br><span class="dim">${MISSIONS[d.mission].name} · ${esc(d.zone)}</span><br><span class="mono" style="font-size:11px">${d.returned}/${d.launched} RTB · ${killTotal(d.kills)} kills · +${fmtMoney(d.earnedF)}</span></div></div>`,
    d.lost.length ? 'err' : '', () => { UI.openDeb = d.id; setTab('stats'); }, 9000);
};
Hooks.end = result => showEnd(result);

const killTotal = k => Object.values(k).reduce((s, v) => s + v, 0);

function toast(html, cls = '', onClick = null, ms = 6000) {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = html;
  if (onClick) el.addEventListener('click', onClick);
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------------------------------------------------------------------------
// Init / events
// ---------------------------------------------------------------------------
function initUI(map) {
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('#dock [data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  // Every tap: unlock audio (browsers require a gesture), click sound + light haptic on controls
  document.addEventListener('pointerdown', e => {
    Sound.ensure();
    if (e.target.closest('button, [data-act], .zcard, select')) { Sound.click(); Haptic.fire('light'); }
  }, true);
  const body = $('panel-body');
  body.addEventListener('pointerdown', () => { UI.pointerDown = true; });
  $('hud-sel').addEventListener('pointerdown', () => { UI.pointerDown = true; });
  window.addEventListener('pointerup', () => { UI.pointerDown = false; });
  window.addEventListener('pointercancel', () => { UI.pointerDown = false; });
  body.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t) act(t.dataset.act, t.dataset, e); });
  $('strike').addEventListener('pointerdown', () => { UI.pointerDown = true; });
  $('strike').addEventListener('click', e => { const t = e.target.closest('[data-sk]'); if (t) strikeAction(t.dataset.sk); });
  body.addEventListener('change', e => { const t = e.target.closest('[data-change]'); if (t) change(t.dataset.change, t.value); });
  $('hud-sel').addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t) act(t.dataset.act, t.dataset, e); });
  $('comms').addEventListener('click', () => { UI.commsOpen = !UI.commsOpen; $('comms').classList.toggle('open', UI.commsOpen); UI.logDirty = true; });

  map.on('click', e => {
    if (!G) return;
    if (UI.sailMode) {
      const c = G.carriers.find(c => c.id === UI.sailMode);
      UI.sailMode = null; document.body.classList.remove('sail-mode');
      if (!c) return;
      if (!Terrain.isWater(e.latlng) && !Terrain.seaAt(e.latlng)) { toast('<b class="chip red">LAND</b> Pick a point at sea', 'err', null, 2500); return; }
      const r = sailCarrier(c, { lat: e.latlng.lat, lng: e.latlng.lng });
      if (r !== true) toast(`<b class="chip red">NO ROUTE</b> ${esc(r)}`, 'err', null, 3000);
      else { UI.sel = { type: 'carrier', ref: c }; updateSel(true); }
      UI.dirty = true;
      return;
    }
    const hit = pickAt(e.containerPoint);
    if (hit) {
      const r = hit.ref;
      if (hit.type === 'unit' || hit.type === 'friendly') {
        UI.zoneSel = r.zoneId; styleZones(); UI.dirty = true;
        openStrike({ type: hit.type, ref: r });
        return;
      }
      if (hit.type === 'pilot') { openStrike({ type: 'pilot', ref: r }); return; }
      if (hit.type === 'base' && G.enemyAir.some(e => !e.removed && e.target === r.id)) { openStrike({ type: 'defend', ref: r }); return; }
      closeStrike();
      UI.sel = hit; updateSel(true);
      return;
    }
    const z = G.zones.find(z => pointInPoly(e.latlng, z.poly));
    UI.sel = null; updateSel(true);
    if (!z) { closeStrike(); return; }
    // far out: first tap zooms into the zone; close in: tap ground to attack/scout that spot
    if (R.vz < 5.5) { closeStrike(); selectZone(z.id); return; }
    selectZone(z.id, false);
    if (z.active && !z.neutralized) openStrike({ type: 'area', zone: z, pos: { lat: e.latlng.lat, lng: e.latlng.lng } });
    else closeStrike();
  });
  map.on('dragstart', () => { UI.trackPkg = null; });
  map.on('mousemove', e => { $('hud-coords').textContent = `${e.latlng.lat.toFixed(2)}°  ${e.latlng.lng.toFixed(2)}°  Z${map.getZoom()}`; });
  map.on('zoomend', () => { $('hud-coords').textContent = `Z${map.getZoom()}`; });

  window.addEventListener('keydown', e => {
    if (!G || G.over) return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(G.paused ? G.speed : 0); }
    else if (e.key === '1') setSpeed(1);
    else if (e.key === '2') setSpeed(2);
    else if (e.key === '3' || e.key === '4') setSpeed(4);
    else if (e.key === 'Escape') { UI.sel = null; updateSel(true); closeStrike(); }
  });
}

function setSpeed(s) {
  if (s >= 2) Coach.event('speed');
  if (s === 0) G.paused = !G.paused;
  else { G.speed = s; G.paused = false; }
  document.body.classList.toggle('paused', G.paused);
  document.querySelectorAll('#dock [data-speed]').forEach(b => {
    const v = +b.dataset.speed;
    b.classList.toggle('on', v === 0 ? G.paused : !G.paused && v === G.speed);
  });
}

function setTab(t) {
  UI.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  UI.dirty = true;
  renderPanel(true);
  $('panel-body').scrollTop = 0;
}

function selectZone(id, fly = true) {
  UI.zoneSel = id;
  Coach.event('zone');
  styleZones();
  setTab('theater');
  if (fly) { const z = zoneById(id); R.map.flyToBounds(z.poly, { padding: [30, 30], maxZoom: 8, duration: 0.8 }); }
}

function planFor(zoneId, mission) {
  const z = zoneById(zoneId);
  UI.plan.zoneId = zoneId;
  UI.plan.mission = mission || (z && z.friendlies.some(f => !f.dead && f.hp < 70) ? 'cas' : 'strike');
  UI.plan.acIds = new Set(); UI.plan.loadouts = {};
  setTab('ops');
}

function planDefend(baseId) {
  Object.assign(UI.plan, { mission: 'defend', baseId, acIds: new Set(), loadouts: {} });
  setTab('ops');
}

function act(a, d, ev) {
  const P = UI.plan;
  switch (a) {
    case 'zone': selectZone(d.id); break;
    case 'back': UI.zoneSel = null; styleZones(); UI.dirty = true; break;
    case 'center': { const z = zoneById(d.id); R.map.flyTo([z.center.lat, z.center.lng], 6, { duration: 0.8 }); break; }
    case 'plan': planFor(d.id, d.m); break;
    case 'mission':
      P.mission = d.m; P.acIds = new Set(); P.loadouts = {};
      if (d.m === 'rescue' && !P.pilotId && G.pilots[0]) P.pilotId = G.pilots[0].id;
      if (d.m === 'defend' && !P.baseId) P.baseId = threatenedBase() || (G.aircraft[0] && G.aircraft[0].baseId);
      if (d.m !== 'rescue' && !P.zoneId) { const z = G.zones.find(z => z.active && !z.neutralized); if (z) P.zoneId = z.id; }
      break;
    case 'toggleAc': {
      const id = +d.id, ac = acById(id);
      if (!ac) break;
      if (P.acIds.has(id)) P.acIds.delete(id);
      else { if (d.dis === '1') { toast('Out of range for this objective', 'err', null, 2500); break; } P.acIds.add(id); P.loadouts[id] = presetLoadout(ac.type, P.mission, zoneById(P.zoneId)); }
      break;
    }
    case 'winc': case 'wdec': {
      const id = +d.id, ac = acById(id), T = AIRCRAFT[ac.type], lo = P.loadouts[id] || (P.loadouts[id] = {}), W = WEAPONS[d.w];
      if (a === 'winc') { if (loadWeight(lo) + W.w <= T.cap + 1e-9 && !(d.w === 'b61' && (lo.b61 || 0) >= 1)) lo[d.w] = (lo[d.w] || 0) + 1; }
      else if (lo[d.w]) { lo[d.w]--; if (!lo[d.w]) delete lo[d.w]; }
      break;
    }
    case 'preset': { const ac = acById(+d.id); P.loadouts[ac.id] = presetLoadout(ac.type, P.mission, zoneById(P.zoneId)); break; }
    case 'clearlo': P.loadouts[+d.id] = {}; break;
    case 'launch': {
      const plan = { ...P, acIds: [...P.acIds] };
      if (P.mission === 'nuclear' && !d.ok) {
        confirmBox('AUTHORIZE NUCLEAR RELEASE?', 'Threat +25 and funding halved for 4 minutes. Allied units inside the blast radius will be lost.', 'AUTHORIZE', () => act('launch', { ok: 1 }));
        break;
      }
      const res = launchPackage(plan);
      if (typeof res === 'string') toast(`<b class="chip red">ABORT</b> ${esc(res)}`, 'err', null, 3500);
      else { P.acIds = new Set(); P.loadouts = {}; if (Settings.get().autoTrack) UI.trackPkg = res.id; Haptic.fire('medium'); }
      break;
    }
    case 'track': UI.trackPkg = UI.trackPkg === +d.id ? null : +d.id; break;
    case 'recall': { const pkg = pkgById(+d.id); if (pkg) recallPackage(pkg); break; }
    case 'defend': { const b = baseById(d.id); if (b) openStrike({ type: 'defend', ref: b }); break; }
    case 'csar': { const pl = G.pilots.find(p => p.id === +d.id); if (pl) { openStrike({ type: 'pilot', ref: pl }); R.map.flyTo([pl.pos.lat, pl.pos.lng], Math.max(R.map.getZoom(), 6), { duration: 0.6 }); } break; }
    case 'reinforce': { const z = zoneById(d.z), f = z && z.friendlies.find(f => f.id === +d.id); if (f) openStrike({ type: 'airlift', ref: f }); break; }
    case 'cas': { const z = zoneById(d.z), f = z && z.friendlies.find(f => f.id === +d.id); if (f) openStrike({ type: 'friendly', ref: f }); break; }
    case 'strikeKind': {
      const z = zoneById(d.z);
      const us = z.units.filter(u => !u.dead && u.known && u.kind === d.k);
      const u = us.sort((a, b) => a.hp - b.hp)[0];
      if (u) { openStrike({ type: 'unit', ref: u }); R.map.flyTo([u.pos.lat, u.pos.lng], Math.max(R.map.getZoom(), 7), { duration: 0.6 }); }
      break;
    }
    case 'strikeTop': { const z = zoneById(d.id), u = topTarget(z); if (u) { openStrike({ type: 'unit', ref: u }); R.map.flyTo([u.pos.lat, u.pos.lng], Math.max(R.map.getZoom(), 7), { duration: 0.6 }); } else openStrike({ type: 'area', zone: z, pos: cp(z.center) }); break; }
    case 'scout': { const z = zoneById(d.id); openStrike({ type: 'area', zone: z, pos: cp(z.center) }); break; }
    case 'auto': {
      const z = zoneById(d.id);
      if (z) { z.auto = !z.auto; toast(z.auto ? `<b class="chip hud">AUTO</b> Standing orders: strike ${esc(z.short)}` : `<b class="chip gray">AUTO OFF</b> ${esc(z.short)}`, '', null, 2000); Coach.event('auto'); }
      ev && ev.stopPropagation();
      break;
    }
    case 'buyZone': UI.buyZone = d.id || null; UI.manualBase = false; UI.buyZoneChosen = true; break;
    case 'buyType': UI.buyType = d.t; UI.buyBase = null; break;
    case 'buy': {
      const res = buyAircraft(UI.buyType, UI.manualBase ? UI.buyBase : (stationFor(AIRCRAFT[UI.buyType], zoneById(UI.buyZone)) || {}).id);
      if (typeof res !== 'string') toast(`<b class="chip hud">DELIVERED</b> ${res.callsign} (${AIRCRAFT[res.type].short}) at ${esc(baseById(res.baseId).name)}`, '', null, 2500);
      if (typeof res === 'string') toast(`<b class="chip red">DENIED</b> ${esc(res)}`, 'err', null, 3000);
      break;
    }
    case 'base': { const b = baseById(d.id); R.map.flyTo([b.pos.lat, b.pos.lng], 6, { duration: 0.8 }); UI.sel = { type: 'base', ref: b }; updateSel(true); break; }
    case 'research': { const r = doResearch(d.id); if (r !== true) toast(esc(r), 'err', null, 2500); break; }
    case 'deb': UI.openDeb = UI.openDeb === +d.id ? null : +d.id; break;
    case 'closeSel': UI.sel = null; updateSel(true); return;
    case 'selRecall': { const pkg = pkgById(+d.id); if (pkg) recallPackage(pkg); break; }
    case 'selPlan': planFor(d.id); UI.sel = null; updateSel(true); break;
    case 'selFleet': UI.buyBase = d.id; setTab('fleet'); break;
    case 'buyCarrier': {
      const r = buyCarrier(UI.seaSel || CARRIER_SEAS[0].id);
      if (typeof r === 'string') toast(`<b class="chip red">DENIED</b> ${esc(r)}`, 'err', null, 3000);
      else { R.map.flyTo([r.pos.lat, r.pos.lng], 5, { duration: 0.8 }); UI.sel = { type: 'carrier', ref: r }; updateSel(true); }
      break;
    }
    case 'sail': {
      UI.sailMode = +d.id; document.body.classList.add('sail-mode');
      toast('<b class="chip hud">SET COURSE</b> Tap open water on the map', '', null, 4000);
      break;
    }
    case 'tlam': {
      const c = G.carriers.find(c => c.id === +d.id);
      const z = zoneById(UI.tlamZone) || G.zones.filter(z => z.active && !z.neutralized).sort((a, b) => dist(a.center, c.pos) - dist(b.center, c.pos))[0];
      const r = c ? fireTomahawks(c, z, +d.n) : 'Carrier lost';
      if (typeof r === 'string') toast(`<b class="chip red">ABORT</b> ${esc(r)}`, 'err', null, 3000);
      break;
    }
    case 'carrierFocus': { const c = G.carriers.find(c => c.id === +d.id); if (c) { R.map.flyTo([c.pos.lat, c.pos.lng], 6, { duration: 0.8 }); UI.sel = { type: 'carrier', ref: c }; updateSel(true); } break; }
  }
  UI.dirty = true;
  renderPanel(true);
}

function change(kind, v) {
  const P = UI.plan;
  if (kind === 'sea') UI.seaSel = v;
  else if (kind === 'tlamZone') UI.tlamZone = v;
  else if (kind === 'zone') { P.zoneId = v; P.friendlyId = null; P.acIds = new Set(); P.loadouts = {}; }
  else if (kind === 'pilot') { P.pilotId = +v; P.acIds = new Set(); }
  else if (kind === 'friendly') { P.friendlyId = +v; }
  else if (kind === 'base') { P.baseId = v; P.acIds = new Set(); P.loadouts = {}; }
  else if (kind === 'buyBase') { UI.buyBase = v; UI.manualBase = true; }
  UI.dirty = true;
  renderPanel(true);
}

// ---------------------------------------------------------------------------
// Per-frame UI tick
// ---------------------------------------------------------------------------
function uiTick(dt) {
  if (!G) return;
  $('tb-time').textContent = 'T+' + fmtTime(G.time);
  $('tb-funds').textContent = fmtMoney(G.funds);
  $('tb-funds').style.color = G.time < G.sanctionsUntil ? 'var(--warn)' : '';
  $('tb-rp').textContent = Math.floor(G.rp) + ' RP';
  const inc = (8 + 2 * Math.min(10, G.stats.zonesSecured)) * G.D.income * (G.time < G.sanctionsUntil ? 0.5 : 1), up = upkeep();
  $('tb-net').textContent = `${inc - up >= 0 ? '+' : '−'}${fmtMoney(Math.abs(inc - up))}/cycle`;
  $('tb-net').className = 'tb-net ' + (inc - up < 0 ? 'neg' : '');
  const th = G.threat;
  $('tb-threat-fill').style.width = th + '%';
  $('tb-threat').textContent = Math.floor(th) + '%';
  $('tb-threat').classList.toggle('hot', th >= 75);
  const act = G.zones.filter(z => z.active && !z.neutralized).length, sec = G.zones.filter(z => z.neutralized).length;
  $('tb-zones').textContent = G.mode === 'endless' ? `LVL ${G.level} · ${act} HOT · ${G.stats.zonesSecured} SEC` : `${act} HOT · ${sec}/8 SEC`;
  $('tb-zones-label').textContent = G.mode === 'endless' ? 'ENDLESS' : 'THEATERS';
  $('ops-badge').classList.toggle('show', G.pilots.length > 0);
  $('rnd-badge').classList.toggle('show', RESEARCH.some(r => !G.research.has(r.id) && (!r.req || G.research.has(r.req)) && G.rp >= r.cost));

  if (UI.logDirty) renderComms();
  if (Strike.open && !UI.pointerDown) { Strike.t -= dt; if (Strike.t <= 0) { Strike.t = 0.7; renderStrike(); } }
  const now = performance.now();
  if (now - UI.lastPanel > (UI.dirty ? 250 : 1000)) renderPanel();
  UI.selT -= dt;
  if (UI.selT <= 0) { UI.selT = 0.25; updateSel(); }

  // camera tracking
  if (UI.trackPkg) {
    UI.trackT -= dt;
    const pkg = pkgById(UI.trackPkg);
    const live = pkg ? pkg.acIds.map(acById).filter(a => a && a.status === 'airborne') : [];
    if (!live.length) UI.trackPkg = null;
    else if (UI.trackT <= 0) {
      UI.trackT = 0.3;
      const lat = live.reduce((s, a) => s + a.pos.lat, 0) / live.length, lng = live.reduce((s, a) => s + a.pos.lng, 0) / live.length;
      R.map.panTo([lat, lng], { animate: true, duration: 0.3, easeLinearity: 1, noMoveStart: true });
    }
  }
}

function renderComms() {
  UI.logDirty = false;
  const n = UI.commsOpen ? 22 : Settings.get().comms === 'compact' ? 3 : 6;
  const lines = G.log.slice(-n);
  $('comms').innerHTML = `<div class="hdr"><span>◉ COMMS / TACTICAL NET</span><span>${UI.commsOpen ? '▼ COLLAPSE' : '▲ EXPAND'}</span></div>` +
    lines.map(l => `<div class="ln c-${l.cls}"><span class="t">${fmtTime(l.t)}</span>${esc(l.text)}</div>`).join('');
}

function renderPanel(force = false) {
  if (!G) return;
  if (!force) {
    if (UI.pointerDown) return;
    const ae = document.activeElement;
    if (ae && ae.tagName === 'SELECT' && $('panel-body').contains(ae)) return;
  }
  UI.lastPanel = performance.now();
  UI.dirty = false;
  const body = $('panel-body'), st = body.scrollTop;
  let h = '';
  switch (UI.tab) {
    case 'theater': h = tabTheater(); break;
    case 'ops': h = tabOps(); break;
    case 'fleet': h = tabFleet(); break;
    case 'rnd': h = tabResearch(); break;
    case 'stats': h = tabStats(); break;
  }
  body.innerHTML = h;
  body.scrollTop = st;
}

const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${clamp(pct, 0, 100)}%"></i></div>`;

// ---------------------------------------------------------------------------
// THEATER
// ---------------------------------------------------------------------------
function zoneState(z) {
  if (!z.active) return { cls: 'dormant', chip: '<span class="chip gray">MONITORING</span>' };
  if (z.neutralized) return { cls: 'secured', chip: '<span class="chip hud">SECURED</span>' };
  const crit = z.friendlies.some(f => !f.dead && f.hp < 35);
  return crit ? { cls: 'critical', chip: '<span class="chip warn pulse">CRITICAL</span>' } : { cls: 'active', chip: '<span class="chip red">ACTIVE</span>' };
}

function tabTheater() {
  if (UI.zoneSel) return zoneDetail(zoneById(UI.zoneSel));
  let h = '';
  if (G.pilots.length) {
    h += `<div class="sec-title warn">⚠ PERSONNEL RECOVERY</div>`;
    for (const p of G.pilots) h += `<div class="pilot-card"><div><b>${esc(p.callsign)}</b> <span class="dim">beacon</span> <span class="mono" style="color:var(--gold)">${fmtTime(p.expires - G.time)}</span></div><button class="btn sm gold" data-act="csar" data-id="${p.id}">SEND CSAR</button></div>`;
  }
  const act = G.zones.filter(z => z.active && !z.neutralized).sort((a, b) => aliveValue(b) / b.initValue - aliveValue(a) / a.initValue);
  const dor = G.zones.filter(z => !z.active).sort((a, b) => a.activateAt - b.activateAt);
  const sec = G.zones.filter(z => z.neutralized);
  const inbound = G.enemyAir.filter(e => e.homefront && !e.removed);
  if (inbound.length) {
    const b = baseById(inbound[0].target);
    h += `<div class="sec-title warn">⚠ HOMEFRONT UNDER ATTACK</div><div class="pilot-card" style="border-color:rgba(255,77,77,.5);background:rgba(50,8,8,.35)"><div><b>${esc(b.name)}</b> <span class="dim">${inbound.length} inbound</span></div><button class="btn sm red" data-act="defend" data-id="${b.id}">DEFEND</button></div>`;
  }
  h += flightsList();
  h += `<div class="sec-title">FLASHPOINTS · ${act.length} ACTIVE${G.mode === 'endless' ? ` · LEVEL ${G.level}` : ''}</div>`;
  for (const z of [...act, ...dor, ...sec]) {
    const st = zoneState(z);
    h += `<div class="zcard ${st.cls}" data-act="zone" data-id="${z.id}"><div class="zc-head"><span class="zc-name">${esc(z.name)}</span>${z.active && !z.neutralized ? `<button class="auto-chip ${z.auto ? 'on' : ''}" data-act="auto" data-id="${z.id}" title="Standing orders">AUTO</button>` : ''}${st.chip}</div>
      <div class="zc-sub">${esc(z.region)} · ${FACTIONS[z.faction].name}</div>`;
    if (z.active && !z.neutralized) {
      const pr = zoneProgress(z);
      h += `<div class="zc-row"><label>LIBERATED</label>${bar(pr.pct)}<span>${pr.pct}%</span></div>
        <div class="goals">${pr.goals.map(g => `<span class="${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${g.short}</span>`).join('')}</div>`;
      const fr = z.friendlies.filter(f => !f.dead);
      if (z.friendlies.length) h += `<div class="zc-row"><label>ALLIES</label>${fr.length ? fr.map(f => bar(f.hp, f.hp < 35 ? 'warn' : 'blue')).join('') : '<span style="width:auto;color:var(--enemy)">OVERRUN</span>'}</div>`;
    } else if (!z.active) h += `<div class="zc-row"><label>${G.mode === 'endless' ? 'IGNITES' : 'ESCALATION'}</label><span style="width:auto;color:var(--dim)">~${fmtTime(z.activateAt - G.time)}</span></div>`;
    h += `</div>`;
  }
  return h;
}

function zoneDetail(z) {
  const st = zoneState(z);
  let h = `<div class="btn-row" style="margin:0 0 8px"><button class="btn sm" data-act="back">◂ ALL ZONES</button><button class="btn sm" data-act="center" data-id="${z.id}">◎ CENTER</button></div>
    <div class="zc-head"><span class="zc-name" style="font-size:20px">${esc(z.name)}</span>${st.chip}</div>
    <div class="zc-sub">${esc(z.region)} · ${FACTIONS[z.faction].name}${z.nuked ? ' · <span style="color:var(--gold)">☢ IRRADIATED</span>' : ''}</div>
    <p class="brief">${esc(z.brief)}</p>`;
  if (!z.active) return h + `<div class="small dim">No hostile action confirmed. Analysts expect escalation in ~${fmtTime(z.activateAt - G.time)}. Pre-position aircraft at nearby bases.</div>`;
  if (z.neutralized) return h + `<div class="small" style="color:var(--hud)">Sector secured. Enemy forces have surrendered or withdrawn.</div>`;

  const alive = z.units.filter(u => !u.dead), known = alive.filter(u => u.known), unk = alive.length - known.length;
  const str = Math.round((aliveValue(z) / z.initValue) * 100);
  const hq = alive.find(u => u.kind === 'hq'), af = alive.find(u => u.kind === 'airfield');
  const radarUp = alive.some(u => u.kind === 'radar' || u.kind === 'hq');
  const pr = zoneProgress(z);
  h += `<button class="auto-row ${z.auto ? 'on' : ''}" data-act="auto" data-id="${z.id}"><span class="sw"><i></i></span><span><b>AUTO-STRIKE ${z.auto ? 'ON' : 'OFF'}</b><small>${z.auto ? 'Ready aircraft that can reach this zone keep hitting its most dangerous targets.' : 'Turn on to let your air wing fight this zone by itself.'}</small></span></button>
    <div class="btn-row" style="margin:0 0 10px"><button class="btn pri" data-act="strikeTop" data-id="${z.id}">▲ STRIKE TOP TARGET</button><button class="btn" data-act="scout" data-id="${z.id}">SCOUT</button></div>
    <div class="zc-row" style="margin-bottom:4px"><label>LIBERATED</label>${bar(pr.pct)}<span>${pr.pct}%</span></div>
    <div class="goal-list">${pr.goals.map(g => `<div class="${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${g.label}</div>`).join('')}</div>
    <div class="small dim" style="margin:6px 0 2px">${known.length} confirmed targets${unk ? ` · ~${Math.max(1, Math.round(unk / 2) * 2)} still hidden (scout to reveal)` : ''}. Tap a row or a map marker to strike it.</div>`;
  if (G.time < z.weatherUntil) h += `<div class="small" style="color:var(--warn);margin-top:6px">⛈ Storm front: weapon accuracy reduced (${fmtTime(z.weatherUntil - G.time)})</div>`;

  h += `<div class="sec-title">CONFIRMED HOSTILES</div>`;
  const counts = {};
  known.forEach(u => { counts[u.kind] = (counts[u.kind] || 0) + 1; });
  const order = ['sam_lr', 'shorad', 'destroyer', 'frigate', 'fac', 'aaa', 'manpad', 'radar', 'hq', 'airfield', 'mbt', 'ifv', 'arty', 'technical', 'inf'];
  const amphibN = known.filter(u => u.amphib).length;
  const kinds = order.filter(k => counts[k]);
  if (!kinds.length) h += `<div class="small dim">No confirmed contacts. Send a RECON flight or drone.</div>`;
  for (const k of kinds) {
    const E = ENEMY[k], A = E.aa;
    h += `<div class="frow tap" data-act="strikeKind" data-z="${z.id}" data-k="${k}"><span class="fk ${A ? 'aa' : ''}">${artSVG(UNIT_ART[k], A ? '#ff6b6b' : '#d26a6a')}<i>${E.short}</i></span><div>${E.name}<small>${A ? `${A.type === 'radar' ? 'Radar SAM' : A.type === 'ir' ? 'IR missile' : 'Guns'} · ${A.range} km` : E.cls === 'structure' ? 'High-value target' : E.naval ? 'Warship' : `Ground · ${E.cls}`}</small></div><span class="n">×${counts[k]} ▸</span></div>`;
  }
  if (amphibN) h += `<div class="small" style="margin-top:6px;color:#8fc8ff">≈ ${amphibN} amphibious IFV${amphibN > 1 ? 's' : ''} operating off the coast</div>`;
  if (unk) h += `<div class="small dim" style="margin-top:6px">⚠ ~${Math.max(1, Math.round(unk / 2) * 2)} unconfirmed contacts may include air defenses.</div>`;

  h += `<div class="sec-title">ENEMY C2 &amp; AIR</div>
    <div class="frow"><span class="fk">HQ</span><div>Command post<small>${hq ? (hq.known ? 'Active — reinforcing every ~60s' : 'Suspected, location unknown') : 'Destroyed'}</small></div><span class="n" style="color:${hq ? 'var(--enemy)' : 'var(--hud)'}">${hq ? 'UP' : 'DOWN'}</span></div>
    ${['sam_lr', 'shorad', 'frigate'].some(k => z.initCounts[k]) ? `<div class="frow"><span class="fk">RADAR</span><div>Air defense network<small>${radarUp ? 'Integrated — full SAM accuracy' : 'Degraded — SAM accuracy −30%'}</small></div><span class="n" style="color:${radarUp ? 'var(--enemy)' : 'var(--hud)'}">${radarUp ? 'UP' : 'DOWN'}</span></div>` : ''}`;
  if (FACTIONS[z.faction].air && z.initCounts.airfield) {
    const aloft = G.enemyAir.filter(e => e.zoneId === z.id && e.kind === 'fighter').length;
    h += `<div class="frow"><span class="fk">AIR</span><div>${FACTIONS[z.faction].fighter} interceptors<small>${af ? 'Airbase operational' : 'Airbase destroyed'} · ${aloft} aloft</small></div><span class="n" style="color:${af ? 'var(--enemy)' : 'var(--hud)'}">${af ? 'UP' : 'DOWN'}</span></div>`;
  }
  if (z.friendlies.length) {
    h += `<div class="sec-title">ALLIED POSITIONS</div>`;
    for (const f of z.friendlies) {
      h += `<div class="frow"><span class="fk" style="color:var(--friend);border-color:rgba(79,163,255,.5)">ALLY</span><div>${esc(f.name)}<small>${f.dead ? '<span style="color:var(--enemy)">OVERRUN</span>' : f.underFire ? '<span style="color:var(--warn)">UNDER FIRE</span>' : 'Holding'}</small>${f.dead ? '' : bar(f.hp, f.hp < 35 ? 'warn' : 'blue')}</div>
        ${f.dead ? '' : `<span class="btn-pair"><button class="btn sm" data-act="cas" data-z="${z.id}" data-id="${f.id}">SUPPORT</button><button class="btn sm" data-act="reinforce" data-z="${z.id}" data-id="${f.id}">AIRLIFT</button></span>`}</div>`;
    }
  }
  if (Settings.get().advanced) h += `<div class="btn-row"><button class="btn" data-act="plan" data-id="${z.id}">ADVANCED PLANNER</button></div>`;
  return h;
}

// ---------------------------------------------------------------------------
// OPS — package builder + active packages
// ---------------------------------------------------------------------------
function tabOps() {
  const P = UI.plan;
  const missions = ['strike', 'sead', 'cas', 'recon', 'cap', 'rescue', 'reinforce', 'defend'];
  if (wUnlocked('b61')) missions.push('nuclear');
  let h = `<div class="sec-title">NEW PACKAGE</div><div class="mission-grid">` +
    missions.map(m => `<button class="${P.mission === m ? 'on' : ''} ${m === 'nuclear' ? 'nuke' : ''}" data-act="mission" data-m="${m}">${MISSIONS[m].name}</button>`).join('') +
    `</div><div class="mdesc">${MISSIONS[P.mission].desc}</div>`;

  const zones = G.zones.filter(z => z.active && !z.neutralized);
  if (P.mission !== 'rescue' && (!P.zoneId || !zones.some(z => z.id === P.zoneId))) P.zoneId = zones[0] ? zones[0].id : null;
  if (P.mission === 'defend') {
    const hb = threatenedBase();
    if (!baseById(P.baseId)) P.baseId = hb || (G.aircraft[0] && G.aircraft[0].baseId) || G.bases[0].id;
    const opts = G.bases.filter(b => b.id === P.baseId || G.aircraft.some(a => a.baseId === b.id));
    h += `<div class="field"><label>BASE</label><select data-change="base">${opts.map(b => `<option value="${b.id}" ${b.id === P.baseId ? 'selected' : ''}>${esc(b.name)}${b.id === hb ? ' — UNDER ATTACK' : ''}</option>`).join('')}</select></div>`;
  } else if (P.mission === 'rescue') {
    if (!G.pilots.some(p => p.id === P.pilotId)) P.pilotId = G.pilots[0] ? G.pilots[0].id : null;
    h += G.pilots.length
      ? `<div class="field"><label>SURVIVOR</label><select data-change="pilot">${G.pilots.map(p => `<option value="${p.id}" ${p.id === P.pilotId ? 'selected' : ''}>${esc(p.callsign)} — ${fmtTime(p.expires - G.time)} left</option>`).join('')}</select></div>`
      : `<div class="small dim">No downed aircrew. Good.</div>`;
  } else {
    h += zones.length
      ? `<div class="field"><label>TARGET</label><select data-change="zone">${zones.map(z => `<option value="${z.id}" ${z.id === P.zoneId ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>`
      : `<div class="small dim">No active hostile zones.</div>`;
    if (P.mission === 'reinforce' && P.zoneId) {
      const fr = zoneById(P.zoneId).friendlies.filter(f => !f.dead);
      if (!fr.some(f => f.id === P.friendlyId)) P.friendlyId = fr[0] ? fr[0].id : null;
      h += fr.length ? `<div class="field"><label>POSITION</label><select data-change="friendly">${fr.map(f => `<option value="${f.id}" ${f.id === P.friendlyId ? 'selected' : ''}>${esc(f.name)} — ${Math.round(f.hp)}%</option>`).join('')}</select></div>`
        : `<div class="small dim">No allied positions in this zone.</div>`;
    }
  }
  const tgt = missionTarget(P);
  const z = P.mission !== 'rescue' && P.mission !== 'defend' && P.zoneId ? zoneById(P.zoneId) : null;

  if (z && ['strike', 'sead', 'cas', 'recon', 'cap', 'nuclear'].includes(P.mission)) {
    const aa = z.units.filter(u => !u.dead && u.known && ENEMY[u.kind].aa);
    const lr = aa.filter(u => ENEMY[u.kind].aa.range >= 40).length;
    h += `<div class="small" style="margin:4px 0 2px;color:${lr ? 'var(--enemy)' : 'var(--dim)'}">Known air defense: ${aa.length} site${aa.length === 1 ? '' : 's'}${lr ? ` (${lr} long-range)` : ''}${z.units.some(u => !u.dead && !u.known) ? ' · unknowns present' : ''}</div>`;
  }

  // aircraft list
  const eligible = G.aircraft.filter(a => canFly(a.type, P.mission));
  const ready = eligible.filter(a => a.status === 'ready');
  const busy = eligible.filter(a => a.status !== 'ready');
  for (const id of [...P.acIds]) { const a = acById(id); if (!a || a.status !== 'ready') P.acIds.delete(id); }
  if (tgt) ready.sort((a, b) => dist(baseById(a.baseId).pos, tgt.pos) - dist(baseById(b.baseId).pos, tgt.pos));
  h += `<div class="sec-title">AVAILABLE AIRCRAFT · ${ready.length}</div>`;
  if (!eligible.length) h += `<div class="small dim">No aircraft in the fleet can fly ${MISSIONS[P.mission].name}. ${P.mission === 'rescue' || P.mission === 'reinforce' ? 'Buy a UH-60M Black Hawk in FLEET.' : ''}</div>`;
  let cost = 0, eta = 0, survSum = 0;
  for (const ac of ready) {
    const T = AIRCRAFT[ac.type], base = baseById(ac.baseId);
    const rc = tgt ? rangeCheck(ac, tgt.pos) : null;
    const dis = !rc || !rc.ok;
    const sel = P.acIds.has(ac.id);
    const surv = estimateSurvival(ac.type, z, P.mission);
    const sc = surv > 0.75 ? 'good' : surv > 0.45 ? 'mid' : 'bad';
    const e = rc ? rc.d / (KM_TRANSIT * T.speed) : 0;
    if (sel) { cost += loadCost(P.loadouts[ac.id] || {}); eta = Math.max(eta, e); survSum += surv; }
    h += `<div class="acrow ${sel ? 'sel' : ''} ${dis ? 'dis' : ''}">
      <div class="ac-line" data-act="toggleAc" data-id="${ac.id}" data-dis="${dis ? 1 : 0}">
        <div class="ac-check">${sel ? '✓' : ''}</div>
        <div class="ac-art">${artSVG(AC_ART[ac.type])}</div>
        <div class="ac-main"><b>${ac.callsign}</b><span class="t">${T.short}</span>
          <div class="ac-sub">${esc(base.name)} · ${rc ? fmtKm(rc.d) : '—'} · ETA ${rc ? fmtTime(e) : '—'}${ac.hp < ac.maxHp ? ' · DMG' : ''}</div></div>
        ${dis ? '<span class="chip red">NO RANGE</span>' : `<div class="surv ${sc}">${Math.round(surv * 100)}%<small>SURVIVAL</small></div>`}
      </div>${sel ? loadoutEditor(ac) : ''}</div>`;
  }
  if (busy.length) h += `<div class="small dim" style="margin-top:4px">${busy.map(a => `${a.callsign} ${a.status === 'airborne' ? '(airborne)' : `(rearm ${fmtTime(a.readyAt - G.time)})`}`).join(' · ')}</div>`;

  const n = P.acIds.size;
  const can = n > 0 && tgt && cost <= G.funds;
  h += `<div class="launchbar"><div class="sum"><span>AIRCRAFT <b>${n}</b></span><span>MUNITIONS <b style="color:${cost > G.funds ? 'var(--enemy)' : ''}">${fmtMoney(cost)}</b></span><span>ETA <b>${n ? fmtTime(eta) : '—'}</b></span><span>EST. SURV <b>${n ? Math.round((survSum / n) * 100) + '%' : '—'}</b></span></div>
    <button class="btn pri" data-act="launch" ${can ? '' : 'disabled'}>${P.mission === 'nuclear' ? '☢ AUTHORIZE RELEASE' : '▲ LAUNCH PACKAGE'}</button></div>`;

  // active packages
  const live = G.pkgs.filter(p => !p.done);
  if (live.length) {
    h += `<div class="sec-title">PACKAGES IN FLIGHT · ${live.length}</div>`;
    for (const pkg of live) {
      h += `<div class="pkg"><div class="pkg-head"><div><b>${pkg.name}</b> <span class="chip ${pkg.mission === 'nuclear' ? 'gold' : 'hud'}">${MISSIONS[pkg.mission].name}</span><div class="ac-sub">${esc(pkg.targetName)} · T+${fmtTime(G.time - pkg.launchedAt)}</div></div><span class="mono small" style="color:var(--hud)">${killTotal(pkg.stats.kills)} K</span></div>`;
      pkg.roster.forEach((r, i) => {
        const ac = acById(pkg.acIds[i]);
        if (!ac) { h += `<div class="pkg-mem lost"><span>${r.callsign}</span><span class="st">${pkg.stats.lost.some(l => l.callsign === r.callsign) ? 'LOST' : 'LANDED'}</span><span></span></div>`; return; }
        const landed = ac.pkgId !== pkg.id;
        const state = landed ? 'LANDED' : { outbound: 'OUTBOUND', combat: 'ENGAGED', rtb: 'RTB', hover: 'ON STATION' }[ac.state] || '—';
        const ammo = Object.entries(ac.ammo).filter(([, v]) => v > 0).map(([w, v]) => `${v}${WEAPONS[w].short[0]}`).join(' ');
        h += `<div class="pkg-mem"><span>${ac.callsign} <span class="st">${landed ? '' : ammo}</span></span><span class="st" style="color:${state === 'ENGAGED' ? 'var(--warn)' : ''}">${state}</span>${bar((ac.hp / ac.maxHp) * 100, ac.hp / ac.maxHp < 0.5 ? 'warn' : '')}</div>`;
      });
      h += `<div class="pkg-btns"><button class="btn sm" data-act="track" data-id="${pkg.id}">${UI.trackPkg === pkg.id ? '◉ TRACKING' : '◎ TRACK'}</button><button class="btn sm red" data-act="recall" data-id="${pkg.id}">RECALL</button></div></div>`;
    }
  }
  return h;
}

function loadoutEditor(ac) {
  const T = AIRCRAFT[ac.type], lo = UI.plan.loadouts[ac.id] || {}, w = loadWeight(lo);
  if (!T.cap) return `<div class="loadout small dim">Utility airframe — no weapons. Flares: ${T.flares}</div>`;
  let h = `<div class="loadout"><div class="lo-head"><span>PAYLOAD</span>${bar((w / T.cap) * 100)}<span class="mono">${w}/${T.cap}</span>
    <button class="btn sm" data-act="preset" data-id="${ac.id}">AUTO</button><button class="btn sm" data-act="clearlo" data-id="${ac.id}">CLR</button></div><div class="lo-grid">`;
  for (const wid of T.weapons) {
    const W = WEAPONS[wid], n = lo[wid] || 0, unl = wUnlocked(wid);
    if (!unl) { h += `<div class="wchip locked"><div class="wn"><b>${W.short}</b><small>R&amp;D required</small></div></div>`; continue; }
    h += `<div class="wchip ${n ? 'has' : ''}"><div class="wn"><b>${W.short}</b><small>${W.role} · ${fmtMoney(W.cost)}</small></div>
      <div class="stepper"><button data-act="wdec" data-id="${ac.id}" data-w="${wid}">−</button><span>${n}</span><button data-act="winc" data-id="${ac.id}" data-w="${wid}">+</button></div></div>`;
  }
  h += `</div>${T.gun ? `<div class="ac-sub" style="margin-top:4px">+ ${T.gun.name} (${T.gun.ammo} bursts)</div>` : ''}</div>`;
  return h;
}

// ---------------------------------------------------------------------------
// FLEET
// ---------------------------------------------------------------------------
function tabFleet() {
  const T = AIRCRAFT[UI.buyType];
  const eligible = G.bases.filter(b => baseAllows(b, T));
  if (!eligible.some(b => b.id === UI.buyBase)) {
    const withAc = eligible.find(b => G.aircraft.some(a => a.baseId === b.id));
    UI.buyBase = (withAc || eligible[0]).id;
  }
  // Buy flow first (pick a jet → pick where it's needed → buy); details and the navy below
  const order = Object.keys(AIRCRAFT).sort((a, b) => G.unlocked.has(b) - G.unlocked.has(a));
  let h = `<div class="sec-title">BUY AIRCRAFT · ${fmtMoney(G.funds)} AVAILABLE</div><div class="typegrid">` +
    order.map(k => {
      const A = AIRCRAFT[k], un = G.unlocked.has(k);
      return `<button class="${UI.buyType === k ? 'on' : ''} ${un ? '' : 'locked'}" data-act="buyType" data-t="${k}">${artSVG(AC_ART[k], un ? 'var(--hud)' : 'var(--dim)')}<b>${A.short}</b><small>${un ? fmtMoney(A.cost) : 'R&D'}</small></button>`;
    }).join('') + `</div>`;
  const un = G.unlocked.has(UI.buyType);
  h += `<div class="buy-sum"><b>${T.name}</b> <span class="dim">· ${T.role} · upkeep ${fmtMoney(UPKEEP[T.cls])}/cycle</span></div>
    ${un ? stationPicker(T, eligible) : '<div class="small dim" style="margin:8px 0">Unlock this aircraft in the R&amp;D tab.</div>'}
    <button class="btn pri" style="width:100%;margin-top:4px;min-height:46px" data-act="buy" ${un && G.funds >= T.cost ? '' : 'disabled'}>${un ? `▲ BUY ${T.short} · ${fmtMoney(T.cost)}` : 'LOCKED: RESEARCH IN R&D'}</button>
    <details class="manual" style="margin-top:10px"><summary>Aircraft details</summary>
    <div class="hero">${artSVG(AC_ART[UI.buyType], un ? 'var(--hud)' : 'var(--dim)')}<div class="hero-grid"></div></div>
    <div class="small dim" style="margin-top:6px">${T.desc}</div>
    <div class="specs">
      <div><span>AIRFRAME</span>${Math.round(T.hp * (hasRes('u_armor') ? 1.25 : 1))} HP</div><div><span>SPEED</span>${T.speed.toFixed(2)}×</div>
      <div><span>STEALTH</span>${Math.round(stealthOf(T) * 100)}%</div><div><span>PAYLOAD</span>${T.cap} pts</div>
      <div><span>RANGE</span>${fmtKm(rangeOf(T))}</div><div><span>SENSOR</span>${T.sensor} km</div>
      <div><span>ALTITUDE</span>${T.alt.toUpperCase()}</div><div><span>FLARES</span>${T.flares}</div>
    </div>
    <div class="ac-sub" style="white-space:normal">ARMAMENT: ${T.weapons.map(w => WEAPONS[w].short).join(' · ') || 'none'}${T.gun ? ' · ' + T.gun.name : ''}${T.naval ? ' · <span style="color:#8fdcff">CARRIER CAPABLE</span>' : ''}</div></details>`;
  h += navySection();

  h += `<div class="sec-title">AIR WING · ${G.aircraft.length} AIRFRAMES</div>`;
  const empty = [];
  for (const b of G.bases) {
    const acs = G.aircraft.filter(a => a.baseId === b.id);
    if (!acs.length) { empty.push(b); continue; }
    h += `<div class="base"><div class="base-head" data-act="base" data-id="${b.id}"><b>${esc(b.name)}</b><span class="ac-sub">${b.allows.join(' · ').toUpperCase()}</span></div>`;
    for (const a of acs) {
      const st = a.status === 'ready' ? '<span class="st-ready">READY</span>' : a.status === 'rearm' ? `<span class="st-rearm">REARM ${fmtTime(a.readyAt - G.time)}</span>` : '<span class="st-air">AIRBORNE</span>';
      h += `<div class="base-ac"><span>${a.callsign} <span class="dim">${AIRCRAFT[a.type].short}</span></span>${bar((a.hp / a.maxHp) * 100, a.hp / a.maxHp < 0.5 ? 'warn' : '')}${st}</div>`;
    }
    h += `</div>`;
  }
  if (empty.length) h += `<div class="small dim">Unoccupied: ${empty.map(b => `<a data-act="base" data-id="${b.id}" style="color:var(--dim);text-decoration:underline;cursor:pointer">${esc(b.name)}</a>`).join(', ')}</div>`;
  return h;
}

// ---------------------------------------------------------------------------
// R&D
// ---------------------------------------------------------------------------
function tabResearch() {
  let h = `<div class="statgrid" style="grid-template-columns:1fr 1fr"><div class="stat"><label>AVAILABLE</label><b>${Math.floor(G.rp)} RP</b></div><div class="stat"><label>COMPLETED</label><b>${G.research.size}/${RESEARCH.length}</b></div></div>
    <div class="small dim" style="margin-top:6px">Earn RP by destroying targets, securing zones and recovering pilots.</div>`;
  for (const cat of ['Aircraft', 'Navy', 'Weapons', 'Upgrades']) {
    h += `<div class="sec-title">${cat.toUpperCase()}</div>`;
    for (const r of RESEARCH.filter(r => r.cat === cat)) {
      const done = G.research.has(r.id), locked = r.req && !G.research.has(r.req);
      const desc = r.desc || (r.unlockAc ? AIRCRAFT[r.unlockAc].desc + ` (${fmtMoney(AIRCRAFT[r.unlockAc].cost)} per airframe)` : '');
      const reqName = locked ? RESEARCH.find(x => x.id === r.req).name : '';
      h += `<div class="rcard ${done ? 'done' : ''} ${locked ? 'locked' : ''}">${r.unlockAc ? `<div class="r-art">${artSVG(AC_ART[r.unlockAc], done ? 'var(--hud)' : 'var(--dim)')}</div>` : ''}<div class="rt"><b>${r.name}</b><small>${desc}${locked ? `<br>Requires ${reqName}` : ''}</small></div>
        ${done ? '<span class="chip hud">✓ DONE</span>' : `<button class="btn sm ${r.id === 'w_b61' ? 'gold' : ''}" data-act="research" data-id="${r.id}" ${!locked && G.rp >= r.cost ? '' : 'disabled'}>${r.cost} RP</button>`}</div>`;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// RECORD
// ---------------------------------------------------------------------------
function tabStats() {
  const s = G.stats, kills = killTotal(s.kills);
  let h = `<div class="sec-title">CAMPAIGN RECORD · ${G.D.name}</div><div class="statgrid">
    <div class="stat"><label>SORTIES</label><b>${s.sorties}</b></div><div class="stat"><label>KILLS</label><b>${kills}</b></div><div class="stat"><label>AIRCRAFT LOST</label><b class="red">${s.lostCount}</b></div>
    <div class="stat"><label>MUNITIONS</label><b>${s.fired}</b></div><div class="stat"><label>ACCURACY</label><b>${s.fired ? Math.round((s.hits / s.fired) * 100) : 0}%</b></div><div class="stat"><label>AIR KILLS</label><b>${s.airKills}</b></div>
    <div class="stat"><label>ZONES SECURED</label><b>${s.zonesSecured}${G.mode === 'endless' ? '' : '/8'}</b></div><div class="stat"><label>RESCUED</label><b>${s.rescued}</b></div><div class="stat"><label>CAPTURED</label><b class="red">${s.captured}</b></div>
    <div class="stat"><label>SPENT</label><b>${fmtMoney(s.spent)}</b></div><div class="stat"><label>EARNED</label><b>${fmtMoney(s.earned)}</b></div><div class="stat"><label>SCORE</label><b>${finalScore().score}</b></div></div>`;
  if (G.mode === 'endless') h += `<div class="statgrid" style="margin-top:6px"><div class="stat"><label>LEVEL</label><b>${G.level}</b></div><div class="stat"><label>HOMEFRONT HITS</label><b class="red">${s.homefrontHits}</b></div><div class="stat"><label>REPAIR COSTS</label><b class="red">${fmtMoney(s.homefrontLoss)}</b></div></div>`;
  const kk = Object.entries(s.kills);
  if (kk.length) h += `<div class="sec-title">DESTROYED</div><div class="ac-sub" style="white-space:normal;line-height:1.6">${kk.map(([k, v]) => `${(ENEMY[k] ? ENEMY[k].short : ({ fighter: 'FIGHTER', cruise: 'CRUISE MSL', drone: 'DRONE', ashm: 'ANTI-SHIP MSL' }[k] || k.toUpperCase()))} ×${v}`).join(' · ')}</div>`;
  const ll = Object.entries(s.losses);
  if (ll.length) h += `<div class="sec-title">LOSSES</div><div class="ac-sub" style="white-space:normal;line-height:1.6;color:#ff8a8a">${ll.map(([k, v]) => `${AIRCRAFT[k].short} ×${v}`).join(' · ')}</div>`;
  h += `<div class="sec-title">MISSION REPORTS · ${G.debriefs.length}</div>`;
  if (!G.debriefs.length) h += `<div class="small dim">Reports appear here once a package has fully returned.</div>`;
  for (const d of G.debriefs.slice(0, 40)) {
    h += `<div class="deb"><div class="deb-head" data-act="deb" data-id="${d.id}"><div class="grade ${d.grade}">${d.grade}</div><div style="flex:1;min-width:0"><b>${d.name}</b> <span class="chip hud">${MISSIONS[d.mission].name}</span><div class="ac-sub">${esc(d.zone)} · T+${fmtTime(d.time)} · ${d.returned}/${d.launched} RTB</div></div><span class="mono small">${killTotal(d.kills)} K</span></div>`;
    if (UI.openDeb === d.id) {
      h += `<div class="deb-body">
        <div class="row"><span>Roster</span><span>${d.roster.map(r => r.callsign).join(', ')}</span></div>
        <div class="row"><span>Duration</span><span>${fmtTime(d.duration)}</span></div>
        <div class="row"><span>Munitions fired / hits</span><span>${d.fired} / ${d.hits} (${Math.round(d.acc * 100)}%)</span></div>
        <div class="row"><span>Kills</span><span>${Object.entries(d.kills).map(([k, v]) => `${ENEMY[k] ? ENEMY[k].short : k.toUpperCase()}×${v}`).join(' ') || '—'}</span></div>
        ${d.revealed ? `<div class="row"><span>Contacts revealed</span><span>${d.revealed}</span></div>` : ''}
        ${d.objective ? `<div class="row"><span>Objective</span><span style="color:var(--hud)">${esc(d.objective)}</span></div>` : ''}
        <div class="row"><span>Munitions cost</span><span>${fmtMoney(d.cost)}</span></div>
        <div class="row"><span>Earned</span><span style="color:var(--hud)">+${fmtMoney(d.earnedF)} · +${Math.round(d.earnedRP)} RP</span></div>
        ${d.lost.map(l => `<div class="row lost"><span>LOST ${l.callsign}</span><span>${esc(l.by)}</span></div>`).join('')}
      </div>`;
    }
    h += `</div>`;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Selection card (top-left of map)
// ---------------------------------------------------------------------------
function updateSel(force) {
  const box = $('hud-sel'), s = UI.sel;
  if (!s || !G) { box.classList.remove('show'); box.innerHTML = ''; return; }
  const r = s.ref;
  let h = '';
  const row = (k, v) => `<div class="row"><span class="dim">${k}</span><span>${v}</span></div>`;
  if (s.type === 'ac') {
    if (r.status === 'lost' || !G.aircraft.includes(r)) { UI.sel = null; return updateSel(); }
    const T = AIRCRAFT[r.type], pkg = pkgById(r.pkgId);
    const ammo = Object.entries(r.ammo).filter(([, v]) => v > 0).map(([w, v]) => `${WEAPONS[w].short}×${v}`).join(' ') || '—';
    h = `<div class="selcard"><button class="x" data-act="closeSel">×</button><div class="sel-art">${artSVG(AC_ART[r.type])}</div><div class="k">FRIENDLY · ${T.role.toUpperCase()}</div><h4>${r.callsign}</h4>
      ${row('Type', T.name)}${row('Status', r.status === 'airborne' ? (r.state || '').toUpperCase() : r.status.toUpperCase())}${row('Airframe', Math.round((r.hp / r.maxHp) * 100) + '%')}
      ${r.status === 'airborne' ? row('Fuel', Math.round((r.fuel / rangeOf(T)) * 100) + '%') + row('Flares', r.flares) + row('Stores', ammo) + (T.gun ? row('Gun', r.gunAmmo + ' bursts') : '') : ''}
      ${row('Kills', r.kills)}${pkg ? row('Package', `${pkg.name} · ${MISSIONS[pkg.mission].name}`) : ''}
      ${pkg && r.status === 'airborne' ? `<div class="btn-row"><button class="btn sm red" data-act="selRecall" data-id="${pkg.id}">RECALL PACKAGE</button></div>` : ''}</div>`;
  } else if (s.type === 'unit') {
    const E = ENEMY[r.kind], A = E.aa, z = zoneById(r.zoneId);
    h = `<div class="selcard enemy"><button class="x" data-act="closeSel">×</button><div class="sel-art side">${artSVG(UNIT_ART[r.kind], '#ff5a5a')}</div><div class="k">HOSTILE · ${FACTIONS[z.faction].name.toUpperCase()}</div><h4>${r.amphib ? 'Amphibious ' : ''}${E.name}</h4>
      ${row('Zone', z.short)}${row('Integrity', Math.round((r.hp / r.maxHp) * 100) + '%')}${row('Class', E.cls.toUpperCase())}
      ${A ? row('Engagement', `${A.range} km · ${A.type.toUpperCase()}`) + row('vs F-16 / A-10', `${effRange(A, { type: 'f16' }).toFixed(0)} / ${effRange(A, { type: 'a10' }).toFixed(0)} km`) : ''}
      ${row('Value', `$${Math.round(E.value * KILL_FUNDS)}M · ${Math.round(E.value * KILL_RP)} RP`)}
      <div class="btn-row"><button class="btn sm pri" data-act="selPlan" data-id="${z.id}">PLAN STRIKE</button></div></div>`;
  } else if (s.type === 'eair') {
    h = `<div class="selcard enemy"><button class="x" data-act="closeSel">×</button><div class="sel-art">${artSVG(r.kind === 'cruise' ? 'cruise' : r.kind === 'drone' ? 'edrone' : 'su35', '#ff5a5a')}</div><div class="k">HOSTILE AIR</div><h4>${r.kind === 'cruise' ? r.name + ' cruise missile' : r.name}</h4>
      ${r.kind !== 'fighter' ? row('Target', baseById(r.target).name) : row('Missiles', r.missiles) + row('State', r.state.toUpperCase())}</div>`;
  } else if (s.type === 'carrier') {
    if (!G.carriers.includes(r)) { UI.sel = null; return updateSel(); }
    h = carrierCard(r);
  } else if (s.type === 'base') {
    const acs = G.aircraft.filter(a => a.baseId === r.id);
    h = `<div class="selcard"><button class="x" data-act="closeSel">×</button><div class="k">ALLIED INSTALLATION</div><h4>${esc(r.name)}</h4>
      ${row('Hosts', r.allows.join(', '))}${row('Aircraft', acs.length)}${row('Ready', acs.filter(a => a.status === 'ready').length)}
      <div class="btn-row"><button class="btn sm" data-act="selFleet" data-id="${r.id}">PROCURE HERE</button></div></div>`;
  } else if (s.type === 'pilot') {
    if (r.gone || !G.pilots.includes(r)) { UI.sel = null; return updateSel(); }
    h = `<div class="selcard warnc"><button class="x" data-act="closeSel">×</button><div class="k">DOWNED AIRCREW</div><h4>${r.callsign}</h4>
      ${row('Beacon', fmtTime(r.expires - G.time))}<div class="btn-row"><button class="btn sm gold" data-act="csar" data-id="${r.id}">SEND CSAR</button></div></div>`;
  } else if (s.type === 'friendly') {
    h = `<div class="selcard friend"><button class="x" data-act="closeSel">×</button><div class="k">ALLIED GROUND FORCE</div><h4>${esc(r.name)}</h4>
      ${row('Strength', Math.round(r.hp) + '%')}${row('Status', r.dead ? 'OVERRUN' : r.underFire ? 'UNDER FIRE' : 'HOLDING')}
      ${r.dead ? '' : `<div class="btn-row"><button class="btn sm" data-act="reinforce" data-z="${r.zoneId}" data-id="${r.id}">AIRLIFT</button><button class="btn sm pri" data-act="selPlan" data-id="${r.zoneId}">CAS</button></div>`}</div>`;
  }
  if (UI.pointerDown && !force) return;
  box.innerHTML = h;
  box.classList.toggle('show', !!h);
}

// ---------------------------------------------------------------------------
// Game end
// ---------------------------------------------------------------------------
function showEnd(result) {
  clearSave();
  const { score, grade } = finalScore();
  const endless = G.mode === 'endless';
  const key = `skyward_best_${endless ? 'endless_' : ''}${G.diffKey}`;
  let best = 0;
  try { best = +(localStorage.getItem(key) || 0); if (score > best) localStorage.setItem(key, score); } catch (e) {}
  const s = G.stats, win = result === 'victory';
  const card = $('modal-card');
  card.className = 'modal-card ' + (win ? '' : 'defeat');
  const title = win ? 'VICTORY' : endless ? 'LINE BROKEN' : 'RELIEVED OF COMMAND';
  const kicker = win ? 'ALL THEATERS SECURED' : endless ? `HELD FOR ${fmtTime(G.time)} · REACHED LEVEL ${G.level}` : 'GLOBAL THREAT CRITICAL';
  const text = win ? 'Every flashpoint has been stabilized. The air wing performed beyond expectations.'
    : endless ? `The world finally boiled over, but you held it together for ${Math.floor(G.time / 60)} minutes and secured ${s.zonesSecured} flashpoints.`
    : 'Escalation spiraled beyond control. The Joint Chiefs have assumed direct command of the theater.';
  card.innerHTML = `<div class="t-kicker mono">${kicker} · T+${fmtTime(G.time)} · ${G.D.name}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 14px">
      <h2 style="color:${win ? 'var(--hud)' : 'var(--enemy)'}">${title}</h2>
      <div class="big-grade grade ${grade}" style="width:auto;height:auto;border:0">${grade}</div></div>
    <p class="brief">${text}</p>
    <div class="statgrid">
      <div class="stat"><label>SCORE</label><b>${score}</b></div><div class="stat"><label>BEST</label><b>${Math.max(best, score)}</b></div><div class="stat"><label>ZONES</label><b>${s.zonesSecured}${endless ? '' : '/8'}</b></div>
      <div class="stat"><label>KILLS</label><b>${killTotal(s.kills)}</b></div><div class="stat"><label>LOSSES</label><b class="red">${s.lostCount}</b></div><div class="stat"><label>SORTIES</label><b>${s.sorties}</b></div>
      ${endless ? `<div class="stat"><label>LEVEL</label><b>${G.level}</b></div><div class="stat"><label>HOMEFRONT HITS</label><b class="red">${s.homefrontHits}</b></div>` : `<div class="stat"><label>RESCUED</label><b>${s.rescued}</b></div><div class="stat"><label>ACCURACY</label><b>${s.fired ? Math.round((s.hits / s.fired) * 100) : 0}%</b></div>`}
      <div class="stat"><label>NUKES</label><b class="${s.nukes ? 'red' : ''}">${s.nukes}</b></div>
    </div>
    <div class="btn-row" style="margin-top:16px"><button class="btn pri" id="btn-again" style="padding:12px">${endless ? 'NEW ENDLESS RUN' : 'NEW CAMPAIGN'}</button><button class="btn" id="btn-title" style="padding:12px">TITLE</button></div>`;
  $('modal').classList.remove('hidden');
  $('btn-again').onclick = () => { $('modal').classList.add('hidden'); startGame(G.mode); };
  $('btn-title').onclick = () => { $('modal').classList.add('hidden'); showTitle(); };
}

// The base currently being targeted by homefront/raid weapons, if any
function threatenedBase() {
  const e = G.enemyAir.find(e => !e.removed && e.target);
  return e ? e.target : null;
}

// ---------------------------------------------------------------------------
// In-game dialogs (replace browser confirm(), which looks out of place)
// ---------------------------------------------------------------------------
function confirmBox(title, text, okLabel, onOk, danger = true) {
  const card = $('modal-card');
  card.className = 'modal-card ' + (danger ? 'defeat' : '');
  card.innerHTML = `<h2 style="font-size:24px;color:${danger ? 'var(--enemy)' : 'var(--hud)'}">${title}</h2><p class="brief">${text}</p>
    <div class="btn-row"><button class="btn ${danger ? 'red' : 'pri'}" id="cb-ok" style="padding:12px">${okLabel}</button><button class="btn" id="cb-no" style="padding:12px">CANCEL</button></div>`;
  $('modal').classList.remove('hidden');
  $('cb-ok').onclick = () => { $('modal').classList.add('hidden'); onOk(); };
  $('cb-no').onclick = () => $('modal').classList.add('hidden');
}

function openMenu() {
  if (!G || G.over) return;
  if (!G.paused) setSpeed(0);
  const card = $('modal-card');
  card.className = 'modal-card';
  card.innerHTML = `<div class="t-kicker mono">${G.mode === 'endless' ? `ENDLESS · LEVEL ${G.level}` : 'CAMPAIGN'} · ${G.D.name} · T+${fmtTime(G.time)}</div>
    <h2 style="margin:6px 0 14px">COMMAND PAUSED</h2>
    <div class="menu-col">
      <button class="btn pri" id="mn-resume">▶ RESUME</button>
      <button class="btn" id="mn-settings">⚙ SETTINGS</button>
      <button class="btn" id="mn-save">SAVE GAME</button>
      <button class="btn" id="mn-quit">SAVE &amp; EXIT TO TITLE</button>
      <button class="btn red" id="mn-abandon">ABANDON ${G.mode === 'endless' ? 'RUN' : 'CAMPAIGN'}</button>
    </div>
    <div class="small dim" style="margin-top:12px">Progress also autosaves every 20 seconds and whenever the app is closed or minimized.</div>`;
  $('modal').classList.remove('hidden');
  const close = () => $('modal').classList.add('hidden');
  $('mn-resume').onclick = () => { close(); setSpeed(0); };
  $('mn-settings').onclick = () => openSettings(openMenu);
  $('mn-save').onclick = () => { const ok = saveGame(); toast(ok ? '<b class="chip hud">SAVED</b> Progress stored on this device' : '<b class="chip red">SAVE FAILED</b>', ok ? '' : 'err', null, 2500); };
  $('mn-quit').onclick = () => { saveGame(); close(); G = null; showTitle(); };
  $('mn-abandon').onclick = () => confirmBox('ABANDON?', 'This run will be lost and your save deleted.', 'ABANDON', () => { clearSave(); G = null; showTitle(); });
}

function menuOpen() { return !$('modal').classList.contains('hidden'); }


// ---------------------------------------------------------------------------
// NAVY section (Fleet tab) + carrier selection card
// ---------------------------------------------------------------------------
function navySection() {
  if (!hasRes('csg')) return '';
  let h = `<div class="sec-title">NAVY · ${G.carriers.length} CARRIER GROUP${G.carriers.length === 1 ? '' : 'S'}</div>`;
  const zones = G.zones.filter(z => z.active && !z.neutralized);
  for (const c of G.carriers) {
    const wing = G.aircraft.filter(a => a.baseId === c.baseId);
    const inRange = zones.filter(z => dist(z.center, c.pos) <= CARRIER.tlamRange).sort((a, b) => dist(a.center, c.pos) - dist(b.center, c.pos));
    if (!inRange.some(z => z.id === UI.tlamZone)) UI.tlamZone = inRange[0] ? inRange[0].id : null;
    h += `<div class="base carrier-card"><div class="base-head" data-act="carrierFocus" data-id="${c.id}"><div style="display:flex;gap:8px;align-items:center"><div class="ac-art">${artSVG('carrier', '#8fdcff')}</div><div><b>${esc(c.name)}</b><div class="ac-sub">${c.route.length ? 'UNDERWAY' : 'ON STATION'} · Air wing ${wing.length}/${CARRIER.capacity} · TLAM ${c.tlam}</div></div></div></div>
      <div style="padding:2px 8px 8px">${bar((c.hp / c.maxHp) * 100, c.hp / c.maxHp < 0.5 ? 'warn' : 'blue')}
      <div class="btn-row" style="margin-top:8px"><button class="btn sm" data-act="sail" data-id="${c.id}">⚓ SET COURSE</button><button class="btn sm" data-act="carrierFocus" data-id="${c.id}">◎ LOCATE</button></div>
      ${inRange.length ? `<div class="field" style="margin-top:8px"><label>TOMAHAWK</label><select data-change="tlamZone">${inRange.map(z => `<option value="${z.id}" ${z.id === UI.tlamZone ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>
      <div class="btn-row" style="margin-top:4px"><button class="btn sm" data-act="tlam" data-id="${c.id}" data-n="4" ${c.tlam >= 1 ? '' : 'disabled'}>FIRE ×4 · ${fmtMoney(4 * CARRIER.tlamCost)}</button><button class="btn sm" data-act="tlam" data-id="${c.id}" data-n="8" ${c.tlam >= 1 ? '' : 'disabled'}>FIRE ×8 · ${fmtMoney(8 * CARRIER.tlamCost)}</button></div>`
        : `<div class="small dim" style="margin-top:6px">No hostile zone within Tomahawk range (1,600 km). Sail closer.</div>`}
      </div></div>`;
  }
  const sea = UI.seaSel || CARRIER_SEAS[0].id;
  h += `<div class="field" style="margin-top:8px"><label>DEPLOY TO</label><select data-change="sea">${CARRIER_SEAS.map(s => `<option value="${s.id}" ${s.id === sea ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
    <button class="btn pri" style="width:100%" data-act="buyCarrier" ${G.funds >= CARRIER.cost ? '' : 'disabled'}>⚓ COMMISSION CARRIER GROUP · ${fmtMoney(CARRIER.cost)}</button>
    <div class="small dim" style="margin-top:4px">Floating airbase for ${CARRIER.capacity} carrier-capable aircraft (F/A-18E, EA-18G, F-35, UH-60). Aegis escorts shoot down missiles and drones within ${CARRIER.aegisRange} km. Enemy warships will fire anti-ship missiles at it.</div>`;
  return h;
}

function carrierCard(c) {
  const wing = G.aircraft.filter(a => a.baseId === c.baseId);
  const row = (k, v) => `<div class="row"><span class="dim">${k}</span><span>${v}</span></div>`;
  return `<div class="selcard" style="border-top-color:#8fdcff"><button class="x" data-act="closeSel">×</button><div class="sel-art">${artSVG('carrier', '#8fdcff')}</div>
    <div class="k">CARRIER STRIKE GROUP</div><h4>${esc(c.name)}</h4>
    ${row('Hull', Math.round((c.hp / c.maxHp) * 100) + '%')}${row('Status', c.route.length ? 'UNDERWAY' : 'ON STATION')}
    ${row('Air wing', `${wing.length}/${CARRIER.capacity} (${wing.filter(a => a.status === 'ready').length} ready)`)}${row('Tomahawks', c.tlam)}${row('Aegis range', CARRIER.aegisRange + ' km')}
    <div class="btn-row"><button class="btn sm" data-act="sail" data-id="${c.id}">⚓ SET COURSE</button><button class="btn sm" data-act="selFleet" data-id="${c.baseId}">AIR WING</button></div></div>`;
}


// ---------------------------------------------------------------------------
// Simplified-play helpers
// ---------------------------------------------------------------------------
// Progress toward securing a zone, as plain-language goals
function zoneProgress(z) {
  const alive = z.units.filter(u => !u.dead);
  const brk = clamp((1 - aliveValue(z) / z.initValue) / 0.75, 0, 1);
  const goals = [];
  if (z.initCounts.hq) goals.push({ label: 'Destroy the command post', short: 'HQ', done: !alive.some(u => u.kind === 'hq') });
  if (z.initCounts.airfield) goals.push({ label: 'Destroy the airbase', short: 'Airbase', done: !alive.some(u => u.kind === 'airfield') });
  goals.push({ label: `Break enemy forces (${Math.round(brk * 100)}%)`, short: `Forces ${Math.round(brk * 100)}%`, done: brk >= 1 });
  const pct = Math.round((goals.reduce((s, g) => s + (g.short.startsWith('Forces') ? brk : g.done ? 1 : 0), 0) / goals.length) * 100);
  return { goals, pct };
}

// Most useful known target in a zone: air defenses first, then command & control, then the rest
function topTarget(z) {
  const order = { sam_lr: 10, destroyer: 9, shorad: 8, frigate: 8, radar: 7, hq: 6, airfield: 6, arty: 4, mbt: 4, aaa: 3 };
  return z.units.filter(u => !u.dead && u.known).sort((a, b) => (order[b.kind] || 1) - (order[a.kind] || 1) || ENEMY[b.kind].value - ENEMY[a.kind].value)[0] || null;
}

function flightsList() {
  const live = G.pkgs.filter(p => !p.done);
  if (!live.length) return '';
  let h = `<div class="sec-title">IN FLIGHT · ${live.length}</div>`;
  for (const pkg of live) {
    const acs = pkg.acIds.map(acById).filter(a => a && a.pkgId === pkg.id && a.status === 'airborne');
    const z = pkg.zoneId ? zoneById(pkg.zoneId) : null;
    const fu = pkg.focusId && z ? z.units.find(u => u.id === pkg.focusId) : null;
    const tgt = fu ? `${ENEMY[fu.kind].short}${fu.dead ? ' ✓' : ''} · ${z.short}` : pkg.targetName;
    const states = acs.map(a => a.state);
    const st = pkg.mission === 'tlam' ? 'IN FLIGHT' : states.includes('combat') ? 'ENGAGED' : states.includes('outbound') ? 'EN ROUTE' : states.includes('hover') ? 'ON STATION' : 'RETURNING';
    const types = {};
    acs.forEach(a => { types[AIRCRAFT[a.type].short] = (types[AIRCRAFT[a.type].short] || 0) + 1; });
    h += `<div class="flt"><div class="flt-main"><b>${pkg.name}</b> <span class="chip ${pkg.mission === 'nuclear' ? 'gold' : 'hud'}">${MISSIONS[pkg.mission].name}</span>
        <div class="ac-sub">${Object.entries(types).map(([k, v]) => `${v}× ${k}`).join(' + ') || 'Tomahawks'} → ${esc(tgt)}</div></div>
      <span class="flt-st ${st === 'ENGAGED' ? 'hot' : ''}">${st}</span>
      ${acs.length ? `<button class="btn sm" data-act="track" data-id="${pkg.id}" title="Follow">${UI.trackPkg === pkg.id ? '◉' : '◎'}</button><button class="btn sm red" data-act="recall" data-id="${pkg.id}" title="Recall">⟲</button>` : ''}</div>`;
  }
  return h;
}

// Where a newly bought aircraft should live: the closest suitable base that can reach the chosen zone
function stationFor(T, zone) {
  const ok = G.bases.filter(b => baseAllows(b, T) && (!b.carrier || G.aircraft.filter(a => a.baseId === b.id).length < CARRIER.capacity));
  if (!zone) return ok.sort((a, b) => G.aircraft.filter(x => x.baseId === b.id).length - G.aircraft.filter(x => x.baseId === a.id).length)[0];
  const reach = b => dist(b.pos, zone.center) * 2 + 300 <= rangeOf(T);
  return ok.sort((a, b) => (reach(b) - reach(a)) || dist(a.pos, zone.center) - dist(b.pos, zone.center))[0];
}

function stationPicker(T, eligible) {
  const zones = G.zones.filter(z => z.active && !z.neutralized);
  if (UI.buyZone && !zones.some(z => z.id === UI.buyZone)) UI.buyZone = null;
  if (UI.buyZone === undefined || (UI.buyZone === null && !UI.buyZoneChosen && zones.length)) UI.buyZone = (zoneById(UI.zoneSel) && !zoneById(UI.zoneSel).neutralized ? UI.zoneSel : zones[0] && zones[0].id) || null;
  const z = zoneById(UI.buyZone);
  const st = UI.manualBase ? baseById(UI.buyBase) : stationFor(T, z);
  const reach = st && z ? dist(st.pos, z.center) * 2 + 300 <= rangeOf(T) : true;
  return `<div class="set-sec" style="margin-top:12px">SEND IT TO</div>
    <div class="zone-chips">${zones.map(zz => `<button class="${zz.id === UI.buyZone && !UI.manualBase ? 'on' : ''}" data-act="buyZone" data-id="${zz.id}">${esc(zz.short)}</button>`).join('')}</div>
    <div class="station">${st ? `Stationed at <b>${esc(st.name)}</b>${z && !UI.manualBase ? ` · ${fmtKm(dist(st.pos, z.center))} from ${esc(z.short)} ${reach ? '<span style="color:var(--hud)">✓ in range</span>' : '<span style="color:var(--warn)">✗ out of range: research Aerial Refueling</span>'}` : ''}` : 'No base can host this aircraft yet.'}</div>
    <details class="manual"${UI.manualBase ? ' open' : ''}><summary>Choose a base manually</summary>
      <div class="field"><select data-change="buyBase">${eligible.map(b => `<option value="${b.id}" ${UI.manualBase && b.id === UI.buyBase ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></details>`;
}
