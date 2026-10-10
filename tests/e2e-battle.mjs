// Snake Battle in a real browser: bots, local players, online room (mock Realtime), results and saves.
import { launch, watch } from './lib.mjs';
import { serve } from './serve.mjs';
import { installMock, newPlayer } from './helpers-mp.mjs';
const srv = await serve(8134);
const HOME = 'http://localhost:8134/pocket-arcade/';
const PAGE = HOME + 'games/turbo-snake/battle.html';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 80) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return false; await sleep(step); } }
const errors = [];
const bv = (p, fn, arg) => p.evaluate(`(() => { const m = window.__sb.match; const b = m && m.battle; return (${fn.toString()})(b, m, ${JSON.stringify(arg ?? null)}); })()`);

{
  const { browser, ctx } = await launch({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage(); watch(page, errors);
  console.log('Console entry (online not configured)');
  await page.goto(HOME + '#/multiplayer'); await page.waitForSelector('.mp-hero');
  await page.goto(HOME + '#/game/turbo-snake'); await page.waitForSelector('.detail');
  const mpb = (await page.locator('.mp-box .btn').allTextContents()).map((t) => t.trim());
  ok(mpb.join() === 'Local Play,Play with Bots', 'Turbo Snake detail offers Local Play and Play with Bots (no online buttons without a service)', mpb.join());
  await page.click('.mp-box [data-mode="bots"]'); await page.waitForURL(/battle\.html\?mp=bots/);
  ok(true, 'the button opens Snake Battle with the bots setup');
  await page.waitForSelector('.lb-card');
  ok(/Play with Bots/i.test(await page.textContent('.lb-card h2')) && (await page.locator('.lb-chip[data-key="bots"]').count()) === 4, 'setup: bots 0–3, difficulty, speed');
  await page.click('.lb-chip[data-key="bots"][data-val="3"]'); await page.click('[data-lb="go-offline"]');
  await until(() => bv(page, (b, m) => b && m.cd <= 0 && b.tick > 0), 9000);
  ok(await bv(page, (b) => b.snakes.length === 4 && b.snakes[0].ctrl === 'human' && b.snakes.slice(1).every((s) => s.ctrl === 'bot')), 'one human and three bots in a four-snake arena');
  ok((await page.locator('#hud-alive').textContent()).includes('/4'), 'HUD shows snakes alive');
  const d0 = await bv(page, (b) => b.snakes[0].dir);
  await page.keyboard.press(d0 === 'right' || d0 === 'left' ? 'ArrowDown' : 'ArrowRight'); await sleep(450);
  ok(await bv(page, (b, m, d) => b.snakes[0].dir !== d || !b.snakes[0].alive, d0), 'arrow keys steer the snake');
  await page.keyboard.press('Escape'); await sleep(200);
  const t0 = await bv(page, (b) => b.tick); await sleep(500);
  ok((await bv(page, (b) => b.tick)) === t0 && /Paused/.test(await page.textContent('#g-panel')), 'pause freezes the battle');
  await page.click('[data-act="resume"]');
  // let the match run to its end (human may die first)
  const done = await until(() => page.locator('.mp-standings').count(), 90000, 300);
  ok(!!done, 'a battle always ends with a results screen');
  const txt = await page.textContent('#g-panel');
  ok(/MATCH OVER/i.test(txt) && (await page.locator('.mp-row').count()) === 4 && /🥇/.test(txt), 'results: standings with medals for all four');
  const rb = (await page.locator('#g-panel .p-btns .g-btn').allTextContents()).map((t) => t.trim());
  ok(['PLAY AGAIN', 'CHANGE MODE', 'RETURN TO LOBBY', 'ARCADE HOME'].every((t) => rb.includes(t)), 'results buttons', rb.join('|'));
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')));
  ok(sv.profile.stats.perGame.turboSnake && sv.profile.stats.perGame.turboSnake.counters.battles === 1, 'battle is recorded in the save');
  ok(sv.profile.recent[0].id === 'turboSnake', 'listed under recently played');
  await page.click('[data-act="sb-again"]'); await until(() => bv(page, (b) => b && b.tick === 0), 4000);
  ok(await bv(page, (b, m) => b.tick === 0 && m.cd > 0), 'PLAY AGAIN starts a fresh battle with a countdown');

  console.log('Local multiplayer');
  await page.goto(PAGE + '?mp=local'); await page.waitForSelector('.lb-card');
  await page.click('.lb-chip[data-key="humans"][data-val="2"]'); await page.click('.lb-chip[data-key="bots"][data-val="0"]'); await page.click('[data-lb="go-offline"]');
  await until(() => bv(page, (b, m) => b && m.cd <= 0 && b.tick > 1), 9000);
  ok(await bv(page, (b, m) => m.locals.length === 2 && b.snakes.length === 2), 'two local players, no bots');
  const dirs0 = await bv(page, (b) => b.snakes.map((s) => s.dir));
  // P1 (WASD) and P2 (arrows) steer independently: P1 starts heading right, P2 heading left
  await page.keyboard.press('KeyS'); await page.keyboard.press('ArrowUp'); await sleep(300);
  const dirs1 = await bv(page, (b) => b.snakes.map((s) => s.dir));
  ok(dirs0[0] === 'right' && dirs1[0] === 'down' && dirs1[1] === 'up', 'WASD steers player 1 and the arrow keys steer player 2', JSON.stringify([dirs0, dirs1]));
  await page.close();
  await browser.close();
}

{
  const { browser, ctx } = await launch({ viewport: { width: 1000, height: 700 } });
  await installMock(ctx);
  const A = await newPlayer(ctx, 'Alex', 'aaaaaaaa1', errors), B = await newPlayer(ctx, 'Mia', 'bbbbbbbb2', errors);
  console.log('Online room');
  await A.goto(PAGE + '?mp=create'); await A.waitForSelector('#lb-code-text', { timeout: 9000 });
  const code = await A.textContent('#lb-code-text');
  await B.goto(PAGE + `?mp=join&code=${code}`); await B.waitForSelector('.lb-row.me', { timeout: 9000 });
  await B.click('[data-lb="ready"]');
  await A.click('.lb-host-box .lb-chip[data-key="bots"][data-val="1"]'); await sleep(300);
  await A.click('[data-lb="start"]');
  ok(await until(() => Promise.all([bv(A, (b) => !!b), bv(B, (b) => !!b)]).then((r) => r[0] && r[1]), 9000), 'both clients enter the battle');
  const ia = await bv(A, (b, m) => ({ n: b.snakes.length, auth: m.auth, names: b.snakes.map((s) => s.name) })), ib = await bv(B, (b, m) => ({ n: b.snakes.length, auth: m.auth, names: b.snakes.map((s) => s.name) }));
  ok(ia.n === 3 && ib.n === 3 && ia.names.join() === ib.names.join() && ia.auth && !ib.auth, 'same roster (2 humans + 1 bot); the host simulates, the other follows', JSON.stringify([ia, ib]));
  await until(() => bv(B, (b) => b.tick > 3), 9000);
  const sync1 = await Promise.all([bv(A, (b) => b.tick), bv(B, (b) => b.tick)]);
  ok(Math.abs(sync1[0] - sync1[1]) <= 3 && sync1[1] > 3, 'the follower receives the host’s state every move', JSON.stringify(sync1));
  // Mia steers from client B; the host applies it
  const dm = await bv(B, (b) => b.snakes[1].dir);
  await B.keyboard.press(dm === 'up' || dm === 'down' ? 'ArrowRight' : 'ArrowUp'); await sleep(500);
  ok(await until(() => bv(A, (b, m, d) => b.snakes[1].dir !== d || !b.snakes[1].alive, dm), 3000), 'a client’s steering reaches the host and changes the snake', dm);
  ok(await until(() => bv(B, (b, m, d) => b.snakes[1].dir !== d || !b.snakes[1].alive, dm), 3000), 'and comes back to the client in the next state');
  // garbage from a non-host cannot forge state
  await B.evaluate(() => { const r = window.__sb.match.room; r.send('st', { n: 99999, o: 1, w: 1, s: [] }); r.send('in', { d: 'sideways' }); r.send('in', 5); });
  await sleep(500);
  ok(await bv(A, (b) => !b.over), 'malformed input and forged state from a client are ignored');
  // host leaves: the follower becomes host and the battle continues
  await A.goto('about:blank');
  ok(await until(() => bv(B, (b, m) => m.auth), 9000), 'when the host leaves the next player takes over the simulation');
  const tk = await bv(B, (b) => b.tick); await sleep(1200);
  ok((await bv(B, (b) => b.tick)) > tk, 'the battle continues under the new host');
  await browser.close();
}

const bad = errors.filter((e) => !/favicon|404/.test(e));
ok(bad.length === 0, 'no unexpected console errors', bad.slice(0, 5).join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
srv.close(); process.exit(fail ? 1 : 0);
