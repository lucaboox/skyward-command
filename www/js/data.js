// ============================================================================
// SKYWARD COMMAND — static game data
// ============================================================================

// Movement scale (km per game-second at speed factor 1.0)
const KM_TRANSIT = 45;   // fast "sped up" cruise between theaters
const KM_COMBAT = 9;     // slowed down inside combat areas so engagements are readable

// Rewards per point of enemy unit value
const KILL_FUNDS = 1.25; // $M
const KILL_RP = 0.55;

const DIFFS = {
  recruit: { name: 'RECRUIT', count: 0.75, acc: 0.8, threat: 0.75, funds: 600, rp: 30, income: 1.25, desc: 'Thinner defenses, generous budget.' },
  veteran: { name: 'VETERAN', count: 1.1, acc: 1.1, threat: 1.15, funds: 420, rp: 20, income: 0.9, desc: 'The intended experience.' },
  ace:     { name: 'ACE',     count: 1.35, acc: 1.22, threat: 1.3, funds: 340, rp: 10, income: 0.7, desc: 'Dense SAM belts, fast escalation.' },
};

// ---------------------------------------------------------------------------
// Player aircraft
// cls: fighter | bomber | heli | drone  (bases restrict which classes they host)
// alt: low | med | high  (low dodges long-range radar but eats guns/MANPADS)
// ---------------------------------------------------------------------------
const AIRCRAFT = {
  f16: { name: 'F-16C Viper', short: 'F-16C', role: 'Multirole Fighter', cls: 'fighter', icon: 'jet', cost: 30, hp: 100, speed: 1.0, stealth: 0.08, cap: 6, range: 3800, sensor: 30, flares: 4, alt: 'high', turnaround: 14,
    weapons: ['aim120', 'aim9', 'harm', 'harpoon', 'mav', 'gbu12', 'jdam', 'cbu97'], callsign: 'VIPER',
    desc: 'Cheap, flexible workhorse. Carries HARMs for suppressing SAM sites.' },
  a10: { name: 'A-10C Thunderbolt II', short: 'A-10C', role: 'Close Air Support', cls: 'fighter', icon: 'hog', cost: 24, hp: 200, speed: 0.6, stealth: 0, cap: 8, range: 2600, sensor: 22, flares: 8, alt: 'low', turnaround: 16,
    gun: { name: 'GAU-8 Avenger', ammo: 10, dmg: 75, range: 3.5, pk: { armor: 0.6, soft: 0.85, radar: 0.6, structure: 0.25, naval: 0.35 } },
    weapons: ['aim9', 'mav', 'gbu12', 'cbu97', 'hydra'], callsign: 'HOG',
    desc: 'Flying tank. Flies low under long-range radar but is exposed to guns and MANPADS.' },
  ah64: { name: 'AH-64E Apache', short: 'AH-64E', role: 'Attack Helicopter', cls: 'heli', icon: 'heli', cost: 16, hp: 120, speed: 0.3, stealth: 0.05, cap: 4, range: 1400, sensor: 16, flares: 4, alt: 'low', turnaround: 10,
    gun: { name: 'M230 Chain Gun', ammo: 10, dmg: 40, range: 3, pk: { armor: 0.3, soft: 0.85, radar: 0.5, structure: 0.2, naval: 0.3 } },
    weapons: ['hellfire', 'hydra', 'aim9'], callsign: 'SABER',
    desc: 'Tank killer. Short legs, needs a forward base near the fight.' },
  uh60: { name: 'UH-60M Black Hawk', short: 'UH-60M', role: 'Utility / CSAR', cls: 'heli', icon: 'heli', cost: 10, hp: 90, speed: 0.34, stealth: 0, cap: 0, range: 1500, sensor: 12, flares: 4, alt: 'low', turnaround: 8, utility: true, naval: true,
    weapons: [], callsign: 'DUSTOFF',
    desc: 'Rescues downed pilots and reinforces allied ground positions.' },
  mq9: { name: 'MQ-9 Reaper', short: 'MQ-9', role: 'Recon / Strike Drone', cls: 'drone', icon: 'drone', cost: 12, hp: 55, speed: 0.4, stealth: 0.35, cap: 2, range: 7000, sensor: 55, flares: 0, alt: 'med', turnaround: 8, unmanned: true,
    weapons: ['hellfire', 'gbu12'], callsign: 'HUNTER',
    desc: 'Long sensor reach. Best recon asset. Losses cost no pilots.' },
  f15e: { name: 'F-15E Strike Eagle', short: 'F-15E', role: 'Strike Fighter', cls: 'fighter', icon: 'jet', cost: 55, hp: 130, speed: 1.05, stealth: 0.05, cap: 9, range: 4600, sensor: 40, flares: 6, alt: 'high', turnaround: 16,
    weapons: ['aim120', 'aim9', 'harm', 'harpoon', 'mav', 'gbu12', 'jdam', 'cbu97', 'jassm'], callsign: 'RAGE',
    desc: 'Heavy hauler with long range. Can carry JASSM stand-off missiles.' },
  fa18: { name: 'F/A-18E Super Hornet', short: 'F/A-18E', role: 'Carrier Multirole', cls: 'fighter', icon: 'jet', cost: 48, hp: 115, speed: 0.95, stealth: 0.08, cap: 7, range: 3300, sensor: 40, flares: 6, alt: 'high', turnaround: 12, naval: true,
    weapons: ['aim120', 'aim9', 'harm', 'harpoon', 'mav', 'gbu12', 'jdam', 'jassm'], callsign: 'JOLLY',
    desc: 'The carrier air wing workhorse. Flies from carrier strike groups anywhere at sea.' },
  ea18g: { name: 'EA-18G Growler', short: 'EA-18G', role: 'Electronic Warfare', cls: 'fighter', icon: 'jet', cost: 62, hp: 110, speed: 1.0, stealth: 0.1, cap: 5, range: 3400, sensor: 75, flares: 6, alt: 'high', turnaround: 15, ecm: 55, naval: true,
    weapons: ['harm', 'aim120'], callsign: 'ZAPPER',
    desc: 'Jams radar SAMs: −40% enemy radar accuracy against friendlies within 55 km.' },
  f35: { name: 'F-35A Lightning II', short: 'F-35A', role: 'Stealth Multirole', cls: 'fighter', icon: 'jet', cost: 85, hp: 110, speed: 1.0, stealth: 0.72, cap: 4, range: 3400, sensor: 65, flares: 4, alt: 'high', turnaround: 16,
    naval: true,
    weapons: ['aim120', 'aim9', 'harm', 'gbu12', 'jdam', 'jassm'], callsign: 'PANTHER',
    desc: 'Low-observable. Radar SAMs must get much closer to engage. The C variant flies from carriers.' },
  f22: { name: 'F-22A Raptor', short: 'F-22A', role: 'Stealth Air Dominance', cls: 'fighter', icon: 'jet', cost: 125, hp: 120, speed: 1.3, stealth: 0.86, cap: 4, range: 3600, sensor: 80, flares: 6, alt: 'high', turnaround: 16,
    weapons: ['aim120', 'aim9', 'jdam'], callsign: 'RAPTOR',
    desc: 'Owns the sky. Escort packages or fly CAP to wipe out interceptors and cruise missiles.' },
  b52: { name: 'B-52H Stratofortress', short: 'B-52H', role: 'Heavy Bomber', cls: 'bomber', icon: 'bomber', cost: 95, hp: 230, speed: 0.62, stealth: 0, cap: 22, range: 15000, sensor: 25, flares: 12, alt: 'high', turnaround: 30,
    weapons: ['jdam', 'gbu12', 'cbu97', 'harpoon', 'jassm'], callsign: 'BUFF',
    desc: 'Enormous payload. Pair with JASSM to strike from outside SAM range.' },
  b1b: { name: 'B-1B Lancer', short: 'B-1B', role: 'Supersonic Bomber', cls: 'bomber', icon: 'bomber', cost: 115, hp: 190, speed: 0.95, stealth: 0.25, cap: 18, range: 12000, sensor: 30, flares: 10, alt: 'high', turnaround: 28,
    weapons: ['jdam', 'gbu12', 'cbu97', 'harpoon', 'jassm'], callsign: 'BONE',
    desc: 'Fast and heavy. Gets in and out before the defenses react.' },
  b2: { name: 'B-2A Spirit', short: 'B-2A', role: 'Stealth Bomber', cls: 'bomber', icon: 'wing', cost: 210, hp: 170, speed: 0.78, stealth: 0.93, cap: 14, range: 14000, sensor: 40, flares: 8, alt: 'high', turnaround: 35,
    weapons: ['jdam', 'gbu12', 'cbu97', 'jassm', 'b61'], callsign: 'SPIRIT',
    desc: 'Nearly invisible to radar. The only nuclear-capable platform.' },
};

// ---------------------------------------------------------------------------
// Weapons. pk = probability of a hit vs target class; dmg applied on hit.
// classes: air | radar | armor | soft | structure
// ---------------------------------------------------------------------------
const WEAPONS = {
  aim120:   { name: 'AIM-120D AMRAAM',    short: 'AMRAAM',   role: 'Anti-air missile',  kind: 'missile', w: 1,   cost: 1.1,  range: 60,  speed: 40, dmg: 110, pk: { air: 0.72 }, call: 'Fox Three' },
  aim9:     { name: 'AIM-9X Sidewinder',  short: 'AIM-9X',   role: 'Anti-air missile',  kind: 'missile', w: 0.5, cost: 0.45, range: 14,  speed: 34, dmg: 105, pk: { air: 0.82 }, call: 'Fox Two' },
  harm:     { name: 'AGM-88E AARGM',      short: 'HARM',     role: 'Anti-radiation',    kind: 'missile', w: 1,   cost: 0.9,  range: 85,  speed: 32, dmg: 125, pk: { radar: 0.85, naval: 0.45, armor: 0.12, structure: 0.12 }, call: 'Magnum' },
  mav:      { name: 'AGM-65 Maverick',    short: 'MAVERICK', role: 'Guided missile',    kind: 'missile', w: 1,   cost: 0.25, range: 18,  speed: 20, dmg: 130, pk: { armor: 0.82, soft: 0.65, radar: 0.7, structure: 0.45, naval: 0.55 }, call: 'Rifle' },
  hellfire: { name: 'AGM-114 Hellfire',   short: 'HELLFIRE', role: 'Anti-tank missile', kind: 'missile', w: 0.5, cost: 0.12, range: 8,   speed: 16, dmg: 135, pk: { armor: 0.86, soft: 0.6, radar: 0.65, structure: 0.3, naval: 0.6 }, call: 'Rifle' },
  hydra:    { name: 'Hydra-70 Rocket Pod', short: 'HYDRA',   role: 'Area rockets',      kind: 'rocket',  w: 0.5, cost: 0.06, range: 6,   speed: 18, dmg: 70,  area: 1.5, pk: { soft: 0.65, armor: 0.2, radar: 0.4, structure: 0.1, naval: 0.25 }, call: 'Rockets' },
  gbu12:    { name: 'GBU-12 Paveway II',  short: 'GBU-12',   role: 'Laser-guided bomb', kind: 'bomb',    w: 1,   cost: 0.03, range: 10,  speed: 7,  dmg: 140, pk: { armor: 0.75, soft: 0.6, radar: 0.75, structure: 0.7, naval: 0.4 }, call: 'Pickle' },
  jdam:     { name: 'GBU-31 JDAM',        short: 'JDAM',     role: 'GPS-guided bomb',   kind: 'bomb',    w: 2,   cost: 0.05, range: 15,  speed: 7,  dmg: 220, area: 1.0, pk: { structure: 0.95, armor: 0.7, radar: 0.85, soft: 0.7, naval: 0.4 }, call: 'Pickle' },
  cbu97:    { name: 'CBU-97 Cluster Bomb', short: 'CBU-97',  role: 'Cluster munition',  kind: 'bomb',    w: 2,   cost: 0.4,  range: 6,   speed: 7,  dmg: 150, area: 5,   pk: { armor: 0.6, soft: 0.8, radar: 0.6, structure: 0.15, naval: 0.15 }, call: 'Bombs away' },
  jassm:    { name: 'AGM-158 JASSM-ER',   short: 'JASSM',    role: 'Stand-off cruise',  kind: 'cruise',  w: 3,   cost: 1.6,  range: 260, speed: 18, dmg: 260, area: 0.6, pk: { structure: 0.95, radar: 0.85, armor: 0.7, soft: 0.6, naval: 0.55 }, call: 'Bruiser' },
  harpoon:  { name: 'AGM-84 Harpoon',     short: 'HARPOON',  role: 'Anti-ship missile', kind: 'missile', w: 1,   cost: 1.2,  range: 120, speed: 24, dmg: 240, pk: { naval: 0.88, armor: 0.3, structure: 0.3 }, call: 'Bruiser' },
  tlam:     { name: 'BGM-109 Tomahawk',   short: 'TLAM',     role: 'Ship-launched cruise missile', kind: 'cruise', w: 99, cost: 2, range: 1600, speed: 22, dmg: 260, area: 0.6, pk: { structure: 0.95, radar: 0.85, armor: 0.65, soft: 0.6, naval: 0.45 }, call: 'Tomahawk away' },
  b61:      { name: 'B61-12 Nuclear Bomb', short: 'B61',     role: 'Thermonuclear',     kind: 'nuke',    w: 6,   cost: 120,  range: 8,   speed: 7,  dmg: 99999, area: 45, pk: { structure: 1, radar: 1, armor: 1, soft: 1, naval: 1, air: 1 }, call: 'Bright Light' },
};

const START_WEAPONS = ['aim120', 'aim9', 'harm', 'harpoon', 'mav', 'gbu12', 'jdam', 'hellfire', 'hydra'];
const START_AIRCRAFT = ['f16', 'a10', 'ah64', 'uh60', 'mq9'];

// ---------------------------------------------------------------------------
// Enemy ground units
// aa.type: gun (tracers, low alt) | ir (MANPADS, ignores stealth) | radar (stealth/ECM matter)
// ---------------------------------------------------------------------------
const ENEMY = {
  inf:       { name: 'Infantry Company',     short: 'INF',     cls: 'soft',      hp: 45,  atk: 4,  value: 2,  known: 0.25 },
  technical: { name: 'Armed Technicals',     short: 'TECH',    cls: 'soft',      hp: 40,  atk: 5,  value: 2,  known: 0.3,
    aa: { type: 'gun', range: 3.5, reload: 4, acc: 0.07, dmg: 7, burst: 4, speed: 12 } },
  ifv:       { name: 'IFV Platoon',          short: 'IFV',     cls: 'armor',     hp: 85,  atk: 6,  value: 4,  known: 0.35 },
  mbt:       { name: 'Tank Platoon',         short: 'MBT',     cls: 'armor',     hp: 125, atk: 10, value: 6,  known: 0.45 },
  arty:      { name: 'Artillery Battery',    short: 'ARTY',    cls: 'soft',      hp: 60,  atk: 14, value: 6,  known: 0.4 },
  aaa:       { name: 'AAA Gun Battery',      short: 'AAA',     cls: 'armor',     hp: 70,  atk: 1,  value: 4,  known: 0.2,
    aa: { type: 'gun', range: 6, reload: 3.2, acc: 0.09, dmg: 9, burst: 6, speed: 14 } },
  manpad:    { name: 'MANPADS Team',         short: 'MANPADS', cls: 'soft',      hp: 30,  value: 3,  known: 0.05,
    aa: { type: 'ir', range: 7, reload: 6, acc: 0.42, dmg: 65, speed: 22 } },
  shorad:    { name: 'SHORAD Vehicle',       short: 'SHORAD',  cls: 'radar',     hp: 90,  value: 8,  known: 0.3,
    aa: { type: 'radar', range: 20, reload: 5, acc: 0.52, dmg: 75, speed: 24 } },
  sam_lr:    { name: 'Long-Range SAM',       short: 'LR-SAM',  cls: 'radar',     hp: 115, value: 14, known: 0.55,
    aa: { type: 'radar', range: 65, reload: 8, acc: 0.6, dmg: 95, speed: 26 } },
  radar:     { name: 'Early-Warning Radar',  short: 'RADAR',   cls: 'radar',     hp: 80,  value: 8,  known: 0.7 },
  hq:        { name: 'Command Post',         short: 'HQ',      cls: 'structure', hp: 240, value: 10, known: 0.85 },
  airfield:  { name: 'Forward Airbase',      short: 'AIRBASE', cls: 'structure', hp: 380, value: 12, known: 1 },
  // Ships patrol open water, shoot SAMs at aircraft and anti-ship missiles at carrier groups
  frigate:   { name: 'Missile Frigate',      short: 'FRIGATE', cls: 'naval',     hp: 260, value: 16, known: 0.8, naval: true,
    aa: { type: 'radar', range: 40, reload: 6, acc: 0.5, dmg: 85, speed: 26 }, ashm: { range: 130, reload: 35, salvo: 1 } },
  destroyer: { name: 'Guided-Missile Destroyer', short: 'DDG', cls: 'naval',     hp: 380, value: 24, known: 0.9, naval: true,
    aa: { type: 'radar', range: 70, reload: 5, acc: 0.55, dmg: 95, speed: 28 }, ashm: { range: 180, reload: 30, salvo: 2 } },
  fac:       { name: 'Fast Attack Craft',    short: 'FAC',     cls: 'naval',     hp: 70,  value: 5,  known: 0.35, naval: true, atk: 3,
    aa: { type: 'gun', range: 4, reload: 3, acc: 0.08, dmg: 8, burst: 5, speed: 14 }, ashm: { range: 90, reload: 45, salvo: 1 } },
};

const TEMPLATES = {
  // Kept deliberately small: every target should matter
  front:      { inf: 2, ifv: 2, mbt: 3, arty: 1, aaa: 1, manpad: 1, shorad: 1, sam_lr: 1, radar: 1, hq: 1 },
  fortress:   { inf: 1, mbt: 1, arty: 1, aaa: 1, manpad: 1, shorad: 2, sam_lr: 2, radar: 1, hq: 1, airfield: 1 },
  a2ad:       { inf: 1, ifv: 1, aaa: 1, shorad: 2, sam_lr: 1, radar: 1, hq: 1, airfield: 1 },
  arctic:     { inf: 1, ifv: 1, frigate: 1, aaa: 1, shorad: 1, sam_lr: 1, radar: 1, hq: 1, airfield: 1 },
  separatist: { inf: 4, technical: 3, ifv: 1, manpad: 2, aaa: 1, arty: 1, hq: 1 },
  insurgent:  { inf: 4, technical: 3, manpad: 2, aaa: 1, arty: 1, hq: 1 },
  reef:       { frigate: 2, aaa: 1, shorad: 1, sam_lr: 1, radar: 1, hq: 1, airfield: 1 },
  corridor:   { inf: 2, mbt: 2, ifv: 1, arty: 1, aaa: 1, shorad: 2, sam_lr: 1, radar: 1, hq: 1, airfield: 1 },
};

const FACTIONS = {
  VF:  { name: 'Volga Federation',          fighter: 'Su-35S',  cruise: 'Kalibr',  air: true },
  JD:  { name: 'Jade Dominion',             fighter: 'J-16',    cruise: 'CJ-10',   air: true },
  NLF: { name: 'Northern Liberation Front', fighter: null,      cruise: null,      air: false },
  BMI: { name: 'Black Mountain Insurgency', fighter: null,      cruise: null,      air: false },
  SRA: { name: 'Sahel Revolutionary Army',  fighter: null,      cruise: null,      air: false },
};

// ---------------------------------------------------------------------------
// Mission zones (8 flashpoints)
// ---------------------------------------------------------------------------
const ZONES = [
  { id: 'donbas', name: 'Donbas Front', short: 'DONBAS', region: 'Eastern Ukraine', faction: 'VF', lat: 48.05, lng: 37.95, r: 115, tpl: 'front', friendlies: 2,
    brief: 'Volga Federation armored brigades are pushing on allied defensive lines west of Donetsk. Two allied battalions are holding but taking sustained artillery fire. Expect a layered air-defense belt behind the front.' },
  { id: 'crimea', name: 'Crimean Bastion', short: 'CRIMEA', region: 'Crimean Peninsula', faction: 'VF', lat: 45.15, lng: 34.1, r: 105, tpl: 'fortress', friendlies: 1,
    brief: 'The peninsula is a fortress: overlapping long-range SAMs, twin early-warning radars and an active airbase. An allied marine bridgehead in the north is under pressure. Suppress the radars before committing strikers.' },
  { id: 'kalin', name: 'Kaliningrad Pocket', short: 'KALININGRAD', region: 'Baltic Coast', faction: 'VF', lat: 54.72, lng: 21.2, r: 75, tpl: 'a2ad', friendlies: 0,
    brief: 'A dense anti-access bubble threatening NATO airspace over Poland and Lithuania. Small, but packed with long-range SAMs. Stand-off weapons and stealth strongly advised.' },
  { id: 'kola', name: 'Kola Arctic Bastion', short: 'KOLA', region: 'Murmansk Oblast', faction: 'VF', lat: 68.85, lng: 33.6, r: 115, tpl: 'arctic', friendlies: 0,
    brief: 'Northern Fleet surface combatants and an arctic airbase are staging strikes toward Norway. Frigates carry their own radar SAMs. Expect interceptors.' },
  { id: 'lakes', name: 'Superior Border Incursion', short: 'SAULT', region: 'US–Canada Border', faction: 'NLF', lat: 46.45, lng: -84.4, r: 95, tpl: 'separatist', friendlies: 2,
    brief: 'Northern Liberation Front separatists have seized the Sault Ste. Marie crossing with technicals and shoulder-fired SAMs. Allied border units are pinned. Light air defense, but MANPADS are everywhere and hard to spot.' },
  { id: 'helmand', name: 'Helmand Valley', short: 'HELMAND', region: 'Southern Afghanistan', faction: 'BMI', lat: 31.7, lng: 65.0, r: 120, tpl: 'insurgent', friendlies: 2,
    brief: 'Black Mountain insurgents have massed along the Helmand river valley. Two allied outposts are surrounded. Low-tech threat: AAA and MANPADS. Ideal ground for Apaches and A-10s.' },
  { id: 'spratly', name: 'Spratly Reef Fortress', short: 'SPRATLY', region: 'South China Sea', faction: 'JD', lat: 10.1, lng: 114.4, r: 95, tpl: 'reef', friendlies: 0,
    brief: 'Jade Dominion has militarized the reefs: a runway, a long-range SAM site and a frigate screen. Interceptors will scramble against anything that comes close.' },
  { id: 'fujian', name: 'Fujian Strike Corridor', short: 'FUJIAN', region: 'Taiwan Strait', faction: 'JD', lat: 25.2, lng: 119.1, r: 110, tpl: 'corridor', friendlies: 0,
    brief: 'Jade Dominion is massing armor, artillery and a double SAM belt along the Fujian coast. This is the most heavily defended zone in the theater. Do not go in without SEAD.' },
];

// Extra flashpoints that only appear in ENDLESS mode (the campaign uses the 8 above)
ZONES.push(
  { id: 'narva', name: 'Narva Salient', short: 'NARVA', region: 'Estonia–Russia Border', faction: 'VF', lat: 59.2, lng: 28.4, r: 85, tpl: 'front', friendlies: 2, endless: true,
    brief: 'Volga Federation mechanized units have crossed the Narva river. Estonian defense battalions are holding the town line but need air support immediately.' },
  { id: 'suwalki', name: 'Suwałki Gap', short: 'SUWAŁKI', region: 'Poland–Lithuania Corridor', faction: 'VF', lat: 54.15, lng: 23.25, r: 70, tpl: 'front', friendlies: 1, endless: true,
    brief: 'An armored thrust is trying to sever the land corridor to the Baltics. Narrow, fast-moving front under a dense SAM umbrella.' },
  { id: 'caucasus', name: 'Caucasus Pass', short: 'CAUCASUS', region: 'Georgia', faction: 'VF', lat: 42.35, lng: 44.1, r: 90, tpl: 'front', friendlies: 2, endless: true,
    brief: 'Columns are pushing south through the Roki tunnel. Mountain terrain channels the enemy into kill boxes, if you can get through their air defense.' },
  { id: 'euphrates', name: 'Euphrates Valley', short: 'EUPHRATES', region: 'Eastern Syria', faction: 'BMI', lat: 35.2, lng: 40.3, r: 110, tpl: 'insurgent', friendlies: 2, endless: true,
    brief: 'Insurgent fighters are massing along the river towns. Allied outposts report technicals and MANPADS teams moving at night.' },
  { id: 'hodeidah', name: 'Red Sea Coast', short: 'HODEIDAH', region: 'Western Yemen', faction: 'BMI', lat: 14.9, lng: 43.25, r: 100, tpl: 'insurgent', friendlies: 1, endless: true,
    brief: 'Militants have seized the port approaches and are threatening shipping. A coalition detachment is pinned at the harbor.' },
  { id: 'gao', name: 'Niger Bend', short: 'GAO', region: 'Northern Mali', faction: 'SRA', lat: 16.3, lng: -0.1, r: 120, tpl: 'insurgent', friendlies: 2, endless: true,
    brief: 'Sahel Revolutionary Army columns are converging on Gao. Long distances, sparse bases. Plan your tanker support.' },
  { id: 'shabelle', name: 'Shabelle Corridor', short: 'SHABELLE', region: 'Southern Somalia', faction: 'SRA', lat: 2.3, lng: 45.0, r: 100, tpl: 'separatist', friendlies: 2, endless: true,
    brief: 'Armed groups are cutting the supply road inland from Mogadishu. Allied convoys need cover.' },
  { id: 'kaesong', name: 'Kaesong Breach', short: 'KAESONG', region: 'Korean DMZ', faction: 'JD', lat: 38.15, lng: 126.75, r: 80, tpl: 'corridor', friendlies: 2, endless: true,
    brief: 'Jade Dominion-backed forces have breached the DMZ with heavy armor and a double SAM belt. Seoul is within artillery range.' },
  { id: 'scarborough', name: 'Scarborough Shoal', short: 'SCARBOROUGH', region: 'South China Sea', faction: 'JD', lat: 15.15, lng: 117.8, r: 80, tpl: 'reef', friendlies: 0, endless: true,
    brief: 'A new artificial island has come online overnight with a runway and missile frigates on picket duty.' },
  { id: 'svalbard', name: 'Svalbard Incursion', short: 'SVALBARD', region: 'High Arctic', faction: 'VF', lat: 78.2, lng: 16.5, r: 110, tpl: 'arctic', friendlies: 1, endless: true,
    brief: 'Northern Fleet units have landed near Longyearbyen. Extreme range from friendly bases. Bring tankers.' },
);
const STARTER_ZONES = ['donbas', 'lakes', 'helmand'];

// Extra warships per zone (added on top of the template; dropped if the zone has no water)
const ZONE_NAVAL = {
  crimea: { destroyer: 1, frigate: 1, fac: 2 }, kalin: { frigate: 1, fac: 2 }, kola: { destroyer: 1 },
  lakes: { fac: 2 }, fujian: { destroyer: 1, frigate: 1, fac: 2 }, spratly: { destroyer: 1, fac: 2 },
  narva: { fac: 1 }, kaesong: { fac: 2 }, scarborough: { fac: 2 }, hodeidah: { fac: 3 }, shabelle: { fac: 2 }, svalbard: { frigate: 1 },
};

// ---------------------------------------------------------------------------
// Carrier strike groups: mobile airbases at sea with Aegis defense + Tomahawks
// ---------------------------------------------------------------------------
const CARRIER = {
  cost: 420, hp: 700, speed: 5, capacity: 10, tlam: 24, tlamRange: 1600, tlamCost: 2,
  aegisRange: 110, aegisReload: 1.6, aegisPk: 0.78,
};
const CARRIER_NAMES = ['CVN-78 Gerald R. Ford', 'CVN-79 John F. Kennedy', 'CVN-77 George H.W. Bush', 'CVN-72 Abraham Lincoln', 'CVN-73 George Washington', 'CVN-76 Ronald Reagan', 'CVN-71 Theodore Roosevelt', 'CVN-75 Harry S. Truman'];
const CARRIER_SEAS = [
  { id: 'emed', name: 'Eastern Mediterranean', lat: 34.2, lng: 28.5 },
  { id: 'north', name: 'North Sea', lat: 57.5, lng: 3.5 },
  { id: 'norw', name: 'Norwegian Sea', lat: 69.5, lng: 10.5 },
  { id: 'baltic', name: 'Baltic Sea', lat: 56.0, lng: 18.8 },
  { id: 'black', name: 'Black Sea', lat: 43.3, lng: 33.0 },
  { id: 'red', name: 'Red Sea', lat: 18.0, lng: 39.8 },
  { id: 'arab', name: 'Arabian Sea', lat: 19.5, lng: 63.5 },
  { id: 'phil', name: 'Philippine Sea', lat: 21.0, lng: 127.0 },
  { id: 'scs', name: 'South China Sea', lat: 13.0, lng: 115.5 },
  { id: 'yellow', name: 'Yellow Sea', lat: 36.0, lng: 124.0 },
];

const ENDLESS = {
  levelEvery: 240,     // seconds per escalation level
  growth: 0.12,        // +12% enemy units per level
  accGrowth: 0.03,     // +3% enemy accuracy per level (capped)
  firstSpawn: 160,     // first extra crisis after this many seconds
  warn: 40,            // seconds of "unrest" warning before a zone goes hot
  archiveAfter: 60,    // secured zones fade from the map after this long
};

// ---------------------------------------------------------------------------
// Player bases. allows: which aircraft classes can be stationed here
// ---------------------------------------------------------------------------
const BASES = [
  { id: 'fairford', name: 'RAF Fairford', lat: 51.682, lng: -1.79, allows: ['bomber', 'fighter', 'drone'] },
  { id: 'ramstein', name: 'Ramstein AB', lat: 49.437, lng: 7.6, allows: ['fighter', 'drone', 'heli'] },
  { id: 'rzeszow', name: 'Rzeszów-Jasionka', lat: 50.11, lng: 22.019, allows: ['fighter', 'drone', 'heli'] },
  { id: 'dnipro', name: 'FOB Dnipro', lat: 48.357, lng: 35.1, allows: ['heli', 'drone'] },
  { id: 'incirlik', name: 'Incirlik AB', lat: 37.002, lng: 35.426, allows: ['fighter', 'drone'] },
  { id: 'bodo', name: 'Bodø MAS', lat: 67.269, lng: 14.365, allows: ['fighter', 'drone'] },
  { id: 'kirkenes', name: 'FOB Kirkenes', lat: 69.726, lng: 29.891, allows: ['heli', 'drone'] },
  { id: 'udeid', name: 'Al Udeid AB', lat: 25.117, lng: 51.315, allows: ['fighter', 'bomber', 'drone'] },
  { id: 'bagram', name: 'Bagram AB', lat: 34.946, lng: 69.265, allows: ['fighter', 'heli', 'drone'] },
  { id: 'diego', name: 'Diego Garcia', lat: -7.313, lng: 72.411, allows: ['bomber'] },
  { id: 'kadena', name: 'Kadena AB', lat: 26.355, lng: 127.767, allows: ['fighter', 'drone', 'heli'] },
  { id: 'clark', name: 'Clark AB', lat: 15.186, lng: 120.56, allows: ['fighter', 'drone'] },
  { id: 'palawan', name: 'FOB Palawan', lat: 9.742, lng: 118.759, allows: ['heli', 'drone'] },
  { id: 'andersen', name: 'Andersen AFB', lat: 13.584, lng: 144.93, allows: ['bomber', 'fighter'] },
  { id: 'amari', name: 'Ämari AB', lat: 59.26, lng: 24.21, allows: ['fighter', 'drone', 'heli'] },
  { id: 'lemonnier', name: 'Camp Lemonnier', lat: 11.547, lng: 43.159, allows: ['fighter', 'drone', 'heli'] },
  { id: 'agadez', name: 'Air Base 201', lat: 16.96, lng: 8.0, allows: ['fighter', 'drone', 'heli'] },
  { id: 'osan', name: 'Osan AB', lat: 37.09, lng: 127.03, allows: ['fighter', 'drone', 'heli'] },
  { id: 'whiteman', name: 'Whiteman AFB', lat: 38.727, lng: -93.548, allows: ['bomber'] },
  { id: 'selfridge', name: 'Selfridge ANGB', lat: 42.608, lng: -82.835, allows: ['fighter', 'drone'] },
  { id: 'grayling', name: 'Camp Grayling', lat: 44.681, lng: -84.729, allows: ['heli', 'drone'] },
];

// Starter forces per starter zone
const STARTER_FLEET = {
  donbas:  [['f16', 'rzeszow'], ['f16', 'rzeszow'], ['ah64', 'dnipro'], ['mq9', 'dnipro'], ['uh60', 'dnipro']],
  lakes:   [['f16', 'selfridge'], ['f16', 'selfridge'], ['ah64', 'grayling'], ['uh60', 'grayling']],
  helmand: [['a10', 'bagram'], ['a10', 'bagram'], ['ah64', 'bagram'], ['mq9', 'bagram']],
};

// ---------------------------------------------------------------------------
// Research tree (costs in RP)
// ---------------------------------------------------------------------------
const RESEARCH = [
  { id: 'f15e', cat: 'Aircraft', name: 'F-15E Strike Eagle', cost: 40, unlockAc: 'f15e' },
  { id: 'ea18g', cat: 'Aircraft', name: 'EA-18G Growler', cost: 55, unlockAc: 'ea18g' },
  { id: 'f35', cat: 'Aircraft', name: 'F-35A Lightning II', cost: 90, req: 'f15e', unlockAc: 'f35' },
  { id: 'f22', cat: 'Aircraft', name: 'F-22A Raptor', cost: 130, req: 'f35', unlockAc: 'f22' },
  { id: 'b52', cat: 'Aircraft', name: 'B-52H Stratofortress', cost: 65, unlockAc: 'b52' },
  { id: 'b1b', cat: 'Aircraft', name: 'B-1B Lancer', cost: 105, req: 'b52', unlockAc: 'b1b' },
  { id: 'b2', cat: 'Aircraft', name: 'B-2A Spirit', cost: 170, req: 'b1b', unlockAc: 'b2' },
  { id: 'w_cbu', cat: 'Weapons', name: 'CBU-97 Cluster Munitions', cost: 25, unlockW: 'cbu97', desc: '5 km area denial bomb. Devastating against massed infantry and vehicles.' },
  { id: 'w_jassm', cat: 'Weapons', name: 'AGM-158 JASSM-ER', cost: 60, unlockW: 'jassm', desc: '260 km stand-off cruise missile. Strike without entering SAM range.' },
  { id: 'w_b61', cat: 'Weapons', name: 'B61-12 Nuclear Weapon', cost: 300, req: 'b2', unlockW: 'b61', desc: 'Erases a zone. Severe global threat and funding consequences.' },
  { id: 'u_cm', cat: 'Upgrades', name: 'Advanced Countermeasures', cost: 35, desc: 'Flares/chaff 25% more effective and +2 per aircraft.' },
  { id: 'u_tank', cat: 'Upgrades', name: 'Aerial Refueling', cost: 50, desc: 'KC-46 tanker support: all aircraft range ×1.6.' },
  { id: 'u_turn', cat: 'Upgrades', name: 'Rapid Turnaround', cost: 40, desc: 'Rearm and repair 50% faster.' },
  { id: 'u_armor', cat: 'Upgrades', name: 'Hardened Airframes', cost: 55, desc: '+25% hit points for all aircraft.' },
  { id: 'u_stealth', cat: 'Upgrades', name: 'RAM Coatings', cost: 70, desc: '+10% stealth for all aircraft.' },
  { id: 'u_sat', cat: 'Upgrades', name: 'Satellite Constellation', cost: 60, desc: 'Every 60s a satellite pass reveals 30% of hidden enemy units.' },
  { id: 'u_patriot', cat: 'Upgrades', name: 'Patriot Base Defense', cost: 45, desc: 'Bases intercept 75% of incoming cruise missiles.' },
  { id: 'csg', cat: 'Navy', name: 'Carrier Strike Group', cost: 110, unlockAc: 'fa18', desc: 'Commission aircraft carriers: floating airbases you can sail anywhere, with Aegis missile defense and Tomahawk strikes. Unlocks the F/A-18E.' },
  { id: 'u_csar', cat: 'Upgrades', name: 'Combat SAR Doctrine', cost: 30, desc: 'Ejection survival 90%. Rescue rewards doubled. Longer CSAR window.' },
];

const MISSIONS = {
  strike:    { name: 'STRIKE', desc: 'Destroy high-value targets: command posts, airbases, SAMs, armor.' },
  sead:      { name: 'SEAD', desc: 'Suppress enemy air defenses. Radars and SAM sites first.' },
  cas:       { name: 'CAS', desc: 'Close air support. Hit units attacking allied positions.' },
  recon:     { name: 'RECON', desc: 'Orbit the zone and reveal hidden enemy units.' },
  cap:       { name: 'CAP', desc: 'Combat air patrol. Hunt interceptors and cruise missiles.' },
  rescue:    { name: 'CSAR', desc: 'Recover a downed pilot before capture.' },
  reinforce: { name: 'REINFORCE', desc: 'Airlift troops and supplies to an allied position.' },
  defend:    { name: 'DEFEND', desc: 'Fly a defensive patrol over a home base. Shoots down incoming drones and cruise missiles.' },
  nuclear:   { name: 'NUCLEAR', desc: 'Authorize a thermonuclear strike on the zone.' },
  tlam:      { name: 'TOMAHAWK', desc: 'Ship-launched cruise missile salvo from a carrier strike group.' },
};

// Loadout presets [weapon, max count] by mission, filled in order while capacity remains
const PRESETS = {
  strike: [['aim9', 2], ['jassm', 2], ['jdam', 4], ['mav', 2], ['gbu12', 6], ['hellfire', 8], ['hydra', 2], ['cbu97', 2]],
  sead:   [['harm', 4], ['aim120', 2], ['jassm', 2], ['mav', 2], ['hellfire', 6], ['jdam', 2], ['gbu12', 4]],
  cas:    [['aim9', 2], ['mav', 4], ['hellfire', 6], ['hydra', 2], ['cbu97', 2], ['gbu12', 6], ['jdam', 2]],
  cap:    [['aim120', 6], ['aim9', 4]],
  defend: [['aim9', 4], ['aim120', 4]],
  recon:  [['aim9', 2]],
  nuclear: [['b61', 1]],
  rescue: [], reinforce: [],
};

const PHONETIC = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU'];

const FRIENDLY_NAMES = ['1st Allied Mech Bn', '3rd Rifle Bn', 'Task Force Granite', 'Border Guard Det.', 'Outpost Lancer', 'Marine Bridgehead', 'Task Force Anvil', '22nd Rangers'];
