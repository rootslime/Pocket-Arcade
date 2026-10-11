// Asteroid Dash CO-OP — 2–4 ships on one screen survive asteroid waves together.
// Shared battlefield and wave progress, individual lives and scores. No friendly fire.
// (Local play only: every player needs a keyboard half or a controller; online co-op would need an
// authoritative simulation, see README → Multiplayer.)
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import * as gp from '../../js/gamepad.js';
import { createMpKit, standingsHTML, rankText } from '../../js/mp-kit.js';
import { identity } from '../../js/multiplayer.js';
import { clamp, formatScore, rand, randInt, pick, TAU } from '../../js/util.js';

const W = 800, H = 600;
const SIZES = { 3: { r: 44, score: 20, v: [35, 65] }, 2: { r: 26, score: 50, v: [65, 105] }, 1: { r: 14, score: 100, v: [100, 160] } };
const COLORS = ['#2de2e6', '#ff8a3d', '#5dff8f', '#ff3cac'];
const UP = { rapid: { color: '#ffe14d', label: 'RAPID', dur: 10 }, triple: { color: '#ff3cac', label: 'TRIPLE', dur: 10 }, shield: { color: '#5dff8f', label: 'SHIELD', dur: 8 } };
const MP_CFG = { supported: true, minPlayers: 2, maxPlayers: 4, bots: false, local: true, online: false };
const SCHEMA = [{ key: 'lives', label: 'Lives each', type: 'select', options: [{ v: 3, label: '3' }, { v: 5, label: '5' }] }];

const fx = new Particles(300), pops = new Popups(16), shake = new Shake();
const C = { ships: [], rocks: [], bullets: [], ebullets: [], saucers: [], drops: [], wave: 0, waveT: 0, t: 0, over: false, banner: '', bannerT: 0, stars: [], info: null, saucerQ: [], settings: { lives: 3 }, rocksKilled: 0, saucersKilled: 0 };
let shell = null, kit = null;
const padPrev = {};

// ------------------------------------------------------------------ input
const KEYS = {};
const sets = {
  a: { left: 'KeyA', right: 'KeyD', thrust: 'KeyW', fire: 'Space' },
  b: { left: 'ArrowLeft', right: 'ArrowRight', thrust: 'ArrowUp', fire: 'Enter' },
  c: { left: 'KeyJ', right: 'KeyL', thrust: 'KeyI', fire: 'KeyK' },
};
for (const [set, m] of Object.entries(sets)) for (const [k, code] of Object.entries(m)) KEYS[`${set}_${k}`] = [code];
KEYS.b_fire.push('NumpadEnter');

function readDevice(dev) {
  const i = shell.input;
  const kb = (set) => ({ turn: i.axis(`${set}_left`, `${set}_right`), thrust: i.down(`${set}_thrust`), fire: i.down(`${set}_fire`) });
  const pad = (p) => ({ turn: Math.abs(p.ax(0)) > 0.25 ? p.ax(0) : (p.btn(15) ? 1 : 0) - (p.btn(14) ? 1 : 0), thrust: p.btn(0) || p.btn(12) || p.ax(1) < -0.5 || p.btn(7), fire: p.btn(2) || p.btn(1) || p.btn(5) || p.btn(6) });
  if (dev.kind === 'kbA') return kb('a');
  if (dev.kind === 'kbB') return kb('b');
  if (dev.kind === 'kbC') return kb('c');
  const p = gp.allPads().find((x) => x.index === dev.pad);
  return p ? pad(p) : { turn: 0, thrust: false, fire: false };
}
function assignDevices(n) {
  const pads = gp.allPads();
  const pool = pads.length >= n ? pads.map((p) => ({ kind: 'pad', pad: p.index })) : [{ kind: 'kbA' }, { kind: 'kbB' }, { kind: 'kbC' }, ...pads.map((p) => ({ kind: 'pad', pad: p.index }))];
  return pool.slice(0, n);
}

// ------------------------------------------------------------------ setup
function newShip(i, dev, name) {
  return { i, name, dev, color: COLORS[i], x: W / 2 + (i - 1.5) * 60, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, cd: 0, inv: 2, dead: 0, lives: C.settings.lives, score: 0, up: { rapid: 0, triple: 0, shield: 0 }, chain: 0, chainT: 0, out: false, kills: 0 };
}

function start(info) {
  C.info = info;
  kit.clearNotice();
  shell.restart();
}

function reset() {
  const info = C.info;
  C.rocks.length = C.bullets.length = C.ebullets.length = C.saucers.length = C.drops.length = C.saucerQ.length = 0;
  Object.assign(C, { wave: 0, waveT: 0, t: 0, over: false, banner: '', bannerT: 0, rocksKilled: 0, saucersKilled: 0 });
  fx.clear(); pops.clear(); shake.mag = 0;
  C.stars = Array.from({ length: 70 }, () => ({ x: rand(W), y: rand(H), z: rand(0.3, 1) }));
  if (info) {
    C.settings = { lives: info.settings.lives || 3 };
    const me = identity();
    const devs = assignDevices(info.humans);
    C.ships = Array.from({ length: info.humans }, (_, i) => newShip(i, devs[i] || devs[0], i === 0 ? me.name : `Player ${i + 1}`));
    nextWave();
  } else {
    C.ships = [];
  }
  hud();
}

function makeRock(size, x, y, speedMul = 1) {
  const S = SIZES[size];
  const a = rand(TAU), v = rand(S.v[0], S.v[1]) * speedMul;
  C.rocks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size, r: S.r, rot: rand(TAU), vr: rand(-1, 1), shape: Array.from({ length: 10 }, () => rand(0.75, 1.15)) });
}

function nextWave() {
  C.wave++;
  const n = Math.min(12, 2 + C.wave + C.ships.length);
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do { x = rand(W); y = rand(H); tries++; } while (tries < 20 && C.ships.some((s) => !s.out && Math.hypot(s.x - x, s.y - y) < 190));
    makeRock(3, x, y, 1 + C.wave * 0.05);
  }
  if (C.wave >= 3) C.saucerQ.push(...Array.from({ length: Math.min(3, 1 + Math.floor((C.wave - 3) / 3)) }, () => rand(3, 9)));
  C.banner = `WAVE ${C.wave}`; C.bannerT = 1.8;
  for (const s of C.ships) if (s.dead > 0 && s.lives > 0) s.dead = Math.min(s.dead, 0.4);     // a new wave brings fallen ships back
  hud();
}

function hud() {
  shell.hud('wave', String(C.wave));
  shell.hud('score', C.ships.map((s) => formatScore(s.score)).join(' · ') || '0');
  shell.hud('lives', C.ships.map((s) => (s.lives > 0 ? '▲'.repeat(s.lives) : '–')).join('  '));
}

// ------------------------------------------------------------------ update
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrap = (v, m) => ((v % m) + m) % m;

function update(dt) {
  C.t += dt;
  if (C.bannerT > 0) C.bannerT -= dt;
  const alive = C.ships.filter((s) => !s.out && s.dead <= 0);
  for (const s of C.ships) {
    for (const k of Object.keys(s.up)) if (s.up[k] > 0) s.up[k] = Math.max(0, s.up[k] - dt);
    s.chainT -= dt; if (s.chainT <= 0) s.chain = 0;
    if (s.out) continue;
    if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) respawn(s); continue; }
    s.inv = Math.max(0, s.inv - dt);
    const inp = shell.liveMenu ? { turn: 0, thrust: false, fire: false } : readDevice(s.dev);
    s.a += inp.turn * 4.3 * dt;
    if (inp.thrust) {
      s.vx += Math.cos(s.a) * 300 * dt; s.vy += Math.sin(s.a) * 300 * dt;
      fx.emit(s.x - Math.cos(s.a) * 12, s.y - Math.sin(s.a) * 12, 1, { angle: s.a + Math.PI, spread: 0.5, speed: 150, life: 0.3, size: 4, color: [s.color, '#fff'], drag: 2 });
    }
    const damp = Math.pow(0.8, dt); s.vx *= damp; s.vy *= damp;
    const sp = Math.hypot(s.vx, s.vy); if (sp > 400) { s.vx *= 400 / sp; s.vy *= 400 / sp; }
    s.x = wrap(s.x + s.vx * dt, W); s.y = wrap(s.y + s.vy * dt, H);
    s.cd -= dt;
    if (inp.fire && s.cd <= 0) fire(s);
  }
  for (const r of C.rocks) { r.x = wrap(r.x + r.vx * dt, W); r.y = wrap(r.y + r.vy * dt, H); r.rot += r.vr * dt; }

  // bullets
  for (let b = C.bullets.length - 1; b >= 0; b--) {
    const bl = C.bullets[b];
    bl.x = wrap(bl.x + bl.vx * dt, W); bl.y = wrap(bl.y + bl.vy * dt, H); bl.life -= dt;
    let used = false;
    for (let r = C.rocks.length - 1; r >= 0 && !used; r--) if (dist(bl, C.rocks[r]) < C.rocks[r].r * 0.92 + 3) { used = true; breakRock(r, C.ships[bl.o]); }
    for (let q = C.saucers.length - 1; q >= 0 && !used; q--) if (dist(bl, C.saucers[q]) < C.saucers[q].r + 4) { used = true; killSaucer(q, C.ships[bl.o]); }
    if (used || bl.life <= 0) { C.bullets[b] = C.bullets[C.bullets.length - 1]; C.bullets.pop(); }
  }
  // saucers
  for (let q = C.saucerQ.length - 1; q >= 0; q--) { C.saucerQ[q] -= dt; if (C.saucerQ[q] <= 0) { C.saucerQ.splice(q, 1); const l = Math.random() < 0.5; C.saucers.push({ x: l ? -30 : W + 30, y: rand(80, H - 80), vx: l ? 90 : -90, ph: rand(TAU), cd: 1.5, r: 18 }); } }
  for (let q = C.saucers.length - 1; q >= 0; q--) {
    const sc = C.saucers[q];
    sc.ph += dt * 2; sc.x += sc.vx * dt; sc.y += Math.sin(sc.ph) * 50 * dt; sc.cd -= dt;
    if (sc.x < -60 || sc.x > W + 60) { C.saucers.splice(q, 1); continue; }
    const tgt = alive.slice().sort((a, b) => dist(a, sc) - dist(b, sc))[0];
    if (sc.cd <= 0 && tgt) { sc.cd = Math.max(1, 2.1 - C.wave * 0.08); const a = Math.atan2(tgt.y - sc.y, tgt.x - sc.x) + rand(-0.4, 0.4); C.ebullets.push({ x: sc.x, y: sc.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 3 }); shell.sfx.play('shoot'); }
    for (const s of alive) if (s.dead <= 0 && dist(sc, s) < sc.r + 10 && hurt(s)) { killSaucer(q, null); break; }
  }
  for (let b = C.ebullets.length - 1; b >= 0; b--) {
    const eb = C.ebullets[b];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
    let rm = eb.life <= 0 || eb.x < -20 || eb.x > W + 20 || eb.y < -20 || eb.y > H + 20;
    if (!rm) for (const s of alive) if (s.dead <= 0 && dist(eb, s) < 11) { hurt(s); rm = true; break; }
    if (rm) { C.ebullets[b] = C.ebullets[C.ebullets.length - 1]; C.ebullets.pop(); }
  }
  // ships vs rocks
  for (const s of alive) {
    if (s.dead > 0) continue;
    for (let r = C.rocks.length - 1; r >= 0; r--) if (dist(C.rocks[r], s) < C.rocks[r].r * 0.85 + 9) { if (hurt(s)) breakRock(r, null); break; }
  }
  // drops
  for (let d = C.drops.length - 1; d >= 0; d--) {
    const p = C.drops[d];
    p.x = wrap(p.x + p.vx * dt, W); p.y = wrap(p.y + p.vy * dt, H); p.life -= dt; p.a += dt * 2;
    const taker = alive.find((s) => s.dead <= 0 && dist(p, s) < 24);
    if (taker) { taker.up[p.k] = UP[p.k].dur; pops.add(taker.x, taker.y - 26, UP[p.k].label, UP[p.k].color, 14); shell.sfx.play('powerup'); C.drops.splice(d, 1); continue; }
    if (p.life <= 0) C.drops.splice(d, 1);
  }
  // wave progress
  if (!C.over && !C.rocks.length && !C.saucers.length && !C.saucerQ.length) {
    const before = C.waveT; C.waveT += dt;
    if (before >= 0 && C.waveT > 0.6) {
      const bonus = 100 * C.wave;
      for (const s of C.ships) if (!s.out && s.dead <= 0) s.score += bonus;
      pops.add(W / 2, H / 2 - 40, `WAVE CLEAR  +${bonus} each`, '#ffe14d', 20);
      shell.sfx.play('checkpoint'); C.waveT = -1.4; hud();
    } else if (before < 0 && C.waveT >= 0) { C.waveT = 0; nextWave(); }
  }
  if (!C.over && C.ships.every((s) => s.out)) end();
  fx.update(dt); pops.update(dt); shake.update(dt);
  for (const st of C.stars) { const s0 = C.ships[0]; if (s0) { st.x = wrap(st.x - s0.vx * dt * st.z * 0.04, W); st.y = wrap(st.y - s0.vy * dt * st.z * 0.04, H); } }
}

function fire(s) {
  s.cd = s.up.rapid > 0 ? 0.1 : 0.22;
  for (const da of s.up.triple > 0 ? [-0.2, 0, 0.2] : [0]) {
    if (C.bullets.length >= 90) break;
    const a = s.a + da;
    C.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: s.vx * 0.35 + Math.cos(a) * 640, vy: s.vy * 0.35 + Math.sin(a) * 640, life: 0.85, o: s.i });
  }
  shell.sfx.play('shoot');
  s.vx -= Math.cos(s.a) * 4; s.vy -= Math.sin(s.a) * 4;
}

function award(s, base, x, y) {
  if (!s) return;
  s.chain = s.chainT > 0 ? s.chain + 1 : 1; s.chainT = 1.3;
  const pts = base + (s.chain >= 3 ? (s.chain - 2) * 10 : 0);
  s.score += pts; s.kills++;
  pops.add(x, y - 10, s.chain >= 3 ? `+${pts} x${s.chain}` : `+${pts}`, s.color, 12);
  hud();
}

function breakRock(idx, by) {
  const rk = C.rocks[idx];
  award(by, SIZES[rk.size].score, rk.x, rk.y);
  C.rocksKilled++;
  fx.emit(rk.x, rk.y, rk.size * 6, { speed: 140, life: 0.5, size: 4, color: ['#c9cff5', '#fff'] });
  shell.sfx.play(rk.size === 3 ? 'explosion' : 'smallBoom'); shake.kick(rk.size * 1.5);
  C.rocks.splice(idx, 1);
  if (rk.size > 1) for (let k = 0; k < 2; k++) makeRock(rk.size - 1, rk.x, rk.y, 1.1);
  else if (Math.random() < 0.18) C.drops.push({ x: rk.x, y: rk.y, vx: rand(-20, 20), vy: rand(-20, 20), k: pick(Object.keys(UP)), life: 9, a: 0 });
}

function killSaucer(q, by) {
  const sc = C.saucers[q];
  award(by, 250, sc.x, sc.y); C.saucersKilled++;
  fx.emit(sc.x, sc.y, 24, { speed: 220, life: 0.6, size: 5, color: ['#8b5cff', '#fff'] });
  shell.sfx.play('explosion'); shake.kick(6);
  C.drops.push({ x: sc.x, y: sc.y, vx: 0, vy: 20, k: pick(Object.keys(UP)), life: 10, a: 0 });
  C.saucers.splice(q, 1);
}

function hurt(s) {
  if (s.dead > 0 || s.inv > 0) return false;
  if (s.up.shield > 0) { s.up.shield = 0; s.inv = 1; shell.sfx.play('shield'); return false; }
  s.lives--; s.chain = 0;
  fx.emit(s.x, s.y, 40, { speed: 300, life: 0.8, size: 5, color: [s.color, '#fff'] });
  shell.sfx.play('hit'); shake.kick(10);
  s.dead = 2.5; s.vx = s.vy = 0;
  if (s.lives <= 0) { s.out = true; pops.add(s.x, s.y - 20, `${s.name} is out!`, s.color, 14); }
  hud();
  return true;
}

function respawn(s) {
  if (s.lives <= 0) { s.out = true; return; }
  Object.assign(s, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 3, cd: 0.2 });
}

function end() {
  C.over = true;
  const ranked = C.ships.slice().sort((a, b) => b.score - a.score);
  const me = C.ships[0];
  const rows = ranked.map((s) => ({ name: s.name, text: formatScore(s.score), me: s === me }));
  const wave = C.wave;
  shell.finish({
    win: wave >= 5, title: 'TEAM RESULT', subtitle: `Your team reached wave ${wave}`, score: me.score, scoreText: formatScore(me.score), delay: 900,
    extras: { coopBestWave: wave },
    facts: { coop: true, wave, players: C.ships.length, score: me.score, rocks: C.rocksKilled },
    counters: { coopMatches: 1, coopWaves: Math.max(0, wave - 1), rocks: C.rocksKilled, saucers: C.saucersKilled },
    milestones: [['Team waves', Math.min(40, wave * 4)], ['Played together', 10]],
    summary: `Co-op · wave ${wave}`, countsScore: false,
    stats: [['Team wave', String(wave)], ['Your score', formatScore(me.score)], ['Asteroids', String(C.rocksKilled)], ['Players', String(C.ships.length)]],
    extraHTML: standingsHTML(rows, 'Individual scores'),
    buttonsHTML: '<button type="button" class="g-btn primary big" data-act="co-again">PLAY AGAIN</button><button type="button" class="g-btn" data-act="co-mode">CHANGE SETTINGS</button><button type="button" class="g-btn" data-act="co-lobby">RETURN TO LOBBY</button><a class="g-btn" href="../../index.html">ARCADE HOME</a>',
  });
}

function onAct(act) {
  const info = C.info;
  if (act === 'co-again' || act === 'restart') { if (info) start(info); return true; }
  if (act === 'co-mode') { C.info = null; shell.toReady(); kit.lobby.setSettings(info ? info.settings : {}); kit.lobby.showSetup('local'); return true; }
  if (act === 'co-lobby' || act === 'co-leave') { C.info = null; shell.toReady(); kit.lobby.openMenu(); return true; }
  return false;
}

// ------------------------------------------------------------------ render
function render(ctx) {
  ctx.fillStyle = '#03030f'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(shake.x, shake.y);
  for (const st of C.stars) { ctx.globalAlpha = st.z * 0.8; ctx.fillStyle = '#fff'; ctx.fillRect(st.x, st.y, 1 + st.z, 1 + st.z); }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  for (const r of C.rocks) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
    ctx.strokeStyle = '#c9cff5'; ctx.fillStyle = '#1a1d44'; ctx.beginPath();
    r.shape.forEach((m, i) => { const a = (i / r.shape.length) * TAU; const px = Math.cos(a) * r.r * m, py = Math.sin(a) * r.r * m; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  for (const d of C.drops) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a); ctx.strokeStyle = UP[d.k].color; ctx.fillStyle = 'rgba(10,10,40,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(13, 0); ctx.lineTo(0, 13); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  for (const sc of C.saucers) { ctx.fillStyle = '#8b5cff'; ctx.beginPath(); ctx.ellipse(sc.x, sc.y, sc.r, sc.r * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#d9c9ff'; ctx.beginPath(); ctx.arc(sc.x, sc.y - 5, 7, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = '#ffe14d'; for (const b of C.bullets) { ctx.fillStyle = COLORS[b.o] || '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#ff6b6b'; for (const b of C.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill(); }
  for (const s of C.ships) {
    if (s.out || s.dead > 0) continue;
    if (s.inv > 0 && Math.floor(s.inv * 12) % 2) continue;
    if (s.up.shield > 0) { ctx.strokeStyle = '#5dff8f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, TAU); ctx.stroke(); }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    ctx.shadowColor = s.color; ctx.shadowBlur = shell.lowFx ? 0 : 12; ctx.strokeStyle = s.color; ctx.fillStyle = 'rgba(10,10,40,.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-11, -10); ctx.lineTo(-6, 0); ctx.lineTo(-11, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = s.color; ctx.fillText(`P${s.i + 1}`, s.x, s.y - 22);
  }
  fx.draw(ctx); pops.draw(ctx);
  // scoreboard
  ctx.font = '800 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left';
  C.ships.forEach((s, i) => { ctx.fillStyle = s.out ? '#666' : s.color; ctx.fillText(`${s.name.slice(0, 10)}  ${formatScore(s.score)}  ${'▲'.repeat(Math.max(0, s.lives))}${s.out ? ' OUT' : ''}`, 12, 20 + i * 16); });
  if (C.bannerT > 0) { ctx.globalAlpha = Math.min(1, C.bannerT); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 36px "Trebuchet MS", sans-serif'; ctx.fillText(C.banner, W / 2, H * 0.3); ctx.globalAlpha = 1; }
  ctx.restore();
}

// ------------------------------------------------------------------ shell
shell = createShell({
  id: 'asteroidDash', title: 'Asteroid Co-op', accent: '#8b5cff',
  size: { w: W, h: H },
  hud: [{ id: 'wave', label: 'WAVE', init: '0' }, { id: 'score', label: 'SCORE', init: '0' }, { id: 'lives', label: 'LIVES', init: '' }],
  keys: KEYS,
  customStart: true, ambientReady: true,
  instructions: {
    goal: 'Survive asteroid waves together. Everyone has their own lives and score; the team’s wave counts.',
    controls: [['A D · W · Space', 'Player 1: rotate · thrust · fire'], ['← → · ↑ · Enter', 'Player 2'], ['J L · I · K', 'Player 3'], ['Controller', 'Stick rotates · A thrust · X / B fire']],
    tips: ['There is no friendly fire.', 'A new wave brings fallen ships back.', 'Saucers (from wave 3) shoot at the nearest ship. Grab their drops!'],
  },
  pauseHTML() { return `<h2 id="g-panel-title">Paused</h2><div class="p-menu"><button type="button" class="g-btn primary big" data-act="resume">Resume</button><button type="button" class="g-btn" data-act="restart">Restart</button><button type="button" class="g-btn" data-act="help">How to play</button><button type="button" class="g-btn" data-act="mute">${shell.store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button><button type="button" class="g-btn" data-act="co-leave">Quit to lobby</button><a class="g-btn" href="../../index.html">Arcade Home</a></div>`; },
  onAct, reset, update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); },
  render,
  init: (sh) => { shell = sh; },
  onReady: (sh) => {
    shell = sh;
    kit = createMpKit({
      shell: sh, game: { id: 'asteroidDash', title: 'Asteroid Dash Co-op', accent: '#8b5cff', mp: MP_CFG, players: '2–4 players · same screen' },
      schema: SCHEMA, defaults: { lives: 3 }, localMax: 4, settingsKey: 'co.cfg',
      localHelp: 'Player 1: A D / W / Space · Player 2: arrows / Enter · Player 3: J L / I / K. Controllers work too.',
      onStart: start,
    });
    kit.start();
    window.__coop = { C, get kit() { return kit; }, start };
  },
});
void randInt; void clamp;
