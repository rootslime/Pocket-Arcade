// Pocket Tag: shell wiring, input (keyboard / touch stick / controllers, up to 4 local players), match
// lifecycle for bots, local and online matches, HUD, effects and the results screen.
import { createShell, formatScore } from '../../js/shell.js';
import * as store from '../../js/storage.js';
import { sfx } from '../../js/audio.js';
import * as gp from '../../js/gamepad.js';
import { createLobby } from '../../js/lobby.js';
import { cleanSettings } from '../../js/rooms.js';
import { identity, LINK, stateLabel, onlineAvailable } from '../../js/multiplayer.js';
import * as presence from '../../js/presence.js';
import { esc } from '../../js/ui.js';
import { toast } from '../../js/toast.js';
import { World, MODES, MODE_LIST, PH, NOINPUT } from './sim.js';
import { MAPS, mapById } from './maps.js';
import { DIFFICULTIES } from './bots.js';
import { Renderer } from './render.js';
import { NetSession } from './net.js';

const ACCENT = '#ffb347';
const BOT_NAMES = ['Pip', 'Zed', 'Mochi', 'Blip', 'Nova', 'Juno', 'Kiwi', 'Roxy'];
const MAX_PLAYERS = 8;

// ------------------------------------------------------------------ lobby settings
export const SCHEMA = [
  { key: 'mode', label: 'Mode', type: 'select', options: MODE_LIST.map((m) => ({ v: m.id, label: m.label })), hint: (v) => (MODES[v] || MODES.classic).blurb },
  { key: 'map', label: 'Map', type: 'select', options: MAPS.map((m) => ({ v: m.id, label: m.name })), hint: (v) => mapById(v).blurb },
  { key: 'bots', label: 'Bots', type: 'select', options: Array.from({ length: 8 }, (_, i) => ({ v: i, label: String(i) })) },
  { key: 'diff', label: 'Bot difficulty', type: 'select', options: Object.entries(DIFFICULTIES).map(([id, d]) => ({ v: id, label: d.label })), when: (v) => v.bots > 0 },
  { key: 'powerups', label: 'Power-ups', type: 'toggle', hint: 'Speed, shield, ghost, slow zone and dash refills.' },
];
export const DEFAULTS = { mode: 'classic', map: 'playground', bots: 3, diff: 'normal', powerups: true };
const loadSettings = () => { let raw = {}; try { raw = JSON.parse(store.getSetting('pt.cfg') || '{}'); } catch (e) { /* ignore */ } return cleanSettings(SCHEMA, raw, DEFAULTS); };

const MP = { supported: true, minPlayers: 2, maxPlayers: MAX_PLAYERS, bots: true, local: true, online: true };

// ------------------------------------------------------------------ state
const R = new Renderer();
let shell = null, lobby = null;
let match = null;            // the running match (see startMatch)
let pending = null;          // match info handed to reset()
let demo = null;             // decorative bots running behind the menus
let lastCount = -1;
let stickVec = { x: 0, y: 0, on: false };
const padPrev = {};

const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ------------------------------------------------------------------ input
const KEYS = {};
for (const [set, map] of [['a', { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space', slide: 'KeyC', dash: 'KeyF' }],
  ['b', { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', sprint: 'ShiftRight', jump: 'Enter', slide: 'Period', dash: 'Slash' }]]) {
  for (const [k, code] of Object.entries(map)) KEYS[`${set}_${k}`] = [code];
}
KEYS.a_dash.push('KeyE'); KEYS.b_sprint.push('ControlRight');
KEYS.t_jump = []; KEYS.t_slide = []; KEYS.t_dash = [];

function readKb(set) {
  const i = shell.input, d = (n) => i.down(`${set}_${n}`), p = (n) => i.pressed(`${set}_${n}`);
  return { mx: (d('right') ? 1 : 0) - (d('left') ? 1 : 0), my: (d('down') ? 1 : 0) - (d('up') ? 1 : 0), sprint: d('sprint'), jump: p('jump'), slide: p('slide'), dash: p('dash') };
}
function readTouch() {
  const i = shell.input;
  return { mx: stickVec.x, my: stickVec.y, sprint: stickVec.on && Math.hypot(stickVec.x, stickVec.y) > 0.92, jump: i.pressed('t_jump'), slide: i.pressed('t_slide'), dash: i.pressed('t_dash') };
}
function readPad(pad) {
  let mx = pad.ax(0), my = pad.ax(1);
  const stick = Math.hypot(mx, my);
  if (pad.btn(14)) mx = -1; if (pad.btn(15)) mx = 1; if (pad.btn(12)) my = -1; if (pad.btn(13)) my = 1;
  const edge = (b) => { const k = `${pad.index}:${b}`, now = pad.btn(b), was = padPrev[k]; padPrev[k] = now; return now && !was; };
  const jump = edge(0), slide = edge(1), dash = edge(2) || edge(3);
  return { mx, my, sprint: pad.btn(7) || pad.btn(6) || pad.btn(5) || pad.btn(4) || stick > 0.95, jump, slide, dash };
}
function merge(list) {
  const o = { mx: 0, my: 0, sprint: false, jump: false, slide: false, dash: false };
  for (const r of list) { o.mx += r.mx; o.my += r.my; o.sprint = o.sprint || r.sprint; o.jump = o.jump || r.jump; o.slide = o.slide || r.slide; o.dash = o.dash || r.dash; }
  const l = Math.hypot(o.mx, o.my);
  if (l > 1) { o.mx /= l; o.my /= l; }
  return o;
}
/** Which physical device drives each local player. */
function assignDevices(n) {
  const pads = gp.allPads();
  if (n === 1) return [{ kind: 'all' }];
  const pool = pads.length >= n ? pads.map((p) => ({ kind: 'pad', pad: p.index })) : [{ kind: 'kbA' }, { kind: 'kbB' }, ...pads.map((p) => ({ kind: 'pad', pad: p.index }))];
  return pool.slice(0, n);
}
function readDevice(dev) {
  if (dev.kind === 'kbA') return readKb('a');
  if (dev.kind === 'kbB') return readKb('b');
  if (dev.kind === 'pad') { const p = gp.allPads().find((x) => x.index === dev.pad); return p ? readPad(p) : NOINPUT; }
  const parts = [readKb('a'), readKb('b'), readTouch()];
  const pads = gp.allPads();
  if (pads.length) parts.push(readPad(pads[0]));
  return merge(parts);
}

// floating touch stick: touch anywhere on the play area, push to the edge to sprint
function setupStick(stage) {
  const ui = document.createElement('div');
  ui.className = 'pt-stick'; ui.hidden = true; ui.innerHTML = '<i></i>';
  stage.appendChild(ui);
  let id = null, bx = 0, by = 0;
  const R_ = 46;
  const move = (e) => {
    const dx = e.clientX - bx, dy = e.clientY - by, d = Math.hypot(dx, dy);
    const k = Math.min(1, d / R_);
    stickVec = { x: d > 6 ? (dx / d) * k : 0, y: d > 6 ? (dy / d) * k : 0, on: true };
    const kx = d > R_ ? (dx / d) * R_ : dx, ky = d > R_ ? (dy / d) * R_ : dy;
    ui.firstElementChild.style.transform = `translate(${kx}px, ${ky}px)`;
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || id !== null) return;
    id = e.pointerId; bx = e.clientX; by = e.clientY;
    try { stage.setPointerCapture(id); } catch (er) { /* ignore */ }
    const r = stage.getBoundingClientRect();
    ui.style.left = `${bx - r.left - 60}px`; ui.style.top = `${by - r.top - 60}px`; ui.hidden = false;
    ui.firstElementChild.style.transform = 'translate(0,0)';
    sfx.unlock(); move(e);
  });
  stage.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; stickVec = { x: 0, y: 0, on: false }; ui.hidden = true; };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end); stage.addEventListener('lostpointercapture', end);
}

// ------------------------------------------------------------------ match construction
function rosterFor(info) {
  const me = identity();
  const hum = [];
  if (info.kind === 'online') {
    info.roster.slice(0, MAX_PLAYERS).forEach((m, i) => hum.push({ id: String(m.key), name: String(m.name), level: m.lv, avatar: m.av, human: true, ctrl: m.key === info.room.key ? 'local' : 'remote', slot: i }));
  } else {
    const n = info.kind === 'local' ? info.humans : 1;
    for (let i = 0; i < n; i++) hum.push({ id: `h${i}`, name: i === 0 ? me.name : `Player ${i + 1}`, level: me.lv, avatar: me.av, human: true, ctrl: 'local', slot: i });
  }
  const want = info.kind === 'online' ? (info.extra && Array.isArray(info.extra.bots) ? info.extra.bots.length : 0) : info.settings.bots;
  const nBots = Math.max(0, Math.min(want, MAX_PLAYERS - hum.length, info.kind === 'bots' ? 7 : 7));
  const bots = [];
  const diff = info.kind === 'online' ? (info.extra && DIFFICULTIES[info.extra.diff] ? info.extra.diff : 'normal') : info.settings.diff;
  for (let i = 0; i < nBots; i++) bots.push({ id: `bot${i}`, name: info.kind === 'online' && info.extra.bots[i] ? String(info.extra.bots[i]).slice(0, 12) : BOT_NAMES[i % BOT_NAMES.length], human: false, ctrl: 'bot', diff, level: 1 });
  let all = [...hum, ...bots];
  if (all.length < 2) all = [...all, { id: 'bot0', name: BOT_NAMES[0], human: false, ctrl: 'bot', diff, level: 1 }];
  return all;
}

function buildMatch(info) {
  const settings = info.settings;
  const roster = rosterFor(info);
  const seed = info.kind === 'online' ? ((info.extra && info.extra.seed) >>> 0) : (Math.random() * 4294967296) >>> 0;
  const online = info.kind === 'online';
  const isHost = online ? info.isHost : true;
  const world = new World({ mapId: settings.map, mode: settings.mode, seed, roster, role: isHost ? 'auth' : 'follower', powerups: settings.powerups });
  const locals = [];
  const devs = assignDevices(roster.filter((r) => r.ctrl === 'local').length);
  roster.forEach((r, i) => { if (r.ctrl === 'local') locals.push({ idx: i, dev: devs[locals.length] || devs[0] }); });
  const m = { info, kind: info.kind, settings, world, locals, me: locals[0] ? locals[0].idx : null, net: null, room: online ? info.room : null, ended: false, humans: roster.filter((r) => r.human).length, startedAt: performance.now(), id: info.matchId || null };
  if (online) {
    const keyToIdx = new Map();
    roster.forEach((r, i) => { if (r.human) keyToIdx.set(r.id, i); });
    m.net = new NetSession({ room: info.room, world, myIdx: m.me, keyToIdx, onEvent: onEvent, onEnd: () => {} });
    wireRoom(m);
  }
  return m;
}

function makeDemo() {
  const roster = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: BOT_NAMES[i], human: false, ctrl: 'bot', diff: 'normal' }));
  const mp = MAPS[Math.floor(Math.random() * MAPS.length)];
  const w = new World({ mapId: mp.id, mode: 'classic', seed: (Math.random() * 4294967296) >>> 0, roster, powerups: false, role: 'auth' });
  w.phase = 'play'; w.cd = 0;
  return { world: w, kind: 'demo', locals: [], me: null, net: null, t: 0 };
}

// ------------------------------------------------------------------ positions for drawing
function posOf(p) {
  const net = match && match.net;
  const r = net ? net.render(p) : null;
  if (r) {
    const sp = Math.hypot(r.vx || 0, r.vy || 0);
    return { x: r.x, y: r.y, z: r.z, vx: r.vx, vy: r.vy, fl: r.fl, fx: sp > 25 ? r.vx / sp : p.fx, fy: sp > 25 ? r.vy / sp : p.fy };
  }
  return { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, fl: p.flags, fx: p.fx, fy: p.fy };
}

// ------------------------------------------------------------------ effects from game events
function onEvent(e) {
  const m = match || demo;
  if (!m || m.kind === 'demo') return;
  const w = m.world, P = (i) => w.players[i];
  const mine = (i) => m.locals.some((L) => L.idx === i);
  const reduced = shell.reduced;
  switch (e.k) {
    case 'tag': {
      const a = P(e.a), b = P(e.b);
      if (!a || !b) break;
      const pos = posOf(b);
      R.burst(pos.x, pos.y - 6, b.color, 20); R.burst(pos.x, pos.y - 6, '#ffffff', 8, 160);
      const involved = mine(e.a) || mine(e.b);
      sfx.play(w.mode === 'freeze' ? 'freeze' : w.mode === 'crown' ? 'crown' : 'tag');
      if (involved) { R.doShake(7, reduced); R.doFlash(mine(e.b) ? '#ff2d55' : '#ffffff', 0.5, reduced); }
      if (w.mode === 'classic') R.showBanner(mine(e.b) ? 'YOU’RE IT!' : `${b.name.toUpperCase()} IS IT!`, mine(e.b) ? '#ff2d55' : '#ffffff', 'TAG!');
      else if (w.mode === 'freeze') R.showBanner(mine(e.b) ? 'YOU’RE FROZEN!' : `${b.name.toUpperCase()} FROZEN!`, '#8fd8ff', 'TAG!');
      else if (w.mode === 'infection') R.showBanner(mine(e.b) ? 'YOU’RE INFECTED!' : `${b.name.toUpperCase()} INFECTED!`, '#7dff5d', 'TAG!');
      else R.showBanner(mine(e.a) ? 'YOU TOOK THE CROWN!' : `${a.name.toUpperCase()} HAS THE CROWN!`, '#ffe14d', 'TAG!');
      break;
    }
    case 'thaw': { const b = P(e.b), a = P(e.a); if (!b) break; const pos = posOf(b); R.burst(pos.x, pos.y - 6, '#bfefff', 16, 180); sfx.play('thaw'); if (mine(e.b) || mine(e.a)) R.showBanner(mine(e.b) ? 'THAWED!' : `YOU THAWED ${b.name.toUpperCase()}!`, '#8fd8ff'); void a; break; }
    case 'pickup': { const p = P(e.i); if (!p) break; const pos = posOf(p); R.burst(pos.x, pos.y - 6, '#ffe14d', 12, 160); sfx.play('powerup'); if (mine(e.i) && e.kind) R.showBanner(`${({ speed: '⚡ SPEED BURST', shield: '🛡️ SHIELD', ghost: '👻 GHOST', slow: '❄️ SLOW ZONE', dash: '💨 DASH READY' })[e.kind] || 'POWER-UP'}`, '#ffe14d', '', 1100); break; }
    case 'shield': { const b = P(e.b); if (!b) break; const pos = posOf(b); R.burst(pos.x, pos.y - 6, '#6fd2ff', 16, 200); sfx.play('shield'); R.doShake(4, reduced); if (mine(e.b)) R.showBanner('BLOCKED!', '#6fd2ff', 'Shield used', 1100); break; }
    case 'go': sfx.play('go'); R.showBanner('GO!', '#5dff8f', '', 900); break;
    case 'jump': if (mine(e.i)) { sfx.play('jump'); const pos = posOf(P(e.i)); R.puff(pos.x, pos.y); } break;
    case 'vault': if (mine(e.i)) { sfx.play('whoosh'); const pos = posOf(P(e.i)); R.puff(pos.x, pos.y); } break;
    case 'slide': if (mine(e.i)) { sfx.play('whoosh'); const pos = posOf(P(e.i)); R.puff(pos.x, pos.y, 'rgba(255,255,255,.5)', 7); } break;
    case 'dash': if (mine(e.i)) sfx.play('dash'); break;
    case 'ramp': if (mine(e.i)) sfx.play('jump'); break;
    case 'fall': { const p = P(e.i); if (!p) break; if (mine(e.i)) { sfx.play('hit'); R.doShake(5, reduced); } break; }
    case 'left': { const p = P(e.i); if (p && !mine(e.i)) toast({ icon: '👋', title: `${p.name} left the match`, color: '#2de2e6', ms: 2200 }); break; }
    case 'it': { const b = P(e.b); if (b) R.showBanner(mine(e.b) ? 'YOU’RE IT!' : `${b.name.toUpperCase()} IS IT!`, '#ff2d55'); break; }
    case 'crown': { const b = P(e.b); if (b) R.showBanner(`${b.name.toUpperCase()} HAS THE CROWN!`, '#ffe14d'); break; }
    default: break;
  }
}

// ------------------------------------------------------------------ online wiring
let connEl = null, noticeEl = null;
function setConn(state) {
  if (!connEl) return;
  connEl.hidden = state === LINK.CONNECTED || state === undefined;
  connEl.textContent = stateLabel(state);
  connEl.className = `pt-conn ${state || ''}`;
}
function wireRoom(m) {
  const room = m.room;
  m.offs = [
    room.on('state', (s) => setConn(s)),
    room.on('hostchange', (h) => {
      if (h.me) { m.net.becomeHost(); toast({ icon: '👑', title: 'You are now the host', text: 'The previous host left. The match goes on.', color: '#ffe14d', ms: 3500 }); }
      else toast({ icon: '👑', title: `${h.host ? h.host.name : 'Someone'} is now the host`, color: '#2de2e6', ms: 2500 });
    }),
    room.on('closed', (c) => {
      if (match !== m) return;
      if (c.reason === 'connection') notice('Connection lost', 'We couldn’t get you back online, so the match ended. Your progress so far is saved.', [{ act: 'menu', label: 'Back to menu', primary: true }]);
    }),
    room.on('reconnected', () => toast({ icon: '🟢', title: 'Reconnected', color: '#5dff8f', ms: 1800 })),
  ];
}
function unwireRoom(m) { if (m && m.offs) m.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); }

function notice(title, text, buttons) {
  if (noticeEl) noticeEl.remove();
  noticeEl = document.createElement('div');
  noticeEl.className = 'pt-notice';
  noticeEl.innerHTML = `<div class="g-panel" role="alertdialog" aria-modal="true" aria-labelledby="pt-nt"><h2 id="pt-nt">${esc(title)}</h2><p>${esc(text)}</p><div class="p-btns">${buttons.map((b) => `<button type="button" class="g-btn${b.primary ? ' primary' : ''}" data-n="${b.act}">${esc(b.label)}</button>`).join('')}</div></div>`;
  document.querySelector('.game-app').appendChild(noticeEl);
  const first = noticeEl.querySelector('button'); if (first) first.focus();
  noticeEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    noticeEl.remove(); noticeEl = null;
    if (b.dataset.n === 'menu') leaveToMenu();
  });
}

// ------------------------------------------------------------------ lifecycle
function startMatch(info) {
  if (info.kind !== 'online') { try { store.setSetting('pt.cfg', JSON.stringify(info.settings)); } catch (e) { /* ignore */ } }
  pending = info;
  if (noticeEl) { noticeEl.remove(); noticeEl = null; }
  shell.restart();
}

function leaveToMenu(openMenu = true) {
  const m = match;
  match = null; pending = null;
  if (m) { unwireRoom(m); if (m.net) m.net.dispose(); if (m.room && !m.room.closed) m.room.leave().catch(() => {}); }
  setConn(undefined);
  shell.live = false;
  shell.toReady();
  presence.setStatus('online');
  if (openMenu) lobby.openMenu();
}

function resetWorld() {
  const info = pending; pending = null;
  lastCount = -1;
  if (match) { unwireRoom(match); if (match.net) match.net.dispose(); }
  if (!info) { match = null; demo = makeDemo(); R.setMap(demo.world.map); R.parts.length = 0; R.banner = null; return; }
  match = buildMatch(info);
  demo = null;
  R.setMap(match.world.map);
  R.parts.length = 0; R.banner = null; R.shake = 0; R.flash = 0;
  shell.live = match.kind === 'online';
  const w = match.world;
  R.low = shell.lowFx;
  const mm = MODES[w.mode];
  R.showBanner(mm.label.toUpperCase(), '#ffe14d', `${mapById(info.settings.map).name} · ${w.players.length} players`, 2200);
  R.cam.x = (w.players[match.me ?? 0] || { x: 600 }).x; R.cam.y = (w.players[match.me ?? 0] || { y: 400 }).y; R.cam.z = 1;
  match.snap = true;
  setConn(match.room ? match.room.state : undefined);
  if (match.kind === 'online') presence.setStatus('game');
}

// ------------------------------------------------------------------ per-frame update
function update(dt) {
  const m = match;
  if (!m) return;
  const w = m.world;
  const inputs = new Map();
  if (!shell.liveMenu) for (const L of m.locals) inputs.set(w.players[L.idx].id, readDevice(L.dev));
  w.step(dt, inputs);
  const evs = w.drain();
  if (m.net) m.net.update(dt, evs);
  for (const e of evs) onEvent(e);

  // online non-host: say "I touched them" and let the host decide
  if (m.net && !m.net.isHost && w.phase === 'play') {
    const me = w.players[m.me];
    if (me && w.isChaser(me) && !me.frozen) {
      const mp = posOf(me);
      for (const q of w.players) {
        if (q === me || q.left || !w.canTag(me, q)) continue;
        const qp = posOf(q);
        if (Math.hypot(mp.x - qp.x, mp.y - qp.y) < PH.reach + 6 && Math.abs((mp.z || 0) - (qp.z || 0)) < PH.tagDz) m.net.claim(me.idx, q.idx);
      }
    }
  }
  // countdown ticks
  if (w.phase === 'countdown') { const c = Math.ceil(w.cd); if (c !== lastCount && c > 0) { lastCount = c; sfx.play('tick'); } }
  R.update(dt);
  if (w.over && !m.ended) finishMatch(m);
}

function ambient(dt) {
  // decorative bots behind the menus, and a frozen final frame behind the results
  if (match) { R.update(dt); return; }
  if (!demo) demo = makeDemo();
  demo.world.step(Math.min(dt, 1 / 30), new Map());
  demo.world.drain();
  demo.t += dt;
  if (demo.world.over || demo.t > 70) { demo = makeDemo(); R.setMap(demo.world.map); }
  R.update(dt);
}

function hud(w, m) {
  const me = m.me !== null ? w.players[m.me] : null;
  shell.hud('time', fmtClock(w.phase === 'countdown' ? w.dur : w.left));
  shell.hud('score', m.locals.length > 1 ? m.locals.map((L) => Math.floor(w.players[L.idx].score)).join(' · ') : me ? formatScore(me.score) : '0');
  shell.hud('players', w.players.filter((p) => !p.left).length);
}

function render(ctx, W, H) {
  const m = match || demo;
  if (!m) { ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, W, H); return; }
  const w = m.world;
  if (!R.map || R.map !== w.map) R.setMap(w.map);
  const pts = m.locals.length ? m.locals.map((L) => posOf(w.players[L.idx])) : w.players.slice(0, 3).map(posOf);
  if (m.locals.length === 0) { const c = pts[0] || { x: 600, y: 400 }; pts.length = 0; pts.push(c); }
  R.frame(pts, W, H, 1 / 60, m.snap); m.snap = false;
  R.low = shell.lowFx;
  R.draw(ctx, W, H, { world: w, pos: posOf, locals: m.locals.map((L) => L.idx), me: m.me, reduced: shell.reduced });
  if (m.kind !== 'demo') hud(w, m);
}

// ------------------------------------------------------------------ results
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function finishMatch(m) {
  m.ended = true;
  const w = m.world;
  const res = w.results();
  const me = m.me !== null ? m.me : 0;
  const mine = res.list.find((r) => r.idx === me) || res.list[0];
  const medals = ['🥇', '🥈', '🥉'];
  const rows = res.list.map((r, i) => `<li class="pt-row${m.locals.some((L) => L.idx === r.idx) ? ' me' : ''}"><span class="pt-medal">${medals[i] || `${i + 1}.`}</span><b>${esc(r.name)}${r.human ? '' : ' 🤖'}${r.left ? ' (left)' : ''}</b><i>${formatScore(r.score)}</i></li>`).join('');
  const teamLine = w.mode === 'freeze' && res.winnersTeam ? `<p class="p-sub">${res.winnersTeam === 'tagger' ? 'Taggers froze everyone!' : 'Runners survived!'}</p>` : w.mode === 'infection' ? `<p class="p-sub">${res.lastSurvivor >= 0 && !w.players.some((p) => !p.left && !p.infected) ? `${esc(w.players[res.lastSurvivor].name)} was the last survivor!` : 'Survivors made it to the end!'}</p>` : '';
  const extraHTML = `<div class="pt-standings"><h3>Standings</h3><ol>${rows}</ol></div>${teamLine}`;
  const win = res.winners.includes(me);
  const km = mine.dist / 26700;
  const humans = m.humans;
  const finalSurvivor = w.mode === 'infection' && win && (res.lastSurvivor === me || w.players.filter((p) => !p.left && !p.infected).length === 1);
  const online = m.kind === 'online';
  const facts = {
    matches: 1, humans, players: res.list.length, mode: w.mode, map: m.settings.map, diff: m.kind === 'online' ? undefined : (m.settings.bots > 0 ? m.settings.diff : undefined), win, rank: mine.rank,
    tags: mine.tags, tagged: mine.tagged, escape: mine.escape, held: mine.held || 0, thaws: mine.thaws || 0, pickups: mine.pickups || 0, score: mine.score, finalSurvivor, team: w.mode === 'freeze' ? w.players[me].role : '',
  };
  const multi = humans >= 2;
  const counters = { matches: 1, wins: win ? 1 : 0, tags: mine.tags, thaws: mine.thaws || 0, pickups: mine.pickups || 0, mpMatches: multi ? 1 : 0, mpWins: multi && win ? 1 : 0, mpTags: multi ? mine.tags : 0, [`map_${m.settings.map}`]: 1, [`mode_${w.mode}`]: 1 };
  const milestones = [];
  if (win) milestones.push(['You won the match', 15]);
  if (mine.tags >= 5) milestones.push(['5+ tags', 15]);
  if (mine.escape >= 30) milestones.push(['Escaped for 30s', 15]);
  if (multi) milestones.push(['Played with other people', 15]);
  const buttonsHTML = `<button type="button" class="g-btn primary big" data-act="pt-again">${online ? 'PLAY AGAIN' : 'PLAY AGAIN'}</button>
    <button type="button" class="g-btn" data-act="pt-mode">CHANGE MODE</button>
    <button type="button" class="g-btn" data-act="pt-lobby">RETURN TO LOBBY</button>
    <a class="g-btn" href="../../index.html">ARCADE HOME</a>`;
  shell.finish({
    win, title: 'MATCH OVER', subtitle: `You finished ${ordinal(mine.rank)} of ${res.list.length} · ${MODES[w.mode].label}`, score: mine.score, scoreText: formatScore(mine.score),
    stats: [['Tags', mine.tags], ['Times tagged', mine.tagged], ['Longest escape', `${Math.round(mine.escape)}s`], ['Distance', `${km.toFixed(2)} km`]],
    extras: { longestEscape: Math.round(mine.escape) }, counters, facts, milestones, summary: `${MODES[w.mode].label} · ${ordinal(mine.rank)} of ${res.list.length}`,
    extraHTML, buttonsHTML, delay: 1400,
  });
  if (online) presence.setStatus('lobby');
}

function playAgain() {
  const m = match; if (!m) return;
  if (m.kind === 'online') { m.room.phase = 'lobby'; goBackToRoom(true); return; }
  startMatch({ kind: m.kind, settings: m.settings, humans: m.info.humans });
}
function goBackToRoom(ready) {
  const m = match, room = m.room;
  match = null; unwireRoom(m); if (m.net) m.net.dispose();
  setConn(undefined); shell.live = false;
  shell.toReady();
  presence.setStatus('lobby');
  lobby.backToRoom(room, { ready });
}

// ------------------------------------------------------------------ shell config
function pauseHTML() {
  const online = match && match.kind === 'online';
  return `<h2 id="g-panel-title">${online ? 'Menu' : 'Paused'}</h2>
    ${online ? '<p class="p-sub">The match keeps going while this menu is open.</p>' : ''}
    <div class="p-menu">
      <button type="button" class="g-btn primary big" data-act="resume">Resume</button>
      ${online ? '' : '<button type="button" class="g-btn" data-act="restart">Restart match</button>'}
      <button type="button" class="g-btn" data-act="help">How to play</button>
      <button type="button" class="g-btn" data-act="mute">${store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button>
      <button type="button" class="g-btn" data-act="motion">${shell.reduced ? 'Reduced motion: ON' : 'Reduced motion: OFF'}</button>
      <button type="button" class="g-btn" data-act="pt-leave">${online ? 'Leave match' : 'Quit to lobby'}</button>
      <a class="g-btn" href="../../index.html">Arcade Home</a>
    </div>`;
}

function onAct(act) {
  switch (act) {
    case 'restart': if (match && match.kind !== 'online') { playAgain(); return true; } return true;
    case 'pt-again': playAgain(); return true;
    case 'pt-mode': {
      const m = match; if (!m) return true;
      if (m.kind === 'online') { goBackToRoom(false); return true; }
      const kind = m.kind; match = null; unwireRoom(m); shell.toReady(); lobby.setSettings(m.settings); lobby.showSetup(kind); return true;
    }
    case 'pt-lobby': {
      const m = match; if (!m) return true;
      if (m.kind === 'online') { goBackToRoom(false); return true; }
      leaveToMenu(); return true;
    }
    case 'pt-leave': leaveToMenu(); return true;
    default: return false;
  }
}

shell = createShell({
  id: 'pocketTag', title: 'Pocket Tag', accent: ACCENT,
  hud: [{ id: 'time', label: 'TIME', init: '1:30' }, { id: 'score', label: 'SCORE', init: '0' }, { id: 'players', label: 'PLAYERS', init: '0' }],
  best: { label: 'BEST', field: 'highScore' },
  keys: KEYS,
  size: (a) => (a >= 1 ? { w: 760, h: 760 / a } : { w: 460, h: 460 / a }),
  customStart: true, ambientReady: true,
  touch: { right: [{ label: 'JUMP', action: 't_jump', cls: 'act' }, { label: 'SLIDE', action: 't_slide' }, { label: 'DASH', action: 't_dash', cls: 'act' }], rightClass: 'pt-actions' },
  instructions: {
    goal: 'Run, chase and don’t get tagged! Each mode has a different way to win.',
    controls: [['WASD / Arrows', 'Run (push to the edge on touch to sprint)'], ['Shift', 'Sprint (uses stamina)'], ['Space / Enter', 'Jump over benches and gaps'], ['C / .', 'Slide under tunnels and bars'], ['F / /', 'Dash (short cooldown)']],
    touch: 'Touch and drag to run; push to the edge to sprint. JUMP, SLIDE and DASH buttons are on the right.',
    pad: 'Left stick runs (full push sprints) · A jump · B slide · X dash',
    tips: ['Local play: Player 1 uses WASD, Player 2 the arrow keys; more players use controllers.', 'Low obstacles are vaulted automatically when you run into them.', 'After a tag you get a moment of protection. Use it to get away!'],
  },
  pauseHTML, onAct,
  livePause: () => !!(match && match.kind === 'online'),
  reset: resetWorld,
  update,
  ambient,
  render,
  init: (sh) => { shell = sh; },
  onReady: (sh) => {
    shell = sh;
    setupStick(sh.stage);
    connEl = document.createElement('div'); connEl.className = 'pt-conn'; connEl.hidden = true; connEl.setAttribute('role', 'status'); connEl.setAttribute('aria-live', 'polite');
    document.querySelector('.game-app').appendChild(connEl);
    lobby = createLobby({
      game: { id: 'pocketTag', title: 'Pocket Tag', accent: ACCENT, mp: MP, players: '2–8 players · Classic Tag • Freeze Tag • Infection • Crown Chase' },
      schema: SCHEMA, defaults: loadSettings(), localMax: 4,
      localHelp: 'Player 1: WASD · Player 2: arrow keys. More players use game controllers (with enough controllers everyone uses one).',
      hostExtra: (room) => {
        const max = Math.min(7, MAX_PLAYERS - room.count);
        const n = Math.max(0, Math.min(room.settings.bots, max));
        return { seed: (Math.random() * 4294967296) >>> 0, bots: Array.from({ length: n }, (_, i) => BOT_NAMES[i % BOT_NAMES.length]), diff: room.settings.diff };
      },
      onStart: startMatch,
    });
    lobby.setSettings(loadSettings());
    presence.startPresence('lobby').catch(() => {});
    lobby.openFromUrl(new URLSearchParams(location.search));
    window.__pt = { get match() { return match; }, get lobby() { return lobby; }, R, shell, PH, startMatch, posOf };
  },
});
