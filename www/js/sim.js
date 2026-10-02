// ============================================================================
// SKYWARD COMMAND — simulation (state, AI, combat, economy)
// ============================================================================
let G = null;
let UID = 1;
const nid = () => UID++;

// UI hooks (replaced by ui.js)
const Hooks = { log() {}, flash() {}, debrief() {}, end() {}, float() {}, zone() {}, zoneRemoved() {}, homefront() {}, kill() {} };

const hasRes = id => G.research.has(id);
const zoneById = id => G.zones.find(z => z.id === id);
const baseById = id => G.bases.find(b => b.id === id);
const acById = id => G.aircraft.find(a => a.id === id);
const pkgById = id => G.pkgs.find(p => p.id === id);

function log(text, cls = 'info') {
  G.log.push({ t: G.time, text, cls, id: nid() });
  if (G.log.length > 250) G.log.shift();
  Hooks.log();
}
function radio(ac, text, gap = 3) {
  if (G.time - ac.lastRadio < gap) return;
  ac.lastRadio = G.time;
  log(`${ac.callsign}: ${text}`, 'radio');
}
function fx(kind, pos, opts = {}) { G.fx.push({ kind, pos: cp(pos), t: 0, dur: opts.dur || 0.8, size: opts.size || 1, text: opts.text, color: opts.color, seed: Math.random() }); }
function floatText(text, pos, color) { fx('text', pos, { text, color, dur: 1.6 }); }

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function newGame(diffKey, mode = 'campaign') {
  UID = 1;
  const D = DIFFS[diffKey];
  G = {
    mode, level: 1, levelT: ENDLESS.levelEvery, spawnT: ENDLESS.firstSpawn, homeT: rand(100, 150), zoneSerial: 0, accMul: 1,
    diffKey, D, time: 0, funds: D.funds, rp: D.rp, threat: 12, speed: 1, paused: false, over: null,
    unlocked: new Set(START_AIRCRAFT), weaponsUnlocked: new Set(START_WEAPONS), research: new Set(),
    bases: BASES.map(b => ({ ...b, pos: { lat: b.lat, lng: b.lng } })),
    aircraft: [], zones: [], pkgs: [], enemyAir: [], proj: [], fx: [], pilots: [], log: [], debriefs: [], carriers: [], carrierSerial: 0,
    callsigns: {}, pkgCounter: 0, incomeT: 15, eventT: rand(70, 100), satT: 60, sanctionsUntil: 0,
    stats: { sorties: 0, fired: 0, hits: 0, kills: {}, killValue: 0, losses: {}, lostCount: 0, rescued: 0, captured: 0, zonesSecured: 0, nukes: 0, spent: 0, earned: 0, overruns: 0, airKills: 0, homefrontHits: 0, homefrontLoss: 0 },
  };
  const starters = shuffle(STARTER_ZONES).slice(0, 2);
  // One crisis at a time to start with: the second starter zone (whose forces you also begin with)
  // joins about two minutes in, giving new players room to learn.
  if (mode === 'endless') {
    starters.forEach((id, i) => { const z = buildZone(ZONES.find(d => d.id === id)); z.activateAt = i ? 100 : 0; G.zones.push(z); });
  } else {
    ZONES.filter(zd => !zd.endless).forEach(zd => G.zones.push(buildZone(zd)));
    starters.forEach((id, i) => { zoneById(id).activateAt = i ? 120 : 0; });
    let t = 250;
    shuffle(G.zones.map(z => z.id).filter(id => !starters.includes(id))).forEach(id => {
      zoneById(id).activateAt = t;
      t += rand(85, 125) / D.threat;
    });
  }
  starters.forEach(id => STARTER_FLEET[id].forEach(([type, base]) => addAircraft(type, base)));
  addAircraft('f16', 'ramstein'); addAircraft('f16', 'ramstein');
  log(mode === 'endless' ? 'Command node online. ENDLESS operations: hold the line as long as you can.' : 'Command node online. Global threat posture: ELEVATED.', 'good');
}

// mult scales enemy unit counts (endless escalation)
function buildZone(zd, mult = 1) {
  const center = { lat: zd.lat, lng: zd.lng };
  const z = {
    id: G.mode === 'endless' ? `${zd.id}-${++G.zoneSerial}` : zd.id, defId: zd.id, name: zd.name, short: zd.short, region: zd.region, faction: zd.faction, brief: zd.brief, tpl: zd.tpl,
    center, r: zd.r, active: false, neutralized: false, activateAt: Infinity, units: [], friendlies: [], poly: [],
    initValue: 0, reinfT: rand(40, 60), airT: rand(8, 15), raidT: rand(90, 150), weatherUntil: 0, nuked: false,
  };
  // Irregular outline
  const N = 20, s = Array.from({ length: N }, () => rand(0.84, 1.16));
  for (let i = 0; i < N; i++) {
    const rr = (s[(i + N - 1) % N] + 2 * s[i] + s[(i + 1) % N]) / 4;
    const p = dest(center, (i * 360) / N, zd.r * rr);
    z.poly.push([p.lat, p.lng]);
  }
  // Front axis points toward the nearest friendly base when allies are present
  let axis = rand(0, 360);
  if (zd.friendlies > 0) {
    const nb = G.bases.slice().sort((a, b) => dist(center, a.pos) - dist(center, b.pos))[0];
    axis = bearing(center, nb.pos);
  }
  z.axis = axis;
  z.water = Terrain.waterFraction(zd.id);
  z.reef = z.water > 0.97; // land units here sit on artificial islands
  const fn = shuffle(FRIENDLY_NAMES);
  for (let i = 0; i < zd.friendlies; i++) {
    const b = axis + (zd.friendlies > 1 ? (i ? 30 : -30) : 0);
    const pos = onLand(z, () => dest(center, b + rand(-25, 25), zd.r * rand(0.5, 0.85)));
    z.friendlies.push({ id: nid(), name: fn[i], pos, hp: 100, dead: false, fireT: rand(1, 4), zoneId: z.id, underFire: false });
  }
  // Group sites (front line, artillery park, SAM belt, HQ, airbase) are always placed on land
  z.sites = {
    front: [0, 1, 2].map(() => onLand(z, () => dest(center, axis + rand(-55, 55), zd.r * rand(0.25, 0.55)))),
    mid: [0, 1].map(() => onLand(z, () => dest(center, axis + rand(-70, 70), zd.r * rand(0, 0.3)))),
    rear: [0, 1, 2].map(() => onLand(z, () => dest(center, axis + 180 + rand(-80, 80), zd.r * rand(0.15, 0.65)))),
    hq: onLand(z, () => dest(center, axis + 180 + rand(-50, 50), zd.r * rand(0.25, 0.55))),
    af: onLand(z, () => dest(center, axis + 180 + rand(-90, 90), zd.r * rand(0.35, 0.7))),
  };
  const D = G.D;
  z.initCounts = {};
  const counts = { ...TEMPLATES[zd.tpl] };
  for (const [k, n] of Object.entries(ZONE_NAVAL[zd.id] || {})) counts[k] = (counts[k] || 0) + n;
  // No real sea in this zone: warships become their land-based equivalents
  if (z.water < 0.04) {
    const swap = { frigate: 'shorad', destroyer: 'sam_lr', fac: 'technical' };
    for (const [k, v] of Object.entries(swap)) if (counts[k]) { counts[v] = (counts[v] || 0) + counts[k]; delete counts[k]; }
  }
  for (const [kind, n0] of Object.entries(counts)) {
    let n;
    if (kind === 'hq' || kind === 'airfield') n = n0;
    else {
      n = Math.round(n0 * D.count * mult + (Math.random() < 0.5 ? randInt(-1, 1) : 0));
      if (kind === 'sam_lr' || kind === 'radar') n = Math.max(1, n);
      n = Math.max(0, n);
    }
    z.initCounts[kind] = n;
    for (let i = 0; i < n; i++) z.units.push(makeUnit(z, kind, Math.random() < ENEMY[kind].known));
  }
  z.initValue = z.units.reduce((s, u) => s + ENEMY[u.kind].value, 0);
  return z;
}

// Try a position generator until it lands on land (zones with almost no land accept anything:
// those are reef fortresses built on artificial islands)
function onLand(z, gen, tries = 30) {
  let p = gen();
  if (z.water > 0.97) return p;
  for (let i = 0; i < tries && Terrain.isWater(p, z.defId); i++) p = gen();
  if (Terrain.isWater(p, z.defId)) {
    for (let i = 0; i < 60; i++) { const q = dest(z.center, rand(0, 360), z.r * Math.sqrt(Math.random()) * 0.9); if (!Terrain.isWater(q, z.defId)) return q; }
  }
  return p;
}

function seaPoint(z) {
  for (let i = 0; i < 300; i++) { const q = dest(z.center, rand(0, 360), z.r * Math.sqrt(Math.random()) * (i < 150 ? 0.92 : 1.15)); if (Terrain.isWater(q, z.defId)) return q; }
  return dest(z.center, rand(0, 360), z.r * 0.5);
}

// Final position for a unit: ships in water, everything else on land, except some IFVs, which
// are amphibious and may be found just off the coast.
function placeUnit(z, kind) {
  if (ENEMY[kind].naval) return { pos: seaPoint(z) };
  // coastal zones: some IFV platoons are afloat just off the beach
  if (kind === 'ifv' && z.water > 0.08 && z.water < 0.97 && Math.random() < 0.35) {
    for (let i = 0; i < 40; i++) { const q = seaPoint(z); if (Terrain.nearLand(q, 9, z.defId)) return { pos: q, amphib: true }; }
  }
  const p = unitPos(z, kind);
  if (!Terrain.isWater(p, z.defId) || z.water > 0.97) return { pos: p };
  if (kind === 'ifv' && Math.random() < 0.5 && Terrain.nearLand(p, 12, z.defId)) return { pos: p, amphib: true };
  return { pos: onLand(z, () => unitPos(z, kind)) };
}

function unitPos(z, kind) {
  const S = z.sites;
  switch (kind) {
    case 'inf': case 'ifv': case 'mbt': case 'technical': return dest(pick(S.front), rand(0, 360), rand(1, 9));
    case 'arty': return dest(pick(S.mid), rand(0, 360), rand(1, 8));
    case 'aaa': case 'manpad': return dest(pick([...S.front, ...S.mid, S.hq]), rand(0, 360), rand(1, 7));
    case 'shorad': return dest(pick([...S.rear, ...S.mid]), rand(0, 360), rand(2, 8));
    case 'sam_lr': return dest(pick(S.rear), rand(0, 360), rand(1, 5));
    case 'radar': return dest(pick(S.rear), rand(0, 360), rand(3, 10));
    case 'hq': return dest(S.hq, rand(0, 360), rand(0, 2));
    case 'airfield': return cp(S.af);
  }
  return cp(z.center);
}

function makeUnit(z, kind, known) {
  const E = ENEMY[kind], { pos, amphib } = placeUnit(z, kind);
  const u = { id: nid(), kind, zoneId: z.id, pos, hp: E.hp, maxHp: E.hp, known, dead: false, cool: rand(0, 4), incoming: 0 };
  if (amphib) u.amphib = true;
  if (E.ashm) u.ashmT = rand(10, E.ashm.reload);
  return u;
}

function addAircraft(type, baseId) {
  const T = AIRCRAFT[type], base = baseById(baseId);
  const n = (G.callsigns[T.callsign] = (G.callsigns[T.callsign] || 0) + 1);
  const mh = Math.round(T.hp * (hasRes('u_armor') ? 1.25 : 1));
  const ac = {
    id: nid(), type, callsign: `${T.callsign} ${Math.floor((n - 1) / 4) + 1}-${((n - 1) % 4) + 1}`, baseId,
    status: 'ready', hp: mh, maxHp: mh, readyAt: 0, pos: cp(base.pos), heading: 0, ammo: {}, gunAmmo: 0, fuel: 0, flares: 0,
    pkgId: null, state: null, cool: 0, aaCool: 0, trail: [], trailT: 0, sensT: 0, sorties: 0, kills: 0, tgt: null,
    inbound: 0, loiter: 0, timer: 0, lastRadio: -99, escort: false, orbitDir: Math.random() < 0.5 ? 1 : -1, carrying: null,
  };
  G.aircraft.push(ac);
  return ac;
}

function baseAllows(b, T) {
  return b.carrier ? !!T.naval : b.allows.includes(T.cls);
}

function buyAircraft(type, baseId) {
  const T = AIRCRAFT[type], b = baseById(baseId);
  if (!G.unlocked.has(type)) return 'Not researched';
  if (G.funds < T.cost) return 'Insufficient funds';
  if (!b || !baseAllows(b, T)) return 'Base cannot host this aircraft';
  if (b.carrier && G.aircraft.filter(a => a.baseId === b.id).length >= CARRIER.capacity) return `Carrier air wing full (${CARRIER.capacity})`;
  G.funds -= T.cost; G.stats.spent += T.cost;
  const ac = addAircraft(type, baseId);
  log(`Procurement: ${T.name} delivered to ${baseById(baseId).name} as ${ac.callsign}`, 'good');
  return ac;
}

function doResearch(id) {
  const R = RESEARCH.find(r => r.id === id);
  if (!R || G.research.has(id)) return 'Already complete';
  if (R.req && !G.research.has(R.req)) return 'Prerequisite missing';
  if (G.rp < R.cost) return 'Insufficient RP';
  G.rp -= R.cost;
  G.research.add(id);
  if (R.unlockAc) G.unlocked.add(R.unlockAc);
  if (R.unlockW) G.weaponsUnlocked.add(R.unlockW);
  if (id === 'u_armor') G.aircraft.forEach(a => { const f = 1.25; a.maxHp = Math.round(a.maxHp * f); a.hp = Math.round(a.hp * f); });
  log(`R&D complete: ${R.name}`, 'good');
  return true;
}

// ---------------------------------------------------------------------------
// Capabilities / helpers
// ---------------------------------------------------------------------------
const rangeOf = T => T.range * (hasRes('u_tank') ? 1.6 : 1);
const stealthOf = T => Math.min(0.95, T.stealth + (hasRes('u_stealth') ? 0.1 : 0));
const wUnlocked = w => G.weaponsUnlocked.has(w);
const groundCapable = W => Object.keys(W.pk).some(k => k !== 'air');
const loadWeight = lo => Object.entries(lo).reduce((s, [w, n]) => s + WEAPONS[w].w * n, 0);
const loadCost = lo => Object.entries(lo).reduce((s, [w, n]) => s + WEAPONS[w].cost * n, 0);

function presetLoadout(type, mission, zone) {
  const T = AIRCRAFT[type], lo = {};
  let cap = T.cap;
  let list = PRESETS[mission] || [];
  // Known warships in the target zone: bring anti-ship missiles
  if (zone && ['strike', 'sead', 'cas'].includes(mission) && zone.units.some(u => !u.dead && u.known && ENEMY[u.kind].naval)) list = [['harpoon', 2], ...list];
  for (const [w, max] of list) {
    if (!T.weapons.includes(w) || !wUnlocked(w)) continue;
    const n = Math.min(max, Math.floor((cap + 1e-9) / WEAPONS[w].w));
    if (n > 0) { lo[w] = n; cap -= n * WEAPONS[w].w; }
  }
  return lo;
}

function canFly(type, mission) {
  const T = AIRCRAFT[type];
  switch (mission) {
    case 'strike': case 'sead': case 'cas': return !T.utility && T.cap > 0;
    case 'cap': case 'defend': return T.weapons.includes('aim120') || T.weapons.includes('aim9');
    case 'recon': return !T.utility;
    case 'rescue': case 'reinforce': return !!T.utility;
    case 'nuclear': return T.weapons.includes('b61') && wUnlocked('b61');
  }
  return false;
}

function hasAG(ac) {
  if (AIRCRAFT[ac.type].gun && ac.gunAmmo > 0) return true;
  return Object.entries(ac.ammo).some(([w, n]) => n > 0 && w !== 'b61' && groundCapable(WEAPONS[w]));
}
const hasAA = ac => (ac.ammo.aim120 || 0) + (ac.ammo.aim9 || 0) > 0;

function effRange(A, a) {
  const T = AIRCRAFT[a.type], alt = T.alt;
  let r = A.range;
  if (A.type === 'radar') r *= (1 - stealthOf(T) * 0.75) * (alt === 'low' ? 0.55 : 1);
  else if (A.type === 'ir') r *= alt === 'high' ? 0.5 : alt === 'med' ? 0.8 : 1;
  else r *= alt === 'high' ? 0.25 : alt === 'med' ? 0.6 : 1;
  return r;
}

function ecmCover(a) {
  return G._air.some(g => AIRCRAFT[g.type].ecm && dist(g.pos, a.pos) <= AIRCRAFT[g.type].ecm);
}

function inCombatArea(pos) {
  return G.zones.some(z => z.active && !z.neutralized && dist(pos, z.center) < z.r + 25);
}

function zoneAtPos(pos) {
  return G.zones.find(z => z.active && pointInPoly(pos, z.poly)) || null;
}

const aliveValue = z => z.units.reduce((s, u) => s + (u.dead ? 0 : ENEMY[u.kind].value), 0);

function missionTarget(plan) {
  if (plan.mission === 'defend') {
    const b = baseById(plan.baseId);
    return b ? { pos: b.pos, name: `${b.name} (defense)` } : null;
  }
  if (plan.mission === 'rescue') {
    const p = G.pilots.find(p => p.id === plan.pilotId && !p.gone);
    return p ? { pos: p.pos, name: `${p.callsign} (downed)` } : null;
  }
  const z = zoneById(plan.zoneId);
  if (!z || !z.active || z.neutralized) return null;
  if (plan.mission === 'reinforce') {
    const f = z.friendlies.find(f => f.id === plan.friendlyId && !f.dead);
    return f ? { pos: f.pos, name: f.name } : null;
  }
  return { pos: z.center, name: z.name };
}

function pkgTargetPos(pkg) {
  // tapped a specific target or spot: fly straight there while the zone is still hot
  const z = pkg.zoneId ? zoneById(pkg.zoneId) : null;
  if (z && z.active && !z.neutralized) {
    if (pkg.focusId) { const u = z.units.find(u => u.id === pkg.focusId && !u.dead); if (u) return u.pos; }
    if (pkg.focusPos) return pkg.focusPos;
  }
  return (missionTarget(pkg) || {}).pos || null;
}

function rangeCheck(ac, tpos) {
  const d = dist(baseById(ac.baseId).pos, tpos);
  return { d, ok: d * 2 + 300 <= rangeOf(AIRCRAFT[ac.type]) };
}

// Rough survival estimate against KNOWN threats only
function estimateSurvival(type, z, mission) {
  if (!z) return 0.95;
  const T = AIRCRAFT[type], st = stealthOf(T);
  const alive = z.units.filter(u => !u.dead && u.known);
  const radarUp = alive.some(u => u.kind === 'radar' || u.kind === 'hq');
  let surv = 1;
  for (const u of alive) {
    const A = ENEMY[u.kind].aa;
    if (!A) continue;
    const er = effRange(A, { type });
    if (er < 1.6) continue;
    let acc = A.acc * G.D.acc * G.accMul;
    if (A.type === 'radar') acc *= (radarUp ? 1 : 0.7) * (1 - st * 0.45);
    if (A.type !== 'gun' && T.flares > 0) acc *= 0.6;
    let shots = A.type === 'gun' ? 3 : er > 30 ? 2 : 1.5;
    if (mission === 'sead' && A.type === 'radar') shots *= 0.5;
    const pk = A.type === 'gun' ? Math.min(1, (A.burst * acc * A.dmg) / T.hp) : acc * Math.min(1, (A.dmg * 1.1) / T.hp);
    surv *= Math.pow(1 - pk * 0.5, shots);
  }
  if (FACTIONS[z.faction].air && z.units.some(u => u.kind === 'airfield' && !u.dead)) surv *= 1 - 0.15 * (1 - st);
  return clamp(surv, 0.03, 0.99);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
function launchPackage(plan) {
  const tgt = missionTarget(plan);
  if (!tgt) return 'No valid objective';
  const acs = plan.acIds.map(acById).filter(a => a && a.status === 'ready');
  if (!acs.length) return 'No aircraft selected';
  let cost = 0;
  for (const ac of acs) {
    cost += loadCost(plan.loadouts[ac.id] || {});
    if (!rangeCheck(ac, tgt.pos).ok) return `${ac.callsign} is out of range`;
    if (!canFly(ac.type, plan.mission)) return `${ac.callsign} cannot fly this mission`;
  }
  if (cost > G.funds + 1e-6) return 'Insufficient funds for munitions';
  if (plan.mission === 'nuclear' && !acs.some(a => (plan.loadouts[a.id] || {}).b61)) return 'No B61 loaded';

  const cyc = Math.floor(G.pkgCounter / 26);
  const name = PHONETIC[G.pkgCounter % 26] + (cyc ? ` ${cyc + 1}` : '');
  G.pkgCounter++;
  const z = plan.zoneId ? zoneById(plan.zoneId) : null;
  const pkg = {
    id: nid(), name, mission: plan.mission, zoneId: plan.mission === 'rescue' || plan.mission === 'defend' ? null : plan.zoneId, baseId: plan.baseId || null, pilotId: plan.pilotId || null, friendlyId: plan.friendlyId || null,
    acIds: acs.map(a => a.id), live: new Set(acs.map(a => a.id)), launchedAt: G.time, done: false, cost, targetName: tgt.name,
    roster: acs.map(a => ({ callsign: a.callsign, type: a.type })), focusId: plan.focusId || null, focusPos: plan.focusPos || null,
    stats: { fired: 0, hits: 0, kills: {}, killValue: 0, lost: [], earnedF: 0, earnedRP: 0, rescued: 0, objective: null, revealed: 0 },
  };
  G.pkgs.push(pkg);
  for (const ac of acs) {
    const T = AIRCRAFT[ac.type], base = baseById(ac.baseId);
    Object.assign(ac, {
      ammo: { ...(plan.loadouts[ac.id] || {}) }, gunAmmo: T.gun ? T.gun.ammo : 0, fuel: rangeOf(T),
      flares: T.flares + (hasRes('u_cm') && T.flares > 0 ? 2 : 0), status: 'airborne', state: 'outbound', pkgId: pkg.id,
      pos: cp(base.pos), heading: bearing(base.pos, tgt.pos), trail: [], tgt: null, loiter: 0, timer: 0, inbound: 0, carrying: null,
    });
    ac.escort = ['strike', 'sead', 'cas'].includes(pkg.mission) && !hasAG(ac) && hasAA(ac);
  }
  G.funds -= cost; G.stats.spent += cost; G.stats.sorties += acs.length;
  const counts = {};
  acs.forEach(a => { counts[AIRCRAFT[a.type].short] = (counts[AIRCRAFT[a.type].short] || 0) + 1; });
  const summary = Object.entries(counts).map(([k, v]) => `${v}× ${k}`).join(', ');
  log(`Package ${name} airborne: ${summary} → ${tgt.name} [${MISSIONS[plan.mission].name}]`, 'good');
  if (plan.mission === 'nuclear') log(`NUCLEAR RELEASE AUTHORIZED — package ${name} en route to ${z.name}`, 'alert');
  return pkg;
}

function recallPackage(pkg) {
  pkg.acIds.map(acById).forEach(a => { if (a && a.status === 'airborne') rtb(a, 'Copy recall, RTB', 0); });
}

function rtb(ac, msg, gap = 3) {
  if (ac.state === 'rtb') return;
  ac.state = 'rtb';
  ac.tgt = null;
  if (msg) radio(ac, msg, gap);
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------
function update(dt) {
  if (G.over) return;
  G.time += dt;
  G._air = G.aircraft.filter(a => a.status === 'airborne');
  economy(dt);
  if (G.mode === 'endless') endlessTick(dt);
  for (const z of G.zones) updateZone(z, dt);
  for (const ac of G.aircraft.slice()) {
    if (ac.status === 'airborne') updateAircraft(ac, dt);
    else if (ac.status === 'rearm' && G.time >= ac.readyAt) { ac.status = 'ready'; ac.hp = ac.maxHp; }
  }
  for (const e of G.enemyAir) if (!e.removed) updateEnemyAir(e, dt);
  updateCarriers(dt);
  if (typeof autoOpsTick === 'function') autoOpsTick(dt);
  G.enemyAir = G.enemyAir.filter(e => !e.removed);
  updateProjectiles(dt);
  updatePilots();
  randomEvents(dt);
  // finished packages linger briefly so munitions still in the air get credited
  if (G.pkgs.length > 8) G.pkgs = G.pkgs.filter(p => !p.done || G.time - p.endedAt < 30);
  G.threat = clamp(G.threat, 0, 100);
  if (G.threat >= 100) { G.over = 'defeat'; Hooks.end('defeat'); }
  else if (G.mode === 'campaign' && G.zones.every(z => z.neutralized)) { G.over = 'victory'; Hooks.end('victory'); }
}

function economy(dt) {
  G.incomeT -= dt;
  if (G.incomeT <= 0) {
    G.incomeT = 15;
    const amt = (8 + 2 * Math.min(10, G.stats.zonesSecured)) * G.D.income * (G.time < G.sanctionsUntil ? 0.5 : 1);
    // Upkeep: every airframe and carrier costs a little each cycle, so fleets can't snowball forever
    const up = upkeep();
    G.funds = Math.max(0, G.funds + amt - up); G.stats.earned += amt; G.stats.upkeep = (G.stats.upkeep || 0) + up;
    const net = amt - up;
    Hooks.float(`${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}`, net < 0);
  }
  if (hasRes('u_sat')) {
    G.satT -= dt;
    if (G.satT <= 0) {
      G.satT = 60;
      let n = 0;
      G.zones.forEach(z => { if (z.active && !z.neutralized) z.units.forEach(u => { if (!u.dead && !u.known && Math.random() < 0.3) { u.known = true; n++; } }); });
      if (n) log(`Satellite pass complete: ${n} new hostile contacts catalogued`, 'good');
    }
  }
}

// ---------------------------------------------------------------------------
// Zones: activation, AA, ground battle, reinforcement, air ops
// ---------------------------------------------------------------------------
function updateZone(z, dt) {
  if (!z.active) {
    if (G.time >= z.activateAt) {
      z.active = true;
      if (G.mode === 'campaign') escalateZone(z);
      log(`FLASH TRAFFIC — hostile activity confirmed: ${z.name} (${z.region})`, 'alert');
      Hooks.zone(z);
    }
    return;
  }
  if (z.neutralized) return;
  const alive = z.units.filter(u => !u.dead);
  // threat builds slowly for the first few minutes, then at full rate
  G.threat += dt * 0.016 * Math.min(1, 0.35 + G.time / 420) * Math.min(1.5, aliveValue(z) / z.initValue) * G.D.threat * (1 + 0.06 * (G.level - 1));

  // Air defense
  const radarUp = alive.some(u => u.kind === 'radar' || u.kind === 'hq');
  for (const u of alive) {
    const A = ENEMY[u.kind].aa;
    if (!A) continue;
    u.cool -= dt;
    if (u.cool > 0) continue;
    let best = null, bd = 1e9;
    for (const a of G._air) {
      if (a.status !== 'airborne') continue;
      const d = dist(u.pos, a.pos);
      if (d > A.range + 1 || d >= bd || a.inbound >= 2) continue;
      if (d <= effRange(A, a)) { best = a; bd = d; }
    }
    if (!best) { u.cool = 0.4; continue; }
    enemyFire(u, A, best, z, radarUp);
  }

  groundBattle(z, alive, dt);
  navalOps(z, alive, dt);

  const hqUp = alive.some(u => u.kind === 'hq');
  if (hqUp) {
    z.reinfT -= dt;
    if (z.reinfT <= 0) { z.reinfT = rand(38, 55) / G.D.count; reinforce(z); }
  }

  const F = FACTIONS[z.faction];
  if (F.air) {
    const af = alive.find(u => u.kind === 'airfield');
    if (af) {
      z.airT -= dt;
      if (z.airT <= 0) {
        const near = G._air.some(a => dist(a.pos, z.center) < z.r + 350);
        const mine = G.enemyAir.filter(e => e.zoneId === z.id && e.kind === 'fighter').length;
        if (near && mine < Math.round(2 * G.D.count)) { scramble(z, af); z.airT = rand(40, 60) / G.D.count; }
        else z.airT = 4;
      }
    }
    if (hqUp) {
      z.raidT -= dt;
      if (z.raidT <= 0) { z.raidT = rand(110, 170) / G.D.threat; launchRaid(z); }
    }
  }
  checkNeutralized(z);
}

function enemyFire(u, A, a, z, radarUp) {
  const T = AIRCRAFT[a.type], st = stealthOf(T);
  let acc = A.acc * G.D.acc * G.accMul;
  if (A.type === 'radar') { acc *= (radarUp ? 1 : 0.7) * (1 - st * 0.45); if (ecmCover(a)) acc *= 0.6; }
  if (G.time < z.weatherUntil) acc *= 0.75;
  u.cool = A.reload * rand(0.85, 1.15);
  const E = ENEMY[u.kind];
  if (!u.known) {
    u.known = true;
    if (A.type !== 'gun') log(`⚠ ${E.short} launch at ${z.short} — emitter located`, 'warn');
  }
  if (A.type === 'gun') {
    for (let i = 0; i < A.burst; i++) {
      const hit = Math.random() < acc;
      G.proj.push({ id: nid(), side: 'red', kind: 'bullet', pos: cp(u.pos), tgt: a, tgtType: 'ac', homing: hit, aim: dest(a.pos, rand(0, 360), rand(0.4, 1.5)),
        speed: A.speed, willHit: hit, dmg: A.dmg, delay: i * 0.08, src: E.name, age: 0, maxAge: 4 });
    }
    return;
  }
  let cm = false;
  if (a.flares > 0) { a.flares--; acc *= hasRes('u_cm') ? 0.42 : 0.55; cm = true; }
  a.inbound++;
  G.proj.push({ id: nid(), side: 'red', kind: 'missile', pos: cp(u.pos), tgt: a, tgtType: 'ac', homing: true, speed: A.speed, willHit: Math.random() < acc,
    dmg: A.dmg, src: E.name, cm, age: 0, maxAge: 12, trail: [], countsInbound: true });
  radio(a, pick(['Missile launch! Defending!', 'SAM launch, going defensive!', 'Spike! Missile in the air!', 'Launch, launch! Notching!']), 6);
}

function groundBattle(z, alive, dt) {
  for (const f of z.friendlies) {
    if (f.dead) continue;
    let atk = 0;
    const near = [];
    for (const u of alive) {
      const E = ENEMY[u.kind];
      if (!E.atk) continue;
      if (dist(u.pos, f.pos) < 80) { atk += E.atk; near.push(u); }
    }
    f.hp -= atk * 0.0032 * G.D.acc * dt;
    f.underFire = atk > 0;
    f.fireT -= dt;
    if (f.fireT <= 0 && near.length) {
      f.fireT = rand(3, 6);
      const u = pick(near);
      for (let i = 0; i < 4; i++) G.proj.push({ id: nid(), side: 'fx', kind: 'tracer', color: 'blue', pos: dest(f.pos, rand(0, 360), rand(0, 3)), aim: dest(u.pos, rand(0, 360), rand(0, 2)), speed: 18, delay: i * 0.12, age: 0, maxAge: 8 });
      if (Math.random() < 0.3) damageUnit(u, 30, null);
    }
    if (near.length && Math.random() < dt * 1.2) {
      const u = pick(near);
      const shell = u.kind === 'arty' || u.kind === 'mbt';
      G.proj.push({ id: nid(), side: 'fx', kind: shell ? 'shell' : 'tracer', color: 'red', pos: cp(u.pos), aim: dest(f.pos, rand(0, 360), rand(0, 4)), speed: shell ? 9 : 18, age: 0, maxAge: 12 });
    }
    if (f.hp <= 0) {
      f.dead = true; f.hp = 0;
      G.threat += 8; G.stats.overruns++; G.funds = Math.max(0, G.funds - 25);
      log(`${f.name} OVERRUN at ${z.short}. Allied position lost. Threat +8`, 'alert');
      Hooks.flash('red');
    }
  }
}

function reinforce(z) {
  const dead = z.units.filter(u => u.dead && u.kind !== 'hq' && u.kind !== 'airfield');
  if (!dead.length) return;
  const u = pick(dead);
  const { pos, amphib } = placeUnit(z, u.kind);
  Object.assign(u, { dead: false, hp: u.maxHp, known: false, pos, amphib: !!amphib, incoming: 0, cool: rand(2, 5) });
  log(`Intel: enemy reinforcements moving into ${z.short} (${ENEMY[u.kind].short}). Command post still active.`, 'info');
}

function scramble(z, af) {
  const F = FACTIONS[z.faction];
  const n = G.D.count >= 1 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    G.enemyAir.push({ id: nid(), kind: 'fighter', name: F.fighter, zoneId: z.id, pos: dest(af.pos, rand(0, 360), 2), home: cp(af.pos), heading: rand(0, 360),
      hp: 100, maxHp: 100, missiles: 4, cool: rand(2, 4), state: 'intercept', tgt: null, life: 0, inbound: 0, delay: i * 1.5, trail: [], trailT: 0, acqT: 0 });
  }
  log(`⚠ ${n}× ${F.fighter} scrambled from ${z.short} airbase`, 'warn');
}

function launchRaid(z) {
  const F = FACTIONS[z.faction];
  const cands = G.bases.filter(b => dist(b.pos, z.center) < 2600 && G.aircraft.some(a => a.baseId === b.id));
  if (!cands.length) return;
  const base = cands.sort((a, b) => dist(a.pos, z.center) - dist(b.pos, z.center))[0];
  const n = Math.max(1, Math.round(2 * G.D.count));
  const start = dest(z.center, bearing(z.center, base.pos), 15);
  for (let i = 0; i < n; i++) {
    G.enemyAir.push({ id: nid(), kind: 'cruise', name: F.cruise, zoneId: z.id, pos: dest(start, rand(0, 360), 4), target: base.id, heading: bearing(start, base.pos),
      hp: 1, maxHp: 1, speed: 28, life: 0, inbound: 0, delay: i * 1.4, trail: [], trailT: 0 });
  }
  const eta = Math.round(dist(start, base.pos) / 28);
  log(`VAMPIRE VAMPIRE — ${n}× ${F.cruise} cruise missiles launched from ${z.short} at ${base.name}! ETA ${eta}s`, 'alert');
  Hooks.flash('amber');
}

function checkNeutralized(z) {
  if (z.neutralized || !z.active) return;
  const alive = z.units.filter(u => !u.dead);
  if (alive.some(u => u.kind === 'hq' || u.kind === 'airfield')) return;
  if (aliveValue(z) > z.initValue * 0.25) return;
  z.neutralized = true;
  z.securedAt = G.time;
  alive.forEach(u => { u.dead = true; u.surrendered = true; });
  z.friendlies.forEach(f => { if (!f.dead) f.hp = 100; });
  G.enemyAir.forEach(e => { if (e.zoneId === z.id && e.kind === 'fighter') e.removed = true; });
  G.funds += 60; G.rp += 25; G.threat -= 10; G.stats.zonesSecured++; G.stats.earned += 60;
  // Crisis director: winning fast pulls the next crisis forward, so strong play keeps getting tested
  if (G.mode === 'campaign') {
    const next = G.zones.filter(n => !n.active).sort((a, b) => a.activateAt - b.activateAt)[0];
    if (next && next.activateAt > G.time + 45) next.activateAt = G.time + 45;
  }
  log(`ZONE SECURED — ${z.name}. Enemy forces have collapsed. +$60M, +25 RP, threat −10`, 'good');
  Hooks.zone(z);
}

// ---------------------------------------------------------------------------
// Player aircraft
// ---------------------------------------------------------------------------
function updateAircraft(ac, dt) {
  const T = AIRCRAFT[ac.type], pkg = pkgById(ac.pkgId), base = baseById(ac.baseId);
  const z = pkg && pkg.zoneId ? zoneById(pkg.zoneId) : null;
  ac.cool -= dt; ac.aaCool -= dt;
  const dHome = dist(ac.pos, base.pos);
  const combat = inCombatArea(ac.pos) || (ac.state === 'combat' && pkg.mission === 'defend');
  const spd = combat ? KM_COMBAT * Math.max(T.speed, 0.5) : KM_TRANSIT * T.speed;

  if (ac.state !== 'rtb') {
    if (ac.fuel < dHome * 1.08 + 40) rtb(ac, 'Bingo fuel, RTB', 0);
    else if (!T.unmanned && ac.hp < ac.maxHp * 0.3) rtb(ac, 'Heavy damage, RTB', 0);
  }
  airToAir(ac);

  let goal = null, mode = 'steer';
  if (ac.state === 'outbound') {
    const tp = pkgTargetPos(pkg);
    if (!tp) rtb(ac, 'Objective lost, RTB');
    else {
      goal = tp;
      const d = dist(ac.pos, tp), m = pkg.mission;
      if (m === 'rescue' || m === 'reinforce') { if (d < 12) ac.state = 'hover'; }
      else if (m === 'defend') { if (d < 40) ac.state = 'combat'; }
      else if (m === 'nuclear') { if (d < 40) ac.state = 'combat'; }
      else if (z && d < z.r + (m === 'recon' || m === 'cap' ? 20 : 90)) ac.state = 'combat';
    }
  }
  if (ac.state === 'combat') {
    const r = pkg.mission === 'defend' ? defendLogic(ac, pkg, dt) : z ? combatLogic(ac, T, pkg, z, dt) : (rtb(ac, 'RTB'), {});
    goal = r.goal || null;
    if (r.orbit) mode = 'orbit';
  }
  if (ac.state === 'hover') {
    const tp = pkgTargetPos(pkg);
    if (!tp) rtb(ac, 'Objective lost, RTB');
    else if (dist(ac.pos, tp) < 1.2) {
      mode = 'hold';
      ac.timer += dt;
      if (ac.timer >= 3) completeUtility(ac, pkg);
    } else goal = tp;
  }
  if (ac.state === 'rtb') {
    goal = base.pos;
    if (dHome <= Math.max(spd * dt * 1.2, 3)) { land(ac); return; }
  }

  if (mode !== 'hold') {
    const turn = (T.cls === 'heli' ? 220 : T.cls === 'bomber' ? 45 : T.cls === 'drone' ? 70 : 85) * dt;
    let step = spd * dt;
    if (mode === 'orbit') ac.heading = (ac.heading + turn * 0.6 * ac.orbitDir + 360) % 360;
    else if (goal) {
      const d = dist(ac.pos, goal), want = bearing(ac.pos, goal);
      if (d < step * 3) ac.heading = want;
      else ac.heading = (ac.heading + clamp(angDiff(ac.heading, want), -turn, turn) + 360) % 360;
      if (ac.state === 'hover') step = Math.min(step, d);
    }
    ac.pos = dest(ac.pos, ac.heading, step);
    ac.fuel -= step * (combat ? 1.4 : 1);
  }
  ac.trailT += dt;
  if (ac.trailT > 0.2) { ac.trailT = 0; ac.trail.push(cp(ac.pos)); if (ac.trail.length > 18) ac.trail.shift(); }
  ac.sensT -= dt;
  if (ac.sensT <= 0) { ac.sensT = 0.5; sense(ac, T, pkg); }
}

const PRIORITY = {
  sead: { sam_lr: 10, destroyer: 9, shorad: 9, radar: 8, frigate: 8, aaa: 6, manpad: 5, fac: 3 },
  cas: { arty: 9, mbt: 8, ifv: 7, technical: 7, inf: 6, aaa: 5, manpad: 5, fac: 5 },
  strike: { hq: 10, airfield: 9, destroyer: 8, sam_lr: 7, frigate: 7, radar: 6, arty: 6, shorad: 5, mbt: 5, fac: 4 },
};

function combatLogic(ac, T, pkg, z, dt) {
  const m = pkg.mission;
  if (z.neutralized) { rtb(ac, `${z.short} secured, RTB`); return {}; }

  if (m === 'recon') {
    ac.timer += dt;
    if (ac.timer > 24) { rtb(ac, 'Recon complete, RTB'); return {}; }
    const c = pkg.focusPos || z.center, rr = pkg.focusPos ? 22 : z.r * 0.45;
    return { goal: dest(c, (G.time * 14 * ac.orbitDir + ac.id * 97) % 360, rr) };
  }

  if (m === 'cap' || ac.escort) {
    if (!hasAA(ac)) { rtb(ac, 'Winchester, RTB'); return {}; }
    const e = nearestEnemyAir(ac.pos, 160);
    if (e) return { goal: e.pos };
    if (ac.escort) {
      const lead = pkg.acIds.map(acById).find(a => a && a !== ac && a.status === 'airborne' && !a.escort && a.state !== 'rtb');
      if (lead) return { goal: dest(lead.pos, lead.heading + 160, 10) };
      rtb(ac, 'Package egressing, RTB'); return {};
    }
    ac.timer += dt;
    if (ac.timer > 50) { rtb(ac, 'CAP time complete, RTB'); return {}; }
    return { goal: dest(z.center, (G.time * 10 * ac.orbitDir + ac.id * 97) % 360, z.r * 0.6) };
  }

  if (m === 'nuclear') {
    if (!ac.ammo.b61) { rtb(ac, 'RTB'); return {}; }
    if (dist(ac.pos, z.center) <= WEAPONS.b61.range) {
      ac.ammo.b61--;
      G.proj.push({ id: nid(), side: 'blue', kind: 'nuke', wid: 'b61', pos: cp(ac.pos), tgt: null, tgtType: 'point', aim: cp(z.center), speed: 3, willHit: true, dmg: 0, area: 45, pkgId: pkg.id, owner: ac.id, age: 0, maxAge: 10 });
      pkg.stats.fired++; G.stats.fired++;
      radio(ac, 'Bright Light, Bright Light. Weapon away.', 0);
      rtb(ac, null);
      return {};
    }
    return { goal: z.center };
  }

  // strike / sead / cas
  if (!hasAG(ac)) { rtb(ac, 'Winchester, RTB'); return {}; }
  let t = ac.tgt;
  if (!t || t.dead || !t.known || !weaponFor(ac, t)) t = ac.tgt = pickTarget(ac, pkg, z);
  if (!t) {
    ac.loiter += dt;
    if (ac.loiter > 10) { rtb(ac, z.units.some(u => !u.dead && u.known) ? 'No suitable targets for loadout, RTB' : 'No targets located, RTB'); return {}; }
    return dist(ac.pos, z.center) < 12 ? { orbit: true } : { goal: z.center };
  }
  ac.loiter = 0;
  // Spread fire across the package: don't stack munitions on a target already being engaged
  if (t.incoming > 0 && ac.cool <= 0) {
    const alt = pickTarget(ac, pkg, z);
    if (alt && alt.incoming === 0) t = ac.tgt = alt;
  }
  const w = weaponFor(ac, t), d = dist(ac.pos, t.pos);
  if (w.gun) {
    if (d <= w.range && ac.cool <= 0) fireWeapon(ac, w, t, pkg);
    return d < 1.2 ? { orbit: true } : { goal: t.pos };
  }
  if (d <= w.range) {
    if (ac.cool <= 0) fireWeapon(ac, w, t, pkg);
    return { orbit: true };
  }
  return { goal: t.pos };
}

function weaponFor(ac, u) {
  const T = AIRCRAFT[ac.type], E = ENEMY[u.kind], cls = E.cls, threat = !!E.aa;
  let best = null, bs = -1;
  for (const [w, n] of Object.entries(ac.ammo)) {
    if (n <= 0 || w === 'b61') continue;
    const W = WEAPONS[w], pk = W.pk[cls] || 0;
    if (pk < 0.15) continue;
    const s = pk * Math.min(1, W.dmg / u.hp) + (threat ? W.range * 0.002 : 0) - (W.cost * 0.15) / E.value;
    if (s > bs) { bs = s; best = { id: w, range: W.range }; }
  }
  if (T.gun && ac.gunAmmo > 0) {
    const pk = T.gun.pk[cls] || 0;
    if (pk >= 0.15) {
      const s = pk * Math.min(1, T.gun.dmg / u.hp) * 0.9;
      if (s > bs) { bs = s; best = { id: 'gun', range: T.gun.range, gun: true }; }
    }
  }
  return best;
}

function pickTarget(ac, pkg, z) {
  const pri = PRIORITY[pkg.mission] || PRIORITY.strike;
  // the target you tapped comes first (unless enough munitions are already on the way)
  if (pkg.focusId) {
    const f = z.units.find(u => u.id === pkg.focusId);
    if (f && !f.dead && f.known && f.incoming < 2 && weaponFor(ac, f)) return f;
  }
  const fr = z.friendlies.filter(f => !f.dead);
  const fp = pkg.focusPos || (pkg.focusId && (z.units.find(u => u.id === pkg.focusId) || {}).pos);
  let best = null, bs = -1e9;
  for (const u of z.units) {
    if (u.dead || !u.known || !weaponFor(ac, u)) continue;
    let s = (pri[u.kind] || 2) * 100 - dist(ac.pos, u.pos) * 0.8 - (u.incoming > 0 ? 400 : 0);
    if (fp) s += Math.max(0, 500 - dist(u.pos, fp) * 10); // then whatever is near that spot
    if (pkg.mission === 'cas' && fr.length) s += Math.max(0, 80 - Math.min(...fr.map(f => dist(f.pos, u.pos)))) * 3;
    if (s > bs) { bs = s; best = u; }
  }
  return best;
}

function fireWeapon(ac, w, t, pkg) {
  const T = AIRCRAFT[ac.type], E = ENEMY[t.kind], z = zoneById(t.zoneId);
  const wf = z && G.time < z.weatherUntil ? 0.8 : 1;
  pkg.stats.fired++; G.stats.fired++;
  if (w.gun) {
    ac.gunAmmo--; ac.cool = 1.4;
    const hit = Math.random() < (T.gun.pk[E.cls] || 0) * wf;
    t.incoming++;
    for (let i = 0; i < 7; i++) {
      const last = i === 6;
      G.proj.push({ id: nid(), side: 'blue', kind: 'bullet', pos: cp(ac.pos), tgt: last ? t : null, tgtType: last ? 'unit' : 'none', aim: dest(t.pos, rand(0, 360), rand(0, 0.5)),
        speed: 12, delay: i * 0.05, willHit: hit, dmg: T.gun.dmg, pkgId: pkg.id, owner: ac.id, age: 0, maxAge: 3 });
    }
    radio(ac, pick(['Guns, guns, guns!', 'Rolling in hot, guns!', 'Brrrt. Guns on target.']), 8);
    return;
  }
  const W = WEAPONS[w.id];
  ac.ammo[w.id]--;
  ac.cool = W.kind === 'bomb' ? 0.9 : 1.5;
  t.incoming++;
  const d = dist(ac.pos, t.pos);
  G.proj.push({ id: nid(), side: 'blue', kind: W.kind, wid: w.id, pos: cp(ac.pos), tgt: t, tgtType: 'unit', aim: cp(t.pos), speed: W.speed,
    willHit: Math.random() < (W.pk[E.cls] || 0) * wf, dmg: W.dmg, area: W.area || 0, pkgId: pkg.id, owner: ac.id,
    trail: W.kind === 'bomb' ? null : [], age: 0, maxAge: d / W.speed * 1.5 + 3 });
  radio(ac, `${W.call}! ${W.short} on ${E.short}.`, 4);
}

function nearestEnemyAir(pos, maxD) {
  let best = null, bd = maxD;
  for (const e of G.enemyAir) {
    if (e.removed || e.delay > 0) continue;
    const d = dist(pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function airToAir(ac) {
  if (ac.aaCool > 0 || !hasAA(ac)) return;
  const T = AIRCRAFT[ac.type];
  const det = 60 + T.sensor;
  let best = null, bd = det;
  for (const e of G.enemyAir) {
    if (e.removed || e.delay > 0 || e.inbound >= 1) continue;
    const d = dist(ac.pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  const w = ac.ammo.aim9 > 0 && bd <= WEAPONS.aim9.range ? 'aim9' : ac.ammo.aim120 > 0 && bd <= WEAPONS.aim120.range ? 'aim120' : null;
  if (!w) return;
  const W = WEAPONS[w], pkg = pkgById(ac.pkgId);
  ac.ammo[w]--; ac.aaCool = 2;
  best.inbound++;
  G.proj.push({ id: nid(), side: 'blue', kind: 'missile', wid: w, pos: cp(ac.pos), tgt: best, tgtType: 'eair', homing: true, speed: W.speed,
    willHit: Math.random() < W.pk.air * (best.kind === 'cruise' || best.kind === 'ashm' ? 0.8 : best.kind === 'drone' ? 0.92 : 0.95), dmg: W.dmg, pkgId: ac.pkgId, owner: ac.id, trail: [], age: 0, maxAge: 8 });
  if (pkg) pkg.stats.fired++;
  G.stats.fired++;
  radio(ac, `${W.call}! Targeting ${best.name}.`, 2);
}

function sense(ac, T, pkg) {
  const range = T.sensor * (pkg && pkg.mission === 'recon' && ac.state === 'combat' ? 1.6 : 1);
  let n = 0;
  for (const z of G.zones) {
    if (!z.active || z.neutralized || dist(ac.pos, z.center) > z.r + range + 30) continue;
    for (const u of z.units) {
      if (u.dead || u.known || dist(ac.pos, u.pos) > range) continue;
      u.known = true; n++;
      const E = ENEMY[u.kind];
      if (E.aa && E.cls === 'radar') log(`${ac.callsign}: New contact — ${E.name} at ${z.short}`, 'radio');
    }
  }
  if (pkg && n) pkg.stats.revealed += n;
}

function completeUtility(ac, pkg) {
  ac.timer = 0;
  if (pkg.mission === 'rescue') {
    const p = G.pilots.find(p => p.id === pkg.pilotId);
    if (p && !p.gone) {
      p.gone = true; ac.carrying = p;
      pkg.stats.objective = `${p.callsign} recovered`;
      radio(ac, `Survivor aboard! ${p.callsign} is safe. RTB.`, 0);
    }
  } else {
    const z = zoneById(pkg.zoneId), f = z && z.friendlies.find(f => f.id === pkg.friendlyId);
    if (f && !f.dead) {
      f.hp = Math.min(100, f.hp + 40);
      G.rp += 4;
      pkg.stats.objective = `${f.name} reinforced`;
      log(`${ac.callsign} delivered troops and ammunition to ${f.name} (+40%)`, 'good');
    }
  }
  rtb(ac, null);
}

function land(ac) {
  const T = AIRCRAFT[ac.type], base = baseById(ac.baseId), pkg = pkgById(ac.pkgId);
  const k = hasRes('u_turn') ? 0.5 : 1;
  Object.assign(ac, { status: 'rearm', state: null, pos: cp(base.pos), trail: [], tgt: null, ammo: {}, gunAmmo: 0, inbound: 0 });
  ac.readyAt = G.time + (T.turnaround + (1 - ac.hp / ac.maxHp) * 30) * k;
  ac.sorties++;
  if (ac.carrying) {
    const mult = hasRes('u_csar') ? 2 : 1;
    G.stats.rescued++; G.rp += 12 * mult; G.funds += 10 * mult;
    if (pkg) pkg.stats.rescued++;
    log(`${ac.carrying.callsign} delivered safely to ${base.name}. +${12 * mult} RP`, 'good');
    ac.carrying = null;
  }
  if (pkg) { pkg.live.delete(ac.id); checkPkg(pkg); }
  ac.pkgId = null;
}

function damageAircraft(ac, dmg, src) {
  if (ac.status !== 'airborne') return;
  ac.hp -= dmg * rand(0.8, 1.2);
  fx('hit', ac.pos, { dur: 0.5 });
  if (ac.hp <= 0) shootDown(ac, src);
  else { floatText('HIT', ac.pos, '#ffb648'); radio(ac, `I'm hit! Airframe ${Math.round((ac.hp / ac.maxHp) * 100)}%`, 2); }
}

function shootDown(ac, src) {
  const T = AIRCRAFT[ac.type], pkg = pkgById(ac.pkgId);
  ac.status = 'lost';
  G.aircraft = G.aircraft.filter(a => a !== ac);
  fx('explosion', ac.pos, { size: 1.6, dur: 1.2 });
  fx('falling', ac.pos, { dur: 2.5 });
  floatText(`${ac.callsign} DOWN`, ac.pos, '#ff4d4d');
  G.stats.losses[ac.type] = (G.stats.losses[ac.type] || 0) + 1;
  G.stats.lostCount++;
  if (pkg) { pkg.stats.lost.push({ callsign: ac.callsign, type: ac.type, by: src }); pkg.live.delete(ac.id); }
  log(`${ac.callsign} (${T.short}) SHOT DOWN — ${src}`, 'alert');
  Hooks.flash('red');
  if (ac.carrying) log(`Recovered pilot ${ac.carrying.callsign} lost with the aircraft`, 'alert');
  if (!T.unmanned) {
    if (Math.random() < (hasRes('u_csar') ? 0.9 : 0.7)) {
      const p = { id: nid(), callsign: ac.callsign, pos: cp(ac.pos), born: G.time, expires: G.time + (hasRes('u_csar') ? 210 : 150), gone: false };
      G.pilots.push(p);
      log(`${ac.callsign} ejected — rescue beacon active. CSAR window ${fmtTime(p.expires - G.time)}`, 'warn');
    } else log(`No chute observed from ${ac.callsign}.`, 'alert');
  }
  if (pkg) checkPkg(pkg);
}

function checkPkg(pkg) {
  if (pkg.live.size || pkg.done) return;
  pkg.done = true;
  pkg.endedAt = G.time;
  const s = pkg.stats, launched = pkg.acIds.length, lost = s.lost.length;
  let score = s.killValue * 2 - lost * 12 + (s.objective ? 15 : 0) + s.revealed * 1.5;
  const grade = lost === 0 && (s.killValue >= 20 || s.objective || s.revealed >= 6) ? 'S' : score >= 25 ? 'A' : score >= 10 ? 'B' : score >= 0 ? 'C' : 'D';
  const z = pkg.zoneId ? zoneById(pkg.zoneId) : null;
  const d = {
    id: pkg.id, name: pkg.name, mission: pkg.mission, zone: z ? z.name : pkg.targetName, time: G.time, duration: G.time - pkg.launchedAt,
    launched, returned: launched - lost, lost: s.lost.slice(), fired: s.fired, hits: s.hits, acc: s.fired ? s.hits / s.fired : 0,
    kills: { ...s.kills }, killValue: s.killValue, earnedF: s.earnedF, earnedRP: s.earnedRP, cost: pkg.cost, grade,
    objective: s.objective, revealed: s.revealed, roster: pkg.roster,
  };
  G.debriefs.unshift(d);
  Hooks.debrief(d);
}

// ---------------------------------------------------------------------------
// Enemy air: interceptors + cruise missiles
// ---------------------------------------------------------------------------
function updateEnemyAir(e, dt) {
  if (e.delay > 0) { e.delay -= dt; return; }
  e.life += dt;
  e.trailT += dt;
  if (e.trailT > 0.2) { e.trailT = 0; e.trail.push(cp(e.pos)); if (e.trail.length > 12) e.trail.shift(); }

  if (e.kind === 'cruise' || e.kind === 'drone' || e.kind === 'ashm') {
    const base = baseById(e.target);
    if (!base) { e.removed = true; return; } // target carrier already sunk
    const d = dist(e.pos, base.pos), step = e.speed * dt;
    e.heading = bearing(e.pos, base.pos);
    if (hasRes('u_patriot') && !base.carrier && !e.patriotRolled && d < 80) {
      e.patriotRolled = true;
      if (Math.random() < (e.kind === 'drone' ? 0.85 : 0.75)) {
        e.inbound++;
        G.proj.push({ id: nid(), side: 'blue', kind: 'missile', wid: 'patriot', pos: cp(base.pos), tgt: e, tgtType: 'eair', homing: true, speed: 40, willHit: true, dmg: 50, pkgId: null, trail: [], age: 0, maxAge: 6 });
      }
    }
    if (d <= step + 1) { strikeImpact(e, base); e.removed = true; return; }
    e.pos = dest(e.pos, e.heading, step);
    return;
  }

  // fighter
  e.cool -= dt;
  e.acqT -= dt;
  if (e.state === 'intercept') {
    if (e.acqT <= 0 || !e.tgt || e.tgt.status !== 'airborne') { e.acqT = 2; e.tgt = acquire(e); }
    if (!e.tgt || e.missiles <= 0 || e.life > 100) e.state = 'rtb';
  }
  let goal;
  if (e.state === 'intercept') {
    const a = e.tgt, d = dist(e.pos, a.pos), st = stealthOf(AIRCRAFT[a.type]);
    goal = a.pos;
    if (d <= 38 * (1 - st * 0.5) && e.cool <= 0 && a.inbound < 2) {
      e.missiles--; e.cool = rand(4, 6);
      let acc = 0.5 * G.D.acc * G.accMul * (1 - st * 0.45) * (ecmCover(a) ? 0.6 : 1);
      let cm = false;
      if (a.flares > 0) { a.flares--; acc *= hasRes('u_cm') ? 0.42 : 0.55; cm = true; }
      a.inbound++;
      G.proj.push({ id: nid(), side: 'red', kind: 'missile', pos: cp(e.pos), tgt: a, tgtType: 'ac', homing: true, speed: 32, willHit: Math.random() < acc, dmg: 85,
        src: `${e.name} air-to-air missile`, cm, age: 0, maxAge: 10, trail: [], countsInbound: true });
      radio(a, pick([`Bandit launch! ${e.name} on my six!`, 'Missile inbound from bandit, defending!']), 5);
    }
  } else {
    goal = e.home;
    if (dist(e.pos, e.home) < 8) { e.removed = true; return; }
  }
  const want = bearing(e.pos, goal), turn = 95 * dt;
  e.heading = (e.heading + clamp(angDiff(e.heading, want), -turn, turn) + 360) % 360;
  e.pos = dest(e.pos, e.heading, KM_COMBAT * 1.6 * dt);
}

function acquire(e) {
  let best = null, bd = 1e9;
  for (const a of G._air) {
    if (a.status !== 'airborne' || dist(a.pos, e.home) > 450) continue;
    const d = dist(e.pos, a.pos);
    if (d < bd && d <= 220 * (1 - stealthOf(AIRCRAFT[a.type]) * 0.75)) { bd = d; best = a; }
  }
  return best;
}

function strikeImpact(e, base) {
  if (base.carrier) { const c = G.carriers.find(c => c.id === base.carrier); if (c) damageCarrier(c, e.kind === 'drone' ? 45 : e.kind === 'ashm' ? 130 : 150, e.name); return; }
  const drone = e.kind === 'drone';
  fx('explosion', dest(base.pos, rand(0, 360), rand(0, 3)), { size: drone ? 1 : 1.8, dur: 1.2 });
  // Repairs cost money: this is how homefront attacks bleed your budget
  const loss = Math.round((drone ? 8 : 22) * (1 + 0.1 * (G.level - 1)) * (G.mode === 'endless' ? 1 : 0.4));
  G.funds = Math.max(0, G.funds - loss);
  G.stats.homefrontHits++; G.stats.homefrontLoss += loss;
  Hooks.float(`-$${loss}M`, true);
  const parked = G.aircraft.filter(a => a.baseId === base.id && a.status !== 'airborne');
  if (!parked.length || (drone && Math.random() < 0.6)) log(`${e.name} impact at ${base.name}. Repairs -$${loss}M.`, 'warn');
  else {
    const a = pick(parked);
    if (Math.random() < (drone ? 0.15 : 0.45)) {
      G.aircraft = G.aircraft.filter(x => x !== a);
      G.stats.losses[a.type] = (G.stats.losses[a.type] || 0) + 1; G.stats.lostCount++;
      log(`${e.name} strike on ${base.name}: ${a.callsign} (${AIRCRAFT[a.type].short}) destroyed on the ground. -$${loss}M`, 'alert');
    } else {
      a.status = 'rearm'; a.readyAt = Math.max(a.readyAt, G.time) + 40; a.hp = Math.max(1, Math.round(a.maxHp * 0.4));
      log(`${e.name} strike on ${base.name}: ${a.callsign} damaged, 40s repair. -$${loss}M`, 'warn');
    }
  }
  G.threat += drone ? 0.5 : 1.5;
  Hooks.flash('red');
}

function damageEnemyAir(e, dmg, pkg, owner) {
  if (e.removed) return;
  e.hp -= dmg * rand(0.85, 1.15);
  if (e.hp > 0) { floatText('HIT', e.pos, '#ffd84a'); return; }
  e.removed = true;
  fx('explosion', e.pos, { size: e.kind === 'cruise' ? 0.8 : 1.3 });
  const key = e.kind; // fighter | cruise | drone
  floatText(e.kind === 'fighter' ? 'DESTROYED' : 'INTERCEPTED', e.pos, '#62f0cf');
  G.stats.kills[key] = (G.stats.kills[key] || 0) + 1;
  G.stats.airKills++;
  const v = e.kind === 'fighter' ? 10 : e.kind === 'cruise' || e.kind === 'ashm' ? 2 : 1;
  G.funds += v * KILL_FUNDS; G.rp += v * KILL_RP; G.stats.killValue += v; G.stats.earned += v * KILL_FUNDS;
  if (pkg) { pkg.stats.kills[key] = (pkg.stats.kills[key] || 0) + 1; pkg.stats.killValue += v; pkg.stats.earnedF += v * KILL_FUNDS; pkg.stats.earnedRP += v * KILL_RP; }
  const ac = typeof owner === 'number' ? acById(owner) : null;
  if (ac) ac.kills++;
  const who = typeof owner === 'string' ? owner : ac ? ac.callsign : 'Patriot battery';
  log(e.kind !== 'fighter' ? `${who}: ${e.name} intercepted` : `${who === 'Patriot battery' ? 'Allied' : who}: Splash one ${e.name}!`, 'good');
}

// ---------------------------------------------------------------------------
// Projectiles & damage
// ---------------------------------------------------------------------------
function projAlive(p) {
  const t = p.tgt;
  if (!t) return false;
  if (p.tgtType === 'ac') return t.status === 'airborne';
  if (p.tgtType === 'eair') return !t.removed;
  return !t.dead;
}

function updateProjectiles(dt) {
  const list = G.proj;
  G.proj = [];
  const keep = [];
  for (const p of list) {
    if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
    p.age += dt;
    let aim = p.aim;
    if (p.homing) {
      if (projAlive(p)) { aim = p.tgt.pos; p.aim = cp(aim); }
    }
    if (!aim) continue;
    if (p.trail) {
      p.trailT = (p.trailT || 0) + dt;
      if (p.trailT > 0.05) { p.trailT = 0; p.trail.push(cp(p.pos)); if (p.trail.length > 16) p.trail.shift(); }
    }
    const d = dist(p.pos, aim), step = p.speed * dt;
    if (p.cm && !p.flared && d < 8 && p.tgt) { p.flared = true; fx('flares', p.tgt.pos, { dur: 1.4 }); }
    if (d <= step || p.age > p.maxAge) { p.pos = cp(aim); impact(p); continue; }
    p.pos = dest(p.pos, bearing(p.pos, aim), step);
    keep.push(p);
  }
  G.proj = keep.concat(G.proj);
}

function impact(p) {
  if (p.side === 'fx') {
    if (p.kind === 'shell') fx('puff', p.pos, { dur: 0.6, size: 0.6 });
    return;
  }
  if (p.side === 'red') {
    if (p.countsInbound && p.tgt) p.tgt.inbound = Math.max(0, p.tgt.inbound - 1);
    if (p.willHit && projAlive(p)) damageAircraft(p.tgt, p.dmg, p.src);
    else if (p.kind === 'missile') { fx('puff', p.pos, { dur: 0.7 }); if (p.cm) floatText('DEFEATED', p.pos, '#8fdcff'); }
    return;
  }
  // blue
  const pkg = p.pkgId ? pkgById(p.pkgId) : null;
  if (p.tgtType === 'eair') {
    if (p.tgt) p.tgt.inbound = Math.max(0, p.tgt.inbound - 1);
    if (p.willHit && projAlive(p)) { damageEnemyAir(p.tgt, p.dmg, pkg, p.owner); if (pkg) pkg.stats.hits++; G.stats.hits++; }
    else { fx('puff', p.pos); floatText('MISS', p.pos, '#9aa'); }
    return;
  }
  if (p.tgtType === 'none') return;
  if (pkg && pkg.pending !== undefined) { pkg.pending--; if (pkg.pending <= 0) { pkg.live.clear(); setTimeout(() => G && checkPkg(pkg), 0); } }
  if (p.tgt && p.tgtType === 'unit') p.tgt.incoming = Math.max(0, p.tgt.incoming - 1);
  if (p.wid === 'b61') { nukeDetonation(p.pos, pkg); return; }
  // Cruise missiles (Tomahawk, JASSM) retarget in the terminal phase if their target is already dead
  if (p.kind === 'cruise' && p.tgt && p.tgt.dead) {
    const z = zoneById(p.tgt.zoneId);
    const alt = z && z.units.filter(u => !u.dead && u.known && dist(u.pos, p.pos) < 20).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
    if (alt) { p.tgt = alt; p.willHit = Math.random() < (WEAPONS[p.wid].pk[ENEMY[alt.kind].cls] || 0.5); }
  }

  let hit = false;
  if (p.area) {
    const W = WEAPONS[p.wid];
    if (p.willHit && p.tgt && !p.tgt.dead) { killCredit(damageUnit(p.tgt, p.dmg, pkg), p); hit = true; }
    for (const z of G.zones) {
      if (!z.active || z.neutralized || dist(z.center, p.pos) > z.r + p.area + 20) continue;
      for (const u of z.units) {
        if (u.dead || u === p.tgt || dist(u.pos, p.pos) > p.area) continue;
        if (Math.random() < (W.pk[ENEMY[u.kind].cls] || 0) * 0.85) { killCredit(damageUnit(u, p.dmg * 0.8, pkg), p); hit = true; }
      }
    }
    if (p.wid === 'cbu97') for (let i = 0; i < 9; i++) fx('explosion', dest(p.pos, rand(0, 360), rand(0, p.area * 0.8)), { size: 0.5, dur: rand(0.5, 1.1) });
    else fx('explosion', p.pos, { size: p.wid === 'jassm' || p.wid === 'jdam' ? 1.5 : 0.9 });
  } else {
    if (p.willHit && p.tgt && !p.tgt.dead) { killCredit(damageUnit(p.tgt, p.dmg, pkg), p); hit = true; fx('explosion', p.pos, { size: p.kind === 'bullet' ? 0.5 : 1 }); }
    else { fx('puff', dest(p.pos, rand(0, 360), rand(0.3, 1)), { dur: 0.7 }); if (p.kind !== 'bullet' || Math.random() < 0.3) floatText('MISS', p.pos, '#9aa'); }
  }
  if (hit) { if (pkg) pkg.stats.hits++; G.stats.hits++; }
}

function killCredit(res, p) {
  if (res === 'kill' && p.owner) { const ac = acById(p.owner); if (ac) ac.kills++; }
}

function damageUnit(u, dmg, pkg) {
  if (u.dead) return null;
  u.hp -= dmg * rand(0.85, 1.15);
  u.known = true;
  if (u.hp <= 0) { killUnit(u, pkg); return 'kill'; }
  if (pkg) floatText('HIT', u.pos, '#ffd84a');
  return 'hit';
}

function killUnit(u, pkg) {
  u.dead = true; u.hp = 0;
  const E = ENEMY[u.kind], z = zoneById(u.zoneId);
  fx('explosion', u.pos, { size: E.value >= 14 ? 1.6 : 1.1, dur: 1 });
  if (pkg) {
    floatText('DESTROYED', u.pos, '#ffe066');
    const f = E.value * KILL_FUNDS, r = E.value * KILL_RP;
    G.funds += f; G.rp += r; G.stats.earned += f;
    pkg.stats.earnedF += f; pkg.stats.earnedRP += r;
    pkg.stats.kills[u.kind] = (pkg.stats.kills[u.kind] || 0) + 1;
    pkg.stats.killValue += E.value;
    G.stats.kills[u.kind] = (G.stats.kills[u.kind] || 0) + 1;
    G.stats.killValue += E.value;
    if (E.value >= 8) log(`SPLASH — ${E.name} destroyed at ${z.short} (${pkg.name})`, 'good');
    Hooks.kill(u, pkg, f);
  } else if (E.value >= 6) log(`Allied forces destroyed a ${E.short} at ${z.short}`, 'info');
  if (u.kind === 'hq') log(`${z.short} command post destroyed — enemy reinforcements and cruise-missile raids halted`, 'good');
  if (u.kind === 'airfield') log(`${z.short} airbase destroyed — no more interceptor scrambles`, 'good');
}

function nukeDetonation(pos, pkg) {
  fx('nuke', pos, { dur: 5 });
  Hooks.flash('white');
  const R = WEAPONS.b61.area;
  let n = 0;
  for (const z of G.zones) {
    if (!z.active || dist(z.center, pos) > z.r + R) continue;
    for (const u of z.units) if (!u.dead && dist(u.pos, pos) <= R) { killUnit(u, pkg); n++; }
    for (const f of z.friendlies) if (!f.dead && dist(f.pos, pos) <= R) { f.dead = true; f.hp = 0; log(`${f.name} lost in the blast`, 'alert'); }
    if (dist(z.center, pos) < z.r) z.nuked = true;
  }
  G.enemyAir.forEach(e => { if (dist(e.pos, pos) <= R) e.removed = true; });
  G._air.forEach(a => { if (a.status === 'airborne' && a.pkgId !== (pkg && pkg.id) && dist(a.pos, pos) <= 12) shootDown(a, 'nuclear blast'); });
  G.pilots.forEach(p => { if (!p.gone && dist(p.pos, pos) <= R) { p.gone = true; G.stats.captured++; } });
  if (pkg) { pkg.stats.hits++; G.stats.hits++; }
  G.threat += 25; G.sanctionsUntil = G.time + 240; G.stats.nukes++;
  log(`NUCLEAR DETONATION — ${n} enemy units vaporized. Global condemnation: funding halved for 4 minutes, threat +25`, 'alert');
}

function updatePilots() {
  for (const p of G.pilots) {
    if (p.gone || G.time < p.expires) continue;
    p.gone = true;
    G.stats.captured++; G.threat += 3; G.rp = Math.max(0, G.rp - 8);
    log(`${p.callsign} beacon lost — pilot presumed captured. Threat +3`, 'alert');
  }
  G.pilots = G.pilots.filter(p => !p.gone);
}

// ---------------------------------------------------------------------------
// Random events (replayability)
// ---------------------------------------------------------------------------
function randomEvents(dt) {
  G.eventT -= dt;
  if (G.eventT > 0) return;
  G.eventT = rand(70, 110);
  const active = G.zones.filter(z => z.active && !z.neutralized);
  if (!active.length) return;
  const z = pick(active), roll = Math.random();
  if (roll < 0.2) {
    const amt = 30 + randInt(0, 5) * 10;
    G.funds += amt; G.stats.earned += amt;
    log(`Supplemental appropriations approved: +$${amt}M`, 'good');
  } else if (roll < 0.38) {
    let n = 0;
    z.units.forEach(u => { if (!u.dead && !u.known && Math.random() < 0.5) { u.known = true; n++; } });
    log(`Allied satellite pass over ${z.short}: ${n} hostile units identified`, 'good');
  } else if (roll < 0.56) {
    const kinds = z.faction === 'NLF' || z.faction === 'BMI' ? ['technical', 'inf', 'technical'] : z.tpl === 'reef' || z.tpl === 'arctic' ? ['shorad', 'aaa'] : ['mbt', 'ifv', 'mbt'];
    kinds.forEach(k => z.units.push(makeUnit(z, k, false)));
    log(`Intel: enemy convoy of ${kinds.length} units moving into ${z.short}. Positions unconfirmed.`, 'warn');
  } else if (roll < 0.7) {
    z.units.forEach(u => { if (!u.dead && ENEMY[u.kind].aa) u.known = true; });
    log(`Defector report: all ${z.short} air-defense positions marked`, 'good');
  } else if (roll < 0.84) {
    z.weatherUntil = G.time + 60;
    log(`Storm front over ${z.short}: weapon accuracy reduced for both sides (60s)`, 'warn');
  } else {
    const c = z.units.filter(u => !u.dead && u.known && ENEMY[u.kind].cls !== 'structure');
    if (c.length) { const u = pick(c); killUnit(u, null); log(`Allied long-range fires destroyed a ${ENEMY[u.kind].name} at ${z.short}`, 'good'); }
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function finalScore() {
  const s = G.stats;
  let score = s.killValue * 10 + s.zonesSecured * 600 + s.rescued * 80 - s.lostCount * 60 - s.captured * 80 - s.nukes * 500 - s.overruns * 150;
  if (G.mode === 'endless') score += Math.round(G.time * 3) + (G.level - 1) * 800;
  else score -= Math.round(G.threat) * 10;
  if (G.over === 'victory') score += Math.max(0, Math.round(4000 - G.time * 2));
  score = Math.round(score * (G.diffKey === 'ace' ? 1.4 : G.diffKey === 'recruit' ? 0.75 : 1));
  const grade = score >= 19000 ? 'S' : score >= 14000 ? 'A' : score >= 9000 ? 'B' : score >= 4500 ? 'C' : 'D';
  return { score, grade };
}

// ---------------------------------------------------------------------------
// ENDLESS mode director: escalation, new crises, homefront attacks
// ---------------------------------------------------------------------------
function endlessTick(dt) {
  G.levelT -= dt;
  if (G.levelT <= 0) {
    G.levelT = ENDLESS.levelEvery;
    G.level++;
    G.accMul = Math.min(1.3, 1 + ENDLESS.accGrowth * (G.level - 1));
    log(`ESCALATION: threat level ${G.level}. New crises will be larger and better defended.`, 'alert');
    Hooks.flash('amber');
  }
  const live = G.zones.filter(z => !z.neutralized).length;
  G.spawnT -= dt;
  if (!live && G.spawnT > 15) G.spawnT = 15;
  if (G.spawnT <= 0) {
    G.spawnT = Math.max(50, 120 - G.level * 7) * rand(0.85, 1.2);
    // simultaneous crises: 3 at level 1-2, 4 at 3-4, 5 at 5-6, capped at 6
    if (live < Math.min(6, 2 + Math.floor((G.level + 1) / 2))) spawnEndlessZone();
  }
  for (const z of G.zones.slice()) {
    if (z.neutralized && G.time - z.securedAt > ENDLESS.archiveAfter) {
      G.zones.splice(G.zones.indexOf(z), 1);
      Hooks.zoneRemoved(z);
    }
  }
  G.homeT -= dt;
  if (G.homeT <= 0) {
    G.homeT = rand(85, 145) / (1 + 0.08 * (G.level - 1));
    homefrontAttack();
  }
}

function spawnEndlessZone() {
  const used = new Set(G.zones.map(z => z.defId));
  const pool = ZONES.filter(d => !used.has(d.id));
  if (!pool.length) return null;
  const z = buildZone(pick(pool), 1 + ENDLESS.growth * (G.level - 1));
  z.activateAt = G.time + ENDLESS.warn;
  G.zones.push(z);
  log(`INTEL: unrest detected at ${z.name} (${z.region}). Hostilities expected in ${ENDLESS.warn}s.`, 'warn');
  Hooks.zone(z);
  return z;
}

// Drones or cruise missiles fly at one of your bases from outside the theater.
// Each one that gets through costs repair money and can wreck parked aircraft.
function homefrontAttack() {
  const bases = G.bases.filter(b => G.aircraft.some(a => a.baseId === b.id));
  if (!bases.length) return;
  const base = pick(bases);
  const drone = Math.random() < 0.55;
  const airFactions = [...new Set(G.zones.filter(z => z.active && !z.neutralized).map(z => z.faction))].filter(f => FACTIONS[f].air);
  const F = airFactions.length ? FACTIONS[pick(airFactions)] : null;
  const name = drone ? 'Attack drone' : F ? F.cruise : 'Cruise missile';
  const start = dest(base.pos, rand(0, 360), drone ? rand(450, 700) : rand(900, 1300));
  const scale = 1 + 0.1 * (G.level - 1);
  const n = Math.round((drone ? rand(4, 6) : rand(2, 3)) * scale);
  const speed = drone ? 8 : 28;
  for (let i = 0; i < n; i++) {
    G.enemyAir.push({ id: nid(), kind: drone ? 'drone' : 'cruise', name, zoneId: null, pos: dest(start, rand(0, 360), rand(0, 12)), target: base.id,
      heading: bearing(start, base.pos), hp: 1, maxHp: 1, speed, life: 0, inbound: 0, delay: i * (drone ? 0.9 : 1.4), trail: [], trailT: 0, homefront: true });
  }
  const eta = Math.round(dist(start, base.pos) / speed);
  log(`HOMEFRONT ALERT: ${n}× ${drone ? 'attack drones' : name + ' cruise missiles'} inbound to ${base.name}. ETA ${eta}s. Launch a DEFEND patrol!`, 'alert');
  Hooks.flash('amber');
  Hooks.homefront(base, eta);
}

// DEFEND: orbit a home base and run down anything flying at it
function defendLogic(ac, pkg, dt) {
  const base = baseById(pkg.baseId);
  if (!hasAA(ac)) { rtb(ac, 'Winchester, RTB'); return {}; }
  let best = null, bd = 350;
  for (const e of G.enemyAir) {
    if (e.removed || e.delay > 0) continue;
    const d = dist(e.pos, base.pos);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { ac.timer = 0; return { goal: best.pos }; }
  ac.timer += dt;
  if (ac.timer > 75) { rtb(ac, 'Patrol complete, RTB'); return {}; }
  return { goal: dest(base.pos, (G.time * 16 * ac.orbitDir + ac.id * 97) % 360, 30) };
}

// ---------------------------------------------------------------------------
// Save / resume (localStorage; in-flight munitions are not saved)
// ---------------------------------------------------------------------------
const SAVE_KEY = 'skyward_save_v1';

function saveGame() {
  if (!G || G.over) return false;
  const g = {};
  for (const [k, v] of Object.entries(G)) {
    if (k === 'proj' || k === 'fx' || k === '_air' || k === 'D' || k === 'bases') continue;
    g[k] = v instanceof Set ? [...v] : v;
  }
  g.aircraft = G.aircraft.map(a => ({ ...a, tgt: null, inbound: 0 }));
  g.enemyAir = G.enemyAir.filter(e => !e.removed).map(e => ({ ...e, tgt: null, inbound: 0 }));
  g.zones = G.zones.map(z => ({ ...z, units: z.units.map(u => ({ ...u, incoming: 0 })) }));
  g.pkgs = G.pkgs.filter(p => !p.done).map(p => ({ ...p, live: [...p.live] }));
  g.log = G.log.slice(-80);
  g.debriefs = G.debriefs.slice(0, 40);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, UID, savedAt: Date.now(), g }));
    return true;
  } catch (e) { return false; }
}

function readSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    return d && d.v === 1 && d.g ? d : null;
  } catch (e) { return null; }
}

function loadGame() {
  const d = readSave();
  if (!d) return false;
  const g = d.g;
  G = {
    ...g, D: DIFFS[g.diffKey], paused: false, over: null, proj: [], fx: [], _air: [],
    unlocked: new Set(g.unlocked), weaponsUnlocked: new Set(g.weaponsUnlocked), research: new Set(g.research),
    bases: BASES.map(b => ({ ...b, pos: { lat: b.lat, lng: b.lng } })),
  };
  G.pkgs.forEach(p => { p.live = new Set(p.live); });
  G.carriers = G.carriers || [];
  G.carriers.forEach(c => G.bases.push(carrierBase(c)));
  G.zones.forEach(z => {
    if (z.activateAt === null) z.activateAt = Infinity;
    if (z.water === undefined) { z.water = Terrain.waterFraction(z.defId || z.id); z.reef = z.water > 0.97; } // saves from older versions
  });
  UID = d.UID;
  log('Command restored from save.', 'good');
  return true;
}

function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// ---------------------------------------------------------------------------
// NAVY: enemy ship patrols + anti-ship missiles, player carrier strike groups
// ---------------------------------------------------------------------------
function navalOps(z, alive, dt) {
  for (const u of alive) {
    const E = ENEMY[u.kind];
    if (!E.naval) continue;
    // patrol: drift between random waypoints over water
    if (!u.wp || dist(u.pos, u.wp) < 1.5) u.wp = seaPoint(z);
    const step = (u.kind === 'fac' ? 0.9 : 0.45) * dt;
    const np = dest(u.pos, bearing(u.pos, u.wp), step);
    if (Terrain.isWater(np, z.defId) || z.water > 0.97) u.pos = np; else u.wp = null;
    // anti-ship missiles at any carrier group in range
    u.ashmT -= dt;
    if (u.ashmT > 0 || !G.carriers.length) continue;
    const c = G.carriers.find(c => dist(c.pos, u.pos) <= E.ashm.range);
    if (!c) { u.ashmT = 3; continue; }
    u.ashmT = E.ashm.reload * rand(0.85, 1.15);
    u.known = true;
    for (let i = 0; i < E.ashm.salvo; i++) {
      G.enemyAir.push({ id: nid(), kind: 'ashm', name: 'Anti-ship missile', zoneId: z.id, pos: cp(u.pos), target: c.baseId, heading: bearing(u.pos, c.pos),
        hp: 1, maxHp: 1, speed: 24, life: 0, inbound: 0, delay: i * 1.2, trail: [], trailT: 0 });
    }
    log(`⚠ ${E.short} at ${z.short} launched anti-ship missiles at ${c.name}!`, 'alert');
  }
}

function carrierBase(c) {
  return { id: c.baseId, name: c.name.split(' ').slice(0, 1).concat(c.name.split(' ').slice(-1)).join(' '), pos: c.pos, allows: ['naval'], carrier: c.id };
}

function buyCarrier(seaId) {
  if (!hasRes('csg')) return 'Research Carrier Strike Group first';
  if (G.funds < CARRIER.cost) return 'Insufficient funds';
  const sea = CARRIER_SEAS.find(s => s.id === seaId);
  if (!sea) return 'Unknown sea area';
  G.funds -= CARRIER.cost; G.stats.spent += CARRIER.cost;
  const n = G.carrierSerial++;
  const c = { id: nid(), baseId: `cvn-${n}`, name: CARRIER_NAMES[n % CARRIER_NAMES.length], pos: { lat: sea.lat, lng: sea.lng }, heading: 0, route: [], hp: CARRIER.hp, maxHp: CARRIER.hp,
    tlam: CARRIER.tlam, aegisCool: 0, repairT: 0, reloadT: 30 };
  G.carriers.push(c);
  G.bases.push(carrierBase(c));
  log(`${c.name} carrier strike group commissioned in the ${sea.name}. Air wing capacity ${CARRIER.capacity}.`, 'good');
  return c;
}

function sailCarrier(c, to) {
  const r = Terrain.route(c.pos, to);
  if (!r || !r.length) return 'No sea route to that position';
  c.route = r;
  const km = r.reduce((s, p, i) => s + dist(i ? r[i - 1] : c.pos, p), 0);
  log(`${c.name}: course set, ${Math.round(km)} km, ETA ${fmtTime(km / CARRIER.speed)}`, 'radio');
  return true;
}

function updateCarriers(dt) {
  for (const c of G.carriers.slice()) {
    // steam along the route
    if (c.route.length) {
      const wp = c.route[0], d = dist(c.pos, wp), step = CARRIER.speed * dt;
      c.heading = bearing(c.pos, wp);
      if (d <= step) { c.pos = cp(wp); c.route.shift(); if (!c.route.length) log(`${c.name}: on station.`, 'radio'); }
      else c.pos = dest(c.pos, c.heading, step);
      const b = baseById(c.baseId);
      if (b) b.pos = c.pos;
      for (const a of G.aircraft) if (a.baseId === c.baseId && a.status !== 'airborne') a.pos = cp(c.pos);
    }
    // Aegis: SM-2/SM-6 interceptors vs anything flying at the group
    c.aegisCool -= dt;
    if (c.aegisCool <= 0) {
      let best = null, bd = CARRIER.aegisRange;
      for (const e of G.enemyAir) {
        if (e.removed || e.delay > 0 || e.inbound >= 1) continue;
        const d = dist(c.pos, e.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        c.aegisCool = CARRIER.aegisReload;
        best.inbound++;
        G.proj.push({ id: nid(), side: 'blue', kind: 'missile', wid: 'sm6', pos: cp(c.pos), tgt: best, tgtType: 'eair', homing: true, speed: 42,
          willHit: Math.random() < CARRIER.aegisPk * (best.kind === 'fighter' ? 0.7 : 1), dmg: 120, pkgId: null, owner: `${c.name.split(' ')[0]} Aegis`, trail: [], age: 0, maxAge: 8 });
      } else c.aegisCool = 0.4;
    }
    // slow repairs and Tomahawk replenishment
    c.repairT -= dt;
    if (c.repairT <= 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + dt * 2);
    c.reloadT -= dt;
    if (c.reloadT <= 0) { c.reloadT = 30; if (c.tlam < CARRIER.tlam) c.tlam++; }
  }
}

function damageCarrier(c, dmg, src) {
  c.hp -= dmg * rand(0.85, 1.15);
  c.repairT = 25;
  fx('explosion', dest(c.pos, rand(0, 360), rand(0, 2)), { size: 1.6, dur: 1.2 });
  Hooks.flash('red');
  if (c.hp > 0) { log(`${c.name} HIT by ${src}! Hull integrity ${Math.round((c.hp / c.maxHp) * 100)}%`, 'alert'); return; }
  // sunk: the air wing aboard goes down with her, airborne jets divert to land
  G.carriers = G.carriers.filter(x => x !== c);
  G.bases = G.bases.filter(b => b.id !== c.baseId);
  const lost = G.aircraft.filter(a => a.baseId === c.baseId && a.status !== 'airborne');
  lost.forEach(a => { G.stats.losses[a.type] = (G.stats.losses[a.type] || 0) + 1; G.stats.lostCount++; });
  G.aircraft = G.aircraft.filter(a => !lost.includes(a));
  for (const a of G.aircraft.filter(a => a.baseId === c.baseId)) {
    const T = AIRCRAFT[a.type];
    const alt = G.bases.filter(b => !b.carrier && b.allows.includes(T.cls)).sort((x, y) => dist(x.pos, a.pos) - dist(y.pos, a.pos))[0];
    if (alt) { a.baseId = alt.id; radio(a, `Mother is gone. Diverting to ${alt.name}.`, 0); }
  }
  fx('explosion', c.pos, { size: 2.5, dur: 2 });
  G.threat += 10;
  log(`${c.name} SUNK by ${src}. ${lost.length} aircraft lost aboard. Threat +10`, 'alert');
}

// Tomahawk salvo at the highest-value known targets in a zone
function fireTomahawks(c, z, n) {
  if (!z || !z.active || z.neutralized) return 'No valid target zone';
  if (dist(c.pos, z.center) > CARRIER.tlamRange) return 'Zone is beyond Tomahawk range (1,600 km)';
  n = Math.min(n, c.tlam);
  if (n <= 0) return 'Magazine empty: Tomahawks reload over time';
  const cost = n * CARRIER.tlamCost;
  if (G.funds < cost) return 'Insufficient funds';
  const targets = z.units.filter(u => !u.dead && u.known)
    .sort((a, b) => (PRIORITY.strike[b.kind] || 2) - (PRIORITY.strike[a.kind] || 2) || ENEMY[b.kind].value - ENEMY[a.kind].value);
  if (!targets.length) return 'No confirmed targets: send recon first';
  c.tlam -= n; G.funds -= cost; G.stats.spent += cost;
  const cyc = Math.floor(G.pkgCounter / 26);
  const name = PHONETIC[G.pkgCounter % 26] + (cyc ? ` ${cyc + 1}` : '');
  G.pkgCounter++;
  const pkg = { id: nid(), name, mission: 'tlam', zoneId: z.id, acIds: [], live: new Set([-1]), pending: n, launchedAt: G.time, done: false, cost, targetName: z.name,
    roster: [{ callsign: c.name, type: 'tlam' }], stats: { fired: n, hits: 0, kills: {}, killValue: 0, lost: [], earnedF: 0, earnedRP: 0, rescued: 0, objective: null, revealed: 0 } };
  G.pkgs.push(pkg);
  G.stats.fired += n; G.stats.sorties += 0;
  const W = WEAPONS.tlam;
  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    t.incoming++;
    G.proj.push({ id: nid(), side: 'blue', kind: 'cruise', wid: 'tlam', pos: dest(c.pos, rand(0, 360), 3), tgt: t, tgtType: 'unit', aim: cp(t.pos), homing: !!ENEMY[t.kind].naval,
      speed: W.speed, willHit: Math.random() < (W.pk[ENEMY[t.kind].cls] || 0.5), dmg: W.dmg, area: W.area, pkgId: pkg.id, owner: null, trail: [], age: 0, maxAge: dist(c.pos, t.pos) / W.speed * 1.4 + 5, delay: i * 0.5 });
  }
  log(`${c.name}: ${n}× Tomahawk away toward ${z.name}. Package ${name}.`, 'good');
  return pkg;
}

// Campaign escalation: every zone you've already secured makes the next crisis bigger and its
// air defenses sharper, so the back half of the campaign tests players who cleared the front half.
function escalateZone(z) {
  const n = G.stats.zonesSecured;
  G.accMul = 1 + 0.04 * n;
  if (!n) return;
  const pool = z.units.filter(u => u.kind !== 'hq' && u.kind !== 'airfield').map(u => u.kind);
  const extra = Math.round(z.units.length * 0.14 * n);
  const tough = ['sam_lr', 'shorad', 'mbt', 'arty', 'aaa'].filter(k => z.initCounts[k]);
  for (let i = 0; i < extra && pool.length; i++) {
    const kind = tough.length && Math.random() < 0.5 ? pick(tough) : pick(pool);
    z.units.push(makeUnit(z, kind, Math.random() < ENEMY[kind].known * 0.8));
  }
  z.initValue = z.units.reduce((s, u) => s + ENEMY[u.kind].value, 0);
}

// $M per 15-second budget cycle
const UPKEEP = { fighter: 0.45, bomber: 1.1, heli: 0.25, drone: 0.2, carrier: 4 };
function upkeep() {
  return G.aircraft.reduce((s, a) => s + UPKEEP[AIRCRAFT[a.type].cls], 0) + G.carriers.length * UPKEEP.carrier;
}

