// Pocket Block Blast — drag block pieces onto an 8×8 board, complete rows and columns, chain combos.
// Rules live in engine.js (pure, tested headless); this file is rendering, input and feedback.
import { createShell } from '../../js/shell.js';
import { Particles, Popups, Shake } from '../../js/fx.js';
import { canvasPoint } from '../../js/input.js';
import * as store from '../../js/storage.js';
import { clamp, formatScore, roundRectPath, TAU } from '../../js/util.js';
import { esc } from '../../js/ui.js';
import { Game, SIZE, PALETTE, TIME_ATTACK_SECS, UNDO_USES, dailyInfo, dailyKey, previewLines, canPlaceAnywhere, DAILY_SETS, DUEL_SETS, DUEL_MAX_SECS } from './engine.js';
import { createMpKit, standingsHTML, rankText, PeerBoard } from '../../js/mp-kit.js';

const ID = 'pocketBlockBlast';
const BLOB = 'pocketBlockBlast';
// ---- Block Duel (online 1v1): both players get the identical piece sequence from a shared seed and play on their own
// boards; the heartbeat only reports score and progress. Highest score after the sets (or five minutes) wins.
const MPQ = new URLSearchParams(location.search).has('mp');
const MP = { on: false, kind: null, fresh: false, seed: 0, cd: 0, t: 0, board: null, room: null, kit: null, info: null, ended: false, offs: [] };
let waitEl = null;
const fx = new Particles(420);
const pops = new Popups(14);
const shake = new Shake();

const G = {
  game: null, mode: 'classic', daily: null, timeLeft: TIME_ATTACK_SECS,
  sel: null, drag: null, hover: null, cursor: { r: 3, c: 3 }, kb: false, touchMode: false,
  clears: [], pops: new Map(), banner: null, t: 0, ending: 0, ended: false, goalHit: false,
  flash: 0, shakeT: 0, lowTime: -1, undoPulse: 0, newBestFx: 0,
};
let L = null;   // layout

// ---------------------------------------------------------------- saved per-day data
const readBlob = () => { const b = store.getBlob(BLOB, null); return b && typeof b === 'object' && b.daily && typeof b.daily === 'object' ? b : { daily: {} }; };
function recordDaily(key, score, done) {
  const b = readBlob();
  const cur = b.daily[key] || { best: 0, done: false };
  b.daily[key] = { best: Math.max(cur.best || 0, score), done: !!cur.done || done };
  const keys = Object.keys(b.daily).sort();
  while (keys.length > 400) delete b.daily[keys.shift()];
  store.setBlob(BLOB, b);
  return Object.values(b.daily).filter((d) => d.done).length;
}
const dailyDone = (key) => !!(readBlob().daily[key] || {}).done;
const dailyCountDone = () => Object.values(readBlob().daily).filter((d) => d.done).length;

let dailyCache = null;
const todayInfo = () => { const k = dailyKey(); if (!dailyCache || dailyCache.key !== k) dailyCache = dailyInfo(k); return dailyCache; };

const MODES = [
  { id: 'classic', label: 'Classic', field: 'highScore', blurb: 'Endless · no timer' },
  { id: 'timeattack', label: 'Time Attack', field: 'highScoreTime', blurb: '3 minutes · max points' },
  { id: 'daily', label: 'Daily Challenge', field: 'highScoreDaily', blurb: '' },
];
const modeDef = (m) => MODES.find((x) => x.id === m) || MODES[0];

// ---------------------------------------------------------------- shell
const shell = createShell({
  id: ID,
  title: 'Pocket Block Blast',
  accent: '#ff6bd6',
  quickRestart: true,
  size: (aspect) => (aspect >= 1.12
    ? { w: Math.round(clamp(560 * aspect, 800, 1000)), h: 560 }
    : { w: 440, h: Math.round(clamp(440 / aspect, 600, 880)) }),
  hud: [
    { id: 'score', label: 'SCORE', init: '0' },
    { id: 'combo', label: 'COMBO', init: '×0' },
    { id: 'info', label: 'LINES', init: '0' },
  ],
  best: { field: (m) => modeDef(m).field, kind: 'high', label: 'BEST' },
  modeLabel: 'Choose a mode',
  modes: MODES.map((m) => ({
    id: m.id, label: m.label,
    get desc() {
      if (m.id !== 'daily') return m.blurb;
      const t = todayInfo();
      return `Goal ${formatScore(t.target)} · ${DAILY_SETS} sets${dailyDone(t.key) ? ' · ✓ done today' : ''}`;
    },
  })),
  gamepad: { left: ['dpadLeft', 'lsLeft'], right: ['dpadRight', 'lsRight'], up: ['dpadUp', 'lsUp'], down: ['dpadDown', 'lsDown'], place: ['a'], next: ['rb', 'x'], prev: ['lb'], undo: ['y', 'b'] },
  keys: {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    place: ['Enter', 'Space'], next: ['Tab', 'KeyE'], prev: ['KeyQ'], undo: ['KeyZ', 'KeyU'],
    s1: ['Digit1', 'Numpad1'], s2: ['Digit2', 'Numpad2'], s3: ['Digit3', 'Numpad3'],
  },
  instructions: {
    goal: 'Fit the three pieces onto the 8×8 board. Fill a whole row or column to clear it. Keep clearing to build combos. The game ends when none of your remaining pieces fits.',
    controls: [
      ['Drag', 'Drag a piece onto the board and let go to place it'],
      ['Tap · Tap', 'Tap a piece, then tap the board (the piece lands centred on that cell)'],
      ['1 2 3 · Arrows · Enter', 'Select a piece, move the cursor, place it'],
      ['Z / U', 'Undo the last placement (3 per game)'],
      ['R · P', 'Restart · Pause'],
    ],
    touch: 'Drag a piece from the tray: the preview appears above your finger so it is never hidden. Or tap a piece, then tap the board.',
    pad: 'D-pad moves the cursor · A places · RB / LB cycle pieces · Y undoes.',
    tips: [
      'Valid spots glow; a red ✕ preview means it will not fit. Rows and columns that would complete shine.',
      'Clearing lines on back-to-back placements builds the combo multiplier. A placement without a clear resets it.',
      'Clear several lines with one piece for far more points. Empty the whole board for a big bonus.',
      'Daily Challenge: same board and pieces for everyone today, a fixed 10 sets and a goal to beat.',
    ],
  },
  init() {
    shake.enabled = !shell.reduced; fx.scale = shell.reduced ? 0.35 : 1;
    const cv = shell.canvas;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !G.drag) G.hover = null; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  onMotionChange(r) { shake.enabled = !r; fx.scale = r ? 0.35 : 1; },
  onLowFx() { fx.scale = Math.min(fx.scale, 0.5); },
  reset,
  update,
  ambient(dt) { fx.update(dt); pops.update(dt); shake.update(dt); G.t += dt; tickAnims(dt); },
  render,
  ...(MPQ ? { customStart: true, onReady: mpReady, livePause: () => MP.on, pauseHTML: mpPauseHTML } : {}),
  onAct(act) {
    if (mpAct(act)) return true;
    if (act === 'pbb-again') { shell.restart(); return true; }
    if (act === 'pbb-mode') { shell.showStart(); return true; }
    return false;
  },
});

// ---------------------------------------------------------------- run setup
function reset(mode) {
  const m = MP.on ? 'duel' : modeDef(mode || shell.mode).id;
  G.mode = m;
  if (m === 'duel') { G.daily = null; G.game = new Game({ mode: 'duel', seed: MP.seed }); if (MP.fresh) { MP.fresh = false; MP.ended = false; MP.t = 0; MP.cd = MP.kind === 'online' ? 3.2 : 0; } } else if (m === 'daily') { G.daily = todayInfo(); G.game = new Game({ mode: 'daily', daily: G.daily }); } else { G.daily = null; G.game = new Game({ mode: m }); }
  G.timeLeft = TIME_ATTACK_SECS;
  G.sel = null; G.drag = null; G.hover = null; G.cursor = { r: 3, c: 3 }; G.kb = false;
  G.clears.length = 0; G.pops.clear(); G.banner = null; G.ending = 0; G.ended = false; G.goalHit = false; G.flash = 0; G.lowTime = -1; G.newBestFx = 0;
  fx.clear(); pops.clear(); shake.mag = 0;
  const lab = document.querySelector('#hud-info');
  if (lab && lab.previousElementSibling) lab.previousElementSibling.textContent = m === 'timeattack' ? 'TIME' : m === 'daily' || m === 'duel' ? 'SETS' : 'LINES';
  syncHud();
}

function syncHud() {
  const g = G.game; if (!g) return;
  shell.hud('score', formatScore(g.score));
  shell.hud('combo', `×${g.combo}`);
  if (G.mode === 'timeattack') { const s = Math.max(0, Math.ceil(G.timeLeft)); shell.hud('info', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); }
  else if (G.mode === 'daily') shell.hud('info', `${Math.min(g.sets, DAILY_SETS)}/${DAILY_SETS}`);
  else if (G.mode === 'duel') shell.hud('info', `${Math.min(g.sets, DUEL_SETS)}/${DUEL_SETS}`);
  else shell.hud('info', String(g.lines));
}

// ---------------------------------------------------------------- layout
function layout(W, H) {
  const land = W > H * 1.12;
  const o = { W, H, land };
  if (land) {
    const B = Math.min(H - 28, W * 0.6);
    o.B = B; o.bx = 18; o.by = (H - B) / 2;
    const px = o.bx + B + 28, pw = W - px - 16;
    const undoH = 46, gap = 10;
    const slotH = (B - undoH - gap * 3) / 3;
    o.slots = [0, 1, 2].map((i) => ({ x: px, y: o.by + i * (slotH + gap), w: pw, h: slotH }));
    o.undo = { x: px, y: o.by + B - undoH, w: pw, h: undoH };
  } else {
    const margin = 12, slotGap = 10;
    const B = Math.min(W - margin * 2, H * 0.6);
    const slotW = (W - margin * 2 - slotGap * 2) / 3;
    const slotH = clamp(slotW * 0.95, 80, 150);
    const undoH = 44;
    const total = B + 18 + slotH + 14 + undoH;
    o.B = B; o.bx = (W - B) / 2; o.by = Math.max(10, (H - total) / 2);
    const ty = o.by + B + 18;
    o.slots = [0, 1, 2].map((i) => ({ x: margin + i * (slotW + slotGap), y: ty, w: slotW, h: slotH }));
    o.undo = { x: W / 2 - Math.min(190, W - 24) / 2, y: ty + slotH + 14, w: Math.min(190, W - 24), h: undoH };
  }
  o.c = o.B / SIZE;
  return o;
}
const lay = () => (L && L.W === shell.W && L.H === shell.H ? L : (L = layout(shell.W, shell.H)));
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const cellCenter = (r, c) => { const l = lay(); return { x: l.bx + (c + 0.5) * l.c, y: l.by + (r + 0.5) * l.c }; };

// ---------------------------------------------------------------- placement helpers
/** Top-left board cell for a piece whose centre is over board cell (r, c) — used for tap, hover and keyboard. */
const anchorFromCell = (shape, r, c) => ({ r: r - Math.floor((shape.h - 1) / 2), c: c - Math.floor((shape.w - 1) / 2) });

/** Where would the dragged piece land? The piece floats above the finger (touch) or under the cursor (mouse). */
function dragAnchor(d, shape) {
  const l = lay();
  const cx = d.x, cy = d.type === 'mouse' ? d.y : d.y - shape.h * l.c / 2 - l.c * 1.15;
  d.cx = cx; d.cy = cy;
  return { r: Math.round((cy - shape.h * l.c / 2 - l.by) / l.c), c: Math.round((cx - shape.w * l.c / 2 - l.bx) / l.c) };
}

function currentPreview() {
  const g = G.game; if (!g || g.over) return null;
  if (G.drag && G.drag.moved) {
    const p = g.tray[G.drag.i]; if (!p) return null;
    const a = dragAnchor(G.drag, p.shape);
    return { i: G.drag.i, ...a, valid: g.canPlace(G.drag.i, a.r, a.c), dragging: true };
  }
  if (G.sel !== null && g.tray[G.sel] && (G.hover || G.kb)) {
    const cell = G.kb ? G.cursor : G.hover;
    const p = g.tray[G.sel];
    const a = anchorFromCell(p.shape, cell.r, cell.c);
    return { i: G.sel, ...a, valid: g.canPlace(G.sel, a.r, a.c), dragging: false };
  }
  return null;
}

function boardCellAt(pt) {
  const l = lay();
  const c = Math.floor((pt.x - l.bx) / l.c), r = Math.floor((pt.y - l.by) / l.c);
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE ? { r, c } : null;
}

const firstPlayable = (from = -1, dir = 1) => {
  const t = G.game.tray;
  for (let k = 1; k <= 3; k++) { const i = ((from + dir * k) % 3 + 3) % 3; if (t[i]) return i; }
  return null;
};

// ---------------------------------------------------------------- input
function onDown(e) {
  if (shell.state !== 'playing' || !G.game || G.game.over || G.ending || (MP.on && MP.cd > 0)) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const l = lay();
  const pt = canvasPoint(e, shell.canvas, shell.W, shell.H);
  G.kb = false; G.touchMode = e.pointerType !== 'mouse';
  if (inRect(pt, l.undo)) { doUndo(); return; }
  for (let i = 0; i < 3; i++) {
    if (G.game.tray[i] && inRect(pt, l.slots[i])) {
      const wasSel = G.sel === i;
      G.sel = i;
      G.drag = { id: e.pointerId, i, x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, moved: false, type: e.pointerType || 'mouse', wasSel };
      try { shell.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      shell.sfx.play('click');
      return;
    }
  }
  const cell = boardCellAt(pt);
  if (cell && G.sel !== null && G.game.tray[G.sel]) {              // tap-to-place
    const p = G.game.tray[G.sel], a = anchorFromCell(p.shape, cell.r, cell.c);
    G.hover = e.pointerType === 'mouse' ? cell : null;
    commit(G.sel, a.r, a.c, true);
  }
}

function onMove(e) {
  const pt = canvasPoint(e, shell.canvas, shell.W, shell.H);
  if (G.drag && G.drag.id === e.pointerId) {
    G.drag.x = pt.x; G.drag.y = pt.y;
    if (!G.drag.moved && Math.hypot(pt.x - G.drag.sx, pt.y - G.drag.sy) > 9) G.drag.moved = true;
    e.preventDefault();
    return;
  }
  if (e.pointerType === 'mouse' && shell.state === 'playing') { const cell = boardCellAt(pt); G.hover = cell; if (cell) G.kb = false; }
}

function onUp(e) {
  const d = G.drag;
  if (!d || d.id !== e.pointerId) return;
  G.drag = null;
  if (shell.state !== 'playing' || !G.game || G.game.over) return;
  if (!d.moved) { if (d.wasSel && d.type !== 'mouse') G.sel = null; return; }    // a tap selects (tap again to deselect)
  const p = G.game.tray[d.i]; if (!p) return;
  d.x = canvasPoint(e, shell.canvas, shell.W, shell.H).x; d.y = canvasPoint(e, shell.canvas, shell.W, shell.H).y;
  const a = dragAnchor(d, p.shape);
  if (G.game.canPlace(d.i, a.r, a.c)) commit(d.i, a.r, a.c, false);
  else {
    const overBoard = boardCellAt({ x: d.cx, y: d.cy }) || boardCellAt({ x: d.x, y: d.y });
    if (overBoard) rejectFx(d.i, a);
    G.sel = d.type === 'mouse' ? d.i : G.sel;
  }
}
function onCancel(e) { if (G.drag && G.drag.id === e.pointerId) G.drag = null; }

function rejectFx(i, a) {
  shell.sfx.play('warn'); shake.kick(2);
  const l = lay(), c = cellCenter(clamp(a.r, 0, SIZE - 1), clamp(a.c, 0, SIZE - 1));
  pops.add(c.x, c.y - l.c * 0.4, 'NO ROOM', '#ff6b6b', 14);
}

function doUndo() {
  const g = G.game;
  if (!g || G.ending || g.undosLeft <= 0 || !g.undoState) { if (g && g.undosLeft <= 0) { shell.sfx.play('warn'); pops.add(lay().undo.x + lay().undo.w / 2, lay().undo.y - 6, 'NO UNDOS LEFT', '#ff8ad8', 13); } return; }
  if (g.undo()) {
    G.sel = null; G.drag = null; G.clears.length = 0; G.pops.clear(); G.undoPulse = 0.5; G.banner = null;
    shell.sfx.play('release');
    pops.add(lay().undo.x + lay().undo.w / 2, lay().undo.y - 6, 'UNDONE', '#2de2e6', 14);
    syncHud();
  }
}

// ---------------------------------------------------------------- committing a placement
function commit(i, r, c, viaTap) {
  const g = G.game;
  const res = g.place(i, r, c);
  if (!res.ok) { rejectFx(i, { r, c }); return false; }
  const l = lay();
  G.sel = G.kb ? firstPlayable(i - 1, 1) : null;     // keyboard / controller play continues with the next piece
  void viaTap;
  // pop-in animation for the new cells
  for (const [rr, cc] of res.cells) G.pops.set(rr * SIZE + cc, G.t);
  shell.sfx.play('place');
  if (res.lines) {
    for (const cell of res.cleared) {
      G.clears.push({ r: cell.r, c: cell.c, color: cell.color, t: 0, d: (Math.abs(cell.r - (r + res.shape.h / 2)) + Math.abs(cell.c - (c + res.shape.w / 2))) * 0.018 });
      const p = cellCenter(cell.r, cell.c);
      fx.emit(p.x, p.y, 4, { speed: 150 + res.lines * 40, life: 0.65, size: 4, color: [PALETTE[cell.color % 8], '#ffffff'], grav: 380 });
    }
    const mid = { x: l.bx + l.B / 2, y: l.by + l.B / 2 };
    G.banner = { text: res.label, sub: `+${formatScore(res.linePoints)}`, t: 0, color: res.lines >= 4 ? '#ffe14d' : res.combo >= 3 ? '#ff6bd6' : '#ffffff', big: res.lines >= 3 || res.combo >= 3 };
    if (res.boardClear) { G.banner = { text: 'PERFECT BOARD!', sub: `+${formatScore(res.linePoints)}`, t: 0, color: '#5dff8f', big: true }; fx.emit(mid.x, mid.y, 80, { speed: 360, life: 1, size: 5, color: PALETTE, grav: 200 }); }
    shell.sfx.play(res.lines >= 3 || res.combo >= 4 ? 'blast' : 'blockclear');
    shake.kick(1.5 + res.lines * 1.8);
    G.flash = Math.min(0.5, 0.18 * res.lines);
  } else {
    const p = cellCenter(r + (res.shape.h - 1) / 2, c + (res.shape.w - 1) / 2);
    pops.add(p.x, p.y - l.c * 0.6, `+${res.points}`, '#bfc6ff', 14);
  }
  shell.facts({ lines: g.lines, maxLines: g.maxLines, maxCombo: g.maxCombo, score: g.score, mode: G.mode });
  if (G.mode === 'daily' && !G.goalHit && g.score >= G.daily.target) {
    G.goalHit = true;
    pops.add(l.bx + l.B / 2, l.by + l.B * 0.2, 'GOAL REACHED!', '#5dff8f', 20);
    shell.sfx.play('checkpoint');
  }
  syncHud();
  if (res.over) beginEnd(res.overReason);
  return true;
}

function beginEnd(reason) {
  if (G.ending || G.ended) return;
  G.ending = 0.0001; G.reason = reason; G.sel = null; G.drag = null;
  if (reason === 'stuck') G.banner = { text: 'NO MOVES LEFT', sub: '', t: 0, color: '#ff8a8a', big: true };
  else if (reason === 'time') G.banner = { text: "TIME'S UP!", sub: '', t: 0, color: '#ffe14d', big: true };
  else G.banner = { text: 'ALL SETS PLAYED', sub: '', t: 0, color: '#ffe14d', big: true };
  if (reason !== 'time') shake.kick(4);
}

function update(dt) {
  const g = G.game; if (!g) return;
  G.t += dt;
  tickAnims(dt);
  fx.update(dt); pops.update(dt); shake.update(dt);
  if (MP.on && !mpStep(dt)) return;
  if (G.ending) {
    G.ending += dt;
    if (G.ending > (G.reason === 'time' ? 0.9 : 1.25) && !G.ended) { G.ended = true; finishRun(); }
    return;
  }
  if (G.mode === 'timeattack') {
    G.timeLeft -= dt;
    const whole = Math.ceil(G.timeLeft);
    if (whole <= 10 && whole !== G.lowTime && whole > 0) { G.lowTime = whole; shell.sfx.play('tick'); }
    if (G.timeLeft <= 0) { G.timeLeft = 0; syncHud(); beginEnd('time'); return; }
    syncHud();
  }
  // keyboard / controller
  const i = shell.input;
  const press = (a) => i.pressed(a);
  let used = false;
  for (const [a, dr, dc] of [['left', 0, -1], ['right', 0, 1], ['up', -1, 0], ['down', 1, 0]]) {
    if (press(a)) { G.kb = true; G.cursor = { r: clamp(G.cursor.r + dr, 0, SIZE - 1), c: clamp(G.cursor.c + dc, 0, SIZE - 1) }; used = true; }
  }
  for (let k = 0; k < 3; k++) if (press('s' + (k + 1)) && g.tray[k]) { G.sel = k; G.kb = true; used = true; shell.sfx.play('click'); }
  if (press('next')) { G.sel = firstPlayable(G.sel === null ? -1 : G.sel, 1); G.kb = true; used = true; shell.sfx.play('click'); }
  if (press('prev')) { G.sel = firstPlayable(G.sel === null ? 0 : G.sel, -1); G.kb = true; used = true; shell.sfx.play('click'); }
  if (press('undo')) doUndo();
  if (used && G.sel === null) G.sel = firstPlayable(-1, 1);
  if (press('place') && G.kb) {
    if (G.sel === null) G.sel = firstPlayable(-1, 1);
    const p = G.sel !== null && g.tray[G.sel];
    if (p) { const a = anchorFromCell(p.shape, G.cursor.r, G.cursor.c); commit(G.sel, a.r, a.c, true); }
  }
}

function tickAnims(dt) {
  for (const c of G.clears) c.t += dt;
  while (G.clears.length && G.clears[0].t > 0.7) G.clears.shift();
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 1.5) G.banner = null; }
  G.flash = Math.max(0, G.flash - dt * 1.8);
  G.undoPulse = Math.max(0, G.undoPulse - dt);
  G.newBestFx = Math.max(0, G.newBestFx - dt);
}

// ---------------------------------------------------------------- finishing
function finishRun() {
  if (MP.on) { mpEnd(); return; }
  const g = G.game, mode = G.mode;
  const score = g.score;
  let dailyCount = dailyCountDone(), won = false, title = 'GAME OVER', subtitle = '', extraHTML = '';
  if (mode === 'daily') {
    won = score >= G.daily.target;
    dailyCount = recordDaily(G.daily.key, score, won);
    title = won ? 'DAILY COMPLETE!' : 'DAILY OVER';
    subtitle = won ? `You beat today’s goal of ${formatScore(G.daily.target)}.` : `Goal ${formatScore(G.daily.target)} — so close? Try again, same pieces.`;
  } else if (mode === 'timeattack') { title = "TIME'S UP!"; won = true; }
  const bestField = modeDef(mode).field;
  const prev = store.getGame(ID)[bestField] || 0;
  const isRecord = score > prev && score > 0;
  if (isRecord) {
    G.newBestFx = 3;
    const confetti = Array.from({ length: 28 }, (_, k) => `<i style="left:${Math.round(4 + k * 3.4)}%;background:${PALETTE[k % 8]};--dx:${((k * 37) % 90) - 45}px;--rot:${((k * 83) % 720) - 360}deg;animation-delay:${(k % 7) * 0.07}s"></i>`).join('');
    extraHTML = `<div class="pbb-confetti" aria-hidden="true">${confetti}</div>`;
  }
  if (mode === 'daily') extraHTML += `<div class="pbb-daily${won ? ' ok' : ''}">${won ? '✓ Daily challenge completed' : `Goal: ${formatScore(G.daily.target)}`} · ${esc(G.daily.key)}</div>`;
  // lifetime totals shown on the profile
  const sv = store.getGame(ID);
  store.setField(ID, 'totalLines', (sv.totalLines || 0) + g.lines);
  store.setField(ID, 'totalBlocks', (sv.totalBlocks || 0) + g.placed);
  if (won && mode === 'daily') store.setField(ID, 'dailiesDone', dailyCount);
  const facts = { score, lines: g.lines, maxLines: g.maxLines, maxCombo: g.maxCombo, placed: g.placed, mode, daily: mode === 'daily', dailyDone: mode === 'daily' && won, dailyCount };
  const r = {
    win: won || isRecord, title, subtitle, score, scoreText: formatScore(score),
    extras: { highCombo: g.maxCombo },
    facts, counters: { lines: g.lines, blocks: g.placed, ['mode_' + mode]: 1, ...(mode === 'daily' && won ? { dailyWins: 1 } : {}) },
    milestones: [['Lines cleared', Math.min(40, g.lines * 2)], ['Best combo', Math.min(30, g.maxCombo * 5)], ...(mode === 'daily' && won ? [['Daily complete', 40]] : [])],
    summary: `${modeDef(mode).label} · ${formatScore(score)}`,
    stats: [
      ['Personal best', formatScore(Math.max(prev, score))],
      ['Lines cleared', String(g.lines)],
      ['Highest combo', `×${g.maxCombo}`],
      ['Blocks placed', String(g.placed)],
    ],
    extraHTML,
    buttonsHTML: '<button type="button" class="g-btn primary big" data-act="pbb-again">PLAY AGAIN</button><button type="button" class="g-btn" data-act="pbb-mode">CHANGE MODE</button><a class="g-btn" href="../../index.html#/achievements">VIEW ACHIEVEMENTS</a><a class="g-btn" href="../../index.html">RETURN TO ARCADE</a>',
  };
  shell.finish(r);
  if (isRecord) {
    shell.sfx.play('newbest');
    const l = lay();
    for (let k = 0; k < 4; k++) fx.emit(l.bx + l.B * (0.15 + 0.23 * k), l.by + l.B * (0.3 + 0.1 * (k % 2)), 28, { speed: 320, life: 1.2, size: 5, color: PALETTE, grav: 260 });
  }
}

// ---------------------------------------------------------------- rendering
const spriteCache = new Map();
function sprite(color, s) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(8, Math.round(s * dpr));
  const key = color + '|' + px;
  let cv = spriteCache.get(key);
  if (cv) return cv;
  if (spriteCache.size > 200) spriteCache.clear();
  cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const pad = px * 0.045, w = px - pad * 2, rad = px * 0.24;
  const base = PALETTE[color % 8];
  const grad = g.createLinearGradient(0, pad, 0, px - pad);
  grad.addColorStop(0, lighten(base, 0.38)); grad.addColorStop(0.5, base); grad.addColorStop(1, darken(base, 0.35));
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = px * 0.08; g.shadowOffsetY = px * 0.04;
  roundRectPath(g, pad, pad, w, w, rad); g.fillStyle = grad; g.fill();
  g.shadowColor = 'transparent';
  roundRectPath(g, pad, pad, w, w, rad); g.lineWidth = Math.max(1, px * 0.035); g.strokeStyle = darken(base, 0.45); g.stroke();
  // glossy highlight + inner bevel
  roundRectPath(g, pad + px * 0.07, pad + px * 0.06, w - px * 0.14, w * 0.34, rad * 0.7);
  const hl = g.createLinearGradient(0, pad, 0, pad + w * 0.4); hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,.04)');
  g.fillStyle = hl; g.fill();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(pad + px * 0.2, pad + px * 0.2, px * 0.035, 0, TAU); g.fill();
  spriteCache.set(key, cv);
  return cv;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lighten(h, k) { const [r, g, b] = hexRgb(h); return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`; }
function darken(h, k) { const [r, g, b] = hexRgb(h); return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`; }

function drawBlock(ctx, x, y, s, color, alpha = 1, scale = 1) {
  const sp = sprite(color, s);
  ctx.globalAlpha = alpha;
  const d = s * scale, o = (s - d) / 2;
  ctx.drawImage(sp, x + o, y + o, d, d);
  ctx.globalAlpha = 1;
}

function drawBackground(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120a35'); g.addColorStop(0.6, '#1b0f47'); g.addColorStop(1, '#2a0c4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // drifting neon squares
  const t = G.t;
  for (let i = 0; i < 14; i++) {
    const s = 14 + (i * 13) % 26, x = ((i * 97) % W + t * (6 + i % 5) * (i % 2 ? 1 : -1) + W * 2) % W, y = ((i * 151) % H + t * 4 * (1 + i % 3) + H) % H;
    ctx.globalAlpha = 0.07 + (i % 4) * 0.02;
    ctx.fillStyle = PALETTE[i % 8];
    roundRectPath(ctx, x, y, s, s, s * 0.25); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // faint grid
  ctx.strokeStyle = 'rgba(180,140,255,.06)'; ctx.lineWidth = 1;
  for (let x = (t * 6) % 48; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function render(ctx, W, H) {
  const l = lay();
  const g = G.game;
  drawBackground(ctx, W, H);
  if (!g) return;
  ctx.save();
  ctx.translate(Math.round(shake.x), Math.round(shake.y));
  const pv = currentPreview();
  const lines = pv && pv.valid ? previewLines(g.board, g.tray[pv.i].shape, pv.r, pv.c) : null;

  // board panel
  const pad = Math.max(6, l.c * 0.14);
  roundRectPath(ctx, l.bx - pad, l.by - pad, l.B + pad * 2, l.B + pad * 2, l.c * 0.35);
  const bg = ctx.createLinearGradient(0, l.by, 0, l.by + l.B); bg.addColorStop(0, '#171046'); bg.addColorStop(1, '#0d0830');
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = G.mode === 'timeattack' && G.timeLeft < 10 && !G.ending ? `rgba(255,90,90,${0.5 + 0.4 * Math.sin(G.t * 10)})` : 'rgba(255,107,214,.65)';
  if (!shell.lowFx) { ctx.shadowColor = '#ff6bd6'; ctx.shadowBlur = 16; }
  ctx.stroke(); ctx.shadowBlur = 0;

  // empty slots
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const quad = ((r >> 2) + (c >> 2)) % 2;
    ctx.fillStyle = quad ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.045)';
    roundRectPath(ctx, l.bx + c * l.c + 1.5, l.by + r * l.c + 1.5, l.c - 3, l.c - 3, l.c * 0.2); ctx.fill();
  }

  // would-complete highlight (rows and columns that this placement finishes)
  if (lines && (lines.rows.length || lines.cols.length)) {
    const a = 0.18 + 0.1 * Math.sin(G.t * 9);
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    for (const r of lines.rows) { roundRectPath(ctx, l.bx, l.by + r * l.c, l.B, l.c, l.c * 0.2); ctx.fill(); ctx.stroke(); }
    for (const c of lines.cols) { roundRectPath(ctx, l.bx + c * l.c, l.by, l.c, l.B, l.c * 0.2); ctx.fill(); ctx.stroke(); }
  }

  // placed blocks
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = g.board[r * SIZE + c]; if (!v) continue;
    const born = G.pops.get(r * SIZE + c);
    let sc = 1;
    if (born !== undefined) { const k = (G.t - born) / 0.22; if (k < 1) sc = 0.7 + 0.45 * Math.sin(k * Math.PI * 0.85) + 0.3 * (1 - k) * 0; else G.pops.delete(r * SIZE + c); }
    drawBlock(ctx, l.bx + c * l.c, l.by + r * l.c, l.c, v - 1, 1, Math.min(sc, 1.12));
  }

  // clearing animation: cells flash white, then shrink away (sweeping outward from the placement)
  for (const cl of G.clears) {
    const k = clamp((cl.t - cl.d) / 0.45, 0, 1);
    if (cl.t < cl.d) { drawBlock(ctx, l.bx + cl.c * l.c, l.by + cl.r * l.c, l.c, cl.color, 1, 1); continue; }
    const sc = 1 - k * k;
    if (sc <= 0.02) continue;
    drawBlock(ctx, l.bx + cl.c * l.c, l.by + cl.r * l.c, l.c, cl.color, 1 - k * 0.5, sc * (1 + (1 - k) * 0.12));
    ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.85})`;
    const s = l.c * sc; roundRectPath(ctx, l.bx + cl.c * l.c + (l.c - s) / 2, l.by + cl.r * l.c + (l.c - s) / 2, s, s, s * 0.24); ctx.fill();
  }

  // placement preview
  if (pv) {
    const shape = g.tray[pv.i].shape;
    for (const [dr, dc] of shape.cells) {
      const rr = pv.r + dr, cc = pv.c + dc;
      if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue;
      const x = l.bx + cc * l.c, y = l.by + rr * l.c;
      if (pv.valid) {
        drawBlock(ctx, x, y, l.c, shape.color, 0.5, 1);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; roundRectPath(ctx, x + 3, y + 3, l.c - 6, l.c - 6, l.c * 0.2); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,60,80,.45)'; roundRectPath(ctx, x + 2, y + 2, l.c - 4, l.c - 4, l.c * 0.2); ctx.fill();
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';           // ✕ — a non-colour cue for "blocked"
        const m = l.c * 0.3; ctx.beginPath(); ctx.moveTo(x + m, y + m); ctx.lineTo(x + l.c - m, y + l.c - m); ctx.moveTo(x + l.c - m, y + m); ctx.lineTo(x + m, y + l.c - m); ctx.stroke();
      }
    }
  }

  // tray
  for (let i = 0; i < 3; i++) {
    const s = l.slots[i], p = g.tray[i];
    const selected = G.sel === i && p;
    roundRectPath(ctx, s.x, s.y, s.w, s.h, 14);
    ctx.fillStyle = selected ? 'rgba(255,107,214,.2)' : 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.lineWidth = selected ? 3 : 1.5; ctx.strokeStyle = selected ? '#ff6bd6' : 'rgba(255,255,255,.18)';
    if (selected && !shell.lowFx) { ctx.shadowColor = '#ff6bd6'; ctx.shadowBlur = 14; }
    ctx.stroke(); ctx.shadowBlur = 0;
    // slot number (for the keyboard)
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '700 12px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(i + 1), s.x + 8, s.y + 6);
    if (!p) continue;
    const shape = p.shape;
    const ct = Math.min((s.w - 22) / 5, (s.h - 22) / 5, l.c * 0.74);
    const ox = s.x + (s.w - shape.w * ct) / 2, oy = s.y + (s.h - shape.h * ct) / 2;
    const dragging = G.drag && G.drag.moved && G.drag.i === i;
    const fits = canPlaceAnywhere(g.board, shape);
    const alpha = dragging ? 0.2 : fits ? 1 : 0.38;
    for (const [dr, dc] of shape.cells) drawBlock(ctx, ox + dc * ct, oy + dr * ct, ct, shape.color, alpha, 1);
    if (!fits && !dragging) {      // can't be placed anywhere right now: strike through
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x + s.w * 0.3, s.y + s.h * 0.3); ctx.lineTo(s.x + s.w * 0.7, s.y + s.h * 0.7); ctx.moveTo(s.x + s.w * 0.7, s.y + s.h * 0.3); ctx.lineTo(s.x + s.w * 0.3, s.y + s.h * 0.7); ctx.stroke();
    }
  }

  // undo button
  {
    const u = l.undo, can = g.undosLeft > 0 && !!g.undoState && !G.ending;
    roundRectPath(ctx, u.x, u.y, u.w, u.h, 12);
    ctx.fillStyle = G.undoPulse > 0 ? 'rgba(45,226,230,.35)' : can ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = can ? 'rgba(45,226,230,.8)' : 'rgba(255,255,255,.15)'; ctx.stroke();
    ctx.fillStyle = can ? '#e8ffff' : 'rgba(255,255,255,.35)'; ctx.font = '800 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`↶ UNDO  ${g.undosLeft}/${UNDO_USES}`, u.x + u.w / 2, u.y + u.h / 2 + 1);
  }

  // the floating piece being dragged
  if (G.drag && G.drag.moved && g.tray[G.drag.i]) {
    const shape = g.tray[G.drag.i].shape;
    dragAnchor(G.drag, shape);
    const x0 = G.drag.cx - shape.w * l.c / 2, y0 = G.drag.cy - shape.h * l.c / 2;
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    for (const [dr, dc] of shape.cells) { roundRectPath(ctx, x0 + dc * l.c + 4, y0 + dr * l.c + 10, l.c - 2, l.c - 2, l.c * 0.25); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const [dr, dc] of shape.cells) drawBlock(ctx, x0 + dc * l.c, y0 + dr * l.c, l.c, shape.color, 0.92, 1.04);
  }

  // keyboard cursor
  if (G.kb && !G.ending) {
    const p = cellCenter(G.cursor.r, G.cursor.c);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
    roundRectPath(ctx, p.x - l.c / 2 + 2, p.y - l.c / 2 + 2, l.c - 4, l.c - 4, l.c * 0.2); ctx.stroke(); ctx.setLineDash([]);
  }

  fx.draw(ctx);
  pops.draw(ctx);

  // combo pill and goal
  if (g.combo >= 2) {
    const txt = `COMBO ×${g.combo}`;
    ctx.font = '900 14px "Trebuchet MS", sans-serif'; const w = ctx.measureText(txt).width + 22;
    const cx = l.bx + l.B / 2, cy = l.by - Math.max(6, l.c * 0.14) - 1;
    ctx.fillStyle = 'rgba(255,107,214,.92)'; roundRectPath(ctx, cx - w / 2, cy - 14, w, 24, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx, cy - 1);
  }
  if (G.mode === 'daily') {
    const t = G.daily.target, k = clamp(g.score / t, 0, 1);
    const bw = l.B, bx = l.bx, by = l.by + l.B + Math.max(6, l.c * 0.14) + 3;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRectPath(ctx, bx, by, bw, 6, 3); ctx.fill();
    ctx.fillStyle = k >= 1 ? '#5dff8f' : '#ff6bd6'; roundRectPath(ctx, bx, by, Math.max(6, bw * k), 6, 3); ctx.fill();
  }
  if (G.mode === 'timeattack') {
    const k = clamp(G.timeLeft / TIME_ATTACK_SECS, 0, 1);
    const bw = l.B, bx = l.bx, by = l.by + l.B + Math.max(6, l.c * 0.14) + 3;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRectPath(ctx, bx, by, bw, 6, 3); ctx.fill();
    ctx.fillStyle = G.timeLeft < 10 ? '#ff5a5a' : '#2de2e6'; roundRectPath(ctx, bx, by, Math.max(4, bw * k), 6, 3); ctx.fill();
  }

  if (MP.on && MP.cd > 0) {
    ctx.fillStyle = 'rgba(6,4,30,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '900 64px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.ceil(MP.cd)), W / 2, H / 2 - 10);
    ctx.font = '800 16px "Trebuchet MS", sans-serif'; ctx.fillText('BLOCK DUEL · same pieces for everyone', W / 2, H / 2 + 40);
  } else if (MP.on && MP.kind === 'online' && !G.ending) {
    const left = Math.max(0, Math.ceil(DUEL_MAX_SECS - MP.t));
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '800 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, l.bx + l.B, Math.max(2, l.by - 24));
  }

  // banner
  if (G.banner) {
    const b = G.banner, k = clamp(b.t / 1.5, 0, 1);
    const sc = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.12) / 0.08) * 0.15 : 1;
    const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const cx = l.bx + l.B / 2, cy = l.by + l.B * 0.42;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha = a;
    const size = Math.round(l.c * (b.big ? 0.95 : 0.7));
    ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, size * 0.18); ctx.strokeStyle = 'rgba(20,6,50,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
    if (b.sub) { ctx.font = `900 ${Math.round(size * 0.7)}px "Trebuchet MS", system-ui, sans-serif`; ctx.strokeText(b.sub, 0, size * 0.85); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, size * 0.85); }
    ctx.restore();
  }
  ctx.restore();
  if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.35; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}


// ================================================================ Block Duel
const MP_CFG = { supported: true, minPlayers: 2, maxPlayers: 2, bots: false, local: false, online: true };

function mpReady(sh) {
  MP.kit = createMpKit({
    shell: sh, game: { id: ID, title: 'Pocket Block Blast', accent: '#ff6bd6', mp: MP_CFG, players: '2 players · same pieces, highest score wins' },
    schema: [], defaults: {}, localMax: 2, settingsKey: 'pbb.cfg',
    hostExtra: () => ({ seed: (Math.random() * 4294967296) >>> 0 }),
    onStart: mpStart,
  });
  MP.kit.start();
}

function mpStart(info) {
  if (info.kind !== 'online') return;
  mpCleanup();
  MP.on = true; MP.kind = 'online'; MP.info = info; MP.fresh = true; MP.ended = false;
  MP.seed = ((info.extra && info.extra.seed) >>> 0) || 1;
  MP.kit.clearNotice();
  MP.room = info.room;
  MP.board = new PeerBoard(info.room, info.roster.slice(0, 2), { stage: shell.stage, fmt: (p) => `${formatScore(p.score)}${p.done ? ' ✓' : ''}` });
  MP.offs = [MP.kit.wire(info.room, { onClosed: () => { if (MP.on) mpLeave(); } })];
  MP.kit.setStatus('game');
  shell.restart();
}

function mpStep(dt) {
  MP.board.ui(dt);
  if (MP.cd > 0) {
    const before = Math.ceil(MP.cd);
    MP.cd -= dt;
    if (Math.ceil(MP.cd) !== before) shell.sfx.play(MP.cd > 0 ? 'tick' : 'go');
    return false;
  }
  MP.t += dt;
  const g = G.game;
  MP.board.update(dt, { done: g.over || !!G.ending, score: g.score, aux: { s: g.sets } });
  if (!G.ending && MP.t >= DUEL_MAX_SECS) beginEnd('time');
  if (G.ended && !MP.ended) {
    if (MP.board.allOthersDone) mpFinish();
    else if (waitEl) { const left = MP.board.others.filter((p) => !p.done).length; waitEl.textContent = `You finished with ${formatScore(g.score)} · waiting for ${left} more player${left === 1 ? '' : 's'}`; }
  }
  return true;
}

function mpEnd() {
  const g = G.game;
  MP.board.update(0, { done: true, score: g.score, aux: { s: g.sets } });
  if (!waitEl) { waitEl = document.createElement('div'); waitEl.className = 'mp-wait'; shell.stage.appendChild(waitEl); }
  if (MP.board.allOthersDone) mpFinish();
}

function mpFinish() {
  if (MP.ended) return;
  MP.ended = true;
  const g = G.game;
  MP.board.update(0, { done: true, score: g.score, aux: { s: g.sets } });
  if (waitEl) { waitEl.remove(); waitEl = null; }
  const list = MP.board.ranking().map((p) => ({ name: p.name, score: p.score, me: p.me }));
  const myIdx = list.findIndex((p) => p.me), rank = myIdx + 1, n = list.length;
  const tie = n > 1 && list[0].score === list[1].score && (myIdx === 0 || myIdx === 1);
  const win = rank === 1 && !tie;
  const opp = list.find((p) => !p.me);
  const diff = opp ? g.score - opp.score : 0;
  shell.finish({
    win, title: 'MATCH OVER', subtitle: tie ? 'It’s a tie!' : win ? 'You win!' : `You finished ${rankText(rank)} of ${n}`,
    scoreText: formatScore(g.score), delay: 800,
    facts: { score: g.score, lines: g.lines, maxLines: g.maxLines, maxCombo: g.maxCombo, placed: g.placed, mode: 'duel', duel: true, win, players: n, dailyCount: dailyCountDone() },
    counters: { lines: g.lines, blocks: g.placed, pbbMatches: 1, pbbWins: win ? 1 : 0 },
    milestones: [...(win ? [['Won the duel', 20]] : []), ['Played with others', 10], ['Lines cleared', Math.min(20, g.lines)]],
    summary: `Block Duel · ${tie ? 'tie' : win ? 'won' : rankText(rank)}`,
    stats: [['Your score', formatScore(g.score)], ['Opponent', opp ? formatScore(opp.score) : '—'], ['Difference', `${diff > 0 ? '+' : ''}${formatScore(diff)}`], ['Lines cleared', String(g.lines)], ['Highest combo', `×${g.maxCombo}`]],
    extraHTML: standingsHTML(list.map((p) => ({ name: p.name, text: formatScore(p.score), me: p.me })), 'Final scores'),
    buttonsHTML: '<button type="button" class="g-btn primary big" data-act="pbb-rematch">REMATCH</button><button type="button" class="g-btn" data-act="pbb-lobby">RETURN TO LOBBY</button><a class="g-btn" href="../../index.html">ARCADE HOME</a>',
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
  MP.on = false; MP.room = null; MP.fresh = false; MP.kind = null;
  mpCleanup();
  if (room && !room.closed) room.leave().catch(() => {});
  MP.kit.conn(undefined);
  shell.toReady();
  MP.kit.setStatus('online');
  MP.kit.lobby.openMenu();
}

function mpBack(ready) {
  const room = MP.room;
  MP.on = false; MP.kind = null; mpCleanup(); MP.kit.conn(undefined); shell.toReady(); MP.kit.setStatus('lobby');
  MP.kit.lobby.backToRoom(room, { ready });
}

function mpAct(act) {
  if (!MPQ) return false;
  if (act === 'pbb-rematch') { mpBack(true); return true; }
  if (act === 'pbb-lobby') { mpBack(false); return true; }
  if (act === 'pbb-leave') { mpLeave(); return true; }
  if (act === 'restart' || act === 'pbb-again' || act === 'pbb-mode') return !!MP.on;      // no restarts inside a duel
  return false;
}

function mpPauseHTML() {
  return `<h2 id="g-panel-title">Menu</h2><p class="p-sub">The match keeps going while this menu is open.</p>
    <div class="p-menu"><button type="button" class="g-btn primary big" data-act="resume">Resume</button><button type="button" class="g-btn" data-act="help">How to play</button>
    <button type="button" class="g-btn" data-act="mute">${shell.store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button><button type="button" class="g-btn" data-act="pbb-leave">Leave match</button><a class="g-btn" href="../../index.html">Arcade Home</a></div>`;
}

// hooks for automated tests
window.__pbb = {
  shell, G, MP, get kit() { return MP.kit; }, get game() { return G.game; }, layout: lay, commit, cellCenter, dailyInfo, todayInfo, doUndo, finishRun, recordDaily,
  newGame(opts) { G.game = new Game(opts); G.mode = opts.mode || 'classic'; G.daily = opts.daily || null; G.ending = 0; G.ended = false; syncHud(); return G.game; },
};
