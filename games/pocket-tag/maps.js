// Pocket Tag maps. Built with a tiny drawing DSL (left half + mirror) so every map is symmetrical and fair,
// then exported as plain ASCII rows. Tile legend:
//   #  wall            . floor            =  deck / bridge (floor)
//   b  low obstacle    (bench, crate, vent) - vault or jump over it
//   o  overhead        (tunnel, pipe, shutter) - slide underneath it
//   ~  water           (slows you down; jump across to keep your speed)
//   _  gap             (rooftop gap, fall = respawn)
//   > < ^ v            conveyor / slide / escalator (pushes you that way)
//   1 2 3 4            ramp east / south / west / north (launches you into the air)
//   S  spawn point     P  power-up spot
export const TILE = 32;

const FLIP = { '>': '<', '<': '>', '1': '3', '3': '1' };

function draw(W, H, fn, mirror = true) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const A = {
    W, H,
    set(x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) A.set(x + i, y + j, c); },
    box(x, y, w, h, c) { A.rect(x, y, w, 1, c); A.rect(x, y + h - 1, w, 1, c); A.rect(x, y, 1, h, c); A.rect(x + w - 1, y, 1, h, c); },
    hline(x, y, w, c) { A.rect(x, y, w, 1, c); },
    vline(x, y, h, c) { A.rect(x, y, 1, h, c); },
  };
  fn(A);
  if (mirror) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) { const c = g[y][x]; g[y][W - 1 - x] = FLIP[c] || c; }
  }
  return g.map((r) => r.join(''));
}

const W = 40, H = 24;

// ------------------------------------------------------------------ PLAYGROUND
const playground = draw(W, H, (A) => {
  A.rect(14, 14, 6, 8, '=');                       // wooden deck
  A.hline(3, 3, 8, '>');                           // top slide (fast lane toward the middle)
  A.vline(2, 8, 8, 'v');                           // left slide
  A.rect(7, 8, 2, 1, 'b'); A.rect(7, 15, 2, 1, 'b'); A.vline(12, 10, 3, 'b'); // benches
  A.box(11, 5, 5, 5, 'b'); A.set(13, 5, '.'); A.set(13, 9, '.'); A.set(13, 7, 'o'); // climbing frame (two doors, bar in the middle)
  A.rect(4, 18, 7, 1, '#'); A.rect(4, 20, 7, 1, '#'); A.rect(4, 19, 7, 1, 'o');     // tunnel
  A.rect(8, 11, 2, 2, '#');                        // pillar
  A.rect(17, 17, 2, 2, 'b');
  for (const [x, y] of [[2, 2], [2, 21], [6, 12], [16, 2]]) A.set(x, y, 'S');
  for (const [x, y] of [[9, 6], [16, 12], [10, 16]]) A.set(x, y, 'P');
  A.box(0, 0, W, H, '#');
});

// ------------------------------------------------------------------ ROOFTOP
const rooftop = draw(W, H, (A) => {
  A.rect(0, 0, W, H, '_');
  A.rect(1, 1, 8, 8, '.');          // top-left roof
  A.rect(1, 15, 8, 8, '.');         // bottom-left roof
  A.rect(12, 1, 8, 4, '.');         // top-centre roof (mirrors to 12..27)
  A.rect(12, 19, 8, 4, '.');        // bottom-centre roof
  A.rect(11, 7, 9, 10, '.');        // big centre roof
  // bridges / planks
  A.hline(9, 1, 3, '=');            // TL -> T
  A.hline(9, 8, 2, '=');            // TL -> C
  A.hline(9, 15, 2, '=');           // C -> BL
  A.rect(2, 9, 2, 6, '=');          // TL -> BL walkway (narrow!)
  A.rect(15, 5, 2, 2, '='); A.rect(18, 5, 2, 2, '=');   // T -> C
  A.rect(15, 17, 2, 2, '='); A.rect(18, 17, 2, 2, '=');  // C -> B
  // ramps launch you across 2-3 tile gaps
  A.set(8, 3, '1'); A.set(8, 20, '1');
  A.set(18, 4, '2'); A.set(13, 19, '4');
  // vents (low) and pipes (overhead)
  for (const [x, y] of [[4, 3], [5, 3], [6, 6], [3, 19], [4, 19], [13, 9], [13, 14], [17, 12], [16, 12]]) A.set(x, y, 'b');
  A.rect(14, 11, 2, 1, 'o');
  for (const [x, y] of [[2, 2], [2, 21], [13, 2], [13, 21]]) A.set(x, y, 'S');
  for (const [x, y] of [[5, 5], [14, 12], [15, 20]]) A.set(x, y, 'P');
  A.box(0, 0, W, H, '#');
});

// ------------------------------------------------------------------ NEON MALL
const mall = draw(W, H, (A) => {
  A.box(1, 5, 8, 6, '#'); A.set(8, 7, '.'); A.set(8, 8, '.'); A.set(4, 10, 'o'); // store 1 (door east, shutter south)
  A.rect(3, 7, 2, 1, 'b');
  A.box(1, 13, 8, 6, '#'); A.set(8, 15, '.'); A.set(8, 16, '.'); A.set(4, 13, 'o'); // store 2
  A.rect(3, 16, 2, 1, 'b');
  A.vline(10, 4, 16, 'v');                          // down escalator
  A.vline(12, 4, 16, '^');                          // up escalator
  for (const y of [6, 9, 12, 15, 18]) A.set(11, y, 'b'); // benches between the escalators
  A.box(16, 9, 4, 6, 'b'); A.set(19, 11, '.'); A.set(19, 12, '.');         // fountain ring (openings toward the middle)
  A.hline(3, 2, 6, '>');                            // upper hall moving walkway
  A.hline(3, 21, 6, '>');                           // lower hall moving walkway
  A.rect(14, 4, 1, 2, '#'); A.rect(14, 18, 1, 2, '#');
  A.set(15, 6, 'b'); A.set(15, 17, 'b');
  A.rect(6, 4, 3, 1, 'b');
  for (const [x, y] of [[2, 2], [2, 21], [5, 8], [16, 6]]) A.set(x, y, 'S');
  for (const [x, y] of [[9, 3], [14, 12], [9, 20]]) A.set(x, y, 'P');
  A.box(0, 0, W, H, '#');
});

// ------------------------------------------------------------------ WATER PARK
const waterpark = draw(W, H, (A) => {
  A.rect(5, 5, 8, 6, '~'); A.rect(5, 13, 8, 6, '~');           // pools
  A.rect(14, 8, 6, 8, '~');                                     // lazy pool (centre, mirrors wider)
  A.rect(8, 7, 2, 2, '='); A.rect(8, 15, 2, 2, '=');            // islands
  A.hline(13, 11, 7, '='); A.hline(13, 12, 7, '=');             // centre bridge
  A.vline(19, 8, 8, '='); A.vline(18, 8, 8, '=');               // cross bridge
  A.hline(13, 3, 7, '>');                                        // top fast route
  A.hline(13, 20, 7, '>');                                       // bottom fast route
  A.vline(2, 3, 10, 'v');                                        // water slide down the left edge
  A.vline(3, 3, 10, 'v');
  A.set(2, 13, '1'); A.set(3, 13, '1');                          // slide end jumps into the pool
  A.rect(3, 20, 6, 1, 'o'); A.rect(3, 19, 6, 1, '#'); A.rect(3, 21, 6, 1, '#');  // slide tube
  for (const [x, y] of [[6, 3], [9, 3], [6, 12], [14, 5], [14, 18], [16, 6]]) A.set(x, y, 'b');  // loungers
  A.rect(15, 1, 2, 1, '#'); A.rect(15, 22, 2, 1, '#');
  for (const [x, y] of [[2, 1], [2, 22], [9, 12], [16, 3]]) A.set(x, y, 'S');
  for (const [x, y] of [[8, 8], [8, 16], [12, 12]]) A.set(x, y, 'P');
  A.box(0, 0, W, H, '#');
});

export const MAPS = [
  { id: 'playground', name: 'Playground', blurb: 'Slides, benches, tunnels and a climbing frame.', rows: playground, theme: { floor: ['#43b86b', '#3ca862'], floor2: '#d9b36a', wall: '#7a4bd1', wallTop: '#a77bff', low: '#ff8a3d', over: '#ff3cac', water: '#2b7bff', sky: '#173a2c', accent: '#5dff8f' } },
  { id: 'rooftop', name: 'Rooftop', blurb: 'Ramps, vents and short jumps. Mind the gaps.', rows: rooftop, theme: { floor: ['#56596f', '#4d5066'], floor2: '#8a8da6', wall: '#2a2d47', wallTop: '#454a74', low: '#ffb347', over: '#ff3cac', water: '#2b7bff', sky: '#0a0b22', accent: '#ffb347' } },
  { id: 'mall', name: 'Neon Mall', blurb: 'Escalators, stores and a big middle.', rows: mall, theme: { floor: ['#2b2457', '#322a63'], floor2: '#4b3f8f', wall: '#1a1540', wallTop: '#ff3cac', low: '#2de2e6', over: '#ffe14d', water: '#2b7bff', sky: '#10092a', accent: '#ff3cac' } },
  { id: 'waterpark', name: 'Water Park', blurb: 'Pools slow you down. Bridges and slides are fast.', rows: waterpark, theme: { floor: ['#f1d9a0', '#ebd096'], floor2: '#c9a15a', wall: '#1d7fb5', wallTop: '#46c8ff', low: '#ff6b6b', over: '#b266ff', water: '#2aa9ff', sky: '#0b2b4d', accent: '#46c8ff' } },
].map((m) => ({ ...m, w: m.rows[0].length, h: m.rows.length }));

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

const SOLID = new Set(['#']);
/** Tile character at tile coordinates (outside the map counts as wall). */
export function tileAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return '#';
  return map.rows[ty][tx];
}

/** Parse markers into spawn / pickup lists (in pixels) and turn marker tiles into plain floor. */
export function prepareMap(def) {
  const rows = def.rows.map((r) => r.replace(/[SP]/g, '.'));
  const spawns = [], pickups = [];
  def.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { if (r[x] === 'S') spawns.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }); if (r[x] === 'P') pickups.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }); } });
  return { ...def, rows, spawns, pickups, px: def.w * TILE, py: def.h * TILE };
}

/** Walkability for navigation / validation: walls, gaps and ramps are not walked (ramps launch you). */
export const walkableForNav = (ch, { slide = false } = {}) => !(SOLID.has(ch) || ch === '_' || ch === '1' || ch === '2' || ch === '3' || ch === '4' || (ch === 'o' && !slide));

/** Reachability report used by the tests: every spawn and power-up spot must be connected. */
export function analyzeMap(def) {
  const m = prepareMap(def);
  const seen = new Set();
  const key = (x, y) => y * m.w + x;
  const start = m.spawns[0];
  const q = [[Math.floor(start.x / TILE), Math.floor(start.y / TILE)]];
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen.has(key(nx, ny))) continue;
      if (!walkableForNav(m.rows[ny][nx], { slide: true })) continue;
      seen.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  const reach = (p) => seen.has(key(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
  let floor = 0, connected = 0;
  m.rows.forEach((r, y) => { for (let x = 0; x < m.w; x++) if (walkableForNav(r[x], { slide: true })) { floor++; if (seen.has(key(x, y))) connected++; } });
  return {
    spawns: m.spawns.length, pickups: m.pickups.length,
    spawnsConnected: m.spawns.every(reach), pickupsConnected: m.pickups.every(reach),
    floor, connected, equalRows: m.rows.every((r) => r.length === m.w),
  };
}
