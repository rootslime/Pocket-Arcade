// Asteroid Dash — momentum-based space shooter with waves, saucers, comets and upgrades.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { clamp, formatScore, rand, randInt, pick, TAU } from '../../js/util.js';

let W = 800, H = 600;
const fx = new Particles(360);
const pops = new Popups(16);
const shake = new Shake();

const SIZES = { 3: { r: 44, score: 20, v: [35, 65] }, 2: { r: 26, score: 50, v: [65, 105] }, 1: { r: 14, score: 100, v: [100, 160] } };
const UPGRADES = {
  rapid: { color: '#ffe14d', label: 'RAPID FIRE', dur: 10, icon: '»' },
  triple: { color: '#ff3cac', label: 'TRIPLE SHOT', dur: 10, icon: '⋔' },
  shield: { color: '#5dff8f', label: 'SHIELD', dur: 8, icon: 'O' },
  thrust: { color: '#2de2e6', label: 'TURBO THRUST', dur: 12, icon: '▲' },
  mult: { color: '#8b5cff', label: 'x2 SCORE', dur: 12, icon: 'x2' },
};

const G = {
  ship: { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2, cd: 0, inv: 0, dead: 0, thrusting: false },
  rocks: [], bullets: [], ebullets: [], drops: [], saucers: [], comets: [], warns: [],
  score: 0, lives: 3, wave: 0, up: { rapid: 0, triple: 0, shield: 0, thrust: 0, mult: 0 },
  waveT: 0, banner: '', bannerT: 0, chain: 0, chainT: 0, t: 0, over: false, flash: 0,
  shots: 0, hits: 0, rocksKilled: 0, saucersKilled: 0, stars: [], saucerQueue: [], cometQueue: [],
};

const shell = createShell({
  id: 'asteroidDash',
  title: 'Asteroid Dash',
  accent: '#8b5cff',
  size: (aspect) => (aspect < 0.85 ? { w: 600, h: 800 } : { w: 800, h: 600 }),
  hud: [
    { id: 'score', label: 'SCORE', init: '0' },
    { id: 'wave', label: 'WAVE', init: '1' },
    { id: 'lives', label: 'SHIPS', init: '▲▲▲' },
  ],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], thrust: ['ArrowUp', 'KeyW'],
    fire: ['Space', 'KeyJ', 'KeyZ'],
  },
  touch: {
    left: [{ action: 'left', label: '◀', aria: 'Rotate left' }, { action: 'right', label: '▶', aria: 'Rotate right' }],
    right: [{ action: 'thrust', label: 'THRUST', aria: 'Thrust', cls: 'wide' }, { action: 'fire', label: 'FIRE', aria: 'Fire', cls: 'act wide' }],
  },
  instructions: {
    goal: 'Blast the asteroids, survive each wave and rack up the highest score you can.',
    controls: [
      ['← → / A D', 'Rotate'],
      ['↑ / W', 'Thrust (you keep drifting!)'],
      ['Space (hold)', 'Fire'],
      ['P / Esc', 'Pause'],
    ],
    touch: '◀ ▶ rotate · hold THRUST to fly · hold FIRE to shoot (use both thumbs).',
    tips: [
      'Big rocks split into smaller, faster ones. Edges wrap around the screen.',
      'From wave 3 saucers fire back; from wave 4 comets streak across (a line warns you).',
      'Catch upgrades: Rapid · Triple · Shield · Turbo thrust · x2 score.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() { shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1; },
  resize(w, h) {
    W = w; H = h;
    for (const o of [G.ship, ...G.rocks, ...G.drops, ...G.bullets]) { o.x = ((o.x % W) + W) % W; o.y = ((o.y % H) + H) % H; }
    makeStars();
  },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); G.t += dt; driftRocks(dt); },
  render,
});

function makeStars() {
  G.stars.length = 0;
  for (let i = 0; i < 70; i++) G.stars.push({ x: rand(W), y: rand(H), z: rand(0.2, 1) });
}

const wrapD = (d, size) => { d = ((d + size / 2) % size + size) % size - size / 2; return d; };
const dist = (a, b) => Math.hypot(wrapD(a.x - b.x, W), wrapD(a.y - b.y, H));

function reset() {
  Object.assign(G, { score: 0, lives: 3, wave: 0, waveT: 0, banner: '', bannerT: 0, chain: 0, chainT: 0, t: 0, over: false, flash: 0, shots: 0, hits: 0, rocksKilled: 0, saucersKilled: 0 });
  G.rocks.length = G.bullets.length = G.ebullets.length = G.drops.length = G.saucers.length = G.comets.length = G.warns.length = 0;
  G.saucerQueue.length = G.cometQueue.length = 0;
  for (const k of Object.keys(G.up)) G.up[k] = 0;
  fx.clear(); pops.clear(); shake.mag = 0;
  spawnShip(true);
  makeStars();
  nextWave();
  hud();
}

function spawnShip(first) {
  Object.assign(G.ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, cd: 0.2, inv: first ? 1.5 : 3, dead: 0, thrusting: false });
}

function hud() {
  shell.hud('score', formatScore(G.score));
  shell.hud('wave', String(G.wave));
  shell.hud('lives', '▲'.repeat(Math.max(0, G.lives)) || '–');
}

// ---------------------------------------------------------------- spawning
function makeRock(size, x, y, speedMul = 1) {
  const S = SIZES[size];
  const a = rand(TAU), v = rand(S.v[0], S.v[1]) * speedMul;
  const n = 9 + randInt(0, 3);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(rand(0.74, 1.14));
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: S.r, size, rot: rand(TAU), rotV: rand(-1.2, 1.2), pts, flash: 0 };
}

function nextWave() {
  G.wave++;
  const n = Math.min(11, 3 + G.wave);
  const sm = Math.min(2, 1 + (G.wave - 1) * 0.07);
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do { x = rand(W); y = rand(H); tries++; } while (tries < 20 && dist({ x, y }, G.ship) < 190);
    G.rocks.push(makeRock(3, x, y, sm));
  }
  G.saucerQueue.length = 0; G.cometQueue.length = 0;
  if (G.wave >= 3) for (let i = 0; i < (G.wave >= 7 ? 2 : 1); i++) G.saucerQueue.push(rand(4, 14));
  if (G.wave >= 4) for (let i = 0; i < Math.min(3, 1 + Math.floor((G.wave - 4) / 3)); i++) G.cometQueue.push(rand(3, 16));
  G.banner = `WAVE ${G.wave}`; G.bannerT = 1.8;
  hud();
}

function spawnSaucer() {
  const left = Math.random() < 0.5;
  G.saucers.push({ x: left ? -30 : W + 30, y: rand(70, H - 70), vx: (left ? 1 : -1) * (85 + G.wave * 5), vy: 0, r: 17, hp: 2, cd: 1.2, ph: rand(TAU), flash: 0 });
  shell.sfx.play('warn');
}

function spawnComet() {
  const edge = randInt(0, 3);
  let x, y, a;
  if (edge === 0) { x = rand(W); y = -20; } else if (edge === 1) { x = rand(W); y = H + 20; } else if (edge === 2) { x = -20; y = rand(H); } else { x = W + 20; y = rand(H); }
  a = Math.atan2(G.ship.y - y + rand(-120, 120), G.ship.x - x + rand(-120, 120));
  // telegraph with a warning line, then launch
  G.warns.push({ x, y, a, t: 1.1 });
  shell.sfx.play('warn');
}

// ---------------------------------------------------------------- update
function driftRocks(dt) {
  for (const r of G.rocks) { r.x = (r.x + r.vx * dt + W) % W; r.y = (r.y + r.vy * dt + H) % H; r.rot += r.rotV * dt; }
}

function update(dt) {
  const i = shell.input;
  const s = G.ship;
  G.t += dt;
  G.flash = Math.max(0, G.flash - dt * 3);
  if (G.bannerT > 0) G.bannerT -= dt;
  for (const k of Object.keys(G.up)) if (G.up[k] > 0) G.up[k] = Math.max(0, G.up[k] - dt);
  G.chainT -= dt; if (G.chainT <= 0) G.chain = 0;

  // ---- ship
  if (s.dead > 0) {
    s.dead -= dt;
    if (s.dead <= 0) spawnShip(false);
  } else {
    s.inv = Math.max(0, s.inv - dt);
    const turn = i.axis('left', 'right');
    s.a += turn * 4.3 * dt;
    s.thrusting = i.down('thrust');
    const acc = 300 * (G.up.thrust > 0 ? 1.5 : 1);
    if (s.thrusting) {
      s.vx += Math.cos(s.a) * acc * dt; s.vy += Math.sin(s.a) * acc * dt;
      const bx = s.x - Math.cos(s.a) * 12, by = s.y - Math.sin(s.a) * 12;
      fx.emit(bx, by, 1, { angle: s.a + Math.PI, spread: 0.5, speed: 150, life: 0.3, size: 4, color: G.up.thrust > 0 ? ['#2de2e6', '#fff'] : ['#ff8a3d', '#ffe14d'], drag: 2 });
      if (Math.random() < 0.05) shell.sfx.play('land');
    }
    const damp = Math.pow(0.8, dt);            // gentle space-drag so the ship stays controllable
    s.vx *= damp; s.vy *= damp;
    const mx = G.up.thrust > 0 ? 520 : 400, sp = Math.hypot(s.vx, s.vy);
    if (sp > mx) { s.vx *= mx / sp; s.vy *= mx / sp; }
    s.x = (s.x + s.vx * dt + W) % W; s.y = (s.y + s.vy * dt + H) % H;

    // ---- shooting
    s.cd -= dt;
    if (i.down('fire') && s.cd <= 0) fire();
  }

  // ---- asteroids
  driftRocks(dt);
  for (const r of G.rocks) if (r.flash > 0) r.flash -= dt * 6;

  // ---- bullets
  for (let b = G.bullets.length - 1; b >= 0; b--) {
    const bl = G.bullets[b];
    bl.x = (bl.x + bl.vx * dt + W) % W; bl.y = (bl.y + bl.vy * dt + H) % H; bl.life -= dt;
    let used = false;
    for (let r = G.rocks.length - 1; r >= 0 && !used; r--) {
      const rk = G.rocks[r];
      if (dist(bl, rk) < rk.r * 0.92 + 3) { used = true; G.hits++; hitRock(r, bl); }
    }
    for (let q = G.saucers.length - 1; q >= 0 && !used; q--) {
      const sc = G.saucers[q];
      if (dist(bl, sc) < sc.r + 4) { used = true; G.hits++; hitSaucer(q, bl); }
    }
    for (let q = G.comets.length - 1; q >= 0 && !used; q--) {
      const cm = G.comets[q];
      if (dist(bl, cm) < cm.r + 4) { used = true; G.hits++; killComet(q); }
    }
    if (used || bl.life <= 0) { G.bullets[b] = G.bullets[G.bullets.length - 1]; G.bullets.pop(); }
  }

  // ---- saucers
  for (let q = 0; q < G.saucerQueue.length; q++) { G.saucerQueue[q] -= dt; }
  for (let q = G.saucerQueue.length - 1; q >= 0; q--) if (G.saucerQueue[q] <= 0) { G.saucerQueue.splice(q, 1); spawnSaucer(); }
  for (let q = G.saucers.length - 1; q >= 0; q--) {
    const sc = G.saucers[q];
    sc.ph += dt * 2; sc.x += sc.vx * dt; sc.y += Math.sin(sc.ph) * 50 * dt; sc.cd -= dt; sc.flash = Math.max(0, sc.flash - dt * 6);
    if (sc.x < -60 || sc.x > W + 60) { G.saucers.splice(q, 1); continue; }
    if (sc.cd <= 0 && s.dead <= 0) {
      sc.cd = Math.max(0.9, 2.0 - G.wave * 0.1);
      const a = Math.atan2(s.y - sc.y, s.x - sc.x) + rand(-0.35, 0.35) * Math.max(0.3, 1 - G.wave * 0.08);
      G.ebullets.push({ x: sc.x, y: sc.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 3 });
      shell.sfx.play('shoot');
    }
    if (s.dead <= 0 && dist(sc, s) < sc.r + 10) { if (hurtShip()) { hitSaucer(q, null, true); } }
  }
  for (let b = G.ebullets.length - 1; b >= 0; b--) {
    const eb = G.ebullets[b];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
    let rm = eb.life <= 0 || eb.x < -20 || eb.x > W + 20 || eb.y < -20 || eb.y > H + 20;
    if (!rm && s.dead <= 0 && dist(eb, s) < 11) { hurtShip(); rm = true; }
    if (rm) { G.ebullets[b] = G.ebullets[G.ebullets.length - 1]; G.ebullets.pop(); }
  }

  // ---- comets
  for (let q = 0; q < G.cometQueue.length; q++) G.cometQueue[q] -= dt;
  for (let q = G.cometQueue.length - 1; q >= 0; q--) if (G.cometQueue[q] <= 0) { G.cometQueue.splice(q, 1); spawnComet(); }
  for (let q = G.warns.length - 1; q >= 0; q--) {
    const w = G.warns[q];
    w.t -= dt;
    if (w.t <= 0) {
      G.comets.push({ x: w.x, y: w.y, vx: Math.cos(w.a) * 430, vy: Math.sin(w.a) * 430, r: 11, life: 4 });
      G.warns.splice(q, 1);
    }
  }
  for (let q = G.comets.length - 1; q >= 0; q--) {
    const cm = G.comets[q];
    cm.x += cm.vx * dt; cm.y += cm.vy * dt; cm.life -= dt;
    if (Math.random() < 0.7) fx.emit(cm.x, cm.y, 1, { speed: 20, life: 0.4, size: 5, color: ['#8b5cff', '#fff'], drag: 3 });
    if (cm.life <= 0 || cm.x < -60 || cm.x > W + 60 || cm.y < -60 || cm.y > H + 60) { G.comets.splice(q, 1); continue; }
    if (s.dead <= 0 && dist(cm, s) < cm.r + 9) { if (hurtShip()) killComet(q); }
  }

  // ---- ship vs rocks
  if (s.dead <= 0) {
    for (let r = G.rocks.length - 1; r >= 0; r--) {
      const rk = G.rocks[r];
      if (dist(rk, s) < rk.r * 0.85 + 9) {
        if (hurtShip()) { breakRock(r, true); }
        break;
      }
    }
  }

  // ---- upgrades
  for (let d = G.drops.length - 1; d >= 0; d--) {
    const p = G.drops[d];
    p.x = (p.x + p.vx * dt + W) % W; p.y = (p.y + p.vy * dt + H) % H; p.life -= dt; p.a += dt * 2;
    if (s.dead <= 0 && dist(p, s) < 24) { collect(p); G.drops.splice(d, 1); continue; }
    if (p.life <= 0) G.drops.splice(d, 1);
  }

  // ---- wave progress
  const clear = !G.rocks.length && !G.saucers.length && !G.comets.length && !G.warns.length && !G.saucerQueue.length && !G.cometQueue.length;
  if (clear && !G.over) {
    const before = G.waveT;
    G.waveT += dt;
    if (before >= 0 && G.waveT > 0.6) {
      const bonus = 100 * G.wave;
      G.score += bonus;
      pops.add(W / 2, H / 2 - 40, `WAVE CLEAR +${bonus}`, '#ffe14d', 20);
      shell.sfx.play('checkpoint');
      G.waveT = -1.4;
      hud();
    } else if (before < 0 && G.waveT >= 0) {
      G.waveT = 0;
      nextWave();
    }
  }

  fx.update(dt); pops.update(dt); shake.update(dt);
  for (const st of G.stars) { st.x = (st.x - s.vx * dt * st.z * 0.04 + W) % W; st.y = (st.y - s.vy * dt * st.z * 0.04 + H) % H; }
}

function fire() {
  const s = G.ship;
  s.cd = G.up.rapid > 0 ? 0.1 : 0.22;
  const angles = G.up.triple > 0 ? [-0.2, 0, 0.2] : [0];
  for (const da of angles) {
    if (G.bullets.length >= 48) break;
    const a = s.a + da;
    G.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: s.vx * 0.35 + Math.cos(a) * 640, vy: s.vy * 0.35 + Math.sin(a) * 640, life: 0.85 });
    G.shots++;
  }
  shell.sfx.play('shoot');
  fx.emit(s.x + Math.cos(s.a) * 16, s.y + Math.sin(s.a) * 16, 4, { angle: s.a, spread: 0.7, speed: 160, life: 0.15, size: 4, color: ['#fff', '#ffe14d'], drag: 4 });
  s.vx -= Math.cos(s.a) * 4; s.vy -= Math.sin(s.a) * 4;   // tiny recoil
}

function award(base, x, y) {
  G.chain = G.chainT > 0 ? G.chain + 1 : 1;
  G.chainT = 1.3;
  const mult = G.up.mult > 0 ? 2 : 1;
  const chainBonus = G.chain >= 3 ? (G.chain - 2) * 10 : 0;
  const pts = (base + chainBonus) * mult;
  G.score += pts;
  pops.add(x, y - 10, G.chain >= 3 ? `+${pts}  CHAIN x${G.chain}` : `+${pts}`, G.chain >= 3 ? '#ffe14d' : '#fff', G.chain >= 3 ? 15 : 12);
  hud();
}

function hitRock(idx, bl) {
  const rk = G.rocks[idx];
  rk.flash = 1;
  fx.emit(bl.x, bl.y, 5, { speed: 130, life: 0.3, size: 3, color: ['#fff', '#ffe14d'] });
  breakRock(idx, false);
}

function breakRock(idx, byShip) {
  const rk = G.rocks[idx];
  G.rocks.splice(idx, 1);
  G.rocksKilled++;
  const S = SIZES[rk.size];
  if (!byShip) award(S.score, rk.x, rk.y);
  shell.sfx.play(rk.size === 3 ? 'explosion' : 'smallBoom');
  shake.kick(rk.size === 3 ? 4 : rk.size === 2 ? 2 : 1);
  fx.emit(rk.x, rk.y, rk.size * 6 + 4, { speed: 120 + rk.size * 40, life: 0.6, size: 3 + rk.size, color: ['#c9c3ff', '#8b5cff', '#fff'], drag: 1.2 });
  if (rk.size > 1) {
    const sm = Math.min(2, 1 + (G.wave - 1) * 0.07);
    for (let k = 0; k < 2; k++) {
      const c = makeRock(rk.size - 1, rk.x + rand(-6, 6), rk.y + rand(-6, 6), sm);
      c.vx += rk.vx * 0.5; c.vy += rk.vy * 0.5;
      G.rocks.push(c);
    }
  }
  if (!byShip && Math.random() < (rk.size === 3 ? 0.12 : rk.size === 2 ? 0.07 : 0.04)) spawnDrop(rk.x, rk.y);
}

function hitSaucer(idx, bl, rammed) {
  const sc = G.saucers[idx];
  sc.hp--; sc.flash = 1;
  if (bl) fx.emit(bl.x, bl.y, 6, { speed: 150, life: 0.3, size: 3, color: ['#fff', '#ff8a3d'] });
  if (sc.hp > 0 && !rammed) { shell.sfx.play('hit'); return; }
  G.saucers.splice(idx, 1);
  G.saucersKilled++;
  award(200, sc.x, sc.y);
  shell.sfx.play('explosion'); shake.kick(5); shell.hitStop(0.04);
  fx.emit(sc.x, sc.y, 26, { speed: 280, life: 0.7, size: 5, color: ['#ff8a3d', '#ffe14d', '#fff'] });
  spawnDrop(sc.x, sc.y);
}

function killComet(idx) {
  const cm = G.comets[idx];
  G.comets.splice(idx, 1);
  award(150, cm.x, cm.y);
  shell.sfx.play('smallBoom');
  fx.emit(cm.x, cm.y, 18, { speed: 220, life: 0.5, size: 4, color: ['#8b5cff', '#fff'] });
}

const upKeys = Object.keys(UPGRADES);
function spawnDrop(x, y) {
  if (G.drops.length >= 3) return;
  const type = pick(upKeys);
  const a = rand(TAU);
  G.drops.push({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, type, life: 10, a: 0 });
}

function collect(p) {
  const u = UPGRADES[p.type];
  G.up[p.type] = u.dur;
  shell.sfx.play('powerup');
  pops.add(p.x, p.y - 20, u.label, u.color, 15);
  fx.emit(p.x, p.y, 20, { speed: 220, life: 0.5, size: 4, color: [u.color, '#fff'] });
}

/** Returns true if the ship was actually damaged (and not shielded / invulnerable). */
function hurtShip() {
  const s = G.ship;
  if (s.inv > 0) return false;
  if (G.up.shield > 0) {
    s.inv = 0.6; G.up.shield = Math.max(0, G.up.shield - 3);
    shell.sfx.play('hit'); shake.kick(4);
    fx.emit(s.x, s.y, 16, { speed: 200, life: 0.4, size: 4, color: ['#5dff8f', '#fff'] });
    return true;
  }
  G.lives--; G.flash = 1; G.chain = 0;
  shell.sfx.play('explosion'); shake.kick(12); shell.hitStop(0.1);
  fx.emit(s.x, s.y, 50, { speed: 330, life: 0.9, size: 5, color: ['#2de2e6', '#fff', '#ff3cac'] });
  s.dead = 1.3; s.vx = s.vy = 0;
  for (const k of ['rapid', 'triple', 'thrust']) G.up[k] = 0;
  hud();
  if (G.lives <= 0) end();
  return true;
}

function end() {
  if (G.over) return;
  G.over = true;
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  shell.finish({
    win: false, score: G.score, subtitle: `You reached wave ${G.wave}`,
    extras: { highestWave: G.wave },
    stats: [
      ['Wave', String(G.wave)],
      ['Rocks destroyed', String(G.rocksKilled)],
      ['Saucers', String(G.saucersKilled)],
      ['Accuracy', `${acc}%`],
    ],
  });
}

// ---------------------------------------------------------------- render
function drawWrapped(ctx, x, y, r, fn) {
  fn(x, y);
  const nx = x < r ? W : x > W - r ? -W : 0, ny = y < r ? H : y > H - r ? -H : 0;
  if (nx) fn(x + nx, y);
  if (ny) fn(x, y + ny);
  if (nx && ny) fn(x + nx, y + ny);
}

function render(ctx) {
  const glow = !shell.lowFx && !shell.reduced;
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, '#13113a'); g.addColorStop(1, '#03030f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shake.x, shake.y);
  for (const st of G.stars) { ctx.globalAlpha = 0.3 + st.z * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(st.x, st.y, 1 + st.z, 1 + st.z); }
  ctx.globalAlpha = 1;

  // comet warnings
  for (const w of G.warns) {
    ctx.strokeStyle = `rgba(139,92,255,${0.35 + 0.4 * Math.abs(Math.sin(w.t * 12))})`; ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(w.a) * 1200, w.y + Math.sin(w.a) * 1200); ctx.stroke(); ctx.setLineDash([]);
  }

  // rocks
  ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  for (const r of G.rocks) {
    drawWrapped(ctx, r.x, r.y, r.r, (x, y) => {
      ctx.beginPath();
      const n = r.pts.length;
      for (let k = 0; k < n; k++) { const a = r.rot + k / n * TAU; const rr = r.r * r.pts[k]; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath();
      ctx.fillStyle = r.flash > 0 ? '#fff' : '#17143e';
      ctx.fill();
      if (glow) { ctx.shadowColor = '#8b5cff'; ctx.shadowBlur = 8; }
      ctx.strokeStyle = r.size === 3 ? '#a98bff' : r.size === 2 ? '#c9b6ff' : '#e6dcff';
      ctx.stroke(); ctx.shadowBlur = 0;
    });
  }

  // drops
  for (const p of G.drops) {
    const u = UPGRADES[p.type];
    const blink = p.life < 3 && Math.floor(p.life * 6) % 2;
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.save(); ctx.translate(p.x, p.y);
    if (glow) { ctx.shadowColor = u.color; ctx.shadowBlur = 14; }
    ctx.strokeStyle = u.color; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(8,8,40,.85)';
    ctx.rotate(p.a); ctx.beginPath(); ctx.rect(-12, -12, 24, 24); ctx.fill(); ctx.stroke(); ctx.rotate(-p.a); ctx.shadowBlur = 0;
    ctx.fillStyle = u.color; ctx.font = '800 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(u.icon, 0, 1);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // saucers
  for (const sc of G.saucers) {
    ctx.save(); ctx.translate(sc.x, sc.y);
    ctx.strokeStyle = sc.flash > 0 ? '#fff' : '#ff8a3d'; ctx.fillStyle = '#2a1206'; ctx.lineWidth = 2.5;
    if (glow) { ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.ellipse(0, 3, 20, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  for (const eb of G.ebullets) {
    ctx.fillStyle = 'rgba(255,60,90,.35)'; ctx.beginPath(); ctx.arc(eb.x, eb.y, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff5c7a'; ctx.beginPath(); ctx.arc(eb.x, eb.y, 4, 0, TAU); ctx.fill();
  }
  for (const cm of G.comets) {
    ctx.fillStyle = '#fff'; if (glow) { ctx.shadowColor = '#8b5cff'; ctx.shadowBlur = 16; }
    ctx.beginPath(); ctx.arc(cm.x, cm.y, cm.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  }

  // bullets
  for (const b of G.bullets) {
    ctx.fillStyle = '#ffe14d'; if (glow) { ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 8; }
    const l = 9, sp = Math.hypot(b.vx, b.vy);
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx / sp * l, b.y - b.vy / sp * l); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawShip(ctx, glow);
  fx.draw(ctx);
  pops.draw(ctx);
  ctx.restore();

  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.28; ctx.fillStyle = '#ff3c5a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

  // active upgrade chips
  let x = 10;
  ctx.textBaseline = 'middle';
  for (const k of upKeys) {
    const v = G.up[k];
    if (!(v > 0)) continue;
    const u = UPGRADES[k];
    ctx.fillStyle = 'rgba(6,6,30,.8)'; ctx.fillRect(x, H - 28, 124, 20);
    ctx.fillStyle = u.color; ctx.fillRect(x, H - 28, 124 * (v / u.dur), 3);
    ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(u.label, x + 6, H - 16);
    ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), x + 118, H - 16);
    x += 130; if (x > W - 130) break;
  }
  if (G.bannerT > 0 && G.banner) {
    ctx.globalAlpha = Math.min(1, G.bannerT * 1.5);
    ctx.fillStyle = '#e6dcff'; ctx.font = '900 34px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(G.banner, W / 2, H * 0.3);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

function drawShip(ctx, glow) {
  const s = G.ship;
  if (s.dead > 0) return;
  if (s.inv > 0 && G.up.shield <= 0 && Math.floor(s.inv * 10) % 2) return;
  drawWrapped(ctx, s.x, s.y, 20, (x, y) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.a);
    if (s.thrusting) {
      ctx.fillStyle = G.up.thrust > 0 ? '#2de2e6' : '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-9 - 10 - Math.random() * 10, 0); ctx.lineTo(-9, 5); ctx.fill();
    }
    if (glow) { ctx.shadowColor = '#2de2e6'; ctx.shadowBlur = 12; }
    ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#d9ffff'; ctx.fillStyle = '#0d2b3a';
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-11, 10); ctx.lineTo(-6, 0); ctx.lineTo(-11, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (G.up.shield > 0) {
      const wob = G.up.shield < 2 && Math.floor(G.up.shield * 8) % 2;
      ctx.strokeStyle = wob ? 'rgba(93,255,143,.3)' : 'rgba(93,255,143,.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.stroke();
    }
  });
}

window.__asteroid = { G, shell };
