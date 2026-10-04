// Pocket Tag bots: grid pathfinding, chasing and fleeing with human-like limits.
// Bots only ever produce the same inputs a player could (direction, sprint, dash, slide) and use the same
// stamina and cooldowns. Difficulty changes reaction time, accuracy, mistakes and ability usage, nothing else.
import { TILE } from './maps.js';

export const DIFFICULTIES = {
  easy: { label: 'Easy', think: 0.62, react: 0.85, speed: 0.82, mistake: 0.2, dash: 0.0, sprintAt: 0.55, predict: 0, slide: false, pick: 0.2 },
  normal: { label: 'Normal', think: 0.42, react: 0.5, speed: 0.93, mistake: 0.08, dash: 0.35, sprintAt: 0.3, predict: 0.12, slide: false, pick: 0.5 },
  hard: { label: 'Hard', think: 0.26, react: 0.3, speed: 1.0, mistake: 0.025, dash: 0.7, sprintAt: 0.18, predict: 0.28, slide: true, pick: 0.8 },
};

const INF = 1e9;

export function buildNav(map) {
  const { w, h } = map;
  const cost = new Float32Array(w * h), costS = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map.rows[y][x];
      let c = 1;
      if (ch === '#' || ch === '_' || ch === '1' || ch === '2' || ch === '3' || ch === '4') c = INF;
      else if (ch === '~') c = 2.2;
      else if (ch === 'b') c = 1.6;
      cost[y * w + x] = c;
      costS[y * w + x] = ch === 'o' ? 2.4 : c;
    }
  }
  // tiles right next to walls/gaps are slightly more expensive so paths hug the middle of corridors
  const pad = (arr) => {
    const out = Float32Array.from(arr);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (arr[i] >= INF) continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (arr[(y + dy) * w + x + dx] >= INF) near++;
      if (near) out[i] += 0.25 * Math.min(near, 3);
    }
    return out;
  };
  const conv = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = map.rows[y][x]; conv[y * w + x] = ch === '>' ? 1 : ch === '<' ? 2 : ch === '^' ? 3 : ch === 'v' ? 4 : 0; }
  const gap = new Uint8Array(w * h);
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (map.rows[y][x] === '_') { gap[y * w + x] = 1; any = true; }
  return { w, h, N: w * h, cost: pad(cost), costS: pad(costS), raw: cost, gap: any ? gap : null, conv };
}

// binary min-heap on typed arrays (no allocation while searching)
const HK = new Float32Array(8192), HV = new Int32Array(8192);
let hn = 0;
function hpush(c, v) {
  let k = hn++;
  while (k > 0) { const p = (k - 1) >> 1; if (HK[p] <= c) break; HK[k] = HK[p]; HV[k] = HV[p]; k = p; }
  HK[k] = c; HV[k] = v;
}
function hpop() {
  const topV = HV[0];
  hn--;
  if (hn > 0) {
    const c = HK[hn], v = HV[hn];
    let k = 0;
    for (;;) {
      let m = 2 * k + 1;
      if (m >= hn) break;
      if (m + 1 < hn && HK[m + 1] < HK[m]) m++;
      if (HK[m] >= c) break;
      HK[k] = HK[m]; HV[k] = HV[m]; k = m;
    }
    HK[k] = c; HV[k] = v;
  }
  return topV;
}

/** Moving with a conveyor is cheap, against it is expensive (a bot would run on the spot). */
const CONV = [null, [1, 0], [-1, 0], [0, -1], [0, 1]];
const convFactor = (nav, j, dx, dy) => { const c = nav.conv[j]; if (!c) return 1; const d = CONV[c]; const dot = dx * d[0] + dy * d[1]; return dot > 0 ? 0.6 : dot < 0 ? 3.5 : 1; };

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

/**
 * Multi-source Dijkstra over the tile grid (8-way, no corner cutting). Returns { dist, prev }.
 * Pass `out` ({ dist, prev } typed arrays) to reuse memory.
 */
export function dijkstra(nav, sources, maxCost = 60, slide = false, out = null) {
  const { w, h, N } = nav;
  const cost = slide ? nav.costS : nav.cost;
  const dist = out ? out.dist.fill(INF) : new Float32Array(N).fill(INF);
  const prev = out ? out.prev.fill(-1) : new Int32Array(N).fill(-1);
  hn = 0;
  for (const s of sources) { if (s >= 0 && s < N) { dist[s] = 0; hpush(0, s); } }
  while (hn > 0) {
    const i = hpop();
    const d = dist[i];
    // stale heap entries are skipped by comparing against the stored distance
    if (d > maxCost) break;
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nb = NB[k], nx = x + nb[0], ny = y + nb[1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, c = cost[j];
      if (c >= INF) continue;
      if (nb[0] && nb[1] && (cost[y * w + nx] >= INF || cost[ny * w + x] >= INF)) continue;
      const nd = d + c * nb[2] * convFactor(nav, j, nb[0], nb[1]);
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; if (hn < 8190) hpush(nd, j); }
    }
  }
  return { dist, prev };
}

/** Dijkstra relaxation of an arbitrary starting value per tile (used for the "safety map"). */
function relax(nav, init, out) {
  const { w, h, N } = nav;
  const cost = nav.cost;
  const dist = out.dist;
  dist.set(init);
  hn = 0;
  for (let i = 0; i < N; i++) if (dist[i] < INF * 0.5) hpush(dist[i], i);
  while (hn > 0) {
    const i = hpop();
    const d = dist[i];
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nb = NB[k], nx = x + nb[0], ny = y + nb[1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, c = cost[j];
      if (c >= INF) continue;
      if (nb[0] && nb[1] && (cost[y * w + nx] >= INF || cost[ny * w + x] >= INF)) continue;
      const nd = d + c * nb[2] * convFactor(nav, j, nb[0], nb[1]);
      if (nd < dist[j]) { dist[j] = nd; if (hn < 8190) hpush(nd, j); }
    }
  }
  return dist;
}

const tileIdx = (nav, x, y) => Math.max(0, Math.min(nav.h - 1, Math.floor(y / TILE))) * nav.w + Math.max(0, Math.min(nav.w - 1, Math.floor(x / TILE)));
const centerOf = (nav, i) => ({ x: ((i % nav.w) + 0.5) * TILE, y: (((i / nav.w) | 0) + 0.5) * TILE });

/** Clear straight line between two points, keeping a small margin from walls and gaps. */
function los(w, nav, ax, ay, bx, by, slide) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  const nx = -dy / d * 9, ny = dx / d * 9;
  const cost = slide ? nav.costS : nav.cost;
  const steps = Math.ceil(d / 10);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, x = ax + dx * t, y = ay + dy * t;
    for (const o of [0, 1, -1]) {
      const px = x + nx * o, py = y + ny * o;
      if (cost[tileIdx(nav, px, py)] >= INF) return false;
    }
  }
  return true;
}

function threatField(w) {
  const t = w._threat;
  if (t && w.time - t.t < 0.25) return t.dist;
  const src = [];
  for (const q of w.players) {
    if (q.left || !w.isChaser(q) || q.frozen) continue;
    src.push(tileIdx(w.nav, q.x, q.y));
  }
  if (!w._threatBuf) w._threatBuf = { dist: new Float32Array(w.nav.N), prev: new Int32Array(w.nav.N) };
  const dist = src.length ? dijkstra(w.nav, src, 40, false, w._threatBuf).dist : null;
  w._threat = { t: w.time, dist };
  return dist;
}

/** Brogue-style safety map: runners descend it to flee, which sends them around loops instead of into corners. */
function safetyField(w) {
  const sf = w._safety;
  if (sf && w.time - sf.t < 0.25) return sf.val;
  const th = threatField(w);
  if (!th) { w._safety = { t: w.time, val: null }; return null; }
  const nav = w.nav;
  if (!w._safetyBuf) { w._safetyBuf = { dist: new Float32Array(nav.N), prev: new Int32Array(nav.N) }; w._safetyInit = new Float32Array(nav.N); }
  const init = w._safetyInit;
  for (let i = 0; i < nav.N; i++) init[i] = nav.cost[i] >= INF ? INF : -1.25 * Math.min(th[i], 40) + (nav.gap && nearGapTile(nav, i) ? 22 : 0);
  const val = relax(nav, init, w._safetyBuf);
  w._safety = { t: w.time, val };
  return val;
}

const rnd = (w) => Math.random();

/** Compute one bot's input for this step. Returns a (reused) input object. */
export function thinkBot(w, p, dt) {
  const b = p.bot;
  if (!b.inp) { b.inp = { mx: 0, my: 0, sprint: false, jump: false, slide: false, dash: false }; b.think = rnd() * 0.3; b.react = 0; b.role = null; b.path = []; b.hesitate = 0; b.dir = { x: 0, y: 0 }; b.target = -1; }
  const inp = b.inp;
  inp.jump = inp.slide = inp.dash = false;
  const P = DIFFICULTIES[b.diff] || DIFFICULTIES.normal;
  if (w.phase !== 'play' || p.frozen || p.falling > 0) { inp.mx = inp.my = 0; inp.sprint = false; return inp; }
  b.think -= dt; b.react -= dt; b.hesitate -= dt;
  const chaser = w.isChaser(p);
  const role = chaser ? 'chase' : 'flee';
  if (role !== b.role) { b.role = role; b.react = P.react * (0.8 + rnd() * 0.5); b.think = Math.max(b.think, b.react); }
  if (b.react > 0) { inp.sprint = false; return inp; }            // reaction time: keep doing what we were doing
  if (b.hesitate > 0) { inp.mx = inp.my = 0; inp.sprint = false; return inp; }

  const nav = w.nav, slide = P.slide;
  const here = tileIdx(nav, p.x, p.y);

  if (b.think <= 0) {
    b.think = P.think * (0.8 + rnd() * 0.5);
    if (rnd() < P.mistake) { b.hesitate = 0.25 + rnd() * 0.3; if (rnd() < 0.5) b.think += 0.3; }
    if (!w._scratch) w._scratch = { dist: new Float32Array(nav.N), prev: new Int32Array(nav.N) };
    const { dist, prev } = dijkstra(nav, [here], 36, slide, w._scratch);
    let goal = -1, goalKind = 'none';
    if (chaser) {
      let bestD = INF;
      for (const q of w.players) {
        if (q.left || q === p) continue;
        if (w.mode === 'crown' ? !q.crown : !w.isEvader(q)) continue;
        const i = tileIdx(nav, q.x, q.y);
        let d = dist[i];
        if (q.prot > 0) d += 6;                                   // prefer targets we can actually tag
        if (q.idx === p.lastBy && w.time - p.lastAt < 8) d += 14;  // don't just tag back the player who tagged us
        for (const o of w.players) if (o !== p && o.bot && o.bot.target === q.idx && o.bot.role === 'chase' && !o.left) d += w.mode === 'crown' ? 1 : 7; // spread out
        if (P.mistake > 0.1 && rnd() < 0.15) d += 8;                // easy bots sometimes chase the wrong person
        if (d < bestD) { bestD = d; goal = i; b.target = q.idx; }
      }
      goalKind = 'chase';
      if (goal >= 0 && P.predict > 0) {
        const q = w.players[b.target];
        const ax = q.x + q.vx * P.predict, ay = q.y + q.vy * P.predict;
        const gi = tileIdx(nav, ax, ay);
        if (dist[gi] < INF && los(w, nav, q.x, q.y, ax, ay, slide)) goal = gi;
      }
    } else {
      // fleeing (or freeze runner looking to rescue a teammate)
      const th = threatField(w);
      let rescue = -1;
      if (w.mode === 'freeze' && p.role === 'runner') {
        let bd = INF;
        for (const q of w.players) if (q.frozen && !q.left) { const i = tileIdx(nav, q.x, q.y); const danger = th ? th[i] : INF; if (dist[i] < bd && danger > 5) { bd = dist[i]; rescue = i; } }
        if (rescue >= 0 && (th ? th[here] : INF) < 4.5) rescue = -1;
      }
      let pickup = -1;
      if (w.powerups && rescue < 0) {
        let bd = 7;
        for (const k of w.pk) if (k.kind) { const i = tileIdx(nav, k.x, k.y); if (dist[i] < bd && (!th || th[i] > dist[i] + 2) && rnd() < P.pick) { bd = dist[i]; pickup = i; } }
      }
      if (rescue >= 0) { goal = rescue; goalKind = 'rescue'; }
      else if (th && th[here] < 22) {
        const sv = safetyField(w);
        // walk downhill on the safety map for a few tiles
        let cur = here;
        const path = [];
        for (let step = 0; step < 6; step++) {
          const x = cur % nav.w, y = (cur / nav.w) | 0;
          let best = -1, bv = sv[cur] - 0.05, second = -1, sv2 = INF;
          for (let k = 0; k < 8; k++) {
            const nx = x + NB[k][0], ny = y + NB[k][1];
            if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) continue;
            const j = ny * nav.w + nx;
            if (nav.cost[j] >= INF) continue;
            if (NB[k][0] && NB[k][1] && (nav.cost[y * nav.w + nx] >= INF || nav.cost[ny * nav.w + x] >= INF)) continue;
            const v = sv[j] + (nav.cost[j] > 1.5 ? 0.6 : 0);
            if (v < bv) { second = best; sv2 = bv; bv = v; best = j; } else if (v < sv2) { sv2 = v; second = j; }
          }
          if (best < 0) break;
          if (step === 0 && second >= 0 && rnd() < P.mistake) best = second;      // an occasional bad read
          path.push(best); cur = best;
        }
        if (path.length) { goal = path[path.length - 1]; goalKind = 'flee'; b.fleePath = path; }
        else { goal = -1; goalKind = 'idle'; }
      } else if (pickup >= 0) { goal = pickup; goalKind = 'pickup'; }
      else {
        // nobody close: wander so the match never turns into a standing contest
        let tries = 0;
        while (tries++ < 14) {
          const i = Math.floor(rnd() * nav.N), d = dist[i];
          if (d > 5 && d < 15 && !nearGapTile(nav, i)) { goal = i; goalKind = 'wander'; break; }
        }
      }
    }
    b.kind = goalKind;
    b.path = [];
    if (goalKind === 'flee' && b.fleePath) { b.path = b.fleePath; b.goal = goal; }
    else if (goal >= 0 && dist[goal] < INF) {
      let i = goal;
      const rev = [];
      let guard = 0;
      while (i >= 0 && i !== here && guard++ < 200) { rev.push(i); i = prev[i]; }
      b.path = rev.reverse();
      b.goal = goal;
    }
    b.dirty = true;
  }

  // ---- steering along the path with look-ahead smoothing
  let tx = p.x, ty = p.y;
  const goalDist = b.target >= 0 && b.kind === 'chase' ? Math.hypot(w.players[b.target].x - p.x, w.players[b.target].y - p.y) : INF;
  if (b.kind === 'chase' && b.target >= 0 && goalDist < 7 * TILE && los(w, nav, p.x, p.y, w.players[b.target].x, w.players[b.target].y, slide)) {
    const q = w.players[b.target];
    tx = q.x + q.vx * P.predict * 0.6; ty = q.y + q.vy * P.predict * 0.6;
  } else if (b.path.length) {
    // drop waypoints we've reached
    while (b.path.length > 1) {
      const c = centerOf(nav, b.path[0]);
      if (Math.hypot(c.x - p.x, c.y - p.y) < 14) b.path.shift(); else break;
    }
    let pick = 0;
    for (let k = 1; k < Math.min(b.path.length, 5); k++) { const c = centerOf(nav, b.path[k]); if (los(w, nav, p.x, p.y, c.x, c.y, slide)) pick = k; else break; }
    const c = centerOf(nav, b.path[pick]);
    tx = c.x; ty = c.y;
    if (b.path.length === 1 && b.kind !== 'chase' && Math.hypot(c.x - p.x, c.y - p.y) < 14) { tx = p.x; ty = p.y; }
  }
  const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy);
  if (dl < 6) { inp.mx = inp.my = 0; inp.sprint = false; return inp; }
  // smooth direction changes a little so bots don't jitter
  const ux = dx / dl, uy = dy / dl;
  b.dir.x += (ux - b.dir.x) * Math.min(1, dt * 12); b.dir.y += (uy - b.dir.y) * Math.min(1, dt * 12);
  const bl = Math.hypot(b.dir.x, b.dir.y) || 1;
  inp.mx = (b.dir.x / bl) * P.speed; inp.my = (b.dir.y / bl) * P.speed;

  // ---- never run off a roof: brake when the next few frames would end up over a gap
  const spd = Math.hypot(p.vx, p.vy);
  if (p.grounded && w.hasGaps) {
    const la = spd * 0.2 + 12, ax = p.x + (p.vx / (spd || 1)) * la, ay = p.y + (p.vy / (spd || 1)) * la;
    if (spd > 30 && w.tile(ax, ay) === '_' && w.tile(p.x, p.y) !== '_') { inp.mx = inp.my = 0; inp.sprint = false; b.think = Math.min(b.think, 0.05); return inp; }
  }

  // ---- abilities
  const danger = chaser ? goalDist : nearestChaserDist(w, p);
  const wantSprint = chaser ? goalDist < 8 * TILE : danger < 11 * TILE;
  inp.sprint = wantSprint && p.stam > (p.exhausted ? 99 : P.sprintAt * 100) && (b.kind === 'chase' || b.kind === 'flee' || b.kind === 'rescue');
  const risky = w.hasGaps && nearGapTile(nav, here, 3);
  if (risky) inp.sprint = false;
  if (P.dash > 0 && p.dashCd <= 0 && p.grounded && !risky) {
    if (chaser && goalDist > 48 && goalDist < 130 && b.kind === 'chase' && b.target >= 0 && los(w, nav, p.x, p.y, w.players[b.target].x, w.players[b.target].y, slide) && rnd() < P.dash * dt * 2.5) inp.dash = true;
    else if (!chaser && danger < 62 && rnd() < P.dash * dt * 6) inp.dash = true;
  }
  if (P.slide && b.path.length && p.grounded && p.slideCd <= 0 && nav.costS[b.path[0]] > 2 && nav.cost[b.path[0]] >= INF && Math.hypot(centerOf(nav, b.path[0]).x - p.x, centerOf(nav, b.path[0]).y - p.y) < 2 * TILE) inp.slide = true;
  return inp;
}

const INF_ = 1e9;
function openness(nav, i) {
  const x = i % nav.w, y = (i / nav.w) | 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < nav.w && ny < nav.h && nav.cost[ny * nav.w + nx] < INF) n++; }
  return n / 25 * 6;
}

function nearGapTile(nav, i, r = 1) {
  const x = i % nav.w, y = (i / nav.w) | 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < nav.w && ny < nav.h && nav.gap && nav.gap[ny * nav.w + nx]) return true; }
  return false;
}

function nearestChaserDist(w, p) {
  let d = INF;
  for (const q of w.players) if (!q.left && q !== p && w.isChaser(q) && !q.frozen) d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y));
  return d;
}
