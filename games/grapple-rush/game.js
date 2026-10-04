// Grapple Rush — rendering, input and feedback on top of the pure simulation in sim.js.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { canvasPoint } from '../../js/input.js';
import { clamp, damp, formatTime, rand, TAU } from '../../js/util.js';
import { World, PHYS } from './sim.js';
import { LEVEL } from './level.js';

const world = new World(LEVEL);
const fx = new Particles(260);
const pops = new Popups(16);
const shake = new Shake();
const cam = { x: 0, y: 0 };
let aim = null, aimActive = false, hovering = false;
let grappleBuf = 0, flash = 0, flashColor = '#ff3cac', t = 0, sinceStart = 0, lastTarget = null;
let windowPattern = null;
const reach = [];

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const shell = createShell({
  id: 'grappleRush',
  title: 'Grapple Rush',
  accent: '#2de2e6',
  quickRestart: true,
  size: (aspect) => {
    const w = clamp(460 * aspect, 560, 1000);
    return { w, h: w / aspect };
  },
  hud: [
    { id: 'time', label: 'TIME', init: '0:00.00' },
    { id: 'cp', label: 'CHECKPOINT', init: `0/${LEVEL.checkpoints.length}` },
  ],
  best: { field: 'bestTime', kind: 'low', format: formatTime, label: 'BEST' },
  gamepad: { left: ['dpadLeft', 'lsLeft'], right: ['dpadRight', 'lsRight'], jump: ['a', 'dpadUp'], down: ['dpadDown', 'lsDown'], grapple: ['x', 'rt', 'rb', 'lt'] },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    grapple: ['KeyE', 'ShiftLeft', 'ShiftRight'],
  },
  touch: {
    left: [{ action: 'left', label: '◀', aria: 'Move left' }, { action: 'right', label: '▶', aria: 'Move right' }],
    right: [
      { action: 'grapple', label: 'GRAPPLE', aria: 'Grapple (hold)', cls: 'act wide' },
      { action: 'jump', label: 'JUMP', aria: 'Jump', cls: 'wide' },
    ],
  },
  instructions: {
    goal: 'Cross the rooftops and reach the finish gate as fast as you can. Your best time is saved.',
    controls: [
      ['A D / ← →', 'Run'],
      ['Space / W', 'Jump (hold for height, hold while swinging to reel in)'],
      ['E / Shift / Click', 'Hold to grapple the glowing node · release to detach'],
      ['S / ↓', 'Let rope out'],
      ['R', 'Quick restart'],
    ],
    touch: '◀ ▶ run · JUMP leaps (hold to reel in) · hold GRAPPLE to swing, let go to launch. Tapping a node also targets it.',
    pad: 'D-pad / left stick run · A jump (hold to reel in) · hold X or RT to grapple · Start pause.',
    tips: [
      'Releasing a swing keeps your speed — let go while rising to fling yourself across gaps.',
      'Falling just sends you back to your last checkpoint; the clock keeps running.',
      'The clock starts when you first move.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    const cv = shell.canvas;
    const toWorld = (e) => {
      const p = canvasPoint(e, cv, shell.W, shell.H);
      return { x: cam.x - shell.W / 2 + p.x, y: cam.y - shell.H / 2 + p.y };
    };
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { hovering = true; aim = toWorld(e); } else if (aimActive) aim = toWorld(e); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hovering = false; });
    cv.addEventListener('pointerdown', (e) => {
      if (shell.state !== 'playing' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      aim = toWorld(e); aimActive = true; hovering = e.pointerType === 'mouse';
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      shell.input.set('ptr' + e.pointerId, 'grapple', true);
    });
    const up = (e) => { shell.input.set('ptr' + e.pointerId, 'grapple', false); aimActive = false; if (e.pointerType !== 'mouse') aim = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  },
  reset() {
    world.reset();
    fx.clear(); pops.clear(); shake.mag = 0;
    cam.x = world.p.x + 80; cam.y = world.p.y - 30;
    grappleBuf = 0; flash = 0; sinceStart = 0; t = 0; aimActive = false;
    shell.hud('time', formatTime(0));
    shell.hud('cp', `0/${LEVEL.checkpoints.length}`);
  },
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); t += dt; },
  render,
});

function update(dt) {
  const i = shell.input;
  t += dt;
  if (i.pressed('grapple')) grappleBuf = 0.14;
  else if (!i.down('grapple')) grappleBuf = 0;
  const needAttach = grappleBuf > 0 && !world.rope && i.down('grapple');
  grappleBuf = Math.max(0, grappleBuf - dt);
  const useAim = aimActive || hovering ? aim : null;
  world.step(dt, {
    left: i.down('left'), right: i.down('right'),
    jumpHeld: i.down('jump'), jumpPressed: i.pressed('jump'), down: i.down('down'),
    grappleHeld: i.down('grapple'), grapplePressed: needAttach, aim: useAim,
  });
  const p = world.p;
  for (const ev of world.events) handle(ev, i.pressed('grapple'));
  if (world.rope) grappleBuf = 0;

  // camera: look ahead of motion, ease toward the target
  const tx = p.x + clamp(p.vx * 0.32, -170, 220);
  const ty = p.y - shell.H * 0.06 + clamp(p.vy * 0.08, -60, 90);
  const k = damp(world.dead > 0 ? 3 : 5.5, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * damp(4.5, dt);

  // speed trail
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 560 && world.dead <= 0 && Math.random() < 0.6) {
    fx.emit(p.x - p.vx * 0.02, p.y, 1, { speed: 20, life: 0.35, size: 4, color: world.rope ? '#2de2e6' : '#ff8ad8', drag: 3 });
  }
  if (world.rope && sp > 450) fx.emit(p.x, p.y - 4, 1, { speed: 15, life: 0.3, size: 3, color: '#d9ffff' });

  fx.update(dt); pops.update(dt); shake.update(dt);
  flash = Math.max(0, flash - dt * 2.4);
  shell.hud('time', formatTime(world.ms));
  shell.hud('cp', `${world.cp}/${LEVEL.checkpoints.length}`);
}

function handle(ev, pressedNow) {
  const sfx = shell.sfx;
  switch (ev.type) {
    case 'jump':
      sfx.play('jump');
      fx.emit(ev.x, ev.y, 6, { speed: 90, spread: Math.PI, angle: -Math.PI / 2, life: 0.35, size: 3, color: '#b9c0ff', grav: 200 });
      break;
    case 'land':
      if (ev.speed > 420) { sfx.play('land'); shake.kick(ev.speed > 800 ? 3 : 1.5); }
      fx.emit(ev.x, ev.y, 8, { speed: 130, spread: Math.PI, angle: -Math.PI / 2, life: 0.4, size: 3, color: '#b9c0ff', grav: 250 });
      break;
    case 'grapple':
      sfx.play('grapple');
      fx.emit(ev.x, ev.y, 10, { speed: 140, life: 0.4, size: 3, color: ['#2de2e6', '#ffe14d'] });
      break;
    case 'miss':
      if (pressedNow) { sfx.play('warn'); pops.add(world.p.x, world.p.y - 30, 'NO NODE IN REACH', '#ff8ad8', 12); }
      break;
    case 'release':
      sfx.play('release');
      if (ev.speed > 650) { pops.add(ev.x, ev.y - 26, 'LAUNCH!', '#ffe14d', 16); shake.kick(2); fx.emit(ev.x, ev.y, 10, { speed: 160, life: 0.4, size: 3, color: '#ffe14d' }); }
      break;
    case 'bump': sfx.play('bounce'); shake.kick(2); break;
    case 'checkpoint':
      sfx.play('checkpoint');
      pops.add(world.p.x, world.p.y - 40, `CHECKPOINT ${ev.index}/${LEVEL.checkpoints.length}`, '#5dff8f', 16);
      fx.emit(ev.x, ev.y - 30, 24, { speed: 220, life: 0.7, size: 4, color: ['#5dff8f', '#d6ffe2'], grav: 150 });
      break;
    case 'fall':
      sfx.play('hit'); shake.kick(9); flash = 1; flashColor = '#ff3cac';
      pops.add(cam.x, cam.y, 'OOPS! BACK TO CHECKPOINT', '#ff8ad8', 18);
      break;
    case 'respawn':
      fx.emit(ev.x, ev.y, 18, { speed: 200, life: 0.5, size: 4, color: ['#2de2e6', '#fff'] });
      break;
    case 'finish': {
      shell.sfx.play('victory');
      fx.emit(ev.x, ev.y - 20, 60, { speed: 360, life: 1.1, size: 5, color: ['#ffe14d', '#ff3cac', '#2de2e6', '#5dff8f'], grav: 300 });
      const ms = world.ms;
      shell.finish({
        win: true, title: 'Run Complete!', score: ms, scoreText: formatTime(ms),
        facts: { won: true, ms, falls: world.falls, grapples: world.grapples },
        counters: { grapples: world.grapples },
        milestones: [['Under 2:30', ms < 150000 ? 20 : 0], ['Under 1:30', ms < 90000 ? 30 : 0], ['No falls', world.falls === 0 ? 20 : 0]],
        summary: `Time ${formatTime(ms)}`,
        stats: [
          ['Checkpoints', `${LEVEL.checkpoints.length}/${LEVEL.checkpoints.length}`],
          ['Falls', String(world.falls)],
          ['Grapples', String(world.grapples)],
          ['Top speed', `${Math.round(world.maxSpeed)} px/s`],
        ],
      });
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- rendering
function makeWindowPattern(ctx) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#100c33'; g.fillRect(0, 0, 96, 112);
  const lit = ['#ffe14d', '#2de2e6', '#ff8ad8', '#ffb86b'];
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const h = hash(r * 7 + q * 13 + 3);
    g.fillStyle = h > 0.55 ? lit[Math.floor(h * 40) % 4] : '#1b1650';
    g.globalAlpha = h > 0.55 ? 0.85 : 1;
    g.fillRect(8 + q * 22, 10 + r * 26, 12, 14);
  }
  return ctx.createPattern(c, 'repeat');
}

function drawSky(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0627'); g.addColorStop(0.55, '#2b0c55'); g.addColorStop(1, '#7a1e6c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const x = (hash(i) * W * 1.4 - cam.x * 0.02 + W * 4) % W, y = hash(i + 50) * H * 0.55;
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(t * 0.8 + i));
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  // moon
  const mx = W * 0.78 - cam.x * 0.01, my = H * 0.2;
  ctx.fillStyle = 'rgba(255,60,172,.25)'; ctx.beginPath(); ctx.arc(mx, my, 52, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff7ac8'; ctx.beginPath(); ctx.arc(mx, my, 36, 0, TAU); ctx.fill();
}

function drawSkyline(ctx, W, H, par, color, bw, minH, maxH, base) {
  const off = cam.x * par;
  const first = Math.floor(off / bw) - 1, last = Math.ceil((off + W) / bw) + 1;
  const yb = base - (cam.y - 300) * par * 0.5;
  ctx.fillStyle = color;
  for (let i = first; i <= last; i++) {
    const h = minH + hash(i * 3.7 + par * 10) * (maxH - minH);
    ctx.fillRect(i * bw - off, yb - h, bw - 6, h + 600);
  }
}

function render(ctx, W, H) {
  if (!windowPattern) windowPattern = makeWindowPattern(ctx);
  drawSky(ctx, W, H);
  drawSkyline(ctx, W, H, 0.12, '#1a0f45', 90, 80, 230, H * 0.8);
  drawSkyline(ctx, W, H, 0.28, '#140b38', 120, 60, 200, H * 0.92);

  ctx.save();
  ctx.translate(Math.round(-cam.x + W / 2 + shake.x), Math.round(-cam.y + H / 2 + shake.y));
  const left = cam.x - W / 2 - 40, right = cam.x + W / 2 + 40, top = cam.y - H / 2 - 40, bottom = cam.y + H / 2 + 40;
  const glow = !shell.lowFx && !shell.reduced;

  // buildings
  for (let n = 0; n < LEVEL.platforms.length; n++) {
    const r = LEVEL.platforms[n];
    if (r.x > right || r.x + r.w < left) continue;
    const hh = Math.min(r.h, bottom - r.y + 10);
    if (hh <= 0) continue;
    ctx.fillStyle = windowPattern;
    ctx.fillRect(r.x, r.y, r.w, hh);
    ctx.fillStyle = 'rgba(8,5,30,.35)'; ctx.fillRect(r.x, r.y, 6, hh); ctx.fillRect(r.x + r.w - 6, r.y, 6, hh);
    ctx.fillStyle = '#2a2272'; ctx.fillRect(r.x - 3, r.y, r.w + 6, 9);
    // rooftop props (deterministic)
    const props = Math.floor(r.w / 140);
    for (let k = 0; k < props; k++) {
      const px = r.x + 30 + hash(n * 11 + k) * (r.w - 90);
      ctx.fillStyle = '#1d1758';
      if (hash(n * 5 + k) > 0.5) { ctx.fillRect(px, r.y - 16, 34, 16); ctx.fillStyle = '#2de2e6'; ctx.fillRect(px + 4, r.y - 12, 8, 3); }
      else { ctx.fillRect(px + 12, r.y - 34, 3, 34); ctx.fillStyle = '#ff3cac'; ctx.fillRect(px + 10, r.y - 38, 7, 5); }
    }
    ctx.fillStyle = '#2de2e6';
    if (glow) { ctx.shadowColor = '#2de2e6'; ctx.shadowBlur = 12; }
    ctx.fillRect(r.x - 3, r.y - 2, r.w + 6, 3);
    ctx.shadowBlur = 0;
  }

  // finish gate
  const F = LEVEL.finish;
  if (F.x < right + 100) {
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(F.x - 4, F.y - 150, 6, 150); ctx.fillRect(F.x + 90, F.y - 150, 6, 150);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111';
      ctx.fillRect(F.x - 4 + i * 8.3, F.y - 150 + j * 8, 8.3, 8);
    }
    ctx.fillStyle = 'rgba(255,225,77,.12)'; ctx.fillRect(F.x, F.y - 140, 90, 140);
    ctx.font = '800 14px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe14d';
    ctx.fillText('FINISH', F.x + 46, F.y - 160);
  }

  // checkpoints
  for (let n = 0; n < LEVEL.checkpoints.length; n++) {
    const c = LEVEL.checkpoints[n];
    if (c.x < left - 40 || c.x > right + 40) continue;
    const on = world.cp > n;
    ctx.fillStyle = '#aab';
    ctx.fillRect(c.x, c.y - 52, 3, 52);
    ctx.fillStyle = on ? '#5dff8f' : '#ff3cac';
    const wave = Math.sin(t * 5 + n) * 3;
    ctx.beginPath(); ctx.moveTo(c.x + 3, c.y - 52); ctx.lineTo(c.x + 32, c.y - 44 + wave); ctx.lineTo(c.x + 3, c.y - 34); ctx.fill();
  }

  // anchors
  const target = world.rope ? null : world.pickAnchor(aimActive || hovering ? aim : null);
  world.reachable(reach);
  for (const a of LEVEL.anchors) {
    if (a.x < left - 60 || a.x > right + 60 || a.y < top - 60 || a.y > bottom + 60) continue;
    const inReach = reach.indexOf(a) >= 0;
    const attached = world.rope && world.rope.anchor === a;
    const pulse = 1 + Math.sin(t * 4 + a.x) * 0.08;
    const col = attached ? '#ffffff' : inReach ? '#ffe14d' : '#2de2e6';
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = inReach ? 16 : 8; }
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.x, a.y, 9 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = inReach ? 1 : 0.55;
    ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (target === a) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(a.x, a.y, 19 + Math.sin(t * 8) * 2, t * 2, t * 2 + TAU * 0.85); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  lastTarget = target;

  drawRopeAndPlayer(ctx, glow);
  fx.draw(ctx);
  pops.draw(ctx);
  ctx.restore();

  if (flash > 0) { ctx.globalAlpha = flash * 0.35; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawHint(ctx, W, H);
}

function drawRopeAndPlayer(ctx, glow) {
  const p = world.p;
  if (world.dead > 0) return;
  const hx = p.x, hy = p.y - 4;
  if (world.rope) {
    const r = world.rope;
    const taut = Math.hypot(hx - r.ax, hy - r.ay) >= r.len - 4;
    ctx.lineCap = 'round';
    if (glow) { ctx.strokeStyle = 'rgba(45,226,230,.35)'; ctx.lineWidth = 8; line(ctx, hx, hy, r.ax, r.ay, taut ? 0 : 14); }
    ctx.strokeStyle = '#e8ffff'; ctx.lineWidth = 2.5;
    line(ctx, hx, hy, r.ax, r.ay, taut ? 0 : 14);
  }
  // runner
  const f = p.face;
  const air = !p.onGround;
  const phase = p.run * 0.09;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(f, 1);
  const lean = clamp(p.vx * f * 0.0004, -0.15, 0.3);
  ctx.rotate(world.rope ? clamp(Math.atan2(p.vx, 400) * 0.5, -0.5, 0.5) * f : lean);
  // legs
  ctx.strokeStyle = '#e8ffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const sw = air ? 0.9 : Math.sin(phase) * (Math.abs(p.vx) > 20 ? 1 : 0);
  ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-2 - sw * 7, 15); ctx.moveTo(2, 6); ctx.lineTo(2 + sw * 7 - (air ? 4 : 0), 15 - (air ? 3 : 0)); ctx.stroke();
  // body
  if (glow) { ctx.shadowColor = '#2de2e6'; ctx.shadowBlur = 10; }
  ctx.fillStyle = '#2de2e6';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-6, -9, 12, 17, 4) : ctx.rect(-6, -9, 12, 17); ctx.fill();
  ctx.shadowBlur = 0;
  // head + visor
  ctx.fillStyle = '#f4f0ff'; ctx.beginPath(); ctx.arc(1, -14, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff3cac'; ctx.fillRect(2, -16, 6, 3);
  // scarf
  ctx.strokeStyle = '#ff3cac'; ctx.lineWidth = 3;
  const sl = 8 + Math.min(14, Math.abs(p.vx) * 0.03);
  ctx.beginPath(); ctx.moveTo(-3, -9); ctx.quadraticCurveTo(-sl * 0.6, -9 + Math.sin(t * 14) * 3, -sl - 4, -7 + Math.sin(t * 11) * 3 + (air ? p.vy * 0.01 : 0)); ctx.stroke();
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2, sag) {
  ctx.beginPath(); ctx.moveTo(x1, y1);
  if (sag) ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2); else ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawHint(ctx, W, H) {
  let text = null;
  if (shell.state === 'playing') {
    if (!world.started) text = shell.isTouch ? 'Move or jump to start the clock' : 'Move or jump to start the clock';
    else for (const h of LEVEL.hints) if (world.p.x >= h.x && world.p.x < h.to) { text = shell.isTouch ? h.touch : h.text; break; }
  }
  if (!text) return;
  ctx.font = `700 ${W < 640 ? 12 : 14}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 28;
  const x = W / 2, y = H - 30;
  ctx.fillStyle = 'rgba(8,6,32,.72)'; ctx.fillRect(x - w / 2, y - 15, w, 30);
  ctx.strokeStyle = 'rgba(45,226,230,.6)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + .5, y - 14.5, w - 1, 29);
  ctx.fillStyle = '#e8ffff'; ctx.fillText(text, x, y + 1);
}

window.__grapple = { world, shell, cam }; // handy for debugging / automated tests
