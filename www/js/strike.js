// ============================================================================
// SKYWARD COMMAND — "tap to strike"
//
// Tap anything on the map (an enemy unit, a spot in a hot zone, an allied
// position, a downed pilot, a base under attack) and a strike card pops up at
// the bottom of the screen with a ready-made package: aircraft, loadouts and
// mission chosen automatically. One tap launches it. If nothing can reach, it
// offers to buy the right aircraft at the right base and send it.
// ============================================================================
const STRIKE_VARIANTS = [
  { id: 'best', name: 'BEST MATCH' },
  { id: 'safe', name: 'SAFEST' },
  { id: 'cheap', name: 'CHEAPEST' },
];

// What kind of mission a target calls for
function missionForKind(kind) {
  const E = ENEMY[kind];
  if (E.cls === 'radar' || kind === 'destroyer' || kind === 'frigate') return 'sead';
  if (E.cls === 'structure') return 'strike';
  return 'cas';
}

// Normalise a tapped thing into everything the planner needs
function strikeInfo(t) {
  if (t.type === 'unit') {
    const u = t.ref, z = zoneById(u.zoneId), E = ENEMY[u.kind];
    return { kind: 'unit', u, zone: z, pos: u.pos, mission: missionForKind(u.kind), focusId: u.id, cls: E.cls, hp: u.hp,
      title: (u.amphib ? 'Amphibious ' : '') + E.name, art: UNIT_ART[u.kind], verb: 'DESTROY' };
  }
  if (t.type === 'area') {
    const z = t.zone, near = z.units.filter(u => !u.dead && u.known && dist(u.pos, t.pos) < 30);
    return { kind: 'area', zone: z, pos: t.pos, near, mission: near.length ? 'strike' : 'recon', focusPos: t.pos,
      title: near.length ? `${near.length} known target${near.length > 1 ? 's' : ''} nearby` : 'Unscouted ground', verb: near.length ? 'ATTACK AREA' : 'SCOUT AREA' };
  }
  if (t.type === 'friendly') {
    const f = t.ref, z = zoneById(f.zoneId);
    return { kind: 'friendly', f, zone: z, pos: f.pos, mission: 'cas', focusPos: f.pos, title: f.name, verb: 'SUPPORT', friendlyId: f.id };
  }
  if (t.type === 'airlift') {
    const f = t.ref, z = zoneById(f.zoneId);
    return { kind: 'airlift', f, zone: z, pos: f.pos, mission: 'reinforce', title: f.name, verb: 'AIRLIFT TO', friendlyId: f.id };
  }
  if (t.type === 'pilot') {
    const p = t.ref;
    return { kind: 'pilot', p, zone: null, pos: p.pos, mission: 'rescue', title: `${p.callsign} (downed)`, verb: 'RESCUE', pilotId: p.id };
  }
  if (t.type === 'defend') {
    const b = t.ref;
    return { kind: 'defend', b, zone: null, pos: b.pos, mission: 'defend', title: b.name, verb: 'DEFEND', baseId: b.id };
  }
  return null;
}

// Score one aircraft for this job
function evalAircraft(ac, info) {
  const T = AIRCRAFT[ac.type];
  if (!canFly(ac.type, info.mission)) return null;
  const rc = rangeCheck(ac, info.pos);
  if (!rc.ok) return null;
  const lo = presetLoadout(ac.type, info.mission, info.zone);
  let eff;
  if (info.cls) {
    // best single-target effect: hit chance × how much of the target one or two shots destroy
    eff = 0;
    for (const [w, n] of Object.entries(lo)) {
      const W = WEAPONS[w], pk = W.pk[info.cls] || 0;
      if (pk >= 0.15) eff = Math.max(eff, pk * Math.min(1, (W.dmg * Math.min(n, 2)) / info.hp));
    }
    if (T.gun) eff = Math.max(eff, (T.gun.pk[info.cls] || 0) * Math.min(1, (T.gun.dmg * 3) / info.hp));
    if (eff < 0.12) return null;
  } else if (info.mission === 'recon') eff = Math.min(1, T.sensor / 50);
  else if (info.mission === 'strike' || info.mission === 'cas') {
    if (!Object.entries(lo).some(([w, n]) => n > 0 && groundCapable(WEAPONS[w])) && !T.gun) return null;
    eff = 0.7;
  } else eff = 0.6;
  const surv = info.zone ? estimateSurvival(ac.type, info.zone, info.mission) : 0.95;
  return { ac, lo, eff, surv, eta: rc.d / (KM_TRANSIT * T.speed), cost: loadCost(lo) };
}

function wantedCount(info) {
  if (info.kind === 'unit') return info.hp > 300 ? 3 : info.hp > 150 || ENEMY[info.u.kind].aa ? 2 : 1;
  if (info.kind === 'area' || info.kind === 'friendly' || info.kind === 'defend') return 2;
  return 1;
}

function suggestStrike(info, variant = 0) {
  const cands = G.aircraft.filter(a => a.status === 'ready').map(a => evalAircraft(a, info)).filter(Boolean);
  if (!cands.length) return null;
  const v = STRIKE_VARIANTS[variant % STRIKE_VARIANTS.length].id;
  const score = c => v === 'safe' ? c.surv * 2 + c.eff * 0.4 - c.eta / 900
    : v === 'cheap' ? (c.eff * c.surv) / (1 + c.cost + AIRCRAFT[c.ac.type].cost * 0.03) - c.eta / 1200
    : c.eff * c.surv - c.eta / 600;
  cands.sort((a, b) => score(b) - score(a));
  const picks = cands.slice(0, wantedCount(info));
  const kill = info.cls ? 1 - picks.reduce((p, c) => p * (1 - Math.min(0.97, c.eff)), 1) : null;
  return {
    picks, variant: variant % STRIKE_VARIANTS.length, kill,
    cost: picks.reduce((s, c) => s + c.cost, 0), eta: Math.max(...picks.map(c => c.eta)),
    surv: picks.reduce((s, c) => s + c.surv, 0) / picks.length,
  };
}

// Nothing can reach? Find the best aircraft to buy, and the base it should live at
function suggestPurchase(info) {
  let best = null;
  for (const type of G.unlocked) {
    const T = AIRCRAFT[type];
    if (!canFly(type, info.mission)) continue;
    const bases = G.bases.filter(b => baseAllows(b, T) && (!b.carrier || G.aircraft.filter(a => a.baseId === b.id).length < CARRIER.capacity)
      && dist(b.pos, info.pos) * 2 + 300 <= rangeOf(T)).sort((a, b) => dist(a.pos, info.pos) - dist(b.pos, info.pos));
    if (!bases.length) continue;
    const fake = { type, baseId: bases[0].id, status: 'ready' };
    const e = evalAircraft(fake, info);
    if (!e) continue;
    const total = T.cost + e.cost;
    if (total > G.funds) continue;
    const s = (e.eff * e.surv) / Math.sqrt(total) - e.eta / 900;
    if (!best || s > best.s) best = { s, type, base: bases[0], total, e };
  }
  return best;
}

function launchFromCard(pkgPicks, info) {
  const plan = {
    mission: info.mission, zoneId: info.zone ? info.zone.id : null, pilotId: info.pilotId || null, friendlyId: info.friendlyId || null, baseId: info.baseId || null,
    acIds: pkgPicks.map(c => c.ac.id), loadouts: Object.fromEntries(pkgPicks.map(c => [c.ac.id, c.lo])),
    focusId: info.focusId || null, focusPos: info.focusPos ? cp(info.focusPos) : null,
  };
  return launchPackage(plan);
}

// ---------------------------------------------------------------------------
// Strike card UI
// ---------------------------------------------------------------------------
const Strike = { open: false, target: null, variant: 0, t: 0 };

function openStrike(target) {
  Strike.open = true; Strike.target = target; Strike.variant = 0; Strike.fresh = true; Strike.lastHTML = '';
  document.body.classList.add('strike-open');
  if (UI.sel) { UI.sel = null; updateSel(true); }
  renderStrike();
  Coach.event('strike', target);
}

function closeStrike() {
  Strike.open = false; Strike.target = null; Strike.lastHTML = '';
  document.body.classList.remove('strike-open');
  $('strike').innerHTML = '';
}

function strikeStillValid(t) {
  if (t.type === 'unit') return !t.ref.dead;
  if (t.type === 'area') return t.zone.active && !t.zone.neutralized && G.zones.includes(t.zone);
  if (t.type === 'friendly' || t.type === 'airlift') return !t.ref.dead;
  if (t.type === 'pilot') return !t.ref.gone && G.pilots.includes(t.ref);
  if (t.type === 'defend') return !!baseById(t.ref.id);
  return false;
}

function renderStrike() {
  const el = $('strike');
  if (!Strike.open || !G) { el.innerHTML = ''; return; }
  if (!strikeStillValid(Strike.target)) {
    const was = Strike.target;
    closeStrike();
    if (was.type === 'unit') toast('<b class="chip hud">TARGET GONE</b> That target has been destroyed', '', null, 2000);
    return;
  }
  const info = strikeInfo(Strike.target);
  const sug = suggestStrike(info, Strike.variant);
  const zoneName = info.zone ? info.zone.short : '';
  const M = MISSIONS[info.mission];
  let sub = '';
  if (info.kind === 'unit') {
    const A = ENEMY[info.u.kind].aa;
    const guards = info.zone.units.filter(u => !u.dead && u.known && u !== info.u && ENEMY[u.kind].aa && dist(u.pos, info.u.pos) < ENEMY[u.kind].aa.range).length;
    sub = (A ? `Shoots back: ${A.type === 'radar' ? 'radar SAM' : A.type === 'ir' ? 'heat-seekers' : 'guns'} · ${A.range} km` : ENEMY[info.u.kind].cls === 'structure' ? 'High-value target' : 'Ground target')
      + (guards ? ` · ${guards} air defense${guards > 1 ? 's' : ''} covering it` : '');
  } else if (info.kind === 'area') sub = info.near.length ? 'Jets will hit what they find around this spot' : 'Send a recon flight to reveal hidden enemies here';
  else if (info.kind === 'friendly') sub = `Allied position at ${Math.round(info.f.hp)}% · hit the enemies attacking them`;
  else if (info.kind === 'airlift') sub = 'Fly in troops and ammo: +40% strength';
  else if (info.kind === 'pilot') sub = `Beacon ${fmtTime(info.p.expires - G.time)} left before capture`;
  else if (info.kind === 'defend') sub = `${G.enemyAir.filter(e => !e.removed && e.target === info.b.id).length} hostile missiles/drones inbound`;

  const art = info.art ? artSVG(info.art, '#ff5a5a') : info.kind === 'pilot' ? '<div class="sk-glyph" style="color:var(--gold)">⛑</div>' : info.kind === 'defend' ? '<div class="sk-glyph" style="color:var(--enemy)">⛨</div>' : info.kind === 'friendly' || info.kind === 'airlift' ? '<div class="sk-glyph" style="color:var(--friend)">✚</div>' : '<div class="sk-glyph">◎</div>';
  let body;
  if (sug) {
    const groups = {};
    sug.picks.forEach(c => { const k = c.ac.type; groups[k] = groups[k] || { n: 0, base: baseById(c.ac.baseId).name }; groups[k].n++; });
    const sc = sug.surv > 0.75 ? 'good' : sug.surv > 0.45 ? 'mid' : 'bad';
    body = `<div class="sk-pkg">
        <button class="sk-arrow" data-sk="prev" aria-label="Previous option">◀</button>
        <div class="sk-body"><div class="sk-var">${STRIKE_VARIANTS[sug.variant].name}</div>
          <div class="sk-ac">${Object.entries(groups).map(([k, g]) => `<span class="sk-plane">${artSVG(AC_ART[k])}</span><b>${g.n}× ${AIRCRAFT[k].short}</b> <span class="dim">${esc(g.base)}</span>`).join('<span class="dim"> + </span>')}</div>
          <div class="sk-stats"><span>ETA <b>${fmtTime(sug.eta)}</b></span><span class="${sc}">SURVIVAL <b>${Math.round(sug.surv * 100)}%</b></span>${sug.kill !== null ? `<span>HIT CHANCE <b>${Math.round(sug.kill * 100)}%</b></span>` : ''}<span>COST <b>${fmtMoney(sug.cost)}</b></span></div>
        </div>
        <button class="sk-arrow" data-sk="next" aria-label="Next option">▶</button>
      </div>`;
  } else {
    const buy = suggestPurchase(info);
    body = `<div class="sk-none">No ready aircraft can reach this. ${buy ? `Buy a <b>${AIRCRAFT[buy.type].short}</b> at <b>${esc(buy.base.name)}</b> and send it now?` : G.aircraft.some(a => a.status !== 'ready') ? 'Your aircraft are busy. Try again in a moment.' : 'Not enough funds for a new aircraft.'}</div>`;
    Strike.buy = buy;
  }
  const alt = info.kind === 'friendly' ? `<button class="btn" data-sk="airlift">AIRLIFT</button>`
    : info.kind === 'area' && info.near.length ? `<button class="btn" data-sk="recon">SCOUT</button>`
    : '';
  const main = sug ? `<button class="btn pri sk-go" data-sk="launch">▲ ${info.mission === 'recon' ? 'SEND RECON' : info.mission === 'rescue' ? 'SEND RESCUE' : info.mission === 'defend' ? 'SCRAMBLE' : info.mission === 'reinforce' ? 'SEND AIRLIFT' : 'LAUNCH STRIKE'}</button>`
    : Strike.buy ? `<button class="btn pri sk-go" data-sk="buy">BUY &amp; LAUNCH · ${fmtMoney(Strike.buy.total)}</button>` : `<button class="btn sk-go" data-sk="close">CLOSE</button>`;
  const html = `<div class="sk ${info.kind}${Strike.fresh ? ' enter' : ''}">
      <div class="sk-head"><div class="sk-art">${art}</div>
        <div class="sk-title"><div class="k">${info.verb}${zoneName ? ' · ' + esc(zoneName) : ''} · ${M.name}</div><b>${esc(info.title)}</b><small>${sub}</small></div>
        <button class="x" data-sk="close" aria-label="Close">×</button></div>
      ${body}
      <div class="sk-actions">${Settings.get().advanced && sug ? '<button class="btn" data-sk="custom">CUSTOM</button>' : ''}${alt}${main}</div>
    </div>`;
  // The card refreshes to keep its numbers live: only touch the DOM when something actually
  // changed, and only play the slide-in animation when the card first opens.
  if (html !== Strike.lastHTML) { el.innerHTML = html; Strike.lastHTML = html; }
  Strike.fresh = false;
  Strike.info = info; Strike.sug = sug;
}

function strikeAction(a) {
  const info = Strike.info;
  switch (a) {
    case 'close': closeStrike(); return;
    case 'prev': Strike.variant = (Strike.variant + STRIKE_VARIANTS.length - 1) % STRIKE_VARIANTS.length; break;
    case 'next': Strike.variant = (Strike.variant + 1) % STRIKE_VARIANTS.length; break;
    case 'recon': {
      const sug = suggestStrike({ ...info, mission: 'recon', cls: null }, 0);
      if (!sug) { toast('<b class="chip red">NONE</b> No aircraft available for recon', 'err', null, 2500); return; }
      const p = launchFromCard(sug.picks, { ...info, mission: 'recon' });
      afterLaunch(p); return;
    }
    case 'airlift': openStrike({ type: 'airlift', ref: info.f }); return;
    case 'launch': {
      if (!Strike.sug) return;
      afterLaunch(launchFromCard(Strike.sug.picks, info)); return;
    }
    case 'buy': {
      const b = Strike.buy;
      if (!b) return;
      const ac = buyAircraft(b.type, b.base.id);
      if (typeof ac === 'string') { toast(`<b class="chip red">DENIED</b> ${esc(ac)}`, 'err', null, 2500); return; }
      const e = evalAircraft(ac, info);
      if (!e) { toast('<b class="chip warn">BOUGHT</b> Aircraft delivered, but it cannot fly this one', '', null, 3000); renderStrike(); return; }
      afterLaunch(launchFromCard([e], info)); return;
    }
    case 'custom': {
      const s = Strike.sug;
      Object.assign(UI.plan, { mission: info.mission, zoneId: info.zone ? info.zone.id : UI.plan.zoneId, pilotId: info.pilotId || null, friendlyId: info.friendlyId || null, baseId: info.baseId || null,
        acIds: new Set(s.picks.map(c => c.ac.id)), loadouts: Object.fromEntries(s.picks.map(c => [c.ac.id, { ...c.lo }])), focusId: info.focusId || null, focusPos: info.focusPos || null });
      closeStrike(); setTab('ops'); return;
    }
  }
  renderStrike();
}

function afterLaunch(p) {
  if (typeof p === 'string') { toast(`<b class="chip red">ABORT</b> ${esc(p)}`, 'err', null, 3000); return; }
  Haptic.fire('medium');
  if (Settings.get().autoTrack) UI.trackPkg = p.id;
  toast(`<b class="chip hud">${p.name}</b> ${p.acIds.length} aircraft en route → ${esc(Strike.info.title)}`, '', null, 3500);
  closeStrike();
  Coach.event('launch');
  UI.dirty = true;
}

// ---------------------------------------------------------------------------
// Standing orders: zones set to AUTO get fresh strikes whenever aircraft are free
// ---------------------------------------------------------------------------
let autoT = 3;
function autoOpsTick(dt) {
  autoT -= dt;
  if (autoT > 0) return;
  autoT = 4;
  for (const z of G.zones) {
    if (!z.auto || !z.active || z.neutralized || G.funds < 15) continue;
    // don't pile on: at most two auto packages per zone in the air
    const live = G.pkgs.filter(p => !p.done && p.zoneId === z.id && p.auto).length;
    if (live >= (G.diffKey === 'ace' ? 1 : 2)) continue; // AUTO is convenient, not optimal
    const engaged = new Set(G.pkgs.filter(p => !p.done && p.focusId).map(p => p.focusId));
    const u = z.units.filter(u => !u.dead && u.known && !engaged.has(u.id)).sort((a, b) => {
      const o = { sam_lr: 10, destroyer: 9, shorad: 8, frigate: 8, radar: 7, hq: 6, airfield: 6, arty: 4, mbt: 4, aaa: 3 };
      return (o[b.kind] || 1) - (o[a.kind] || 1) || ENEMY[b.kind].value - ENEMY[a.kind].value;
    })[0];
    const info = strikeInfo(u ? { type: 'unit', ref: u } : { type: 'area', zone: z, pos: cp(z.center) });
    const sug = suggestStrike(info, 0);
    if (!sug) continue;
    const p = launchFromCard(sug.picks, info);
    if (typeof p !== 'string') p.auto = true;
  }
}

// ---------------------------------------------------------------------------
// Big centre-screen callouts (Ace Combat style)
// ---------------------------------------------------------------------------
const Callout = (() => {
  let kills = 0, money = 0, killT = null, busyUntil = 0;
  function show(text, sub = '', cls = '') {
    const el = $('callout');
    el.className = ''; void el.offsetWidth;
    el.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
    el.className = 'show ' + cls;
    busyUntil = performance.now() + 1500;
  }
  // kills arriving close together (cluster bombs, salvos) are batched into one callout
  function flush() {
    if (performance.now() < busyUntil) { killT = setTimeout(flush, 400); return; }
    show(kills > 1 ? `${kills} TARGETS DESTROYED` : 'TARGET DESTROYED', `+${fmtMoney(money)}`, 'good');
    kills = 0; money = 0;
  }
  function kill(value) {
    kills++; money += value;
    clearTimeout(killT);
    killT = setTimeout(flush, 450);
  }
  return { show, kill };
})();

// ---------------------------------------------------------------------------
// First-game coach: five short steps, skippable, remembered once finished
// ---------------------------------------------------------------------------
const Coach = (() => {
  const KEY = 'skyward_coach_done';
  const STEPS = [
    { id: 'zone', text: 'A crisis is live. <b>Tap the red zone</b> on the map, or its card on the right.' },
    { id: 'strike', text: '<b>Tap a red enemy marker</b> to target it. Diamonds (◆) are SAM sites: hit those first so your jets survive.' },
    { id: 'launch', text: 'Aircraft and weapons are picked for you. <b>Press LAUNCH STRIKE.</b> Use ◀ ▶ for a safer or cheaper option.' },
    { id: 'speed', text: 'Jets are on the way. <b>Tap 2× or 4×</b> to speed up time and watch them fight.' },
    { id: 'auto', text: 'Tip: flip a zone to <b>AUTO</b> (on its card) and your air wing keeps attacking it by itself whenever jets are free.' },
    { id: 'goal', text: '<b>Secure each zone</b>: destroy its command post and break its forces. Keep GLOBAL THREAT under 100%. Good hunting!' },
  ];
  let step = -1, timer = null;
  const done = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
  function render() {
    const el = $('coach');
    if (step < 0 || step >= STEPS.length) { el.className = ''; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="cc-step mono">TRAINING ${step + 1}/${STEPS.length}</div><div class="cc-text">${STEPS[step].text}</div><button class="cc-skip" id="cc-skip">${step === STEPS.length - 1 ? 'GOT IT' : 'SKIP'}</button>`;
    el.className = 'show';
    $('cc-skip').onclick = finish;
  }
  function go(i) {
    step = i; clearTimeout(timer); render();
    if (STEPS[i] && (STEPS[i].id === 'speed' || STEPS[i].id === 'auto')) timer = setTimeout(() => step === i && go(i + 1), 16000);
    if (STEPS[i] && STEPS[i].id === 'goal') timer = setTimeout(finish, 14000);
  }
  function finish() { step = -1; clearTimeout(timer); render(); try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function start() { if (!done()) go(0); else { step = -1; render(); } }
  function event(name) {
    if (step < 0) return;
    const id = STEPS[step].id;
    if (id === 'zone' && name === 'zone') go(1);
    else if (id === 'strike' && name === 'strike') go(2);
    else if ((id === 'launch' || id === 'strike') && name === 'launch') go(3);
    else if (id === 'speed' && name === 'speed') go(4);
    else if (id === 'auto' && name === 'auto') go(5);
  }
  return { start, event, finish, reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} } };
})();
