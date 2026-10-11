// Headless reachability check for the Grapple Rush course.
// For each section (checkpoint -> next checkpoint) random strategy search runs the real simulation.
import { World, PHYS } from '../games/grapple-rush/sim.js';
import { LEVELS } from '../games/grapple-rush/level.js';

const DT = 1 / 60;
const rnd = (a, b) => a + Math.random() * (b - a);

function trial(LEVEL, i, S) {
  const w = new World(LEVEL);
  const plat = LEVEL.platforms[i];
  w.started = true;
  w.p.x = i === 0 ? LEVEL.spawn.x : plat.x + 30; w.p.y = plat.y - PHYS.hh - 0.01;
  w.cp = 99; // keep checkpoints out of the way
  const inp = { left: false, right: true, jumpHeld: false, jumpPressed: false, down: false, grappleHeld: false, grapplePressed: false, aim: null };
  let t = 0, grabbed = 0, jumped = 0, attachT = -1;
  while (t < 14) {
    inp.jumpPressed = false; inp.grapplePressed = false;
    const p = w.p;
    // auto-jump at ledges (what a human does instinctively)
    if (S.auto !== null && p.onGround && !w.rope) {
      const ax = p.x + p.vx * 0.02 + S.auto;
      if (!w.hits(ax, p.y + 22) && !w.hits(ax + 4, p.y + 22)) { inp.jumpPressed = true; inp.jumpHeld = true; S.autoT = t; }
    }
    if (S.autoT !== undefined && t - S.autoT > S.autoHold && !w.rope) inp.jumpHeld = false;
    // scripted actions
    for (const j of S.jumps) if (!j.done && p.x >= j.x && p.onGround) { inp.jumpPressed = true; inp.jumpHeld = true; j.done = true; j.t = t; }
    for (const j of S.jumps) if (j.done && t - j.t > j.hold) inp.jumpHeld = false;
    for (const g of S.grabs) {
      if (!g.done && p.x >= g.x && !w.rope && (g.air ? !p.onGround : true)) {
        inp.grapplePressed = true; inp.grappleHeld = true; g.done = true; g.t = t; g.pend = true;
        break;
      }
      if (g.done && g.pend && w.rope) { g.pend = false; g.t = t; }
      if (g.done && g.pend === false && inp.grappleHeld && w.rope && !g.rel) {
        const sinceAttach = t - g.t;
        const cond = g.mode === 0 ? sinceAttach > g.rt : (p.x > w.rope.ax + g.dx && p.vy < g.vy);
        if (cond || sinceAttach > 4) { inp.grappleHeld = false; g.rel = true; }
      }
      if (g.done && g.pend && !w.rope && !inp.grapplePressed) { inp.grappleHeld = false; g.pend = undefined; }
    }
    // chain heuristic: keep grabbing the next node ahead, let go once past it
    if (S.chain) {
      if (!w.rope && !p.onGround && t - (S.lastRel ?? -9) > S.cd && p.vx > 40 && !inp.grappleHeld) {
        const a = w.pickAnchor(null);
        if (a && a.x > p.x - 10) { inp.grapplePressed = true; inp.grappleHeld = true; S.att = t; }
      } else if (w.rope && inp.grappleHeld && (p.x > w.rope.ax + S.rdx || t - S.att > 3) && p.vy < S.rvy) { inp.grappleHeld = false; S.lastRel = t; }
      else if (!w.rope && inp.grappleHeld && !inp.grapplePressed) inp.grappleHeld = false;
    }
    // reel while attached
    if (w.rope) inp.jumpHeld = S.reel;
    w.step(DT, inp);
    t += DT;
    if (w.dead > 0 || w.p.y > LEVEL.deathY - 50) return false;
    if (w.p.onGround) { const h = w.hits(w.p.x, w.p.y + 1); if (h && LEVEL.platforms.indexOf(h) > i) return true; }
    if (w.finished) return true;
  }
  return false;
}

function randomStrategy(LEVEL, i) {
  const startX = i === 0 ? LEVEL.spawn.x : LEVEL.platforms[i].x + 30;
  const span = 900;
  const S = { jumps: [], grabs: [], reel: Math.random() < 0.3, auto: Math.random() < 0.7 ? rnd(-6, 16) : null, autoHold: rnd(0.15, 0.7), chain: Math.random() < 0.55, cd: rnd(0, 0.3), rdx: rnd(-60, 160), rvy: rnd(-300, 200) };
  const nj = Math.floor(rnd(0, 3));
  for (let k = 0; k < nj; k++) S.jumps.push({ x: startX + rnd(0, span), hold: rnd(0.1, 0.7), done: false });
  S.jumps.sort((a, b) => a.x - b.x);
  const ng = S.chain ? 0 : 1 + Math.floor(rnd(0, 3));
  for (let k = 0; k < ng; k++) S.grabs.push({ x: startX + rnd(0, span), air: Math.random() < 0.5, mode: Math.random() < 0.5 ? 0 : 1, rt: rnd(0.2, 1.6), dx: rnd(-40, 200), vy: rnd(-400, 100), done: false, rel: false });
  S.grabs.sort((a, b) => a.x - b.x);
  return S;
}

const N = Number(process.env.N || 6000);
const only = process.env.LEVEL ? process.env.LEVEL.split(',') : null;
let allOk = true;
for (const LEVEL of LEVELS) {
  if (only && !only.includes(LEVEL.id)) continue;
  console.log(`== ${LEVEL.name} (${LEVEL.platforms.length} roofs, ${LEVEL.anchors.length} nodes, ${LEVEL.pads.length} pads, length ${LEVEL.length})`);
  for (let i = 0; i < LEVEL.platforms.length - 1; i++) {
    const gap = LEVEL.platforms[i + 1].x - (LEVEL.platforms[i].x + LEVEL.platforms[i].w);
    let wins = 0;
    for (let k = 0; k < N; k++) if (trial(LEVEL, i, randomStrategy(LEVEL, i))) wins++;
    const bad = wins === 0;
    console.log(`  ${bad ? 'XX' : 'ok'} roof ${i} -> ${i + 1} (gap ${gap}, dy ${LEVEL.platforms[i + 1].y - LEVEL.platforms[i].y}): ${wins}/${N} (${(wins / N * 100).toFixed(2)}%)`);
    if (bad) allOk = false;
  }
}
console.log(allOk ? 'ALL PLATFORM LINKS SOLVABLE' : 'SOME LINKS NOT SOLVED');
process.exit(allOk ? 0 : 1);
