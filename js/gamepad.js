// Gamepad support (browser Gamepad API). Everything here is optional: if no controller is present
// nothing changes. Provides
//   * pad.state()            normalised buttons + analog axes
//   * applyToInput()         maps controller inputs onto a game's action Input
//   * startMenuNav(handler)  D-pad / left stick / A / B navigation events for menus
import { toast } from './toast.js';

// standard mapping button indices
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, ls: 10, rs: 11, dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15 };
const DEAD = 0.28;

const cur = { connected: false, id: '', buttons: {}, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
const prev = { buttons: {} };
const listeners = new Set();
let lastStamp = -1;
let announced = false;

export const isConnected = () => cur.connected;
export const onConnectionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function firstPad() {
  try {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of list) if (g && g.connected) return g;
  } catch (e) { /* ignore */ }
  return null;
}

/** Poll once per animation frame (idempotent within a frame). */
export function poll() {
  const g = firstPad();
  const now = performance.now();
  if (now === lastStamp) return cur;
  lastStamp = now;
  prev.buttons = cur.buttons;
  if (!g) {
    if (cur.connected) { cur.connected = false; cur.buttons = {}; cur.lx = cur.ly = cur.rx = cur.ry = 0; listeners.forEach((fn) => fn(false)); }
    return cur;
  }
  if (!cur.connected) { cur.connected = true; cur.id = g.id; listeners.forEach((fn) => fn(true)); }
  const b = {};
  for (const [name, i] of Object.entries(BTN)) b[name] = !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
  const ax = (i) => { const v = g.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; };
  cur.lx = ax(0); cur.ly = ax(1); cur.rx = ax(2); cur.ry = ax(3);
  cur.lt = g.buttons[6] ? g.buttons[6].value : 0; cur.rt = g.buttons[7] ? g.buttons[7].value : 0;
  // virtual stick-direction buttons
  b.lsLeft = cur.lx < -0.5; b.lsRight = cur.lx > 0.5; b.lsUp = cur.ly < -0.5; b.lsDown = cur.ly > 0.5;
  b.rsLeft = cur.rx < -0.5; b.rsRight = cur.rx > 0.5; b.rsUp = cur.ry < -0.5; b.rsDown = cur.ry > 0.5;
  cur.buttons = b;
  return cur;
}

export const state = () => poll();

/** Every connected controller (for local multiplayer): [{ index, btn(i), ax(i) }] using the standard mapping. */
export function allPads() {
  const out = [];
  try {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of list) {
      if (!g || !g.connected) continue;
      out.push({
        index: g.index, id: g.id,
        btn: (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5)),
        ax: (i) => { const v = g.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; },
      });
    }
  } catch (e) { /* ignore */ }
  return out;
}
export const pressedNow = (name) => !!(cur.buttons[name] && !prev.buttons[name]);

/** Map controller tokens onto a game Input. map: { action: ['a','dpadLeft','lsLeft', ...] } */
export function applyToInput(input, map) {
  const c = poll();
  if (!c.connected || !map) return;
  for (const action of Object.keys(map)) {
    let down = false;
    for (const tok of map[action]) if (c.buttons[tok]) { down = true; break; }
    input.set('gp', action, down);
  }
}

/** Shows the "controller connected" toast once, and keeps listeners alive. */
export function initGamepad() {
  if (announced) return;
  announced = true;
  window.addEventListener('gamepadconnected', () => { poll(); toast({ icon: '🎮', kicker: 'Controller', title: 'CONTROLLER CONNECTED', text: 'D-pad to move · A select · B back', color: '#2de2e6', ms: 3200 }); });
  window.addEventListener('gamepaddisconnected', () => { poll(); toast({ icon: '🎮', kicker: 'Controller', title: 'Controller disconnected', text: 'Keyboard and touch still work.', color: '#ff8a3d', ms: 2800 }); });
}

/**
 * Menu navigation. handler(dir) with dir in 'up','down','left','right','select','back','start'.
 * Runs its own rAF loop only while a controller is connected.
 */
export function startMenuNav(handler) {
  let raf = 0;
  const heldSince = {};
  const REPEAT_FIRST = 380, REPEAT = 130;
  const dirs = { up: ['dpadUp', 'lsUp'], down: ['dpadDown', 'lsDown'], left: ['dpadLeft', 'lsLeft'], right: ['dpadRight', 'lsRight'] };
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    const c = poll();
    if (!c.connected) return;
    for (const d of Object.keys(dirs)) {
      const down = dirs[d].some((tok) => c.buttons[tok]);
      if (!down) { heldSince[d] = 0; continue; }
      if (!heldSince[d]) { heldSince[d] = t; heldSince[d + 'n'] = t + REPEAT_FIRST; handler(d); }
      else if (t >= heldSince[d + 'n']) { heldSince[d + 'n'] = t + REPEAT; handler(d); }
    }
    if (pressedNow('a')) handler('select');
    if (pressedNow('b')) handler('back');
    if (pressedNow('start')) handler('start');
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
