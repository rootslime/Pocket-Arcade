// End-to-end QA for the console UI (home, library, detail, achievements, profile, settings), guest progression and controller support.
import { launch, watch, devices } from './lib.mjs';
import { serve } from './serve.mjs';

const srv = await serve(8125);
const BASE = 'http://localhost:8125/pocket-arcade/';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLUGS = ['grapple-rush', 'neon-dodge', 'turbo-snake', 'brick-blast', 'asteroid-dash', 'dream-boutique', 'sweetheart-cafe', 'glam-studio', 'drift-circuit', 'dungeon-pocket'];

const { browser, ctx } = await launch({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  window.__pad = { connected: false, buttons: Array(17).fill(0), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => (window.__pad.connected ? [{ connected: true, id: 'Test Pad', buttons: window.__pad.buttons.map((v) => ({ pressed: v > 0.5, value: v })), axes: window.__pad.axes }] : []);
});
const errors = [];
const open = async (path = '', c = ctx) => { const p = await c.newPage(); watch(p, errors); await p.goto(BASE + path); return p; };
const save = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1') || 'null'));
const view = (p) => p.textContent('#view');

console.log('Home');
{
  const page = await open(); await page.waitForSelector('.cc');
  ok((await page.locator('.cc').count()) === 10, 'ten games in the carousel (generated from games.js)');
  const titles = await page.locator('.cc-title').allTextContents();
  ok(titles.length === 10 && titles.includes('Dungeon Pocket') && titles.includes('Sweetheart Café'), 'all ten titles present', titles.join());
  ok((await page.locator('.hero-title').textContent()).trim().length > 0 && (await page.locator('#hero-play').count()) === 1, 'hero shows the selected game with a PLAY button');
  const before = await page.textContent('.hero-title');
  await page.hover('.cc:nth-child(4)'); await sleep(200);
  ok((await page.textContent('.hero-title')) !== before && /Brick Blast/i.test(await page.textContent('.hero-title')), 'hovering a card changes the hero + background');
  ok((await page.locator('.cc.sel').count()) === 1, 'exactly one card is selected');
  ok((await page.textContent('.nav-signin')).trim() === 'Sign In', 'logged-out nav shows Sign In');
  ok((await page.locator('.nav-tab').count()) === 5, 'Home / Library / Achievements / Profile / Settings');
  ok(/WELCOME/i.test(await page.textContent('.strip')) && (await page.locator('.nudge').count()) === 0, 'guest dashboard is simple and does not nag when accounts are off');
  // Play launches the game under the sub-path, return comes back
  await page.click('#hero-play'); await page.waitForURL(/games\/brick-blast\//);
  ok(page.url().startsWith(BASE + 'games/brick-blast/'), 'PLAY navigates with relative paths: ' + page.url());
  await page.waitForSelector('[data-act=start]'); await page.click('.g-panel a[href$="index.html"]');
  await page.waitForSelector('.cc');
  ok(page.url().includes('/pocket-arcade/'), 'Return to Arcade comes back to the console');
  ok(/Brick Blast/i.test(await page.textContent('.hero-title')), 'selection is remembered after returning');
  await page.close();
}

console.log('Library, filters and detail');
{
  const page = await open('#/library'); await page.waitForSelector('.lib');
  const count = async () => page.locator('.lib').count();
  ok((await count()) === 10, 'library lists all ten games');
  const expect = { action: 4, arcade: 4, racing: 1, cozy: 2, creative: 2, classic: 1 };
  for (const [cat, n] of Object.entries(expect)) { await page.click(`[data-cat=${cat}]`); ok((await count()) === n, `filter ${cat.toUpperCase()} → ${n} games (got ${await count()})`); }
  await page.click('[data-cat=all]');
  ok(/Best time|High score/.test(await view(page)) && /\d+ \/ \d+/.test(await view(page)), 'cards show best score and achievements earned');
  for (const slug of SLUGS) {
    await page.goto(BASE + `#/game/${slug}`); await sleep(450); await page.waitForSelector('.detail');
    const t = await page.textContent('.detail h1');
    ok(t.length > 2 && (await page.locator('.controls-box li').count()) >= 2 && (await page.locator('#detail-play').count()) === 1, `detail: ${t} has controls + PLAY`);
  }
  await page.goto(BASE + '#/game/asteroid-dash'); await sleep(450); await page.waitForSelector('.detail');
  await page.click('[data-action=howto]'); ok(/Goal/.test(await page.textContent('.modal')), 'How to Play modal'); await page.keyboard.press('Escape'); await sleep(100);
  ok((await page.locator('.modal').count()) === 0, 'Escape closes the modal');
  await page.click('[data-action=game-ach]'); ok((await page.locator('.modal .ach').count()) === 6, 'game achievements modal lists 6'); await page.keyboard.press('Escape');
  await page.click('#detail-play'); await page.waitForURL(/asteroid-dash/);
  ok(true, 'detail PLAY launches the game');
  await page.close();
}

console.log('Keyboard and controller navigation');
{
  const page = await open(); await page.waitForSelector('.cc'); await sleep(300);
  await page.focus('#hero-play');
  await page.keyboard.press('ArrowDown'); await sleep(100);
  ok(await page.evaluate(() => document.activeElement.classList.contains('cc')), 'ArrowDown moves from PLAY to the carousel');
  const t0 = await page.textContent('.hero-title');
  await page.keyboard.press('ArrowRight'); await sleep(100);
  ok((await page.textContent('.hero-title')) !== t0, 'ArrowRight moves the selection and updates the hero');
  await page.keyboard.press('Enter'); await page.waitForSelector('.detail');
  ok(page.url().includes('#/game/'), 'Enter on the selected card opens its detail screen');
  await page.keyboard.press('Escape'); await sleep(400);
  ok(!page.url().includes('#/game/'), 'Escape goes back');
  // controller
  await page.goto(BASE); await page.waitForSelector('.cc'); await sleep(300);
  await page.evaluate(() => { window.__pad.connected = true; window.dispatchEvent(new Event('gamepadconnected')); });
  await sleep(300);
  ok(/CONTROLLER CONNECTED/i.test(await page.textContent('.pa-toasts')), 'CONTROLLER CONNECTED toast');
  ok(await page.isVisible('#pad-indicator'), 'controller indicator in the nav');
  await page.focus('.cc.sel');
  const sel0 = await page.textContent('.hero-title');
  await page.evaluate(() => { window.__pad.buttons[15] = 1; }); await sleep(120); await page.evaluate(() => { window.__pad.buttons[15] = 0; }); await sleep(120);
  ok((await page.textContent('.hero-title')) !== sel0, 'D-pad right moves the selection');
  await page.evaluate(() => { window.__pad.buttons[0] = 1; }); await sleep(120); await page.evaluate(() => { window.__pad.buttons[0] = 0; }); await sleep(400);
  ok(page.url().includes('#/game/'), 'A button selects (opens detail)');
  await page.evaluate(() => { window.__pad.buttons[1] = 1; }); await sleep(120); await page.evaluate(() => { window.__pad.buttons[1] = 0; }); await sleep(400);
  ok(!page.url().includes('#/game/'), 'B button goes back');
  await page.evaluate(() => { window.__pad.connected = false; }); await sleep(200);
  ok(!(await page.isVisible('#pad-indicator')), 'disconnect hides the indicator safely');
  await page.close();
}

console.log('Settings, Quick Launch, motion, sound');
{
  const page = await open('#/settings'); await page.waitForSelector('.set-row');
  await page.click('[data-action=set-sound]'); ok((await save(page)).settings.muted === true, 'sound toggle saves');
  await page.click('[data-action=set-motion]'); ok(await page.evaluate(() => document.body.classList.contains('reduce-motion')), 'reduced motion applies');
  await page.click('[data-action=set-motion]');
  await page.click('[data-action=set-quick]'); ok((await save(page)).settings.quickLaunch === true, 'Quick Launch saves');
  ok(/Accounts are not configured/.test(await view(page)), 'settings explains that accounts are not configured');
  await page.goto(BASE); await page.waitForSelector('.cc'); await page.click('.cc.sel');
  await page.waitForURL(/games\//, { timeout: 4000 });
  ok(true, 'with Quick Launch a card click starts the game immediately');
  await page.goto(BASE + '#/settings'); await page.waitForSelector('.set-row'); await page.click('[data-action=set-quick]'); await page.click('[data-action=set-sound]');
  await page.click('[data-action=signin]');
  ok(/Accounts not set up/.test(await page.textContent('.modal')) && /guest mode/i.test(await page.textContent('.modal')), 'Sign In without configuration fails gracefully (guest mode message)');
  await page.keyboard.press('Escape');
  await page.close();
}

console.log('Guest progression: XP, achievements, stats');
{
  const page = await open('games/neon-dodge/');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForSelector('[data-act=start]'); await page.click('[data-act=start]'); await sleep(300);
  // 1) an immediate loss earns no XP (anti-exploit)
  await page.evaluate(() => { const S = window.__dodge.S; S.p.inv = 0; S.fx.shield = 0; S.hz.push({ k: 'bullet', id: 9, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-xp');
  ok(/No XP this run/.test(await page.textContent('.p-xp')), 'quitting/losing immediately earns no XP');
  let sv = await save(page);
  ok(sv.profile.xp === 0 && sv.profile.stats.gamesPlayed === 1 && sv.profile.stats.sessions === 1, 'stats still count the game; sessions = 1', JSON.stringify(sv.profile.stats));
  ok(!!sv.profile.achievements.first_quarter, 'First Quarter unlocks on the first game');
  // 2) a real run earns XP
  await page.click('[data-act=restart]'); await sleep(300);
  await page.evaluate(() => { const S = window.__dodge.S; S.fx.shield = 0; setInterval(() => { S.p.inv = 5; }, 100); });
  await sleep(22000);
  await page.evaluate(() => { const S = window.__dodge.S; S.p.inv = 0; S.fx.shield = 0; S.hz.length = 0; S.hz.push({ k: 'bullet', id: 99, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-xp-list', { timeout: 6000 });
  sv = await save(page);
  ok(sv.profile.xp > 0 && /\+\d+ XP/.test(await page.textContent('.p-xp')), 'a 20s+ run earns XP (' + sv.profile.xp + ')');
  ok(sv.profile.stats.sessions === 1 && sv.profile.stats.gamesPlayed === 2, 'restarts stay in the same session; two games played');
  ok(sv.profile.recent[0].id === 'neonDodge', 'recently played recorded');
  ok(sv.profile.stats.perGame.neonDodge.plays === 2, 'per-game stats updated');
  // 3) the console reflects it
  await page.goto(BASE); await page.waitForSelector('.cc');
  ok(/Neon Dodge/.test(await page.textContent('.dash')) && !/0 \/ 100 XP/.test(await page.textContent('.strip')), 'dashboard shows recently played and XP progress');
  await page.goto(BASE + '#/achievements'); await page.waitForSelector('.ach');
  ok((await page.locator('.ach').count()) === 71 && (await page.locator('.ach.got').count()) >= 1, '71 achievements listed, unlocked ones highlighted');
  ok(/Unlocked/.test(await page.textContent('.ach.got')), 'unlocked achievements show an unlock date');
  await page.goto(BASE + '#/profile'); await page.waitForSelector('.pf-card');
  ok(/Guest/.test(await view(page)) && /Games played/.test(await view(page)) && /Neon Dodge/.test(await view(page)), 'profile shows stats, records and per-game statistics');
  // reload keeps everything
  await page.reload(); await page.waitForSelector('.pf-card');
  ok((await save(page)).profile.xp === sv.profile.xp, 'XP persists across reloads');
  // reset
  await page.goto(BASE + '#/settings'); await page.waitForSelector('.set-row'); await page.click('[data-action=reset]'); await page.click('#do-reset'); await sleep(300);
  sv = await save(page);
  ok(sv.profile.xp === 0 && Object.keys(sv.profile.achievements).length === 0 && sv.games.neonDodge.highScore === 0, 'reset clears scores, XP and achievements');
  await page.close();
}

console.log('Corrupted data and responsiveness');
{
  for (const bad of ['{nope', '[]', 'null', JSON.stringify({ profile: { xp: 'lots', achievements: { x: 'y' }, stats: 5 }, games: { zzz: 1 }, blobs: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } })]) {
    const page = await ctx.newPage(); watch(page, errors);
    await page.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('pocketArcade.v1', v); sessionStorage.setItem('seeded', '1'); } }, bad);
    await page.goto(BASE); await page.waitForSelector('.cc');
    await page.goto(BASE + '#/profile'); await page.waitForSelector('.pf-card');
    await page.goto(BASE + 'games/brick-blast/'); await page.waitForSelector('[data-act=start]');
    ok(true, 'survives corrupted save: ' + bad.slice(0, 24));
    await page.close();
  }
  const phone = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 320, height: 640 } });
  for (const r of ['', '#/library', '#/achievements', '#/profile', '#/settings', '#/game/drift-circuit']) {
    const page = await open(r, phone); await page.waitForSelector('#view > *'); await sleep(300);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `no horizontal overflow at 320px on ${r || 'home'}`);
    await page.close();
  }
  await phone.close();
  const big = await browser.newContext({ viewport: { width: 2200, height: 1200 } });
  const p = await open('', big); await p.waitForSelector('.cc'); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'fine at 2200px'); await p.close(); await big.close();
}

console.log('Console errors');
const real = errors.filter((e) => !/favicon/.test(e));
ok(real.length === 0, 'no console errors / failed requests', '\n' + real.slice(0, 8).join('\n'));
await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
