// Drift Circuit tracks. Each loop is generated from a polar function r(θ), which can never cross
// itself, then resampled to evenly spaced points. Checkpoints, obstacles, boost pads and a shortcut
// are placed along the loop by fraction of its length.
const TAU = Math.PI * 2;
export const SPACING = 14;

export const TRACK_DEFS = [
  {
    id: 'neon', name: 'Neon City', laps: 3, width: 170, cx: 2500, cy: 1600, a: 2000, b: 1240,
    r: (t) => 1 + 0.10 * Math.cos(2 * t + 0.3) + 0.06 * Math.cos(3 * t),
    theme: { ground: '#0b0f2e', grid: 'rgba(45,226,230,.10)', road: '#1b1f3f', edgeA: '#2de2e6', edgeB: '#ff3cac', line: 'rgba(255,255,255,.35)', grass: 'rgba(20,28,80,.9)', decor: 'city' },
    medals: { gold: 62000, silver: 72000, bronze: 87000 },
    pads: [0.08, 0.30, 0.66, 0.85], cut: { from: 0.40, to: 0.55, bulge: 0 },
    cones: [[0.18, -0.5], [0.18, 0.5], [0.33, 0], [0.52, -0.6], [0.52, 0.6], [0.66, 0.2], [0.88, -0.4], [0.88, 0.4]],
  },
  {
    id: 'sunset', name: 'Sunset Coast', laps: 3, width: 162, cx: 2500, cy: 1600, a: 2040, b: 1280,
    r: (t) => 1 + 0.15 * Math.cos(3 * t) + 0.08 * Math.sin(2 * t) + 0.035 * Math.cos(5 * t),
    theme: { ground: '#f2a65a', grid: 'rgba(255,255,255,.06)', road: '#3a2a4a', edgeA: '#ffe14d', edgeB: '#ff5f7a', line: 'rgba(255,255,255,.45)', grass: 'rgba(230,150,80,.9)', decor: 'coast' },
    medals: { gold: 65000, silver: 75000, bronze: 91000 },
    pads: [0.12, 0.36, 0.72, 0.9], cut: { from: 0.505, to: 0.625, bulge: 0 },
    cones: [[0.10, 0.5], [0.22, -0.55], [0.22, 0.55], [0.38, 0], [0.47, -0.5], [0.60, 0.55], [0.70, -0.3], [0.90, 0.4], [0.90, -0.4]],
  },
  {
    id: 'midnight', name: 'Midnight Circuit', laps: 3, width: 150, cx: 2500, cy: 1600, a: 2120, b: 1300,
    r: (t) => 1 + 0.13 * Math.cos(4 * t) + 0.11 * Math.sin(3 * t + 1) + 0.04 * Math.cos(6 * t),
    theme: { ground: '#06130f', grid: 'rgba(93,255,143,.07)', road: '#17201c', edgeA: '#5dff8f', edgeB: '#8b5cff', line: 'rgba(255,255,255,.3)', grass: 'rgba(8,40,28,.92)', decor: 'forest' },
    medals: { gold: 71000, silver: 83000, bronze: 100000 },
    pads: [0.05, 0.24, 0.62, 0.9], cut: { from: 0.43, to: 0.55, bulge: 0 },
    cones: [[0.14, 0], [0.27, -0.5], [0.27, 0.5], [0.45, 0.4], [0.57, -0.5], [0.57, 0.5], [0.72, 0], [0.84, -0.45], [0.84, 0.45], [0.96, 0.3]],
  },
];

/** Build runtime geometry for a track definition. */
export function buildTrack(def) {
  // sample the polar curve densely, then resample evenly by arc length
  const dense = [];
  const M = 2400;
  for (let i = 0; i < M; i++) {
    const t = (i / M) * TAU;
    const r = def.r(t);
    dense.push({ x: def.cx + def.a * r * Math.cos(t), y: def.cy + def.b * r * Math.sin(t) });
  }
  let total = 0;
  const cum = [0];
  for (let i = 1; i <= M; i++) { const p = dense[i % M], q = dense[i - 1]; total += Math.hypot(p.x - q.x, p.y - q.y); cum.push(total); }
  const N = Math.round(total / SPACING);
  const step = total / N;
  const pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const p = dense[j % M], q = dense[(j + 1) % M];
    pts.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  }
  // tangents
  const tan = pts.map((p, i) => { const q = pts[(i + 1) % N], o = pts[(i - 1 + N) % N]; const dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; });
  const half = def.width / 2;
  const at = (frac) => { const i = ((Math.round(frac * N) % N) + N) % N; return i; };
  const lateral = (i, off) => ({ x: pts[i].x - tan[i].y * off * half, y: pts[i].y + tan[i].x * off * half });

  // checkpoints (6 gates) + start/finish at index 0
  const cps = [];
  for (let k = 1; k <= 5; k++) cps.push(Math.round((k / 6) * N));
  // shortcut: a gently curved dirt chord between two points of the loop
  const ci = at(def.cut.from), cj = at(def.cut.to);
  const A = pts[ci], B = pts[cj];
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const cut = [];
  const CUT_STEPS = Math.max(6, Math.round(Math.hypot(B.x - A.x, B.y - A.y) / SPACING));
  // the chord pulls slightly toward the loop centre so it is really shorter than the road
  for (let k = 0; k <= CUT_STEPS; k++) { const f = k / CUT_STEPS; cut.push({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f }); }
  void mx; void my;
  const cutWidth = def.width * 0.7;

  const cones = def.cones.map(([f, off], n) => { const i = at(f); const p = lateral(i, off); return { id: n, x: p.x, y: p.y, r: 13, hit: false, vx: 0, vy: 0, rot: 0 }; });
  const pads = def.pads.map((f) => { const i = at(f); return { i, x: pts[i].x, y: pts[i].y, dir: tan[i], w: def.width * 0.55 }; });

  const track = { def, pts, tan, N, step, total, half, cps, cut, cutWidth, cones, pads, lap: def.laps, start: { i: N - 6 } };
  const sp = pts[track.start.i], st = tan[track.start.i];
  track.startPose = { x: sp.x, y: sp.y, a: Math.atan2(st.y, st.x) };
  track.grassW = 80;
  return track;
}

/** Nearest point on the main loop. hint = previous index for a fast local search. */
export function nearest(track, x, y, hint = -1) {
  const { pts, N } = track;
  let best = -1, bd = Infinity;
  const test = (i) => { const p = pts[i]; const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = i; } };
  if (hint >= 0) {
    for (let k = -40; k <= 40; k++) test((hint + k + N * 2) % N);
    if (bd < (track.half + track.grassW) * (track.half + track.grassW) * 1.5) return { i: best, d: Math.sqrt(bd) };
    bd = Infinity;
  }
  for (let i = 0; i < N; i++) test(i);
  return { i: best, d: Math.sqrt(bd) };
}

function distToCut(track, x, y) {
  const c = track.cut;
  let bd = Infinity, bx = 0, by = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i], b = c[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; bx = px; by = py; }
  }
  return { d: bd, x: bx, y: by };
}

/**
 * Surface at a point: { surface: 'road'|'dirt'|'grass'|'wall', nx, ny (towards the road), idx, dist }
 */
export function surfaceAt(track, x, y, hint = -1) {
  const n = nearest(track, x, y, hint);
  const p = track.pts[n.i];
  const cutHit = distToCut(track, x, y);
  const onRoad = n.d <= track.half;
  const onCut = cutHit.d <= track.cutWidth / 2;
  let surface;
  if (onRoad) surface = 'road';
  else if (onCut) surface = 'dirt';
  else if (n.d <= track.half + track.grassW || cutHit.d <= track.cutWidth / 2 + track.grassW) surface = 'grass';
  else surface = 'wall';
  // direction back toward the nearest drivable point (for wall bounces)
  let nx = p.x - x, ny = p.y - y;
  const l = Math.hypot(nx, ny) || 1;
  if (cutHit.d < n.d) { nx = cutHit.x - x; ny = cutHit.y - y; }
  const l2 = Math.hypot(nx, ny) || 1;
  return { surface, nx: nx / l2, ny: ny / l2, idx: n.i, dist: n.d, cutDist: cutHit.d, l };
}
