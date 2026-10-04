// Drift Circuit — pure car + race simulation (no DOM) so it can be bot-tested headless.
import { surfaceAt } from './tracks.js';

export const CAR = {
  maxSpeed: 460, boostSpeed: 640, accel: 620, boostAccel: 900, brake: 950, reverseMax: 160, drag: 0.2,
  steerLow: 3.0, steerHigh: 1.5, grip: 8.5, driftGrip: 1.0, radius: 14,
};
const SURF = {
  road: { grip: 1, speed: 1, drag: 0 },
  dirt: { grip: 0.8, speed: 0.88, drag: 0.5 },
  grass: { grip: 0.5, speed: 0.52, drag: 1.8 },
  wall: { grip: 0.5, speed: 0.4, drag: 2 },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Race {
  constructor(track) {
    this.track = track;
    this.events = [];
    this.reset();
  }

  reset() {
    const t = this.track;
    const s = t.startPose;
    this.car = { x: s.x, y: s.y, a: s.a, vx: 0, vy: 0, fwd: 0, lat: 0, slip: 0, surface: 'road', idx: t.start.i };
    for (const c of t.cones) { c.hit = false; c.x = c.ox ?? (c.ox = c.x); c.y = c.oy ?? (c.oy = c.y); c.vx = c.vy = 0; c.rot = 0; }
    this.state = 'countdown';
    this.cd = 3.2;
    this.time = 0; this.lapTime = 0; this.lap = 1; this.lapTimes = [];
    this.progress = -(t.N - t.start.i); // starts just behind the line
    this.lastIdx = t.start.i;
    this.cpNext = 0;
    this.drift = { on: false, t: 0, grace: 0, score: 0 };
    this.driftTotal = 0; this.megaDrifts = 0; this.drifts = 0; this.bestDrift = 0;
    this.boost = 0; this.boosting = false; this.boostUses = 0; this.padBoost = 0; this.prevBoostKey = false;
    this.wallHits = 0; this.lapWall = false; this.cleanLaps = 0;
    this.wrongWay = 0; this.finished = false;
    this.events.length = 0;
    this.lastLapMs = 0; this.bestLapMs = null;
  }

  /** inp: { steer -1..1, gas 0..1, brake 0..1, hand bool, boost bool } */
  step(dt, inp) {
    const T = this.track, c = this.car;
    this.events.length = 0;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.cd);
      this.cd -= dt;
      if (Math.ceil(this.cd) !== before && this.cd > 0) this.events.push({ type: 'count', n: Math.ceil(this.cd) });
      if (this.cd <= 0) { this.state = 'racing'; this.events.push({ type: 'go' }); }
      // allow revving but not moving during the countdown
      return;
    }
    if (this.state === 'finished') { c.vx *= Math.exp(-2 * dt); c.vy *= Math.exp(-2 * dt); c.x += c.vx * dt; c.y += c.vy * dt; return; }
    this.time += dt; this.lapTime += dt;

    const sf = surfaceAt(T, c.x, c.y, c.idx);
    const surf = SURF[sf.surface];
    c.surface = sf.surface;
    let fx = Math.cos(c.a), fy = Math.sin(c.a);
    let rx = -fy, ry = fx;
    let fwd = c.vx * fx + c.vy * fy, lat = c.vx * rx + c.vy * ry;

    // ---- boost
    const wantBoost = !!inp.boost;
    if (wantBoost && !this.prevBoostKey && this.boost > 0.06) { this.boostUses++; this.events.push({ type: 'boost' }); }
    this.prevBoostKey = wantBoost;
    this.boosting = (wantBoost && this.boost > 0) || this.padBoost > 0;
    if (wantBoost && this.boost > 0) this.boost = Math.max(0, this.boost - 0.42 * dt);
    this.padBoost = Math.max(0, this.padBoost - dt);

    // ---- throttle / brake
    const top = (this.boosting ? CAR.boostSpeed : CAR.maxSpeed) * surf.speed;
    if (inp.gas > 0 && fwd < top) fwd += (this.boosting ? CAR.boostAccel : CAR.accel) * (1 - clamp(fwd / (top * 1.05), 0, 1) * 0.85) * inp.gas * dt;
    if (inp.brake > 0) { if (fwd > 8) fwd = Math.max(0, fwd - CAR.brake * inp.brake * dt); else fwd = Math.max(-CAR.reverseMax, fwd - 520 * inp.brake * dt); }
    if (inp.hand && fwd > 0) fwd = Math.max(0, fwd - 130 * dt);
    fwd *= Math.exp(-(CAR.drag + surf.drag) * dt);
    if (fwd > top && !this.boosting) fwd -= (fwd - top) * Math.min(1, 2.2 * dt);

    // ---- steering
    const sp = Math.abs(fwd);
    let rate = (CAR.steerLow + (CAR.steerHigh - CAR.steerLow) * clamp(sp / 400, 0, 1)) * Math.min(1, sp / 70);
    if (fwd < 0) rate = -rate;
    if (inp.hand && sp > 150) rate *= 1.7;
    c.a += inp.steer * rate * dt;
    fx = Math.cos(c.a); fy = Math.sin(c.a); rx = -fy; ry = fx;

    // ---- grip: keep world velocity, then bleed the sideways part (this is what makes a drift)
    const speedVec = Math.hypot(c.vx, c.vy);
    // re-express the (pre-turn) velocity in the new heading frame
    const wvx = fx * fwd + (-Math.sin(c.a - inp.steer * rate * dt)) * lat * 1; // placeholder, replaced below
    void wvx; void speedVec;
    // velocity before steering expressed in world space:
    const oldA = c.a - inp.steer * rate * dt;
    const ofx = Math.cos(oldA), ofy = Math.sin(oldA);
    const vx = ofx * fwd + (-ofy) * lat, vy = ofy * fwd + ofx * lat;
    let nf = vx * fx + vy * fy, nl = vx * rx + vy * ry;
    let g = CAR.grip * surf.grip;
    if (inp.hand) g = CAR.driftGrip * surf.grip;
    else if (Math.abs(inp.steer) > 0.55 && sp > 300) g *= 0.72;
    const nl2 = nl * Math.exp(-g * dt);
    nf += (Math.abs(nl) - Math.abs(nl2)) * 0.32 * Math.sign(nf || 1); // sliding keeps most of the speed
    nl = nl2;
    c.vx = fx * nf + rx * nl; c.vy = fy * nf + ry * nl;
    c.fwd = nf; c.lat = nl;

    c.x += c.vx * dt; c.y += c.vy * dt;

    // ---- walls (beyond the grass) and cones
    const sf2 = surfaceAt(T, c.x, c.y, c.idx);
    c.idx = sf2.idx;
    if (sf2.surface === 'wall') {
      const over = Math.max(0, Math.min(sf2.dist, sf2.cutDist + (T.half - T.cutWidth / 2)) - (T.half + T.grassW));
      c.x += sf2.nx * (over + 3); c.y += sf2.ny * (over + 3);
      const vn = c.vx * sf2.nx + c.vy * sf2.ny;
      if (vn < 0) { c.vx -= 1.7 * vn * sf2.nx; c.vy -= 1.7 * vn * sf2.ny; }
      c.vx *= 0.62; c.vy *= 0.62;
      this.wallHits++; this.lapWall = true;
      this.events.push({ type: 'wall', x: c.x, y: c.y, speed: Math.abs(vn) });
      this.cancelDrift();
    }
    for (const cone of T.cones) {
      if (!cone.hit) {
        if (Math.hypot(cone.x - c.x, cone.y - c.y) < CAR.radius + cone.r) {
          cone.hit = true;
          const d = Math.hypot(cone.x - c.x, cone.y - c.y) || 1;
          cone.vx = c.vx * 0.9 + (cone.x - c.x) / d * 150; cone.vy = c.vy * 0.9 + (cone.y - c.y) / d * 150;
          c.vx *= 0.82; c.vy *= 0.82;
          this.events.push({ type: 'cone', x: cone.x, y: cone.y });
        }
      } else { cone.x += cone.vx * dt; cone.y += cone.vy * dt; cone.vx *= Math.exp(-1.6 * dt); cone.vy *= Math.exp(-1.6 * dt); cone.rot += dt * 8; }
    }
    // boost pads
    for (const p of T.pads) {
      const dx = c.x - p.x, dy = c.y - p.y;
      const along = dx * p.dir.x + dy * p.dir.y, side = -dx * p.dir.y + dy * p.dir.x;
      if (Math.abs(along) < 22 && Math.abs(side) < p.w / 2 && this.padBoost <= 0.2) {
        this.padBoost = 1.0;
        const s = Math.hypot(c.vx, c.vy);
        if (s < CAR.boostSpeed * 0.9) { const k = (CAR.boostSpeed * 0.92) / (s || 1); if (s > 40) { c.vx *= k; c.vy *= k; } }
        this.events.push({ type: 'pad', x: p.x, y: p.y });
      }
    }

    // ---- drift
    const fwdA = Math.abs(c.fwd), slip = Math.abs(Math.atan2(c.lat, Math.max(40, fwdA)));
    c.slip = slip;
    const d = this.drift;
    const speedNow = Math.hypot(c.vx, c.vy);
    const canDrift = speedNow > 160 && (c.surface === 'road' || c.surface === 'dirt') && c.fwd > 0;
    if (canDrift && slip > 0.26) { if (!d.on) { d.on = true; d.t = 0; this.events.push({ type: 'driftStart' }); } d.t += dt; d.grace = 0.28; this.boost = Math.min(1, this.boost + 0.16 * dt); }
    else if (d.on) {
      d.grace -= dt;
      if (d.grace > 0 && canDrift) d.t += dt * 0.5;
      if (d.grace <= 0 || !canDrift) this.endDrift();
    }

    // ---- progress, checkpoints, laps
    let delta = c.idx - this.lastIdx;
    if (delta > T.N / 2) delta -= T.N; else if (delta < -T.N / 2) delta += T.N;
    this.progress += delta; this.lastIdx = c.idx;
    const base = (this.lap - 1) * T.N;
    while (this.cpNext < T.cps.length && this.progress - base >= T.cps[this.cpNext]) { this.cpNext++; this.events.push({ type: 'checkpoint', n: this.cpNext }); }
    if (this.progress >= this.lap * T.N && this.cpNext >= T.cps.length) this.completeLap();
    // wrong way
    const tn = T.tan[c.idx];
    const align = (Math.cos(c.a) * tn.x + Math.sin(c.a) * tn.y);
    if (align < -0.35 && speedNow > 90) this.wrongWay = Math.min(3, this.wrongWay + dt); else this.wrongWay = Math.max(0, this.wrongWay - dt * 2);
  }

  cancelDrift() { this.drift.on = false; this.drift.t = 0; this.drift.grace = 0; }

  endDrift() {
    const d = this.drift;
    const t = d.t;
    d.on = false; d.t = 0; d.grace = 0;
    if (t < 0.5) return;
    let pts, mega = false;
    if (t >= 1.5) { pts = 750 + Math.floor(Math.max(0, t - 3)) * 250; mega = true; } else pts = 250;
    this.driftTotal += pts; this.drifts++; this.bestDrift = Math.max(this.bestDrift, pts);
    if (mega) this.megaDrifts++;
    this.boost = Math.min(1, this.boost + (mega ? 0.3 : 0.12));
    this.events.push({ type: 'driftEnd', pts, mega, t });
  }

  completeLap() {
    const T = this.track;
    this.endDrift();
    const ms = Math.round(this.lapTime * 1000);
    this.lapTimes.push(ms);
    this.lastLapMs = ms;
    if (this.bestLapMs === null || ms < this.bestLapMs) this.bestLapMs = ms;
    if (!this.lapWall) this.cleanLaps++;
    this.events.push({ type: 'lap', n: this.lap, ms, clean: !this.lapWall, best: ms === this.bestLapMs });
    this.lapTime = 0; this.lapWall = false; this.cpNext = 0;
    if (this.lap >= T.lap) { this.state = 'finished'; this.finished = true; this.events.push({ type: 'finish', ms: Math.round(this.time * 1000) }); }
    else this.lap++;
  }

  get raceMs() { return Math.round(this.time * 1000); }
}
