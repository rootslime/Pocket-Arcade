// Persistent save data (localStorage) with defensive parsing.
// A corrupted or missing save can never throw: it falls back to defaults.
const KEY = 'pocketArcade.v1';

const defaults = () => ({
  settings: { muted: false, reducedMotion: null, touchPad: false },
  games: {
    grappleRush: { bestTime: null },
    neonDodge: { highScore: 0, bestTime: 0 },
    turboSnake: { highScore: 0, classicHigh: 0, turboHigh: 0 },
    brickBlast: { highScore: 0, highestLevel: 1 },
    asteroidDash: { highScore: 0, highestWave: 1 },
  },
});

let state = null;
let memoryOnly = null; // used when localStorage is unavailable
const listeners = new Set();

const isNum = (v) => typeof v === 'number' && isFinite(v);
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Copy `raw` onto `base`, keeping only values whose type matches the default. */
function mergeTyped(base, raw) {
  if (!isPlain(raw)) return base;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (!(k in base)) {
      // unknown field (e.g. a newly added game): keep plain scalars only
      if (isNum(v) || typeof v === 'boolean' || typeof v === 'string' || v === null) base[k] = v;
      continue;
    }
    const d = base[k];
    if (typeof d === 'number') {
      if (isNum(v) && v >= 0) base[k] = v;
    } else if (typeof d === 'boolean') {
      if (typeof v === 'boolean') base[k] = v;
    } else if (d === null) {
      // nullable numeric field (best time) or nullable boolean (reducedMotion)
      if (v === null || isNum(v) && v > 0 || typeof v === 'boolean') base[k] = v;
    } else if (isPlain(d)) {
      mergeTyped(d, v);
    }
  }
  return base;
}

function sanitize(raw) {
  const s = defaults();
  if (!isPlain(raw)) return s;
  mergeTyped(s.settings, raw.settings);
  if (isPlain(raw.games)) {
    for (const id of Object.keys(raw.games)) {
      if (!isPlain(raw.games[id])) continue;
      if (!s.games[id]) s.games[id] = {};
      mergeTyped(s.games[id], raw.games[id]);
    }
  }
  return s;
}

function read() {
  try {
    const txt = window.localStorage.getItem(KEY);
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    return memoryOnly;
  }
}

function write() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    memoryOnly = JSON.parse(JSON.stringify(state));
  }
  listeners.forEach((fn) => { try { fn(state); } catch (e) { /* ignore */ } });
}

export function load() {
  state = sanitize(read());
  return state;
}

function ensure() { return state || load(); }

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSave = () => ensure();
export const getSetting = (k) => ensure().settings[k];
export function setSetting(k, v) { ensure().settings[k] = v; write(); }
export const isMuted = () => !!ensure().settings.muted;
export const setMuted = (m) => setSetting('muted', !!m);

/** Reduced motion: explicit user choice wins, otherwise follow the OS. */
export function prefersReducedMotion() {
  const v = ensure().settings.reducedMotion;
  if (typeof v === 'boolean') return v;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

export function getGame(id) {
  const s = ensure();
  if (!s.games[id]) s.games[id] = {};
  return s.games[id];
}

/**
 * Record a result. `kind` 'high' keeps the max, 'low' keeps the minimum (times).
 * Returns { isNew, prev, best }.
 */
export function submit(id, field, value, kind = 'high') {
  const g = getGame(id);
  const prev = g[field] === undefined ? null : g[field];
  let isNew = false;
  if (isNum(value)) {
    if (kind === 'low') isNew = prev === null || prev === 0 || value < prev;
    else isNew = prev === null || value > prev;
    if (kind === 'high' && value <= 0) isNew = false;
    if (isNew) { g[field] = value; write(); }
  }
  return { isNew, prev: prev === 0 ? null : prev, best: g[field] === undefined ? null : g[field] };
}

export function setField(id, field, value) { getGame(id)[field] = value; write(); }

export function resetAll() {
  const muted = ensure().settings;
  state = defaults();
  state.settings = { ...state.settings, muted: muted.muted, reducedMotion: muted.reducedMotion };
  write();
}
