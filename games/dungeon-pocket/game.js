// Dungeon Pocket — top-down arcade dungeon survival with readable enemy telegraphs and build-defining upgrades.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { canvasPoint } from '../../js/input.js';
import { clamp, formatScore, rand, randInt, pick, TAU, roundRectPath } from '../../js/util.js';
import { UPGRADES, upgradeById, stats, offer } from './upgrades.js';

const ID = 'dungeonPocket';
let W = 800, H = 600;
const ROOM = { x: 36, y: 74, w: 728, h: 490 };
const fx = new Particles(360);
const pops = new Popups(24);
const shake = new Shake();

const G = {
  room: 1, score: 0, kills: 0, bossKills: 0, hp: 100, lv: {}, st: stats({}), enemies: [], queue: [], spawnT: 0, shots: [], eshots: [], pickups: [], pillars: [],
  p: { x: 0, y: 0, vx: 0, vy: 0, r: 12, inv: 0, dashT: 0, dashCd: 0, dx: 0, dy: -1, fireCd: 0, aim: -Math.PI / 2, face: 1, hurtFlash: 0, regenT: 0 },
  state: 'fight', clearT: 0, hitThisRoom: false, noHitRooms: 0, fade: 0, fadeDir: 0, over: false, t: 0, flash: 0, roomsCleared: 0, door: { x: 0, y: 0 }, banner: '', bannerT: 0, dashes: 0, pendingUpgrade: false,
};
const mouse = { x: 0, y: 0, down: false, active: false, lastMove: 0 };
const sticks = { move: null, aim: null };  // virtual touch sticks { id, ox, oy, x, y }

const COSTS = { slime: 1, bat: 1.5, imp: 2, golem: 4 };

const shell = createShell({
  id: ID,
  title: 'Dungeon Pocket',
  accent: '#ffb347',
  size: (aspect) => (aspect < 0.85 ? { w: 600, h: 800 } : { w: 800, h: 600 }),
  hud: [{ id: 'room', label: 'ROOM', init: '1' }, { id: 'score', label: 'SCORE', init: '0' }, { id: 'hp', label: 'HP', init: '100' }],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    aimL: ['ArrowLeft'], aimR: ['ArrowRight'], aimU: ['ArrowUp'], aimD: ['ArrowDown'],
    fire: ['Space'], dash: ['ShiftLeft', 'ShiftRight'],
  },
  gamepad: { left: ['dpadLeft'], right: ['dpadRight'], up: ['dpadUp'], down: ['dpadDown'], fire: ['rt', 'rb', 'x'], dash: ['a', 'b', 'lb'] },
  touch: { left: [], right: [{ action: 'dash', label: 'DASH', aria: 'Dash', cls: 'act wide' }] },
  instructions: {
    goal: 'Clear room after room of dungeon creatures. Pick upgrades, build your hero and survive as deep as you can.',
    controls: [
      ['W A S D', 'Move'],
      ['Mouse / Arrow keys', 'Aim (arrow keys also fire)'],
      ['Click / Space', 'Attack (hold)'],
      ['Shift', 'Dash (brief invulnerability)'],
    ],
    touch: 'Left thumb: drag on the left half to move. Right thumb: drag on the right half to aim and shoot. Tap DASH to dodge.',
    pad: 'Left stick move · right stick aim and shoot · A / B dash.',
    tips: [
      'Red rings and lines warn you before an enemy attacks. Dash through them!',
      'Every two rooms you choose 1 of 3 upgrades: combine them to make a build.',
      'Walk through the glowing door at the top once a room is clear.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    const cv = shell.canvas;
    const pt = (e) => canvasPoint(e, cv, W, H);
    cv.addEventListener('pointermove', (e) => {
      const q = pt(e);
      if (e.pointerType === 'mouse') { mouse.x = q.x; mouse.y = q.y; mouse.active = true; mouse.lastMove = performance.now(); }
      for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === e.pointerId) { sticks[k].x = q.x; sticks[k].y = q.y; }
    });
    cv.addEventListener('pointerdown', (e) => {
      if (shell.state !== 'playing') return;
      const q = pt(e);
      if (e.pointerType === 'mouse') { if (e.button === 0) { mouse.down = true; mouse.x = q.x; mouse.y = q.y; mouse.active = true; } return; }
      const k = q.x < W / 2 ? 'move' : 'aim';
      if (!sticks[k]) { sticks[k] = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { mouse.down = false; return; }
      for (const k of ['move', 'aim']) if (sticks[k] && sticks[k].id === e.pointerId) sticks[k] = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.down = false; });
  },
  resize(w, h) {
    W = w; H = h;
    ROOM.x = 36; ROOM.y = 74; ROOM.w = W - 72; ROOM.h = H - 110;
    G.p.x = clamp(G.p.x, ROOM.x + 14, ROOM.x + ROOM.w - 14); G.p.y = clamp(G.p.y, ROOM.y + 14, ROOM.y + ROOM.h - 14);
    G.door.x = ROOM.x + ROOM.w / 2; G.door.y = ROOM.y;
    for (const e of G.enemies) { e.x = clamp(e.x, ROOM.x + e.r, ROOM.x + ROOM.w - e.r); e.y = clamp(e.y, ROOM.y + e.r, ROOM.y + ROOM.h - e.r); }
  },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); },
  render,
});

// ---------------------------------------------------------------- setup
function reset() {
  Object.assign(G, { room: 1, score: 0, kills: 0, bossKills: 0, lv: {}, over: false, t: 0, flash: 0, roomsCleared: 0, noHitRooms: 0, dashes: 0, fade: 0, fadeDir: 0, pendingUpgrade: false, bannerT: 0 });
  G.st = stats(G.lv);
  G.hp = G.st.maxHp;
  Object.assign(G.p, { vx: 0, vy: 0, inv: 0, dashT: 0, dashCd: 0, fireCd: 0, aim: -Math.PI / 2, hurtFlash: 0, regenT: 0 });
  sticks.move = sticks.aim = null; mouse.down = false;
  fx.clear(); pops.clear(); shake.mag = 0;
  startRoom();
}

function isBossRoom(n) { return n % 5 === 0; }

function startRoom() {
  const n = G.room;
  G.enemies.length = 0; G.shots.length = 0; G.eshots.length = 0; G.pickups.length = 0; G.queue.length = 0;
  G.state = 'fight'; G.hitThisRoom = false; G.spawnT = 0.6; G.clearT = 0;
  G.door.x = ROOM.x + ROOM.w / 2; G.door.y = ROOM.y;
  G.p.x = ROOM.x + ROOM.w / 2; G.p.y = ROOM.y + ROOM.h - 60; G.p.vx = G.p.vy = 0;
  // pillars (fractions of the room so they survive a resize)
  G.pillars = [];
  const count = n === 1 ? 2 : Math.min(7, 2 + Math.floor(n / 2));
  let tries = 0;
  while (G.pillars.length < count && tries++ < 200) {
    const w = rand(46, 84), h = rand(46, 84);
    const fx0 = rand(0.12, 0.88), fy0 = rand(0.18, 0.62);
    const cand = { fx: fx0, fy: fy0, w, h };
    const r = pillarRect(cand);
    if (G.pillars.some((q) => { const o = pillarRect(q); return Math.abs(o.x - r.x) < (o.w + r.w) / 2 + 90 && Math.abs(o.y - r.y) < (o.h + r.h) / 2 + 90; })) continue;
    if (Math.abs(r.x - (ROOM.x + ROOM.w / 2)) < r.w / 2 + 70 && r.y < ROOM.y + 140) continue; // keep the door clear
    G.pillars.push(cand);
  }
  // enemy roster by budget
  const types = ['slime'];
  if (n >= 2) types.push('bat');
  if (n >= 3) types.push('imp');
  if (n >= 6) types.push('golem');
  if (isBossRoom(n)) {
    G.queue.push('boss');
    const adds = Math.min(4, 1 + Math.floor(n / 5));
    for (let i = 0; i < adds; i++) G.queue.push('slime');
  } else {
    let budget = 3.5 + n * 2.1;
    while (budget > 0.9) {
      const t = pick(types.filter((x) => COSTS[x] <= budget + 0.5)) || 'slime';
      G.queue.push(t); budget -= COSTS[t];
    }
  }
  for (let i = G.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [G.queue[i], G.queue[j]] = [G.queue[j], G.queue[i]]; }
  if (isBossRoom(n)) { const bi = G.queue.indexOf('boss'); G.queue.splice(bi, 1); G.queue.unshift('boss'); }
  G.banner = isBossRoom(n) ? `ROOM ${n} · MINI-BOSS` : `ROOM ${n}`; G.bannerT = 1.8;
  hud();
}

const pillarRect = (p) => ({ x: ROOM.x + p.fx * ROOM.w, y: ROOM.y + p.fy * ROOM.h, w: p.w, h: p.h });
function pillarRects() { return G.pillars.map(pillarRect); }

function hud() {
  shell.hud('room', String(G.room));
  shell.hud('score', formatScore(G.score));
  shell.hud('hp', `${Math.max(0, Math.ceil(G.hp))}/${G.st.maxHp}`);
}

// ---------------------------------------------------------------- enemies
const scaleHp = () => 1 + 0.07 * (G.room - 1);
const scaleSpd = () => Math.min(1.45, 1 + 0.018 * (G.room - 1));

function makeEnemy(type, x, y) {
  const hp = scaleHp(), sp = scaleSpd();
  const base = {
    slime: { r: 14, hp: 30, spd: 82, pts: 10, dmg: 10 },
    bat: { r: 11, hp: 16, spd: 120, pts: 15, dmg: 12 },
    imp: { r: 12, hp: 26, spd: 85, pts: 25, dmg: 10 },
    golem: { r: 24, hp: 130, spd: 52, pts: 50, dmg: 15 },
    boss: { r: 36, hp: 420 + 140 * (G.room / 5 - 1), spd: 70, pts: 300, dmg: 18 },
  }[type];
  return { type, x, y, vx: 0, vy: 0, r: base.r, hp: base.hp * hp, max: base.hp * hp, spd: base.spd * sp, pts: base.pts, dmg: base.dmg, spawn: 0.9, state: 'idle', st: rand(0.6, 1.6), dirx: 0, diry: 0, flash: 0, hitCd: 0, kx: 0, ky: 0, phase: 0, summoned: false, wob: rand(TAU) };
}

function spawnPoint(r) {
  for (let i = 0; i < 40; i++) {
    const x = rand(ROOM.x + r + 10, ROOM.x + ROOM.w - r - 10), y = rand(ROOM.y + r + 20, ROOM.y + ROOM.h * 0.7);
    if (Math.hypot(x - G.p.x, y - G.p.y) < 230) continue;
    if (pillarRects().some((q) => x > q.x - r - 6 && x < q.x + q.w + r + 6 && y > q.y - r - 6 && y < q.y + q.h + r + 6)) continue;
    return { x, y };
  }
  return { x: ROOM.x + ROOM.w / 2, y: ROOM.y + 80 };
}

function spawnTick(dt) {
  if (!G.queue.length) return;
  G.spawnT -= dt;
  const cap = 5 + Math.floor(G.room / 3);
  const alive = G.enemies.length;
  if (G.spawnT <= 0 && alive < Math.min(cap, 10)) {
    const t = G.queue.shift();
    const e = makeEnemy(t, 0, 0);
    const p = spawnPoint(e.r);
    e.x = p.x; e.y = p.y;
    G.enemies.push(e);
    G.spawnT = t === 'boss' ? 1.2 : 0.55;
    fx.emit(e.x, e.y, 10, { speed: 90, life: 0.5, size: 4, color: ['#8b5cff', '#fff'] });
  }
}

function moveCircle(o, dx, dy) {
  o.x += dx; o.y += dy;
  o.x = clamp(o.x, ROOM.x + o.r, ROOM.x + ROOM.w - o.r); o.y = clamp(o.y, ROOM.y + o.r, ROOM.y + ROOM.h - o.r);
  for (const q of pillarRects()) {
    const nx = clamp(o.x, q.x, q.x + q.w), ny = clamp(o.y, q.y, q.y + q.h);
    const ddx = o.x - nx, ddy = o.y - ny, d2 = ddx * ddx + ddy * ddy;
    if (d2 < o.r * o.r) {
      if (d2 === 0) { o.y = q.y - o.r; continue; }
      const d = Math.sqrt(d2);
      o.x += ddx / d * (o.r - d); o.y += ddy / d * (o.r - d);
    }
  }
}

function updateEnemy(e, dt) {
  const p = G.p;
  e.flash = Math.max(0, e.flash - dt * 6);
  e.hitCd = Math.max(0, e.hitCd - dt);
  e.wob += dt * 6;
  if (e.spawn > 0) { e.spawn -= dt; return; }
  // knockback decay
  if (Math.abs(e.kx) + Math.abs(e.ky) > 1) { moveCircle(e, e.kx * dt, e.ky * dt); const f = Math.exp(-9 * dt); e.kx *= f; e.ky *= f; }
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  switch (e.type) {
    case 'slime': moveCircle(e, ux * e.spd * dt, uy * e.spd * dt); break;
    case 'bat': {
      e.st -= dt;
      if (e.state === 'idle') {
        const a = Math.atan2(dy, dx) + Math.PI / 2 * Math.sin(e.wob * 0.4);
        moveCircle(e, Math.cos(a) * e.spd * dt, Math.sin(a) * e.spd * dt + Math.sin(e.wob) * 20 * dt);
        if (e.st <= 0 && d < 330) { e.state = 'wind'; e.st = 0.55; e.dirx = ux; e.diry = uy; }
      } else if (e.state === 'wind') {
        e.dirx = ux; e.diry = uy; // keep tracking while winding up, lock on release
        if (e.st <= 0) { e.state = 'dash'; e.st = 0.5; }
      } else if (e.state === 'dash') {
        moveCircle(e, e.dirx * 380 * dt, e.diry * 380 * dt);
        if (e.st <= 0) { e.state = 'idle'; e.st = rand(1.4, 2.4); }
      }
      break;
    }
    case 'imp': {
      e.st -= dt;
      const want = 230;
      if (e.state === 'idle') {
        const m = d < want - 40 ? -1 : d > want + 60 ? 1 : 0;
        moveCircle(e, (ux * m + -uy * 0.5 * Math.sin(e.wob * 0.3)) * e.spd * dt, (uy * m + ux * 0.5 * Math.sin(e.wob * 0.3)) * e.spd * dt);
        if (e.st <= 0) { e.state = 'wind'; e.st = 0.75; }
      } else if (e.state === 'wind') {
        e.dirx = ux; e.diry = uy;
        if (e.st <= 0) {
          const fan = G.room >= 8 ? [-0.25, 0, 0.25] : [0];
          for (const da of fan) { const a = Math.atan2(uy, ux) + da; G.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 215, vy: Math.sin(a) * 215, r: 7, dmg: e.dmg, life: 4 }); }
          shell.sfx.play('shoot');
          e.state = 'idle'; e.st = rand(1.8, 2.6);
        }
      }
      break;
    }
    case 'golem': {
      e.st -= dt;
      if (e.state === 'idle') {
        moveCircle(e, ux * e.spd * dt, uy * e.spd * dt);
        if (d < 120 && e.st <= 0) { e.state = 'wind'; e.st = 0.95; }
      } else if (e.state === 'wind') {
        if (e.st <= 0) { // slam
          shake.kick(7); shell.sfx.play('explosion');
          fx.emit(e.x, e.y, 24, { speed: 260, life: 0.6, size: 5, color: ['#9aa8d8', '#fff'] });
          if (Math.hypot(p.x - e.x, p.y - e.y) < 95 + p.r) hurt(e.dmg + 5, e.x, e.y);
          e.state = 'idle'; e.st = 2.2;
        }
      }
      break;
    }
    case 'boss': updateBoss(e, dt, ux, uy, d); break;
    default: break;
  }
  // contact damage
  const dash = e.type === 'bat' && e.state === 'dash';
  if (d < e.r + p.r && e.hitCd <= 0 && (e.type !== 'bat' || dash || e.spawn <= 0) && !(e.type === 'golem' && e.state === 'wind')) {
    e.hitCd = 0.8;
    hurt(dash ? e.dmg + 4 : e.dmg, e.x, e.y);
  }
}

function updateBoss(e, dt, ux, uy, d) {
  e.st -= dt;
  const hpf = e.hp / e.max;
  if (hpf < 0.5 && !e.summoned) { e.summoned = true; summon(e, 2); }
  if (e.state === 'idle') {
    moveCircle(e, ux * e.spd * dt, uy * e.spd * dt);
    if (e.st <= 0) { const choose = e.phase++ % 3; e.state = choose === 2 ? 'chargeWind' : 'burstWind'; e.st = choose === 2 ? 0.85 : 0.95; e.dirx = ux; e.diry = uy; }
  } else if (e.state === 'burstWind') {
    if (e.st <= 0) {
      const n = hpf < 0.5 ? 18 : 12, off = rand(TAU);
      for (let i = 0; i < n; i++) { const a = off + i / n * TAU; G.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, r: 8, dmg: 12, life: 5 }); }
      shake.kick(5); shell.sfx.play('explosion');
      e.state = 'idle'; e.st = 1.6;
    }
  } else if (e.state === 'chargeWind') {
    e.dirx = ux; e.diry = uy;
    if (e.st <= 0) { e.state = 'charge'; e.st = 0.6; }
  } else if (e.state === 'charge') {
    moveCircle(e, e.dirx * 430 * dt, e.diry * 430 * dt);
    if (e.st <= 0) { e.state = 'idle'; e.st = 1.4; shake.kick(3); }
  }
}

function summon(e, n) {
  for (let i = 0; i < n; i++) { const s = makeEnemy('slime', e.x + rand(-60, 60), e.y + rand(-60, 60)); G.enemies.push(s); }
  pops.add(e.x, e.y - 50, 'REINFORCEMENTS!', '#ff8ad8', 15);
}

// ---------------------------------------------------------------- combat
function hurt(dmg, sx, sy) {
  const p = G.p;
  if (p.inv > 0 || G.state === 'trans' || G.over) return;
  const d = Math.max(1, Math.round(dmg * G.st.dr));
  G.hp -= d; G.hitThisRoom = true;
  p.inv = 0.75; p.hurtFlash = 1; G.flash = 1;
  const ang = Math.atan2(p.y - sy, p.x - sx);
  p.vx = Math.cos(ang) * 260; p.vy = Math.sin(ang) * 260;
  shake.kick(6); shell.hitStop(0.06); shell.sfx.play('hit');
  pops.add(p.x, p.y - 20, `-${d}`, '#ff5c7a', 16);
  fx.emit(p.x, p.y, 14, { speed: 200, life: 0.5, size: 4, color: ['#ff5c7a', '#fff'] });
  hud();
  if (G.hp <= 0) die();
}

function damageEnemy(e, dmg, crit, kx, ky) {
  if (e.spawn > 0) return false;
  e.hp -= dmg; e.flash = 1;
  const resist = e.type === 'golem' ? 0.25 : e.type === 'boss' ? 0.1 : 1;
  e.kx += kx * 120 * resist; e.ky += ky * 120 * resist;
  pops.add(e.x + rand(-6, 6), e.y - e.r - 6, String(Math.round(dmg)), crit ? '#ffe14d' : '#fff', crit ? 17 : 12);
  fx.emit(e.x, e.y, crit ? 10 : 5, { speed: 150, life: 0.35, size: 3, color: crit ? ['#ffe14d', '#fff'] : ['#fff', '#ffb347'] });
  shell.sfx.play(crit ? 'brickStrong' : 'brick');
  if (e.hp <= 0) { killEnemy(e); return true; }
  return false;
}

function killEnemy(e) {
  const i = G.enemies.indexOf(e);
  if (i < 0) return;
  G.enemies.splice(i, 1);
  G.kills++;
  G.score += e.pts;
  if (e.type === 'boss') { G.bossKills++; shell.facts({ boss: G.bossKills }); shake.kick(10); shell.hitStop(0.12); }
  shell.sfx.play(e.type === 'boss' || e.type === 'golem' ? 'explosion' : 'smallBoom');
  fx.emit(e.x, e.y, e.type === 'boss' ? 50 : 16, { speed: e.type === 'boss' ? 320 : 190, life: 0.7, size: 5, color: colorOf(e.type) });
  pops.add(e.x, e.y - 8, `+${e.pts}`, '#ffe14d', 13);
  if (G.st.leech) { G.hp = Math.min(G.st.maxHp, G.hp + G.st.leech); }
  if (Math.random() < (e.type === 'boss' ? 1 : 0.1)) G.pickups.push({ x: e.x, y: e.y, kind: 'heart', t: 0 });
  hud();
}

const colorOf = (t) => ({ slime: ['#5dff8f', '#d6ffe2'], bat: ['#ff9a3d', '#ffe0b3'], imp: ['#b07bff', '#e6d6ff'], golem: ['#9aa8d8', '#fff'], boss: ['#ff5f9a', '#ffe14d', '#fff'] }[t]);

function nearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of G.enemies) { if (e.spawn > 0) continue; const d = Math.hypot(e.x - G.p.x, e.y - G.p.y); if (d < bd) { bd = d; best = e; } }
  return best;
}

function firePlayer(angle) {
  const p = G.p, s = G.st;
  p.fireCd = s.fireDelay;
  const n = s.shots;
  for (let i = 0; i < n; i++) {
    const a = angle + (n > 1 ? (i - (n - 1) / 2) * 0.2 : 0);
    const crit = Math.random() < s.crit;
    G.shots.push({ x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * s.shotSpeed, vy: Math.sin(a) * s.shotSpeed, life: s.range, dmg: s.dmg * (crit ? 2 : 1), crit, pierce: s.pierce, bounce: s.bounce, hit: [] });
  }
  fx.emit(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, 3, { angle, spread: 0.6, speed: 120, life: 0.15, size: 3, color: ['#ffe14d', '#fff'] });
  shell.sfx.play('shoot');
}

// ---------------------------------------------------------------- update
function readMove() {
  const i = shell.input;
  let mx = i.axis('left', 'right'), my = i.axis('up', 'down');
  const s = sticks.move;
  if (s) { mx += clamp((s.x - s.ox) / 50, -1, 1); my += clamp((s.y - s.oy) / 50, -1, 1); }
  const pad = shell.gamepad.state();
  if (pad.connected) { mx += pad.lx; my += pad.ly; }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  return { mx, my };
}

function readAim() {
  const i = shell.input, p = G.p;
  // returns { angle, firing } or null
  const s = sticks.aim;
  if (s) { const dx = s.x - s.ox, dy = s.y - s.oy; if (Math.hypot(dx, dy) > 12) return { angle: Math.atan2(dy, dx), firing: true }; }
  const pad = shell.gamepad.state();
  if (pad.connected && Math.hypot(pad.rx, pad.ry) > 0.3) return { angle: Math.atan2(pad.ry, pad.rx), firing: true };
  const ax = i.axis('aimL', 'aimR'), ay = i.axis('aimU', 'aimD');
  if (ax || ay) return { angle: Math.atan2(ay, ax), firing: true };
  const mouseOn = mouse.active && performance.now() - mouse.lastMove < 4000;
  const fire = i.down('fire') || mouse.down;
  if (mouseOn) return { angle: Math.atan2(mouse.y - p.y, mouse.x - p.x), firing: fire, mouse: true };
  if (fire) { const e = nearestEnemy(); return { angle: e ? Math.atan2(e.y - p.y, e.x - p.x) : p.aim, firing: true }; }
  return null;
}

function update(dt) {
  const i = shell.input, p = G.p;
  G.t += dt;
  if (G.bannerT > 0) G.bannerT -= dt;
  G.flash = Math.max(0, G.flash - dt * 3);
  p.inv = Math.max(0, p.inv - dt); p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3);
  if (G.fadeDir) {
    G.fade = clamp(G.fade + G.fadeDir * dt * 4, 0, 1);
    if (G.fadeDir > 0 && G.fade >= 1) { G.fadeDir = -1; nextRoomNow(); }
    else if (G.fadeDir < 0 && G.fade <= 0) { G.fadeDir = 0; G.state = 'fight'; }
  }
  if (G.state === 'trans' && !G.fadeDir) G.state = 'fight';

  // ---- movement + dash
  const mv = readMove();
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (i.pressed('dash') && p.dashCd <= 0 && p.dashT <= 0 && G.state !== 'trans') {
    const l = Math.hypot(mv.mx, mv.my);
    const dx = l > 0.1 ? mv.mx / l : p.dx, dy = l > 0.1 ? mv.my / l : p.dy;
    p.dx = dx; p.dy = dy; p.dashT = 0.16; p.dashCd = G.st.dashCd; p.inv = Math.max(p.inv, 0.26); G.dashes++;
    shell.sfx.play('dash');
    fx.emit(p.x, p.y, 12, { speed: 160, life: 0.35, size: 4, color: ['#ffb347', '#fff'] });
    if (G.st.shock) {
      const dmg = 8 + G.st.shock * 6;
      for (const e of G.enemies.slice()) if (Math.hypot(e.x - p.x, e.y - p.y) < 80 + G.st.shock * 12) damageEnemy(e, dmg, false, (e.x - p.x) / 60, (e.y - p.y) / 60);
      fx.emit(p.x, p.y, 20, { speed: 280, life: 0.4, size: 5, color: ['#8b5cff', '#fff'] });
    }
  }
  if (p.dashT > 0) { p.dashT -= dt; moveCircle(p, p.dx * 640 * dt, p.dy * 640 * dt); if (Math.random() < 0.8) fx.emit(p.x, p.y, 1, { speed: 20, life: 0.3, size: 8, color: 'rgba(255,179,71,.6)', drag: 4 }); }
  else {
    const sp = G.st.speed;
    p.vx *= Math.exp(-10 * dt); p.vy *= Math.exp(-10 * dt);
    moveCircle(p, (mv.mx * sp + p.vx) * dt, (mv.my * sp + p.vy) * dt);
    if (Math.hypot(mv.mx, mv.my) > 0.1) { p.dx = mv.mx; p.dy = mv.my; }
  }

  // ---- aim + shoot
  const aim = readAim();
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (aim) { p.aim = aim.angle; p.face = Math.cos(aim.angle) >= 0 ? 1 : -1; if (aim.firing && p.fireCd <= 0 && G.state !== 'trans') firePlayer(aim.angle); }
  if (G.st.regen) { p.regenT += dt; if (p.regenT >= 3) { p.regenT = 0; if (G.hp < G.st.maxHp) { G.hp = Math.min(G.st.maxHp, G.hp + G.st.regen); hud(); } } }

  // ---- shots
  const rects = pillarRects();
  for (let k = G.shots.length - 1; k >= 0; k--) {
    const s = G.shots[k];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let remove = s.life <= 0;
    if (!remove && (s.x < ROOM.x || s.x > ROOM.x + ROOM.w || s.y < ROOM.y || s.y > ROOM.y + ROOM.h)) {
      if (s.bounce > 0) { s.bounce--; if (s.x < ROOM.x || s.x > ROOM.x + ROOM.w) s.vx *= -1; if (s.y < ROOM.y || s.y > ROOM.y + ROOM.h) s.vy *= -1; s.x = clamp(s.x, ROOM.x, ROOM.x + ROOM.w); s.y = clamp(s.y, ROOM.y, ROOM.y + ROOM.h); fx.emit(s.x, s.y, 3, { speed: 80, life: 0.2, size: 3, color: '#fff' }); }
      else remove = true;
    }
    if (!remove) for (const q of rects) if (s.x > q.x && s.x < q.x + q.w && s.y > q.y && s.y < q.y + q.h) { remove = true; fx.emit(s.x, s.y, 3, { speed: 60, life: 0.2, size: 3, color: '#b9bff0' }); break; }
    if (!remove) {
      for (const e of G.enemies) {
        if (e.spawn > 0 || s.hit.includes(e)) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 5) {
          s.hit.push(e);
          const sp = Math.hypot(s.vx, s.vy) || 1;
          damageEnemy(e, s.dmg, s.crit, s.vx / sp, s.vy / sp);
          if (s.pierce > 0) s.pierce--; else { remove = true; break; }
        }
      }
    }
    if (remove) { G.shots[k] = G.shots[G.shots.length - 1]; G.shots.pop(); }
  }
  for (let k = G.eshots.length - 1; k >= 0; k--) {
    const s = G.eshots[k];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let remove = s.life <= 0 || s.x < ROOM.x - 10 || s.x > ROOM.x + ROOM.w + 10 || s.y < ROOM.y - 10 || s.y > ROOM.y + ROOM.h + 10;
    if (!remove) for (const q of rects) if (s.x > q.x && s.x < q.x + q.w && s.y > q.y && s.y < q.y + q.h) { remove = true; break; }
    if (!remove && Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r - 2) { hurt(s.dmg, s.x - s.vx, s.y - s.vy); remove = true; }
    if (remove) { G.eshots[k] = G.eshots[G.eshots.length - 1]; G.eshots.pop(); }
  }

  // ---- enemies
  if (G.state === 'fight') spawnTick(dt);
  for (const e of G.enemies) updateEnemy(e, dt);
  // separation
  for (let a = 0; a < G.enemies.length; a++) for (let b = a + 1; b < G.enemies.length; b++) {
    const A = G.enemies[a], B = G.enemies[b];
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, min = A.r + B.r - 2;
    if (d < min) { const push = (min - d) / 2; A.x -= dx / d * push; A.y -= dy / d * push; B.x += dx / d * push; B.y += dy / d * push; }
  }
  // ---- pickups
  for (let k = G.pickups.length - 1; k >= 0; k--) {
    const u = G.pickups[k]; u.t += dt;
    if (Math.hypot(u.x - p.x, u.y - p.y) < 22) { G.hp = Math.min(G.st.maxHp, G.hp + 15); shell.sfx.play('pickup'); pops.add(u.x, u.y - 14, '+15', '#5dff8f', 14); G.pickups.splice(k, 1); hud(); }
  }

  // ---- room clear / door
  if (G.state === 'fight' && !G.queue.length && !G.enemies.length && !G.over) roomCleared();
  if (G.state === 'clear' && !G.fadeDir && Math.hypot(p.x - G.door.x, p.y - (G.door.y + 16)) < 38) enterDoor();

  fx.update(dt); pops.update(dt); shake.update(dt);
}

function roomCleared() {
  G.state = 'clear';
  G.roomsCleared++;
  const clean = !G.hitThisRoom;
  const bonus = 50 * G.room + (clean ? 100 : 0);
  G.score += bonus;
  if (clean && G.room >= 5) { G.noHitRooms++; shell.facts({ noHitRoom: true, rooms: G.roomsCleared }); }
  G.hp = Math.min(G.st.maxHp, G.hp + Math.round(G.st.maxHp * 0.08));
  pops.add(W / 2, ROOM.y + ROOM.h / 2 - 30, clean ? `ROOM CLEAR  +${bonus}  FLAWLESS!` : `ROOM CLEAR  +${bonus}`, clean ? '#ffe14d' : '#fff', 20);
  shell.sfx.play('checkpoint');
  fx.emit(G.door.x, G.door.y + 20, 24, { speed: 160, life: 0.8, size: 4, color: ['#ffb347', '#fff'] });
  G.pendingUpgrade = G.room % 2 === 0 || isBossRoom(G.room);
  if (G.roomsCleared === 10 || G.roomsCleared === 20 || G.roomsCleared === 5) shell.facts({ rooms: G.roomsCleared, upgrades: upgradeCount() });
  hud();
}

const upgradeCount = () => Object.values(G.lv).reduce((a, b) => a + b, 0);

function enterDoor() {
  if (G.pendingUpgrade) {
    const picks = offer(G.lv, 3);
    if (picks.length) { G.state = 'trans'; showUpgrades(picks); return; }
  }
  beginTransition();
}

function beginTransition() { G.state = 'trans'; G.fadeDir = 1; }
function nextRoomNow() { G.room++; startRoom(); G.state = 'trans'; }

function showUpgrades(picks) {
  const cards = picks.map((u) => `<button type="button" class="dp-card" data-modal="pick:${u.id}"><span class="dp-ic" aria-hidden="true">${u.icon}</span><b>${u.name}</b><small>${u.desc}</small>${(G.lv[u.id] || 0) ? `<em>Level ${(G.lv[u.id] || 0) + 1}</em>` : '<em>New</em>'}</button>`).join('');
  const build = Object.entries(G.lv).map(([id, n]) => `<span class="dp-chip" title="${upgradeById(id).name}">${upgradeById(id).icon}${n > 1 ? `×${n}` : ''}</span>`).join('');
  shell.modal(`<h2 id="g-panel-title">CHOOSE AN UPGRADE</h2><p class="p-sub">Room ${G.room} cleared</p><div class="dp-cards">${cards}</div>${build ? `<div class="dp-build"><span>Your build</span>${build}</div>` : ''}`, (act) => {
    if (act.startsWith('pick:')) {
      const id = act.slice(5);
      G.lv[id] = (G.lv[id] || 0) + 1;
      const old = G.st.maxHp;
      G.st = stats(G.lv);
      if (G.st.maxHp > old) G.hp += G.st.maxHp - old;
      if (id === 'vital') G.hp = Math.min(G.st.maxHp, G.hp + 25);
      G.pendingUpgrade = false;
      shell.sfx.play('powerup');
      shell.closeModal();
      shell.facts({ upgrades: upgradeCount(), rooms: G.roomsCleared });
      hud();
      beginTransition();
    }
  });
}

function die() {
  G.over = true;
  fx.emit(G.p.x, G.p.y, 50, { speed: 320, life: 0.9, size: 6, color: ['#ffb347', '#ff5c7a', '#fff'] });
  shake.kick(12);
  const rooms = G.roomsCleared;
  shell.finish({
    win: false, title: 'You Fell', subtitle: `Reached room ${G.room}`, score: G.score,
    extras: { highestRoom: G.room },
    facts: { rooms, kills: G.kills, boss: G.bossKills, noHitRoom: G.noHitRooms > 0, upgrades: upgradeCount() },
    counters: { kills: G.kills },
    milestones: [['Rooms cleared', Math.min(70, rooms * 7)], ['Enemies defeated', Math.min(30, Math.floor(G.kills / 5) * 2)], ['Bosses', G.bossKills * 15]],
    summary: `Score ${formatScore(G.score)} · Room ${G.room}`,
    stats: [['Rooms cleared', String(rooms)], ['Enemies defeated', String(G.kills)], ['Mini-bosses', String(G.bossKills)], ['Upgrades', String(upgradeCount())]],
  });
}

// ---------------------------------------------------------------- render
function render(ctx) {
  const glow = !shell.lowFx && !shell.reduced;
  ctx.fillStyle = '#0d0a1f'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shake.x, shake.y);
  // floor
  const tile = 48;
  for (let y = 0; y < Math.ceil(ROOM.h / tile); y++) for (let x = 0; x < Math.ceil(ROOM.w / tile); x++) {
    ctx.fillStyle = (x + y) % 2 ? '#1c1538' : '#191232';
    ctx.fillRect(ROOM.x + x * tile, ROOM.y + y * tile, Math.min(tile, ROOM.w - x * tile), Math.min(tile, ROOM.h - y * tile));
  }
  // walls
  ctx.strokeStyle = '#4a3a86'; ctx.lineWidth = 10; ctx.strokeRect(ROOM.x - 5, ROOM.y - 5, ROOM.w + 10, ROOM.h + 10);
  ctx.strokeStyle = '#2b2060'; ctx.lineWidth = 4; ctx.strokeRect(ROOM.x - 10, ROOM.y - 10, ROOM.w + 20, ROOM.h + 20);
  for (const tx of [ROOM.x + 60, ROOM.x + ROOM.w - 60, ROOM.x + ROOM.w / 4, ROOM.x + ROOM.w * 0.75]) { // torches
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(tx, ROOM.y - 8, 4 + Math.sin(G.t * 9 + tx) * 1.2, 0, TAU); ctx.fill();
    if (glow) { ctx.fillStyle = 'rgba(255,179,71,.12)'; ctx.beginPath(); ctx.arc(tx, ROOM.y + 4, 40, 0, TAU); ctx.fill(); }
  }
  // door
  const open = G.state === 'clear' || G.fadeDir;
  ctx.fillStyle = open ? '#ffb347' : '#3a2f6a';
  ctx.fillRect(G.door.x - 32, G.door.y - 14, 64, 16);
  if (open) { if (glow) { ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 20; } ctx.fillStyle = 'rgba(255,224,160,.9)'; ctx.fillRect(G.door.x - 24, G.door.y - 10, 48, 12); ctx.shadowBlur = 0; ctx.fillStyle = '#ffe9b8'; ctx.font = '800 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('▲ NEXT ROOM', G.door.x, G.door.y + 30 + Math.sin(G.t * 5) * 3); }
  // pillars
  for (const q of pillarRects()) {
    ctx.fillStyle = '#2d2457'; ctx.fillRect(q.x, q.y, q.w, q.h);
    ctx.fillStyle = '#4a3d86'; ctx.fillRect(q.x, q.y, q.w, 8); ctx.fillStyle = '#1d1640'; ctx.fillRect(q.x, q.y + q.h - 8, q.w, 8);
    ctx.strokeStyle = '#5b4ea6'; ctx.lineWidth = 2; ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
  }
  // pickups
  for (const u of G.pickups) { ctx.fillStyle = '#ff5c7a'; ctx.font = '800 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♥', u.x, u.y + 6 + Math.sin(u.t * 5) * 2); }
  // telegraphs under enemies
  for (const e of G.enemies) drawTelegraph(ctx, e);
  for (const e of G.enemies) drawEnemy(ctx, e, glow);
  drawPlayer(ctx, glow);
  // shots
  for (const s of G.shots) {
    if (glow) { ctx.shadowColor = s.crit ? '#ffe14d' : '#ffb347'; ctx.shadowBlur = 10; }
    ctx.fillStyle = s.crit ? '#ffe14d' : '#ffd08a'; ctx.beginPath(); ctx.arc(s.x, s.y, s.crit ? 6 : 5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  }
  for (const s of G.eshots) { ctx.fillStyle = 'rgba(255,60,120,.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff5c9a'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.4, 0, TAU); ctx.fill(); }
  fx.draw(ctx); pops.draw(ctx);
  ctx.restore();

  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.25; ctx.fillStyle = '#ff3c5a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawHud(ctx);
  drawSticks(ctx);
  if (G.fade > 0) { ctx.globalAlpha = G.fade; ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

function drawTelegraph(ctx, e) {
  if (e.spawn > 0) return;
  const p = G.p;
  ctx.save();
  if (e.type === 'bat' && e.state === 'wind') {
    const k = 1 - e.st / 0.55;
    ctx.strokeStyle = `rgba(255,90,60,${0.3 + 0.5 * k})`; ctx.lineWidth = 3 + k * 4; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirx * 200, e.y + e.diry * 200); ctx.stroke();
  } else if (e.type === 'imp' && e.state === 'wind') {
    const k = 1 - e.st / 0.75;
    ctx.strokeStyle = `rgba(190,120,255,${0.25 + 0.6 * k})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirx * 360, e.y + e.diry * 360); ctx.stroke();
  } else if (e.type === 'golem' && e.state === 'wind') {
    const k = 1 - e.st / 0.95;
    ctx.fillStyle = `rgba(255,70,70,${0.12 + 0.18 * k})`; ctx.beginPath(); ctx.arc(e.x, e.y, 95, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,90,90,${0.5 + 0.4 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 95 * k, 0, TAU); ctx.stroke();
  } else if (e.type === 'boss' && e.state === 'burstWind') {
    const k = 1 - e.st / 0.95;
    ctx.strokeStyle = `rgba(255,95,154,${0.3 + 0.6 * k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, 60 + 80 * k, 0, TAU); ctx.stroke();
  } else if (e.type === 'boss' && e.state === 'chargeWind') {
    const k = 1 - e.st / 0.85;
    ctx.strokeStyle = `rgba(255,70,70,${0.3 + 0.6 * k})`; ctx.lineWidth = 10 + k * 8; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirx * 380, e.y + e.diry * 380); ctx.stroke();
  }
  void p;
  ctx.restore();
}

function drawEnemy(ctx, e, glow) {
  const sp = e.spawn > 0;
  ctx.save(); ctx.translate(e.x, e.y);
  if (sp) { ctx.globalAlpha = 0.35 + 0.4 * (1 - e.spawn / 0.9); ctx.strokeStyle = '#b07bff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, e.r + 10 * e.spawn / 0.9, 0, TAU); ctx.stroke(); }
  const flash = e.flash > 0;
  const wind = e.state === 'wind' || e.state === 'burstWind' || e.state === 'chargeWind';
  if (wind) ctx.translate(Math.sin(G.t * 60) * 1.6, 0);
  const body = (c) => (flash ? '#fff' : c);
  if (e.type === 'slime') {
    const sq = 1 + Math.sin(e.wob) * 0.08;
    ctx.fillStyle = body('#3fd47a'); ctx.beginPath(); ctx.ellipse(0, 2, e.r * (2 - sq) * 0.95, e.r * sq * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#8dffb3'; ctx.beginPath(); ctx.ellipse(-4, -4, 4, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a2a18'; ctx.fillRect(-6, -2, 3, 5); ctx.fillRect(3, -2, 3, 5);
  } else if (e.type === 'bat') {
    const f = Math.sin(e.wob * 2.2);
    ctx.fillStyle = body(e.state === 'dash' ? '#ff6a2e' : '#ff9a3d');
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-e.r * 1.7, -6 - f * 8); ctx.lineTo(-e.r * 0.8, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(e.r * 1.7, -6 - f * 8); ctx.lineTo(e.r * 0.8, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(2, -3, 3, 3);
    if (e.state === 'wind') { ctx.fillStyle = '#ff3c3c'; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -e.r - 6); }
  } else if (e.type === 'imp') {
    ctx.fillStyle = body('#9a62f0'); ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = body('#6a3cc0'); ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-12, -18); ctx.lineTo(-3, -11); ctx.fill(); ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(12, -18); ctx.lineTo(3, -11); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(-6, -3, 4, 4); ctx.fillRect(2, -3, 4, 4);
    if (e.state === 'wind') { if (glow) { ctx.shadowColor = '#c78bff'; ctx.shadowBlur = 16; } ctx.fillStyle = '#e6d6ff'; ctx.beginPath(); ctx.arc(e.dirx * 14, e.diry * 14, 5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
  } else if (e.type === 'golem') {
    ctx.fillStyle = body('#7f8fc8'); roundRectPath(ctx, -e.r, -e.r, e.r * 2, e.r * 2, 8); ctx.fill();
    ctx.fillStyle = body('#5a6aa8'); ctx.fillRect(-e.r, e.r - 10, e.r * 2, 10); ctx.fillRect(-e.r - 6, -8, 8, 22); ctx.fillRect(e.r - 2, -8, 8, 22);
    ctx.fillStyle = wind ? '#ff4444' : '#ffe14d'; ctx.fillRect(-10, -8, 6, 6); ctx.fillRect(4, -8, 6, 6);
  } else if (e.type === 'boss') {
    if (glow) { ctx.shadowColor = '#ff5f9a'; ctx.shadowBlur = 24; }
    ctx.fillStyle = body('#ff5f9a');
    ctx.beginPath(); ctx.moveTo(0, -e.r * 1.25); ctx.lineTo(e.r * 0.9, -e.r * 0.2); ctx.lineTo(e.r * 0.7, e.r * 0.9); ctx.lineTo(-e.r * 0.7, e.r * 0.9); ctx.lineTo(-e.r * 0.9, -e.r * 0.2); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = body('#c23b78'); ctx.beginPath(); ctx.moveTo(0, -e.r * 1.25); ctx.lineTo(e.r * 0.3, -e.r * 0.2); ctx.lineTo(0, e.r * 0.9); ctx.lineTo(-e.r * 0.3, -e.r * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(-14, -6, 9, 9); ctx.fillRect(5, -6, 9, 9);
    ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(-14, -e.r * 1.1); ctx.lineTo(-8, -e.r * 1.5); ctx.lineTo(0, -e.r * 1.2); ctx.lineTo(8, -e.r * 1.5); ctx.lineTo(14, -e.r * 1.1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (!sp && e.hp < e.max) { // health bar
    const w = Math.max(24, e.r * 2);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
    ctx.fillStyle = e.type === 'boss' ? '#ff5f9a' : '#5dff8f'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.max, 0, 1), 4);
  }
}

function drawPlayer(ctx, glow) {
  const p = G.p;
  if (p.inv > 0 && Math.floor(p.inv * 24) % 2 && p.dashT <= 0) return;
  ctx.save(); ctx.translate(p.x, p.y);
  if (p.dashT > 0) ctx.globalAlpha = 0.7;
  // cloak + body
  if (glow) { ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 12; }
  ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(-11, 12); ctx.lineTo(0, -12); ctx.lineTo(11, 12); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe0c0'; ctx.beginPath(); ctx.arc(0, -8, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7a3cc0'; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(0, -26); ctx.lineTo(9, -10); ctx.closePath(); ctx.fill(); // hat
  ctx.fillStyle = '#2a1a22'; ctx.fillRect(-4 + p.face * 1, -9, 2, 3); ctx.fillRect(2 + p.face * 1, -9, 2, 3);
  // staff pointing at aim
  ctx.rotate(p.aim);
  ctx.strokeStyle = '#a9743a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, 0); ctx.stroke();
  ctx.fillStyle = '#ffd08a'; ctx.beginPath(); ctx.arc(22, 0, 4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawHud(ctx) {
  const bw = Math.min(260, W * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(14, 12, bw + 4, 18);
  ctx.fillStyle = '#ff5c7a'; ctx.fillRect(16, 14, bw * clamp(G.hp / G.st.maxHp, 0, 1), 14);
  ctx.fillStyle = '#fff'; ctx.font = '800 11px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`❤ ${Math.max(0, Math.ceil(G.hp))} / ${G.st.maxHp}`, 22, 22);
  // dash meter
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(14, 34, 104, 10);
  ctx.fillStyle = G.p.dashCd <= 0 ? '#2de2e6' : '#5a67c9'; ctx.fillRect(16, 36, 100 * (G.p.dashCd <= 0 ? 1 : 1 - G.p.dashCd / G.st.dashCd), 6);
  ctx.fillStyle = '#b9bff0'; ctx.font = '700 9px "Trebuchet MS", sans-serif'; ctx.fillText('DASH', 124, 40);
  // build icons
  let x = 14;
  for (const [id, n] of Object.entries(G.lv)) { if (x > W - 40) break; ctx.font = '14px sans-serif'; ctx.fillText(upgradeById(id).icon, x, 56); if (n > 1) { ctx.font = '700 9px sans-serif'; ctx.fillStyle = '#ffe14d'; ctx.fillText(`×${n}`, x + 14, 60); ctx.fillStyle = '#fff'; } x += n > 1 ? 32 : 22; }
  // boss bar
  const boss = G.enemies.find((e) => e.type === 'boss');
  if (boss) {
    const w = Math.min(420, W - 60);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(W / 2 - w / 2, H - 28, w, 14);
    ctx.fillStyle = '#ff5f9a'; ctx.fillRect(W / 2 - w / 2 + 2, H - 26, (w - 4) * clamp(boss.hp / boss.max, 0, 1), 10);
    ctx.fillStyle = '#fff'; ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CRYSTAL KING', W / 2, H - 36);
  }
  if (G.bannerT > 0) { ctx.globalAlpha = Math.min(1, G.bannerT * 1.5); ctx.fillStyle = '#ffe9b8'; ctx.font = '900 32px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(G.banner, W / 2, H * 0.4); ctx.globalAlpha = 1; }
  ctx.textAlign = 'left';
}

function drawSticks(ctx) {
  for (const k of ['move', 'aim']) {
    const s = sticks[k];
    if (!s) continue;
    const dx = clamp(s.x - s.ox, -50, 50), dy = clamp(s.y - s.oy, -50, 50);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = k === 'aim' ? '#ff8a3d' : '#2de2e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.ox, s.oy, 50, 0, TAU); ctx.stroke();
    ctx.fillStyle = k === 'aim' ? '#ff8a3d' : '#2de2e6'; ctx.beginPath(); ctx.arc(s.ox + dx, s.oy + dy, 20, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

window.__dungeon = { G, shell, mouse, sticks, UPGRADES };
