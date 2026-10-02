// ============================================================================
// Geo + misc helpers. Positions are plain {lat, lng} objects, distances in km.
// ============================================================================
const DEG = Math.PI / 180;
const EARTH_R = 6371;

function dist(a, b) {
  const dLat = (b.lat - a.lat) * DEG, dLng = (b.lng - a.lng) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearing(a, b) {
  const p1 = a.lat * DEG, p2 = b.lat * DEG, dl = (b.lng - a.lng) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

function dest(p, brg, d) {
  const delta = d / EARTH_R, th = brg * DEG, p1 = p.lat * DEG, l1 = p.lng * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(delta) + Math.cos(p1) * Math.sin(delta) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(delta) * Math.cos(p1), Math.cos(delta) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lng: ((l2 / DEG + 540) % 360) - 180 };
}

function angDiff(a, b) { return ((b - a + 540) % 360) - 180; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function cp(p) { return { lat: p.lat, lng: p.lng }; }

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
function fmtMoney(m) {
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  if (Math.abs(m) >= 10) return `$${Math.round(m)}M`;
  return `$${m.toFixed(1)}M`;
}
function fmtKm(k) { return k >= 1000 ? `${(k / 1000).toFixed(1)}k km` : `${Math.round(k)} km`; }

// Ray-cast point-in-polygon on lat/lng arrays [[lat,lng],...]
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if ((yi > pt.lat) !== (yj > pt.lat) && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
