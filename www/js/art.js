// ============================================================================
// SKYWARD COMMAND — vector art for aircraft (top-down planforms) and ground
// units (side profiles). One definition feeds both the DOM (inline SVG) and
// the map canvas (Path2D), so the UI and the battlefield always match.
//
// Part types:  b = body (unit color)   d = dark detail   c = light detail
//              s = stroke in unit color   r = faint stroke (rotor discs)
// Aircraft: 100×100 box, nose up.  Ground: 120×60 box, facing right.
// ============================================================================
const circ = (x, y, r) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 `;
const circs = list => list.map(([x, y, r]) => circ(x, y, r)).join('');
const soldier = x => `M${x - 5} 22 L${x + 5} 22 L${x + 6} 38 L${x + 4} 54 L${x + 1} 54 L${x} 41 L${x - 1} 54 L${x - 4} 54 L${x - 6} 38 Z ` + circ(x, 15, 5);
const tracks = 'M10 44 L110 44 Q115 49 108 53 L14 53 Q7 49 10 44 Z';
const roadWheels = circs([[20, 48.5, 3], [33, 48.5, 3], [46, 48.5, 3], [59, 48.5, 3], [72, 48.5, 3], [85, 48.5, 3], [98, 48.5, 3]]);
const canopy = (y1, y2) => `M47.5 ${y1 + 3} Q50 ${y1 - 1} 52.5 ${y1 + 3} L52.5 ${y2} Q50 ${y2 + 2} 47.5 ${y2} Z`;

const ART = {
  // ---------------- player aircraft (planforms) ----------------
  f16: { box: 'plan', parts: [
    ['b', 'M50 3 L53 13 L54.5 30 L56 39 L90 60 L90 65 L57 61 L56 76 L69 86 L69 91 L54.5 89 L52 95 L48 95 L45.5 89 L31 91 L31 86 L44 76 L43 61 L10 65 L10 60 L44 39 L45.5 30 L47 13 Z'],
    ['c', canopy(13, 26)]] },
  a10: { box: 'plan', parts: [
    ['b', 'M50 5 L53 11 L54 35 L96 37 L96 46 L54 48 L54 82 L74 84 L74 92 L53 91 L51 97 L49 97 L47 91 L26 92 L26 84 L46 82 L46 48 L4 46 L4 37 L46 35 L47 11 Z'],
    ['b', 'M56 60 L64 60 L65 76 L55 76 Z M36 60 L44 60 L45 76 L35 76 Z'],
    ['d', 'M57 62 L63 62 L63 66 L57 66 Z M37 62 L43 62 L43 66 L37 66 Z'],
    ['c', canopy(10, 20)]] },
  ah64: { box: 'plan', heli: true, parts: [
    ['r', circ(50, 34, 40)],
    ['b', 'M50 8 L54 16 L55 44 L69 44 L69 51 L55 51 L53 64 L52 86 L61 86 L61 91 L39 91 L39 86 L48 86 L47 64 L45 51 L31 51 L31 44 L45 44 L46 16 Z'],
    ['d', 'M31 43 L35 43 L35 52 L31 52 Z M65 43 L69 43 L69 52 L65 52 Z'],
    ['c', canopy(9, 22)]] },
  uh60: { box: 'plan', heli: true, parts: [
    ['r', circ(50, 36, 40)],
    ['b', 'M50 8 L57 16 L59 50 L55 62 L52 87 L63 87 L63 92 L37 92 L37 87 L48 87 L45 62 L41 50 L43 16 Z'],
    ['c', 'M45 12 Q50 8 55 12 L56 20 L44 20 Z']] },
  mq9: { box: 'plan', parts: [
    ['b', 'M50 16 L52.5 22 L53 43 L97 46.5 L97 50 L53 51.5 L53 77 L64 88 L62 90 L50 83 L38 90 L36 88 L47 77 L47 51.5 L3 50 L3 46.5 L47 43 L47.5 22 Z'],
    ['d', 'M46 82 L54 82 L54 86 L46 86 Z'],
    ['c', 'M48 19 Q50 15 52 19 L52 26 L48 26 Z']] },
  f15e: { box: 'plan', parts: [
    ['b', 'M50 3 L53 11 L55.5 29 L58 35 L91 57 L91 64 L60 62 L60 74 L73 86 L73 92 L58 90 L57.5 97 L54.5 97 L53.5 88 L46.5 88 L45.5 97 L42.5 97 L42 90 L27 92 L27 86 L40 74 L40 62 L9 64 L9 57 L42 35 L44.5 29 L47 11 Z'],
    ['c', canopy(11, 26)]] },
  ea18g: { box: 'plan', parts: [
    ['b', 'M50 3 L53 11 L54.5 27 L58 39 L86 55 L91 55 L91 64 L86 62 L60 62 L60 75 L72 87 L72 92 L56 90 L54 96 L46 96 L44 90 L28 92 L28 87 L40 75 L40 62 L14 62 L9 64 L9 55 L14 55 L42 39 L45.5 27 L47 11 Z'],
    ['d', 'M88 50 L92 50 L92 66 L88 66 Z M8 50 L12 50 L12 66 L8 66 Z'],
    ['c', canopy(11, 25)]] },
  f35: { box: 'plan', parts: [
    ['b', 'M50 5 L54 15 L57 33 L61 39 L87 56 L87 63 L61 64 L61 72 L75 84 L75 90 L57 88 L54 95 L46 95 L43 88 L25 90 L25 84 L39 72 L39 64 L13 63 L13 56 L39 39 L43 33 L46 15 Z'],
    ['c', canopy(13, 28)]] },
  f22: { box: 'plan', parts: [
    ['b', 'M50 3 L54 13 L58 31 L63 37 L93 60 L91 67 L64 64 L64 72 L79 86 L77 92 L58 88 L56 95 L44 95 L42 88 L23 92 L21 86 L36 72 L36 64 L9 67 L7 60 L37 37 L42 31 L46 13 Z'],
    ['c', canopy(11, 27)]] },
  b52: { box: 'plan', parts: [
    ['b', 'M50 3 L53 9 L53.5 37 L97 61 L97 66 L53.5 54 L53.5 81 L67 89 L67 93 L52 92 L50 97 L48 92 L33 93 L33 89 L46.5 81 L46.5 54 L3 66 L3 61 L46.5 37 L47 9 Z'],
    ['d', 'M64 42 L68 42 L68 50 L64 50 Z M78 50 L82 50 L82 58 L78 58 Z M32 42 L36 42 L36 50 L32 50 Z M18 50 L22 50 L22 58 L18 58 Z']] },
  b1b: { box: 'plan', parts: [
    ['b', 'M50 2 L53 10 L54 35 L58 40 L89 70 L86 74 L56 58 L56 80 L69 90 L69 94 L52.5 92 L50 98 L47.5 92 L31 94 L31 90 L44 80 L44 58 L14 74 L11 70 L42 40 L46 35 L47 10 Z'],
    ['c', canopy(9, 20)]] },
  b2: { box: 'plan', parts: [
    ['b', 'M50 22 L99 57 L93 66 L81 60 L71 68 L60 62 L50 68 L40 62 L29 68 L19 60 L7 66 L1 57 Z'],
    ['d', 'M44 36 L56 36 L58 46 L42 46 Z']] },

  // ---------------- player navy ----------------
  carrier: { box: 'plan', parts: [
    ['b', 'M45 3 L56 3 L58 9 L60 40 L62 60 L62 97 L38 97 L38 46 L27 34 L28 24 L41 17 Z'],
    ['d', 'M57 52 L62 52 L62 68 L57 68 Z'],
    ['c', 'M33 30 L45 22 L46 24 L34 32 Z M49 40 L50 90 L49.2 90 L48.2 40 Z']] },
  escort: { box: 'plan', parts: [
    ['b', 'M50 8 L58 30 L58 88 L42 88 L42 30 Z'],
    ['d', 'M45 40 L55 40 L55 56 L45 56 Z']] },

  // ---------------- enemy air ----------------
  su35: { box: 'plan', parts: [
    ['b', 'M50 2 L53 11 L55 22 L64 26 L64 29 L56 30 L58 36 L91 58 L91 64 L60 62 L60 75 L73 87 L73 92 L58 90 L57 97 L54 97 L53 88 L47 88 L46 97 L43 97 L42 90 L27 92 L27 87 L40 75 L40 62 L9 64 L9 58 L42 36 L44 30 L36 29 L36 26 L45 22 L47 11 Z'],
    ['c', canopy(10, 22)]] },
  cruise: { box: 'plan', parts: [
    ['b', 'M50 4 L54 14 L54 62 L74 72 L74 77 L54 74 L54 88 L62 96 L38 96 L46 88 L46 74 L26 77 L26 72 L46 62 L46 14 Z']] },
  edrone: { box: 'plan', parts: [
    ['b', 'M50 14 L54 22 L94 76 L94 82 L58 72 L54 84 L46 84 L42 72 L6 82 L6 76 L46 22 Z'],
    ['d', 'M47 82 L53 82 L53 88 L47 88 Z']] },

  // ---------------- enemy ground (side profiles) ----------------
  mbt: { box: 'side', parts: [
    ['b', 'M8 40 L16 31 L102 31 L112 38 L108 44 L12 44 Z'],
    ['b', 'M38 31 L44 21 L76 21 L84 31 Z'],
    ['b', 'M80 23.5 L117 23.5 L117 26.5 L80 27 Z'],
    ['d', tracks], ['c', roadWheels]] },
  ifv: { box: 'side', parts: [
    ['b', 'M6 42 L12 25 L94 25 L108 33 L110 44 L8 44 Z'],
    ['b', 'M48 25 L53 17 L72 17 L77 25 Z'],
    ['b', 'M74 19.5 L104 19.5 L104 22 L74 22.5 Z'],
    ['d', 'M20 30 L28 30 L28 36 L20 36 Z M34 30 L42 30 L42 36 L34 36 Z'],
    ['d', tracks], ['c', roadWheels]] },
  technical: { box: 'side', parts: [
    ['b', 'M6 42 L8 31 L54 31 L56 27 L64 21 L84 21 L93 31 L108 33 L111 42 Z'],
    ['b', 'M24 31 L26 18 L30 18 L32 31 Z'],
    ['b', 'M27 19 L52 12 L53 15 L28 22 Z'],
    ['c', 'M67 23.5 L82 23.5 L88 30 L67 30 Z'],
    ['d', circs([[26, 44, 8], [90, 44, 8]])], ['c', circs([[26, 44, 3], [90, 44, 3]])]] },
  arty: { box: 'side', parts: [
    ['b', 'M8 42 L14 32 L100 32 L108 38 L106 44 L10 44 Z'],
    ['b', 'M28 32 L32 19 L72 19 L76 32 Z'],
    ['b', 'M66 21 L115 4 L117 8 L69 26 Z'],
    ['d', tracks], ['c', roadWheels]] },
  aaa: { box: 'side', parts: [
    ['b', 'M8 42 L14 32 L100 32 L108 38 L106 44 L10 44 Z'],
    ['b', 'M38 32 L42 22 L80 22 L84 32 Z'],
    ['b', 'M68 23 L104 7 L106 10 L70 26 Z M68 28 L108 15 L109 18 L70 31 Z'],
    ['b', 'M44 22 L46 12 L48 12 L50 22 Z M34 10 Q47 3 60 10 Q47 14 34 10 Z'],
    ['d', tracks], ['c', roadWheels]] },
  manpad: { box: 'side', parts: [
    ['b', 'M46 21 L56 21 L58 37 L68 52 L60 54 L52 42 L46 54 L37 52 L44 37 Z' + circ(51, 14, 5.5)],
    ['b', 'M20 23 L88 10 L89.5 15.5 L21.5 28.5 Z'],
    ['d', 'M84 9 L92 7.5 L93.5 14 L85.5 15.5 Z']] },
  inf: { box: 'side', parts: [
    ['b', soldier(28) + soldier(58) + soldier(88)],
    ['b', 'M32 26 L48 20 L49 22.5 L33 29 Z M62 26 L78 20 L79 22.5 L63 29 Z M92 26 L108 20 L109 22.5 L93 29 Z']] },
  shorad: { box: 'side', parts: [
    ['b', 'M8 42 L14 32 L100 32 L108 38 L106 44 L10 44 Z'],
    ['b', 'M26 32 L26 14 L62 14 L62 32 Z'],
    ['d', 'M30 17 L58 17 L58 21 L30 21 Z M30 24 L58 24 L58 28 L30 28 Z'],
    ['b', 'M74 32 L76 20 L80 20 L82 32 Z M66 8 L90 8 L90 20 L66 20 Z'],
    ['d', 'M69 11 L87 11 L87 17 L69 17 Z'],
    ['d', tracks], ['c', roadWheels]] },
  sam_lr: { box: 'side', parts: [
    ['b', 'M88 44 L88 25 L103 25 L113 34 L113 44 Z'],
    ['c', 'M92 28 L102 28 L108 34 L92 34 Z'],
    ['b', 'M6 39 L88 39 L88 44 L6 44 Z'],
    ['b', 'M12 37 L70 7 L77 18 L20 44 Z'],
    ['d', 'M23 35 L72 10 L73.5 12.5 L24.5 37.5 Z'],
    ['d', circs([[18, 47, 6], [34, 47, 6], [74, 47, 6], [100, 47, 6]])], ['c', circs([[18, 47, 2], [34, 47, 2], [74, 47, 2], [100, 47, 2]])]] },
  radar: { box: 'side', parts: [
    ['b', 'M88 44 L88 26 L103 26 L113 34 L113 44 Z'],
    ['b', 'M6 39 L88 39 L88 44 L6 44 Z'],
    ['b', 'M44 39 L47 20 L53 20 L56 39 Z'],
    ['b', 'M22 22 L32 2 L74 2 L64 22 Z'],
    ['d', 'M30 18 L37 5 M41 18 L48 5 M52 18 L59 5 M26 12 L68 12'],
    ['d', circs([[18, 47, 6], [36, 47, 6], [76, 47, 6], [100, 47, 6]])]] },
  hq: { box: 'side', parts: [
    ['b', 'M8 53 L18 30 L102 30 L112 53 Z'],
    ['d', 'M50 53 L50 39 L70 39 L70 53 Z M26 38 L38 38 L38 44 L26 44 Z M82 38 L94 38 L94 44 L82 44 Z'],
    ['s', 'M92 30 L92 3 M86 8 L98 8'],
    ['b', 'M24 30 L24 6 L46 12 L24 18 Z']] },
  airfield: { box: 'side', parts: [
    ['b', 'M4 53 L4 34 Q30 12 56 34 L56 53 Z'],
    ['d', 'M14 53 L14 38 Q30 26 46 38 L46 53 Z'],
    ['b', 'M94 53 L96 22 L90 22 L90 13 L112 13 L112 22 L106 22 L108 53 Z'],
    ['c', 'M92 15 L110 15 L110 20 L92 20 Z'],
    ['d', 'M0 54 L120 54 L120 58 L0 58 Z']] },
  destroyer: { box: 'side', parts: [
    ['b', 'M1 38 L119 38 L108 54 L12 54 Z'],
    ['b', 'M22 38 L26 24 L48 24 L52 38 Z M60 38 L63 28 L80 28 L83 38 Z'],
    ['b', 'M36 24 L38 4 L40 24 Z M30 10 L46 10 L46 12 L30 12 Z M70 28 L71 16 L73 28 Z'],
    ['b', 'M92 38 L94 32 L104 32 L106 38 Z M101 33 L117 30 L117 32.5 L102 35.5 Z'],
    ['d', 'M28 28 L46 28 L46 33 L28 33 Z M86 40 L100 40 L100 43 L86 43 Z M8 44 L114 44 L113 46 L9 46 Z']] },
  fac: { box: 'side', parts: [
    ['b', 'M12 42 L112 42 L100 54 L24 54 Z'],
    ['b', 'M50 42 L54 30 L76 30 L80 42 Z M64 30 L65 18 L67 30 Z'],
    ['b', 'M24 42 L26 34 L44 30 L46 38 Z'],
    ['d', 'M57 33 L74 33 L74 37 L57 37 Z']] },
  frigate: { box: 'side', parts: [
    ['b', 'M3 39 L117 39 L106 54 L15 54 Z'],
    ['b', 'M28 39 L32 25 L74 25 L78 39 Z'],
    ['b', 'M50 25 L53 5 L56 25 Z M44 11 L62 11 L62 13 L44 13 Z'],
    ['b', 'M86 39 L88 33 L98 33 L100 39 Z M96 34 L113 31 L113 33.5 L97 36.5 Z'],
    ['d', 'M36 29 L48 29 L48 33 L36 33 Z M58 29 L70 29 L70 33 L58 33 Z'],
    ['d', 'M8 44 L112 44 L111 46 L9 46 Z']] },
};

const ART_BOX = { plan: [100, 100], side: [120, 60] };

// --- DOM ------------------------------------------------------------------
function artSVG(key, color = 'var(--hud)', cls = '') {
  const A = ART[key];
  if (!A) return '';
  const [w, h] = ART_BOX[A.box];
  const body = A.parts.map(([t, d]) => {
    if (t === 'b') return `<path d="${d}" fill="${color}"/>`;
    if (t === 'd') return `<path d="${d}" fill="rgba(0,0,0,.5)" stroke="rgba(0,0,0,.5)" stroke-width="1"/>`;
    if (t === 'c') return `<path d="${d}" fill="rgba(235,255,250,.55)"/>`;
    if (t === 's') return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="3 4"/>`;
  }).join('');
  return `<svg class="art ${A.box} ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
}

// --- Canvas ---------------------------------------------------------------
const _artCache = {};
function artPaths(key) {
  if (!_artCache[key]) _artCache[key] = ART[key].parts.map(([t, d]) => [t, new Path2D(d)]);
  return _artCache[key];
}

// Draws art centered at (x, y). size = rendered width in px. rot in degrees (planforms only).
function drawArt(ctx, key, x, y, size, rot, color, opts = {}) {
  const A = ART[key];
  if (!A) return;
  const [w, h] = ART_BOX[A.box];
  const k = size / w;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot * DEG);
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  const lw = 1 / k;
  for (const [t, p] of artPaths(key)) {
    if (t === 'r') {
      if (opts.rotor === false) continue;
      ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = lw; ctx.stroke(p); ctx.globalAlpha = 1;
    } else if (t === 'b') {
      ctx.lineWidth = lw * 2.4; ctx.strokeStyle = opts.outline || 'rgba(3,10,12,0.9)'; ctx.stroke(p);
      ctx.fillStyle = color; ctx.fill(p);
    } else if (t === 'd') { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(p); }
    else if (t === 'c') { ctx.fillStyle = 'rgba(235,255,250,0.6)'; ctx.fill(p); }
    else if (t === 's') { ctx.strokeStyle = color; ctx.lineWidth = lw * 1.6; ctx.stroke(p); }
  }
  ctx.restore();
}

// Which art each entity uses
const AC_ART = { fa18: 'ea18g', f16: 'f16', a10: 'a10', ah64: 'ah64', uh60: 'uh60', mq9: 'mq9', f15e: 'f15e', ea18g: 'ea18g', f35: 'f35', f22: 'f22', b52: 'b52', b1b: 'b1b', b2: 'b2' };
const UNIT_ART = { inf: 'inf', technical: 'technical', ifv: 'ifv', mbt: 'mbt', arty: 'arty', aaa: 'aaa', manpad: 'manpad', shorad: 'shorad', sam_lr: 'sam_lr', radar: 'radar', hq: 'hq', airfield: 'airfield', frigate: 'frigate', destroyer: 'destroyer', fac: 'fac' };
