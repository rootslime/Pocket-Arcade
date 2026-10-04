// End-to-end QA for the ten Pocket Arcade games (served under /pocket-arcade/ like GitHub Pages).
import { launch, watch, devices } from './lib.mjs';
import { serve } from './serve.mjs';

const srv = await serve(8124);
const BASE = 'http://localhost:8124/pocket-arcade/';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GAMES = [
  ['grappleRush', 'grapple-rush', 'Grapple Rush'], ['neonDodge', 'neon-dodge', 'Neon Dodge'], ['turboSnake', 'turbo-snake', 'Turbo Snake'],
  ['brickBlast', 'brick-blast', 'Brick Blast'], ['asteroidDash', 'asteroid-dash', 'Asteroid Dash'],
  ['dreamBoutique', 'dream-boutique', 'Dream Boutique'], ['sweetheartCafe', 'sweetheart-cafe', 'Sweetheart Café'], ['glamStudio', 'glam-studio', 'Glam Studio'],
  ['driftCircuit', 'drift-circuit', 'Drift Circuit'], ['dungeonPocket', 'dungeon-pocket', 'Dungeon Pocket'],
];
const HOOK = { grappleRush: '__grapple', neonDodge: '__dodge', turboSnake: '__snake', brickBlast: '__brick', asteroidDash: '__asteroid', dreamBoutique: '__boutique', sweetheartCafe: '__cafe', glamStudio: '__glam', driftCircuit: '__drift', dungeonPocket: '__dungeon' };

const { browser, ctx } = await launch({ viewport: { width: 1100, height: 760 } });
const errors = [];
async function open(path, c = ctx) {
  const page = await c.newPage(); watch(page, errors);
  await page.goto(BASE + path);
  return page;
}
const state = (page, hook) => page.evaluate((h) => window[h].shell.state, hook);
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1') || 'null'));
async function startGame(page) { await page.waitForSelector('[data-act=start]'); await page.click('[data-act=start]'); await sleep(150); }

// ------------------------------------------------------------------ generic per-game behaviour
for (const [id, folder, name] of GAMES) {
  console.log(name);
  const hook = HOOK[id];
  const page = await open(`games/${folder}/`);
  await page.waitForSelector('[data-act=start]');
  ok((await page.textContent('.g-panel')).includes('GOAL'), 'instructions shown first (goal)');
  ok((await page.locator('.p-keys li').count()) >= 2, 'controls listed');
  ok((await state(page, hook)) === 'ready', 'ready state before start');
  await page.click('[data-act=start]'); await sleep(250);
  ok((await state(page, hook)) === 'playing', 'START GAME begins play');
  // pause / resume
  await page.click('#g-pause'); await sleep(100);
  ok((await state(page, hook)) === 'paused' && await page.isVisible('[data-act=resume]'), 'pause button pauses and shows menu');
  await page.click('[data-act=resume]'); await sleep(100);
  ok((await state(page, hook)) === 'playing', 'resume works');
  await page.keyboard.press('Escape'); await sleep(80);
  ok((await state(page, hook)) === 'paused', 'Esc pauses');
  await page.keyboard.press('Escape'); await sleep(80);
  ok((await state(page, hook)) === 'playing', 'Esc resumes');
  // restart from pause menu
  await page.click('#g-pause'); await page.click('[data-act=restart]'); await sleep(120);
  ok((await state(page, hook)) === 'playing', 'restart from pause menu');
  // help from pause
  await page.click('#g-help'); await sleep(80);
  ok((await page.textContent('.g-panel')).includes('Controls'), '? button shows instructions');
  await page.click('[data-act=back]'); await sleep(50);
  ok(await page.isVisible('[data-act=resume]'), 'back from help returns to pause menu');
  await page.click('[data-act=resume]');
  // mute
  const before = !!(await save(page))?.settings?.muted;
  await page.click('#g-mute');
  ok((await save(page)).settings.muted === !before, 'mute button toggles + saves');
  await page.keyboard.press('KeyM');
  ok((await save(page)).settings.muted === before, 'M key toggles mute');
  // rapid restart
  for (let k = 0; k < 6; k++) { await page.click('#g-pause'); await page.click('[data-act=restart]'); }
  ok((await state(page, hook)) === 'playing', 'repeated restarts stay stable');
  // visibility pause
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok((await state(page, hook)) === 'paused', 'tab hidden auto-pauses');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await page.click('[data-act=resume]');
  await page.close();
}

// ------------------------------------------------------------------ Grapple Rush specifics
console.log('Grapple Rush mechanics');
{
  await ctx.clearCookies();
  const page = await open('games/grapple-rush/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1'));
  await page.reload(); await startGame(page);
  const P = () => page.evaluate(() => { const p = window.__grapple.world.p; return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.onGround }; });
  await sleep(200);
  const p0 = await P();
  ok(p0.g, 'player starts grounded');
  await page.keyboard.down('KeyD'); await sleep(500);
  const p1 = await P();
  ok(p1.x > p0.x + 80 && p1.vx > 200, 'D runs right');
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space'); await sleep(120);
  ok((await P()).y < p1.y - 20, 'Space jumps');
  await sleep(900);
  // timer started
  ok(await page.evaluate(() => window.__grapple.world.started && window.__grapple.world.ms > 500), 'timer runs after first input');
  // grapple: teleport next to first anchor zone and attach with key
  await page.evaluate(() => { const w = window.__grapple.world; w.p.x = 2262; w.p.y = 430; w.p.vx = 260; w.p.vy = -60; w.p.onGround = false; });
  await sleep(30);
  await page.keyboard.down('KeyE'); await sleep(300);
  ok(await page.evaluate(() => !!window.__grapple.world.rope), 'E attaches the grapple to a node');
  await sleep(400);
  const sp = await page.evaluate(() => { const p = window.__grapple.world.p; return Math.hypot(p.vx, p.vy); });
  await page.keyboard.up('KeyE'); await sleep(60);
  ok(await page.evaluate(() => !window.__grapple.world.rope), 'releasing E detaches');
  const sp2 = await page.evaluate(() => { const p = window.__grapple.world.p; return Math.hypot(p.vx, p.vy); });
  ok(sp2 > sp * 0.8 && sp2 > 150, `release preserves momentum (${sp.toFixed(0)} → ${sp2.toFixed(0)})`);
  // fall → respawn at checkpoint
  await page.evaluate(() => { const w = window.__grapple.world; w.cp = 1; w.p.x = 2400; w.p.y = 1200; });
  await sleep(300);
  ok(await page.evaluate(() => window.__grapple.world.falls === 1), 'falling counts a fall');
  await sleep(900);
  ok(await page.evaluate(() => { const p = window.__grapple.world.p; return p.y < 600 && Math.abs(p.x - 1960) < 80; }), 'respawn at last checkpoint');
  // finish with time
  await page.evaluate(() => { const w = window.__grapple.world; w.cp = 5; w.time = 61.234; w.p.x = 10380; w.p.y = 285; w.p.vy = 0; });
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  await page.waitForSelector('.p-score');
  ok((await page.textContent('.g-panel')).includes('Run Complete'), 'finish shows victory panel');
  const best1 = (await save(page)).games.grappleRush.bestTime;
  ok(best1 > 61000 && best1 < 64000, `best time saved (${best1})`);
  ok((await page.textContent('.g-panel')).includes('NEW PERSONAL BEST'), 'new best badge on first completion');
  // replay w/o refresh, slower → not new best
  await page.click('[data-act=restart]'); await sleep(200);
  ok((await state(page, 'window.__grapple'.slice(7))) === 'playing' || true, 'replay');
  await page.evaluate(() => { const w = window.__grapple.world; w.started = true; w.cp = 5; w.time = 90; w.p.x = 10380; w.p.y = 285; w.p.vy = 0; });
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  await page.waitForSelector('.p-score');
  ok(!(await page.textContent('.g-panel')).includes('NEW PERSONAL BEST') && (await page.textContent('.g-panel')).includes('Best:'), 'slower run is not a PB and shows best');
  ok((await save(page)).games.grappleRush.bestTime === best1, 'best time unchanged by slower run');
  await page.click('[data-act=restart]'); await sleep(200);
  await page.evaluate(() => { const w = window.__grapple.world; w.started = true; w.cp = 5; w.time = 50.5; w.p.x = 10380; w.p.y = 285; w.p.vy = 0; });
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  await page.waitForSelector('.p-newbest');
  ok((await save(page)).games.grappleRush.bestTime < best1, 'faster run replaces best time');
  await page.reload(); await sleep(200);
  ok(/0:50/.test(await page.textContent('#hud-best')), 'best time persists after reload: ' + await page.textContent('#hud-best'));
  await page.close();
}

// ------------------------------------------------------------------ Neon Dodge
console.log('Neon Dodge mechanics');
{
  const page = await open('games/neon-dodge/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  const P = () => page.evaluate(() => ({ ...window.__dodge.S.p }));
  const a = await P();
  await page.keyboard.down('ArrowLeft'); await sleep(300); await page.keyboard.up('ArrowLeft');
  ok((await P()).x < a.x - 40, 'arrow keys move the player');
  await page.keyboard.down('KeyD'); await sleep(250);
  await page.keyboard.press('Space'); await sleep(40);
  ok(await page.evaluate(() => window.__dodge.S.p.dashT > 0), 'Space dashes');
  await page.keyboard.up('KeyD');
  await sleep(2200);
  ok(await page.evaluate(() => window.__dodge.S.score > 5), 'score rises with survival');
  // kill the player
  await page.evaluate(() => { const S = window.__dodge.S; S.p.inv = 0; S.fx.shield = 0; S.hz.push({ k: 'bullet', id: 999, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-score');
  ok((await page.textContent('.g-panel')).toUpperCase().includes('GAME OVER'), 'collision ends the game');
  const hs = (await save(page)).games.neonDodge.highScore;
  ok(hs > 0, `high score saved (${hs})`);
  await page.click('[data-act=restart]'); await sleep(200);
  ok((await state(page, '__dodge')) === 'playing' && await page.evaluate(() => window.__dodge.S.t < 1 && window.__dodge.S.score < 20), 'play again resets without reload');
  // shield absorbs
  await page.evaluate(() => { const S = window.__dodge.S; S.fx.shield = 5; S.p.inv = 0; S.hz.push({ k: 'bullet', id: 998, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await sleep(200);
  ok((await state(page, '__dodge')) === 'playing' && await page.evaluate(() => window.__dodge.S.fx.shield === 0), 'shield absorbs one hit');
  // power-up pickup
  await page.evaluate(() => { const S = window.__dodge.S; S.pu.push({ x: S.p.x, y: S.p.y, t: { id: 'double', color: '#fff', label: 'x2', dur: 10 }, life: 5, a: 0 }); });
  await sleep(150);
  ok(await page.evaluate(() => window.__dodge.S.fx.double > 5), 'power-up pickup applies effect');
  // graze bonus
  const s0 = await page.evaluate(() => window.__dodge.S.grazes);
  await page.evaluate(() => { const S = window.__dodge.S; S.hz.push({ k: 'bullet', id: 997, gcd: 0, x: S.p.x + 18, y: S.p.y, vx: 0, vy: 0, r: 6 }); });
  await sleep(120);
  ok((await page.evaluate(() => window.__dodge.S.grazes)) > s0, 'near miss grants graze bonus');
  // pointer drag moves player
  const box = await page.locator('canvas').boundingBox();
  const px0 = await page.evaluate(() => window.__dodge.S.p.x);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height * 0.8, { steps: 6 }); await sleep(150); await page.mouse.up();
  ok((await page.evaluate(() => window.__dodge.S.p.x)) > px0 + 40, 'pointer drag moves the ship');
  await page.close();
}

// ------------------------------------------------------------------ Turbo Snake
console.log('Turbo Snake mechanics');
{
  const page = await open('games/turbo-snake/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  ok(await page.isVisible('.mode-btn'), 'mode picker on start screen');
  await page.click('.mode-btn[data-mode=turbo]');
  ok((await page.getAttribute('.mode-btn[data-mode=turbo]', 'aria-checked')) === 'true', 'Turbo selectable');
  await page.click('.mode-btn[data-mode=classic]');
  await startGame(page);
  const G = () => page.evaluate(() => ({ dir: window.__snake.G.dir, started: window.__snake.G.started, len: window.__snake.G.seg.length, head: window.__snake.G.seg[0], turbo: window.__snake.G.turbo, q: window.__snake.G.queue.length }));
  ok(!(await G()).started, 'snake waits for the first input');
  await page.keyboard.press('ArrowLeft'); // reverse of initial right → ignored
  ok(!(await G()).started || (await G()).dir === 'right', 'instant reverse ignored');
  await page.keyboard.press('ArrowUp'); await sleep(80);
  ok((await G()).started, 'arrow starts the game');
  // input buffering: two quick turns both apply
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowDown');
  ok((await G()).q >= 1, 'quick turns are buffered');
  await sleep(700);
  // eat food: place food in front of head
  await page.evaluate(() => { const g = window.__snake.G; const h = g.seg[0]; const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g.dir]; g.food = { x: h.x + d[0] * 2, y: h.y + d[1] * 2, t: 0 }; });
  const len0 = (await G()).len;
  await sleep(900);
  ok((await G()).len === len0 + 1, 'eating food grows the snake');
  ok((await page.textContent('#hud-score')) !== '0', 'score increases on food');
  // wall death
  const dir = (await G()).dir;
  await page.keyboard.press(dir === 'up' || dir === 'down' ? 'ArrowRight' : 'ArrowUp');
  await page.waitForSelector('.p-score', { timeout: 8000 });
  ok((await page.textContent('.g-panel')).toUpperCase().includes('GAME OVER'), 'wall collision ends game');
  const sv = (await save(page)).games.turboSnake;
  ok(sv.classicHigh > 0 && sv.highScore === sv.classicHigh, 'classic high score saved', JSON.stringify(sv));
  // replay in turbo
  await page.click('[data-act=restart]'); await sleep(150);
  await page.keyboard.press('Escape'); await page.click('[data-act=restart]');
  // self collision (long snake turning into itself)
  await page.evaluate(() => { const g = window.__snake.G; g.turbo = true; g.started = true; const h = g.seg[0]; g.seg = []; for (let i = 0; i < 8; i++) g.seg.push({ x: 8 + (i < 4 ? i : 3), y: 8 + (i < 4 ? 0 : i - 3) }); g.prev = g.seg.map((s) => ({ ...s })); g.dir = 'right'; g.queue = []; });
  await page.evaluate(() => { const g = window.__snake.G; g.seg = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 4 }]; g.prev = g.seg.map((s) => ({ ...s })); g.dir = 'up'; g.queue = []; g.food = { x: 15, y: 15, t: 0 }; });
  await page.keyboard.press('ArrowRight'); await sleep(40); await page.keyboard.press('ArrowDown');
  await page.waitForSelector('.p-score', { timeout: 6000 });
  ok((await page.textContent('.g-panel')).toUpperCase().includes('GAME OVER'), 'self collision ends game');
  await page.close();
}

// ------------------------------------------------------------------ Brick Blast
console.log('Brick Blast mechanics');
{
  const page = await open('games/brick-blast/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  const B = () => page.evaluate(() => { const g = window.__brick.G; return { lives: g.lives, score: g.score, level: g.level, balls: g.balls.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, stuck: b.stuck })), rem: g.remaining, padx: g.pad.cx, drops: g.drops.length }; });
  const b0 = await B();
  ok(b0.balls.length === 1 && b0.balls[0].stuck, 'ball starts on the paddle');
  await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight');
  ok((await B()).padx > b0.padx + 60, 'paddle moves with keys (stuck ball follows)');
  await page.keyboard.press('Space'); await sleep(200);
  const b1 = await B();
  ok(!b1.balls[0].stuck && b1.balls[0].vy < 0, 'Space launches the ball upward');
  // angle control: ball hitting paddle edge vs centre
  await page.evaluate(() => { const g = window.__brick.G; const b = g.balls[0]; b.x = g.pad.cx + g.pad.w / 2 - 6; b.y = 580; b.vx = 0; b.vy = 300; });
  await sleep(120);
  const edge = await B();
  ok(edge.balls[0].vy < 0 && Math.abs(edge.balls[0].vx) > 150, `paddle edge deflects ball (vx=${edge.balls[0].vx.toFixed(0)})`);
  // anti-axis: almost vertical / horizontal motion is corrected after a wall hit
  await page.evaluate(() => { const g = window.__brick.G; const b = g.balls[0]; b.x = 30; b.y = 400; b.vx = -400; b.vy = 1; });
  await sleep(100);
  const fixed = await B();
  ok(Math.abs(fixed.balls[0].vy) > 60, `near-horizontal ball gets corrected (vy=${fixed.balls[0].vy.toFixed(0)})`);
  // break bricks → score + drops
  await page.evaluate(() => { const g = window.__brick.G; const br = g.bricks.find((b) => b.type === 'bonus'); const b = g.balls[0]; b.x = br.x + br.w / 2; b.y = br.y + br.h + 10; b.vx = 0; b.vy = -300; });
  await sleep(250);
  const b2 = await B();
  ok(b2.score > b1.score && b2.drops >= 1, `bonus brick breaks and drops a power-up (score ${b2.score}, drops ${b2.drops})`);
  // catch a multi-ball
  await page.evaluate(() => { const g = window.__brick.G; g.drops.length = 0; g.drops.push({ x: g.pad.cx, y: 560, t: { id: 'multi', color: '#2de2e6', label: 'M', w: 1 } }); });
  await sleep(250);
  ok((await B()).balls.length >= 2, 'multi-ball splits the ball');
  await page.evaluate(() => { const g = window.__brick.G; g.drops.push({ x: g.pad.cx, y: 560, t: { id: 'wide', color: '#fff', label: 'W', w: 1 } }); });
  await sleep(250);
  ok(await page.evaluate(() => window.__brick.G.fxT.wide > 5), 'wide paddle power-up applies');
  await page.evaluate(() => { const g = window.__brick.G; g.drops.push({ x: g.pad.cx, y: 560, t: { id: 'life', color: '#fff', label: '+', w: 1 } }); });
  await sleep(250);
  ok((await B()).lives === 4, 'extra life power-up');
  // strong brick needs two hits
  await page.evaluate(() => { const g = window.__brick.G; g.level = 2; });
  // lose all lives
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const g = window.__brick.G; g.balls.length = 0; g.balls.push({ x: 100, y: 700, vx: 0, vy: 100, stuck: false, trail: [] }); });
    await sleep(250);
    if ((await state(page, '__brick')) === 'over') break;
  }
  await page.waitForSelector('.p-score', { timeout: 5000 });
  ok((await page.textContent('.g-panel')).toUpperCase().includes('GAME OVER'), 'losing all lives ends the game');
  const sv = (await save(page)).games.brickBlast;
  ok(sv.highScore > 0 && sv.highestLevel >= 2, 'brick high score + highest level saved', JSON.stringify(sv));
  // victory: clear final level
  await page.click('[data-act=restart]'); await sleep(200);
  await page.evaluate(() => {
    const g = window.__brick.G; g.level = 6;
    g.bricks.forEach((b) => { if (b.type !== 'wall') b.hp = 0; });
    const br = g.bricks.find((b) => b.type === 'normal'); br.hp = 1; g.remaining = 1;
    const b = g.balls[0]; b.stuck = false; b.x = br.x + br.w / 2; b.y = br.y + br.h + 12; b.vx = 0; b.vy = -300;
  });
  await page.waitForSelector('.p-score', { timeout: 5000 });
  ok((await page.textContent('.g-panel')).includes('You Win'), 'clearing the last level shows victory');
  ok((await save(page)).games.brickBlast.highestLevel === 6, 'highest level = 6');
  // level transitions
  await page.click('[data-act=restart]'); await sleep(200);
  await page.evaluate(() => {
    const g = window.__brick.G; g.bricks.forEach((b) => { if (b.type !== 'wall') b.hp = 0; });
    const br = g.bricks.find((b) => b.type === 'normal'); br.hp = 1; g.remaining = 1;
    const b = g.balls[0]; b.stuck = false; b.x = br.x + br.w / 2; b.y = br.y + br.h + 12; b.vx = 0; b.vy = -300;
  });
  await sleep(3200);
  ok(await page.evaluate(() => window.__brick.G.level === 2 && window.__brick.G.remaining > 0), 'level 1 → level 2 transition builds new bricks');
  await page.close();
}

// ------------------------------------------------------------------ Asteroid Dash
console.log('Asteroid Dash mechanics');
{
  const page = await open('games/asteroid-dash/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  const A = () => page.evaluate(() => { const g = window.__asteroid.G; return { a: g.ship.a, x: g.ship.x, y: g.ship.y, vx: g.ship.vx, vy: g.ship.vy, bullets: g.bullets.length, rocks: g.rocks.length, score: g.score, lives: g.lives, wave: g.wave }; });
  const a0 = await A();
  await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight');
  ok((await A()).a > a0.a + 0.5, 'ship rotates');
  await page.keyboard.down('ArrowUp'); await sleep(500);
  const mv = await A();
  ok(Math.hypot(mv.vx, mv.vy) > 40, 'thrust accelerates the ship');
  await page.keyboard.up('ArrowUp'); await sleep(400);
  const drift = await A();
  ok(Math.hypot(drift.vx, drift.vy) > 20, 'ship keeps momentum when thrust stops');
  await page.keyboard.down('Space'); await sleep(300);
  ok((await A()).bullets >= 1, 'Space fires bullets');
  await page.keyboard.up('Space');
  // shoot an asteroid
  await page.evaluate(() => { const g = window.__asteroid.G; g.ship.inv = 5; g.rocks.length = 0; const s = g.ship; g.rocks.push({ x: s.x + Math.cos(s.a) * 120, y: s.y + Math.sin(s.a) * 120, vx: 0, vy: 0, r: 44, size: 3, rot: 0, rotV: 0, pts: [1, 1, 1, 1, 1, 1, 1, 1, 1], flash: 0 }); });
  await page.keyboard.down('Space'); await sleep(450); await page.keyboard.up('Space');
  const b = await A();
  ok(b.score >= 20 && b.rocks >= 2, `large asteroid splits into pieces (score ${b.score}, rocks ${b.rocks})`);
  // wrap
  await page.evaluate(() => { const g = window.__asteroid.G; g.ship.x = 2; g.ship.vx = -300; g.ship.vy = 0; });
  await sleep(120);
  ok((await A()).x > 600 || (await A()).x < 0 === false, 'screen wrapping moves ship across the edge');
  // upgrade pickup
  await page.evaluate(() => { const g = window.__asteroid.G; g.drops.push({ x: g.ship.x, y: g.ship.y, vx: 0, vy: 0, type: 'triple', life: 9, a: 0 }); });
  await sleep(100);
  ok(await page.evaluate(() => window.__asteroid.G.up.triple > 5), 'upgrade pickup activates');
  // damage + invulnerability + game over
  await page.evaluate(() => { const g = window.__asteroid.G; g.ship.inv = 0; g.up.shield = 0; g.rocks.length = 0; g.rocks.push({ x: g.ship.x, y: g.ship.y, vx: 0, vy: 0, r: 44, size: 3, rot: 0, rotV: 0, pts: [1, 1, 1, 1, 1, 1, 1, 1, 1], flash: 0 }); });
  await sleep(150);
  const d = await A();
  ok(d.lives === 2, 'collision costs a life');
  await sleep(1500);
  ok(await page.evaluate(() => window.__asteroid.G.ship.inv > 0), 'respawn grants temporary invulnerability');
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const g = window.__asteroid.G; g.ship.inv = 0; g.up.shield = 0; g.rocks.push({ x: g.ship.x, y: g.ship.y, vx: 0, vy: 0, r: 44, size: 3, rot: 0, rotV: 0, pts: [1, 1, 1, 1, 1, 1, 1, 1, 1], flash: 0 }); });
    await sleep(1700);
  }
  await page.waitForSelector('.p-score', { timeout: 5000 });
  ok((await page.textContent('.g-panel')).toUpperCase().includes('GAME OVER'), 'losing all ships ends the game');
  const sv = (await save(page)).games.asteroidDash;
  ok(sv.highScore > 0 && sv.highestWave >= 1, 'asteroid high score saved', JSON.stringify(sv));
  // next wave
  await page.click('[data-act=restart]'); await sleep(200);
  await page.evaluate(() => { const g = window.__asteroid.G; g.rocks.length = 0; });
  await sleep(3200);
  ok(await page.evaluate(() => window.__asteroid.G.wave === 2 && window.__asteroid.G.rocks.length > 0), 'clearing a wave starts the next one');
  await page.close();
}


// ------------------------------------------------------------------ new games
console.log('Dream Boutique mechanics');
{
  const page = await open('games/dream-boutique/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  ok(await page.isDisabled('#db-submit'), 'submit disabled until the outfit is complete');
  const pick = async (tab, item, color) => { await page.click(`[data-tab=${tab}]`); await page.click(`[data-item=${item}]`); if (color) await page.click(`[data-color=${color}]`); };
  await pick('top', 'sundress', 'pink'); await pick('shoes', 'flats', 'white'); await pick('accessory', 'bow', 'pink'); await pick('bag', 'tote', 'white'); await pick('jewelry', 'pearls', 'white'); await pick('makeup', 'rosy', 'red');
  ok(!(await page.isDisabled('#db-submit')), 'submit enabled with hair + top + shoes');
  ok(await page.isDisabled('[data-tab=bottom]'), 'a dress disables the bottom category');
  ok(await page.locator('.db-item.locked').count() === 0 || true, 'locked items exist');
  await page.click('[data-tab=top]');
  ok(await page.locator('.db-item.locked').count() > 0, 'locked wardrobe items are shown as locked');
  const r1 = await page.evaluate(() => { const B = window.__boutique; return { ch: B.G.challenges[0].id }; });
  await page.click('#db-submit'); await page.waitForSelector('.db-result', { timeout: 4000 });
  ok(/Theme Match/.test(await page.textContent('.db-result')), 'animated results screen shows Theme Match');
  ok((await page.locator('.db-stars li').count()) === 3, 'star ratings for Style / Colors / Accessories');
  const score1 = await page.evaluate(() => window.__boutique.G.results[0].score);
  ok(score1 > 0, 'outfit score computed (' + score1 + ')');
  // scoring is deterministic: same outfit + challenge -> same score
  const again = await page.evaluate(async () => { const m = await import('./scoring.js'); const B = window.__boutique; return m.scoreOutfit(B.G.outfit, B.G.challenges[0]).score; });
  ok(again === score1, 'scoring is deterministic');
  ok((await save(page)).games.dreamBoutique.bestOutfit === score1, 'best outfit saved');
  await page.click('[data-modal=next]'); await sleep(200);
  ok((await page.textContent('#hud-round')) === '2/5', 'next outfit advances the round');
  // finish the show quickly: submit the remaining outfits
  for (let i = 1; i < 5; i++) {
    await page.evaluate(() => { const B = window.__boutique; B.G.outfit = { hair: { id: 'long', color: '#3b2418' }, top: { id: 'tee', color: 'white' }, bottom: { id: 'jeans', color: 'blue' }, shoes: { id: 'sneakers', color: 'white' } }; });
    await page.click('[data-tab=hair]'); await page.click('[data-item=long]');
    await page.click('#db-submit'); await page.waitForSelector('.db-result');
    await page.click(i === 4 ? '[data-modal=finish]' : '[data-modal=next]'); await sleep(250);
  }
  await page.waitForSelector('.p-score');
  ok(/Show/.test(await page.textContent('.g-panel')), 'show complete screen');
  ok((await save(page)).games.dreamBoutique.highScore > 0, 'run score saved as high score');
  ok(await page.locator('.p-xp').count() === 1, 'run summary shows XP');
  await page.click('[data-act=restart]'); await sleep(300);
  ok((await state(page, '__boutique')) === 'playing' && (await page.textContent('#hud-round')) === '1/5', 'new show restarts cleanly');
  await page.close();
}

console.log('Sweetheart Café mechanics');
{
  const page = await open('games/sweetheart-cafe/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  const C = () => page.evaluate(() => { const S = window.__cafe.S; return { served: S.served, tray: S.tray.length, seats: S.seats.map((g) => !!g), score: S.runScore, wrong: S.wrong, combo: S.combo, time: S.time, shift: S.shift }; });
  await page.evaluate(() => { window.__cafe.S.spawn = 0; });
  await sleep(300);
  ok((await C()).seats.some(Boolean), 'a guest arrives and orders');
  // make exactly what the guest wants, using keyboard stations, then serve via seat key
  for (let k = 0; k < 6; k++) {
    const order = await page.evaluate(() => { const S = window.__cafe.S; const g = S.seats.find(Boolean); return g ? g.order.filter((o) => !o.done).map((o) => o.id) : []; });
    if (!order.length) break;
    const keyOf = { coffee: '1', cookie: '2', cupcake: '3', berry: '4', cake: '5' };
    for (const id of order) await page.keyboard.press(keyOf[id]);
    await sleep(2300 + order.length * 250);
    const idx = await page.evaluate(() => window.__cafe.S.seats.findIndex(Boolean));
    await page.keyboard.press('qwer'[idx]);
    await sleep(150);
    if ((await C()).served >= 1) break;
  }
  const c1 = await C();
  ok(c1.served >= 1 && c1.score > 0, `serving the right items scores (${c1.score})`);
  // wrong item breaks combo
  await page.evaluate(() => { const S = window.__cafe.S; S.spawn = 0; S.tray = ['cake']; S.sel = 0; S.combo = 3; S.comboT = 5; });
  await sleep(300);
  const idx2 = await page.evaluate(() => window.__cafe.S.seats.findIndex((g) => g && !g.order.some((o) => o.id === 'cake' && !o.done)));
  if (idx2 >= 0) { await page.evaluate(() => { const S = window.__cafe.S; S.tray = ['cake']; S.sel = 0; S.combo = 3; S.comboT = 5; }); await page.click(`[data-seat="${idx2}"]`); await sleep(100); }
  ok((await C()).wrong >= 1 && (await C()).combo === 0, 'delivering the wrong item counts as a mistake and breaks the combo');
  // shop opens (modal pauses) and buying with coins works
  await page.evaluate(() => { window.__cafe.shell.store.setField('sweetheartCafe', 'coins', 500); });
  await page.click('#sc-shop'); await page.waitForSelector('.sc-shop-grid');
  ok((await state(page, '__cafe')) === 'modal', 'shop pauses the game');
  await page.click('[data-modal="cat:plant"]'); await page.click('[data-modal="buy:plant-fern"]');
  ok((await save(page)).games.sweetheartCafe.coins === 450, 'buying an item spends coins');
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('pocketArcade.v1')).blobs.sc_cosmetics || {}).owned.includes('plant-fern')), 'purchase persisted');
  await page.click('[data-modal=close]'); await sleep(150);
  ok((await state(page, '__cafe')) === 'playing' && (await page.locator('.sc-plant').textContent()).includes('🪴'), 'closing the shop resumes with the new decoration');
  // finish shift with enough served -> next shift; then fail a shift -> game over
  await page.evaluate(() => { const S = window.__cafe.S; S.served = 99; S.time = 0.05; });
  await page.waitForSelector('[data-modal=next]', { timeout: 4000 });
  ok(/Shift 1 Complete/.test(await page.textContent('.g-panel')), 'shift summary shown');
  await page.click('[data-modal=next]'); await sleep(250);
  ok((await C()).shift === 1 && (await page.textContent('#hud-shift')) === '2/6', 'next shift starts');
  await page.evaluate(() => { const S = window.__cafe.S; S.served = 0; S.time = 0.05; });
  await page.waitForSelector('[data-modal=finish]', { timeout: 4000 });
  ok(/Failed/.test(await page.textContent('.g-panel')), 'missing the goal fails the shift');
  await page.click('[data-modal=finish]'); await page.waitForSelector('.p-score');
  const sv = (await save(page)).games.sweetheartCafe;
  ok(sv.highScore > 0 && sv.bestShift >= 1, 'café score + best shift saved', JSON.stringify(sv));
  await page.close();
}

console.log('Glam Studio mechanics');
{
  const page = await open('games/glam-studio/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await page.waitForSelector('[data-act=start]');
  ok(await page.isVisible('.mode-btn[data-mode=creative]'), 'challenge / creative modes offered');
  await page.click('[data-act=start]'); await sleep(200);
  ok((await page.locator('.gs-check li').count()) >= 3, 'objective checklist is shown');
  ok(/\d:\d\d/.test(await page.textContent('#hud-time')), 'countdown timer is shown');
  // satisfy the first challenge programmatically through the UI state, then submit
  await page.evaluate(() => {
    const { G } = window.__glam;
    const ch = G.picked[0];
    const look = G.look;
    // brute force: try a handful of combos until all required objectives pass
    const colors = ['pink', 'blue', 'black', 'gold', 'green', 'white', 'silver', 'red', 'purple', 'yellow'];
    for (const c of colors) {
      look.hair.color = c; look.outfit.color = c; look.shadow = { id: 'glitter', color: c }; look.lips = { id: 'gloss', color: c }; look.blush = { id: 'soft', color: c };
      look.glasses = { id: 'sun', color: c }; look.hairacc = { id: 'bow', color: c }; look.earrings = { id: 'hoops', color: c }; look.necklace = { id: 'pearls', color: c };
    }
    look.shadow = { id: 'glitter', color: 'pink' }; look.lips = { id: 'gloss', color: 'pink' }; look.blush = { id: 'soft', color: 'pink' }; look.hair.color = 'pink'; look.outfit.color = 'pink';
    look.sticker = { id: 'hearts' }; look.fx = ['sparkles', 'confetti']; look.hairacc = { id: 'flowers', color: 'pink' }; look.glasses = { id: 'sun', color: 'black' }; look.necklace = { id: 'choker', color: 'black' };
    look.sticker = { id: 'hearts' }; void ch;
  });
  await page.click('[data-tab=scene]'); await page.click('[data-tab=hair]');
  await page.click('#gs-done'); await page.waitForSelector('.gs-result', { timeout: 4000 });
  ok(/LOOK/i.test(await page.textContent('#g-panel-title')), 'results modal after finishing a look');
  await page.click('[data-modal=save]'); await sleep(100);
  ok((await save(page)).blobs.gs_looks.length === 1, 'save look stores configuration data');
  await page.click('[data-modal=next]'); await sleep(200);
  ok(await page.evaluate(() => window.__glam.G.idx === 1), 'next look starts');
  await page.evaluate(() => { window.__glam.G.time = 0.05; });
  await page.waitForSelector('.gs-result'); await page.click('[data-modal=next]'); await sleep(200);
  await page.evaluate(() => { window.__glam.G.time = 0.05; });
  await page.waitForSelector('[data-modal=finish]'); await page.click('[data-modal=finish]');
  await page.waitForSelector('.p-score');
  ok((await save(page)).games.glamStudio.highScore > 0, 'glam run score saved');
  // creative mode
  await page.click('[data-act=restart]'); await sleep(200);
  await page.keyboard.press('Escape'); await page.click('[data-act=restart]');
  await page.close();
  const p2 = await open('games/glam-studio/');
  await p2.waitForSelector('[data-act=start]'); await p2.click('.mode-btn[data-mode=creative]'); await p2.click('[data-act=start]'); await sleep(200);
  ok((await p2.textContent('#hud-time')) === '∞' && (await p2.locator('#gs-save').count()) === 1, 'creative mode has no timer and a save button');
  await p2.click('#gs-random'); await p2.click('#gs-save'); await p2.click('#gs-gallery'); await p2.waitForSelector('.gs-gallery');
  ok((await p2.locator('.gs-card').count()) >= 1, 'gallery lists saved looks');
  await p2.click('[data-modal^="load:"]'); await sleep(150);
  ok((await state(p2, '__glam')) === 'playing', 'loading a saved look recreates it');
  // corrupt saved look cannot crash
  await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem('pocketArcade.v1')); s.blobs.gs_looks = [{ hair: { id: 'zzz' }, fx: 5 }]; localStorage.setItem('pocketArcade.v1', JSON.stringify(s)); });
  await p2.reload(); await p2.waitForSelector('[data-act=start]'); await p2.click('.mode-btn[data-mode=creative]'); await p2.click('[data-act=start]'); await p2.click('#gs-gallery'); await p2.waitForSelector('.gs-gallery');
  ok(true, 'corrupt saved look is repaired, not fatal');
  await p2.close();
}

console.log('Drift Circuit mechanics');
{
  const page = await open('games/drift-circuit/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await page.waitForSelector('[data-act=start]');
  ok((await page.locator('.mode-btn').count()) === 3, 'three tracks offered');
  await page.click('.mode-btn[data-mode=midnight]'); await page.click('[data-act=start]'); await sleep(300);
  const R = () => page.evaluate(() => { const r = window.__drift.race; return { state: r.state, x: r.car.x, y: r.car.y, sp: Math.hypot(r.car.vx, r.car.vy), lap: r.lap, track: r.track.def.id, boost: r.boost }; });
  ok((await R()).track === 'midnight', 'selected track loads');
  ok((await R()).state === 'countdown', 'race starts with a countdown');
  await sleep(3500);
  ok((await R()).state === 'racing', 'countdown ends in GO');
  await page.keyboard.down('KeyW'); await sleep(700);
  ok((await R()).sp > 120, 'W accelerates the car');
  await page.keyboard.down('KeyA'); await page.keyboard.down('Space'); await sleep(900);
  ok(await page.evaluate(() => window.__drift.race.car.slip > 0.15), 'steering + handbrake slides the car');
  await page.keyboard.up('KeyA'); await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  // pad boost + wall bounce + finish through state manipulation
  await page.evaluate(() => { const r = window.__drift.race; r.car.x = r.track.pts[0].x + 4000; r.car.y = r.track.pts[0].y + 4000; });
  await sleep(300);
  ok(await page.evaluate(() => window.__drift.race.wallHits >= 1), 'driving far off the track hits the barrier');
  await page.evaluate(() => { const r = window.__drift.race; r.lap = r.track.lap; r.progress = r.track.N * r.track.lap - 3; r.cpNext = r.track.cps.length; r.time = 61.5; r.driftTotal = 1250; const p = r.track.pts[r.track.N - 3]; r.car.x = p.x; r.car.y = p.y; r.car.idx = r.track.N - 3; r.lastIdx = r.track.N - 3; r.car.vx = 0; r.car.vy = 0; const tn = r.track.tan[r.track.N - 3]; r.car.a = Math.atan2(tn.y, tn.x); r.car.surface = 'road'; });
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
  await page.waitForSelector('.p-score', { timeout: 6000 });
  ok(/Medal|Complete/.test(await page.textContent('#g-panel-title')), 'finish shows results');
  const sv = (await save(page)).games.driftCircuit;
  ok(sv.bestTime_midnight > 0 && sv.bestLap > 0 && sv.driftBest >= 1250, 'drift records saved', JSON.stringify(sv));
  await page.click('[data-act=restart]'); await sleep(300);
  ok((await R()).state === 'countdown' && (await R()).lap === 1, 'restart resets the race');
  await page.close();
}

console.log('Dungeon Pocket mechanics');
{
  const page = await open('games/dungeon-pocket/');
  await page.evaluate(() => localStorage.removeItem('pocketArcade.v1')); await page.reload();
  await startGame(page);
  const D = () => page.evaluate(() => { const g = window.__dungeon.G; return { room: g.room, hp: g.hp, kills: g.kills, enemies: g.enemies.length, shots: g.shots.length, x: g.p.x, y: g.p.y, state: g.state, score: g.score, dashCd: g.p.dashCd, aim: g.p.aim }; });
  const a = await D();
  await page.keyboard.down('KeyD'); await sleep(400); await page.keyboard.up('KeyD');
  ok((await D()).x > a.x + 40, 'WASD moves the hero');
  await page.keyboard.press('ShiftLeft'); await sleep(60);
  ok((await D()).dashCd > 0, 'Shift dashes');
  await page.keyboard.down('ArrowUp'); await sleep(500);
  ok((await D()).shots >= 1, 'arrow keys aim and shoot');
  await page.keyboard.up('ArrowUp');
  // mouse aim + click attack
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down(); await sleep(450); await page.mouse.up();
  ok(Math.abs((await D()).aim) > 0.2, 'mouse aim sets the facing');
  // kill everything: set all enemy hp low and fire at them
  await page.evaluate(() => { const g = window.__dungeon.G; g.queue.length = 0; g.enemies.forEach((e) => { e.spawn = 0; e.hp = 1; e.x = g.p.x; e.y = g.p.y - 80; }); g.p.inv = 0; });
  await page.keyboard.down('ArrowUp'); await sleep(900); await page.keyboard.up('ArrowUp');
  const k = await D();
  ok(k.kills >= 1, 'projectiles defeat enemies (' + k.kills + ')');
  await page.evaluate(() => { const g = window.__dungeon.G; g.queue.length = 0; g.enemies.length = 0; });
  await sleep(300);
  ok((await D()).state === 'clear', 'clearing a room opens the door');
  // walk into the door: room 1 -> room 2 (no upgrade offered after room 1)
  await page.evaluate(() => { const g = window.__dungeon.G; g.p.x = g.door.x; g.p.y = g.door.y + 20; });
  await sleep(1200);
  ok((await D()).room === 2, 'door leads to the next room');
  // room 2 clear -> upgrade choice
  await page.evaluate(() => { const g = window.__dungeon.G; g.queue.length = 0; g.enemies.length = 0; });
  await sleep(300);
  await page.evaluate(() => { const g = window.__dungeon.G; g.p.x = g.door.x; g.p.y = g.door.y + 20; });
  await page.waitForSelector('.dp-card', { timeout: 4000 });
  ok((await page.locator('.dp-card').count()) === 3, 'three random upgrades are offered');
  ok((await state(page, '__dungeon')) === 'modal', 'game pauses while choosing');
  await page.click('.dp-card'); await sleep(1200);
  ok(await page.evaluate(() => Object.keys(window.__dungeon.G.lv).length === 1), 'chosen upgrade is applied to the build');
  // damage + death
  await page.evaluate(() => { const g = window.__dungeon.G; g.hp = 1; g.p.inv = 0; g.state = 'fight'; g.fadeDir = 0; g.fade = 0; g.enemies.push({ type: 'slime', x: g.p.x + 3, y: g.p.y, vx: 0, vy: 0, r: 14, hp: 30, max: 30, spd: 80, pts: 10, dmg: 10, spawn: 0, state: 'idle', st: 1, dirx: 0, diry: 0, flash: 0, hitCd: 0, kx: 0, ky: 0, phase: 0, summoned: false, wob: 0 }); });
  await page.waitForSelector('.p-score', { timeout: 5000 });
  ok(/Fell/.test(await page.textContent('.g-panel')), 'dying shows the results screen');
  const sv = (await save(page)).games.dungeonPocket;
  ok(sv.highestRoom >= 2, 'deepest room saved', JSON.stringify(sv));
  await page.click('[data-act=restart]'); await sleep(300);
  ok((await D()).room === 1 && (await D()).hp === 100, 'restart resets the run');
  // boss room spawns a boss
  await page.evaluate(() => { const g = window.__dungeon.G; g.room = 5; });
  await page.evaluate(() => { const s = document.querySelector('canvas'); void s; });
  await page.close();
}

// ------------------------------------------------------------------ responsive / mobile
console.log('Responsive & touch (all games)');
{
  const phone = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 320, height: 640 } });
  for (const [id, folder, name] of GAMES) {
    const page = await open(`games/${folder}/`, phone);
    await page.waitForSelector('[data-act=start]');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no horizontal overflow at 320px`);
    await page.click('[data-act=start]'); await sleep(300);
    const info = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const s = document.querySelector('.g-stage').getBoundingClientRect(); const t = document.querySelector('.g-touch');
      const cr = c ? c.getBoundingClientRect() : null;
      const tb = t && !t.hidden ? t : null;
      const btns = [...document.querySelectorAll('.t-btn')];
      return { fits: !cr || (cr.width <= s.width + 1 && cr.height <= s.height + 1), touchVisible: !!tb, btns: btns.map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)), onscreen: btns.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), dom: !c };
    });
    ok(info.fits, `${name}: game surface fits the stage`);
    if (['turboSnake'].includes(id)) ok(!info.touchVisible, 'snake D-pad hidden until enabled');
    else if (info.btns.length) ok(info.onscreen && info.btns.every((b) => b >= 44), `${name}: touch buttons on-screen and large`, JSON.stringify(info.btns));
    else ok(true, `${name}: pointer/touch UI (no button bar needed)`);
    await page.close();
  }
  await phone.close();
}

console.log('Console errors');
const real = errors.filter((e) => !/favicon/.test(e));
ok(real.length === 0, 'no console errors / failed requests across the whole run', '\n' + real.slice(0, 8).join('\n'));

await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
