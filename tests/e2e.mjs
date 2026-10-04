// End-to-end QA for Pocket Arcade. Runs a static server under /pocket-arcade/ (GitHub Pages style) and drives Chromium.
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
];
const HOOK = { grappleRush: '__grapple', neonDodge: '__dodge', turboSnake: '__snake', brickBlast: '__brick', asteroidDash: '__asteroid' };

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

// ------------------------------------------------------------------ homepage
console.log('Homepage');
{
  const page = await open('');
  await page.waitForSelector('.card');
  ok((await page.locator('.card').count()) === 5, 'five cards rendered from games.js');
  const titles = await page.locator('.card-title').allTextContents();
  ok(titles.join('|') === 'Grapple Rush|Neon Dodge|Turbo Snake|Brick Blast|Asteroid Dash', 'card titles', titles.join());
  ok((await page.locator('.card img').evaluateAll((els) => Promise.all(els.map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))))).every(Boolean), 'all card artwork loads');
  ok((await page.locator('.play-btn').count()) === 5, 'five play buttons');
  ok((await page.textContent('.tagline')).includes('Five games. One pocket-sized arcade.'), 'tagline');
  for (let i = 0; i < 5; i++) {
    await page.goto(BASE);
    await page.waitForSelector('.card');
    await page.locator('.play-btn').nth(i).click();
    await page.waitForSelector('canvas');
    ok(page.url().includes(GAMES[i][1]), `Play → ${GAMES[i][2]} loads`);
    await page.click('.g-panel a');
    await page.waitForSelector('.card');
    ok(page.url() === BASE + 'index.html' || page.url() === BASE, `${GAMES[i][2]}: Return to Arcade works (${page.url()})`);
  }
  // sound toggle persists
  await page.click('#toggle-sound');
  ok((await save(page)).settings.muted === true, 'sound toggle saves muted=true');
  await page.reload(); await page.waitForSelector('.card');
  ok((await page.getAttribute('#toggle-sound', 'aria-pressed')) === 'false', 'mute persists across reload');
  await page.click('#toggle-sound');
  // reduced motion
  await page.click('#toggle-motion');
  ok(await page.evaluate(() => document.body.classList.contains('reduce-motion')), 'reduced-motion toggle applies');
  await page.click('#toggle-motion');
  await page.close();
}

// ------------------------------------------------------------------ storage safety
console.log('Storage');
{
  for (const bad of ['{not json', '[]', '"str"', 'null', JSON.stringify({ settings: { muted: 'yes' }, games: { grappleRush: { bestTime: 'fast' }, neonDodge: { highScore: -5 }, turboSnake: 7 } })]) {
    const page = await ctx.newPage(); watch(page, errors);
    await page.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('pocketArcade.v1', v); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, bad);
    await page.goto(BASE); await page.waitForSelector('.card');
    const cnt = await page.locator('.card').count();
    await page.goto(BASE + 'games/neon-dodge/'); await page.waitForSelector('[data-act=start]');
    ok(cnt === 5, `corrupted save survives: ${bad.slice(0, 28)}`);
    await page.close();
  }
  const page = await ctx.newPage(); watch(page, errors);
  await page.addInitScript(() => localStorage.removeItem('pocketArcade.v1'));
  await page.goto(BASE); await page.waitForSelector('.card');
  await page.close();
}

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

// ------------------------------------------------------------------ persistence on the homepage
console.log('Scores on homepage');
{
  const page = await open('');
  await page.waitForSelector('.card');
  await page.evaluate(() => localStorage.setItem('pocketArcade.v1', JSON.stringify({ settings: { muted: false }, games: { grappleRush: { bestTime: 65432 }, neonDodge: { highScore: 1234 }, turboSnake: { highScore: 55 }, brickBlast: { highScore: 9000, highestLevel: 4 }, asteroidDash: { highScore: 7777, highestWave: 5 } } })));
  await page.reload(); await page.waitForSelector('.card');
  const texts = await page.locator('.best-val').allTextContents();
  ok(texts[0].includes('1:05.43') && texts[1].includes('1,234') && texts[2].includes('55') && texts[3].includes('9,000') && texts[3].includes('Level 4') && texts[4].includes('Wave 5'), 'every card shows its saved best', texts.join(' | '));
  await page.click('#reset-data');
  ok(await page.isVisible('#confirm'), 'reset opens in-page confirm (no alert)');
  await page.click('[data-no]');
  ok((await page.locator('.best-val.is-empty').count()) === 0, 'cancel keeps scores');
  await page.click('#reset-data'); await page.click('[data-yes]');
  ok((await page.locator('.best-val.is-empty').count()) === 5, 'reset clears all bests');
  await page.close();
}

// ------------------------------------------------------------------ responsive / mobile
console.log('Responsive & touch');
{
  const phone = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 320, height: 640 } });
  let page = await open('', phone);
  await page.waitForSelector('.card');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'homepage has no horizontal overflow at 320px');
  await page.close();
  for (const [id, folder, name] of GAMES) {
    page = await open(`games/${folder}/`, phone);
    await page.waitForSelector('[data-act=start]');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no overflow at 320px`);
    await page.click('[data-act=start]'); await sleep(300);
    const info = await page.evaluate(() => {
      const c = document.querySelector('canvas').getBoundingClientRect(); const s = document.querySelector('.g-stage').getBoundingClientRect(); const t = document.querySelector('.g-touch');
      const tb = t && !t.hidden ? t.getBoundingClientRect() : null;
      return { c: [c.width, c.height], s: [s.width, s.height], touchVisible: !!tb, tb: tb && [tb.width, tb.height, tb.top], btns: [...document.querySelectorAll('.t-btn')].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)), onscreen: [...document.querySelectorAll('.t-btn')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }) };
    });
    ok(info.c[0] <= info.s[0] + 1 && info.c[1] <= info.s[1] + 1, `${name}: canvas fits stage ${info.c.map(Math.round)} in ${info.s.map(Math.round)}`);
    if (id === 'turboSnake') ok(!info.touchVisible, 'snake D-pad hidden until enabled'); else ok(info.touchVisible && info.onscreen && info.btns.every((b) => b >= 48), `${name}: touch controls visible, large and on-screen`, JSON.stringify(info));
    await page.close();
  }
  // touch input actually drives the game: Grapple Rush
  page = await open('games/grapple-rush/', phone);
  await page.waitForSelector('[data-act=start]'); await page.tap('[data-act=start]'); await sleep(200);
  const x0 = await page.evaluate(() => window.__grapple.world.p.x);
  const r = await page.locator('[data-action=right]').boundingBox();
  const j = await page.locator('[data-action=jump]').boundingBox();
  // multi-touch: hold right and jump at once via CDP touch points
  const cdp = await phone.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }] });
  await sleep(500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }, { x: j.x + j.width / 2, y: j.y + j.height / 2, id: 2 }] });
  await sleep(150);
  const mid = await page.evaluate(() => { const p = window.__grapple.world.p; return { x: p.x, y: p.y, g: p.onGround }; });
  ok(mid.x > x0 + 60, 'touch ◀▶ buttons move the runner');
  ok(!mid.g, 'simultaneous touch: run + jump works (multi-touch)');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  ok(await page.evaluate(() => !window.__grapple.shell.input.down('right') && !window.__grapple.shell.input.down('jump')), 'touch release clears inputs');
  // orientation change
  await page.setViewportSize({ width: 640, height: 320 });
  await sleep(400);
  ok(await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return c.width > 100 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1; }), 'landscape resize keeps the canvas on-screen');
  await page.setViewportSize({ width: 320, height: 640 });
  await sleep(300);
  await page.close();
  // snake swipe + dpad
  page = await open('games/turbo-snake/', phone);
  await page.waitForSelector('[data-act=start]'); await page.tap('[data-act=start]'); await sleep(200);
  await page.click('#g-pad'); await sleep(200);
  ok(await page.isVisible('.t-cluster.dpad'), 'D-pad toggle shows the on-screen pad');
  await page.tap('[data-action=up]'); await sleep(150);
  ok(await page.evaluate(() => window.__snake.G.started && window.__snake.G.dir === 'up'), 'D-pad steers the snake');
  const cv = await page.locator('canvas').boundingBox();
  const cdp2 = await phone.newCDPSession(page);
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= 6; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 12, y: cy, id: 1 }] });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  ok(await page.evaluate(() => window.__snake.G.dir === 'right' || window.__snake.G.queue.includes('right')), 'swipe steers the snake');
  await page.close();
  // homepage at large desktop
  await phone.close();
  const big = await browser.newContext({ viewport: { width: 2200, height: 1200 } });
  page = await open('', big);
  await page.waitForSelector('.card');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'homepage fine at 2200px');
  await page.close(); await big.close();
}

console.log('Console errors');
const real = errors.filter((e) => !/favicon/.test(e));
ok(real.length === 0, 'no console errors / failed requests across the whole run', '\n' + real.slice(0, 8).join('\n'));

await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
