// ============================================================================
// SKYWARD COMMAND — canvas overlay renderer (sits on top of the Leaflet map)
// ============================================================================
const COL = { hud: '#62f0cf', hudDim: 'rgba(98,240,207,0.35)', enemy: '#ff4d4d', friend: '#4fa3ff', warn: '#ffb648', white: '#e8fffa', gray: '#7d8f8c' };
const R = { map: null, canvas: null, ctx: null, w: 0, h: 0, dpr: 1, anim: null, k: 1, tx: 0, ty: 0, vz: 3 };

function initRender(map) {
  R.map = map;
  R.canvas = document.getElementById('fx');
  R.ctx = R.canvas.getContext('2d');
  // Zoom sync. During a pinch Leaflet updates its projection live, so normal redraws line up.
  // Animated zoom steps (buttons, double-tap, pinch release) are a 0.25s CSS transition on the
  // tiles while Leaflet's projection stays at the old zoom. Instead of stretching the canvas
  // (which made icons balloon and slide), we replay the same eased transform on every point we
  // draw, so icons ride along with the map at a constant size.
  map.on('zoomanim', e => {
    const s = map.getZoomScale(e.zoom), half = map.getSize().divideBy(2);
    const ref = map.getCenter();
    const cur = map.latLngToContainerPoint(ref);
    const tgt = map.project(ref, e.zoom).subtract(map.project(e.center, e.zoom)).add(half);
    R.anim = { t0: performance.now(), s, tx: tgt.x - s * cur.x, ty: tgt.y - s * cur.y, z0: map.getZoom() };
  });
  map.on('zoomend', () => { R.anim = null; render(); });
  map.on('resize', resizeCanvas);
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

function resizeCanvas() {
  const el = R.map.getContainer();
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.w = el.clientWidth; R.h = el.clientHeight;
  R.canvas.width = R.w * R.dpr; R.canvas.height = R.h * R.dpr;
  R.canvas.style.width = R.w + 'px'; R.canvas.style.height = R.h + 'px';
}

// Leaflet's zoom transition easing: cubic-bezier(0, 0, 0.25, 1)
function easeZoom(t) {
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 22; i++) { u = (lo + hi) / 2; const x = 0.75 * (1 - u) * u * u + u * u * u; if (x < t) lo = u; else hi = u; }
  return 3 * (1 - u) * u * u + u * u * u;
}
function syncView() {
  R.k = 1; R.tx = 0; R.ty = 0; R.vz = R.map.getZoom();
  if (R.anim) {
    const e = easeZoom(clamp((performance.now() - R.anim.t0) / 250, 0, 1));
    R.k = 1 + (R.anim.s - 1) * e; R.tx = R.anim.tx * e; R.ty = R.anim.ty * e;
    R.vz = R.anim.z0 + Math.log2(R.k);
  }
}
function P(ll) {
  const p = R.map.latLngToContainerPoint(ll);
  return R.anim ? { x: p.x * R.k + R.tx, y: p.y * R.k + R.ty } : p;
}
function kmPx(at, km) { const a = P(at), b = P(dest(at, 90, km)); return Math.hypot(b.x - a.x, b.y - a.y); }
const onScreen = (p, m = 60) => p.x > -m && p.y > -m && p.x < R.w + m && p.y < R.h + m;

function render() {
  const ctx = R.ctx;
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  ctx.clearRect(0, 0, R.w, R.h);
  if (!G) return;
  syncView();
  const z = R.vz, T = performance.now() / 1000;  // visual zoom (follows zoom animations smoothly)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  for (const zone of G.zones) drawZone(ctx, zone, z, T);
  drawBases(ctx, z, T);
  drawCarriers(ctx, z, T);
  drawRoutes(ctx, z);
  for (const p of G.pilots) drawPilot(ctx, p, z, T);
  for (const a of G.aircraft) if (a.status === 'airborne') drawAircraft(ctx, a, z, T);
  for (const e of G.enemyAir) if (!(e.delay > 0)) drawEnemyAir(ctx, e, z, T);
  drawProjectiles(ctx, z);
  drawFx(ctx, z);
  drawSelection(ctx, T);
}

// ---------------------------------------------------------------------------
function drawZone(ctx, zone, z, T) {
  // Cull by the zone's whole footprint (units + SAM rings reach ~70 km past the edge),
  // not by its label: when zoomed in the label is far off-screen but the units aren't.
  const c = P(zone.center), reach = kmPx(zone.center, zone.r + 70);
  if (c.x + reach < 0 || c.x - reach > R.w || c.y + reach < 0 || c.y - reach > R.h) return;
  const top = P(dest(zone.center, 0, zone.r * 1.12));
  const sel = UI.zoneSel === zone.id;
  // beacon so hot zones are visible from world view
  if (zone.active && z < 5) {
    const c = P(zone.center), pulse = (T * 0.8) % 1;
    ctx.strokeStyle = zone.neutralized ? 'rgba(98,240,207,0.6)' : `rgba(255,77,77,${0.9 - pulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5 + pulse * (zone.neutralized ? 0 : 14), 0, Math.PI * 2); ctx.stroke();
    if (!zone.neutralized) { ctx.fillStyle = COL.enemy; ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (z < 3 && zone.active) {
    const c = P(zone.center);
    ctx.textAlign = 'center'; ctx.font = '700 12px Rajdhani, sans-serif';
    outlineText(ctx, zone.short, c.x, c.y - 14, zone.neutralized ? COL.hud : COL.enemy);
  }
  // label
  if (z >= 3 && onScreen(top, 300)) {
    let color = COL.enemy, sub;
    if (!zone.active) { color = COL.gray; sub = 'MONITORING'; }
    else if (zone.neutralized) { color = COL.hud; sub = 'SECURED'; }
    else {
      const known = zone.units.filter(u => !u.dead && u.known).length;
      const alive = zone.units.filter(u => !u.dead).length;
      sub = `HOSTILES ${known} CONFIRMED · ~${Math.max(known, Math.round(alive / 2) * 2)} EST`;
    }
    ctx.textAlign = 'center';
    ctx.font = `700 ${sel ? 15 : 13}px Rajdhani, sans-serif`;
    outlineText(ctx, zone.short + (zone.nuked ? ' ☢' : ''), top.x, top.y - 12, color);
    ctx.font = '10px "Share Tech Mono", monospace';
    outlineText(ctx, sub, top.x, top.y + 1, color === COL.enemy ? '#ff9a9a' : color);
    if (zone.auto && zone.active && !zone.neutralized) outlineText(ctx, '◉ AUTO-STRIKE', top.x, top.y + 13, COL.hud);
  }
  if (!zone.active) return;

  // threat rings for known air defense
  if (!zone.neutralized && z >= 4) {
    for (const u of zone.units) {
      if (u.dead || !u.known) continue;
      const A = ENEMY[u.kind].aa;
      if (!A || (A.range < 15 && !sel && z < 7)) continue;
      const p = P(u.pos), r = kmPx(u.pos, A.range);
      ctx.save();
      ctx.setLineDash(A.range >= 40 ? [6, 5] : [3, 4]);
      ctx.strokeStyle = A.type === 'radar' ? 'rgba(255,77,77,0.42)' : 'rgba(255,182,72,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      if (A.range >= 40) { ctx.fillStyle = 'rgba(255,60,60,0.035)'; ctx.fill(); }
      ctx.restore();
    }
  }

  // friendlies
  for (const f of zone.friendlies) {
    if (f.dead) continue;
    const p = P(f.pos);
    if (!onScreen(p)) continue;
    const s = z >= 6 ? 9 : 6;
    ctx.save(); ctx.translate(p.x, p.y);
    if (f.underFire && !zone.neutralized) {
      ctx.strokeStyle = `rgba(255,182,72,${0.4 + 0.4 * Math.sin(T * 6)})`;
      ctx.beginPath(); ctx.arc(0, 0, s + 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(79,163,255,0.25)'; ctx.strokeStyle = COL.friend; ctx.lineWidth = 1.5;
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.strokeRect(-s, -s * 0.7, s * 2, s * 1.4);
    ctx.beginPath(); ctx.moveTo(-s, -s * 0.7); ctx.lineTo(s, s * 0.7); ctx.moveTo(s, -s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.stroke();
    // hp bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-s, s + 3, s * 2, 3);
    ctx.fillStyle = f.hp > 50 ? COL.friend : f.hp > 25 ? COL.warn : COL.enemy;
    ctx.fillRect(-s, s + 3, (s * 2 * f.hp) / 100, 3);
    ctx.restore();
    if (z >= 6) { ctx.font = '10px "Share Tech Mono", monospace'; ctx.textAlign = 'center'; outlineText(ctx, f.name.toUpperCase(), p.x, p.y + s + 16, '#9cc8ff'); }
  }

  // enemy units
  for (const u of zone.units) {
    if (u.dead || !u.known) continue;
    const p = P(u.pos);
    if (!onScreen(p)) continue;
    if (z < 5) {
      ctx.fillStyle = ENEMY[u.kind].aa ? '#ff7070' : 'rgba(255,90,90,0.75)';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      continue;
    }
    const close = z >= 8;
    const s = close ? 13 : clamp(5 + (z - 5) * 1.2, 5, 8.5);
    if (zone.reef && !ENEMY[u.kind].naval) { // reclaimed-reef island under the unit
      ctx.fillStyle = 'rgba(214,196,150,0.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, s * 2.1, s * 1.3, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (close) {
      drawArt(ctx, UNIT_ART[u.kind], p.x, p.y, clamp(26 + (z - 8) * 5, 26, 36), 0, '#ff5a5a');
      if (u.kind === 'radar') { // keep the rotating sweep so radars read as "live"
        const a = (T * 2.5) % (Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,120,120,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18, a, a + 0.6); ctx.stroke();
      }
    } else unitIcon(ctx, p.x, p.y, u.kind, s, T);
    if (u.amphib) {
      ctx.strokeStyle = 'rgba(120,190,255,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { const x0 = p.x + i * 5; ctx.moveTo(x0 - 2.5, p.y + s + 6); ctx.quadraticCurveTo(x0, p.y + s + 3, x0 + 2.5, p.y + s + 6); }
      ctx.stroke();
    }
    if (u.hp < u.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - s, p.y + s + 3, s * 2, 2);
      ctx.fillStyle = COL.warn; ctx.fillRect(p.x - s, p.y + s + 3, (s * 2 * u.hp) / u.maxHp, 2);
    }
    if (z >= 7) {
      ctx.font = '9px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
      outlineText(ctx, ENEMY[u.kind].short, p.x, p.y - s - 4, '#ff9a9a');
    }
  }
}

function unitIcon(ctx, x, y, kind, s, T) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = COL.enemy; ctx.fillStyle = 'rgba(255,77,77,0.2)'; ctx.lineWidth = 1.4;
  const rectBox = () => { ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.strokeRect(-s, -s * 0.7, s * 2, s * 1.4); };
  const diamond = k => { ctx.beginPath(); ctx.moveTo(0, -s * k); ctx.lineTo(s * k, 0); ctx.lineTo(0, s * k); ctx.lineTo(-s * k, 0); ctx.closePath(); };
  ctx.beginPath();
  switch (kind) {
    case 'inf': rectBox(); ctx.beginPath(); ctx.moveTo(-s, -s * 0.7); ctx.lineTo(s, s * 0.7); ctx.moveTo(s, -s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.stroke(); break;
    case 'technical': rectBox(); ctx.beginPath(); ctx.arc(-s * 0.45, s * 0.7, s * 0.25, 0, Math.PI * 2); ctx.arc(s * 0.45, s * 0.7, s * 0.25, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 0.5, 0); ctx.stroke(); break;
    case 'ifv': rectBox(); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.65, s * 0.35, 0, 0, Math.PI * 2); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke(); break;
    case 'mbt': rectBox(); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.65, s * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'arty': rectBox(); ctx.fillStyle = COL.enemy; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill(); break;
    case 'aaa': ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, s * 0.7, s * 0.55, Math.PI, 0); ctx.stroke(); break;
    case 'manpad': ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.7, s * 0.5); ctx.lineTo(-s * 0.7, s * 0.5); ctx.closePath(); ctx.stroke(); break;
    case 'shorad': diamond(1); ctx.fill(); ctx.stroke(); diamond(0.45); ctx.stroke(); break;
    case 'sam_lr':
      diamond(1.35); ctx.fillStyle = 'rgba(255,77,77,0.55)'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); ctx.fill(); break;
    case 'radar': {
      ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const a = (T * 2.5) % (Math.PI * 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.stroke(); break;
    }
    case 'hq':
      ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.6); ctx.lineTo(-s * 0.4, -s * 0.6); ctx.lineTo(s * 0.5, -s * 0.35); ctx.lineTo(-s * 0.4, -s * 0.1); ctx.stroke(); break;
    case 'airfield':
      ctx.rotate(0.5); ctx.fillRect(-s * 1.8, -s * 0.45, s * 3.6, s * 0.9); ctx.strokeRect(-s * 1.8, -s * 0.45, s * 3.6, s * 0.9);
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(-s * 1.5, 0); ctx.lineTo(s * 1.5, 0); ctx.stroke(); break;
    case 'destroyer':
      ctx.moveTo(-s * 1.7, -s * 0.25); ctx.lineTo(s * 1.7, -s * 0.25); ctx.lineTo(s * 1.1, s * 0.65); ctx.lineTo(-s * 1.1, s * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.25); ctx.lineTo(-s * 0.4, -s * 1); ctx.moveTo(s * 0.4, -s * 0.25); ctx.lineTo(s * 0.4, -s * 0.8); ctx.stroke(); break;
    case 'fac':
      ctx.moveTo(-s * 0.9, -s * 0.1); ctx.lineTo(s * 0.9, -s * 0.1); ctx.lineTo(s * 0.5, s * 0.45); ctx.lineTo(-s * 0.5, s * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'frigate':
      ctx.moveTo(-s * 1.4, -s * 0.2); ctx.lineTo(s * 1.4, -s * 0.2); ctx.lineTo(s * 0.9, s * 0.6); ctx.lineTo(-s * 0.9, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, -s * 0.9); ctx.stroke(); break;
  }
  ctx.restore();
}

function drawBases(ctx, z, T) {
  const threatened = new Set(G.enemyAir.filter(e => e.target && !e.removed).map(e => e.target));
  for (const b of G.bases) {
    if (b.carrier) continue; // drawn as a ship by drawCarriers
    const p = P(b.pos);
    if (!onScreen(p)) continue;
    const n = G.aircraft.filter(a => a.baseId === b.id).length;
    const active = n > 0;
    if (z < 4 && !active && !threatened.has(b.id)) { ctx.fillStyle = COL.hudDim; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); continue; }
    const s = 6;
    ctx.save(); ctx.translate(p.x, p.y);
    if (threatened.has(b.id)) {
      ctx.strokeStyle = `rgba(255,77,77,${0.5 + 0.5 * Math.sin(T * 8)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 14 + 3 * Math.sin(T * 8), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(6,20,18,0.9)'; ctx.strokeStyle = active ? COL.hud : COL.hudDim; ctx.lineWidth = 1.5;
    ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.6); ctx.lineTo(s * 0.6, -s * 0.6); ctx.stroke();
    ctx.restore();
    if (z >= 4 || active) {
      ctx.font = '10px "Share Tech Mono", monospace'; ctx.textAlign = 'left';
      outlineText(ctx, b.name.toUpperCase() + (n ? `  ×${n}` : ''), p.x + 10, p.y + 3, active ? COL.hud : COL.gray);
    }
  }
}

function drawCarriers(ctx, z, T) {
  for (const c of G.carriers) {
    const p = P(c.pos);
    const sel = UI.sel && UI.sel.type === 'carrier' && UI.sel.ref === c;
    // planned route
    if (c.route.length) {
      ctx.save(); ctx.setLineDash([2, 6]); ctx.strokeStyle = 'rgba(143,220,255,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (const w of c.route) { const q = P(w); ctx.lineTo(q.x, q.y); }
      ctx.stroke(); ctx.restore();
      const end = P(c.route[c.route.length - 1]);
      ctx.strokeStyle = 'rgba(143,220,255,0.8)'; ctx.beginPath(); ctx.arc(end.x, end.y, 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (!onScreen(p, 80)) continue;
    // Aegis umbrella
    if (sel || z >= 6) {
      ctx.save(); ctx.setLineDash([3, 7]); ctx.strokeStyle = `rgba(143,220,255,${sel ? 0.45 : 0.18})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, kmPx(c.pos, CARRIER.aegisRange), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const col = c.hp / c.maxHp < 0.5 ? COL.warn : '#8fdcff';
    const size = clamp(24 + (z - 5) * 3, 24, 40);
    // escorts: a destroyer and a cruiser riding along
    for (const [ang, d] of [[130, 0.95], [-130, 0.95], [180, 1.3]]) {
      const a = (c.heading + ang) * DEG, ex = p.x + Math.sin(a) * size * d, ey = p.y - Math.cos(a) * size * d;
      drawArt(ctx, 'escort', ex, ey, size * 0.42, c.heading, col);
    }
    if (c.route.length) { // wake
      const a = (c.heading + 180) * DEG;
      ctx.strokeStyle = 'rgba(200,240,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x + Math.sin(a) * size * 0.5, p.y - Math.cos(a) * size * 0.5); ctx.lineTo(p.x + Math.sin(a) * size * 1.6, p.y - Math.cos(a) * size * 1.6); ctx.stroke();
    }
    drawArt(ctx, 'carrier', p.x, p.y, size, c.heading, col);
    ctx.font = '700 11px Rajdhani, sans-serif'; ctx.textAlign = 'left';
    outlineText(ctx, c.name.split(' ')[0] + ' ' + c.name.split(' ').slice(-1), p.x + size * 0.7, p.y - 4, col);
    ctx.font = '9px "Share Tech Mono", monospace';
    outlineText(ctx, `${Math.round((c.hp / c.maxHp) * 100)}% · TLAM ${c.tlam}`, p.x + size * 0.7, p.y + 8, col);
  }
}

function drawRoutes(ctx, z) {
  ctx.save();
  ctx.setLineDash([4, 6]);
  for (const a of G.aircraft) {
    if (a.status !== 'airborne') continue;
    const pkg = pkgById(a.pkgId);
    let goal = a.state === 'rtb' ? baseById(a.baseId).pos : a.state === 'outbound' ? pkgTargetPos(pkg) : null;
    if (!goal) continue;
    const sel = UI.trackPkg === a.pkgId || (UI.sel && UI.sel.type === 'ac' && UI.sel.ref.pkgId === a.pkgId);
    ctx.strokeStyle = a.state === 'rtb' ? `rgba(143,220,255,${sel ? 0.55 : 0.2})` : `rgba(98,240,207,${sel ? 0.7 : 0.28})`;
    ctx.lineWidth = 1;
    // great-circle polyline
    const d = dist(a.pos, goal), steps = Math.min(24, Math.max(2, Math.ceil(d / 200)));
    const brg = bearing(a.pos, goal);
    ctx.beginPath();
    let p0 = P(a.pos); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i <= steps; i++) {
      const q = i === steps ? goal : dest(a.pos, brg, (d * i) / steps);
      const pq = P(q);
      if (Math.abs(pq.x - p0.x) > R.w) break; // antimeridian guard
      ctx.lineTo(pq.x, pq.y); p0 = pq;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAircraft(ctx, a, z, T) {
  const p = P(a.pos);
  if (!onScreen(p)) return;
  const Ty = AIRCRAFT[a.type];
  // trail
  if (a.trail.length > 1) {
    ctx.save(); ctx.lineWidth = 1.2;
    for (let i = 1; i < a.trail.length; i++) {
      const p1 = P(a.trail[i - 1]), p2 = P(a.trail[i]);
      ctx.strokeStyle = `rgba(98,240,207,${(i / a.trail.length) * 0.35})`;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    const pl = P(a.trail[a.trail.length - 1]);
    ctx.strokeStyle = 'rgba(98,240,207,0.35)'; ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  }
  const hpf = a.hp / a.maxHp;
  const color = hpf < 0.5 ? COL.warn : a.state === 'rtb' ? '#8fdcff' : COL.hud;
  const size = Ty.cls === 'bomber' ? 30 : Ty.cls === 'drone' ? 20 : 22;
  const s = size / 2;
  if (Ty.ecm) { ctx.save(); ctx.strokeStyle = 'rgba(143,220,255,0.18)'; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.arc(p.x, p.y, kmPx(a.pos, Ty.ecm), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  if (a.inbound > 0) {
    ctx.strokeStyle = `rgba(255,77,77,${0.5 + 0.5 * Math.sin(T * 14)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, s + 6, 0, Math.PI * 2); ctx.stroke();
  }
  drawArt(ctx, AC_ART[a.type], p.x, p.y, size, a.heading, color, { rotor: false });
  if (Ty.cls === 'heli') rotor(ctx, p.x, p.y, a.heading, size, color, T);
  if (z >= 5 || UI.trackPkg === a.pkgId) {
    ctx.font = '10px "Share Tech Mono", monospace'; ctx.textAlign = 'left';
    outlineText(ctx, a.callsign, p.x + s + 5, p.y - 3, color);
    if (z >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x + s + 5, p.y + 2, 30, 3);
      ctx.fillStyle = color; ctx.fillRect(p.x + s + 5, p.y + 2, 30 * hpf, 3);
    }
  }
}

// Spinning rotor blades for helicopters, centered on the rotor mast
function rotor(ctx, x, y, hdg, size, color, T) {
  const off = size * 0.16;
  const cx = x + Math.sin(hdg * DEG) * off, cy = y - Math.cos(hdg * DEG) * off;
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
  ctx.beginPath();
  const r = T * 22, L = size * 0.55;
  for (let i = 0; i < 2; i++) { const a = r + (i * Math.PI) / 2; ctx.moveTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.lineTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L); }
  ctx.stroke();
  ctx.restore();
}

function drawEnemyAir(ctx, e, z, T) {
  const p = P(e.pos);
  if (!onScreen(p)) return;
  ctx.save(); ctx.lineWidth = 1;
  for (let i = 1; i < e.trail.length; i++) {
    const p1 = P(e.trail[i - 1]), p2 = P(e.trail[i]);
    ctx.strokeStyle = `rgba(255,77,77,${(i / e.trail.length) * 0.4})`;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  ctx.restore();
  const art = e.kind === 'cruise' || e.kind === 'ashm' ? 'cruise' : e.kind === 'drone' ? 'edrone' : 'su35';
  drawArt(ctx, art, p.x, p.y, e.kind === 'fighter' ? 22 : 13, e.heading, COL.enemy);
  if (z >= 5 || e.kind !== 'fighter') {
    ctx.font = '9px "Share Tech Mono", monospace'; ctx.textAlign = 'left';
    outlineText(ctx, e.kind === 'cruise' || e.kind === 'ashm' ? 'VAMPIRE' : e.kind === 'drone' ? 'DRONE' : `BANDIT ${e.name}`, p.x + 11, p.y - 3, '#ff8a8a');
  }
}

function drawPilot(ctx, pl, z, T) {
  const p = P(pl.pos);
  if (!onScreen(p)) return;
  const left = pl.expires - G.time;
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.strokeStyle = `rgba(255,216,74,${0.4 + 0.4 * Math.sin(T * 5)})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 12 + 4 * ((T * 1.5) % 1), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#ffd84a';
  ctx.beginPath(); ctx.arc(0, -2, 6, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(0, 6); ctx.lineTo(6, -2); ctx.stroke();
  ctx.restore();
  ctx.font = '10px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
  outlineText(ctx, `${pl.callsign} ${fmtTime(left)}`, p.x, p.y + 22, '#ffd84a');
}

function drawProjectiles(ctx, z) {
  for (const p of G.proj) {
    if (p.delay > 0) continue;
    if (p.side === 'fx' && z < 6) continue;
    const q = P(p.pos);
    if (!onScreen(q, 20)) continue;
    if (p.trail && p.trail.length) {
      const blue = p.side === 'blue';
      ctx.lineWidth = p.kind === 'cruise' ? 2 : 1.5;
      for (let i = 1; i <= p.trail.length; i++) {
        const a = P(p.trail[i - 1]), b = i === p.trail.length ? q : P(p.trail[i]);
        const al = (i / p.trail.length) * 0.75;
        ctx.strokeStyle = blue ? `rgba(180,250,240,${al})` : `rgba(255,150,110,${al})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    switch (p.kind) {
      case 'missile': case 'cruise': case 'rocket':
        ctx.fillStyle = p.side === 'blue' ? '#ffffff' : '#ffb08a';
        ctx.beginPath(); ctx.arc(q.x, q.y, p.kind === 'cruise' ? 2.6 : 2, 0, Math.PI * 2); ctx.fill(); break;
      case 'bomb':
        ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI * 2); ctx.fill(); break;
      case 'nuke':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, Math.PI * 2); ctx.stroke(); break;
      case 'bullet': case 'tracer': {
        const col = p.side === 'blue' || p.color === 'blue' ? '#a8f7ff' : '#ffd84a';
        const aim = P(p.aim), dx = aim.x - q.x, dy = aim.y - q.y, l = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - (dx / l) * 5, q.y - (dy / l) * 5); ctx.stroke(); break;
      }
      case 'shell':
        ctx.fillStyle = '#ff9a4a'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2); ctx.fill(); break;
    }
  }
}

function updateFx(dt) {
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.dur);
}

function drawFx(ctx, z) {
  const zs = clamp((z - 3) / 5, 0.45, 1.4);
  for (const f of G.fx) {
    const p = P(f.pos);
    if (!onScreen(p, f.kind === 'nuke' ? 2000 : 60)) continue;
    const k = f.t / f.dur, inv = 1 - k;
    switch (f.kind) {
      case 'explosion': {
        const r = (5 + 16 * f.size) * zs * (0.3 + 0.7 * Math.sqrt(k));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,255,220,${inv})`); g.addColorStop(0.35, `rgba(255,170,60,${inv * 0.9})`); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,220,160,${inv * 0.6})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'puff':
        ctx.fillStyle = `rgba(200,200,200,${inv * 0.5})`; ctx.beginPath(); ctx.arc(p.x, p.y, (3 + 6 * k) * f.size * zs, 0, Math.PI * 2); ctx.fill(); break;
      case 'hit':
        ctx.strokeStyle = `rgba(255,230,120,${inv})`; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const a = f.seed * 6 + i; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * 10 * k + Math.cos(a) * 3, p.y + Math.sin(a) * 10 * k + Math.sin(a) * 3); ctx.stroke(); }
        break;
      case 'falling':
        for (let i = 0; i < 8; i++) {
          const tt = Math.max(0, k - i * 0.05);
          ctx.fillStyle = `rgba(160,160,160,${(1 - tt) * 0.35})`;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(i + f.seed * 9) * 6 * tt, p.y + i * 3 * k + 12 * tt, 2 + 4 * tt, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'flares':
        for (let i = 0; i < 8; i++) {
          const a = Math.PI * 0.25 + (i / 7) * Math.PI * 0.5 + f.seed;
          ctx.fillStyle = `rgba(255,${200 + i * 6},140,${inv})`;
          ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 16 * k, p.y + Math.sin(a) * 16 * k + 10 * k * k, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'text':
        ctx.font = '700 12px Rajdhani, sans-serif'; ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, inv * 2);
        outlineText(ctx, f.text, p.x, p.y - 14 - k * 18, f.color || '#fff');
        ctx.globalAlpha = 1;
        break;
      case 'nuke': {
        const R45 = kmPx(f.pos, 45);
        const ring = R45 * Math.min(1, k * 2.2);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, ring));
        g.addColorStop(0, `rgba(255,255,255,${inv})`); g.addColorStop(0.3, `rgba(255,200,90,${inv * 0.8})`); g.addColorStop(0.7, `rgba(255,80,30,${inv * 0.5})`); g.addColorStop(1, 'rgba(120,20,10,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, ring), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${inv})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, R45 * Math.min(1.4, k * 3), 0, Math.PI * 2); ctx.stroke();
        break;
      }
    }
  }
}

function drawSelection(ctx, T) {
  const s = UI.sel;
  if (!s) return;
  let pos = null;
  if (s.type === 'ac') { if (s.ref.status !== 'airborne') { pos = baseById(s.ref.baseId).pos; } else pos = s.ref.pos; }
  else if (s.type === 'unit') { if (s.ref.dead) { UI.sel = null; return; } pos = s.ref.pos; }
  else if (s.type === 'eair') { if (s.ref.removed) { UI.sel = null; return; } pos = s.ref.pos; }
  else if (s.type === 'base' || s.type === 'friendly' || s.type === 'pilot' || s.type === 'carrier') pos = s.ref.pos;
  if (!pos) return;
  const p = P(pos), r = 14 + Math.sin(T * 4) * 1.5, l = 5;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(p.x + sx * r, p.y + sy * (r - l)); ctx.lineTo(p.x + sx * r, p.y + sy * r); ctx.lineTo(p.x + sx * (r - l), p.y + sy * r);
  }
  ctx.stroke();
}

function outlineText(ctx, text, x, y, color) {
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,8,10,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// Hit-test a screen point; returns {type, ref} or null
function pickAt(pt) {
  const z = R.map.getZoom();
  let best = null, bd = 18;
  const test = (pos, type, ref, bias = 0) => {
    const p = P(pos), d = Math.hypot(p.x - pt.x, p.y - pt.y) - bias;
    if (d < bd) { bd = d; best = { type, ref }; }
  };
  for (const a of G.aircraft) if (a.status === 'airborne') test(a.pos, 'ac', a, 4);
  for (const e of G.enemyAir) if (!e.removed) test(e.pos, 'eair', e, 3);
  for (const p of G.pilots) test(p.pos, 'pilot', p, 4);
  for (const c of G.carriers) test(c.pos, 'carrier', c, 8);
  for (const b of G.bases) if (!b.carrier) test(b.pos, 'base', b);
  if (z >= 5) for (const zn of G.zones) {
    if (!zn.active) continue;
    for (const u of zn.units) if (!u.dead && u.known) test(u.pos, 'unit', u);
    for (const f of zn.friendlies) if (!f.dead) test(f.pos, 'friendly', f);
  }
  return best;
}
