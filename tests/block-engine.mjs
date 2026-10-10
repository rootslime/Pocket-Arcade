// Headless rules tests for Pocket Block Blast (games/pocket-block-blast/engine.js).
import { SIZE, SHAPES, Game, Rng, newBoard, fits, fullLines, previewLines, canPlaceAnywhere, lineBase, dailyKey, dailyInfo, dailySet, hashStr, botMove, makeSet, shapeById, DAILY_SETS, UNDO_USES, BOARD_CLEAR_BONUS, fillCount } from '../games/pocket-block-blast/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const head = (t) => console.log(t);
const S = (name) => SHAPES.find((s) => s.name === name);
const mk = (tray, opts = {}) => { const g = new Game({ seed: 1, ...opts }); g.tray = tray.map((s) => (s ? { shape: s } : null)); g.over = false; g.checkOver(); return g; };

head('Shapes');
ok(SHAPES.length >= 35, `${SHAPES.length} distinct shapes (all rotations)`);
ok(new Set(SHAPES.map((s) => s.id)).size === SHAPES.length, 'shape ids are unique');
ok(SHAPES.every((s) => s.w <= 5 && s.h <= 5 && s.cells.every(([r, c]) => r >= 0 && c >= 0 && r < s.h && c < s.w)), 'every shape is normalised and fits in 5×5');
ok(['dot', 'line2', 'line3', 'line4', 'line5', 'square2', 'square3', 'L', 'T', 'Z', 'corner'].every((n) => S(n)), 'single, lines 2–5, 2×2, 3×3, L, T, Z and corner pieces exist');

head('Placement rules');
{
  const g = mk([S('square2'), S('dot'), S('line3')]);
  ok(g.place(0, 0, 0).ok && g.board[0] && g.board[1] && g.board[8] && g.board[9], 'a piece is placed where it is dropped');
  ok(!g.place(1, 1, 1).ok && g.tray[1], 'a piece cannot overlap occupied cells');
  ok(g.place(1, 1, 1).reason === 'blocked', '…and the reason is reported');
  const g2 = mk([S('line5'), S('dot'), S('dot')]);
  ok(!fits(g2.board, g2.tray[0].shape, 0, 4) && !g2.place(0, 0, 4).ok, 'a piece cannot extend past the right edge');
  ok(!g2.place(0, -1, 0).ok && !g2.place(0, 0, -1).ok && !g2.place(0, 8, 0).ok, 'nor past the left, top or bottom edges');
  const g3 = mk([S('line5'), S('dot'), S('dot')]);
  ok(g3.place(0, 7, 3).ok, 'a piece may touch the edge exactly');
  ok(!g3.place(5, 0, 0).ok, 'an empty tray slot cannot be placed');
}

head('Line clearing');
{
  const g = mk([S('line4'), S('line4'), S('dot')]);
  for (let c = 0; c < 4; c++) g.board[3 * SIZE + c] = 1;
  const r = g.place(0, 3, 4);
  const horizontal = S('line4');
  ok(horizontal && r.ok, 'sanity: placing the second half of a row');
  ok(r.rows.length === 1 && r.cols.length === 0 && r.lines === 1, 'a completed row clears');
  ok([...Array(SIZE).keys()].every((c) => !g.board[3 * SIZE + c]), 'the row is empty afterwards');
  ok(r.cleared.length === 8, 'eight cells reported as cleared');
}
{
  const v = SHAPES.find((s) => s.name === 'line4' && s.w === 1);
  const g = mk([v, S('dot'), S('dot')]);
  for (let r = 0; r < 4; r++) g.board[r * SIZE + 5] = 2;
  const res = g.place(0, 4, 5);
  ok(res.cols.length === 1 && res.rows.length === 0, 'a completed column clears');
  ok([...Array(SIZE).keys()].every((r) => !g.board[r * SIZE + 5]), 'the column is empty afterwards');
}
{
  // row 0 and column 0 are both one cell short at the same cell
  const g = mk([S('dot'), S('dot'), S('dot')]);
  for (let k = 1; k < SIZE; k++) { g.board[k] = 1; g.board[k * SIZE] = 1; }
  const res = g.place(0, 0, 0);
  ok(res.rows.length === 1 && res.cols.length === 1 && res.lines === 2, 'a row and a column clear at once');
  ok(res.cleared.length === 15, 'the shared corner cell is only counted once (15 cells)');
  ok(fillCount(g.board) === 0, 'board is empty after the double clear');
  ok(res.linePoints === lineBase(2) * 1 + BOARD_CLEAR_BONUS && res.boardClear, `double clear = ${lineBase(2)} + perfect board bonus ${BOARD_CLEAR_BONUS}`);
}

head('Scoring and combos');
{
  const rowSetup = (g, row) => { for (let c = 0; c < 7; c++) g.board[row * SIZE + c] = 3; };
  const g = mk([S('dot'), S('dot'), S('dot')]);
  rowSetup(g, 0); rowSetup(g, 2); rowSetup(g, 4); g.board[7 * SIZE + 7] = 1;
  const a = g.place(0, 0, 7);
  ok(a.points === 1 + lineBase(1) * 1 && a.combo === 1 && a.label === 'NICE CLEAR!', `first clear: 1 + ${lineBase(1)} × 1 (${a.points})`);
  const b = g.place(1, 2, 7);
  ok(b.combo === 2 && b.points === 1 + lineBase(1) * 2, `a consecutive clear doubles it (${b.points})`);
  const c = g.place(2, 4, 7);
  ok(c.combo === 3 && c.points === 1 + lineBase(1) * 3 && /COMBO ×3/.test(c.label), `third in a row: combo ×3 (${c.points}, ${c.label})`);
  ok(g.maxCombo === 3, 'highest combo is remembered');
  ok(g.score === a.points + b.points + c.points, 'score is the sum of the placements');
  g.tray = [{ shape: S('dot') }, null, null];
  const d = g.place(0, 6, 6);
  ok(d.lines === 0 && d.combo === 0 && g.combo === 0, 'a placement without a clear resets the combo');
  ok(g.maxCombo === 3 && g.lines === 3, 'but the best combo and line total stay');
}
{
  const g = mk([SHAPES.find((s) => s.name === 'line4' && s.w === 1), S('dot'), S('dot')]);
  g.board[7 * SIZE + 7] = 1;                 // keeps the board from emptying (no perfect-board bonus)
  // four rows each missing only column 6
  for (let r = 0; r < 4; r++) for (let c = 0; c < SIZE; c++) if (c !== 6) g.board[r * SIZE + c] = 2;
  const res = g.place(0, 0, 6);
  ok(res.lines === 4 && res.label === 'MEGA BLAST!' && res.linePoints === lineBase(4), `four lines at once: MEGA BLAST! (+${res.linePoints})`);
  ok(lineBase(1) < lineBase(2) && lineBase(2) < lineBase(3) && lineBase(3) / 3 > lineBase(1), 'clearing more lines at once is worth more than clearing them one by one');
}

head('Game over');
{
  // a crowded board: every row and column keeps two open cells, so no placement below completes a line;
  // the open cells are scattered, so only single dots and a few vertical pairs fit
  const crowded = (g) => { g.board.fill(1); for (let r = 0; r < SIZE; r++) { g.board[r * SIZE + ((3 * r + 1) % 8)] = 0; g.board[r * SIZE + ((3 * r + 4) % 8)] = 0; } };
  const g = new Game({ seed: 7 });
  crowded(g);
  const lines0 = fullLines(g.board);
  ok(lines0.rows.length === 0 && lines0.cols.length === 0, 'test board has no complete lines');
  g.tray = [{ shape: S('square2') }, { shape: S('dot') }, { shape: S('line3') }];
  g.over = false; g.checkOver();
  ok(!g.over, 'a piece that cannot fit does NOT end the game while another still can');
  ok(!canPlaceAnywhere(g.board, S('square2')) && !canPlaceAnywhere(g.board, S('line3')) && g.anyMove(), 'anyMove() looks at every remaining piece');
  const res = g.place(1, 0, 1);
  ok(res.ok && res.lines === 0, 'the piece that fits can be placed');
  ok(g.over && g.overReason === 'stuck', 'after that nothing fits: the game is over');
  ok(!g.place(0, 0, 0).ok, 'no placement is accepted once the game is over');
  const h = new Game({ seed: 7 });
  crowded(h);
  h.tray = [null, { shape: S('dot') }, { shape: S('square3') }];
  h.over = false; h.checkOver();
  ok(!h.over, 'empty tray slots are ignored when checking for moves');
  h.place(1, 0, 1);
  ok(h.over, 'the last piece that cannot fit ends the game');
}

head('Undo');
{
  const g = new Game({ seed: 99 });
  const before = { board: g.board.slice(), tray: g.tray.map((p) => p && p.shape.id), score: g.score, combo: g.combo, lines: g.lines, placed: g.placed, rng: g.rng.s, sets: g.sets };
  const ok1 = g.undo();
  ok(!ok1, 'nothing to undo before the first placement');
  // find a legal placement
  let placed = null;
  for (let i = 0; i < 3 && !placed; i++) for (let r = 0; r < SIZE && !placed; r++) for (let c = 0; c < SIZE && !placed; c++) if (g.canPlace(i, r, c)) placed = [i, r, c];
  g.place(...placed);
  ok(g.board.some((v) => v) && g.score > 0, 'placement changed the board and score');
  ok(g.undo(), 'undo succeeds');
  ok(JSON.stringify([...g.board]) === JSON.stringify([...before.board]) && JSON.stringify(g.tray.map((p) => p && p.shape.id)) === JSON.stringify(before.tray) && g.score === before.score && g.combo === before.combo && g.lines === before.lines && g.placed === before.placed && g.rng.s === before.rng && g.sets === before.sets, 'undo restores board, pieces, score, combo, lines and random state exactly');
  ok(g.undosLeft === UNDO_USES - 1, 'it used up one undo');
  ok(!g.undo(), 'a second undo in a row is not possible');
  for (let k = 0; k < UNDO_USES + 1; k++) { let pl = null; for (let i = 0; i < 3 && !pl; i++) for (let r = 0; r < SIZE && !pl; r++) for (let c = 0; c < SIZE && !pl; c++) if (g.canPlace(i, r, c)) pl = [i, r, c]; if (!pl) break; g.place(...pl); g.undo(); }
  ok(g.undosLeft === 0, 'undo uses are limited');
}
{
  // undo across the refill of a new set must bring back the old pieces and the same next set
  const g = new Game({ seed: 5 });
  g.tray = [{ shape: S('dot') }, null, null];
  const rngBefore = g.rng.s, setsBefore = g.sets;
  const res = g.place(0, 0, 0);
  ok(res.refilled && g.tray.every(Boolean), 'placing the last piece of a set deals three new ones');
  const newIds = g.tray.map((p) => p.shape.id).join();
  g.undo();
  ok(g.tray[0] && g.tray[0].shape.name === 'dot' && !g.tray[1] && !g.tray[2] && g.rng.s === rngBefore && g.sets === setsBefore, 'undo after a refill brings the old pieces back');
  g.place(0, 0, 0);
  ok(g.tray.map((p) => p.shape.id).join() === newIds, 'and the replacement set is the same one again (no re-rolling by undoing)');
}

head('Daily challenge');
{
  const a = dailyInfo('2026-03-14'), b = dailyInfo('2026-03-14'), c = dailyInfo('2026-03-15');
  ok(a.seed === b.seed && JSON.stringify([...a.board]) === JSON.stringify([...b.board]) && a.target === b.target, 'the same date always gives the same challenge');
  ok(a.seed !== c.seed && JSON.stringify([...a.board]) !== JSON.stringify([...c.board]), 'a different date gives a different one');
  ok(JSON.stringify(dailySet(a.seed, 3).map((s) => s.id)) === JSON.stringify(dailySet(b.seed, 3).map((s) => s.id)), 'the piece sets are deterministic');
  ok(dailyKey(new Date(Date.UTC(2026, 0, 5, 23, 59))) === '2026-01-05' && dailyKey(new Date(Date.UTC(2026, 0, 6, 0, 0))) === '2026-01-06', 'the day rolls over at 00:00 UTC');
  ok(a.attempt === 0 ? hashStr('pocket-block-blast:v1:2026-03-14') === a.seed : hashStr('pocket-block-blast:v1:2026-03-14#' + a.attempt) === a.seed, 'seed = FNV-1a of "pocket-block-blast:v1:<date>" (plus #attempt when curated)');
  let good = true, targets = new Set();
  for (let d = 1; d <= 60; d++) { const i = dailyInfo(`2026-04-${String(d).padStart(2, '0')}`); targets.add(i.target); const lines = fullLines(i.board); if (lines.rows.length || lines.cols.length || fillCount(i.board) < 10 || fillCount(i.board) > 13 || i.target < 1200 || i.target > 3000) good = false; }
  ok(good && targets.size > 3, 'starting boards have 10–13 blocks, no complete line, and goals between 1,200 and 3,000');
  const g1 = new Game({ mode: 'daily', daily: a }), g2 = new Game({ mode: 'daily', daily: b });
  ok(JSON.stringify(g1.tray.map((p) => p.shape.id)) === JSON.stringify(g2.tray.map((p) => p.shape.id)), 'two players start with identical trays');
  // play two different strategies and compare the piece sequence
  const seqOf = (strategy) => { const g = new Game({ mode: 'daily', daily: a }); const seq = []; let guard = 0; while (!g.over && guard++ < 100) { if (g.tray.every(Boolean)) seq.push(g.tray.map((p) => p.shape.id).join(',')); const mv = strategy(g); if (!mv) break; g.place(...mv); } return { g, sets: [...new Set(seq)] }; };
  const first = (g) => { for (let i = 0; i < 3; i++) if (g.tray[i]) for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (g.canPlace(i, r, c)) return [i, r, c]; return null; };
  const last = (g) => { for (let i = 2; i >= 0; i--) if (g.tray[i]) for (let r = SIZE - 1; r >= 0; r--) for (let c = SIZE - 1; c >= 0; c--) if (g.canPlace(i, r, c)) return [i, r, c]; return null; };
  const sa = seqOf(first), sb = seqOf(last);
  const trays = (g0) => Array.from({ length: DAILY_SETS }, (_, k) => dailySet(g0.daily.seed, k).map((s) => s.id).join(','));
  ok(trays(sa.g).length === DAILY_SETS && sa.sets.every((s) => trays(sa.g).includes(s)) && sb.sets.every((s) => trays(sb.g).includes(s)), 'the sets you receive never depend on how you played');
  ok(sa.g.setLimit === DAILY_SETS, 'the daily challenge has a fixed number of sets');
}

head('Block Duel rules');
{
  const a = new Game({ mode: 'duel', seed: 424242 }), b = new Game({ mode: 'duel', seed: 424242 }), c = new Game({ mode: 'duel', seed: 424243 });
  const ids = (g) => g.tray.map((p) => p && p.shape.id).join(',');
  ok(ids(a) === ids(b) && ids(a) !== ids(c), 'the same seed deals the same first set; another seed does not');
  const seq = (g, strat) => { const out = []; let n = 0; while (!g.over && n++ < 100) { if (g.tray.every(Boolean)) out.push(ids(g)); const mv = strat(g); if (!mv) break; g.place(...mv); } return out; };
  const x = seq(new Game({ mode: 'duel', seed: 77 }), botMove);
  const y = seq(new Game({ mode: 'duel', seed: 77 }), (g) => { for (let i = 2; i >= 0; i--) if (g.tray[i]) for (let r = SIZE - 1; r >= 0; r--) for (let c2 = SIZE - 1; c2 >= 0; c2--) if (g.canPlace(i, r, c2)) return [i, r, c2]; return null; });
  const n = Math.min(x.length, y.length);
  ok(n >= 3 && x.slice(0, n).join('|') === y.slice(0, n).join('|'), 'both players receive the identical piece sequence however they play');
  const g = new Game({ mode: 'duel', seed: 5 });
  ok(g.setLimit === 8 && g.undosLeft === 0 && !g.undo(), 'a duel is eight sets long and has no undo');
  let guard = 0; while (!g.over && guard++ < 100) { const mv = botMove(g); if (!mv) break; g.place(...mv); }
  ok(g.over && (g.overReason === 'sets' || g.overReason === 'stuck'), 'it ends after the last set (or when nothing fits)');
}

head('Fair piece generation (greedy bot)');
const greedyMove = botMove;
{
  let totalPieces = 0, minPieces = Infinity, instant = 0, sets = 0, emptyFits = 0, finished = 0;
  const N = 120;
  for (let s = 1; s <= N; s++) {
    const g = new Game({ seed: s * 7919 });
    let guard = 0;
    while (!g.over && guard++ < 1500) {
      if (g.tray.every(Boolean)) { sets++; if (!g.tray.some((p) => canPlaceAnywhere(g.board, p.shape))) instant++; }
      const mv = greedyMove(g); if (!mv) break;
      g.place(...mv);
    }
    if (g.over) finished++;
    totalPieces += g.placed; minPieces = Math.min(minPieces, g.placed);
  }
  const avg = totalPieces / N;
  ok(avg > 55, `a simple bot places ${avg.toFixed(0)} pieces per game on average (min ${minPieces})`);
  ok(instant / sets < 0.01, `a fresh set is almost never instantly unplayable (${instant} of ${sets} sets)`);
  ok(finished > 0, `games can still be lost (${finished} of ${N} bot games ended within 1500 moves)`);
  // the generator keeps fit chances up compared with a purely random set
  let randomDead = 0, fairDead = 0; const rg = new Rng(1234);
  for (let k = 0; k < 400; k++) {
    const b = newBoard(); for (let i = 0; i < 64; i++) if (rg.next() < 0.62) b[i] = 1;
    const l = fullLines(b); for (const r of l.rows) for (let c = 0; c < SIZE; c++) b[r * SIZE + c] = 0; for (const c of l.cols) for (let r = 0; r < SIZE; r++) b[r * SIZE + c] = 0;
    const rnd = makeSet(new Rng(k), b, 0, false), fair = makeSet(new Rng(k), b, 0, true);
    if (!rnd.some((s) => canPlaceAnywhere(b, s))) randomDead++;
    if (!fair.some((s) => canPlaceAnywhere(b, s))) fairDead++;
  }
  ok(fairDead <= randomDead, `on crowded boards the generator avoids dead sets (${fairDead} vs ${randomDead} for purely random)`);
}

head('Daily goals are reachable');
{
  let bad = 0, N = 80, attempts = 0, sum = 0;
  for (let d = 0; d < N; d++) {
    const key = dailyKey(new Date(Date.UTC(2026, 0, 1 + d)));
    const info = dailyInfo(key);
    attempts += info.attempt;
    const g = new Game({ mode: 'daily', daily: info });
    let guard = 0; while (!g.over && guard++ < 100) { const mv = botMove(g); if (!mv) break; g.place(...mv); }
    sum += info.target;
    if (g.overReason !== 'sets' || g.score < info.target) bad++;
  }
  ok(bad === 0, `across ${N} days the built-in bot always finishes all 10 sets and beats the goal (average goal ${Math.round(sum / N)}, ${attempts} re-rolls in total)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
