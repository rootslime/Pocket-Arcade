// Turbo Snake — grid Snake with buffered input, a Classic mode and a power-up-heavy Turbo mode.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { attachSwipe } from '../../js/input.js';
import { clamp, formatScore, rand, randInt, pick, TAU, roundRectPath } from '../../js/util.js';

const COLS = 20, ROWS = 20, CELL = 30, W = COLS * CELL, H = ROWS * CELL;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const fx = new Particles(260);
const pops = new Popups(14);
const shake = new Shake();

const G = {
  turbo: false, seg: [], prev: [], dir: 'right', queue: [], started: false, stepT: 0, speed: 8,
  food: null, bonus: null, power: null, fx: { slow: 0, double: 0, ghost: 0 },
  bonusCount: 0, ghostCount: 0, score: 0, eaten: 0, t: 0, nextBonus: 8, nextPower: 10, over: false, bestLen: 3, flash: 0,
};

const bestField = (mode) => (mode === 'turbo' ? 'turboHigh' : 'classicHigh');

const shell = createShell({
  id: 'turboSnake',
  title: 'Turbo Snake',
  accent: '#5dff8f',
  size: { w: W, h: H },
  modes: [
    { id: 'classic', label: 'Classic', desc: 'Pure snake. Speeds up as you grow.' },
    { id: 'turbo', label: 'Turbo', desc: 'Faster, with bonus food & power-ups.' },
  ],
  hud: [
    { id: 'score', label: 'SCORE', init: '0' },
    { id: 'len', label: 'LENGTH', init: '3' },
  ],
  best: { field: bestField, kind: 'high', label: 'BEST' },
  gamepad: { up: ['dpadUp', 'lsUp'], down: ['dpadDown', 'lsDown'], left: ['dpadLeft', 'lsLeft'], right: ['dpadRight', 'lsRight'] },
  keys: {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  },
  touch: {
    optional: true, leftClass: 'dpad',
    left: [
      { action: 'up', label: '▲', aria: 'Up', area: 'u' }, { action: 'left', label: '◀', aria: 'Left', area: 'l' },
      { action: 'right', label: '▶', aria: 'Right', area: 'r' }, { action: 'down', label: '▼', aria: 'Down', area: 'd' },
    ],
    right: [],
  },
  instructions: {
    goal: 'Eat food to grow and score. Don’t hit the walls or your own tail.',
    controls: [
      ['Arrows / WASD', 'Steer (inputs are buffered)'],
      ['P / Esc', 'Pause'],
    ],
    touch: 'Swipe anywhere on the board to steer. Tap the pad button in the top bar for an on-screen D-pad.',
    pad: 'D-pad or left stick to steer.',
    tips: [
      'Turbo mode: gold food is worth 5×, and power-ups give Slow-mo, Double points or Ghost (pass through yourself and wrap the walls).',
      'You can’t reverse into yourself — quick turns are queued.',
      'The snake waits for your first move.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    attachSwipe(shell.canvas, (d) => { if (shell.state === 'playing') queueDir(d); }, 22);
  },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); G.t += dt; },
  render,
});

function reset(mode) {
  G.turbo = mode === 'turbo';
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  G.seg = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
  G.prev = G.seg.map((s) => ({ x: s.x, y: s.y }));
  G.dir = 'right'; G.queue.length = 0; G.started = false; G.stepT = 0;
  G.speed = G.turbo ? 9 : 7.5;
  G.bonus = null; G.power = null; G.fx.slow = G.fx.double = G.fx.ghost = 0;
  G.bonusCount = 0; G.ghostCount = 0; G.score = 0; G.eaten = 0; G.t = 0; G.nextBonus = 9; G.nextPower = 12; G.over = false; G.bestLen = 3; G.flash = 0;
  G.food = null; spawnFood();
  fx.clear(); pops.clear(); shake.mag = 0;
  shell.hud('score', '0'); shell.hud('len', '3');
}

const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
function queueDir(d) {
  const last = G.queue.length ? G.queue[G.queue.length - 1] : G.dir;
  if (d === last || d === opposite[last]) return;
  if (G.queue.length < 3) G.queue.push(d);
  G.started = true;
}

function freeCell() {
  const taken = new Set(G.seg.map((s) => s.y * COLS + s.x));
  for (const o of [G.food, G.bonus, G.power]) if (o) taken.add(o.y * COLS + o.x);
  const free = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[randInt(0, free.length - 1)];
  return { x: i % COLS, y: Math.floor(i / COLS) };
}

function spawnFood() {
  G.food = null;
  const c = freeCell();
  if (c) G.food = { ...c, t: 0 };
  return !!c;
}

function stepInterval() {
  return 1 / (G.speed * (G.fx.slow > 0 ? 0.6 : 1));
}

function update(dt) {
  const i = shell.input;
  for (const d of ['up', 'down', 'left', 'right']) if (i.pressed(d)) queueDir(d);
  G.t += dt;
  fx.update(dt); pops.update(dt); shake.update(dt);
  G.flash = Math.max(0, G.flash - dt * 3);
  if (G.food) G.food.t += dt;
  if (!G.started) return;

  for (const k of ['slow', 'double', 'ghost']) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);

  if (G.turbo) {
    G.nextBonus -= dt; G.nextPower -= dt;
    if (G.bonus) { G.bonus.life -= dt; if (G.bonus.life <= 0) G.bonus = null; }
    if (G.power) { G.power.life -= dt; if (G.power.life <= 0) G.power = null; }
    if (G.nextBonus <= 0 && !G.bonus) { const c = freeCell(); if (c) G.bonus = { ...c, life: 6, max: 6 }; G.nextBonus = rand(10, 16); }
    if (G.nextPower <= 0 && !G.power) { const c = freeCell(); if (c) G.power = { ...c, life: 9, type: pick(['slow', 'double', 'ghost']) }; G.nextPower = rand(14, 22); }
  }

  G.stepT += dt;
  let guard = 0;
  while (G.stepT >= stepInterval() && guard++ < 3 && shell.state === 'playing') {
    G.stepT -= stepInterval();
    step();
  }
}

function step() {
  if (G.queue.length) G.dir = G.queue.shift();
  const [dx, dy] = DIRS[G.dir];
  const head = G.seg[0];
  let nx = head.x + dx, ny = head.y + dy;
  const ghost = G.fx.ghost > 0;
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
    if (ghost) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    else return die('You hit the wall');
  }
  const eating = G.food && G.food.x === nx && G.food.y === ny;
  // self collision (tail tip moves away this step unless we grow)
  const limit = eating ? G.seg.length : G.seg.length - 1;
  if (!ghost) for (let k = 0; k < limit; k++) if (G.seg[k].x === nx && G.seg[k].y === ny) return die('You ate yourself');

  // advance: remember previous positions for smooth drawing
  for (let k = 0; k < G.seg.length; k++) { G.prev[k] = { x: G.seg[k].x, y: G.seg[k].y }; }
  const tail = G.seg[G.seg.length - 1];
  const oldTail = { x: tail.x, y: tail.y };
  for (let k = G.seg.length - 1; k > 0; k--) { G.seg[k].x = G.seg[k - 1].x; G.seg[k].y = G.seg[k - 1].y; }
  head.x = nx; head.y = ny;
  if (eating) { G.seg.push({ x: oldTail.x, y: oldTail.y }); G.prev.push({ x: oldTail.x, y: oldTail.y }); }
  // a wrap would make the smooth interpolation fly across the board: snap those segments
  for (let k = 0; k < G.seg.length; k++) if (Math.abs(G.seg[k].x - G.prev[k].x) > 1 || Math.abs(G.seg[k].y - G.prev[k].y) > 1) G.prev[k] = { x: G.seg[k].x, y: G.seg[k].y };

  const cx = nx * CELL + CELL / 2, cy = ny * CELL + CELL / 2;
  if (eating) {
    G.eaten++;
    const mult = G.fx.double > 0 ? 2 : 1;
    const pts = (10 + (G.turbo ? Math.floor(G.eaten / 3) * 2 : 0)) * mult;
    addScore(pts, cx, cy, '#5dff8f');
    shell.sfx.play('eat');
    fx.emit(cx, cy, 12, { speed: 150, life: 0.45, size: 4, color: ['#ff5c7a', '#ffb3c1'] });
    G.speed = Math.min(G.turbo ? 20 : 14, G.speed + (G.turbo ? 0.32 : 0.2));
    if (!spawnFood()) return win();
  }
  if (G.bonus && G.bonus.x === nx && G.bonus.y === ny) {
    const pts = 50 * (G.fx.double > 0 ? 2 : 1);
    G.bonusCount++;
    addScore(pts, cx, cy, '#ffe14d'); shell.sfx.play('powerup');
    fx.emit(cx, cy, 20, { speed: 220, life: 0.6, size: 5, color: ['#ffe14d', '#fff'] });
    G.bonus = null;
  }
  if (G.power && G.power.x === nx && G.power.y === ny) {
    const type = G.power.type;
    if (type === 'ghost') G.ghostCount++;
    G.fx[type] = type === 'slow' ? 6 : type === 'double' ? 10 : 6;
    shell.sfx.play('powerup');
    pops.add(cx, cy - 20, { slow: 'SLOW-MO', double: 'DOUBLE POINTS', ghost: 'GHOST MODE' }[type], PU[type].color, 15);
    fx.emit(cx, cy, 22, { speed: 220, life: 0.6, size: 5, color: [PU[type].color, '#fff'] });
    G.power = null;
  }
  G.bestLen = Math.max(G.bestLen, G.seg.length);
  shell.hud('len', String(G.seg.length));
  G.stepT = Math.min(G.stepT, 0.05);
}

const PU = {
  slow: { color: '#8b5cff', label: 'SLOW-MO', dur: 6, icon: '◔' },
  double: { color: '#ffe14d', label: 'x2 POINTS', dur: 10, icon: '2x' },
  ghost: { color: '#9fe8ff', label: 'GHOST', dur: 6, icon: '👻' },
};

function addScore(pts, x, y, color) {
  G.score += pts;
  pops.add(x, y - 8, `+${pts}`, color, 15);
  shell.hud('score', formatScore(G.score));
}

function end(win, reason) {
  if (G.over) return;
  G.over = true;
  const head = G.seg[0];
  const hx = head.x * CELL + CELL / 2, hy = head.y * CELL + CELL / 2;
  if (!win) { shake.kick(10); shell.hitStop(0.1); fx.emit(hx, hy, 50, { speed: 300, life: 0.9, size: 6, color: ['#5dff8f', '#ff3cac', '#fff'] }); G.flash = 1; }
  shell.finish({
    win, title: win ? 'Board Cleared!' : 'Game Over', subtitle: reason,
    score: G.score,
    extras: { highScore: G.score },
    facts: { score: G.score, length: G.seg.length, mode: G.turbo ? 'turbo' : 'classic', bonus: G.bonusCount, ghost: G.ghostCount },
    milestones: [['Length', Math.min(40, Math.floor(G.seg.length / 5) * 4)], ['Score milestones', Math.min(30, Math.floor(G.score / 100) * 3)]],
    summary: `Score ${formatScore(G.score)} · ${G.turbo ? 'Turbo' : 'Classic'}`,
    stats: [
      ['Mode', G.turbo ? 'Turbo' : 'Classic'],
      ['Length', String(G.seg.length)],
      ['Food eaten', String(G.eaten)],
      ['Top speed', `${G.speed.toFixed(1)}/s`],
    ],
  });
}
const die = (r) => end(false, r);
const win = () => end(true, 'You filled the whole board!');

// ---------------------------------------------------------------- render
function render(ctx) {
  const glow = !shell.lowFx && !shell.reduced;
  ctx.fillStyle = '#06130f'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shake.x, shake.y);
  // board
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#0a1c16' : '#081813';
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  if (G.fx.ghost > 0) { ctx.strokeStyle = 'rgba(159,232,255,.45)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); ctx.setLineDash([]); }

  const k = G.started ? clamp(G.stepT / stepInterval(), 0, 1) : 1;
  // food
  if (G.food) {
    const pulse = 1 + Math.sin(G.food.t * 6) * 0.08;
    const x = G.food.x * CELL + CELL / 2, y = G.food.y * CELL + CELL / 2;
    if (glow) { ctx.shadowColor = '#ff3c6e'; ctx.shadowBlur = 14; }
    ctx.fillStyle = '#ff4d79'; ctx.beginPath(); ctx.arc(x, y + 1, 10 * pulse, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#5dff8f'; ctx.fillRect(x - 1, y - 12, 3, 6);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x - 4, y - 3, 2.5, 0, TAU); ctx.fill();
  }
  if (G.bonus) {
    const b = G.bonus, x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2;
    const blink = b.life < 2 && Math.floor(b.life * 8) % 2;
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (glow) { ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 16; }
    star(ctx, x, y, 13, 6, '#ffe14d', G.t * 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * (b.life / b.max)); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (G.power) {
    const p = G.power, x = p.x * CELL + CELL / 2, y = p.y * CELL + CELL / 2, c = PU[p.type].color;
    const blink = p.life < 2.5 && Math.floor(p.life * 8) % 2;
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (glow) { ctx.shadowColor = c; ctx.shadowBlur = 14; }
    ctx.fillStyle = 'rgba(8,16,30,.9)'; ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = c; ctx.font = '800 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(PU[p.type].icon, x, y + 1);
    ctx.globalAlpha = 1;
  }

  // snake (interpolated between the previous and current grid cell)
  const n = G.seg.length;
  const ghost = G.fx.ghost > 0;
  ctx.globalAlpha = ghost ? 0.55 : 1;
  for (let s = n - 1; s >= 0; s--) {
    const a = G.seg[s], b = G.prev[s] || a;
    const x = (b.x + (a.x - b.x) * k) * CELL, y = (b.y + (a.y - b.y) * k) * CELL;
    const t = s / Math.max(1, n - 1);
    const inset = 2 + t * 3;
    ctx.fillStyle = s === 0 ? '#b6ffc9' : `hsl(${150 - t * 30}, 100%, ${58 - t * 18}%)`;
    if (glow && s % 3 === 0) { ctx.shadowColor = '#5dff8f'; ctx.shadowBlur = 8; } else ctx.shadowBlur = 0;
    roundRectPath(ctx, x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, 7);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // eyes
  {
    const a = G.seg[0], b = G.prev[0] || a;
    const x = (b.x + (a.x - b.x) * k) * CELL + CELL / 2, y = (b.y + (a.y - b.y) * k) * CELL + CELL / 2;
    const [dx, dy] = DIRS[G.dir];
    const px = -dy, py = dx;
    ctx.fillStyle = '#06130f';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(x + dx * 5 + px * 5 * sgn, y + dy * 5 + py * 5 * sgn, 3, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  fx.draw(ctx);
  pops.draw(ctx);
  ctx.restore();

  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.3; ctx.fillStyle = '#ff3c6e'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  // active power-up chips
  let x = 8;
  ctx.textBaseline = 'middle';
  for (const key of ['slow', 'double', 'ghost']) {
    const v = G.fx[key];
    if (!(v > 0)) continue;
    const d = PU[key];
    ctx.fillStyle = 'rgba(4,12,10,.8)'; ctx.fillRect(x, H - 28, 112, 22);
    ctx.fillStyle = d.color; ctx.fillRect(x, H - 28, 112 * (v / d.dur), 3);
    ctx.font = '800 11px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(d.label, x + 6, H - 15);
    ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), x + 106, H - 15);
    x += 118;
  }
  if (shell.state === 'playing' && !G.started) {
    ctx.fillStyle = 'rgba(4,12,10,.7)'; ctx.fillRect(W / 2 - 190, H * 0.62 - 20, 380, 40);
    ctx.fillStyle = '#b6ffc9'; ctx.font = '800 16px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(shell.isTouch ? 'Swipe to start' : 'Press an arrow key to start', W / 2, H * 0.62);
  }
  ctx.textAlign = 'left';
}

function star(ctx, x, y, r1, r2, color, rot) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = rot + i / 10 * TAU; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
}

window.__snake = { G, shell };
