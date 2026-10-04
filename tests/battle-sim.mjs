// Snake Battle rules and bots, headless.
import { Battle, COLS, ROWS, TICK, DIR } from '../games/turbo-snake/battle-sim.js';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x); } };
const mk = (n, extra = {}) => new Battle({ players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, ctrl: 'human', ...extra })), seed: 7 });
const stepN = (b, n) => { for (let i = 0; i < n; i++) b.step(); };

console.log('Rules');
{
  const b = mk(2);
  const s = b.snakes[0];
  b.steer(0, 'left');
  ok(s.queue.length === 0, 'reversing into yourself is ignored');
  b.steer(0, 'up'); b.steer(0, 'up');
  ok(s.queue.length === 1, 'repeated turns are not queued twice');
}
{
  const b = mk(2); b.food = [];
  const s = b.snakes[0]; s.cells = [{ x: 2, y: 5 }, { x: 1, y: 5 }, { x: 0, y: 5 }]; s.dir = 'left';
  b.snakes[1].cells = [{ x: 20, y: 15 }, { x: 19, y: 15 }, { x: 18, y: 15 }];
  stepN(b, 4);
  ok(!s.alive && b.over && b.winner === 1, 'hitting a wall knocks you out; the other snake wins');
}
{
  const b = mk(2); b.food = [];
  const s = b.snakes[0]; s.cells = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 11, y: 10 }, { x: 11, y: 9 }, { x: 10, y: 9 }]; s.dir = 'up';
  b.steer(0, 'right'); b.steer(0, 'down');
  b.snakes[1].cells = [{ x: 22, y: 18 }, { x: 22, y: 19 }, { x: 22, y: 20 }];
  stepN(b, 3);
  ok(!s.alive, 'running into your own body knocks you out');
}
{
  const b = mk(2); b.food = [];
  b.snakes[0].cells = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; b.snakes[0].dir = 'right';
  b.snakes[1].cells = [{ x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 }]; b.snakes[1].dir = 'left';
  stepN(b, 1);
  ok(!b.snakes[0].alive && !b.snakes[1].alive && b.over && b.why === 'wipe', 'two heads meeting in one cell knock both out (nobody wins by luck: highest score decides)');
  ok(b.ranking.length === 2, 'both are ranked');
}
{
  const b = mk(2); b.food = [{ x: 11, y: 10, v: 1 }];
  b.snakes[0].cells = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; b.snakes[0].dir = 'right';
  b.snakes[1].cells = [{ x: 22, y: 18 }, { x: 22, y: 19 }, { x: 22, y: 20 }];
  stepN(b, 1);
  ok(b.snakes[0].score === 10 && b.snakes[0].grow === 1, 'eating food scores and grows');
  stepN(b, 1);
  ok(b.snakes[0].cells.length === 4, 'the snake is one cell longer after growing');
  ok(b.food.length >= 3, 'food is replenished');
}
{
  const b = mk(3); b.food = [];
  b.snakes[0].cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]; b.snakes[0].dir = 'left';
  b.snakes[1].cells = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; b.snakes[1].dir = 'right';
  b.snakes[2].cells = [{ x: 10, y: 20 }, { x: 9, y: 20 }, { x: 8, y: 20 }]; b.snakes[2].dir = 'right';
  stepN(b, 1);
  ok(!b.over && b.food.length > 0, 'a knocked-out snake leaves food behind and the round continues with two left');
  ok(b.snakes.filter((s) => s.alive).length === 2, 'two snakes still alive');
}
{
  const b = mk(2); b.limit = 5; b.snakes[0].score = 50; b.food = [];
  b.snakes[0].cells = [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }]; b.snakes[0].dir = 'down';
  b.snakes[1].cells = [{ x: 20, y: 18 }, { x: 19, y: 18 }, { x: 18, y: 18 }]; b.snakes[1].dir = 'up';
  // keep them both alive by steering around: just run the clock
  b.limit = 0.5; b.update(0.6);
  ok(b.over && b.why === 'time' && b.winner === 0, 'on timeout the best score among survivors wins');
}
{
  const b = mk(2);
  const t0 = b.tick; b.update(TICK * 3 + 0.01);
  ok(b.tick === t0 + 3, 'update() advances in fixed 8 Hz ticks regardless of frame time');
}
{
  const b = mk(3); b.update(1);
  const st = b.exportState();
  const c = mk(3); const okImp = c.importState(JSON.parse(JSON.stringify(st)));
  ok(okImp && c.snakes.every((s, i) => s.cells.length === b.snakes[i].cells.length && s.alive === b.snakes[i].alive && s.score === b.snakes[i].score), 'host state round-trips to clients');
  ok(JSON.stringify(st).length < 2500, `state messages are small (${JSON.stringify(st).length} bytes)`);
  ok(!c.importState({ s: [] }) && !c.importState(null), 'malformed state is rejected');
}

console.log('Bots');
for (const diff of ['easy', 'normal', 'hard']) {
  for (const n of [2, 3, 4]) {
    let ended = 0, avg = 0, stuck = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = new Battle({ players: Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'B' + i, ctrl: 'bot', diff })), seed });
      let t = 0;
      while (!b.over && t < 300) { b.update(1 / 60); t += 1 / 60; }
      if (b.over) ended++;
      avg += t; if (!Number.isFinite(b.winner)) stuck++;
      if (b.snakes.some((s) => s.cells.some((c) => c.x < -1 || c.x > COLS || c.y < -1 || c.y > ROWS))) stuck++;
    }
    ok(ended === 6 && stuck === 0, `${diff} bots, ${n} snakes: every battle ends cleanly (avg ${(avg / 6).toFixed(0)}s)`);
  }
}
{
  // hard bots should survive longer than easy ones on average
  const life = (diff) => { let s = 0; for (let seed = 1; seed <= 10; seed++) { const b = new Battle({ players: [{ id: 'a', name: 'a', ctrl: 'bot', diff }, { id: 'b', name: 'b', ctrl: 'bot', diff }], seed }); let t = 0; while (!b.over && t < 200) { b.update(1 / 60); t += 1 / 60; } s += t; } return s / 10; };
  const e = life('easy'), h = life('hard');
  ok(h >= e * 0.9, `harder bots last at least as long as easy ones (${e.toFixed(0)}s → ${h.toFixed(0)}s)`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
