// ============================================================================
// SKYWARD COMMAND — land / water lookups and sea routing
// Masks are generated offline by tools/build_water.py (Natural Earth data).
// ============================================================================
const Terrain = (() => {
  function decode(g) {
    const bin = atob(g.b), bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
    return { ...g, bits };
  }
  const zones = {};
  for (const [k, g] of Object.entries(WATER_DATA.zones)) zones[k] = decode(g);
  const world = decode(WATER_DATA.world);
  const bit = (g, i) => (g.bits[i >> 3] >> (i & 7)) & 1;

  function sample(g, pos) {
    if (pos.lng < g.lng0 || pos.lng > g.lng1 || pos.lat < g.lat0 || pos.lat > g.lat1) return null;
    const x = Math.min(g.w - 1, Math.floor(((pos.lng - g.lng0) / (g.lng1 - g.lng0)) * g.w));
    const y = Math.min(g.h - 1, Math.floor(((g.lat1 - pos.lat) / (g.lat1 - g.lat0)) * g.h));
    return bit(g, y * g.w + x);
  }

  // Fine zone grids first (accurate coastlines and lakes), coarse world grid as fallback
  function isWater(pos, defId) {
    if (defId && zones[defId]) { const v = sample(zones[defId], pos); if (v !== null) return v === 1; }
    for (const g of Object.values(zones)) { const v = sample(g, pos); if (v !== null) return v === 1; }
    return sample(world, pos) === 1;
  }

  function waterFraction(defId) {
    const g = zones[defId];
    if (!g) return 0;
    let n = 0;
    for (let i = 0; i < g.w * g.h; i++) n += bit(g, i);
    return n / (g.w * g.h);
  }

  // Is there land within `km` of a water point? (amphibious units hug the coast)
  function nearLand(pos, km, defId) {
    for (let b = 0; b < 360; b += 45) if (!isWater(dest(pos, b, km), defId)) return true;
    return false;
  }

  // ---------------- sea routing on the 0.5 degree world grid (A*) ----------------
  const W = world.w, H = world.h;
  const cellOf = p => [clamp(Math.floor((p.lng + 180) / 0.5), 0, W - 1), clamp(Math.floor((90 - p.lat) / 0.5), 0, H - 1)];

  // Narrow straits and canals vanish at 0.5 degree resolution; carve them back in so carriers can
  // pass Gibraltar, the Turkish straits, Suez, Bab-el-Mandeb, Hormuz, the Danish straits and Kerch.
  const CHANNELS = [
    [[35.9, -7.0], [36.0, -5.5], [36.2, -4.0]],
    [[39.6, 25.8], [40.2, 26.4], [40.7, 27.6], [40.9, 28.9], [41.2, 29.1], [41.6, 29.4]],
    [[31.6, 32.3], [30.6, 32.35], [30.0, 32.55], [29.5, 32.6], [28.2, 33.3], [27.4, 34.1]],
    [[13.2, 42.9], [12.6, 43.4], [11.9, 44.2]],
    [[25.8, 55.0], [26.5, 56.3], [25.6, 57.6]],
    [[57.8, 10.4], [56.8, 11.6], [55.9, 12.6], [55.2, 12.9], [54.8, 13.5]],
    [[45.0, 36.3], [45.4, 36.6], [45.8, 36.9]],
    [[49.8, -3.5], [50.6, 0.5], [51.1, 1.6], [51.6, 2.4]],
  ];
  for (const line of CHANNELS) {
    for (let i = 1; i < line.length; i++) {
      const a = { lat: line[i - 1][0], lng: line[i - 1][1] }, b = { lat: line[i][0], lng: line[i][1] };
      const steps = Math.ceil(dist(a, b) / 15);
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, [x, y] = cellOf({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) { // 2-cell wide so diagonal steps stay legal
          const j = Math.min(H - 1, y + oy) * W + Math.min(W - 1, x + ox);
          world.bits[j >> 3] |= 1 << (j & 7);
        }
      }
    }
  }
  const centre = (x, y) => ({ lat: 90 - (y + 0.5) * 0.5, lng: -180 + (x + 0.5) * 0.5 });
  const sea = (x, y) => x >= 0 && y >= 0 && x < W && y < H && bit(world, y * W + x) === 1;

  function nearestSea(x, y, maxR = 6) {
    if (sea(x, y)) return [x, y];
    for (let r = 1; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if ((Math.abs(dx) === r || Math.abs(dy) === r) && sea(x + dx, y + dy)) return [x + dx, y + dy];
    return null;
  }

  // Returns an array of waypoints from `from` to `to` over water, or null if unreachable
  function route(from, to) {
    let [sx, sy] = cellOf(from);
    const s0 = nearestSea(sx, sy, 3);
    const t0 = nearestSea(...cellOf(to), 4);
    if (!s0 || !t0) return null;
    [sx, sy] = s0;
    const [tx, ty] = t0;
    const N = W * H, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // [f, idx]
    const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const kmX = y => 55.6 * Math.cos(((90 - (y + 0.5) * 0.5) * Math.PI) / 180) + 0.5; // km per cell in x at row y
    const h = (x, y) => Math.hypot((x - tx) * kmX(y), (y - ty) * 55.6);
    const start = sy * W + sx, goal = ty * W + tx;
    g[start] = 0; push(h(sx, sy), start);
    let iter = 0;
    while (heap.length && iter++ < 400000) {
      const [, i] = pop();
      if (i === goal) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!sea(nx, ny)) continue;
        if (dx && dy && (!sea(x + dx, y) || !sea(x, y + dy))) continue; // no corner cutting past land
        const j = ny * W + nx;
        if (closed[j]) continue;
        const ng = g[i] + Math.hypot(dx * kmX(y), dy * 55.6);
        if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + h(nx, ny), j); }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    // string-pull: keep only the waypoints needed to stay over water
    const clear = (a, b) => {
      const pa = centre(a % W, (a / W) | 0), pb = centre(b % W, (b / W) | 0), steps = Math.ceil(dist(pa, pb) / 8);
      for (let k = 1; k < steps; k++) {
        const t = k / steps, [cx, cy] = cellOf({ lat: pa.lat + (pb.lat - pa.lat) * t, lng: pa.lng + (pb.lng - pa.lng) * t });
        if (!sea(cx, cy)) return false;
      }
      return true;
    };
    const pts = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      for (let k = cells.length - 1; k > anchor + 1; k--) if (clear(cells[anchor], cells[k])) { far = k; break; }
      pts.push(centre(cells[far] % W, (cells[far] / W) | 0));
      anchor = far;
    }
    if (isWater(to) && (!pts.length || dist(pts[pts.length - 1], to) > 1)) pts.push(cp(to));
    return pts;
  }

  return { isWater, waterFraction, nearLand, route, seaAt: p => { const [x, y] = cellOf(p); return sea(x, y); } };
})();
