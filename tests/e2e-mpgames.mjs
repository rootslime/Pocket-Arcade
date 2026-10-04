// Multiplayer modes of Neon Dodge (Last Standing), Brick Blast (Brick Battle), Drift Circuit (race) and
// Asteroid Dash (co-op) against the mock realtime service.
import { launch, watch } from './lib.mjs';
import { serve } from './serve.mjs';
import { installMock, newPlayer } from './helpers-mp.mjs';
const srv = await serve(8135);
const HOME = 'http://localhost:8135/pocket-arcade/';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 80) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) return false; await sleep(step); } }
const errors = [];
const ONLY = process.env.ONLY || '';
const run = (n) => !ONLY || ONLY === n;
const startRoom = async (A, B, url, setup) => {
  await A.goto(url + '?mp=create'); await A.waitForSelector('#lb-code-text', { timeout: 9000 });
  const code = await A.textContent('#lb-code-text');
  await B.goto(url + `?mp=join&code=${code}`); await B.waitForSelector('.lb-row.me', { timeout: 9000 });
  await B.click('[data-lb="ready"]');
  if (setup) await setup(A, B);
  await sleep(300);
  await A.click('[data-lb="start"]');
};

if (run('dodge')) {
  const { browser, ctx } = await launch({ viewport: { width: 700, height: 900 } });
  const plain = await ctx.newPage(); watch(plain, errors);
  console.log('Neon Dodge — Last Standing');
  await plain.goto(HOME + '#/game/neon-dodge'); await plain.waitForSelector('.detail');
  ok((await plain.locator('.mp-box').count()) === 0, 'without a realtime service Neon Dodge shows no multiplayer buttons (nothing fake)');
  await plain.goto(HOME + 'games/neon-dodge/'); await plain.waitForSelector('[data-act="start"]');
  ok(true, 'the normal single-player page is unchanged (start screen)');
  await plain.close();
  const ctx2 = await browser.newContext({ viewport: { width: 700, height: 900 } });
  await installMock(ctx2);
  const A = await newPlayer(ctx2, 'Alex', 'aaaaaaaa1', errors), B = await newPlayer(ctx2, 'Mia', 'bbbbbbbb2', errors);
  const U = HOME + 'games/neon-dodge/';
  await startRoom(A, B, U);
  const inMatch = (p) => p.evaluate(() => !!(window.__ndmp && window.__ndmp.MP.on && window.__dodge));
  ok(await until(() => Promise.all([inMatch(A), inMatch(B)]).then((r) => r[0] && r[1]), 9000), 'both players enter the match');
  ok(await until(() => A.evaluate(() => window.__ndmp.MP.cd < 2.5 && window.__ndmp.MP.cd > 0), 4000), 'a synchronised countdown runs first');
  await until(() => Promise.all([A, B].map((p) => p.evaluate(() => window.__dodge.S.t > 9))).then((r) => r[0] && r[1]), 25000);
  const [sa, sb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.__dodge.S.seq.slice(0, 3))));
  ok(sa.length >= 2 && sa.join() === sb.join(), 'both players face the identical hazard sequence (same seed)', JSON.stringify([sa, sb]));
  ok((await A.locator('.mp-peers').count()) === 1 && /Mia/.test(await A.textContent('.mp-peers')), 'an opponents panel shows who is still alive');
  await A.evaluate(() => { const S = window.__dodge.S; S.fx.shield = 0; S.p.inv = 0; window.__dodge.die({}); });
  ok(await until(() => B.evaluate(() => [...window.__ndmp.MP.peers.values()].some((p) => !p.alive)), 4000), 'a knock-out is announced to the other player');
  ok(await until(() => B.locator('.mp-standings').count().then((n) => n === 1), 8000), 'the last player alive wins immediately: results appear');
  { const t = await B.textContent('#g-panel'); ok(/🥇[\s\S]*Mia/.test(t) && /1st of 2/.test(t), 'the survivor is ranked 1st', t.replace(/\s+/g, ' ').slice(0, 300)); }
  ok(await until(() => A.locator('.mp-standings').count().then((n) => n === 1), 8000), 'the knocked-out player gets results too');
  { const t = await A.textContent('#g-panel'); ok(/2nd of 2/.test(t), 'and is ranked 2nd', t.replace(/\s+/g, ' ').slice(0, 300)); }
  // (both tabs share one browser profile here, so read the winner's in-memory save rather than localStorage)
  const sv = await B.evaluate(async () => { const st = await import('../../js/storage.js'); return st.getProfile(); });
  ok(sv.stats.perGame.neonDodge.counters.lsWins === 1 && !!sv.achievements.nd_standing, 'the win is saved and the achievement unlocks', JSON.stringify(sv.stats.perGame.neonDodge));
  await B.click('[data-act="nd-lobby"]');
  ok(await until(() => B.locator('.lb-code').count(), 6000), 'RETURN TO LOBBY goes back to the room');
  await browser.close();
}

if (run('brick')) {
  const { browser, ctx } = await launch({ viewport: { width: 700, height: 900 } });
  const page = await ctx.newPage(); watch(page, errors);
  console.log('Brick Blast — Brick Battle');
  await page.goto(HOME + '#/game/brick-blast'); await page.waitForSelector('.detail');
  const mpb = (await page.locator('.mp-box .btn').allTextContents()).map((t) => t.trim());
  ok(mpb.join() === 'Local Play', 'without a realtime service Brick Blast offers Local Play only', mpb.join());
  await page.goto(HOME + 'games/brick-blast/?mp=local'); await page.waitForSelector('.lb-card');
  await page.click('.lb-chip[data-key="humans"][data-val="2"]'); await page.click('[data-lb="go-offline"]');
  await until(() => page.evaluate(() => window.__bbmp && window.__bbmp.MP.on && window.__bbmp.G.bricks.length > 0), 6000);
  const layout1 = await page.evaluate(() => window.__bbmp.G.bricks.map((b) => (b.drop ? 1 : 0)).join(''));
  ok(layout1.includes('1'), 'the bricks include power-up carriers');
  await page.evaluate(() => { window.__bbmp.G.score = 500; window.__bbmp.end(false); });
  ok(await until(() => page.locator('[data-modal="go"]').count().then((n) => n === 1), 4000), 'after player 1 finishes, player 2 gets a “you’re up” prompt with the score to beat');
  ok(/500/.test(await page.textContent('#g-panel')), 'the prompt shows player 1’s score');
  await page.click('[data-modal="go"]');
  await until(() => page.evaluate(() => window.__bbmp.G.score === 0 && window.__bbmp.G.bricks.length > 0), 4000);
  const layout2 = await page.evaluate(() => window.__bbmp.G.bricks.map((b) => (b.drop ? 1 : 0)).join(''));
  ok(layout1 === layout2, 'player 2 gets exactly the same bricks and power-up drops (shared seed)');
  await page.evaluate(() => { window.__bbmp.G.score = 300; window.__bbmp.end(false); });
  ok(await until(() => page.locator('.mp-standings').count().then((n) => n === 1), 6000), 'results show standings for both players');
  const t = await page.textContent('#g-panel');
  ok(/1st of 2/.test(t) && /500/.test(t) && /300/.test(t) && /Player 2/.test(t), 'player 1 (500) beats player 2 (300)', t.replace(/\s+/g, ' ').slice(0, 200));
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')));
  ok(sv.profile.stats.perGame.brickBlast.counters.bbMatches === 1 && sv.profile.stats.perGame.brickBlast.counters.bbWins === 1 && !!sv.profile.achievements.bb_duel, 'the battle is saved and “Brick Duelist” unlocks');
  await page.close(); await browser.close();

  const ctx2 = await (await launch()).browser.newContext({ viewport: { width: 700, height: 900 } });
  await installMock(ctx2);
  const A = await newPlayer(ctx2, 'Alex', 'aaaaaaaa1', errors), B = await newPlayer(ctx2, 'Mia', 'bbbbbbbb2', errors);
  await startRoom(A, B, HOME + 'games/brick-blast/');
  const inMatch = (p) => p.evaluate(() => !!(window.__bbmp && window.__bbmp.MP.on && window.__bbmp.MP.kind === 'online'));
  ok(await until(() => Promise.all([inMatch(A), inMatch(B)]).then((r) => r[0] && r[1]), 9000), 'online: both players enter the battle');
  await until(() => Promise.all([A, B].map((p) => p.evaluate(() => window.__bbmp.MP.cd <= 0 && window.__bbmp.G.bricks.length > 0))).then((r) => r[0] && r[1]), 9000);
  const [la, lb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.__bbmp.G.bricks.map((b) => (b.drop ? 1 : 0)).join(''))));
  ok(la === lb && la.includes('1'), 'online: identical bricks and drops for both players');
  ok((await A.locator('.mp-peers').count()) === 1, 'an opponents panel shows the other player’s score');
  await A.evaluate(() => { window.__bbmp.G.score = 700; window.__bbmp.end(false); });
  ok(await until(() => B.evaluate(() => window.__bbmp.MP.board.others.some((p) => p.done && p.score === 700)), 4000), 'B sees A’s finished score');
  ok(/waiting for 1 more player/.test(await A.textContent('.mp-wait')), 'A waits for the remaining player');
  await B.evaluate(() => { window.__bbmp.G.score = 900; });
  ok(await until(() => B.locator('.mp-standings').count().then((n) => n === 1), 6000), 'B clinches the win by passing the finished player’s score');
  ok(await until(() => A.locator('.mp-standings').count().then((n) => n === 1), 6000), 'and A gets the results too');
  ok(/1st of 2/.test(await B.textContent('#g-panel')) && /2nd of 2/.test(await A.textContent('#g-panel')), 'B is 1st, A is 2nd');
  await browser.close();
}

if (run('drift')) {
  const { browser, ctx } = await launch({ viewport: { width: 900, height: 700 } });
  const plain = await ctx.newPage(); watch(plain, errors);
  console.log('Drift Circuit — multiplayer race');
  await plain.goto(HOME + '#/game/drift-circuit'); await plain.waitForSelector('.detail');
  ok((await plain.locator('.mp-box').count()) === 0, 'without a realtime service no multiplayer buttons are shown');
  await plain.goto(HOME + 'games/drift-circuit/'); await plain.waitForSelector('[data-act="start"]');
  ok((await plain.locator('#hud-pos').count()) === 0, 'the single-player race is unchanged (no position HUD)');
  await plain.close();
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await installMock(ctx2);
  const A = await newPlayer(ctx2, 'Alex', 'aaaaaaaa1', errors), B = await newPlayer(ctx2, 'Mia', 'bbbbbbbb2', errors);
  await startRoom(A, B, HOME + 'games/drift-circuit/', async (a) => { await a.click('.lb-host-box .lb-chip[data-key="track"][data-val=\'"sunset"\']'); });
  const inMatch = (p) => p.evaluate(() => !!(window.__dcmp && window.__dcmp.MP.on && window.__drift));
  ok(await until(() => Promise.all([inMatch(A), inMatch(B)]).then((r) => r[0] && r[1]), 9000), 'both players enter the race');
  const [ta, tb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.__drift.race.track.def.id)));
  ok(ta === 'sunset' && tb === 'sunset', 'the host’s track choice applies to everyone', `${ta}/${tb}`);
  ok(await until(() => A.evaluate(() => window.__drift.race.state === 'racing'), 9000) && await until(() => B.evaluate(() => window.__drift.race.state === 'racing'), 9000), 'the countdown ends and the race starts');
  ok(/1st\/2|2nd\/2/.test(await A.textContent('#hud-pos')), 'a position HUD shows your place (e.g. 1st/2)', await A.textContent('#hud-pos'));
  await A.keyboard.down('KeyW'); await sleep(1800);
  const seen = await B.evaluate(() => { const t = window.__dcmp.MP.tracks.get(0); const g = t.at(); return { x: g && g.x, n: t.buf.length, prog: window.__dcmp.MP.prog.get(0) }; });
  await A.keyboard.up('KeyW');
  ok(seen.n >= 5 && seen.prog > 0, 'the other car’s position and progress arrive ~10 times a second', JSON.stringify(seen));
  const place = await A.evaluate(() => document.getElementById('hud-pos').textContent), placeB = await B.evaluate(() => document.getElementById('hud-pos').textContent);
  ok(place.startsWith('1st') && placeB.startsWith('2nd'), 'the car that is ahead is 1st and the other 2nd', `${place} / ${placeB}`);
  const smooth = await B.evaluate(() => new Promise((res) => { const t = window.__dcmp.MP.tracks.get(0); const xs = []; const t0 = performance.now(); const f = () => { const g = t.at(); xs.push(g.x); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(xs); }; f(); }));
  ok(smooth.length > 5, 'ghost cars are rendered every frame from interpolated samples');
  await A.evaluate(() => window.__drift.forceFinish(62000));
  ok(await until(() => B.evaluate(() => window.__dcmp.MP.board.others.some((p) => p.done && p.score === 62000)), 4000), 'B sees that A has finished (62.000 s)');
  ok(/Waiting for 1 more driver/.test(await A.textContent('.mp-wait')), 'A waits for the remaining driver');
  await B.evaluate(() => window.__drift.forceFinish(62200));
  ok(await until(() => Promise.all([A, B].map((p) => p.locator('.mp-standings').count())).then((r) => r[0] === 1 && r[1] === 1), 8000), 'both get the race results');
  const ta2 = await A.textContent('#g-panel'), tb2 = await B.textContent('#g-panel');
  ok(/You won the race/.test(ta2) && /1st of 2/.test(ta2) && /Race over · 2nd/.test(tb2), 'A is 1st, B is 2nd', ta2.replace(/\s+/g, ' ').slice(0, 160));
  ok(/\+0\.20s/.test(tb2), 'the gap to the winner is shown (+0.20s)');
  const prof = await A.evaluate(async () => { const st = await import('../../js/storage.js'); return st.getProfile(); });
  ok(!!prof.achievements.dc_photo && !!prof.achievements.dc_victor && prof.stats.perGame.driftCircuit.counters.raceWins === 1, '“Photo Finish” (won by 0.2 s) and “Race Winner” unlock, the win is counted');
  await browser.close();
}

if (run('coop')) {
  const { browser, ctx } = await launch({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage(); watch(page, errors);
  console.log('Asteroid Dash — Co-op (local)');
  await page.goto(HOME + '#/game/asteroid-dash'); await page.waitForSelector('.detail');
  const mpb = (await page.locator('.mp-box .btn').allTextContents()).map((t2) => t2.trim());
  ok(mpb.join() === 'Local Play', 'Asteroid Dash offers Local Play only (co-op is same-screen)', mpb.join());
  await page.click('.mp-box [data-mode="local"]'); await page.waitForURL(/coop\.html\?mp=local/);
  await page.waitForSelector('.lb-card');
  await page.click('.lb-chip[data-key="humans"][data-val="2"]'); await page.click('[data-lb="go-offline"]');
  await until(() => page.evaluate(() => window.__coop && window.__coop.C.ships.length === 2 && window.__coop.C.rocks.length > 0), 8000);
  ok(await page.evaluate(() => window.__coop.C.ships.length === 2 && window.__coop.C.ships.every((s) => s.lives === 3)), 'two ships with their own lives');
  const a0 = await page.evaluate(() => window.__coop.C.ships.map((s) => s.a));
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft'); await sleep(400); await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
  const a1 = await page.evaluate(() => window.__coop.C.ships.map((s) => s.a));
  ok(a1[0] > a0[0] + 0.5 && a1[1] < a0[1] - 0.5, 'player 1 (A/D) and player 2 (arrows) rotate independently', JSON.stringify([a0, a1]));
  await page.keyboard.down('Space'); await sleep(300); await page.keyboard.up('Space');
  ok(await page.evaluate(() => window.__coop.C.bullets.length > 0 && window.__coop.C.bullets.every((b) => b.o === 0)), 'Space fires player 1’s bullets only');
  // individual scoring: a bullet of player 2 breaks a rock
  await page.evaluate(() => { const C = window.__coop.C; C.rocks.length = 0; C.saucers.length = 0; C.saucerQ.length = 0; C.rocks.push({ x: 400, y: 300, vx: 0, vy: 0, size: 1, r: 14, rot: 0, vr: 0, shape: Array(10).fill(1) }); C.bullets.push({ x: 400, y: 300, vx: 0, vy: 0, life: 1, o: 1 }); });
  await sleep(150);
  ok(await page.evaluate(() => window.__coop.C.ships[1].score >= 100 && window.__coop.C.ships[0].score === 0), 'points go to the player whose bullet hit (individual scores)');
  // friendly fire is off
  const lives = await page.evaluate(() => { const C = window.__coop.C; C.bullets.push({ x: C.ships[0].x, y: C.ships[0].y, vx: 0, vy: 0, life: 1, o: 1 }); return C.ships[0].lives; });
  await sleep(150);
  ok((await page.evaluate(() => window.__coop.C.ships[0].lives)) === lives, 'no friendly fire');
  // a dead ship comes back with the next wave; game ends only when everybody is out
  await page.evaluate(() => { const C = window.__coop.C; C.ships[0].inv = 0; C.ships[0].up.shield = 0; C.rocks.push({ x: C.ships[0].x, y: C.ships[0].y, vx: 0, vy: 0, size: 3, r: 44, rot: 0, vr: 0, shape: Array(10).fill(1) }); });
  await sleep(200);
  ok(await page.evaluate(() => window.__coop.C.ships[0].dead > 0 && window.__coop.C.ships[0].lives === 2), 'a hit costs one life and the ship is out for a moment');
  ok(await page.evaluate(() => !window.__coop.C.over), 'the team keeps playing while a teammate is alive');
  await page.evaluate(() => { const C = window.__coop.C; for (const s of C.ships) { s.lives = 1; s.inv = 0; s.up.shield = 0; s.dead = 0; } C.rocks.length = 0; for (const s of C.ships) C.rocks.push({ x: s.x, y: s.y, vx: 0, vy: 0, size: 3, r: 44, rot: 0, vr: 0, shape: Array(10).fill(1) }); });
  ok(await until(() => page.locator('.mp-standings').count().then((n) => n === 1), 6000), 'when everyone is out the team result appears');
  const txt = await page.textContent('#g-panel');
  ok(/TEAM RESULT/i.test(txt) && /Individual scores/.test(txt) && /Your team reached wave 1/.test(txt), 'team result with individual scores', txt.replace(/\s+/g, ' ').slice(0, 160));
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1')));
  ok(sv.profile.stats.perGame.asteroidDash.counters.coopMatches === 1, 'the co-op game is counted in the profile stats');
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
const bad = errors.filter((e) => !/favicon|404/.test(e));
if (bad.length) { console.log('console errors:', bad.slice(0, 5)); fail++; }
srv.close(); process.exit(fail ? 1 : 0);
