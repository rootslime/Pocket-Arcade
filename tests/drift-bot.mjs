// Headless check: a pure-pursuit bot must complete every Drift Circuit track; also verifies drifting works.
import { TRACK_DEFS, buildTrack } from '../games/drift-circuit/tracks.js';
import { Race } from '../games/drift-circuit/sim.js';
let fail = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
for (const def of TRACK_DEFS) {
  const track = buildTrack(def);
  const race = new Race(track);
  const dt = 1 / 60;
  let t = 0;
  while (!race.finished && t < 400) {
    const c = race.car;
    const look = (race.state === 'countdown') ? 0 : 10 + Math.floor(Math.hypot(c.vx, c.vy) / 18);
    const tgt = track.pts[(c.idx + look) % track.N];
    let diff = Math.atan2(tgt.y - c.y, tgt.x - c.x) - c.a;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const speed = Math.hypot(c.vx, c.vy);
    const inp = { steer: Math.max(-1, Math.min(1, diff * 2.4)), gas: Math.abs(diff) > 0.55 && speed > 260 ? 0.2 : 1, brake: Math.abs(diff) > 0.8 && speed > 240 ? 0.8 : 0, hand: Math.abs(diff) > 0.5 && speed > 240, boost: race.boost > 0.5 && Math.abs(diff) < 0.12 };
    race.step(dt, inp); t += dt;
  }
  const secs = race.time;
  console.log(`${def.name}: finished=${race.finished} race=${secs.toFixed(1)}s laps=${race.lapTimes.map((m) => (m / 1000).toFixed(1)).join('/')} drift=${race.driftTotal} mega=${race.megaDrifts} wall=${race.wallHits} boostUses=${race.boostUses}`);
  ok(race.finished && secs > 40 && secs < 260, `${def.name}: bot completes 3 laps in a sane time`);
}
// scripted drift: accelerate along the road, then handbrake while following the road: must score a drift and charge boost
{
  const track = buildTrack(TRACK_DEFS[1]);
  const race = new Race(track);
  const evs = [];
  for (let i = 0; i < 60 * 3.3; i++) race.step(1 / 60, { steer: 0, gas: 1, brake: 0, hand: false, boost: false });
  for (let i = 0; i < 200; i++) {
    const c = race.car;
    const tg = track.pts[(c.idx + 14) % track.N];
    let d = Math.atan2(tg.y - c.y, tg.x - c.x) - c.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const drifting = i > 50 && i < 110;
    race.step(1 / 60, { steer: drifting ? 0.6 : Math.max(-1, Math.min(1, d * 2.4)), gas: 1, brake: 0, hand: drifting, boost: false });
    evs.push(...race.events);
  }
  const dr = evs.filter((e) => e.type === 'driftEnd');
  ok(dr.length >= 1 && dr[0].pts >= 250, `handbrake drift scores points (${dr.map((x) => x.pts + (x.mega ? ' MEGA' : '')).join(',')})`);
  ok(race.boost > 0.1, `drifting charges boost (${race.boost.toFixed(2)})`);
}
process.exit(fail ? 1 : 0);
