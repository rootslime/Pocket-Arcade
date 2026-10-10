// Pocket Block Blast — pure game rules (no DOM). The page renders this; tests/block-engine.mjs plays it headless.
//
// Daily challenge algorithm (documented in README, "Pocket Block Blast"):
//   key     = 'YYYY-MM-DD' in UTC, so everyone on Earth gets the same challenge for the same calendar day
//   seed    = FNV-1a 32-bit hash of  "pocket-block-blast:v1:" + key  (v1 = CHALLENGE_VERSION); attempt n > 0 hashes "…:key#n"
//   board   = mulberry32(seed) places 10–13 starter blocks, never completing a line
//   set k   = mulberry32(seed ^ hash("set" + k)) — each set depends only on the seed and its number, never on how you
//             played, so every player sees the identical 10 sets (30 pieces)
//   curation: a built-in greedy bot plays attempt 0; if it gets stuck or scores under 1,200 the next attempt is tried
//             (deterministically, up to 60), so no day can start with an impossible board. The goal is 80% of the bot's
//             score (rounded down to 100, between 1,200 and 3,000): reachable by construction, beatable by a good player.

export const SIZE = 8;
export const CHALLENGE_VERSION = 1;
export const DAILY_SETS = 10;
export const UNDO_USES = 3;
export const TIME_ATTACK_SECS = 180;
export const DUEL_SETS = 8;           // Block Duel: everybody plays the same eight sets (24 pieces)
export const DUEL_MAX_SECS = 300;      // …or until five minutes are up

export const PALETTE = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#43e07a', '#2de2e6', '#4d8bff', '#a56bff', '#ff6bd6'];

// ---------------------------------------------------------------- random numbers
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32 with an inspectable state so undo can restore it exactly. */
export class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// ---------------------------------------------------------------- shapes
const rot = (cells) => { const h = Math.max(...cells.map((c) => c[0])) + 1; return cells.map(([r, c]) => [c, h - 1 - r]); };
const norm = (cells) => { const mr = Math.min(...cells.map((c) => c[0])), mc = Math.min(...cells.map((c) => c[1])); return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
const parse = (rows) => { const out = []; rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') out.push([r, c]); })); return out; };

// [name, rows, weight, color index, rotations to include]
const BASE = [
  ['dot', ['#'], 5, 2, 1],
  ['line2', ['##'], 7, 5, 2], ['line3', ['###'], 7, 4, 2], ['line4', ['####'], 4, 6, 2], ['line5', ['#####'], 2, 7, 2],
  ['square2', ['##', '##'], 8, 2, 1], ['square3', ['###', '###', '###'], 2, 1, 1],
  ['rect23', ['###', '###'], 4, 3, 2],
  ['corner', ['##', '#.'], 6, 0, 4], ['bigCorner', ['###', '#..', '#..'], 3, 1, 4],
  ['L', ['#.', '#.', '##'], 6, 5, 4], ['Lbig', ['#.', '#.', '#.', '##'], 2, 6, 4],
  ['T', ['###', '.#.'], 6, 7, 4],
  ['Z', ['##.', '.##'], 5, 3, 2], ['S', ['.##', '##.'], 5, 4, 2],
  ['plus', ['.#.', '###', '.#.'], 1.5, 0, 1],
];

export const SHAPES = [];
for (const [name, rows, weight, color, rots] of BASE) {
  let cells = norm(parse(rows));
  const seen = new Set();
  for (let k = 0; k < rots; k++) {
    const key = JSON.stringify(cells);
    if (!seen.has(key)) {
      seen.add(key);
      SHAPES.push({ id: `${name}${k}`, name, cells, w: Math.max(...cells.map((c) => c[1])) + 1, h: Math.max(...cells.map((c) => c[0])) + 1, n: cells.length, color, weight: weight / rots });
    }
    cells = norm(rot(cells));
  }
}
export const shapeById = (id) => SHAPES.find((s) => s.id === id) || null;

// ---------------------------------------------------------------- board helpers (board = Uint8Array(64), 0 = empty, else color+1)
export const newBoard = () => new Uint8Array(SIZE * SIZE);
export const at = (b, r, c) => b[r * SIZE + c];

export function fits(board, shape, r, c) {
  for (const [dr, dc] of shape.cells) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE || board[rr * SIZE + cc]) return false;
  }
  return true;
}
export function canPlaceAnywhere(board, shape) {
  for (let r = 0; r <= SIZE - shape.h; r++) for (let c = 0; c <= SIZE - shape.w; c++) if (fits(board, shape, r, c)) return true;
  return false;
}
export function fullLines(board) {
  const rows = [], cols = [];
  for (let r = 0; r < SIZE; r++) { let f = true; for (let c = 0; c < SIZE; c++) if (!board[r * SIZE + c]) { f = false; break; } if (f) rows.push(r); }
  for (let c = 0; c < SIZE; c++) { let f = true; for (let r = 0; r < SIZE; r++) if (!board[r * SIZE + c]) { f = false; break; } if (f) cols.push(c); }
  return { rows, cols };
}
/** Which lines WOULD complete if the shape were placed at (r, c)? (used for the live preview). Does not modify the board. */
export function previewLines(board, shape, r, c) {
  const b = board.slice();
  for (const [dr, dc] of shape.cells) b[(r + dr) * SIZE + c + dc] = shape.color + 1;
  return fullLines(b);
}
export const fillCount = (board) => { let n = 0; for (let i = 0; i < board.length; i++) if (board[i]) n++; return n; };

// ---------------------------------------------------------------- scoring
/** points for clearing n lines with one placement, before the combo multiplier: 100, 300, 600, 1000, 1500, 2100 … */
export const lineBase = (n) => 50 * n * (n + 1);
export const BOARD_CLEAR_BONUS = 2000;

export function clearLabel(n, combo) {
  if (n >= 4) return 'MEGA BLAST!';
  if (combo >= 3) return `COMBO ×${combo}!`;
  if (n === 3) return 'TRIPLE CLEAR!';
  if (n === 2) return 'DOUBLE CLEAR!';
  return 'NICE CLEAR!';
}

// ---------------------------------------------------------------- piece generation
/** Can the three pieces all be placed one after another (any order, clears allowed)? Budgeted search; `true` when unsure. */
function sequenceSolvable(board, shapes, budget) {
  if (!shapes.length) return true;
  const tried = new Set();
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (tried.has(s.id)) continue;
    tried.add(s.id);
    const rest = shapes.filter((_, j) => j !== i);
    for (let r = 0; r <= SIZE - s.h; r++) for (let c = 0; c <= SIZE - s.w; c++) {
      if (!fits(board, s, r, c)) continue;
      if (--budget.n < 0) return true;
      const b = board.slice();
      for (const [dr, dc] of s.cells) b[(r + dr) * SIZE + c + dc] = s.color + 1;
      const { rows, cols } = fullLines(b);
      for (const rr of rows) for (let k = 0; k < SIZE; k++) b[rr * SIZE + k] = 0;
      for (const cc of cols) for (let k = 0; k < SIZE; k++) b[k * SIZE + cc] = 0;
      if (sequenceSolvable(b, rest, budget)) return true;
    }
  }
  return false;
}

function pickShape(rng, score, avoid) {
  const hard = Math.min(1, score / 20000);          // bigger, trickier pieces appear more as the score climbs
  let total = 0;
  const w = SHAPES.map((s) => {
    let x = s.weight * (s.n >= 5 ? 1 + hard * 0.9 : s.n <= 2 ? 1 - hard * 0.45 : 1);
    if (avoid && avoid.includes(s.name)) x *= 0.3;
    total += x; return x;
  });
  let t = rng.next() * total;
  for (let i = 0; i < SHAPES.length; i++) { t -= w[i]; if (t <= 0) return SHAPES[i]; }
  return SHAPES[0];
}

/**
 * Three new pieces. `adaptive` (classic / time attack) looks at the board: it re-rolls sets that leave no piece
 * placeable and, most of the time, sets that can't be placed in sequence — but not always, so the game can still be lost.
 * The daily challenge is not adaptive (its sets must be identical for everybody).
 */
export function makeSet(rng, board, score = 0, adaptive = true) {
  let best = null;
  const tries = adaptive ? 28 : 1;
  const strict = adaptive && rng.next() < 0.88;
  for (let a = 0; a < tries; a++) {
    const names = [];
    const set = [];
    for (let k = 0; k < 3; k++) { const s = pickShape(rng, score, names); names.push(s.name); set.push(s); }
    if (!adaptive) return set;
    if (!best) best = set;
    const anyFits = set.some((s) => canPlaceAnywhere(board, s));
    if (!anyFits) continue;
    if (!strict) return set;
    if (sequenceSolvable(board, set, { n: 2500 })) return set;
    if (best && !best.some((s) => canPlaceAnywhere(board, s))) best = set;
  }
  return best;
}

// ---------------------------------------------------------------- daily challenge
export function dailyKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function buildDaily(key, attempt) {
  const seed = hashStr(`pocket-block-blast:v${CHALLENGE_VERSION}:${key}${attempt ? '#' + attempt : ''}`);
  const rng = new Rng(seed);
  const board = newBoard();
  const want = 10 + Math.floor(rng.next() * 4);
  let guard = 0;
  while (fillCount(board) < want && guard++ < 200) {
    const i = Math.floor(rng.next() * 64), color = Math.floor(rng.next() * 8) + 1;
    board[i] = color;
    const { rows, cols } = fullLines(board);
    if (rows.length || cols.length) board[i] = 0;
  }
  return { key, seed, attempt, version: CHALLENGE_VERSION, board, sets: DAILY_SETS, target: 0 };
}
export function dailyInfo(key) {
  let info = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    info = buildDaily(key, attempt);
    const g = new Game({ mode: 'daily', daily: info });
    let guard = 0;
    while (!g.over && guard++ < 100) { const mv = botMove(g); if (!mv) break; g.place(...mv); }
    if (g.overReason === 'sets' && g.score >= 1200) { info.target = Math.min(3000, Math.max(1200, Math.floor(g.score * 0.8 / 100) * 100)); return info; }
  }
  info.target = 1200;
  return info;
}
export function dailySet(seed, k) {
  return makeSet(new Rng((seed ^ hashStr('set' + k)) >>> 0), null, 0, false);
}

// ---------------------------------------------------------------- the game
export class Game {
  /** opts: { mode: 'classic'|'timeattack'|'daily'|'duel', seed (number), daily (dailyInfo), sets (limit on sets) } */
  constructor(opts = {}) {
    this.mode = opts.mode || 'classic';
    this.daily = opts.daily || null;
    this.sequence = !!this.daily || this.mode === 'duel';        // sets depend only on the seed (identical for everyone)
    this.adaptive = !this.sequence;
    this.setLimit = this.daily ? this.daily.sets : (opts.sets || (this.mode === 'duel' ? DUEL_SETS : 0));
    this.seed = this.daily ? this.daily.seed : ((opts.seed ?? (Math.random() * 4294967296)) >>> 0);
    this.rng = new Rng(this.seed);
    this.board = this.daily ? this.daily.board.slice() : newBoard();
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.lines = 0; this.maxLines = 0; this.placed = 0; this.cells = 0; this.sets = 0;
    this.undosLeft = this.mode === 'duel' ? 0 : UNDO_USES;
    this.over = false; this.overReason = null;
    this.last = null;           // result of the latest placement
    this.undoState = null;
    this.tray = [null, null, null];
    this.nextSet();
    this.checkOver();
  }

  nextSet() {
    const set = this.sequence ? dailySet(this.seed, this.sets) : makeSet(this.rng, this.board, this.score, true);
    this.sets++;
    this.tray = set.map((s) => ({ shape: s }));
  }

  remaining() { return this.tray.filter(Boolean); }

  canPlace(i, r, c) { const p = this.tray[i]; return !this.over && !!p && fits(this.board, p.shape, r, c); }

  /** Every remaining piece is checked against every position; the game ends only when none can be placed. */
  anyMove() {
    for (const p of this.tray) if (p && canPlaceAnywhere(this.board, p.shape)) return true;
    return false;
  }

  checkOver() {
    if (this.over) return;
    if (this.setLimit && this.sets >= this.setLimit && !this.remaining().length) { this.over = true; this.overReason = 'sets'; return; }
    if (this.remaining().length && !this.anyMove()) { this.over = true; this.overReason = 'stuck'; }
  }

  snapshot() {
    return { board: this.board.slice(), tray: this.tray.slice(), score: this.score, combo: this.combo, maxCombo: this.maxCombo, lines: this.lines, maxLines: this.maxLines, placed: this.placed, cells: this.cells, sets: this.sets, rng: this.rng.s };
  }

  /** Place tray piece i with its top-left cell at (r, c). Returns { ok, ... } */
  place(i, r, c) {
    if (this.over) return { ok: false, reason: 'over' };
    const p = this.tray[i];
    if (!p) return { ok: false, reason: 'empty' };
    if (!fits(this.board, p.shape, r, c)) return { ok: false, reason: 'blocked' };
    this.undoState = this.snapshot();
    const cellsPlaced = [];
    for (const [dr, dc] of p.shape.cells) { this.board[(r + dr) * SIZE + c + dc] = p.shape.color + 1; cellsPlaced.push([r + dr, c + dc]); }
    this.tray[i] = null;
    this.placed++; this.cells += p.shape.n;
    const { rows, cols } = fullLines(this.board);
    const n = rows.length + cols.length;
    const cleared = [];
    for (const rr of rows) for (let k = 0; k < SIZE; k++) { const v = this.board[rr * SIZE + k]; if (v) cleared.push({ r: rr, c: k, color: v - 1 }); }
    for (const cc of cols) for (let k = 0; k < SIZE; k++) { if (rows.includes(k)) continue; const v = this.board[k * SIZE + cc]; if (v) cleared.push({ r: k, c: cc, color: v - 1 }); }
    for (const cell of cleared) this.board[cell.r * SIZE + cell.c] = 0;
    let points = p.shape.n, linePoints = 0, boardClear = false;
    if (n > 0) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.lines += n; this.maxLines = Math.max(this.maxLines, n);
      linePoints = lineBase(n) * this.combo;
      if (fillCount(this.board) === 0) { boardClear = true; linePoints += BOARD_CLEAR_BONUS; }
      points += linePoints;
    } else this.combo = 0;
    this.score += points;
    let refilled = false;
    if (!this.remaining().length && !(this.setLimit && this.sets >= this.setLimit)) { this.nextSet(); refilled = true; }
    this.checkOver();
    this.last = { ok: true, piece: i, shape: p.shape, r, c, cells: cellsPlaced, rows, cols, lines: n, cleared, points, linePoints, combo: this.combo, label: n ? clearLabel(n, this.combo) : null, boardClear, refilled, over: this.over, overReason: this.overReason };
    return this.last;
  }

  /** Restore the exact state from before the latest placement (board, score, combo, pieces, random state). */
  undo() {
    if (!this.undoState || this.undosLeft <= 0) return false;
    const s = this.undoState;
    this.board = s.board.slice(); this.tray = s.tray.slice(); this.score = s.score; this.combo = s.combo; this.maxCombo = s.maxCombo;
    this.lines = s.lines; this.maxLines = s.maxLines; this.placed = s.placed; this.cells = s.cells; this.sets = s.sets; this.rng.s = s.rng;
    this.undoState = null; this.undosLeft--; this.over = false; this.overReason = null; this.last = null;
    return true;
  }
}

/** A simple greedy player: prefers line clears, then few isolated pockets and a smooth surface. Returns [piece, row, col] or null. */
export function botMove(g) {
  let best = null, bestV = -Infinity;
  for (let i = 0; i < 3; i++) {
    const p = g.tray[i]; if (!p) continue;
    for (let r = 0; r <= SIZE - p.shape.h; r++) for (let c = 0; c <= SIZE - p.shape.w; c++) {
      if (!fits(g.board, p.shape, r, c)) continue;
      const { rows, cols } = previewLines(g.board, p.shape, r, c);
      const b = g.board.slice();
      for (const [dr, dc] of p.shape.cells) b[(r + dr) * SIZE + c + dc] = 1;
      for (const rr of rows) for (let k = 0; k < SIZE; k++) b[rr * SIZE + k] = 0;
      for (const cc of cols) for (let k = 0; k < SIZE; k++) b[k * SIZE + cc] = 0;
      let iso = 0, trans = 0;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const v = !!b[y * SIZE + x];
        if (!v) { let n = 0; for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= SIZE || xx >= SIZE || b[yy * SIZE + xx]) n++; } if (n >= 3) iso++; }
        if (x + 1 < SIZE && v !== !!b[y * SIZE + x + 1]) trans++;
        if (y + 1 < SIZE && v !== !!b[(y + 1) * SIZE + x]) trans++;
      }
      const v = (rows.length + cols.length) * 30 - iso * 8 - trans * 2 - fillCount(b) * 0.5 + (r + c) * 0.001;
      if (v > bestV) { bestV = v; best = [i, r, c]; }
    }
  }
  return best;
}
