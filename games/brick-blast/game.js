// Brick Blast — Breakout with angle-controlled paddle bounces, multi-ball, power-ups and 6 levels.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { canvasPoint } from '../../js/input.js';
import { clamp, damp, formatScore, rand, TAU, roundRectPath, circleRect } from '../../js/util.js';
import { LEVELS } from './levels.js';

const W = 480, H = 640;
const COLS = 9, BW = 48, BH = 20, GAP = 4, OX = 8, OY = 64;
const BR = 7;                           // ball radius
const PAD_Y = H - 50, PAD_H = 12;
const PALETTE = ['#ff3c6e', '#ff8a3d', '#ffe14d', '#5dff8f', '#2de2e6', '#8b5cff', '#ff3cac'];

const fx = new Particles(300);
const pops = new Popups(14);
const shake = new Shake();

const G = {
  level: 1, score: 0, lives: 3, bricks: [], balls: [], drops: [], combo: 0, remaining: 0,
  pad: { cx: W / 2, w: 90, tw: 90, tx: null }, fxT: { wide: 0, slow: 0 }, hitCount: 0,
  perfect: false, levelLost: false, maxCombo: 0, pickups: 0, banner: null, bannerT: 0, transition: 0, over: false, t: 0, lost: 0, bricksBroken: 0, flash: 0,
};

const shell = createShell({
  id: 'brickBlast',
  title: 'Brick Blast',
  accent: '#ffe14d',
  size: { w: W, h: H },
  hud: [
    { id: 'level', label: 'LEVEL', init: '1' },
    { id: 'score', label: 'SCORE', init: '0' },
    { id: 'lives', label: 'LIVES', init: '♥♥♥' },
  ],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  gamepad: { left: ['dpadLeft', 'lsLeft'], right: ['dpadRight', 'lsRight'], launch: ['a', 'x', 'rt'] },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], launch: ['Space', 'ArrowUp', 'KeyW'],
  },
  touch: { left: [{ action: 'left', label: '◀', aria: 'Move paddle left' }, { action: 'right', label: '▶', aria: 'Move paddle right' }], right: [{ action: 'launch', label: 'LAUNCH', aria: 'Launch ball', cls: 'act wide' }] },
  instructions: {
    goal: 'Break every brick in all six levels. Don’t let the last ball fall.',
    controls: [
      ['← → / A D', 'Move paddle'],
      ['Mouse', 'Move paddle · click to launch'],
      ['Space', 'Launch the ball'],
      ['P / Esc', 'Pause'],
    ],
    touch: 'Drag anywhere to slide the paddle, or use ◀ ▶. Tap LAUNCH (or the board) to serve.',
    pad: 'D-pad / left stick move the paddle · A launches.',
    tips: [
      'Where the ball lands on the paddle sets its angle: hit with the edge to steer.',
      'Catch falling capsules: W wide paddle · M multi-ball · S slow ball · + extra life.',
      'Gold bricks always drop a capsule. Grey bricks are indestructible.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    const cv = shell.canvas;
    let drag = null;
    cv.addEventListener('pointermove', (e) => {
      const q = canvasPoint(e, cv, W, H);
      if (e.pointerType === 'mouse') G.pad.tx = q.x;
      else if (drag && drag.id === e.pointerId) { G.pad.tx = drag.sx + (q.x - drag.px) * 1.25; drag.moved = drag.moved || Math.abs(q.x - drag.px) > 10; }
    });
    cv.addEventListener('pointerdown', (e) => {
      if (shell.state !== 'playing') return;
      const q = canvasPoint(e, cv, W, H);
      if (e.pointerType === 'mouse') { if (e.button === 0) launch(); return; }
      drag = { id: e.pointerId, px: q.x, sx: G.pad.cx, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    const up = (e) => { if (drag && drag.id === e.pointerId) { if (!drag.moved && e.type === 'pointerup') launch(); drag = null; } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); G.t += dt; },
  render,
});

// ---------------------------------------------------------------- setup
const levelSpeed = () => Math.min(580, 340 + (G.level - 1) * 26);
const padWidth = () => Math.max(66, 94 - (G.level - 1) * 5);

function reset() {
  G.level = 1; G.score = 0; G.lives = 3; G.combo = 0; G.over = false; G.t = 0; G.lost = 0; G.bricksBroken = 0; G.flash = 0;
  G.perfect = false; G.levelLost = false; G.maxCombo = 0; G.pickups = 0;
  G.fxT.wide = G.fxT.slow = 0; G.transition = 0; G.banner = null; G.hitCount = 0;
  G.pad.cx = W / 2; G.pad.tx = null; G.pad.w = G.pad.tw = padWidth();
  G.drops.length = 0; G.balls.length = 0;
  fx.clear(); pops.clear(); shake.mag = 0;
  buildLevel(1);
  newBall();
  hud();
}

function buildLevel(n) {
  const L = LEVELS[n - 1];
  G.bricks.length = 0; G.remaining = 0;
  L.rows.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const ch = row[c];
      if (ch === '.' || ch === undefined) continue;
      const b = {
        x: OX + c * (BW + GAP), y: OY + r * (BH + GAP), w: BW, h: BH,
        type: ch === '#' ? 'wall' : ch === 'B' ? 'bonus' : ch === '2' ? 'strong' : 'normal',
        hp: ch === '2' ? 2 : ch === '#' ? 99 : 1, color: PALETTE[r % PALETTE.length], drop: ch === 'B' || (ch !== '#' && Math.random() < 0.1), flash: 0,
      };
      b.max = b.hp;
      if (b.type !== 'wall') G.remaining++;
      G.bricks.push(b);
    }
  });
  G.levelLost = false;
  G.banner = `LEVEL ${n} · ${L.name.toUpperCase()}`; G.bannerT = 2;
}

function newBall() {
  G.balls.length = 0;
  G.balls.push({ x: G.pad.cx, y: PAD_Y - BR - 1, vx: 0, vy: 0, stuck: true, trail: [] });
  G.combo = 0;
}

function hud() {
  shell.hud('level', String(G.level));
  shell.hud('score', formatScore(G.score));
  shell.hud('lives', '♥'.repeat(Math.max(0, G.lives)) || '–');
}

function launch() {
  if (shell.state !== 'playing' || G.transition > 0) return;
  let any = false;
  for (const b of G.balls) {
    if (!b.stuck) continue;
    b.stuck = false; any = true;
    const a = (G.pad.cx - W / 2) / W * 0.4 + rand(-0.18, 0.18);
    const sp = speed();
    b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
  }
  if (any) shell.sfx.play('bounce');
}

function speed() {
  return levelSpeed() * (1 + Math.min(0.2, G.hitCount * 0.004)) * (G.fxT.slow > 0 ? 0.72 : 1);
}

// ---------------------------------------------------------------- update
function update(dt) {
  const i = shell.input;
  G.t += dt;
  const pad = G.pad;
  // paddle
  const dir = i.axis('left', 'right');
  if (dir) { pad.tx = null; pad.cx += dir * 640 * dt; }
  else if (pad.tx !== null) pad.cx += (pad.tx - pad.cx) * damp(34, dt);
  pad.tw = (G.fxT.wide > 0 ? 1.55 : 1) * padWidth();
  pad.w += (pad.tw - pad.w) * damp(12, dt);
  pad.cx = clamp(pad.cx, pad.w / 2, W - pad.w / 2);
  if (i.pressed('launch')) launch();
  if (G.fxT.wide > 0) G.fxT.wide = Math.max(0, G.fxT.wide - dt);
  if (G.fxT.slow > 0) G.fxT.slow = Math.max(0, G.fxT.slow - dt);
  G.flash = Math.max(0, G.flash - dt * 3);
  if (G.bannerT > 0) G.bannerT -= dt;

  if (G.transition > 0) {
    G.transition -= dt;
    if (G.transition <= 0) { G.level++; buildLevel(G.level); G.pad.w = G.pad.tw = padWidth(); newBall(); hud(); }
    fx.update(dt); pops.update(dt); shake.update(dt);
    return;
  }

  // balls
  for (let bi = G.balls.length - 1; bi >= 0; bi--) {
    const b = G.balls[bi];
    if (b.stuck) { b.x = pad.cx; b.y = PAD_Y - BR - 1; continue; }
    const sp = Math.hypot(b.vx, b.vy);
    const want = speed();
    if (Math.abs(sp - want) > 1) { const k = (sp + (want - sp) * Math.min(1, dt * 4)) / sp; b.vx *= k; b.vy *= k; }
    const dist = Math.hypot(b.vx, b.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / 4));
    for (let s = 0; s < n; s++) {
      b.x += b.vx * dt / n; b.y += b.vy * dt / n;
      stepBall(b);
    }
    b.trail.push(b.x, b.y);
    if (b.trail.length > 12) b.trail.splice(0, 2);
    if (b.y > H + 20) G.balls.splice(bi, 1);
  }
  if (!G.balls.length && !G.over) loseLife();

  // drops
  for (let d = G.drops.length - 1; d >= 0; d--) {
    const p = G.drops[d];
    p.y += 125 * dt;
    if (p.y > PAD_Y - 6 && p.y < PAD_Y + PAD_H + 16 && Math.abs(p.x - pad.cx) < pad.w / 2 + 14) { collect(p); G.drops.splice(d, 1); }
    else if (p.y > H + 20) G.drops.splice(d, 1);
  }
  for (const b of G.bricks) if (b.flash > 0) b.flash -= dt * 5;

  fx.update(dt); pops.update(dt); shake.update(dt);
}

function stepBall(b) {
  // walls
  if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); fixAngle(b); shell.sfx.play('bounce'); }
  else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); fixAngle(b); shell.sfx.play('bounce'); }
  if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); fixAngle(b); shell.sfx.play('bounce'); }

  // paddle
  const pad = G.pad;
  const px = pad.cx - pad.w / 2;
  if (b.vy > 0 && b.y + BR >= PAD_Y && b.y - BR <= PAD_Y + PAD_H && b.x >= px - BR && b.x <= px + pad.w + BR && b.y < PAD_Y + PAD_H) {
    const off = clamp((b.x - pad.cx) / (pad.w / 2 + BR), -1, 1);
    const ang = off * 1.08;                         // up to ~62° from vertical
    G.hitCount++;
    const sp = speed();
    b.vx = Math.sin(ang) * sp; b.vy = -Math.cos(ang) * sp;
    b.y = PAD_Y - BR - 0.01;
    G.combo = 0;
    shell.sfx.play('bounce');
    fx.emit(b.x, PAD_Y, 6, { speed: 100, angle: -Math.PI / 2, spread: 1.6, life: 0.3, size: 3, color: '#5dff8f' });
    return;
  }

  // bricks
  let hitX = false, hitY = false, hitBrick = null;
  for (const br of G.bricks) {
    if (br.hp <= 0) continue;
    if (!circleRect(b.x, b.y, BR, br.x, br.y, br.w, br.h)) continue;
    const nx = clamp(b.x, br.x, br.x + br.w), ny = clamp(b.y, br.y, br.y + br.h);
    let dx = b.x - nx, dy = b.y - ny;
    if (dx === 0 && dy === 0) { // centre inside brick: push out the shortest way
      const ox = Math.min(b.x - br.x, br.x + br.w - b.x), oy = Math.min(b.y - br.y, br.y + br.h - b.y);
      if (ox < oy) dx = b.x < br.x + br.w / 2 ? -1 : 1; else dy = b.y < br.y + br.h / 2 ? -1 : 1;
    }
    if (Math.abs(dx) > Math.abs(dy)) hitX = true; else hitY = true;
    // push out so we do not re-hit next micro-step
    const d = Math.hypot(dx, dy) || 1;
    b.x += dx / d * (BR - d + 0.05); b.y += dy / d * (BR - d + 0.05);
    hitBrick = br;
    damage(br);
    if (hitX && hitY) break;
  }
  if (hitBrick) {
    if (hitX) b.vx = (b.x < hitBrick.x + hitBrick.w / 2 ? -1 : 1) * Math.abs(b.vx);
    if (hitY) b.vy = (b.y < hitBrick.y + hitBrick.h / 2 ? -1 : 1) * Math.abs(b.vy);
    fixAngle(b);
  }
}

/** Keep the ball from drifting into endless near-horizontal or near-vertical paths. */
function fixAngle(b) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  let sx = b.vx / sp, sy = b.vy / sp;
  const minY = 0.3, minX = 0.16;
  let changed = false;
  if (Math.abs(sy) < minY) { sy = (sy < 0 ? -1 : 1) * minY; changed = true; }
  if (Math.abs(sx) < minX) { sx = (sx < 0 || (sx === 0 && Math.random() < 0.5) ? -1 : 1) * minX; changed = true; }
  if (changed) {
    const m = Math.hypot(sx, sy);
    b.vx = sx / m * sp; b.vy = sy / m * sp;
  }
}

function damage(br) {
  if (br.type === 'wall') { shell.sfx.play('brickStrong'); fx.emit(br.x + br.w / 2, br.y + br.h / 2, 3, { speed: 60, life: 0.2, size: 2, color: '#b7bce8' }); br.flash = 1; return; }
  br.hp--;
  br.flash = 1;
  const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
  if (br.hp > 0) {
    shell.sfx.play('brickStrong');
    G.score += 5; hud();
    fx.emit(cx, cy, 4, { speed: 100, life: 0.25, size: 3, color: '#dfe3ff' });
    return;
  }
  G.remaining--; G.bricksBroken++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.maxCombo === 12) shell.facts({ combo: 12 });
  const base = br.type === 'strong' ? 25 : br.type === 'bonus' ? 30 : 10;
  const mult = Math.min(5, 1 + Math.floor((G.combo - 1) / 4));
  const pts = base * mult;
  G.score += pts;
  shell.sfx.play('brick');
  fx.emit(cx, cy, 12, { speed: 200, life: 0.5, size: 4, color: [br.type === 'bonus' ? '#ffe14d' : br.color, '#fff'], grav: 300 });
  shake.kick(br.type === 'strong' ? 2 : 1);
  if (mult > 1 && G.combo % 4 === 1) pops.add(cx, cy, `COMBO x${mult}`, '#ffe14d', 14);
  else if (G.bricksBroken % 3 === 0) pops.add(cx, cy, `+${pts}`, '#fff', 12);
  if (br.drop) spawnDrop(cx, cy);
  hud();
  if (G.remaining <= 0) levelClear();
}

const DROPS = [
  { id: 'wide', color: '#5dff8f', label: 'W', w: 3 },
  { id: 'multi', color: '#2de2e6', label: 'M', w: 3 },
  { id: 'slow', color: '#8b5cff', label: 'S', w: 2 },
  { id: 'life', color: '#ff3c6e', label: '+', w: 1 },
];
function spawnDrop(x, y) {
  let total = 0;
  for (const d of DROPS) total += (d.id === 'life' && G.lives >= 5) ? 0 : d.w;
  let r = Math.random() * total, pick = DROPS[0];
  for (const d of DROPS) { const w = (d.id === 'life' && G.lives >= 5) ? 0 : d.w; r -= w; if (r <= 0) { pick = d; break; } }
  G.drops.push({ x, y, t: pick });
}

function collect(p) {
  const t = p.t.id;
  G.pickups++;
  shell.sfx.play('powerup');
  G.score += 25;
  fx.emit(p.x, PAD_Y, 16, { speed: 200, life: 0.5, size: 4, color: [p.t.color, '#fff'] });
  if (t === 'wide') { G.fxT.wide = 14; pops.add(p.x, PAD_Y - 20, 'WIDE PADDLE', p.t.color, 14); }
  else if (t === 'slow') { G.fxT.slow = 10; pops.add(p.x, PAD_Y - 20, 'SLOW BALL', p.t.color, 14); }
  else if (t === 'life') { G.lives = Math.min(5, G.lives + 1); pops.add(p.x, PAD_Y - 20, 'EXTRA LIFE', p.t.color, 14); }
  else if (t === 'multi') {
    pops.add(p.x, PAD_Y - 20, 'MULTI-BALL', p.t.color, 14);
    const src = G.balls.filter((b) => !b.stuck);
    if (!src.length) { for (const b of G.balls) if (b.stuck) launch(); }
    for (const b of src.slice()) {
      for (const da of [-0.5, 0.5]) {
        if (G.balls.length >= 6) break;
        const a = Math.atan2(b.vy, b.vx) + da, sp = Math.hypot(b.vx, b.vy);
        G.balls.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, stuck: false, trail: [] });
      }
    }
  }
  hud();
}

function loseLife() {
  G.lives--; G.lost++; G.combo = 0; G.levelLost = true;
  shell.sfx.play('hit'); shake.kick(10); shell.hitStop(0.08); G.flash = 1;
  fx.emit(G.pad.cx, PAD_Y, 24, { speed: 260, life: 0.7, size: 5, color: ['#ff3c6e', '#fff'] });
  G.fxT.wide = 0; G.fxT.slow = 0; G.drops.length = 0;
  hud();
  if (G.lives <= 0) { end(false); return; }
  newBall();
}

function levelClear() {
  if (!G.levelLost) { G.perfect = true; shell.facts({ perfectLevel: true, level: G.level + 1 }); } else shell.facts({ level: G.level + 1 });
  const bonus = 200 + G.lives * 100;
  G.score += bonus;
  shell.sfx.play('victory');
  fx.emit(W / 2, H / 2, 50, { speed: 380, life: 1, size: 5, color: PALETTE, grav: 200 });
  G.balls.length = 0; G.drops.length = 0;
  hud();
  if (G.level >= LEVELS.length) { G.banner = 'ALL LEVELS CLEARED!'; G.bannerT = 3; end(true); return; }
  G.banner = `LEVEL ${G.level} CLEAR  +${bonus}`; G.bannerT = 2.2;
  G.transition = 2.2;
}

function end(win) {
  if (G.over) return;
  G.over = true;
  shell.finish({
    win, title: win ? 'You Win!' : 'Game Over', subtitle: win ? 'Every level cleared!' : `Out of lives on level ${G.level}`,
    score: G.score,
    extras: { highestLevel: G.level },
    facts: { score: G.score, level: win ? LEVELS.length + 1 : G.level, won: win, bricks: G.bricksBroken, perfectLevel: G.perfect, combo: G.maxCombo },
    counters: { bricks: G.bricksBroken, powerups: G.pickups },
    milestones: [['Levels cleared', Math.min(60, (G.level - (win ? 0 : 1)) * 10)], ['Bricks broken', Math.min(30, Math.floor(G.bricksBroken / 10) * 2)]],
    summary: `Score ${formatScore(G.score)} · Level ${G.level}`,
    stats: [
      ['Level reached', `${G.level}/${LEVELS.length}`],
      ['Bricks broken', String(G.bricksBroken)],
      ['Balls lost', String(G.lost)],
    ],
  });
}

// ---------------------------------------------------------------- render
function render(ctx) {
  const glow = !shell.lowFx && !shell.reduced;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0a38'); g.addColorStop(1, '#070a26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shake.x, shake.y);
  // faint grid
  ctx.strokeStyle = 'rgba(255,225,77,.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= W; x += 40) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();

  // bricks
  for (const br of G.bricks) {
    if (br.hp <= 0) continue;
    let col = br.color, fill = null;
    if (br.type === 'wall') { col = '#6f77a8'; fill = '#2a2f5e'; }
    else if (br.type === 'strong') { col = br.hp === 2 ? '#c9cff5' : br.color; fill = br.hp === 2 ? '#4b5290' : '#2b2f66'; }
    else if (br.type === 'bonus') { col = '#ffe14d'; fill = '#6b5300'; }
    else fill = shade(br.color);
    roundRectPath(ctx, br.x, br.y, br.w, br.h, 4);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = br.type === 'normal' ? 0.85 : 0.45;
    ctx.fillRect(br.x + 4, br.y + 4, br.w - 8, 4);
    ctx.globalAlpha = 1;
    if (br.type === 'wall') { ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); for (let k = -20; k < br.w; k += 10) { ctx.moveTo(br.x + k, br.y + br.h); ctx.lineTo(br.x + k + 14, br.y); } ctx.save(); ctx.clip(); ctx.restore(); }
    if (br.type === 'strong' && br.hp === 1) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(br.x + 12, br.y + 3); ctx.lineTo(br.x + 20, br.y + 10); ctx.lineTo(br.x + 17, br.y + 17); ctx.stroke(); }
    if (br.type === 'bonus') { ctx.fillStyle = '#ffe14d'; ctx.font = '800 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', br.x + br.w / 2, br.y + br.h / 2 + 1); }
    if (br.flash > 0) { ctx.globalAlpha = br.flash * 0.7; ctx.fillStyle = '#fff'; roundRectPath(ctx, br.x, br.y, br.w, br.h, 4); ctx.fill(); ctx.globalAlpha = 1; }
  }

  // drops
  for (const p of G.drops) {
    if (glow) { ctx.shadowColor = p.t.color; ctx.shadowBlur = 12; }
    roundRectPath(ctx, p.x - 15, p.y - 10, 30, 20, 8);
    ctx.fillStyle = '#0c0f33'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = p.t.color; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.t.color; ctx.font = '800 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.t.label, p.x, p.y + 1);
  }

  // paddle
  const pad = G.pad;
  if (glow) { ctx.shadowColor = '#5dff8f'; ctx.shadowBlur = 16; }
  roundRectPath(ctx, pad.cx - pad.w / 2, PAD_Y, pad.w, PAD_H, 6);
  ctx.fillStyle = G.fxT.wide > 0 ? '#9dffbd' : '#5dff8f'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(pad.cx - pad.w / 2 + 8, PAD_Y + 2, pad.w - 16, 2);

  // balls
  for (const b of G.balls) {
    for (let k = 0; k < b.trail.length; k += 2) {
      const a = k / b.trail.length;
      ctx.fillStyle = `rgba(45,226,230,${a * 0.35})`; ctx.beginPath(); ctx.arc(b.trail[k], b.trail[k + 1], BR * a, 0, TAU); ctx.fill();
    }
    if (glow) { ctx.shadowColor = G.fxT.slow > 0 ? '#8b5cff' : '#2de2e6'; ctx.shadowBlur = 16; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    if (b.stuck && shell.state === 'playing') {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x, b.y - 90); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  fx.draw(ctx);
  pops.draw(ctx);
  ctx.restore();

  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.25; ctx.fillStyle = '#ff3c6e'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

  // active power-up chips
  let x = 8;
  ctx.textBaseline = 'middle';
  for (const [key, label, color, dur] of [['wide', 'WIDE', '#5dff8f', 14], ['slow', 'SLOW', '#8b5cff', 10]]) {
    const v = G.fxT[key];
    if (!(v > 0)) continue;
    ctx.fillStyle = 'rgba(6,8,30,.8)'; ctx.fillRect(x, H - 24, 90, 18);
    ctx.fillStyle = color; ctx.fillRect(x, H - 24, 90 * (v / dur), 3);
    ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, x + 6, H - 13);
    ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), x + 84, H - 13); x += 96;
  }
  if (G.bannerT > 0 && G.banner) {
    ctx.globalAlpha = Math.min(1, G.bannerT);
    ctx.fillStyle = 'rgba(6,8,30,.75)'; ctx.fillRect(0, H / 2 - 28, W, 56);
    ctx.fillStyle = '#ffe14d'; ctx.font = '900 22px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.banner, W / 2, H / 2 + 1);
    ctx.globalAlpha = 1;
  }
  if (shell.state === 'playing' && G.balls.some((b) => b.stuck) && G.transition <= 0 && G.bannerT <= 0) {
    ctx.fillStyle = '#e8ecff'; ctx.font = '700 14px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(shell.isTouch ? 'Tap LAUNCH or the board to serve' : 'Press SPACE or click to launch', W / 2, PAD_Y - 60 - 24);
  }
  ctx.textAlign = 'left';
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.32)},${Math.round(g * 0.32)},${Math.round(b * 0.32)})`;
}

window.__brick = { G, shell };
