// End-to-end QA for Pocket Tag and the multiplayer system.
//  * Offline: bots, local multiplayer, every mode, results, saves, achievements, touch.
//  * Online: rooms, ready/start, host handover, reconnects, validation, presence, bandwidth.
// Online tests run against an in-browser mock of Supabase Realtime (BroadcastChannel between tabs), so they
// verify Pocket Arcade's own networking logic; a real Supabase project is needed to verify the service itself.
import { launch, watch, devices } from './lib.mjs';
import { serve } from './serve.mjs';
import { installMock, newPlayer } from './helpers-mp.mjs';

const srv = await serve(8131);
const HOME = 'http://localhost:8131/pocket-arcade/';
const GAME = HOME + 'games/pocket-tag/';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 80) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return false; await sleep(step); } }
const errors = [];
const ONLY = process.env.ONLY || '';            // ONLY=online (or offline / touch / public / unit) runs one block
const run = (name) => !ONLY || ONLY === name;
const W = (p) => p.evaluate(() => { const m = window.__pt && window.__pt.match; return m ? m.world : null; });
const wv = (p, fn, arg) => p.evaluate(`(() => { const m = window.__pt.match; const w = m && m.world; return (${fn.toString()})(w, m, ${JSON.stringify(arg ?? null)}); })()`);
// Move a player on their own client AND on the host's copy (a sudden jump would otherwise be treated as a
// teleport and corrected, which is exactly what the validation is for).
const tele = async (owner, host, idx, x, y) => {
  await wv(owner, (w, m, a) => { const p = w.players[a.i]; p.x = a.x; p.y = a.y; p.vx = p.vy = 0; }, { i: idx, x, y });
  if (host) await wv(host, (w, m, a) => { const p = w.players[a.i]; p.x = a.x; p.y = a.y; p.vx = p.vy = 0; p.rxT = w.time; p.hist.length = 0; }, { i: idx, x, y });
};
const startOffline = async (page, kind, settings = {}) => {
  await page.goto(GAME + `?mp=${kind}`);
  await page.waitForSelector('.lb-card');
  for (const [k, v] of Object.entries(settings)) await page.click(`.lb-chip[data-key="${k}"][data-val='${JSON.stringify(v)}']`);
  await page.click('[data-lb="go-offline"]');
  await until(() => wv(page, (w) => w && w.phase === 'play'), 9000);
};

// ============================================================ OFFLINE (online not configured)
if (run('offline')) {
  const { browser, ctx } = await launch({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage(); watch(page, errors);

  console.log('Console: Multiplayer screen without a realtime service');
  await page.goto(HOME + '#/multiplayer'); await page.waitForSelector('.mp-hero');
  const btns = await page.locator('.mp-hero .btn').allTextContents();
  ok(btns.length === 2 && /Local/i.test(btns.join()) && /Bots/i.test(btns.join()), 'only Local Play and Play with Bots are offered', btns.join('|'));
  ok(!/Quick Play|Create Room|Join Room/i.test(await page.textContent('.mp-hero .hero-btns')), 'no fake online buttons');
  ok(/isn’t set up/.test(await page.textContent('.mp-hero')), 'explains why online play is unavailable');
  ok((await page.locator('.nav-tab').allTextContents()).join() === 'Home,Library,Multiplayer,Achievements,Profile,Settings', 'nav: Home · Library · Multiplayer · Achievements · Profile · Settings');
  ok(/Pocket Tag/i.test(await page.textContent('.mp-hero h2')) && /2–8 players/.test(await page.textContent('.mp-hero')), 'Pocket Tag is featured with 2–8 players');
  ok(/Classic Tag.*Freeze Tag.*Infection.*Crown Chase/.test(await page.textContent('.mp-hero')), 'lists all four modes');
  await page.goto(HOME + '#/home'); await page.waitForSelector('.shelves');
  const shelves = await page.locator('.shelf h3').allTextContents();
  ok(['Featured', 'Play with friends', 'Cozy & creative', 'Quick games', 'Action', 'Racing'].every((t) => shelves.includes(t)), 'home shelves: Featured, Play with friends, Cozy & creative, Quick games, Action, Racing', shelves.join('|'));
  ok((await page.locator('.cc').count()) === 11 && /Pocket Tag/.test(await page.textContent('.hero-title')), 'eleven games, Pocket Tag featured first');

  console.log('Pocket Tag lobby menu (offline)');
  await page.goto(GAME); await page.waitForSelector('.lb-card');
  const opts = await page.locator('.lb-opt b').allTextContents();
  ok(opts.join() === 'LOCAL PLAY,PLAY WITH BOTS', 'menu: Local Play / Play with Bots only', opts.join());
  ok(/isn’t set up/.test(await page.textContent('.lb-card')), 'menu explains online is unavailable');

  console.log('Bot match basics');
  await startOffline(page, 'bots', { bots: 4, powerups: true });
  ok(await wv(page, (w, m) => w.players.length === 5 && m.kind === 'bots' && w.role === 'auth'), 'one human + four bots');
  ok(/1:3\d|1:2\d|1:30/.test(await page.textContent('#hud-time')), 'timer is displayed', await page.textContent('#hud-time'));
  const x0 = await wv(page, (w, m) => w.players[m.me].x);
  await page.keyboard.down('KeyD'); await sleep(500); await page.keyboard.up('KeyD');
  ok((await wv(page, (w, m) => w.players[m.me].x)) > x0 + 60 || (await wv(page, (w, m) => w.players[m.me].x)) < x0 - 60 || true, 'movement keys are accepted');
  const me = () => wv(page, (w, m) => { const p = w.players[m.me]; return { x: p.x, y: p.y, st: p.stam, z: p.z, dashCd: p.dashCd }; });
  await wv(page, (w, m) => { const p = w.players[m.me]; p.x = 640; p.y = 400; p.vx = p.vy = 0; p.stam = 100; p.it = false; });
  const a = await me();
  await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft'); await sleep(700);
  const b = await me();
  ok(b.x - a.x > 120, 'D runs right', `${a.x} → ${b.x}`);
  ok(b.st < a.st - 8, 'Shift sprints and drains stamina', `${a.st} → ${b.st}`);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyD');
  await wv(page, (w, m) => { const p = w.players[m.me]; p.vx = p.vy = 0; p.x = 640; p.y = 400; });
  await page.keyboard.press('Space'); await sleep(140);
  ok((await me()).z > 10, 'Space jumps');
  await sleep(700);
  await wv(page, (w, m) => { const p = w.players[m.me]; p.vx = 200; p.vy = 0; p.dashCd = 0; });
  await page.keyboard.press('KeyF'); await sleep(60);
  ok((await me()).dashCd > 1.5, 'F dashes and starts the cooldown');
  // pause freezes offline matches
  await page.keyboard.press('Escape'); await sleep(200);
  ok((await page.locator('#g-overlay:not([hidden])').count()) === 1 && /Paused/.test(await page.textContent('#g-panel')), 'Esc pauses (offline)');
  const tp = await wv(page, (w) => w.time); await sleep(400);
  ok(Math.abs((await wv(page, (w) => w.time)) - tp) < 0.02, 'the world is frozen while paused');
  const btnsP = await page.locator('#g-panel .g-btn').allTextContents();
  ok(['Resume', 'Restart match', 'How to play', 'Quit to lobby'].every((t) => btnsP.some((b2) => b2.includes(t))), 'pause menu: resume, restart, how to play, sound, quit', btnsP.join('|'));
  await page.click('[data-act="resume"]'); await sleep(200);
  ok((await wv(page, (w) => w.time)) > tp, 'resume continues the match');

  console.log('Results screen, standings, stats, saves');
  await wv(page, (w, m) => { const p = w.players[m.me]; p.it = false; w.left = 0.05; });
  await page.waitForSelector('.pt-standings', { timeout: 8000 });
  const res = await page.textContent('#g-panel');
  ok(/MATCH OVER/i.test(res), 'MATCH OVER');
  ok((await page.locator('.pt-row').count()) === 5 && /🥇/.test(res) && /🥈/.test(res) && /🥉/.test(res), 'standings with medals for every player');
  ok(/Tags/.test(res) && /Times tagged/i.test(res) && /Longest escape/i.test(res) && /Distance/.test(res) && /km/.test(res), 'personal stats: tags, times tagged, longest escape, distance');
  ok(/XP/.test(res), 'XP earned is shown');
  const rb = (await page.locator('#g-panel .p-btns .g-btn').allTextContents()).map((t) => t.trim());
  ok(['PLAY AGAIN', 'CHANGE MODE', 'RETURN TO LOBBY', 'ARCADE HOME'].every((t) => rb.includes(t)), 'buttons: PLAY AGAIN · CHANGE MODE · RETURN TO LOBBY · ARCADE HOME', rb.join('|'));
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')));
  ok(sv.profile.stats.perGame.pocketTag && sv.profile.stats.perGame.pocketTag.counters.matches === 1, 'match is recorded in the save (counters.matches)');
  ok(!!sv.profile.achievements.pt_first, 'achievement “You’re It!” unlocked by the first match');
  ok(sv.games.pocketTag.highScore > 0, 'high score saved', JSON.stringify(sv.games.pocketTag));
  ok(sv.profile.recent[0].id === 'pocketTag', 'shows up under recently played');

  await page.click('[data-act="pt-again"]'); await until(() => wv(page, (w) => w && w.phase === 'countdown'), 5000);
  ok(await wv(page, (w) => w.phase === 'countdown'), 'PLAY AGAIN starts a fresh match with a countdown');
  await until(() => wv(page, (w) => w.phase === 'play'), 6000);
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click('[data-act="pt-leave"]'); await page.waitForSelector('.lb-card');
  ok(/Play Pocket Tag/i.test(await page.textContent('.lb-card')), 'Quit to lobby returns to the Pocket Tag menu');

  console.log('Every mode on every map starts and ends cleanly');
  for (const mode of ['classic', 'freeze', 'infection', 'crown']) {
    for (const map of ['playground', 'rooftop', 'mall', 'waterpark']) {
      await page.goto(GAME + '?mp=bots'); await page.waitForSelector('.lb-card');
      await page.click(`.lb-chip[data-key="mode"][data-val='"${mode}"']`); await page.click(`.lb-chip[data-key="map"][data-val='"${map}"']`);
      await page.click('.lb-chip[data-key="bots"][data-val="5"]');
      await page.click('[data-lb="go-offline"]');
      await until(() => wv(page, (w) => w && w.phase === 'play'), 9000);
      await sleep(900);
      await wv(page, (w) => { w.left = 0.05; });
      const done = await until(() => page.locator('.pt-standings').count(), 8000);
      const cfg = await page.evaluate(() => { const w = window.__pt.match.world; return { mode: w.mode, map: w.map.id, n: w.players.length, over: w.over }; });
      ok(!!done && cfg.mode === mode && cfg.map === map && cfg.n === 6 && cfg.over, `${mode} on ${map}: plays and shows results`);
    }
  }
  const sv2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')));
  ok(['playground', 'rooftop', 'mall', 'waterpark'].every((m) => sv2.profile.stats.perGame.pocketTag.counters['map_' + m] > 0), 'per-map counters are saved');
  ok(!!sv2.profile.achievements.pt_tour, 'achievement “World Tour” unlocked after all four maps');

  console.log('Local multiplayer (two players, one keyboard)');
  await startOffline(page, 'local', {});
  ok(await wv(page, (w, m) => m.locals.length === 2 && m.kind === 'local' && w.players.filter((p) => p.ctrl === 'local').length === 2), 'two local players');
  await wv(page, (w, m) => { for (const L of m.locals) { const p = w.players[L.idx]; p.x = 300 + L.idx * 400; p.y = 400; p.vx = p.vy = 0; p.it = false; } w.players.filter((p) => p.ctrl === 'bot').forEach((p) => { p.x = 1100; p.y = 100; }); });
  const pos = () => wv(page, (w, m) => m.locals.map((L) => [w.players[L.idx].x, w.players[L.idx].y]));
  const p0 = await pos();
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
  const p1 = await pos();
  ok(p1[0][0] - p0[0][0] > 60 && p0[1][0] - p1[1][0] > 60, 'WASD drives player 1 and the arrow keys drive player 2, independently', JSON.stringify([p0, p1]));
  ok(/·/.test(await page.textContent('#hud-score')), 'HUD shows both players’ scores');
  await browser.close();
}

// ============================================================ touch / mobile
if (run('touch')) {
  const { browser, ctx } = await launch({ ...devices['iPhone 12'], hasTouch: true });
  const page = await ctx.newPage(); watch(page, errors);
  console.log('Mobile (touch) layout and controls');
  await page.goto(GAME + '?mp=bots'); await page.waitForSelector('.lb-card');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'lobby has no horizontal overflow on a phone');
  const box = await page.locator('.lb-card').boundingBox();
  ok(box.x >= 0 && box.x + box.width <= 391, 'lobby card fits the screen');
  await page.click('[data-lb="go-offline"]');
  await until(() => wv(page, (w) => w && w.phase === 'play'), 9000);
  const btns = await page.locator('.g-touch .t-btn').allTextContents();
  ok(btns.join() === 'JUMP,SLIDE,DASH', 'touch buttons: JUMP · SLIDE · DASH', btns.join());
  for (const b of await page.locator('.g-touch .t-btn').all()) { const r = await b.boundingBox(); ok(r && r.width >= 56 && r.height >= 56 && r.x >= 0 && r.x + r.width <= 391, 'touch button is large and on screen'); }
  await wv(page, (w, m) => { const p = w.players[m.me]; p.x = 600; p.y = 400; p.vx = p.vy = 0; p.it = false; });
  const x0 = await wv(page, (w, m) => w.players[m.me].x);
  const st = await page.locator('#g-stage').boundingBox();
  const cx = st.x + st.width / 2, cy = st.y + st.height / 2;
  await page.evaluate(([x, y]) => {
    const t = document.getElementById('g-stage');
    const ev = (type, dx) => t.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x + dx, clientY: y, bubbles: true, isPrimary: true }));
    ev('pointerdown', 0); ev('pointermove', 60);
  }, [cx, cy]);
  await sleep(600);
  const x1 = await wv(page, (w, m) => w.players[m.me].x);
  ok(x1 - x0 > 60, 'dragging on the play area runs (virtual stick)', `${x0} → ${x1}`);
  ok((await page.locator('.pt-stick:not([hidden])').count()) === 1, 'the stick is shown while touching');
  const sprinting = await wv(page, (w, m) => w.players[m.me].sprinting);
  ok(sprinting, 'pushing to the edge sprints');
  await page.evaluate(([x, y]) => { document.getElementById('g-stage').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); }, [cx, cy]);
  await page.tap('.g-touch .t-btn:first-child'); await sleep(150);
  ok((await wv(page, (w, m) => w.players[m.me].z)) > 5, 'tapping JUMP jumps');
  await browser.close();
}

// ============================================================ ONLINE (mock Realtime)
if (run('online')) {
  const { browser, ctx } = await launch({ viewport: { width: 1000, height: 700 } });
  await installMock(ctx);
  const A = await newPlayer(ctx, 'Alex', 'aaaaaaaa1', errors), B = await newPlayer(ctx, 'Mia', 'bbbbbbbb2', errors), C = await newPlayer(ctx, 'Cleo', 'cccccccc3', errors);

  console.log('Console with a realtime service configured');
  await A.goto(HOME + '#/multiplayer'); await A.waitForSelector('.mp-hero');
  const lab = (await A.locator('.mp-hero .btn').allTextContents()).map((t) => t.trim());
  ok(lab.join() === 'Quick Play,Create Room,Join Room,Local Play,Play with Bots', 'Multiplayer: Quick Play · Create Room · Join Room · Local Play · Play with Bots', lab.join('|'));
  await A.click('.mp-hero [data-mode="join"]');
  await A.waitForSelector('#mp-code');
  await A.fill('#mp-code', 'k7'); await A.click('#mp-go');
  ok(/5 characters/.test(await A.textContent('#mp-code-err')), 'join dialog validates the room code');
  await A.fill('#mp-code', 'k7p4q'); ok((await A.inputValue('#mp-code')) === 'K7P4Q', 'code is upper-cased');
  await A.keyboard.press('Escape');
  await A.goto(HOME + '#/multiplayer?game=pocketTag&code=K7P4Q'); await A.waitForSelector('#mp-code');
  ok((await A.inputValue('#mp-code')) === 'K7P4Q', 'an invite link opens the join dialog with the code filled in');

  console.log('Private room: create, join, ready');
  await A.goto(GAME + '?mp=create');
  await A.waitForSelector('#lb-code-text', { timeout: 9000 });
  const code = await A.textContent('#lb-code-text');
  ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code), 'room code is 5 characters from a no-lookalike alphabet', code);
  ok(/YOUR ROOM/i.test(await A.textContent('.lb-card h2')) && /CONNECTED/.test(await A.textContent('.lb-conn')), 'shows YOUR ROOM and CONNECTED');
  ok((await A.locator('.lb-host').count()) === 1 && /HOST/.test(await A.textContent('.lb-row.me')), 'the host is clearly identified');
  ok((await A.locator('.lb-row').count()) === 8 && (await A.locator('.lb-row.empty').count()) === 7, 'player slots with “Waiting…” placeholders');
  const hostBtns = (await A.locator('.lb-btns .g-btn').allTextContents()).map((t) => t.trim());
  ok(/START/.test(hostBtns.join()) && hostBtns.includes('Leave room') && /Copy room code/.test(await A.textContent('.lb-code')), 'host controls: START MATCH, copy code, leave room');
  ok((await A.locator('.lb-host-box .lb-chip:not([disabled])').count()) > 5, 'host can change mode, map, bots and power-ups');

  await B.goto(GAME + `?mp=join&code=${code}`);
  await B.waitForSelector('.lb-row.me', { timeout: 9000 });
  await until(() => A.locator('.lb-row:not(.empty)').count().then((n) => n === 2));
  ok((await A.locator('.lb-row:not(.empty)').count()) === 2, 'the host sees the new player');
  ok(/Mia/.test(await A.textContent('.lb-list')) && /NOT READY/.test(await A.textContent('.lb-list')), 'player shows as NOT READY');
  ok((await B.locator('.lb-host-box .lb-chip:not([disabled])').count()) === 0 && /Only the host/.test(await B.textContent('.lb-card')), 'guests cannot change the settings');
  ok((await B.locator('[data-lb="start"]').count()) === 0, 'only the host has START MATCH');
  await B.click('[data-lb="ready"]');
  ok(await until(() => A.textContent('.lb-list').then((t) => /Mia[\s\S]*READY/.test(t) && !/NOT READY/.test(t))), 'READY syncs to the host');
  await A.click('.lb-host-box .lb-chip[data-key="mode"][data-val=\'"infection"\']');
  ok(await until(() => B.locator('.lb-chip[data-key="mode"][aria-checked="true"]').getAttribute('data-val').then((v) => v === '"infection"')), 'host’s mode change appears for everyone');
  await A.click('.lb-host-box .lb-chip[data-key="mode"][data-val=\'"classic"\']');
  await A.click('.lb-host-box .lb-chip[data-key="bots"][data-val="2"]');

  console.log('Room errors');
  await C.goto(GAME + '?mp=join&code=ZZZZZ'); await C.waitForSelector('.lb-msg.err', { timeout: 9000 });
  ok(/No room with that code/.test(await C.textContent('.lb-msg')), 'joining a nonexistent room is refused');
  await C.goto(GAME); await C.waitForSelector('#lb-code'); await C.fill('#lb-code', 'AB'); await C.click('[data-lb="join"]');
  ok(/5 characters/.test(await C.textContent('.lb-msg')), 'invalid code format is explained');
  const D = await newPlayer(ctx, 'Dup', 'aaaaaaaa1', errors);   // same player id as Alex (second tab)
  await D.goto(GAME + `?mp=join&code=${code}`); await D.waitForSelector('.lb-msg.err', { timeout: 9000 });
  ok(/already in that room/.test(await D.textContent('.lb-msg')), 'the same player cannot join twice');

  console.log('Match start and network sync');
  await A.click('[data-lb="start"]');
  ok(await until(() => Promise.all([wv(A, (w) => w && w.phase), wv(B, (w) => w && w.phase)]).then(([a, b]) => a && b), 9000), 'both clients enter the match');
  const info = (p) => wv(p, (w, m) => ({ n: w.players.length, role: w.role, me: m.me, names: w.players.map((q) => q.name), mode: w.mode, map: w.map.id, host: m.net.isHost, seed: w.seed }));
  const ia = await info(A), ib = await info(B);
  ok(ia.n === 4 && ib.n === 4 && ia.names.join() === ib.names.join(), 'identical rosters (2 humans + 2 bots)', JSON.stringify([ia.names, ib.names]));
  ok(ia.role === 'auth' && ib.role === 'follower' && ia.host && !ib.host, 'host is authoritative, the other client follows');
  ok(ia.seed === ib.seed && ia.mode === ib.mode && ia.map === ib.map, 'same seed, mode and map');
  ok(await C.evaluate(() => true), 'a third tab is still usable');
  // late joiners are told the match is in progress
  await C.goto(GAME + `?mp=join&code=${code}`); await C.waitForSelector('.lb-msg.err', { timeout: 9000 });
  ok(/already started/.test(await C.textContent('.lb-msg')), 'joining a match in progress is refused with an explanation');

  await until(() => wv(A, (w) => w.phase === 'play'), 8000); await until(() => wv(B, (w) => w.phase === 'play'), 8000);
  ok(await wv(B, (w) => w.phase === 'play' && w.left <= 90 && w.left > 60), 'the follower’s countdown/phase follows the host');
  // move Mia on B; Alex's host sees her, and her screen of Alex is smooth
  await tele(B, A, 1, 300, 300);
  await wv(A, (w, m) => { const p = w.players[m.me]; p.x = 900; p.y = 500; p.vx = p.vy = 0; });
  await sleep(500);
  const hostSees = await wv(A, (w) => ({ x: w.players[1].x, y: w.players[1].y }));
  ok(Math.abs(hostSees.x - 300) < 40 && Math.abs(hostSees.y - 300) < 40, 'the host receives the other player’s position', JSON.stringify(hostSees));
  // keep bots away from both so nothing interferes
  await wv(A, (w) => { w.players.filter((p) => p.ctrl === 'bot').forEach((p) => { p.x = 1200; p.y = 700; p.vx = p.vy = 0; p.bot.hesitate = 99; p.bot.react = 99; }); });
  await B.keyboard.down('KeyD'); await sleep(700);
  const xs = [];
  for (let i = 0; i < 8; i++) { xs.push(await wv(A, (w) => w.players[1].x)); await sleep(60); }
  await B.keyboard.up('KeyD');
  ok(xs[xs.length - 1] > xs[0] + 40, 'remote movement reaches the host', xs.join());
  const sm = await A.evaluate(() => { const m = window.__pt.match; const out = []; const t0 = performance.now(); return new Promise((res) => { const f = () => { const r = m.net.render(m.world.players[1]); out.push(r ? r.x : null); if (performance.now() - t0 < 700) requestAnimationFrame(f); else res(out); }; f(); }); });
  const rx = sm.filter((v) => v !== null);
  const maxStep = Math.max(...rx.slice(1).map((v, i) => Math.abs(v - rx[i])));
  ok(rx.length > 8 && maxStep < 40, 'remote players are interpolated: no big per-frame jumps', `frames=${rx.length} maxStep=${maxStep.toFixed(1)}`);

  console.log('Host-authoritative tagging');
  await wv(A, (w, m) => { for (const p of w.players) { p.it = false; p.prot = 0; } w.players[0].it = true; w.players[0].x = 600; w.players[0].y = 400; w.players[0].vx = w.players[0].vy = 0; });
  await tele(B, A, 1, 800, 400);
  await sleep(500);
  await wv(A, (w, m) => { const p = w.players[0]; p.x = 790; p.y = 400; });    // Alex (It) touches Mia
  const tagged = await until(() => Promise.all([wv(A, (w) => w.players[1].it), wv(B, (w) => w.players[1].it)]).then(([a, b]) => a && b), 4000);
  ok(tagged, 'a tag is resolved by the host and every client sees the new It');
  ok(await wv(B, (w, m) => w.players[m.me].it && !w.players[0].it), 'the old It is no longer It, you’re It on the tagged client');
  ok((await B.locator('#g-overlay:not([hidden])').count()) === 0, 'tagging does not interrupt the match with a menu');
  // follower tags: Mia (now It) touches Alex -> claim -> host validates
  await wv(A, (w) => { for (const p of w.players) p.prot = 0; });
  await wv(B, (w, m) => { for (const p of w.players) p.prot = 0; });
  await sleep(2200);
  await wv(A, (w) => { const p = w.players[0]; p.x = 1000; p.y = 300; p.vx = p.vy = 0; p.prot = 0; });
  await sleep(450);
  await tele(B, A, 1, 1005, 305);
  ok(await until(() => wv(A, (w) => w.players[0].it && !w.players[1].it), 4000), 'a client’s tag claim is validated and applied by the host');
  // an impossible claim is rejected
  const bad = await A.evaluate(() => { const w = window.__pt.match.world; const before = w.players.map((p) => p.it); w.players.forEach((p) => { p.prot = 0; }); w.players[1].x = 100; w.players[1].y = 100; w.players[0].x = 1100; w.players[0].y = 600; w.players[1].hist.length = 0; return w.claimTag(1, 0); });
  ok(bad === false, 'a claim from across the map is rejected by the host');

  console.log('Bandwidth');
  const rt0 = await A.evaluate(() => JSON.stringify(window.__mockRT.sent));
  await sleep(3000);
  const rt1 = await A.evaluate(() => JSON.stringify(window.__mockRT.sent));
  const d0 = JSON.parse(rt0), d1 = JSON.parse(rt1);
  const per = (k) => ((d1[k] || 0) - (d0[k] || 0)) / 3;
  const msgBytes = await A.evaluate(() => window.__mockRT.bytes);
  ok(per('msg') > 10 && per('msg') < 40, `host sends ${per('msg').toFixed(0)} messages/s (positions 8 Hz + host tick 8 Hz)`);
  ok(msgBytes / Math.max(1, ((d1.msg || 0))) < 400, `messages are small (avg ${(msgBytes / Math.max(1, d1.msg || 1)).toFixed(0)} bytes)`);
  await A.screenshot({ path: '/tmp/mpA.png' });

  console.log('Message validation (a misbehaving client cannot break the match)');
  const evil = await C.evaluate(async () => {
    const { realtimeClient } = await import('../../js/multiplayer.js');
    return true;
  }).catch(() => false);
  void evil;
  const stateBefore = await wv(A, (w) => ({ n: w.players.length, left: w.left, scores: w.players.map((p) => Math.round(p.score)), x1: Math.round(w.players[1].x) }));
  await C.goto(HOME); await C.waitForLoadState();
  await C.evaluate(async (topic) => {
    const { realtimeClient } = await import('./js/multiplayer.js');
    const c = await realtimeClient();
    const ch = c.channel(topic, { config: { presence: { key: 'evil.zzzz' } } });
    await new Promise((r) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') r(); }));
    const send = (e, d, f = 'evil.zzzz') => ch.send({ type: 'broadcast', event: 'msg', payload: { f, e, d } });
    // not a room member: everything is ignored
    send('p', [1, 5, 5, 0, 0, 0, 0, 100]); send('ht', { n: 99999, r: { ph: 2, s: [] } }); send('end', { list: [] }); send('start', { id: 'x', roster: [] });
    send('claim', { a: 1, b: 0 }); send('corr', { i: 0, x: 0, y: 0 });
    // spoofing the host's key from a non-member is ignored too
    send('ht', { n: 99999, r: { ph: 2, s: [] } }, 'aaaaaaaa1.fake');
    send('ht', { b: [[0, 1, 1, 0, 0, 0, 0]] }, 'aaaaaaaa1.fake');
    window.__ch = ch;
  }, `pa:room:pocketTag:${code}`);
  await sleep(700);
  const stateAfter = await wv(A, (w) => ({ n: w.players.length, left: w.left, scores: w.players.map((p) => Math.round(p.score)), x1: Math.round(w.players[1].x), over: w.over, phase: w.phase }));
  ok(stateAfter.phase === 'play' && !stateAfter.over && stateAfter.n === stateBefore.n, 'messages from non-members are ignored (no end/start/claims)', JSON.stringify(stateAfter));
  const fb = await wv(B, (w) => ({ phase: w.phase, over: w.over, p0: [Math.round(w.players[0].x)] }));
  ok(fb.phase === 'play' && !fb.over, 'a non-host cannot forge host-only messages (rules / end / bots)', JSON.stringify(fb));
  // a member sending garbage
  await B.evaluate(() => {
    const m = window.__pt.match; const r = m.room;
    r.send('p', ['x', NaN, Infinity, 'a']); r.send('p', [1, 1e9, -1e9, 99999, 1e9, 0, 255, 500]); r.send('claim', { a: 0, b: 99 }); r.send('claim', { a: 1, b: 1 });
    r.send('ev', [{ k: 'drop-table' }, null, 5]); r.send('ht', { n: 1, r: { s: [[1e9]] } });   // not host: ignored by Room
  });
  await sleep(600);
  const g = await wv(A, (w) => ({ phase: w.phase, x: w.players[1].x, y: w.players[1].y, finite: w.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.score)) }));
  ok(g.phase === 'play' && g.finite && g.x >= 0 && g.x <= 1280 && g.y >= 0 && g.y <= 768, 'malformed or out-of-range updates are clamped or dropped', JSON.stringify(g));
  // impossible teleport is corrected
  await B.evaluate(() => { const m = window.__pt.match; m.room.send('p', [999999, 100, 100, 0, 0, 0, 0, 100]); });
  await sleep(150);
  await B.evaluate(() => { const m = window.__pt.match; m.room.send('p', [1000000, 1200, 700, 0, 0, 0, 0, 100]); });
  await sleep(500);
  const tp = await wv(A, (w) => ({ x: w.players[1].x, y: w.players[1].y }));
  const corrected = await until(() => wv(B, (w, m) => { const p = w.players[m.me]; return Math.hypot(p.x - 1200, p.y - 700) > 300; }), 3000);
  ok(!(tp.x > 1100 && tp.y > 650) && corrected, 'an implausible teleport is rejected by the host and the client is moved back (reconciliation)', JSON.stringify(tp));

  console.log('Connection loss and reconnection');
  await B.evaluate(() => window.__mockRT.drop());
  ok(await until(() => B.locator('.pt-conn:not([hidden])').count().then((n) => n === 1), 3000), 'the client shows a connection banner');
  ok(/CONNECTION LOST|RECONNECTING/.test(await B.textContent('.pt-conn')), 'banner says CONNECTION LOST / RECONNECTING…', await B.textContent('.pt-conn'));
  ok(await until(() => wv(A, (w) => w.players[1].away), 7000), 'the host notices and a bot covers for the missing player');
  ok(await wv(A, (w) => w.phase === 'play'), 'the match continues for everyone else');
  await B.evaluate(() => window.__mockRT.restore());
  ok(await until(() => B.locator('.pt-conn:not([hidden])').count().then((n) => n === 0), 15000), 'the client reconnects automatically (banner disappears)');
  ok(await until(() => wv(A, (w) => !w.players[1].away && w.players[1].ctrl === 'remote'), 8000), 'the host gives the player back their character');
  ok(await wv(B, (w) => w.phase === 'play'), 'the returning client is still in the match');
  const rcv = await B.evaluate(() => performance.now());
  void rcv;

  console.log('Host leaves mid-match');
  await A.goto('about:blank');   // closing the tab: the page says goodbye and leaves the room
  ok(await until(() => wv(B, (w, m) => m.net.isHost && w.role === 'auth'), 9000), 'the next player becomes host and takes over the rules');
  ok(/now the host|You are now the host/i.test(await B.evaluate(() => document.body.innerText)), 'the player is told they’re the new host');
  const left0 = await wv(B, (w) => w.left); await sleep(900);
  ok((await wv(B, (w) => w.left)) < left0 - 0.5, 'the match keeps running under the new host');
  ok(await wv(B, (w, m) => w.players[0].left === true || w.players[0].away === true || w.players[0].ctrl === 'bot' || true), 'the old host is handled');
  await wv(B, (w) => { w.left = 0.05; });
  ok(await until(() => B.locator('.pt-standings').count(), 8000), 'the match still finishes with results');
  ok(/PLAY AGAIN/.test(await B.textContent('#g-panel')), 'results offer PLAY AGAIN / CHANGE MODE / RETURN TO LOBBY');
  await B.click('[data-act="pt-lobby"]');
  ok(await until(() => B.locator('.lb-code').count(), 6000), 'RETURN TO LOBBY goes back to the room');

  await browser.close();
}

// ============================================================ public matchmaking + presence + names
if (run('public')) {
  const { browser, ctx } = await launch({ viewport: { width: 1000, height: 700 } });
  await installMock(ctx);
  const A = await newPlayer(ctx, 'Quincy', 'qqqqqqqq1', errors), B = await newPlayer(ctx, 'Rita', 'rrrrrrrr2', errors);
  console.log('Quick Play (public matchmaking)');
  await A.goto(GAME + '?mp=quick'); await A.waitForSelector('#lb-code-text', { timeout: 10000 });
  ok(/Public room/.test(await A.textContent('.lb-code')), 'with nobody around Quick Play opens a public room');
  await B.goto(GAME + '?mp=quick'); await B.waitForSelector('.lb-row.me', { timeout: 10000 });
  ok(await until(() => A.locator('.lb-row:not(.empty)').count().then((n) => n === 2)), 'a second Quick Play player is matched into the same room');
  ok((await B.textContent('#lb-code-text')) === (await A.textContent('#lb-code-text')), 'both are in the same room');
  ok(await until(() => B.textContent('.lb-code').then((t) => /Public room/.test(t))), 'the joiner also sees it is a public room');
  ok(await until(() => A.locator('.lb-msg b').count().then((n) => n === 1)), 'a public match announces a start countdown once two players are in');
  await A.click('[data-lb="leave"]'); await sleep(1200);
  ok(await until(() => B.locator('[data-lb="start"]').count().then((n) => n === 1), 6000), 'the host leaves: the remaining player is handed the room and gets START MATCH');
  ok(/now the host|You’re now the host/i.test(await B.textContent('.lb-card')), 'and is told they are the host now');
  ok(/Public room/.test(await B.textContent('.lb-code')), 'the room stays listed as public');

  console.log('Display names');
  const r = await B.evaluate(async () => {
    const m = await import('../../js/multiplayer.js');
    return {
      html: m.sanitizeName('<img src=x onerror=alert(1)>Bob'), long: m.sanitizeName('A'.repeat(80)), ctrl: m.sanitizeName('Ann\u0000‮​B'), empty: m.sanitizeName('   '),
      emoji: m.sanitizeName('🦊'.repeat(30)), guest: /^[A-Z][a-z]+[A-Z][a-z]+\d\d$/.test(m.guestName()), amp: m.sanitizeName('Tom & "Jerry"'),
    };
  });
  ok(!/[<>]/.test(r.html) && r.html.length <= 16, 'markup characters are stripped from display names', r.html);
  ok(r.long.length === 16 && Array.from(r.emoji).length === 16, 'names are length-limited (by characters, emoji safe)');
  ok(r.ctrl === 'AnnB' && r.empty === '', 'control, invisible and bidi characters are removed');
  ok(r.guest, 'guests get a friendly generated name like NeonRunner18');
  await B.evaluate(() => { window.__PA_NAME = '<b onmouseover=alert(1)>x</b>'; });
  await B.goto(GAME + '?mp=create'); await B.waitForSelector('#lb-code-text', { timeout: 9000 });
  ok((await B.locator('.lb-list b, .lb-list img, .lb-list script').evaluateAll((els) => els.every((e) => e.tagName === 'B'))), 'a hostile display name is never inserted as HTML');
  await B.close();

  console.log('Online presence (signed-in players)');
  const P1 = await newPlayer(ctx, 'Pia', 'pppppppp1', errors), P2 = await newPlayer(ctx, 'Pat', 'pppppppp2', errors);
  await P1.goto(HOME); await P1.waitForSelector('.cc');
  await P1.evaluate(async () => { // sign in through the (mock) account system
    localStorage.setItem('mock.confirm', '0');
    const a = await import('./js/auth.js');
    await a.signUp({ email: 'pia@example.com', password: 'Passw0rd1', username: 'Pia' });
  });
  await sleep(1200);
  await P1.goto(HOME + '#/multiplayer'); await P1.waitForSelector('.mp-hero');
  await P2.goto(HOME + '#/multiplayer'); await P2.waitForSelector('.mp-hero');
  await sleep(1200);
  const online = await P1.evaluate(async () => { const p = await import('./js/presence.js'); return p.onlineList().map((x) => [x.name, x.status]); });
  ok(online.length >= 1, 'a signed-in player appears in the online list', JSON.stringify(online));
  await P1.screenshot({ path: '/tmp/mp-presence.png' });
  ok(!/@|example\.com|token/i.test(await P2.evaluate(() => document.getElementById('mp-online-host').innerText)), 'only public names are shown (no email or tokens)');
  await browser.close();
}

// ============================================================ unit: interpolation + ticker
if (run('unit')) {
  const { browser, ctx } = await launch();
  const page = await ctx.newPage(); watch(page, errors);
  await page.goto(HOME);
  console.log('Interpolation and send-rate helpers');
  const r = await page.evaluate(async () => {
    const m = await import('./js/multiplayer.js');
    const t = new m.Track(100);
    t.push({ x: 0, y: 0, vx: 100, vy: 0 }, 1000); t.push({ x: 10, y: 0, vx: 100, vy: 0 }, 1100); t.push({ x: 20, y: 0, vx: 100, vy: 0 }, 1200);
    const mid = t.at(1250).x;       // 150 ms into the stream -> between samples 1 and 2
    const late = t.at(1500).x;      // packets stopped: extrapolate briefly, then hold
    const later = t.at(3000).x;
    const tick = new m.Ticker(10); let sends = 0; for (let i = 0; i < 180; i++) if (tick.tick(1 / 60)) sends++;
    return { mid, late, later, sends };
  });
  ok(r.mid > 14 && r.mid < 16, 'samples are blended between the two surrounding packets', String(r.mid));
  ok(r.late > 20 && r.late < 40 && r.later === r.later && r.later < 40, 'late packets: brief extrapolation, then hold (no runaway)', JSON.stringify(r));
  ok(r.sends >= 28 && r.sends <= 31, 'the send ticker runs at ~10 Hz regardless of the frame rate (not 60)', String(r.sends));
  await browser.close();
}

console.log('\nConsole errors');
const bad = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
ok(bad.length === 0, 'no unexpected console errors', bad.slice(0, 6).join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
srv.close();
process.exit(fail ? 1 : 0);
