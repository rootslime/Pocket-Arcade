// Shared juice: pooled particles, score popups and screen shake.
import { TAU, rand } from './util.js';

export class Particles {
  constructor(max = 300) {
    this.max = max;
    this.p = [];
    for (let i = 0; i < max; i++) {
      this.p.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', drag: 0, grav: 0, shrink: true });
    }
    this.cursor = 0;
    this.scale = 1; // set < 1 to thin particles (reduced motion / low fps)
  }
  /** Emit `count` particles. opts: speed, speed2, angle, spread, life, size, color, drag, grav */
  emit(x, y, count, o = {}) {
    count = Math.ceil(count * this.scale);
    const speed = o.speed ?? 120, speed2 = o.speed2 ?? speed * 0.4;
    const ang = o.angle ?? 0, spread = o.spread ?? TAU;
    for (let i = 0; i < count; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      const a = ang + (rand() - 0.5) * spread;
      const s = rand(speed2, speed);
      p.on = true; p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.max = p.life = rand((o.life ?? 0.5) * 0.6, o.life ?? 0.5);
      p.size = rand((o.size ?? 3) * 0.6, o.size ?? 3);
      p.color = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : (o.color ?? '#fff');
      p.drag = o.drag ?? 1.5; p.grav = o.grav ?? 0;
    }
  }
  update(dt) {
    for (const p of this.p) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  draw(ctx) {
    for (const p of this.p) {
      if (!p.on) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  clear() { for (const p of this.p) p.on = false; }
}

export class Popups {
  constructor(max = 24) {
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ on: false, x: 0, y: 0, t: 0, text: '', color: '#fff', size: 16 });
    this.cursor = 0;
  }
  add(x, y, text, color = '#fff', size = 16) {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    p.on = true; p.x = x; p.y = y; p.t = 0; p.text = text; p.color = color; p.size = size;
  }
  update(dt) {
    for (const p of this.items) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t > 0.9) p.on = false;
    }
  }
  draw(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.items) {
      if (!p.on) continue;
      const k = p.t / 0.9;
      const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.3);
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = `800 ${Math.round(p.size * pop)}px "Orbitron", system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,6,20,.85)';
      ctx.strokeText(p.text, p.x, p.y - p.t * 38);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.t * 38);
    }
    ctx.globalAlpha = 1;
  }
  clear() { for (const p of this.items) p.on = false; }
}

export class Shake {
  constructor() { this.mag = 0; this.x = 0; this.y = 0; this.enabled = true; }
  kick(m) { if (this.enabled) this.mag = Math.max(this.mag, m); }
  update(dt) {
    this.mag = Math.max(0, this.mag - dt * 60);
    if (this.mag > 0.05) { this.x = rand(-1, 1) * this.mag; this.y = rand(-1, 1) * this.mag; }
    else { this.x = 0; this.y = 0; this.mag = 0; }
  }
}
