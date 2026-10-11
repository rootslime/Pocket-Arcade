// Headless Pocket Tag simulation: runs every mode on every map with bots and checks the rules hold.
import { World, MODES, MODE_LIST } from '../games/pocket-tag/sim.js';
import { MAPS, analyzeMap } from '../games/pocket-tag/maps.js';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x); } };
const verbose = process.argv.includes('-v');

console.log('Maps');
for (const m of MAPS) {
  const a = analyzeMap(m);
  ok(a.equalRows && a.spawns >= 8 && a.pickups >= 3, `${m.name}: rectangular, ${a.spawns} spawns, ${a.pickups} power-up spots`);
  ok(a.spawnsConnected && a.pickupsConnected && a.connected === a.floor, `${m.name}: every spawn, pickup and floor tile is reachable (${a.connected}/${a.floor})`);
}

function sim(mapId, mode, n, diff, seed, powerups = true) {
  const roster = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, ctrl: 'bot', diff }));
  const w = new World({ mapId, mode, seed, roster, powerups, role: 'auth' });
  const stats = { tags: 0, falls: 0, ev: {}, stuck: 0 };
  const dt = 1 / 60;
  let t = 0;
  const lastPos = w.players.map((p) => [p.x, p.y]);
  let stillTime = w.players.map(() => 0);
  while (!w.over && t < 400) {
    w.step(dt, new Map());
    t += dt;
    for (const e of w.drain()) { stats.ev[e.k] = (stats.ev[e.k] || 0) + 1; if (e.k === 'tag') stats.tags++; if (e.k === 'fall') stats.falls++; }
    if (Math.round(t * 60) % 60 === 0) w.players.forEach((p, i) => { const d = Math.hypot(p.x - lastPos[i][0], p.y - lastPos[i][1]); stillTime[i] = d < 8 && !p.frozen && w.phase === 'play' ? stillTime[i] + 1 : 0; if (stillTime[i] > 6) stats.stuck++; lastPos[i] = [p.x, p.y]; });
  }
  return { w, t, stats };
}

console.log('Bot matches (every mode × every map)');
for (const m of MAPS) {
  for (const mode of MODE_LIST) {
    const { w, t, stats } = sim(m.id, mode.id, 6, 'normal', 11);
    const res = w.results();
    const alive = w.players.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0 && p.x < w.map.px && p.y < w.map.py);
    if (verbose) console.log('   ', m.id, mode.id, 'time', t.toFixed(0), 'tags', stats.tags, 'falls', stats.falls, 'stuck', stats.stuck, JSON.stringify(res.list.map((r) => r.score)));
    ok(w.over && t >= 3 && t <= MODES[mode.id].dur + 6, `${m.name} / ${mode.label}: finishes (${t.toFixed(0)}s of ${MODES[mode.id].dur}s, ${stats.tags} tags)`);
    ok(alive, `  players stay inside the map`);
    ok(stats.tags >= (mode.id === 'crown' ? 3 : 4), `  bots actually tag each other (${stats.tags})`, JSON.stringify(stats));
    ok(res.list[0].score > 0, `  scores are awarded (${res.list.map((r) => r.score).join(', ')})`);
  }
}

console.log('Rules');
{
  // classic: tag transfers It, protection prevents instant tag-back
  const w = new World({ mapId: 'playground', mode: 'classic', seed: 5, powerups: false, roster: [{ id: 'a', name: 'A', ctrl: 'local' }, { id: 'b', name: 'B', ctrl: 'local' }, { id: 'c', name: 'C', ctrl: 'local' }] });
  w.phase = 'play';
  const [a, b, c] = w.players;
  a.it = true; b.it = c.it = false;
  a.x = 100; a.y = 100; b.x = 112; b.y = 100; c.x = 600; c.y = 400;
  w.step(1 / 60, new Map());
  ok(!a.it && b.it, 'classic: tagging transfers It', `a.it=${a.it} b.it=${b.it}`);
  ok(a.prot > 1 && !w.canTag(b, a), 'classic: tag-back protection for ~1.5s');
  ok(w.drain().some((e) => e.k === 'tag' && e.a === 0 && e.b === 1), 'classic: tag event emitted');
  for (let i = 0; i < 100; i++) w.step(1 / 60, new Map());
  ok(a.prot > 0 === false || a.prot < 0.2, 'classic: protection expires');
  b.shieldT = 5; b.it = false; a.it = true; c.it = false; a.prot = 0; b.prot = 0; a.x = 100; a.y = 100; b.x = 110; b.y = 100;
  w.step(1 / 60, new Map());
  ok(!b.it && b.shieldT === 0 && a.it, 'shield blocks exactly one tag');
}
{
  const w = new World({ mapId: 'playground', mode: 'freeze', seed: 3, powerups: false, roster: ['a', 'b', 'c'].map((id) => ({ id, name: id, ctrl: 'local' })) });
  w.phase = 'play';
  const [t0, r1, r2] = w.players;
  for (const p of w.players) { p.role = 'runner'; p.frozen = false; }
  t0.role = 'tagger'; t0.x = 100; t0.y = 100; r1.x = 110; r1.y = 100; r2.x = 700; r2.y = 500;
  w.step(1 / 60, new Map());
  ok(r1.frozen, 'freeze: tagger freezes a runner');
  r2.x = 118; r2.y = 112; t0.x = 900; t0.y = 600;
  for (let i = 0; i < 90; i++) w.step(1 / 60, new Map());
  ok(!r1.frozen && r2.score >= 200, 'freeze: a runner standing next to a frozen teammate thaws them');
  r1.frozen = r2.frozen = true; t0.x = 900; t0.y = 600;
  w.step(1 / 60, new Map());
  ok(w.over && w.results().winners.includes(0), 'freeze: taggers win when every runner is frozen');
}
{
  const w = new World({ mapId: 'mall', mode: 'infection', seed: 4, powerups: false, roster: ['a', 'b', 'c'].map((id) => ({ id, name: id, ctrl: 'local' })) });
  w.phase = 'play';
  const [a, b, c] = w.players;
  for (const p of w.players) p.infected = false;
  a.infected = true; a.x = 100; a.y = 100; b.x = 110; b.y = 100; c.x = 500; c.y = 500;
  w.step(1 / 60, new Map());
  ok(b.infected && !c.infected, 'infection: tagged players join the infected');
  c.x = 120; c.y = 100; b.x = 130; b.y = 100; w.step(1 / 60, new Map());
  ok(w.over && w.lastSurvivor === 2, 'infection: ends when everyone is infected, last survivor recorded');
  ok(w.players[2].score >= 800 && w.results().winners[0] === 2, 'infection: final survivor gets the large bonus and the win');
}
{
  const w = new World({ mapId: 'rooftop', mode: 'crown', seed: 2, powerups: false, roster: ['a', 'b', 'c'].map((id) => ({ id, name: id, ctrl: 'local' })) });
  w.phase = 'play';
  const [a, b, c] = w.players;
  for (const p of w.players) p.crown = false;
  a.crown = true; a.x = 100; a.y = 100; b.x = 112; b.y = 100; c.x = 60; c.y = 150;
  // only a non-holder can take the crown
  w.step(1 / 60, new Map());
  ok(b.crown && !a.crown, 'crown: tagging the holder transfers the crown');
  ok(b.prot > 1, 'crown: new holder is briefly protected');
  const s0 = b.score;
  for (let i = 0; i < 120; i++) { w.step(1 / 60, new Map()); }
  ok(b.score > s0 + 20, 'crown: holding the crown scores over time');
}
{
  // movement: jump over a bench, slide under a tunnel, can't walk through walls, gaps respawn
  const w = new World({ mapId: 'playground', mode: 'classic', seed: 1, powerups: false, roster: [{ id: 'a', name: 'A', ctrl: 'local' }, { id: 'b', name: 'B', ctrl: 'bot' }] });
  w.phase = 'play';
  const p = w.players[0];
  const T = 32;
  // tunnel row y=19, x=4..10  (overhead)
  p.x = 3.5 * T; p.y = 19.5 * T; p.vx = 0; p.vy = 0;
  const run = { mx: 1, my: 0, sprint: false, jump: false, slide: false, dash: false };
  for (let i = 0; i < 60; i++) w.step(1 / 60, new Map([['a', run]]));
  ok(p.x < 4.5 * T, 'upright players cannot enter a tunnel', `x=${p.x.toFixed(0)}`);
  p.x = 3.5 * T; p.vx = 220; p.slideT = 0; p.slideCd = 0;
  w.step(1 / 60, new Map([['a', { ...run, slide: true }]]));
  for (let i = 0; i < 90; i++) w.step(1 / 60, new Map([['a', run]]));
  ok(p.x > 8 * T, 'sliding carries you under the tunnel', `x=${p.x.toFixed(0)}`);
  // bench: auto-vault. bench pair at (7..8, 8)
  p.x = 5.5 * T; p.y = 8.5 * T; p.vx = 0; p.vy = 0; p.slideT = 0; p.z = 0; p.grounded = true; p.vaultT = 0;
  for (let i = 0; i < 120; i++) w.step(1 / 60, new Map([['a', { ...run, sprint: true }]]));
  ok(p.x > 9.5 * T, 'running into a bench vaults over it', `x=${p.x.toFixed(0)}`);
  // walls
  p.x = 3.5 * T; p.y = 11.5 * T; p.vx = 0;
  for (let i = 0; i < 60; i++) w.step(1 / 60, new Map([['a', { mx: -1, my: 0, sprint: true }]]));
  ok(p.x >= 1.2 * T, 'walls stop players', `x=${p.x.toFixed(0)}`);
  // stamina drains and recovers
  p.x = 20 * T; p.y = 4.5 * T; p.vx = 0; p.stam = 100; p.exhausted = false;
  for (let i = 0; i < 120; i++) w.step(1 / 60, new Map([['a', { mx: 0, my: 1, sprint: true }]]));
  ok(p.stam < 60, 'sprinting drains stamina', `stam=${p.stam.toFixed(0)}`);
  for (let i = 0; i < 400; i++) w.step(1 / 60, new Map());
  ok(p.stam > 90, 'stamina regenerates when you stop sprinting');
  // dash cooldown
  p.dashCd = 0; p.x = 20 * T; p.y = 4.5 * T; p.vx = p.vy = 0;
  w.step(1 / 60, new Map([['a', { mx: 1, my: 0, dash: true }]]));
  ok(p.dashT > 0 && p.dashCd > 2, 'dash starts and goes on cooldown');
  const x0 = p.x; w.step(1 / 60, new Map([['a', { mx: 1, my: 0, dash: true }]]));
  ok(p.dashCd > 2, 'dash cannot be spammed');
}
{
  const w = new World({ mapId: 'rooftop', mode: 'classic', seed: 1, powerups: false, roster: [{ id: 'a', name: 'A', ctrl: 'local' }, { id: 'b', name: 'B', ctrl: 'bot' }] });
  w.phase = 'play';
  const p = w.players[0], T = 32;
  p.x = 8.2 * T; p.y = 2.5 * T; p.safeX = p.x; p.safeY = p.y;   // standing next to the gap at x=9..11 (y=2)
  const east = { mx: 1, my: 0, sprint: false };
  for (let i = 0; i < 90; i++) w.step(1 / 60, new Map([['a', east]]));
  ok(p.falling > 0 || p.x < 14 * T, 'walking into a gap makes you fall', `x=${p.x.toFixed(0)}`);
  for (let i = 0; i < 120; i++) w.step(1 / 60, new Map());
  const tt = w.tile(p.x, p.y);
  ok(tt !== '_' && p.falling === 0 && p.stun >= 0, 'falling respawns you on solid ground, never outside the map', `tile=${tt}`);
  // a sprinting jump clears a 3-tile gap via the ramp
  p.x = 6 * T; p.y = 3.5 * T; p.vx = p.vy = 0; p.z = 0; p.grounded = true; p.falling = 0; p.stun = 0; p.stam = 100; p.safeX = p.x; p.safeY = p.y;
  let landed = false;
  for (let i = 0; i < 160; i++) { w.step(1 / 60, new Map([['a', { mx: 1, my: 0, sprint: true }]])); if (p.x > 12 * T && p.grounded && p.falling === 0) { landed = true; break; } }
  ok(landed, 'the ramp launches a sprinter across the 3-tile gap', `x=${p.x.toFixed(0)} tile=${w.tile(p.x, p.y)} falling=${p.falling}`);
}

console.log('Difficulty (bots must not be superhuman)');
{
  let tagsByDiff = {};
  for (const diff of ['easy', 'normal', 'hard']) {
    let total = 0;
    for (let s = 0; s < 6; s++) total += sim('playground', 'classic', 6, diff, 100 + s).stats.tags;
    tagsByDiff[diff] = total / 6;
  }
  if (verbose) console.log('   avg tags per 90s match', JSON.stringify(tagsByDiff));
  for (const d of ['easy', 'normal', 'hard']) ok(tagsByDiff[d] >= 5 && tagsByDiff[d] < 40, `${d} bots produce a sensible tag rate (${tagsByDiff[d].toFixed(1)} tags per 90s match)`);
  const { DIFFICULTIES } = await import('../games/pocket-tag/bots.js');
  ok(Object.values(DIFFICULTIES).every((d) => d.react >= 0.25), 'bot reaction times are never superhuman (≥ 250 ms on every difficulty)');
  ok(DIFFICULTIES.easy.react > DIFFICULTIES.normal.react && DIFFICULTIES.normal.react > DIFFICULTIES.hard.react, 'harder bots react faster');
  ok(DIFFICULTIES.easy.mistake > DIFFICULTIES.hard.mistake, 'easier bots make more mistakes');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
