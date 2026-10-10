// Grapple Rush — pure simulation (no DOM). The game renders it; tests/grapple-bot.mjs plays it headless.
import { LEVEL } from './level.js';

export const PHYS = {
  gravity: 1750, fallMult: 1.18, maxFall: 1000,
  run: 290, groundAccel: 3400, groundFriction: 3200, overspeedFriction: 900, airAccel: 1700, airDrag: 0.05,
  jumpV: -625, cutJump: 0.45, coyote: 0.15, buffer: 0.15,
  hw: 9, hh: 15,
  range: 460, aimRadius: 150,
  swingAccel: 950, reelIn: 240, reelOut: 200, ropeMin: 50, ropeSlack: 0.94,
  releaseBoost: 1.05, maxSpeed: 1150, padV: 940,
};

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

/** Segment vs rect (slab test). */
function segHitsRect(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

export class World {
  constructor(level = LEVEL) {
    this.level = level;
    this.events = [];
    this.reset();
  }

  reset() {
    const L = this.level;
    this.p = { x: L.spawn.x, y: L.spawn.y - PHYS.hh, vx: 0, vy: 0, onGround: false, face: 1, coyote: 0, buffer: 0, jumping: false, run: 0 };
    this.rope = null;
    this.cp = 0; // index of the last reached checkpoint (0 = start)
    this.time = 0;
    this.started = false;
    this.finished = false;
    this.dead = 0;
    this.falls = 0;
    this.grapples = 0;
    this.pads = 0;
    this.events.length = 0;
    this.maxSpeed = 0;
  }

  get ms() { return Math.floor(this.time * 1000); }
  get checkpointsTotal() { return this.level.checkpoints.length; }

  respawn() {
    const L = this.level;
    const c = this.cp === 0 ? L.spawn : L.checkpoints[this.cp - 1];
    const p = this.p;
    p.x = c.x; p.y = c.y - PHYS.hh - 1; p.vx = 0; p.vy = 0; p.onGround = false; p.jumping = false; p.coyote = 0; p.buffer = 0;
    this.rope = null;
    this.events.push({ type: 'respawn', x: p.x, y: p.y });
  }

  hits(x, y) {
    const hw = PHYS.hw, hh = PHYS.hh;
    for (const r of this.level.platforms) {
      if (x + hw > r.x && x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h) return r;
    }
    return null;
  }

  /** Anchors in reach (clear line of sight) */
  reachable(out) {
    out.length = 0;
    const p = this.p, hx = p.x, hy = p.y - 4;
    for (const a of this.level.anchors) {
      const d = Math.hypot(a.x - hx, a.y - hy);
      if (d > PHYS.range || d < 40) continue;
      let blocked = false;
      for (const r of this.level.platforms) {
        if (segHitsRect(hx, hy, a.x, a.y, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 })) { blocked = true; break; }
      }
      if (!blocked) out.push(a);
    }
    return out;
  }

  /** The anchor a grapple press would pick (aim = world point or null for auto). */
  pickAnchor(aim) {
    const list = this._list || (this._list = []);
    this.reachable(list);
    if (!list.length) return null;
    const p = this.p;
    let best = null, bestScore = Infinity;
    if (aim) {
      for (const a of list) {
        const d = Math.hypot(a.x - aim.x, a.y - aim.y);
        if (d < PHYS.aimRadius && d < bestScore) { best = a; bestScore = d; }
      }
      if (best) return best;
    }
    const dir = p.vx > 60 ? 1 : p.vx < -60 ? -1 : p.face;
    for (const a of list) {
      const dx = a.x - p.x, dy = a.y - p.y;
      let s = Math.hypot(dx, dy);
      if (dx * dir < -30) s += 260; // behind
      if (dy > -30) s += 420; // not above
      if (dx * dir > 0 && dy < -40) s -= 60; // ahead and up: the classic swing
      if (s < bestScore) { best = a; bestScore = s; }
    }
    return best;
  }

  tryGrapple(aim) {
    const a = this.pickAnchor(aim);
    const p = this.p;
    if (!a) { this.events.push({ type: 'miss', x: p.x, y: p.y, dir: p.face }); return false; }
    const d = Math.hypot(a.x - p.x, a.y - (p.y - 4));
    this.rope = { ax: a.x, ay: a.y, len: Math.max(PHYS.ropeMin, d * PHYS.ropeSlack), max: d, anchor: a };
    this.grapples++;
    if (p.onGround) {
      // grappling from the ground yanks you toward the node so you leave the roof on a swing
      const ux = (a.x - p.x) / d, uy = (a.y - (p.y - 4)) / d;
      p.vx += ux * 330; p.vy += uy * 330; p.onGround = false; p.coyote = 0;
    }
    this.events.push({ type: 'grapple', x: a.x, y: a.y });
    return true;
  }

  release() {
    const p = this.p;
    if (!this.rope) return;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 220) {
      const k = Math.min(PHYS.releaseBoost, PHYS.maxSpeed / sp);
      p.vx *= k; p.vy *= k;
    }
    this.events.push({ type: 'release', x: p.x, y: p.y, speed: sp });
    this.rope = null;
  }

  /**
   * inp: { left, right, jumpHeld, jumpPressed, down, grappleHeld, grapplePressed, aim }
   */
  step(dt, inp) {
    const P = PHYS, p = this.p;
    this.events.length = 0;
    if (this.finished) return;
    const any = inp.left || inp.right || inp.jumpPressed || inp.grapplePressed;
    if (!this.started && any && this.dead <= 0) this.started = true;
    if (this.started) this.time += dt;

    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0) this.respawn();
      return;
    }

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) p.face = dir;
    p.coyote = p.onGround ? P.coyote : p.coyote - dt;
    p.buffer = inp.jumpPressed && !this.rope ? P.buffer : p.buffer - dt;

    // ---- grapple ----
    if (inp.grapplePressed && !this.rope) this.tryGrapple(inp.aim);
    else if (!inp.grappleHeld && this.rope) this.release();

    const rope = this.rope;
    let taut = false;
    if (rope) {
      const dx = p.x - rope.ax, dy = (p.y - 4) - rope.ay;
      taut = Math.hypot(dx, dy) >= rope.len - 1.5;
      // reel
      if (inp.jumpHeld || inp.down) {
        const old = rope.len;
        if (inp.jumpHeld) rope.len = Math.max(P.ropeMin, rope.len - P.reelIn * dt);
        else rope.len = Math.min(rope.max, rope.len + P.reelOut * dt);
        if (taut && rope.len < old) {
          // angular momentum: shortening speeds the swing up a little
          const d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
          const tx = -ny, ty = nx;
          const vt = p.vx * tx + p.vy * ty;
          const gain = Math.min(1.12, old / rope.len) - 1;
          p.vx += tx * vt * gain; p.vy += ty * vt * gain;
        }
      }
    }

    // ---- horizontal ----
    if (rope && taut && dir) {
      const dx = p.x - rope.ax, dy = (p.y - 4) - rope.ay;
      const d = Math.hypot(dx, dy) || 1;
      let tx = -dy / d, ty = dx / d;
      if (tx * dir < 0) { tx = -tx; ty = -ty; }
      p.vx += tx * P.swingAccel * dt; p.vy += ty * P.swingAccel * dt;
    } else if (p.onGround) {
      if (dir === 0) p.vx = approach(p.vx, 0, P.groundFriction * dt);
      else if (sgn(p.vx) === dir && Math.abs(p.vx) > P.run) p.vx = approach(p.vx, dir * P.run, P.overspeedFriction * dt);
      else p.vx = approach(p.vx, dir * P.run, P.groundAccel * dt);
    } else if (dir) {
      if (!(sgn(p.vx) === dir && Math.abs(p.vx) >= P.run)) p.vx = approach(p.vx, dir * P.run, P.airAccel * dt);
    } else {
      p.vx *= 1 - P.airDrag * dt;
    }

    // ---- jump ----
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = P.jumpV; p.buffer = 0; p.coyote = 0; p.onGround = false; p.jumping = true;
      this.events.push({ type: 'jump', x: p.x, y: p.y + P.hh });
    }
    if (p.jumping && !inp.jumpHeld && p.vy < -220) { p.vy *= P.cutJump; p.jumping = false; }
    if (p.vy >= 0) p.jumping = false;

    // ---- gravity ----
    p.vy += P.gravity * (p.vy > 0 ? P.fallMult : 1) * dt;
    if (p.vy > P.maxFall) p.vy = P.maxFall;
    const spd = Math.hypot(p.vx, p.vy);
    if (spd > P.maxSpeed) { p.vx *= P.maxSpeed / spd; p.vy *= P.maxSpeed / spd; }
    if (spd > this.maxSpeed) this.maxSpeed = spd;

    // ---- move + collide ----
    this.moveX(p.vx * dt);
    this.moveY(p.vy * dt);

    // ---- rope constraint ----
    if (this.rope) {
      const r = this.rope;
      const hx = p.x, hy = p.y - 4;
      let dx = hx - r.ax, dy = hy - r.ay;
      const d = Math.hypot(dx, dy);
      if (d > r.len) {
        const nx = dx / d, ny = dy / d;
        const cx = r.ax + nx * r.len - hx, cy = r.ay + ny * r.len - hy;
        this.moveX(cx); this.moveY(cy);
        const vr = p.vx * nx + p.vy * ny;
        if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
      }
    }

    // ---- bounce pads ----
    if (p.onGround && !this.rope && this.level.pads) {
      for (const pad of this.level.pads) {
        if (p.x >= pad.x && p.x <= pad.x + pad.w && Math.abs(p.y + PHYS.hh - pad.y) < 3) {
          p.vy = -PHYS.padV; p.onGround = false; p.jumping = false; p.coyote = 0; p.buffer = 0;
          this.pads++;
          this.events.push({ type: 'pad', x: p.x, y: pad.y });
          break;
        }
      }
    }

    // ---- world rules ----
    const L = this.level;
    while (this.cp < L.checkpoints.length && p.x >= L.checkpoints[this.cp].x) {
      this.cp++;
      this.events.push({ type: 'checkpoint', index: this.cp, x: L.checkpoints[this.cp - 1].x, y: L.checkpoints[this.cp - 1].y });
    }
    if (p.x >= L.finish.x && p.y < L.finish.y + 60 && p.y > L.finish.y - 400) {
      this.finished = true;
      this.rope = null;
      this.events.push({ type: 'finish', x: p.x, y: p.y });
    }
    if (p.y > L.deathY) {
      this.dead = 0.55; this.falls++; this.rope = null;
      this.events.push({ type: 'fall', x: p.x, y: L.deathY });
    }
    if (p.onGround) p.run += Math.abs(p.vx) * dt; else p.run += Math.abs(p.vx) * dt * 0.3;
  }

  moveX(dx) {
    const p = this.p, hh = PHYS.hh;
    if (!dx) return;
    p.x += dx;
    const r = this.hits(p.x, p.y);
    if (r) {
      // small ledge: step up instead of stopping dead
      if (p.y + hh - r.y <= 11 && p.vy >= -50 && !this.hits(p.x, r.y - hh - 0.01)) { p.y = r.y - hh - 0.01; return; }
      if (dx > 0) p.x = r.x - PHYS.hw - 0.01; else p.x = r.x + r.w + PHYS.hw + 0.01;
      if (Math.abs(p.vx) > 380) this.events.push({ type: 'bump', x: p.x + sgn(dx) * PHYS.hw, y: p.y, speed: Math.abs(p.vx) });
      p.vx = 0;
    }
  }

  moveY(dy) {
    const p = this.p, hh = PHYS.hh;
    const wasGround = p.onGround;
    p.onGround = false;
    if (!dy) { if (wasGround) p.onGround = !!this.hits(p.x, p.y + 0.5); return; }
    p.y += dy;
    const r = this.hits(p.x, p.y);
    if (r) {
      if (dy > 0) {
        p.y = r.y - hh - 0.01;
        if (!wasGround && p.vy > 300) this.events.push({ type: 'land', x: p.x, y: r.y, speed: p.vy });
        p.vy = 0; p.onGround = true;
      } else {
        // corner forgiveness when bonking a ceiling edge
        let fixed = false;
        for (let n = 1; n <= 9 && !fixed; n++) {
          for (const s of [-1, 1]) {
            if (!this.hits(p.x + s * n, p.y)) { p.x += s * n; fixed = true; break; }
          }
        }
        if (!fixed) { p.y = r.y + r.h + hh + 0.01; if (p.vy < 0) p.vy = 0; }
      }
    }
  }
}
