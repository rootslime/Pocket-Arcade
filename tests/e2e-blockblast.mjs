// Browser QA for Pocket Block Blast (desktop mouse, touch drag, tap-to-place, keyboard, modes, saves, daily).
import { launch, watch } from './lib.mjs';
import { serve } from './serve.mjs';

const srv = await serve(8141);
const BASE = 'http://localhost:8141/pocket-arcade/';
const URL = BASE + 'games/pocket-block-blast/';
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const save = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1') || 'null'));
async function fresh(ctx, url = URL) {
  const page = await ctx.newPage(); watch(page, errors);
  await page.addInitScript(() => { try { localStorage.setItem('pocketArcade.welcomed', '1'); } catch (e) { /* ignore */ } });
  await page.goto(url);
  return page;
}
async function begin(page, mode = null) {
  await page.waitForSelector('[data-act=start]');
  if (mode) await page.click(`.mode-btn[data-mode=${mode}]`);
  await page.click('[data-act=start]'); await sleep(200);
}
const setup = (page, o) => page.evaluate(async (o) => {
  const E = await import('/pocket-arcade/games/pocket-block-blast/engine.js');
  const g = window.__pbb.newGame({ mode: o.mode || 'classic', seed: o.seed || 3, daily: o.daily || null });
  const S = (n, w) => E.SHAPES.find((s) => s.name === n && (w === undefined || s.w === w));
  g.tray = o.tray.map((t) => (t ? { shape: S(t[0], t[1]) } : null));
  for (const [r, c] of o.cells || []) g.board[r * 8 + c] = 1 + ((r + c) % 8);
  g.over = false; g.checkOver();
  window.__pbb.G.sel = null;
  return true;
}, o);
const lay = (page) => page.evaluate(() => { const l = window.__pbb.layout(); return { bx: l.bx, by: l.by, c: l.c, slots: l.slots, undo: l.undo, W: window.__pbb.shell.W, H: window.__pbb.shell.H, land: l.land }; });
const send = (page, type, x, y, pt = 'touch', id = 7) => page.evaluate(([type, x, y, pt, id]) => {
  const cv = document.querySelector('canvas'), r = cv.getBoundingClientRect(), s = window.__pbb.shell;
  cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: pt, clientX: r.left + x / s.W * r.width, clientY: r.top + y / s.H * r.height, bubbles: true, cancelable: true, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
}, [type, x, y, pt, id]);
/** drag tray piece i so that its top-left lands on board cell (r, c) */
async function drag(page, i, r, c, pt = 'touch', release = true) {
  const L = await lay(page);
  const shape = await page.evaluate((i) => window.__pbb.game.tray[i].shape, i);
  const s = L.slots[i];
  const sx = s.x + s.w / 2, sy = s.y + s.h / 2;
  const cx = L.bx + (c + shape.w / 2) * L.c, cy = L.by + (r + shape.h / 2) * L.c;
  const ty = pt === 'mouse' ? cy : cy + shape.h * L.c / 2 + L.c * 1.15;
  await send(page, 'pointerdown', sx, sy, pt);
  for (let k = 1; k <= 6; k++) await send(page, 'pointermove', sx + (cx - sx) * k / 6, sy + (ty - sy) * k / 6, pt);
  await sleep(40);
  if (release) await send(page, 'pointerup', cx, ty, pt);
  await sleep(40);
  return { cx, cy, ty };
}
const board = (page) => page.evaluate(() => [...window.__pbb.game.board]);
const hud = (page, id) => page.textContent('#hud-' + id);

const { browser, ctx } = await launch({ viewport: { width: 1100, height: 760 } });

// ------------------------------------------------------------------ start screen + basics
console.log('Start screen and modes');
{
  const page = await fresh(ctx);
  await page.waitForSelector('[data-act=start]');
  ok(await page.locator('.mode-btn').count() === 3, 'three modes: Classic, Time Attack, Daily Challenge');
  const t = await page.textContent('.mode-pick');
  ok(/Classic/.test(t) && /Time Attack/.test(t) && /Daily Challenge/.test(t) && /Goal \d/.test(t), 'daily mode shows today’s goal');
  ok((await page.textContent('.g-panel')).includes('GOAL') && (await page.locator('.p-keys li').count()) >= 4, 'goal and controls listed');
  await begin(page);
  ok(await page.evaluate(() => window.__pbb.shell.state) === 'playing', 'START begins play');
  const g = await page.evaluate(() => ({ tray: window.__pbb.game.tray.filter(Boolean).length, filled: [...window.__pbb.game.board].filter(Boolean).length, over: window.__pbb.game.over }));
  ok(g.tray === 3 && g.filled === 0 && !g.over, 'an empty 8×8 board and three pieces');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).touchAction) === 'none', 'the board does not scroll the page while dragging (touch-action: none)');
  await page.close();
}

// ------------------------------------------------------------------ mouse drag + invalid placement
console.log('Mouse: drag, preview, invalid drop');
{
  const page = await fresh(ctx);
  await begin(page);
  await setup(page, { tray: [['square2'], ['line3', 3], ['dot']] });
  const L = await lay(page);
  // preview while dragging (do not release yet)
  await drag(page, 0, 2, 2, 'mouse', false);
  const pv = await page.evaluate(() => { const g = window.__pbb.G; return { drag: !!(g.drag && g.drag.moved), shell: window.__pbb.shell.state }; });
  ok(pv.drag, 'dragging a piece starts a drag with a floating piece');
  await send(page, 'pointerup', L.bx + 3 * L.c, L.by + 3 * L.c, 'mouse');
  await sleep(60);
  let b = await board(page);
  ok(b[2 * 8 + 2] && b[2 * 8 + 3] && b[3 * 8 + 2] && b[3 * 8 + 3] && b.filter(Boolean).length === 4, 'releasing over the board snaps the piece to the grid');
  ok(await page.evaluate(() => window.__pbb.game.tray[0] === null), 'the placed piece leaves the tray');
  // a real mouse drag (Playwright's mouse, not synthetic events)
  {
    const box = await page.locator('canvas').boundingBox(), sc = box.width / L.W, s2 = L.slots[1];
    await page.mouse.move(box.x + (s2.x + s2.w / 2) * sc, box.y + (s2.y + s2.h / 2) * sc);
    await page.mouse.down();
    await page.mouse.move(box.x + (L.bx + 1.5 * L.c) * sc, box.y + (L.by + 5.5 * L.c) * sc, { steps: 8 });
    await page.mouse.up(); await sleep(60);
    const nb = await board(page);
    ok(nb[5 * 8 + 0] && nb[5 * 8 + 1] && nb[5 * 8 + 2], 'a real mouse drag places a piece (line of three)');
    await page.evaluate(() => { const g = window.__pbb.game; g.undo(); });
  }
  // overlapping drop is rejected, piece stays in the tray
  const before = await board(page);
  await drag(page, 2, 2, 2, 'mouse');
  ok(JSON.stringify(await board(page)) === JSON.stringify(before) && await page.evaluate(() => !!window.__pbb.game.tray[2]), 'a drop on occupied cells is rejected');
  // off-board drop
  await drag(page, 1, 0, 7, 'mouse');
  ok(JSON.stringify(await board(page)) === JSON.stringify(before) && await page.evaluate(() => !!window.__pbb.game.tray[1]), 'a piece cannot hang over the board edge');
  // dropping back on the tray cancels quietly
  const L2 = await lay(page);
  await send(page, 'pointerdown', L2.slots[1].x + 20, L2.slots[1].y + 20, 'mouse');
  await send(page, 'pointermove', L2.slots[1].x + 60, L2.slots[1].y + 60, 'mouse');
  await send(page, 'pointerup', L2.slots[1].x + 60, L2.slots[1].y + 60, 'mouse');
  ok(await page.evaluate(() => !!window.__pbb.game.tray[1]), 'releasing over the tray puts the piece back');
  await page.close();
}

// ------------------------------------------------------------------ clearing + scoring
console.log('Clearing, scoring and combos');
{
  const page = await fresh(ctx);
  await begin(page);
  await setup(page, { tray: [['dot'], ['dot'], ['dot']], cells: [...Array(7).keys()].map((c) => [0, c]).concat([...Array(7).keys()].map((c) => [2, c])).concat([...Array(7).keys()].map((c) => [4, c])).concat([[7, 7]]) });
  await drag(page, 0, 0, 7, 'mouse');
  let s = await page.evaluate(() => ({ score: window.__pbb.game.score, combo: window.__pbb.game.combo, lines: window.__pbb.game.lines }));
  ok(s.score === 101 && s.combo === 1 && s.lines === 1, `a completed row clears and scores 100 + 1 (${s.score})`);
  ok((await hud(page, 'score')) === '101' && (await hud(page, 'combo')) === '×1', 'the HUD shows the score and combo');
  const b = await board(page);
  ok(b.slice(0, 8).every((v) => !v), 'row 0 is empty again');
  await drag(page, 1, 2, 7, 'mouse');
  s = await page.evaluate(() => ({ score: window.__pbb.game.score, combo: window.__pbb.game.combo }));
  ok(s.combo === 2 && s.score === 101 + 1 + 200, `back-to-back clear: combo ×2 (${s.score})`);
  ok(await page.evaluate(() => window.__pbb.G.banner && /CLEAR|COMBO/.test(window.__pbb.G.banner.text)), 'a clear banner is shown');
  ok(await page.evaluate(() => window.__pbb.G.clears.length) > 0, 'cleared cells animate away');
  await page.close();
}

// ------------------------------------------------------------------ touch
console.log('Touch: drag with an offset preview, tap-to-place');
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await fresh(mctx);
  await begin(page);
  await setup(page, { tray: [['square2'], ['line3', 1], ['dot']] });
  const L = await lay(page);
  ok(!L.land, 'portrait layout: board above, pieces below');
  const { cx, cy, ty } = await drag(page, 0, 3, 3, 'touch', false);
  const pv = await page.evaluate(() => { const g = window.__pbb.G.drag; return { fingerY: g.y, floatY: g.cy }; });
  ok(pv.floatY < pv.fingerY - L.c, `the piece floats above the finger so it is not hidden (${Math.round(pv.fingerY - pv.floatY)}px above)`);
  await send(page, 'pointerup', cx, ty, 'touch');
  await sleep(60);
  let b = await board(page);
  ok(b[3 * 8 + 3] && b[3 * 8 + 4] && b[4 * 8 + 3] && b[4 * 8 + 4], 'touch drag places the piece exactly under the preview');
  // tap select + tap board
  const s1 = L.slots[1];
  await send(page, 'pointerdown', s1.x + s1.w / 2, s1.y + s1.h / 2, 'touch', 9); await send(page, 'pointerup', s1.x + s1.w / 2, s1.y + s1.h / 2, 'touch', 9);
  ok(await page.evaluate(() => window.__pbb.G.sel) === 1, 'tapping a piece selects it');
  await send(page, 'pointerdown', L.bx + 6.5 * L.c, L.by + 1.5 * L.c, 'touch', 10); await send(page, 'pointerup', L.bx + 6.5 * L.c, L.by + 1.5 * L.c, 'touch', 10);
  b = await board(page);
  ok(b[0 * 8 + 6] && b[1 * 8 + 6] && b[2 * 8 + 6], 'tapping the board places the selected piece centred on that cell');
  ok(await page.evaluate(() => window.__pbb.G.sel) === null, 'the selection clears after placing');
  // tapping a blocked spot does nothing
  const s2 = L.slots[2];
  await send(page, 'pointerdown', s2.x + s2.w / 2, s2.y + s2.h / 2, 'touch', 11); await send(page, 'pointerup', s2.x + s2.w / 2, s2.y + s2.h / 2, 'touch', 11);
  const n0 = (await board(page)).filter(Boolean).length;
  await send(page, 'pointerdown', L.bx + 3.5 * L.c, L.by + 3.5 * L.c, 'touch', 12); await send(page, 'pointerup', L.bx + 3.5 * L.c, L.by + 3.5 * L.c, 'touch', 12);
  ok((await board(page)).filter(Boolean).length === n0 && await page.evaluate(() => !!window.__pbb.game.tray[2]), 'tapping an occupied cell with a piece selected does not place it');
  // real touchscreen tap on the undo button
  const u = L.undo, box = await page.locator('canvas').boundingBox();
  await page.touchscreen.tap(box.x + (u.x + u.w / 2) / L.W * box.width, box.y + (u.y + u.h / 2) / L.H * box.height);
  await sleep(100);
  ok(await page.evaluate(() => window.__pbb.game.undosLeft) === 2, 'a real touch tap on UNDO works');
  await mctx.close();
}
console.log('Landscape layout');
{
  const lctx = await browser.newContext({ viewport: { width: 820, height: 400 }, hasTouch: true, isMobile: true });
  const page = await fresh(lctx);
  await begin(page);
  const L = await lay(page);
  ok(L.land && L.slots[0].x > L.bx + L.c * 8, 'landscape layout: board left, pieces right');
  await setup(page, { tray: [['dot'], ['dot'], ['dot']] });
  await drag(page, 0, 4, 4, 'touch');
  ok((await board(page))[4 * 8 + 4] > 0, 'dragging works in landscape too');
  ok(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2 && document.documentElement.scrollWidth <= window.innerWidth + 2), 'the page does not scroll');
  await lctx.close();
}

// ------------------------------------------------------------------ keyboard
console.log('Keyboard');
{
  const page = await fresh(ctx);
  await begin(page);
  await setup(page, { tray: [['dot'], ['square2'], ['line3', 3]] });
  await page.keyboard.press('Digit2'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await sleep(80);
  const b = await board(page);
  ok(b.filter(Boolean).length === 4 && await page.evaluate(() => window.__pbb.game.tray[1] === null), 'keys 1–3 select, arrows move the cursor and Enter places');
  await page.keyboard.press('KeyZ'); await sleep(80);
  ok((await board(page)).filter(Boolean).length === 0, 'Z undoes');
  await page.close();
}

// ------------------------------------------------------------------ undo through the UI
console.log('Undo');
{
  const page = await fresh(ctx);
  await begin(page);
  await setup(page, { tray: [['dot'], ['dot'], ['dot']], cells: [...Array(7).keys()].map((c) => [0, c]) });
  const snap = () => page.evaluate(() => { const g = window.__pbb.game; return JSON.stringify({ b: [...g.board], t: g.tray.map((p) => p && p.shape.id), s: g.score, c: g.combo, l: g.lines, p: g.placed, r: g.rng.s }); });
  const before = await snap();
  await drag(page, 0, 0, 7, 'mouse');
  ok(await snap() !== before, 'the placement changed the state');
  const L = await lay(page);
  await send(page, 'pointerdown', L.undo.x + 10, L.undo.y + 10, 'mouse'); await send(page, 'pointerup', L.undo.x + 10, L.undo.y + 10, 'mouse');
  await sleep(60);
  ok(await snap() === before, 'UNDO restores the exact board, score, combo and pieces');
  ok((await hud(page, 'score')) === '0', 'and the HUD follows');
  await page.close();
}

// ------------------------------------------------------------------ game over, results, saves
console.log('Game over, results and saves');
{
  const page = await fresh(ctx);
  await begin(page);
  // a board where only one dot fits and placing it cannot clear anything
  await page.evaluate(async () => {
    const E = await import('/pocket-arcade/games/pocket-block-blast/engine.js');
    const g = window.__pbb.game; g.board.fill(1);
    for (let r = 0; r < 8; r++) { g.board[r * 8 + ((3 * r + 1) % 8)] = 0; g.board[r * 8 + ((3 * r + 4) % 8)] = 0; }
    g.tray = [{ shape: E.SHAPES.find((s) => s.name === 'square2') }, { shape: E.SHAPES.find((s) => s.name === 'dot') }, { shape: E.SHAPES.find((s) => s.name === 'line3') }];
    g.over = false; g.checkOver(); g.score = 12450; g.lines = 42; g.maxLines = 2; g.maxCombo = 6;
  });
  ok(await page.evaluate(() => !window.__pbb.game.over), 'with a piece that still fits, the game is not over');
  await drag(page, 1, 0, 1, 'mouse');
  await page.waitForSelector('.p-score', { timeout: 6000 });
  const txt = await page.textContent('.g-panel');
  ok(/GAME OVER/i.test(txt), 'GAME OVER is shown');
  ok(/12,45\d/.test(txt) && /Personal best/i.test(txt) && /Lines cleared/i.test(txt) && /×6/.test(txt), 'final score, personal best, lines cleared and highest combo are listed');
  ok(await page.locator('.pbb-confetti').count() === 1 && /NEW PERSONAL BEST/.test(txt), 'a new record gets a celebration');
  const btns = await page.locator('.p-btns .g-btn, .p-btns a').allTextContents();
  ok(['PLAY AGAIN', 'CHANGE MODE', 'VIEW ACHIEVEMENTS', 'RETURN TO ARCADE'].every((t) => btns.some((b) => b.trim().toUpperCase() === t)), 'Play Again, Change Mode, View Achievements and Return to Arcade buttons: ' + btns.join(' | '));
  const sv = (await save(page)).games.pocketBlockBlast;
  ok(sv.highScore >= 12450 && sv.highCombo === 6 && sv.totalLines === 42 && sv.totalBlocks === 1 && sv.highScoreTime === 0, 'classic high score, combo and totals are saved (Time Attack untouched)');
  const prof = (await save(page)).profile;
  ok(!!prof.achievements.pbb_first && !!prof.achievements.pbb_double && !!prof.achievements.pbb_combo && !!prof.achievements.pbb_10k && !prof.achievements.pbb_50k, 'First Blast, Double Trouble, Combo Master and Puzzle Genius unlocked; Block Legend not');
  // play again
  await page.click('[data-act=pbb-again]'); await sleep(250);
  ok(await page.evaluate(() => window.__pbb.shell.state === 'playing' && window.__pbb.game.score === 0 && window.__pbb.game.lines === 0 && [...window.__pbb.game.board].every((v) => !v) && window.__pbb.game.undosLeft === 3 && window.__pbb.game.tray.every(Boolean)), 'PLAY AGAIN fully resets the game');
  await page.reload(); await page.waitForSelector('[data-act=start]');
  ok(/12,45\d/.test(await page.textContent('#hud-best')), 'the high score persists after a refresh: ' + await page.textContent('#hud-best'));
  await page.close();
}

console.log('Restart');
{
  const page = await fresh(ctx);
  await begin(page);
  await setup(page, { tray: [['dot'], ['dot'], ['dot']], cells: [[5, 5]] });
  await drag(page, 0, 0, 0, 'mouse');
  await page.keyboard.press('KeyR'); await sleep(250);
  ok(await page.evaluate(() => window.__pbb.game.score === 0 && window.__pbb.game.placed === 0 && window.__pbb.game.board.every((v) => !v) && window.__pbb.game.undosLeft === 3), 'R restarts with a clean board, score and undo count');
  await page.close();
}

// ------------------------------------------------------------------ time attack
console.log('Time Attack');
{
  const tctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await fresh(tctx);
  await begin(page, 'timeattack');
  ok(/3:00|2:5\d/.test(await hud(page, 'info')), 'a three-minute countdown: ' + await hud(page, 'info'));
  await sleep(1300);
  ok(/2:5\d/.test(await hud(page, 'info')), 'the clock runs');
  await page.evaluate(() => { window.__pbb.game.score = 4321; window.__pbb.G.timeLeft = 0.2; });
  await page.waitForSelector('.p-score', { timeout: 6000 });
  ok(/TIME/i.test(await page.textContent('.g-panel')) && /4,321/.test(await page.textContent('.g-panel')), 'time runs out → results with the final score');
  const sv = (await save(page)).games.pocketBlockBlast;
  ok(sv.highScoreTime === 4321 && sv.highScore === 0, 'Time Attack keeps its own high score (classic stays 0)');
  await page.click('[data-act=pbb-mode]'); await page.waitForSelector('.mode-btn');
  ok(await page.locator('.mode-btn').count() === 3, 'CHANGE MODE returns to the mode picker');
  await page.click('.mode-btn[data-mode=classic]');
  ok(await page.textContent('#hud-best') === '0' || /^--|0$/.test(await page.textContent('#hud-best')), 'the BEST shown follows the mode');
  await page.close();
}

// ------------------------------------------------------------------ daily
console.log('Daily Challenge');
{
  const dctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await fresh(dctx);
  await begin(page, 'daily');
  const a = await page.evaluate(() => { const g = window.__pbb.game; return { key: window.__pbb.G.daily.key, target: window.__pbb.G.daily.target, board: [...g.board], tray: g.tray.map((p) => p.shape.id), sets: g.setLimit }; });
  ok(a.key === new Date().toISOString().slice(0, 10), `today's challenge is dated ${a.key} (UTC)`);
  ok(a.sets === 10 && a.board.filter(Boolean).length >= 10 && a.target >= 1200, 'ten sets, a pre-filled board and a score goal');
  ok(await hud(page, 'info') === '1/10', 'the HUD tracks the set number');
  await page.reload(); await begin(page, 'daily');
  const b = await page.evaluate(() => { const g = window.__pbb.game; return { board: [...g.board], tray: g.tray.map((p) => p.shape.id), target: window.__pbb.G.daily.target }; });
  ok(JSON.stringify(a.board) === JSON.stringify(b.board) && JSON.stringify(a.tray) === JSON.stringify(b.tray) && a.target === b.target, 'reloading gives the identical board, pieces and goal');
  // beat the goal → completion is recorded
  await page.evaluate(() => { window.__pbb.game.score = window.__pbb.G.daily.target + 50; });
  await page.evaluate(() => { window.__pbb.G.ended = true; window.__pbb.finishRun(); });
  await page.waitForSelector('.p-score');
  ok(/DAILY COMPLETE/i.test(await page.textContent('.g-panel')), 'finishing above the goal shows DAILY COMPLETE');
  let sv = await save(page);
  ok(sv.games.pocketBlockBlast.highScoreDaily > 0 && sv.games.pocketBlockBlast.dailiesDone === 1 && sv.blobs.pocketBlockBlast.daily[a.key].done === true, 'daily best and completion are tracked');
  ok(!sv.profile.achievements.pbb_daily, 'Daily Player needs seven different days');
  // six more distinct days → the achievement
  await page.evaluate(() => { for (const k of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']) window.__pbb.recordDaily(k, 2000, true); });
  await page.click('[data-act=pbb-again]'); await sleep(200);
  await page.evaluate(() => { window.__pbb.game.score = window.__pbb.G.daily.target + 10; window.__pbb.G.ended = true; window.__pbb.finishRun(); });
  await page.waitForSelector('.p-score'); await sleep(300);
  sv = await save(page);
  ok(!sv.profile.achievements.pbb_daily, 'six distinct days is still not enough (replaying the same day does not count twice)');
  await page.click('[data-act=pbb-again]'); await sleep(200);
  await page.evaluate(() => { window.__pbb.recordDaily('2026-01-06', 2000, true); window.__pbb.game.score = window.__pbb.G.daily.target + 10; window.__pbb.G.ended = true; window.__pbb.finishRun(); });
  await page.waitForSelector('.p-score'); await sleep(300);
  sv = await save(page);
  ok(!!sv.profile.achievements.pbb_daily, 'seven different days unlock Daily Player');
  await page.close();
}

// ------------------------------------------------------------------ whole-game bot through the real UI
console.log('A full game through the UI');
{
  const page = await fresh(ctx);
  await begin(page);
  const r = await page.evaluate(async () => {
    const E = await import('/pocket-arcade/games/pocket-block-blast/engine.js');
    window.__pbb.newGame({ mode: 'classic', seed: 11 });
    let n = 0;
    while (!window.__pbb.game.over && n < 400) { const mv = E.botMove(window.__pbb.game); if (!mv) break; window.__pbb.commit(mv[0], mv[1], mv[2], false); n++; }
    return { n, over: window.__pbb.game.over, score: window.__pbb.game.score };
  });
  ok(r.over && r.n > 20, `a bot played ${r.n} placements through the real commit path and reached game over (score ${r.score})`);
  await page.waitForSelector('.p-score', { timeout: 6000 });
  ok(true, 'results appear after the game ends');
  await page.close();
}

ok(errors.length === 0, 'no console errors or failed requests', errors.slice(0, 4).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); srv.close && srv.close();
process.exit(fail ? 1 : 0);
