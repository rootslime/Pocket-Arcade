// Snake Battle — 2–4 snakes share one arena. Bots, same-screen local play and online rooms.
// Rules live in battle-sim.js. Online: the host runs the simulation and broadcasts the state every move
// (8×/s, ~200–900 bytes); clients send only their steering and animate between moves.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { attachSwipe } from '../../js/input.js';
import * as gp from '../../js/gamepad.js';
import { createMpKit, standingsHTML, rankText } from '../../js/mp-kit.js';
import { identity, num, int } from '../../js/multiplayer.js';
import { esc } from '../../js/ui.js';
import { formatScore, roundRectPath, TAU } from '../../js/util.js';
import { Battle, COLS, ROWS, DIR, DIRS, COLORS, TICK } from './battle-sim.js';

const CELL = 28, W = COLS * CELL, H = ROWS * CELL;
const BOT_NAMES = ['Slinky', 'Noodle', 'Zig', 'Zag'];
export const SCHEMA = [
  { key: 'bots', label: 'Bots', type: 'select', options: [0, 1, 2, 3].map((v) => ({ v, label: String(v) })), hint: 'Total snakes in the arena: 4 at most.' },
  { key: 'diff', label: 'Bot difficulty', type: 'select', options: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }], when: (v) => v.bots > 0 },
  { key: 'speed', label: 'Speed', type: 'select', options: [{ v: 1, label: 'Normal' }, { v: 1.35, label: 'Fast' }] },
];
const DEFAULTS = { bots: 2, diff: 'normal', speed: 1 };
const MP = { supported: true, minPlayers: 2, maxPlayers: 4, bots: true, local: true, online: true };

const fx = new Particles(240), pops = new Popups(12), shake = new Shake();
let match = null, pending = null, demo = null, shell = null, kit = null;
let ticker = { last: -1, prev: [], cur: [], at: 0 };
let peersEl = null, peersT = 0;

// ------------------------------------------------------------------ input
const KEYS = {};
const sets = { a: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, b: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }, c: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' } };
for (const [set, m] of Object.entries(sets)) for (const [d, code] of Object.entries(m)) KEYS[`${set}_${d}`] = [code];
let swipeQ = [];
const padPrev = {};

function pressed(dev) {
  const out = [];
  const i = shell.input;
  const kb = (set) => { for (const d of DIRS) if (i.pressed(`${set}_${d}`)) out.push(d); };
  const pad = (p) => {
    for (const [d, btn, ax] of [['up', 12, (a) => a.ax(1) < -0.5], ['down', 13, (a) => a.ax(1) > 0.5], ['left', 14, (a) => a.ax(0) < -0.5], ['right', 15, (a) => a.ax(0) > 0.5]]) {
      const now = p.btn(btn) || ax(p), k = `${p.index}:${d}`;
      if (now && !padPrev[k]) out.push(d);
      padPrev[k] = now;
    }
  };
  if (dev.kind === 'kbA') kb('a');
  else if (dev.kind === 'kbB') kb('b');
  else if (dev.kind === 'kbC') kb('c');
  else if (dev.kind === 'pad') { const p = gp.allPads().find((x) => x.index === dev.pad); if (p) pad(p); }
  else { kb('a'); kb('b'); const p = gp.allPads()[0]; if (p) pad(p); while (swipeQ.length) out.push(swipeQ.shift()); }
  return out;
}
function assignDevices(n) {
  const pads = gp.allPads();
  if (n === 1) return [{ kind: 'all' }];
  const pool = pads.length >= n ? pads.map((p) => ({ kind: 'pad', pad: p.index })) : [{ kind: 'kbA' }, { kind: 'kbB' }, { kind: 'kbC' }, ...pads.map((p) => ({ kind: 'pad', pad: p.index }))];
  return pool.slice(0, n);
}

// ------------------------------------------------------------------ match construction
function rosterFor(info) {
  const me = identity();
  const players = [];
  if (info.kind === 'online') info.roster.slice(0, 4).forEach((m) => players.push({ id: String(m.key), name: String(m.name), human: true, ctrl: m.key === info.room.key ? 'human' : 'remote' }));
  else {
    const n = info.kind === 'local' ? info.humans : 1;
    for (let i = 0; i < n; i++) players.push({ id: `h${i}`, name: i === 0 ? me.name : `Player ${i + 1}`, human: true, ctrl: 'human' });
  }
  const want = info.kind === 'online' ? (info.extra && Array.isArray(info.extra.bots) ? info.extra.bots.length : 0) : info.settings.bots;
  const nb = Math.max(info.kind === 'bots' && players.length === 1 ? 1 : 0, Math.min(want, 4 - players.length));
  const diff = (info.kind === 'online' && info.extra && info.extra.diff) || info.settings.diff;
  for (let i = 0; i < nb; i++) players.push({ id: `bot${i}`, name: BOT_NAMES[i % BOT_NAMES.length], human: false, ctrl: 'bot', diff });
  return players;
}

function build(info) {
  const players = rosterFor(info);
  const seed = info.kind === 'online' ? ((info.extra && info.extra.seed) >>> 0) : (Math.random() * 4294967296) >>> 0;
  const online = info.kind === 'online';
  const auth = online ? info.isHost : true;
  const speed = num(info.settings.speed, 1, 1.5, 1);
  const battle = new Battle({ players, seed, speed });
  const locals = [];
  const humansLocal = players.map((p, i) => ({ p, i })).filter((x) => x.p.ctrl === 'human');
  const devs = assignDevices(humansLocal.length);
  humansLocal.forEach((x, k) => locals.push({ idx: x.i, dev: devs[k] || devs[0] }));
  const m = { info, kind: info.kind, battle, locals, me: locals.length ? locals[0].idx : 0, auth, room: online ? info.room : null, ended: false, cd: 3, humans: players.filter((p) => p.human).length, settings: info.settings, keyToIdx: new Map(), offs: [], lastSend: 0 };
  if (online) {
    players.forEach((p, i) => { if (p.human) m.keyToIdx.set(p.id, i); });
    wire(m);
  }
  return m;
}

function wire(m) {
  const room = m.room;
  const unwireKit = kit.wire(room, { onHostChange: (h) => { if (h.me) becomeHost(m); }, onClosed: () => { if (match === m) leave(); } });
  m.offs = [
    unwireKit,
    room.onMsg('in', (d, from) => {
      if (!m.auth || !d || !m.battle) return;
      const i = m.keyToIdx.get(from.key);
      if (i === undefined || typeof d.d !== 'string' || !DIR[d.d]) return;
      if (m.battle.snakes[i].ctrl === 'remote') m.battle.steer(i, d.d);
    }),
    room.onMsg('st', (st) => {
      if (m.auth || !st || typeof st !== 'object') return;
      const b = m.battle;
      if (b.importState(st)) { m.cd = 0; }
    }, { hostOnly: true }),
  ];
}

function becomeHost(m) {
  m.auth = true;
  const b = m.battle;
  for (const s of b.snakes) if (s.ctrl === 'remote' && s.id === m.room.key) s.ctrl = 'human';
  // continue from the last state we received: the other humans stay remote, bots run on the new host
  b.over = b.over && true;
}

// ------------------------------------------------------------------ lifecycle
function startMatch(info) {
  pending = info;
  kit.clearNotice();
  shell.restart();
}

function leave(openLobby = true) {
  const m = match;
  match = null; pending = null;
  if (m) { m.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); if (m.room && !m.room.closed) m.room.leave().catch(() => {}); }
  kit.conn(undefined);
  shell.toReady();
  kit.setStatus('online');
  if (openLobby) kit.lobby.openMenu();
}

function reset() {
  const info = pending; pending = null;
  fx.clear(); pops.clear(); shake.mag = 0;
  ticker = { last: -1, prev: [], cur: [], at: 0 };
  if (match) match.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  if (!info) {
    match = null;
    demo = new Battle({ players: [0, 1, 2].map((i) => ({ id: 'd' + i, name: BOT_NAMES[i], ctrl: 'bot', diff: 'normal' })), seed: (Math.random() * 4294967296) >>> 0, limit: 60 });
    hud();
    return;
  }
  demo = null;
  match = build(info);
  hud();
  if (info.kind === 'online') kit.setStatus('game');
}

// ------------------------------------------------------------------ update
function sync(b) {
  if (b.tick !== ticker.last) {
    ticker.prev = ticker.cur.length ? ticker.cur : b.snakes.map((s) => s.cells.map((c) => ({ ...c })));
    ticker.cur = b.snakes.map((s) => s.cells.map((c) => ({ ...c })));
    ticker.last = b.tick; ticker.at = performance.now();
  }
}

function update(dt) {
  const m = match;
  if (!m) return;
  const b = m.battle;
  fx.update(dt); pops.update(dt); shake.update(dt);
  // steering
  if (!shell.liveMenu) {
    for (const L of m.locals) {
      for (const d of pressed(L.dev)) {
        if (m.auth) b.steer(L.idx, d);
        else { b.steer(L.idx, d); if (m.room) m.room.send('in', { d }); }
      }
    }
  }
  if (m.cd > 0 && m.auth) {
    m.cd -= dt;
    if (m.cd <= 0) shell.sfx.play('go');
    else if (Math.ceil(m.cd) !== Math.ceil(m.cd + dt)) shell.sfx.play('tick');
  } else if (m.auth) {
    const moved = b.update(dt);
    if (moved && m.room) m.room.send('st', b.exportState());
    // a dropped human is covered by a bot after a short grace period
    if (m.room) coverAway(m);
  }
  if (!m.auth) { if (m.cd > 0) { m.cd -= dt; } }
  sync(b);
  for (const e of b.drain()) {
    const s = b.snakes[e.i];
    if (e.k === 'eat' && s) { const h = s.cells[0]; fx.emit(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, e.v === 3 ? 14 : 8, { speed: 150, life: 0.4, size: 4, color: [s.color, '#fff'] }); if (m.locals.some((L) => L.idx === e.i)) shell.sfx.play('eat'); }
    else if (e.k === 'out' && s) { const h = s.cells[0]; fx.emit(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, 26, { speed: 240, life: 0.7, size: 5, color: [s.color, '#fff'] }); shake.kick(6); shell.sfx.play(m.locals.some((L) => L.idx === e.i) ? 'hit' : 'smallBoom'); pops.add(h.x * CELL + CELL / 2, h.y * CELL, `${s.name} is out!`, s.color, 13); }
  }
  hud();
  updatePeers(dt);
  if (b.over && !m.ended) finish(m);
}

function coverAway(m) {
  const now = performance.now();
  if (now - (m._pc || 0) < 500) return;
  m._pc = now;
  for (const [key, i] of m.keyToIdx) {
    const s = m.battle.snakes[i];
    if (!s || key === m.room.key || !s.alive) continue;
    const here = m.room.members.has(key);
    if (!here) { if (!s.awayAt) s.awayAt = now; if (now - s.awayAt > 2000 && s.ctrl === 'remote') s.ctrl = 'bot'; }
    else if (s.awayAt) { s.awayAt = 0; if (s.ctrl === 'bot' && s.id === key) s.ctrl = 'remote'; }
  }
}

function hud() {
  const m = match;
  if (!m) { shell.hud('score', '0'); shell.hud('len', '4'); shell.hud('alive', '0'); return; }
  const b = m.battle, me = b.snakes[m.me];
  shell.hud('score', m.locals.length > 1 ? m.locals.map((L) => b.snakes[L.idx].score).join(' · ') : formatScore(me.score));
  shell.hud('len', m.locals.length > 1 ? '' : String(me.cells.length + me.grow));
  shell.hud('alive', `${b.snakes.filter((s) => s.alive).length}/${b.snakes.length}`);
}

function updatePeers(dt) {
  peersT -= dt;
  if (peersT > 0) return;
  peersT = 0.25;
  if (!peersEl) { peersEl = document.createElement('div'); peersEl.className = 'mp-peers'; peersEl.setAttribute('aria-hidden', 'true'); shell.stage.appendChild(peersEl); }
  const m = match;
  if (!m) { peersEl.hidden = true; return; }
  peersEl.hidden = false;
  peersEl.innerHTML = m.battle.snakes.slice().sort((a, c) => (c.alive - a.alive) || (c.score - a.score)).map((s) => `<div class="${s.alive ? '' : 'out'}${m.locals.some((L) => L.idx === s.idx) ? ' me' : ''}"><b style="color:${s.color}">${esc(s.name.slice(0, 10))}</b><span>${s.score}</span></div>`).join('');
}

// ------------------------------------------------------------------ results
function finish(m) {
  m.ended = true;
  const b = m.battle;
  const rank = (idx) => b.ranking.findIndex((s) => s.idx === idx) + 1 || b.snakes.length;
  const me = b.snakes[m.me];
  const myRank = rank(m.me);
  const rows = b.ranking.map((s) => ({ name: s.name, text: formatScore(s.score), me: m.locals.some((L) => L.idx === s.idx), bot: s.ctrl === 'bot' && !s.name.startsWith('Player') && !m.keyToIdx.size && !m.locals.some((L) => L.idx === s.idx), note: s.alive ? 'survived' : '' }));
  const win = b.winner === m.me && b.snakes.length > 1;
  const humans = m.humans, multi = humans >= 2;
  const online = m.kind === 'online';
  shell.finish({
    win, title: 'MATCH OVER', subtitle: `You finished ${rankText(myRank)} of ${b.snakes.length}`, score: me.score, scoreText: formatScore(me.score), delay: 1200,
    stats: [['Food eaten', me.eaten], ['Length', me.cells.length + me.grow], ['Snakes', b.snakes.length], ['Placement', rankText(myRank)]],
    facts: { battle: true, win, rank: myRank, players: b.snakes.length, humans, len: me.cells.length + me.grow, eaten: me.eaten, mode: 'battle' },
    counters: { battles: 1, battleWins: win ? 1 : 0, mpBattles: multi ? 1 : 0, mpBattleWins: multi && win ? 1 : 0 },
    countsScore: false, summary: `Snake Battle · ${rankText(myRank)} of ${b.snakes.length}`,
    milestones: [...(win ? [['Won the battle', 15]] : []), ...(me.eaten >= 8 ? [['8+ food', 10]] : []), ...(multi ? [['Played with others', 10]] : [])],
    extraHTML: standingsHTML(rows),
    buttonsHTML: `<button type="button" class="g-btn primary big" data-act="sb-again">PLAY AGAIN</button><button type="button" class="g-btn" data-act="sb-mode">CHANGE MODE</button><button type="button" class="g-btn" data-act="sb-lobby">RETURN TO LOBBY</button><a class="g-btn" href="../../index.html">ARCADE HOME</a>`,
  });
  if (online) kit.setStatus('lobby');
}

function backToRoom(ready) {
  const m = match, room = m.room;
  match = null; m.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  kit.conn(undefined);
  shell.toReady();
  kit.setStatus('lobby');
  kit.lobby.backToRoom(room, { ready });
}

function onAct(act) {
  const m = match;
  switch (act) {
    case 'sb-again': if (!m) return true; if (m.kind === 'online') backToRoom(true); else startMatch({ kind: m.kind, settings: m.settings, humans: m.info.humans }); return true;
    case 'sb-mode': { if (!m) return true; if (m.kind === 'online') { backToRoom(false); return true; } const kind = m.kind, st = m.settings; match = null; shell.toReady(); kit.lobby.setSettings(st); kit.lobby.showSetup(kind); return true; }
    case 'sb-lobby': if (!m) return true; if (m.kind === 'online') backToRoom(false); else leave(); return true;
    case 'sb-leave': leave(); return true;
    case 'restart': if (m && m.kind !== 'online') { startMatch({ kind: m.kind, settings: m.settings, humans: m.info.humans }); } return true;
    default: return false;
  }
}

function pauseHTML() {
  const online = match && match.kind === 'online';
  return `<h2 id="g-panel-title">${online ? 'Menu' : 'Paused'}</h2>${online ? '<p class="p-sub">The battle keeps going while this menu is open.</p>' : ''}
    <div class="p-menu"><button type="button" class="g-btn primary big" data-act="resume">Resume</button>${online ? '' : '<button type="button" class="g-btn" data-act="restart">Restart battle</button>'}
    <button type="button" class="g-btn" data-act="help">How to play</button><button type="button" class="g-btn" data-act="mute">${shell.store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button>
    <button type="button" class="g-btn" data-act="sb-leave">${online ? 'Leave battle' : 'Quit to lobby'}</button><a class="g-btn" href="../../index.html">Arcade Home</a></div>`;
}

// ------------------------------------------------------------------ render
const ease = (t) => t * t * (3 - 2 * t);
function pos(i, k, t) {
  const cur = ticker.cur[i], prev = ticker.prev[i] || cur;
  const c = cur[k], p = prev[Math.min(k, prev.length - 1)] || c;
  return { x: (p.x + (c.x - p.x) * t + 0.5) * CELL, y: (p.y + (c.y - p.y) * t + 0.5) * CELL };
}

function render(ctx) {
  const m = match || null;
  const b = m ? m.battle : demo;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#04251a'); g.addColorStop(1, '#0b1038');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(shake.x, shake.y);
  ctx.strokeStyle = 'rgba(93,255,143,.07)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(93,255,143,.55)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  if (!b) { ctx.restore(); return; }
  if (!m) { b.update(1 / 60); b.drain(); if (b.over) demo = new Battle({ players: [0, 1, 2].map((i) => ({ id: 'd' + i, name: BOT_NAMES[i], ctrl: 'bot', diff: 'normal' })), seed: (Math.random() * 4294967296) >>> 0, limit: 60 }); sync(b); }
  const t = ease(Math.min(1, (performance.now() - ticker.at) / (b.tickLen * 1000)));
  const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
  for (const f of b.food) {
    const cx = (f.x + 0.5) * CELL, cy = (f.y + 0.5) * CELL;
    ctx.fillStyle = f.v === 3 ? '#ffe14d' : '#ff5d7a'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = shell.lowFx ? 0 : 12;
    ctx.beginPath(); ctx.arc(cx, cy, (f.v === 3 ? 9 : 6.5) * pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  }
  for (const s of b.snakes) {
    if (!ticker.cur[s.idx] || !ticker.cur[s.idx].length) continue;
    const n = ticker.cur[s.idx].length;
    ctx.globalAlpha = s.alive ? 1 : 0.28;
    for (let k = n - 1; k >= 0; k--) {
      const p = pos(s.idx, k, s.alive ? t : 1);
      const r = k === 0 ? 12.5 : 11.5 - Math.min(3, k * 0.08);
      ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = shell.lowFx || !s.alive ? 0 : k === 0 ? 14 : 4;
      roundRectPath(ctx, p.x - r, p.y - r, r * 2, r * 2, 7); ctx.fill();
      ctx.shadowBlur = 0;
      if (k % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,.18)'; roundRectPath(ctx, p.x - r * 0.55, p.y - r * 0.55, r * 1.1, r * 1.1, 4); ctx.fill(); }
    }
    const hp = pos(s.idx, 0, s.alive ? t : 1), d = DIR[s.dir] || [1, 0];
    ctx.fillStyle = '#fff';
    const px = -d[1] * 5, py = d[0] * 5;
    ctx.beginPath(); ctx.arc(hp.x + d[0] * 4 + px, hp.y + d[1] * 4 + py, 3, 0, TAU); ctx.arc(hp.x + d[0] * 4 - px, hp.y + d[1] * 4 - py, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10122e';
    ctx.beginPath(); ctx.arc(hp.x + d[0] * 5.5 + px, hp.y + d[1] * 5.5 + py, 1.4, 0, TAU); ctx.arc(hp.x + d[0] * 5.5 - px, hp.y + d[1] * 5.5 - py, 1.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (s.alive && m) {
      const mine = m.locals.some((L) => L.idx === s.idx);
      ctx.font = '800 11px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = mine && m.locals.length === 1 ? 'YOU' : s.name.slice(0, 9);
      const w = ctx.measureText(label).width + 10, ly = Math.max(10, hp.y - 22);
      ctx.fillStyle = mine ? 'rgba(255,225,77,.92)' : 'rgba(8,9,30,.75)'; roundRectPath(ctx, hp.x - w / 2, ly - 8, w, 16, 8); ctx.fill();
      ctx.fillStyle = mine ? '#171a40' : s.color; ctx.fillText(label, hp.x, ly);
    }
  }
  fx.draw(ctx); pops.draw(ctx);
  if (m && m.cd > 0) {
    const n = Math.ceil(m.cd);
    ctx.font = '900 110px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#5dff8f';
    ctx.strokeText(String(n), W / 2, H / 2); ctx.fillText(String(n), W / 2, H / 2);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ shell
shell = createShell({
  id: 'turboSnake', title: 'Snake Battle', accent: '#5dff8f',
  size: { w: W, h: H },
  hud: [{ id: 'score', label: 'SCORE', init: '0' }, { id: 'len', label: 'LENGTH', init: '4' }, { id: 'alive', label: 'ALIVE', init: '0' }],
  keys: KEYS,
  customStart: true, ambientReady: true,
  touch: { optional: true, leftClass: 'dpad', left: [], right: [] },
  instructions: {
    goal: 'Outlast the other snakes. Eat to grow and score; hitting a wall or any snake knocks you out.',
    controls: [['WASD', 'Player 1 (arrows also work when playing alone)'], ['Arrow keys', 'Player 2'], ['I J K L', 'Player 3'], ['D-pad / stick', 'Controllers']],
    touch: 'Swipe on the board to steer.',
    pad: 'D-pad or left stick to steer.',
    tips: ['Two heads meeting in one cell knock both snakes out.', 'Knocked-out snakes leave food behind. Gold food is worth 3×.', 'Last snake alive wins; if time runs out the best score wins.'],
  },
  livePause: () => !!(match && match.kind === 'online'),
  pauseHTML, onAct, reset, update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); },
  render,
  init: (sh) => {
    shell = sh;
    attachSwipe(sh.canvas, (d) => { if (sh.state === 'playing' && match) swipeQ.push(d); }, 22);
  },
  onReady: (sh) => {
    shell = sh;
    kit = createMpKit({
      shell: sh, game: { id: 'turboSnake', title: 'Snake Battle', accent: '#5dff8f', mp: MP, players: '2–4 players · last snake alive wins' },
      schema: SCHEMA, defaults: DEFAULTS, localMax: 4, settingsKey: 'sb.cfg',
      localHelp: 'Player 1: WASD · Player 2: arrow keys · Player 3: I J K L. Controllers work too.',
      hostExtra: (room) => ({ seed: (Math.random() * 4294967296) >>> 0, bots: Array.from({ length: Math.max(0, Math.min(room.settings.bots, 4 - room.count)) }, (_, i) => BOT_NAMES[i]), diff: room.settings.diff }),
      onStart: startMatch,
    });
    kit.start();
    window.__sb = { get match() { return match; }, get kit() { return kit; }, shell: sh, startMatch };
  },
});
void TICK; void int;
