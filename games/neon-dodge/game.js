// Neon Dodge — endless survival with authored hazard patterns, grazing and power-ups.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { canvasPoint } from '../../js/input.js';
import { clamp, damp, formatScore, rand, randInt, pick, TAU, circleRect } from '../../js/util.js';

const W = 480, H = 640;
const PR = 9;                     // player radius
const MAX_HAZ = 110;

const fx = new Particles(320);
const pops = new Popups(14);
const shake = new Shake();

const S = {
  p: { x: W / 2, y: H * 0.78, vx: 0, vy: 0, dashT: 0, dashCd: 0, dx: 0, dy: -1, inv: 0 },
  hz: [], pu: [], timers: [], warn: [],
  t: 0, score: 0, mult: 1, streak: 0, streakT: 0, grazes: 0, bestStreak: 0, picks: 0,
  nextPattern: 1.2, nextPU: 9, last: '', fx: { shield: 0, slow: 0, double: 0, rapid: 0 },
  dead: false, scoreAcc: 0, pulse: 0,
};
let drag = null;
let scroll = 0;

const shell = createShell({
  id: 'neonDodge',
  title: 'Neon Dodge',
  accent: '#ff3cac',
  size: { w: W, h: H },
  hud: [
    { id: 'score', label: 'SCORE', init: '0' },
    { id: 'time', label: 'TIME', init: '0:00' },
    { id: 'mult', label: 'MULT', init: 'x1' },
  ],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    dash: ['Space', 'ShiftLeft', 'ShiftRight'],
  },
  touch: { left: [], right: [{ action: 'dash', label: 'DASH', aria: 'Dash', cls: 'act wide' }] },
  instructions: {
    goal: 'Survive as long as you can. Graze hazards for bonus points, build your multiplier and grab power-ups.',
    controls: [
      ['WASD / Arrows', 'Move'],
      ['Space / Shift', 'Dash (brief invulnerability, recharges)'],
      ['P / Esc', 'Pause'],
    ],
    touch: 'Drag anywhere to move. Tap DASH to blink through danger.',
    tips: [
      'Skim close to hazards for “CLOSE!” bonuses — streaks raise your multiplier.',
      'Shield blocks one hit · Slow Time · x2 Score · Dash Charge.',
      'Lasers flash a warning line before they fire.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    const cv = shell.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (shell.state !== 'playing' || drag) return;
      const q = canvasPoint(e, cv, W, H);
      drag = { id: e.pointerId, px: q.x, py: q.y, sx: S.p.x, sy: S.p.y, tx: S.p.x, ty: S.p.y };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const q = canvasPoint(e, cv, W, H);
      drag.tx = drag.sx + (q.x - drag.px) * 1.15; drag.ty = drag.sy + (q.y - drag.py) * 1.15;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); },
  render,
});

function reset() {
  Object.assign(S.p, { x: W / 2, y: H * 0.78, vx: 0, vy: 0, dashT: 0, dashCd: 0, dx: 0, dy: -1, inv: 0 });
  S.hz.length = 0; S.pu.length = 0; S.timers.length = 0; S.warn.length = 0;
  Object.assign(S, { t: 0, score: 0, mult: 1, streak: 0, streakT: 0, grazes: 0, bestStreak: 0, picks: 0, nextPattern: 1.4, nextPU: 9, last: '', dead: false, scoreAcc: 0, pulse: 0 });
  S.fx.shield = S.fx.slow = S.fx.double = S.fx.rapid = 0;
  fx.clear(); pops.clear(); shake.mag = 0; drag = null;
  shell.hud('score', '0'); shell.hud('time', '0:00'); shell.hud('mult', 'x1');
}

// ---------------------------------------------------------------- difficulty & patterns
const spd = () => Math.min(2.1, 1 + S.t / 110);               // global hazard speed
const diff = () => S.t / 20;                                    // difficulty tier
const after = (sec, fn) => S.timers.push({ t: sec, fn });

function addHz(h) { if (S.hz.length < MAX_HAZ) { h.id = ++uid; h.gcd = 0; S.hz.push(h); } }
let uid = 0;

function block(x, y, w, h, vx, vy, extra) { addHz({ k: 'block', x, y, w, h, vx, vy, ...extra }); }

const PATTERNS = {
  rain: { from: 0, weight: 3, run() {
    const cols = 10, cw = W / cols;
    const gapCols = 3, g = randInt(0, cols - gapCols);
    const n = 6 + Math.min(8, Math.floor(diff() * 1.2));
    const v = 230 * spd();
    for (let i = 0; i < n; i++) {
      after(i * (0.62 / spd()), () => {
        let c; do { c = randInt(0, cols - 1); } while (c >= g && c < g + gapCols);
        const w = cw - 8 + rand(-6, 12);
        block(c * cw + 4, -44, w, rand(26, 40), 0, v * rand(0.9, 1.15), { col: 0 });
        if (Math.random() < 0.4) { // second block in the same row, still outside the gap
          let c2; do { c2 = randInt(0, cols - 1); } while (c2 === c || (c2 >= g && c2 < g + gapCols));
          block(c2 * cw + 4, -44, cw - 8, rand(26, 40), 0, v, { col: 0 });
        }
      });
    }
  } },
  laserH: { from: 7, weight: 3, run() {
    const n = diff() > 5 ? 2 : 1;
    const warnT = Math.max(0.7, 1.15 - diff() * 0.04);
    const ys = [];
    for (let i = 0; i < n; i++) {
      let y, tries = 0;
      do { y = rand(70, H - 70); tries++; } while (tries < 12 && (ys.some((v) => Math.abs(v - y) < 170) || Math.abs(y - S.p.y) < 26));
      ys.push(y);
      laser('h', y, warnT + i * 0.5, 0.55);
    }
  } },
  laserV: { from: 16, weight: 2, run() {
    const warnT = Math.max(0.7, 1.15 - diff() * 0.04);
    let x = rand(60, W - 60);
    if (Math.abs(x - S.p.x) < 28) x = clamp(x + (S.p.x < W / 2 ? 90 : -90), 40, W - 40);
    laser('v', x, warnT, 0.55);
    if (diff() > 6) { const x2 = clamp(x + (x < W / 2 ? 190 : -190), 40, W - 40); laser('v', x2, warnT + 0.45, 0.55); }
  } },
  wall: { from: 12, weight: 3, run() {
    const gap = Math.max(92, 160 - diff() * 7);
    const v = 150 * spd();
    const rows = diff() > 4 ? 2 : 1;
    let prev = S.p.x;
    for (let r = 0; r < rows; r++) {
      after(r * (310 / v), () => {
        const maxShift = 230;
        const gx = clamp(prev + rand(-maxShift, maxShift), 30, W - gap - 30);
        prev = gx + gap / 2;
        block(0, -34, gx, 26, 0, v, { wall: 1 });
        block(gx + gap, -34, W - gx - gap, 26, 0, v, { wall: 1 });
      });
    }
  } },
  fan: { from: 24, weight: 3, run() {
    const side = randInt(0, 2);                                   // 0 top, 1 left, 2 right
    const ox = side === 0 ? rand(100, W - 100) : side === 1 ? -10 : W + 10;
    const oy = side === 0 ? -10 : rand(80, 300);
    const base = Math.atan2(H * 0.6 - oy, W / 2 - ox);
    const n = 9 + Math.min(4, Math.floor(diff() / 3)) , spread = 1.5;
    const v = 150 * spd();
    const waves = diff() > 8 ? 2 : 1;
    for (let w = 0; w < waves; w++) after(w * 0.7, () => {
      for (let i = 0; i < n; i++) {
        const a = base + (i / (n - 1) - 0.5) * spread + (w ? spread / (n - 1) / 2 : 0);
        addHz({ k: 'bullet', x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 6 });
      }
    });
  } },
  mines: { from: 34, weight: 2, run() {
    const alive = S.hz.filter((h) => h.k === 'mine').length;
    if (alive >= 2 + Math.floor(diff() / 5)) return;
    const side = randInt(0, 3);
    const x = side === 0 ? rand(40, W - 40) : side === 1 ? 20 : side === 2 ? W - 20 : rand(40, W - 40);
    const y = side === 0 ? 20 : side === 3 ? H - 120 : rand(100, 300);
    if (Math.hypot(x - S.p.x, y - S.p.y) < 220) return;
    addHz({ k: 'mine', x, y, vx: 0, vy: 0, r: 11, arm: 0.9, life: 8 });
  } },
  sweep: { from: 46, weight: 3, run() {
    const fromLeft = Math.random() < 0.5;
    const rows = 3, v = 210 * spd();
    const y0 = rand(120, H - 330);
    for (let i = 0; i < rows; i++) {
      after(i * 0.25, () => block(fromLeft ? -90 : W + 10, y0 + i * 108, 80, 24, fromLeft ? v : -v, 0, {}));
    }
  } },
};

function laser(dir, pos, warn, active) {
  addHz({ k: 'laser', dir, pos, warn, active, t: 0, thick: 16 });
}

function directorUpdate(dt) {
  S.nextPattern -= dt;
  if (S.nextPattern > 0) return;
  const avail = Object.entries(PATTERNS).filter(([name, p]) => S.t >= p.from);
  let total = 0;
  for (const [name, p] of avail) total += name === S.last ? p.weight * 0.3 : p.weight;
  let r = Math.random() * total, chosen = avail[0];
  for (const e of avail) { r -= e[0] === S.last ? e[1].weight * 0.3 : e[1].weight; if (r <= 0) { chosen = e; break; } }
  chosen[1].run();
  S.last = chosen[0];
  // combine a second pattern at high difficulty (never two of the same type back-to-back)
  if (diff() > 5 && Math.random() < Math.min(0.5, (diff() - 5) * 0.08)) {
    const others = avail.filter((e) => e[0] !== chosen[0] && e[0] !== 'wall' && chosen[0] !== 'wall');
    if (others.length) after(0.9, () => pick(others)[1].run());
  }
  S.nextPattern = Math.max(0.85, 2.5 - S.t * 0.022) * rand(0.9, 1.15);
}

// ---------------------------------------------------------------- update
function update(dt) {
  const i = shell.input;
  const p = S.p;
  S.t += dt;
  S.pulse = Math.max(0, S.pulse - dt * 3);
  scroll = (scroll + dt * (40 + S.t * 0.6)) % 48;

  // --- player movement
  let ax = i.axis('left', 'right'), ay = i.axis('up', 'down');
  if (drag) {
    const k = damp(26, dt);
    const nx = p.x + (clamp(drag.tx, PR, W - PR) - p.x) * k, ny = p.y + (clamp(drag.ty, PR, H - PR) - p.y) * k;
    const mvx = (nx - p.x) / dt, mvy = (ny - p.y) / dt;
    p.vx = clamp(mvx, -900, 900); p.vy = clamp(mvy, -900, 900);
  } else {
    const len = Math.hypot(ax, ay) || 1;
    const accel = 3200, max = 330, fr = 2800;
    const tvx = (ax / len) * max * (ax || ay ? 1 : 0), tvy = (ay / len) * max * (ax || ay ? 1 : 0);
    p.vx = approach(p.vx, tvx, (ax || ay ? accel : fr) * dt);
    p.vy = approach(p.vy, tvy, (ax || ay ? accel : fr) * dt);
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 40) { p.dx = p.vx / sp; p.dy = p.vy / sp; }
  // dash
  p.dashCd = Math.max(0, p.dashCd - dt * (S.fx.rapid > 0 ? 2 : 1));
  p.inv = Math.max(0, p.inv - dt);
  if (i.pressed('dash') && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashT = 0.15; p.dashCd = 1.9; p.inv = Math.max(p.inv, 0.2);
    shell.sfx.play('dash');
    fx.emit(p.x, p.y, 14, { speed: 180, life: 0.35, size: 4, color: ['#2de2e6', '#fff'] });
  }
  let mx = p.vx, my = p.vy;
  if (p.dashT > 0) { p.dashT -= dt; mx = p.dx * 980; my = p.dy * 980; if (Math.random() < 0.8) fx.emit(p.x, p.y, 1, { speed: 20, life: 0.3, size: 7, color: '#2de2e6', drag: 4 }); }
  if (!drag || p.dashT > 0) { p.x += mx * dt; p.y += my * dt; }
  else { p.x += mx * dt; p.y += my * dt; }
  p.x = clamp(p.x, PR, W - PR); p.y = clamp(p.y, PR, H - PR);

  // --- timers & director
  directorUpdate(dt);
  for (let k = S.timers.length - 1; k >= 0; k--) {
    const tm = S.timers[k];
    tm.t -= dt;
    if (tm.t <= 0) { S.timers.splice(k, 1); tm.fn(); }
  }

  // --- power-up timers
  for (const key of ['shield', 'slow', 'double', 'rapid']) if (S.fx[key] > 0) S.fx[key] = Math.max(0, S.fx[key] - dt);
  const hdt = dt * (S.fx.slow > 0 ? 0.5 : 1);

  // --- hazards
  for (let k = S.hz.length - 1; k >= 0; k--) {
    const h = S.hz[k];
    h.gcd = Math.max(0, h.gcd - dt);
    let remove = false;
    if (h.k === 'block') {
      h.x += h.vx * hdt; h.y += h.vy * hdt;
      remove = h.y > H + 50 || h.x > W + 120 || h.x + h.w < -130;
    } else if (h.k === 'bullet') {
      h.x += h.vx * hdt; h.y += h.vy * hdt;
      remove = h.x < -30 || h.x > W + 30 || h.y < -40 || h.y > H + 30;
    } else if (h.k === 'laser') {
      h.t += hdt;
      if (h.t > h.warn + h.active) remove = true;
      else if (h.t > h.warn - 0.05 && !h.fired) { h.fired = true; shell.sfx.play('hit'); shake.kick(2); }
      else if (!h.warned) { h.warned = true; shell.sfx.play('warn'); }
    } else if (h.k === 'mine') {
      h.life -= hdt;
      if (h.arm > 0) h.arm -= hdt;
      else {
        const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
        const ms = (62 + diff() * 7) * (S.fx.slow > 0 ? 1 : 1);
        h.vx += (dx / d * ms - h.vx) * Math.min(1, hdt * 2.2); h.vy += (dy / d * ms - h.vy) * Math.min(1, hdt * 2.2);
        h.x += h.vx * hdt; h.y += h.vy * hdt;
      }
      if (h.life <= 0) { remove = true; fx.emit(h.x, h.y, 14, { speed: 140, life: 0.5, size: 4, color: '#ff8a3d' }); }
    }
    if (remove) { S.hz[k] = S.hz[S.hz.length - 1]; S.hz.pop(); continue; }

    // collision / graze
    const d = hazardDistance(h, p.x, p.y);
    if (d === null) continue;
    if (d < PR - 1) {
      if (p.inv > 0) continue;
      if (S.fx.shield > 0) { breakShield(); continue; }
      die(h);
      return;
    }
    if (d < PR + 15 && h.gcd <= 0 && (p.dashT <= 0 || true)) graze(h);
  }

  // --- power-ups
  S.nextPU -= dt;
  if (S.nextPU <= 0) { spawnPU(); S.nextPU = rand(11, 16); }
  for (let k = S.pu.length - 1; k >= 0; k--) {
    const u = S.pu[k];
    u.y += 55 * dt; u.life -= dt; u.a += dt * 3;
    if (Math.hypot(u.x - p.x, u.y - p.y) < 20 + PR) { collect(u); S.pu.splice(k, 1); continue; }
    if (u.life <= 0 || u.y > H + 20) S.pu.splice(k, 1);
  }

  // --- score
  S.streakT -= dt;
  if (S.streakT <= 0 && S.streak > 0) { S.streak = 0; }
  S.mult = (1 + Math.min(5, Math.floor(S.streak / 3))) * (S.fx.double > 0 ? 2 : 1);
  S.scoreAcc += dt * 10 * S.mult;
  if (S.scoreAcc >= 1) { const g = Math.floor(S.scoreAcc); S.score += g; S.scoreAcc -= g; }

  fx.update(dt); pops.update(dt); shake.update(dt);
  const sec = Math.floor(S.t);
  shell.hud('score', formatScore(S.score));
  shell.hud('time', `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
  shell.hud('mult', 'x' + S.mult);
}

const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

/** Distance from player circle centre to hazard surface (null if hazard is harmless right now). */
function hazardDistance(h, px, py) {
  switch (h.k) {
    case 'block': {
      const nx = clamp(px, h.x, h.x + h.w), ny = clamp(py, h.y, h.y + h.h);
      return Math.hypot(px - nx, py - ny);
    }
    case 'bullet': return Math.hypot(px - h.x, py - h.y) - h.r;
    case 'mine': return h.arm > 0 ? null : Math.hypot(px - h.x, py - h.y) - h.r;
    case 'laser': {
      if (h.t < h.warn || h.t > h.warn + h.active) return null;
      const c = h.dir === 'h' ? py : px;
      return Math.abs(c - h.pos) - h.thick / 2;
    }
    default: return null;
  }
}

function graze(h) {
  h.gcd = 0.7;
  S.grazes++; S.streak++; S.streakT = 4;
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  const pts = 25 * S.mult;
  S.score += pts;
  S.pulse = 1;
  if (S.grazes % 2 === 1) pops.add(S.p.x, S.p.y - 22, `CLOSE! +${pts}`, '#ffe14d', 13);
  shell.sfx.play('score');
  fx.emit(S.p.x, S.p.y, 5, { speed: 110, life: 0.3, size: 3, color: '#ffe14d' });
}

function breakShield() {
  S.fx.shield = 0; S.p.inv = 1.0;
  shell.sfx.play('explosion'); shake.kick(8); shell.hitStop(0.07);
  fx.emit(S.p.x, S.p.y, 34, { speed: 320, life: 0.6, size: 5, color: ['#5dff8f', '#d6ffe2'] });
  // shock-wave clears nearby hazards
  for (let k = S.hz.length - 1; k >= 0; k--) {
    const h = S.hz[k];
    if (h.k === 'laser') continue;
    const cx = h.k === 'block' ? h.x + h.w / 2 : h.x, cy = h.k === 'block' ? h.y + h.h / 2 : h.y;
    if (Math.hypot(cx - S.p.x, cy - S.p.y) < 130 + (h.w || 0) / 2) { S.hz[k] = S.hz[S.hz.length - 1]; S.hz.pop(); }
  }
  pops.add(S.p.x, S.p.y - 26, 'SHIELD!', '#5dff8f', 15);
}

function die(h) {
  S.dead = true;
  const p = S.p;
  shell.sfx.play('explosion'); shake.kick(14); shell.hitStop(0.12);
  fx.emit(p.x, p.y, 60, { speed: 380, life: 0.9, size: 6, color: ['#ff3cac', '#2de2e6', '#fff', '#ffe14d'] });
  const sec = Math.floor(S.t);
  shell.finish({
    win: false, score: S.score,
    stats: [
      ['Survived', `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`],
      ['Near misses', String(S.grazes)],
      ['Best streak', String(S.bestStreak)],
      ['Power-ups', String(S.picks)],
    ],
  });
}

const PU_TYPES = [
  { id: 'shield', color: '#5dff8f', label: 'SHIELD', dur: 12 },
  { id: 'slow', color: '#8b5cff', label: 'SLOW TIME', dur: 5 },
  { id: 'double', color: '#ffe14d', label: 'x2 SCORE', dur: 10 },
  { id: 'rapid', color: '#2de2e6', label: 'DASH CHARGE', dur: 8 },
];

function spawnPU() {
  if (S.pu.length >= 2) return;
  const t = pick(PU_TYPES.filter((u) => !(u.id === 'shield' && S.fx.shield > 0)));
  S.pu.push({ x: rand(50, W - 50), y: -16, t, life: 12, a: 0 });
}

function collect(u) {
  S.picks++;
  S.fx[u.t.id] = u.t.dur;
  if (u.t.id === 'rapid') S.p.dashCd = 0;
  shell.sfx.play('powerup');
  pops.add(S.p.x, S.p.y - 26, u.t.label, u.t.color, 15);
  fx.emit(u.x, u.y, 22, { speed: 220, life: 0.6, size: 4, color: [u.t.color, '#fff'] });
}

// ---------------------------------------------------------------- render
function render(ctx) {
  const glow = !shell.lowFx && !shell.reduced;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#080720'); g.addColorStop(1, '#14083a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // scrolling grid
  ctx.strokeStyle = `rgba(255,60,172,${0.08 + S.pulse * 0.14})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 48) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = scroll; y <= H; y += 48) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();

  // power-ups
  for (const u of S.pu) {
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.a);
    if (glow) { ctx.shadowColor = u.t.color; ctx.shadowBlur = 14; }
    ctx.strokeStyle = u.t.color; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(10,10,40,.8)';
    if (u.life < 3 && Math.floor(u.life * 6) % 2) ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(14, 0); ctx.lineTo(0, 14); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-u.a); ctx.fillStyle = u.t.color; ctx.font = '800 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText({ shield: 'S', slow: '◔', double: '2x', rapid: '»' }[u.t.id], 0, 1);
    ctx.restore();
  }

  // hazards
  for (const h of S.hz) {
    if (h.k === 'block') {
      ctx.fillStyle = h.wall ? '#ff3c6e' : '#ff3cac';
      if (glow) { ctx.shadowColor = '#ff3cac'; ctx.shadowBlur = 10; }
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(h.x, h.y, h.w, 3);
    } else if (h.k === 'bullet') {
      ctx.fillStyle = 'rgba(255,138,61,.3)'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb86b'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.4, 0, TAU); ctx.fill();
    } else if (h.k === 'mine') {
      const armed = h.arm <= 0;
      const pulse = 1 + Math.sin(S.t * (armed ? 12 : 20)) * 0.12;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(S.t * 2);
      ctx.globalAlpha = armed ? 1 : 0.45;
      ctx.fillStyle = armed ? '#ff8a3d' : '#ffd0a0';
      ctx.beginPath();
      for (let s = 0; s < 8; s++) { const a = s / 8 * TAU, r1 = h.r * pulse * 1.45, r2 = h.r * pulse * 0.8; ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + TAU / 16) * r2, Math.sin(a + TAU / 16) * r2); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a0a00'; ctx.beginPath(); ctx.arc(0, 0, h.r * 0.45, 0, TAU); ctx.fill();
      ctx.restore();
      if (!armed) { ctx.strokeStyle = 'rgba(255,138,61,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, 30 * h.arm + 12, 0, TAU); ctx.stroke(); }
    } else if (h.k === 'laser') {
      const live = h.t >= h.warn;
      const full = h.dir === 'h';
      if (!live) {
        const blink = Math.floor(h.t * 14) % 2 ? 0.9 : 0.35;
        ctx.strokeStyle = `rgba(255,60,90,${blink})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
        ctx.beginPath(); if (full) { ctx.moveTo(0, h.pos); ctx.lineTo(W, h.pos); } else { ctx.moveTo(h.pos, 0); ctx.lineTo(h.pos, H); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#ff3c5a'; ctx.font = '800 14px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (full) { ctx.fillText('!', 12, h.pos); ctx.fillText('!', W - 12, h.pos); } else { ctx.fillText('!', h.pos, 12); ctx.fillText('!', h.pos, H - 12); }
      } else {
        const k = 1 - (h.t - h.warn) / h.active;
        const th = h.thick * (0.6 + 0.4 * k);
        if (glow) { ctx.shadowColor = '#ff3c5a'; ctx.shadowBlur = 22; }
        ctx.fillStyle = '#ff3c5a';
        if (full) ctx.fillRect(0, h.pos - th / 2, W, th); else ctx.fillRect(h.pos - th / 2, 0, th, H);
        ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
        if (full) ctx.fillRect(0, h.pos - th / 5, W, th * 0.4); else ctx.fillRect(h.pos - th / 5, 0, th * 0.4, H);
      }
    }
  }

  // player
  drawPlayer(ctx, glow);
  fx.draw(ctx);
  pops.draw(ctx);
  ctx.restore();

  // frame + effect chips
  ctx.strokeStyle = 'rgba(255,60,172,.5)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
  drawChips(ctx);
  // dash meter
  const p = S.p;
  const ready = p.dashCd <= 0;
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(W - 86, H - 16, 76, 6);
  ctx.fillStyle = ready ? '#2de2e6' : '#6b73c9'; ctx.fillRect(W - 86, H - 16, 76 * (ready ? 1 : 1 - p.dashCd / 1.9), 6);
  ctx.fillStyle = '#9aa1d4'; ctx.font = '700 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(ready ? 'DASH READY' : 'DASH', W - 10, H - 22);
}

function drawPlayer(ctx, glow) {
  const p = S.p;
  if (S.dead) return;
  const blink = p.inv > 0 && Math.floor(p.inv * 20) % 2;
  if (blink) return;
  if (S.fx.shield > 0) {
    const wob = S.fx.shield < 2 && Math.floor(S.fx.shield * 8) % 2;
    ctx.strokeStyle = wob ? 'rgba(93,255,143,.3)' : '#5dff8f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PR + 9, 0, TAU); ctx.stroke();
  }
  if (S.fx.slow > 0) { ctx.strokeStyle = 'rgba(139,92,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 20 + Math.sin(S.t * 6) * 2, 0, TAU); ctx.stroke(); }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.dy, p.dx) + Math.PI / 2);
  if (glow) { ctx.shadowColor = '#2de2e6'; ctx.shadowBlur = 16; }
  ctx.fillStyle = p.dashT > 0 ? '#fff' : '#2de2e6';
  ctx.beginPath(); ctx.moveTo(0, -PR - 3); ctx.lineTo(PR, PR); ctx.lineTo(0, PR - 4); ctx.lineTo(-PR, PR); ctx.closePath(); ctx.fill();
  ctx.restore();
  // hit-box core so players can read how forgiving it is
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, TAU); ctx.fill();
}

function drawChips(ctx) {
  let x = 10;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const t of PU_TYPES) {
    const v = S.fx[t.id];
    if (!(v > 0) || t.id === 'rapid' && false) continue;
    ctx.fillStyle = 'rgba(8,8,36,.75)'; ctx.fillRect(x, H - 30, 98, 22);
    ctx.fillStyle = t.color; ctx.fillRect(x, H - 30, 98 * (v / t.dur), 3);
    ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.fillText(t.label, x + 6, H - 17);
    ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), x + 92, H - 17); ctx.textAlign = 'left';
    x += 104;
  }
}

window.__dodge = { S, shell };
