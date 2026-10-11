// Drift Circuit — top-down arcade racing. Physics live in sim.js; this file renders and handles UI.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { clamp, damp, formatTime, formatScore, TAU, roundRectPath } from '../../js/util.js';
import { TRACK_DEFS, buildTrack, nearest } from './tracks.js';
import { Race, CAR } from './sim.js';
import { createMpKit, standingsHTML, rankText, PeerBoard } from '../../js/mp-kit.js';
import { Track, Ticker, num, int } from '../../js/multiplayer.js';
import { esc } from '../../js/ui.js';

// ---- Multiplayer race: everyone drives their own car on the same track; positions are streamed 10×/s and the other
// cars are drawn interpolated (no collisions between cars). Finish times decide the result.
const MPQ = new URLSearchParams(location.search).has('mp');
const MP = { on: false, kit: null, room: null, board: null, info: null, tracks: new Map(), prog: new Map(), keyToIdx: new Map(), names: new Map(), myIdx: 0, tick: new Ticker(10), seq: 0, lastSeq: new Map(), ended: false, doneAt: 0, offs: [] };
const GHOST_COLORS = ['#2de2e6', '#ff3cac', '#5dff8f', '#ffe14d', '#c78bff', '#4d9bff'];

const ID = 'driftCircuit';
const tracks = TRACK_DEFS.map((d) => buildTrack(d));
let track = tracks[0];
let race = new Race(track);
const fx = new Particles(300);
const pops = new Popups(12);
const shake = new Shake();
const cam = { x: 0, y: 0, z: 0.9 };
let skids = [];
let decor = [];
let flash = 0, banner = '', bannerT = 0, lastCount = 4, mini = null, driftLive = 0;
let fxT = 0;

const seed = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const shell = createShell({
  id: ID,
  title: 'Drift Circuit',
  accent: '#ff8a3d',
  size: (aspect) => { const w = clamp(520 * aspect, 640, 1000); return { w, h: w / aspect }; },
  modeLabel: 'Choose a track',
  modes: TRACK_DEFS.map((d, i) => ({ id: d.id, label: d.name, desc: ['Wide city streets', 'Flowing coast road', 'Tight night circuit'][i] })),
  hud: [{ id: 'lap', label: 'LAP', init: '1/3' }, { id: 'time', label: 'TIME', init: '0:00.00' }, { id: 'drift', label: 'DRIFT', init: '0' }, ...(MPQ ? [{ id: 'pos', label: 'POS', init: '1st' }] : [])],
  best: { field: (m) => `bestTime_${m || 'neon'}`, kind: 'low', format: formatTime, label: 'BEST' },
  gamepad: { left: ['dpadLeft'], right: ['dpadRight'], gas: ['rt', 'a', 'dpadUp'], brake: ['lt', 'b', 'dpadDown'], hand: ['x', 'rb'], boost: ['y', 'lb'] },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], gas: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
    hand: ['Space'], boost: ['ShiftLeft', 'ShiftRight'],
  },
  touch: {
    left: [{ action: 'left', label: '◀', aria: 'Steer left' }, { action: 'right', label: '▶', aria: 'Steer right' }],
    right: [{ action: 'boost', label: 'BOOST', aria: 'Boost', cls: 'sm' }, { action: 'hand', label: 'DRIFT', aria: 'Drift / handbrake', cls: 'sm act' }, { action: 'gas', label: 'GAS', aria: 'Accelerate', cls: 'sm act' }],
  },
  instructions: {
    goal: 'Race three laps as fast as you can. Chain drifts to fill your boost, and chase the gold medal time.',
    controls: [
      ['W / ↑ · S / ↓', 'Gas · Brake / reverse'],
      ['A D / ← →', 'Steer'],
      ['Space', 'Handbrake: hold while turning to drift'],
      ['Shift', 'Boost (uses the boost meter)'],
    ],
    touch: '◀ ▶ steer · hold GAS · tap and hold DRIFT in corners · BOOST when the bar is full.',
    pad: 'Left stick steers · RT gas · LT brake · X / RB drift · Y / LB boost.',
    tips: [
      'Drift for 0.5 s for DRIFT +250, or hold a long slide for MEGA DRIFT +750. Hitting a wall cancels it.',
      'Glowing pads give a free speed burst. The brown dirt road is a shortcut, but it is slower.',
      'Grass slows you down and the outer walls bounce you back. Cones just cost speed.',
    ],
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  init() { shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1; },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); },
  render,
  ...(MPQ ? { customStart: true, onReady: mpReady, livePause: () => MP.on, pauseHTML: mpPauseHTML, onAct: mpAct } : {}),
});

function setTrack(id) {
  track = tracks.find((t) => t.def.id === id) || tracks[0];
  race = new Race(track);
  // scenery away from the road
  decor = [];
  const d = track.def.theme.decor;
  const near = track.half + track.grassW + 70;
  for (let i = 0; i < 260; i++) {
    const x = track.def.cx + (seed(i * 3 + 1) - 0.5) * track.def.a * 3.1, y = track.def.cy + (seed(i * 3 + 2) - 0.5) * track.def.b * 3.4;
    if (nearest(track, x, y).d < near) continue;
    decor.push({ x, y, s: 0.6 + seed(i * 3 + 3) * 0.9, k: Math.floor(seed(i + 99) * 4), kind: d });
  }
  // minimap bounds
  const xs = track.pts.map((p) => p.x), ys = track.pts.map((p) => p.y);
  mini = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function reset(mode) {
  setTrack(mode || 'neon');
  race.reset();
  skids = []; fx.clear(); pops.clear(); shake.mag = 0; flash = 0; banner = ''; bannerT = 0; lastCount = 4; driftLive = 0;
  const c = race.car;
  cam.x = c.x; cam.y = c.y; cam.z = 0.9;
  shell.hud('lap', `1/${track.lap}`); shell.hud('time', formatTime(0)); shell.hud('drift', '0');
}

function readInput() {
  const i = shell.input;
  let steer = i.axis('left', 'right');
  let gas = i.down('gas') ? 1 : 0, brake = i.down('brake') ? 1 : 0;
  const pad = shell.gamepad.state();
  if (pad.connected) {
    if (Math.abs(pad.lx) > 0.12) steer = pad.lx;
    if (pad.rt > 0.05) gas = Math.max(gas, pad.rt);
    if (pad.lt > 0.05) brake = Math.max(brake, pad.lt);
  }
  return { steer, gas, brake, hand: i.down('hand'), boost: i.down('boost') };
}

function update(dt) {
  const inp = MP.on && shell.liveMenu ? { steer: 0, gas: 0, brake: 0, hand: false, boost: false } : readInput();
  race.step(dt, inp);
  const c = race.car;
  for (const ev of race.events) handle(ev);
  // camera
  const sp = Math.hypot(c.vx, c.vy);
  const lx = c.x + c.vx * 0.35, ly = c.y + c.vy * 0.35;
  const k = damp(6, dt);
  cam.x += (lx - cam.x) * k; cam.y += (ly - cam.y) * k;
  cam.z += ((0.92 - clamp(sp / CAR.boostSpeed, 0, 1) * 0.2) - cam.z) * damp(2, dt);
  // effects
  const drifting = race.drift.on;
  if (drifting || (race.car.slip > 0.22 && sp > 160)) {
    const fx0 = Math.cos(c.a), fy0 = Math.sin(c.a);
    const rxp = -fy0, ryp = fx0;
    for (const side of [-1, 1]) {
      const px = c.x - fx0 * 14 + rxp * side * 9, py = c.y - fy0 * 14 + ryp * side * 9;
      skids.push({ x: px, y: py, px: c.x - c.vx * dt - fx0 * 14 + rxp * side * 9, py: c.y - c.vy * dt - fy0 * 14 + ryp * side * 9, a: 1 });
    }
    if (skids.length > 700) skids.splice(0, skids.length - 700);
    if (Math.random() < 0.7) fx.emit(c.x - Math.cos(c.a) * 14, c.y - Math.sin(c.a) * 14, 1, { speed: 40, life: 0.6, size: 9, color: 'rgba(255,255,255,.35)', drag: 2 });
  }
  if (race.boosting && Math.random() < 0.8) fx.emit(c.x - Math.cos(c.a) * 18, c.y - Math.sin(c.a) * 18, 1, { speed: 120, angle: c.a + Math.PI, spread: 0.4, life: 0.25, size: 6, color: ['#ffe14d', '#ff8a3d'], drag: 2 });
  if (c.surface === 'grass' && sp > 100 && Math.random() < 0.5) fx.emit(c.x, c.y, 1, { speed: 60, life: 0.4, size: 5, color: track.def.id === 'sunset' ? '#e6b36a' : '#4a6a5a', drag: 1.5 });
  fx.update(dt); pops.update(dt); shake.update(dt);
  flash = Math.max(0, flash - dt * 3); bannerT = Math.max(0, bannerT - dt);
  driftLive = race.drift.on ? race.drift.t : 0;
  shell.hud('lap', `${Math.min(race.lap, track.lap)}/${track.lap}`);
  shell.hud('time', formatTime(race.raceMs));
  shell.hud('drift', formatScore(race.driftTotal));
  if (MP.on) mpUpdate(dt);
}

function say(text, t = 1.6) { banner = text; bannerT = t; }

function handle(ev) {
  const sfx = shell.sfx;
  const c = race.car;
  switch (ev.type) {
    case 'count': lastCount = ev.n; sfx.play('warn'); break;
    case 'go': lastCount = 0; say('GO!', 1); sfx.play('powerup'); break;
    case 'driftStart': break;
    case 'driftEnd':
      sfx.play(ev.mega ? 'combo' : 'score');
      pops.add(c.x, c.y - 36, ev.mega ? `MEGA DRIFT +${ev.pts}` : `DRIFT +${ev.pts}`, ev.mega ? '#ff3cac' : '#ffe14d', ev.mega ? 20 : 16);
      if (ev.mega) shake.kick(3);
      shell.facts({ drift: race.driftTotal, megaDrifts: race.megaDrifts });
      break;
    case 'boost': sfx.play('dash'); shake.kick(2); break;
    case 'pad': sfx.play('powerup'); pops.add(ev.x, ev.y - 20, 'BOOST!', '#2de2e6', 14); break;
    case 'wall': sfx.play('hit'); shake.kick(clamp(ev.speed / 60, 2, 9)); flash = 0.6; fx.emit(ev.x, ev.y, 8, { speed: 200, life: 0.4, size: 4, color: ['#ffe14d', '#fff'] }); break;
    case 'cone': sfx.play('bounce'); fx.emit(ev.x, ev.y, 6, { speed: 120, life: 0.4, size: 4, color: '#ff8a3d' }); break;
    case 'checkpoint': sfx.play('click'); break;
    case 'lap':
      sfx.play('checkpoint');
      say(`LAP ${ev.n} · ${formatTime(ev.ms)}${ev.best ? ' · BEST!' : ''}`, 2);
      if (ev.clean) shell.facts({ cleanLap: true });
      break;
    case 'finish': if (MP.on) mpDone(); else finish(); break;
    default: break;
  }
}

function finish(extra = {}) {
  const T = track.def;
  const ms = race.raceMs;
  const medal = ms <= T.medals.gold ? 'gold' : ms <= T.medals.silver ? 'silver' : ms <= T.medals.bronze ? 'bronze' : null;
  const names = { gold: 'Gold Medal!', silver: 'Silver Medal!', bronze: 'Bronze Medal!' };
  const icon = { gold: '🥇', silver: '🥈', bronze: '🥉' };
  const r = {
    win: !!medal, title: medal ? names[medal] : 'Race Complete', subtitle: `${T.name}${medal ? ' ' + icon[medal] : ''}`,
    score: ms, scoreText: formatTime(ms),
    extras: { driftBest: race.driftTotal }, extrasLow: { bestLap: race.bestLapMs },
    facts: { track: T.id, ms, lapMs: race.bestLapMs, drift: race.driftTotal, megaDrifts: race.megaDrifts, cleanLap: race.cleanLaps > 0, boosts: race.boostUses, medal },
    counters: { boosts: race.boostUses, ['t_' + T.id]: 1 },
    milestones: [['Medal', medal === 'gold' ? 50 : medal === 'silver' ? 35 : medal === 'bronze' ? 20 : 0], ['Drift score', Math.min(40, Math.floor(race.driftTotal / 500) * 5)], ['Clean laps', Math.min(20, race.cleanLaps * 10)]],
    summary: `${T.name} ${formatTime(ms)}`,
    stats: [['Best lap', formatTime(race.bestLapMs)], ['Drift score', formatScore(race.driftTotal)], ['Mega drifts', String(race.megaDrifts)], ['Wall hits', String(race.wallHits)], ['Gold time', formatTime(T.medals.gold)], ['Boosts used', String(race.boostUses)]],
  };
  shell.finish({ ...r, ...extra, facts: { ...r.facts, ...(extra.facts || {}) }, counters: { ...r.counters, ...(extra.counters || {}) }, milestones: [...r.milestones, ...(extra.milestones || [])] });
}

// ---------------------------------------------------------------- rendering
function drawDecor(ctx, left, right, top, bottom) {
  const th = track.def.theme;
  for (const d of decor) {
    if (d.x < left - 100 || d.x > right + 100 || d.y < top - 100 || d.y > bottom + 100) continue;
    ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.s, d.s);
    if (d.kind === 'city') {
      ctx.fillStyle = ['#141a4a', '#1c1650', '#101a3d', '#201858'][d.k];
      ctx.fillRect(-50, -50, 100, 100);
      ctx.strokeStyle = d.k % 2 ? th.edgeA : th.edgeB; ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.strokeRect(-50, -50, 100, 100); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,225,77,.55)'; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) ctx.fillRect(-36 + a * 28, -36 + b * 28, 12, 12);
    } else if (d.kind === 'coast') {
      ctx.fillStyle = '#2a8a5a'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 18, Math.sin(a) * 18, 26, 8, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#0c3a2a'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill(); ctx.fillStyle = '#145a3e'; ctx.beginPath(); ctx.arc(-6, -6, 22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function strokeLoop(ctx, pts, closed) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  ctx.stroke();
}

function render(ctx, W, H) {
  const th = track.def.theme;
  const sunset = track.def.id === 'sunset';
  ctx.fillStyle = th.ground; ctx.fillRect(0, 0, W, H);
  const z = cam.z;
  ctx.save();
  ctx.translate(W / 2 + shake.x, H / 2 + shake.y);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  const left = cam.x - W / 2 / z, right = cam.x + W / 2 / z, top = cam.y - H / 2 / z, bottom = cam.y + H / 2 / z;
  const glow = !shell.lowFx && !shell.reduced;
  // ground texture
  ctx.strokeStyle = th.grid; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = Math.floor(left / 160) * 160; x < right; x += 160) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = Math.floor(top / 160) * 160; y < bottom; y += 160) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();
  if (sunset) { // the sea beyond the coast
    ctx.fillStyle = 'rgba(40,150,220,.85)';
    ctx.fillRect(left, track.def.cy + track.def.b * 1.55, right - left, bottom);
  }
  drawDecor(ctx, left, right, top, bottom);

  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // grass verge, edge glow, road
  ctx.strokeStyle = th.grass; ctx.lineWidth = track.def.width + track.grassW * 2; strokeLoop(ctx, track.pts, true);
  if (glow) { ctx.strokeStyle = th.edgeA; ctx.globalAlpha = 0.35; ctx.lineWidth = track.def.width + 26; strokeLoop(ctx, track.pts, true); ctx.globalAlpha = 1; }
  ctx.strokeStyle = th.edgeB; ctx.lineWidth = track.def.width + 10; strokeLoop(ctx, track.pts, true);
  ctx.strokeStyle = th.road; ctx.lineWidth = track.def.width - 6; strokeLoop(ctx, track.pts, true);
  ctx.strokeStyle = th.line; ctx.lineWidth = 4; ctx.setLineDash([36, 40]); strokeLoop(ctx, track.pts, true); ctx.setLineDash([]);
  // shortcut (dirt)
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = track.cutWidth + track.grassW * 2; strokeLoop(ctx, track.cut, false);
  ctx.strokeStyle = '#a8794a'; ctx.lineWidth = track.cutWidth; strokeLoop(ctx, track.cut, false);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.setLineDash([14, 16]); strokeLoop(ctx, track.cut, false); ctx.setLineDash([]);

  // start / finish line
  const p0 = track.pts[0], t0 = track.tan[0];
  ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(Math.atan2(t0.y, t0.x));
  const hw = track.half;
  for (let r = 0; r < 2; r++) for (let q = 0; q < Math.floor(hw * 2 / 20); q++) { ctx.fillStyle = (r + q) % 2 ? '#fff' : '#111'; ctx.fillRect(-10 + r * 12 - 6, -hw + q * 20, 12, 20); }
  ctx.restore();

  // checkpoints (faint gates) + boost pads
  ctx.lineWidth = 3;
  for (const i of track.cps) { const p = track.pts[i], t = track.tan[i]; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(p.x - t.y * hw, p.y + t.x * hw); ctx.lineTo(p.x + t.y * hw, p.y - t.x * hw); ctx.stroke(); }
  for (const pad of track.pads) {
    ctx.save(); ctx.translate(pad.x, pad.y); ctx.rotate(Math.atan2(pad.dir.y, pad.dir.x));
    ctx.fillStyle = 'rgba(45,226,230,.18)'; ctx.fillRect(-26, -pad.w / 2, 52, pad.w);
    if (glow) { ctx.shadowColor = '#2de2e6'; ctx.shadowBlur = 14; }
    ctx.strokeStyle = '#2de2e6'; ctx.lineWidth = 5;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-12 + k * 14, -pad.w / 2 + 8); ctx.lineTo(4 + k * 14, 0); ctx.lineTo(-12 + k * 14, pad.w / 2 - 8); ctx.stroke(); }
    ctx.restore();
  }
  // skids
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = 0; i < skids.length; i++) { const s = skids[i]; ctx.strokeStyle = `rgba(10,10,20,${0.25 * s.a})`; ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke(); }
  // cones
  for (const cone of track.cones) {
    if (cone.x < left - 40 || cone.x > right + 40 || cone.y < top - 40 || cone.y > bottom + 40) continue;
    ctx.save(); ctx.translate(cone.x, cone.y); ctx.rotate(cone.rot);
    ctx.fillStyle = '#ff7a2e'; ctx.beginPath(); ctx.arc(0, 0, cone.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, cone.r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff7a2e'; ctx.beginPath(); ctx.arc(0, 0, cone.r * 0.25, 0, TAU); ctx.fill();
    ctx.restore();
  }
  fx.draw(ctx);
  if (MP.on) drawGhosts(ctx, glow);
  drawCar(ctx, glow);
  pops.draw(ctx);
  ctx.restore();

  if (flash > 0) { ctx.globalAlpha = flash * 0.25; ctx.fillStyle = '#ff3c5a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawHud(ctx, W, H);
}

function drawCar(ctx, glow) {
  const c = race.car;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
  // headlight beams
  if (glow) { const g = ctx.createLinearGradient(16, 0, 120, 0); g.addColorStop(0, 'rgba(255,255,220,.35)'); g.addColorStop(1, 'rgba(255,255,220,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(16, -8); ctx.lineTo(120, -34); ctx.lineTo(120, 34); ctx.lineTo(16, 8); ctx.closePath(); ctx.fill(); }
  if (glow) { ctx.shadowColor = race.boosting ? '#ffe14d' : '#ff8a3d'; ctx.shadowBlur = 16; }
  ctx.fillStyle = '#ff8a3d';
  roundRectPath(ctx, -20, -11, 40, 22, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#2a1608'; roundRectPath(ctx, -6, -8, 15, 16, 4); ctx.fill();
  ctx.fillStyle = '#ffe14d'; ctx.fillRect(15, -9, 4, 5); ctx.fillRect(15, 4, 4, 5);
  ctx.fillStyle = '#fff'; ctx.fillRect(-20, -2, 6, 4);
  ctx.fillStyle = '#c0501a'; ctx.fillRect(-4, -11, 2, 22);
  ctx.restore();
}

function drawHud(ctx, W, H) {
  ctx.textBaseline = 'middle';
  // boost meter
  const bw = Math.min(260, W * 0.4), bx = W / 2 - bw / 2, by = H - 34;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRectPath(ctx, bx - 2, by - 2, bw + 4, 16, 8); ctx.fill();
  ctx.fillStyle = race.boost >= 0.5 ? '#2de2e6' : '#6a86ff'; roundRectPath(ctx, bx, by, Math.max(0, bw * race.boost), 12, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(race.boost >= 0.5 ? 'BOOST READY' : 'BOOST', W / 2, by - 8);
  // drift readout
  if (driftLive > 0.15) {
    const mega = driftLive >= 1.5;
    ctx.fillStyle = mega ? '#ff3cac' : '#ffe14d'; ctx.font = `900 ${mega ? 26 : 20}px "Trebuchet MS", sans-serif`;
    ctx.fillText(mega ? `MEGA DRIFT ${driftLive.toFixed(1)}s` : `DRIFT ${driftLive.toFixed(1)}s`, W / 2, H * 0.22);
  }
  // speed
  const sp = Math.hypot(race.car.vx, race.car.vy);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '900 22px ui-monospace, Menlo, monospace';
  ctx.fillText(String(Math.round(sp * 0.35)), W - 14, H - 40); ctx.font = '700 10px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#b9bff0'; ctx.fillText('KM/H', W - 14, H - 22);
  // lap info
  ctx.textAlign = 'left'; ctx.font = '700 13px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(`Lap ${formatTime(Math.round(race.lapTime * 1000))}`, 14, H - 40);
  ctx.fillStyle = '#ffe14d'; ctx.fillText(`Best ${race.bestLapMs ? formatTime(race.bestLapMs) : '--'}`, 14, H - 22);
  // minimap
  if (mini) {
    const mw = 120, mh = 76, mx = W - mw - 12, my = 10;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; roundRectPath(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.fill();
    const sx = mw / (mini.x1 - mini.x0), sy = mh / (mini.y1 - mini.y0), s = Math.min(sx, sy);
    const ox = mx + (mw - (mini.x1 - mini.x0) * s) / 2, oy = my + (mh - (mini.y1 - mini.y0) * s) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5; ctx.beginPath();
    track.pts.forEach((p, i) => { const x = ox + (p.x - mini.x0) * s, y = oy + (p.y - mini.y0) * s; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath(); ctx.stroke();
    if (MP.on) for (const g of ghostList()) { ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(ox + (g.x - mini.x0) * s, oy + (g.y - mini.y0) * s, 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.arc(ox + (race.car.x - mini.x0) * s, oy + (race.car.y - mini.y0) * s, 4, 0, TAU); ctx.fill();
  }
  // countdown / banners
  ctx.textAlign = 'center';
  if (race.state === 'countdown' && shell.state === 'playing') {
    const n = Math.ceil(race.cd);
    if (n >= 1 && n <= 3) { ctx.fillStyle = '#fff'; ctx.font = '900 96px "Trebuchet MS", sans-serif'; ctx.globalAlpha = 0.5 + 0.5 * (race.cd % 1); ctx.fillText(String(n), W / 2, H * 0.4); ctx.globalAlpha = 1; }
    else { ctx.fillStyle = '#ffe14d'; ctx.font = '900 30px "Trebuchet MS", sans-serif'; ctx.fillText('GET READY', W / 2, H * 0.4); }
  }
  if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT * 2); ctx.fillStyle = '#fff'; ctx.font = '900 28px "Trebuchet MS", sans-serif'; ctx.fillText(banner, W / 2, H * 0.32); ctx.globalAlpha = 1; }
  if (race.wrongWay > 1.2) { ctx.fillStyle = '#ff3c5a'; ctx.font = '900 30px "Trebuchet MS", sans-serif'; ctx.fillText('WRONG WAY!', W / 2, H * 0.45); }
  ctx.textAlign = 'left';
}

window.__drift = { get race() { return race; }, shell, tracks, MP, forceFinish(ms) { race.time = ms / 1000; race.state = 'finished'; race.finished = true; handle({ type: 'finish', ms }); } };


// ================================================================ Multiplayer race
const MP_SCHEMA = [{ key: 'track', label: 'Track', type: 'select', options: TRACK_DEFS.map((d) => ({ v: d.id, label: d.name })) }];
const MP_CFG = { supported: true, minPlayers: 2, maxPlayers: 6, bots: false, local: false, online: true };
let waitEl = null;

function mpReady(sh) {
  MP.kit = createMpKit({
    shell: sh, game: { id: ID, title: 'Drift Circuit', accent: '#ff8a3d', mp: MP_CFG, players: '2–6 players · first across the line wins' },
    schema: MP_SCHEMA, defaults: { track: 'neon' }, localMax: 0, settingsKey: 'dc.cfg',
    hostExtra: () => ({ t0: Date.now() }),
    onStart: mpStart,
  });
  MP.kit.start();
  window.__dcmp = { MP, get kit() { return MP.kit; } };
}

function mpStart(info) {
  mpCleanup();
  MP.on = true; MP.info = info; MP.room = info.room; MP.ended = false; MP.doneAt = 0; MP.seq = 0;
  MP.kit.clearNotice();
  const roster = info.roster.slice(0, 6);
  MP.board = new PeerBoard(info.room, roster, { stage: shell.stage, higher: false, fmt: (p) => (p.done ? formatTime(p.score) : '…') });
  MP.keyToIdx = MP.board.keyToIdx; MP.myIdx = MP.board.myIdx;
  MP.tracks = new Map(); MP.prog = new Map(); MP.lastSeq = new Map();
  roster.forEach((m, i) => { MP.names.set(i, String(m.name)); if (i !== MP.myIdx) MP.tracks.set(i, new Track(130)); });
  MP.offs = [
    MP.kit.wire(info.room, { onClosed: () => { if (MP.on) mpLeave(); } }),
    info.room.onMsg('car', (d, from) => {
      const i = MP.keyToIdx.get(from.key);
      if (i === undefined || i === MP.myIdx || !Array.isArray(d) || d.length < 6) return;
      const seq = int(d[0], 0, 1e9, -1);
      if (seq <= (MP.lastSeq.get(i) ?? -1)) return;
      MP.lastSeq.set(i, seq);
      const a = num(d[3], -10, 10), v = num(d[4], 0, 1200);
      MP.tracks.get(i).push({ x: num(d[1], -1e5, 1e5), y: num(d[2], -1e5, 1e5), a, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
      MP.prog.set(i, num(d[5], -1e6, 1e6));
    }),
  ];
  MP.kit.setStatus('game');
  shell.mode = info.settings.track;
  shell.restart();
}

function ghostList() {
  const out = [];
  for (const [i, t] of MP.tracks) {
    const g = t.at();
    if (!g) continue;
    const sp = Math.hypot(g.vx, g.vy);
    out.push({ i, x: g.x, y: g.y, a: sp > 25 ? Math.atan2(g.vy, g.vx) : g.a, color: GHOST_COLORS[i % GHOST_COLORS.length], name: MP.names.get(i) || '' });
  }
  return out;
}

function drawGhosts(ctx, glow) {
  for (const g of ghostList()) {
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a);
    if (glow) { ctx.shadowColor = g.color; ctx.shadowBlur = 12; }
    ctx.fillStyle = g.color; roundRectPath(ctx, -20, -11, 40, 22, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRectPath(ctx, -6, -8, 15, 16, 4); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(15, -9, 4, 5); ctx.fillRect(15, 4, 4, 5);
    ctx.restore();
    ctx.font = '800 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = g.name.slice(0, 10), w = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(8,9,30,.75)'; roundRectPath(ctx, g.x - w / 2, g.y - 34, w, 16, 8); ctx.fill();
    ctx.fillStyle = g.color; ctx.fillText(label, g.x, g.y - 26);
  }
}

/** Current place (1-based) among everyone, using finish times first and race progress otherwise. */
function myPlace() {
  const board = MP.board;
  const rows = [...board.peers.entries()].map(([i, p]) => ({ i, me: i === MP.myIdx, done: p.done, ms: p.score, prog: i === MP.myIdx ? race.progress : (MP.prog.get(i) ?? -1e9) }));
  rows.sort((a, b) => (b.done - a.done) || (a.done && b.done ? a.ms - b.ms : b.prog - a.prog));
  return { rows, place: rows.findIndex((r) => r.me) + 1 };
}

function mpUpdate(dt) {
  const board = MP.board;
  if (MP.tick.tick(dt) && !race.finished) {
    const c = race.car;
    MP.room.send('car', [MP.seq++, Math.round(c.x), Math.round(c.y), Math.round(c.a * 100) / 100, Math.round(Math.hypot(c.vx, c.vy)), Math.round(race.progress * 10) / 10, race.boosting ? 1 : 0]);
  }
  board.update(dt, { done: race.finished, score: race.finished ? Math.round(race.time * 1000) : 0, aux: { p: Math.round(race.progress) } });
  board.ui(dt);
  const { place } = myPlace();
  shell.hud('pos', `${rankText(place)}/${board.peers.size}`);
  if (race.finished && !MP.ended) {
    if (!MP.doneAt) MP.doneAt = performance.now();
    const left = board.others.filter((p) => !p.done).length;
    if (waitEl) waitEl.textContent = `You finished! Waiting for ${left} more driver${left === 1 ? '' : 's'}…`;
    if (board.allOthersDone || performance.now() - MP.doneAt > 45000) mpFinish();
  }
}

function mpDone() {
  say('FINISHED!', 3);
  if (!waitEl) { waitEl = document.createElement('div'); waitEl.className = 'mp-wait'; shell.stage.appendChild(waitEl); }
}

function mpFinish() {
  if (MP.ended) return;
  MP.ended = true;
  MP.board.update(0, { done: true, score: Math.round(race.time * 1000), aux: {} });
  if (waitEl) { waitEl.remove(); waitEl = null; }
  const { rows } = myPlace();
  const rank = rows.findIndex((r) => r.me) + 1, n = rows.length;
  const win = rank === 1;
  const second = rows[1];
  const myMs = Math.round(race.time * 1000);
  const margin = win && second && second.done ? second.ms - myMs : null;
  const photo = win && margin !== null && margin >= 0 && margin < 300;
  const list = rows.map((r) => ({ name: MP.board.peers.get(r.i).name, text: r.done ? formatTime(r.ms) : 'DNF', me: r.me, note: r.done && r.i !== rows[0].i && rows[0].done ? `+${((r.ms - rows[0].ms) / 1000).toFixed(2)}s` : '' }));
  finish({
    win, title: win ? 'You won the race!' : `Race over · ${rankText(rank)}`, subtitle: `${track.def.name} · ${rankText(rank)} of ${n}`,
    facts: { race: true, win, players: n, rank, photo, margin: margin === null ? 9999 : margin },
    counters: { mpRaces: 1, raceWins: win ? 1 : 0 },
    milestones: [...(win ? [['Won the race', 25]] : []), ['Raced with others', 10]],
    extraHTML: standingsHTML(list, 'Race results'),
    buttonsHTML: '<button type="button" class="g-btn primary big" data-act="dc-again">PLAY AGAIN</button><button type="button" class="g-btn" data-act="dc-mode">CHANGE TRACK</button><button type="button" class="g-btn" data-act="dc-lobby">RETURN TO LOBBY</button><a class="g-btn" href="../../index.html">ARCADE HOME</a>',
  });
  MP.kit.setStatus('lobby');
}

function mpCleanup() {
  MP.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); MP.offs = [];
  if (MP.board) { MP.board.dispose(); MP.board = null; }
  if (waitEl) { waitEl.remove(); waitEl = null; }
}

function mpLeave() {
  const room = MP.room;
  MP.on = false; MP.room = null;
  mpCleanup();
  if (room && !room.closed) room.leave().catch(() => {});
  MP.kit.conn(undefined);
  shell.toReady();
  MP.kit.setStatus('online');
  MP.kit.lobby.openMenu();
}

function mpBackToRoom(ready) {
  const room = MP.room;
  MP.on = false;
  mpCleanup();
  MP.kit.conn(undefined);
  shell.toReady();
  MP.kit.setStatus('lobby');
  MP.kit.lobby.backToRoom(room, { ready });
}

function mpAct(act) {
  if (act === 'dc-again') { mpBackToRoom(true); return true; }
  if (act === 'dc-mode' || act === 'dc-lobby') { mpBackToRoom(false); return true; }
  if (act === 'dc-leave') { mpLeave(); return true; }
  if (act === 'restart') return true;
  return false;
}

function mpPauseHTML() {
  return `<h2 id="g-panel-title">Menu</h2><p class="p-sub">The race keeps going while this menu is open.</p>
    <div class="p-menu"><button type="button" class="g-btn primary big" data-act="resume">Resume</button><button type="button" class="g-btn" data-act="help">How to play</button>
    <button type="button" class="g-btn" data-act="mute">${shell.store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button><button type="button" class="g-btn" data-act="dc-leave">Leave race</button><a class="g-btn" href="../../index.html">Arcade Home</a></div>`;
}
