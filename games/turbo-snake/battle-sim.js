// Snake Battle simulation: 2–4 snakes share one arena. Pure logic (no DOM, no network) so the same code runs
// for local play, bots, the online host and the headless tests.
//
// Rules: each tick every snake moves one cell. Hitting a wall or any snake (including your own tail and another
// snake's head) knocks you out; two heads meeting in one cell knock both out. Food grows you and scores.
// A knocked-out snake leaves some food behind. Last snake alive wins; if the clock runs out the best
// score among the survivors wins.
export const COLS = 26, ROWS = 22;
export const TICK = 0.125;                    // seconds per move (8 moves/s)
export const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIRS = ['up', 'right', 'down', 'left'];
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const COLORS = ['#5dff8f', '#2de2e6', '#ff8a3d', '#ff3cac'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const STARTS = [
  { x: 4, y: 4, dir: 'right' }, { x: COLS - 5, y: ROWS - 5, dir: 'left' }, { x: COLS - 5, y: 4, dir: 'down' }, { x: 4, y: ROWS - 5, dir: 'up' },
];

export const BOT_LEVELS = {
  easy: { mistake: 0.14, look: 6 },
  normal: { mistake: 0.05, look: 14 },
  hard: { mistake: 0.01, look: 30 },
};

export class Battle {
  /** opts: { players:[{id,name,ctrl:'human'|'bot'|'remote',diff}], seed, foods, limit } */
  constructor(opts) {
    this.rng = mulberry32((opts.seed >>> 0) || 1);
    this.limit = opts.limit || 120;
    this.tickLen = TICK / (opts.speed || 1);
    this.foodTarget = opts.foods || 3;
    this.time = 0; this.tick = 0; this.over = false; this.winner = -1; this.order = [];   // knocked-out order
    this.events = [];
    this.food = [];
    this.snakes = opts.players.map((p, i) => {
      const s = STARTS[i % STARTS.length];
      const d = DIR[s.dir];
      const cells = [];
      for (let k = 0; k < 4; k++) cells.push({ x: s.x - d[0] * k, y: s.y - d[1] * k });
      return { idx: i, id: p.id, name: p.name, ctrl: p.ctrl || 'human', diff: p.diff || 'normal', color: COLORS[i % COLORS.length], alive: true, dir: s.dir, queue: [], cells, grow: 0, score: 0, eaten: 0, diedAt: -1, len: 4, bonus: 0 };
    });
    for (let i = 0; i < this.foodTarget; i++) this.spawnFood();
  }

  occupied(x, y) {
    for (const s of this.snakes) if (s.alive) for (const c of s.cells) if (c.x === x && c.y === y) return true;
    return this.food.some((f) => f.x === x && f.y === y);
  }
  spawnFood(v = 1) {
    for (let tries = 0; tries < 80; tries++) {
      const x = 1 + Math.floor(this.rng() * (COLS - 2)), y = 1 + Math.floor(this.rng() * (ROWS - 2));
      if (!this.occupied(x, y)) { this.food.push({ x, y, v }); return true; }
    }
    return false;
  }

  /** Queue a turn (ignored if it reverses the snake). */
  steer(idx, d) {
    const s = this.snakes[idx];
    if (!s || !s.alive || !DIR[d]) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d === last || d === OPPOSITE[last]) return;
    if (s.queue.length < 2) s.queue.push(d);
  }

  /** Advance by dt; returns true when at least one move happened. */
  update(dt) {
    if (this.over) return false;
    this.time += dt;
    let moved = false;
    this._acc = (this._acc || 0) + dt;
    while (this._acc >= this.tickLen && !this.over) { this._acc -= this.tickLen; this.step(); moved = true; }
    if (!this.over && this.time >= this.limit) this.finish('time');
    return moved;
  }
  get progress() { return clamp((this._acc || 0) / this.tickLen, 0, 1); }

  step() {
    this.tick++;
    const alive = this.snakes.filter((s) => s.alive);
    for (const s of alive) { if (s.ctrl === 'bot') { const d = this.botMove(s); if (d) this.steer(s.idx, d); } if (s.queue.length) s.dir = s.queue.shift(); }
    // next heads
    const next = new Map();
    for (const s of alive) { const d = DIR[s.dir]; next.set(s.idx, { x: s.cells[0].x + d[0], y: s.cells[0].y + d[1] }); }
    // cells that stay occupied after this move (a tail moves away unless the snake is growing)
    const blocked = new Set();
    for (const s of alive) for (let i = 0; i < s.cells.length; i++) { const isTail = i === s.cells.length - 1; if (isTail && s.grow <= 0) continue; blocked.add(s.cells[i].y * COLS + s.cells[i].x); }
    const dead = new Set();
    for (const s of alive) {
      const h = next.get(s.idx);
      if (h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS) { dead.add(s.idx); continue; }
      if (blocked.has(h.y * COLS + h.x)) { dead.add(s.idx); continue; }
      for (const o of alive) if (o !== s) { const oh = next.get(o.idx); if (oh.x === h.x && oh.y === h.y) dead.add(s.idx); }
      // heads swapping places also count as a collision
      for (const o of alive) if (o !== s) { const oh = next.get(o.idx); if (oh.x === s.cells[0].x && oh.y === s.cells[0].y && h.x === o.cells[0].x && h.y === o.cells[0].y) dead.add(s.idx); }
    }
    for (const s of alive) {
      if (dead.has(s.idx)) continue;
      const h = next.get(s.idx);
      s.cells.unshift(h);
      if (s.grow > 0) s.grow--; else s.cells.pop();
      const fi = this.food.findIndex((f) => f.x === h.x && f.y === h.y);
      if (fi >= 0) {
        const f = this.food[fi]; this.food.splice(fi, 1);
        s.grow += f.v === 1 ? 1 : 3; s.score += f.v === 1 ? 10 : 30; s.eaten++;
        this.events.push({ k: 'eat', i: s.idx, v: f.v });
        this.spawnFood(this.rng() < 0.12 ? 3 : 1);
      }
      s.len = s.cells.length + s.grow;
    }
    for (const i of dead) this.knockOut(this.snakes[i]);
    if (this.food.length < this.foodTarget) this.spawnFood();
    const left = this.snakes.filter((s) => s.alive);
    if (left.length <= 1 && this.snakes.length > 1) this.finish(left.length ? 'last' : 'wipe');
  }

  knockOut(s) {
    s.alive = false; s.diedAt = this.time; this.order.push(s.idx);
    this.events.push({ k: 'out', i: s.idx });
    // leave a trail of food
    s.cells.forEach((c, i) => { if (i % 2 === 1 && this.food.length < 24 && c.x > 0 && c.y > 0 && c.x < COLS - 1 && c.y < ROWS - 1 && !this.food.some((f) => f.x === c.x && f.y === c.y)) this.food.push({ x: c.x, y: c.y, v: 1 }); });
  }

  finish(why) {
    if (this.over) return;
    this.over = true; this.why = why;
    // survivors rank above the knocked-out; among equals the higher score; knocked-out by later knock-out first
    const survivors = this.snakes.filter((s) => s.alive).sort((a, b) => b.score - a.score);
    const out = this.order.slice().reverse().map((i) => this.snakes[i]);
    if (why === 'wipe') out.sort((a, b) => (b.diedAt - a.diedAt) || (b.score - a.score));
    this.ranking = [...survivors, ...out];
    this.winner = this.ranking.length ? this.ranking[0].idx : -1;
    this.events.push({ k: 'end', why });
  }

  drain() { const e = this.events; this.events = []; return e; }

  // ------------------------------------------------------------------ bots
  cellFree(x, y, selfTail) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      for (let i = 0; i < s.cells.length; i++) { const c = s.cells[i]; if (c.x === x && c.y === y) { if (i === s.cells.length - 1 && s.grow <= 0 && !selfTail) return true; return false; } }
    }
    return true;
  }
  /** Flood fill: how many cells can be reached from (x,y), capped. */
  area(x, y, cap) {
    const seen = new Set([y * COLS + x]); const q = [[x, y]]; let n = 0;
    while (q.length && n < cap) {
      const [cx, cy] = q.shift(); n++;
      for (const d of Object.values(DIR)) { const nx = cx + d[0], ny = cy + d[1], k = ny * COLS + nx; if (seen.has(k) || !this.cellFree(nx, ny)) continue; seen.add(k); q.push([nx, ny]); }
    }
    return n;
  }
  botMove(s) {
    const P = BOT_LEVELS[s.diff] || BOT_LEVELS.normal;
    const h = s.cells[0];
    const options = [];
    for (const d of DIRS) {
      if (d === OPPOSITE[s.dir]) continue;
      const v = DIR[d], nx = h.x + v[0], ny = h.y + v[1];
      if (!this.cellFree(nx, ny)) continue;
      // avoid cells another head could also reach this tick (head-on)
      let risky = 0;
      for (const o of this.snakes) if (o.alive && o !== s) { const oh = o.cells[0]; if (Math.abs(oh.x - nx) + Math.abs(oh.y - ny) === 1 && o.dir !== undefined) risky = 1; }
      const space = this.area(nx, ny, 60);
      let fd = 99;
      for (const f of this.food) fd = Math.min(fd, Math.abs(f.x - nx) + Math.abs(f.y - ny) - (f.v === 3 ? 3 : 0));
      options.push({ d, space, fd, risky, score: Math.min(space, 40) * 2 - fd * (space > 14 ? 1.5 : 0.2) - risky * 25 + (d === s.dir ? 1 : 0) });
    }
    if (!options.length) return null;
    options.sort((a, b) => b.score - a.score);
    if (options.length > 1 && this.rng() < P.mistake) return options[1].d;
    return options[0].d;
  }

  // ------------------------------------------------------------------ network helpers
  /** Compact state (host → clients). */
  exportState() {
    return {
      n: this.tick, t: Math.round(this.time * 10) / 10, o: this.over ? 1 : 0, w: this.winner,
      s: this.snakes.map((s) => [s.alive ? 1 : 0, DIRS.indexOf(s.dir), s.score, s.cells.slice(0, 150).flatMap((c) => [c.x, c.y]), s.grow, s.eaten]),
      f: this.food.map((f) => [f.x, f.y, f.v]),
      k: this.order, r: this.ranking ? this.ranking.map((s) => s.idx) : [],
    };
  }
  importState(st) {
    if (!st || !Array.isArray(st.s) || st.s.length !== this.snakes.length) return false;
    this.prev = this.snakes.map((s) => s.cells.map((c) => ({ ...c })));
    this.tick = st.n | 0; this.time = +st.t || 0;
    st.s.forEach((a, i) => {
      const s = this.snakes[i];
      s.alive = !!a[0]; s.dir = DIRS[a[1] | 0] || s.dir; s.score = a[2] | 0;
      const cells = [];
      for (let k = 0; k + 1 < a[3].length && cells.length < 150; k += 2) cells.push({ x: clamp(a[3][k] | 0, 0, COLS - 1), y: clamp(a[3][k + 1] | 0, 0, ROWS - 1) });
      s.cells = cells.length ? cells : s.cells; s.grow = a[4] | 0; s.eaten = a[5] | 0;
    });
    this.food = Array.isArray(st.f) ? st.f.slice(0, 40).map((f) => ({ x: clamp(f[0] | 0, 0, COLS - 1), y: clamp(f[1] | 0, 0, ROWS - 1), v: f[2] === 3 ? 3 : 1 })) : [];
    this.order = Array.isArray(st.k) ? st.k.map((x) => x | 0) : this.order;
    this._acc = 0;
    if (st.o && !this.over) {
      this.over = true; this.winner = st.w | 0;
      this.ranking = (st.r || []).map((i) => this.snakes[i | 0]).filter(Boolean);
    }
    return true;
  }
}
