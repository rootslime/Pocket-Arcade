// Persistent save data (localStorage) with defensive parsing.
//
// * Guests use the key `pocketArcade.v1`.
// * Signed-in players use a per-account cache key `pocketArcade.u.<userId>` that is wiped on sign-out
//   (so account data never lingers on a shared computer). The cloud copy is the source of truth.
// A corrupted or missing save can never throw: it falls back to defaults field by field.
import { peekUser } from './session.js';

export const GUEST_KEY = 'pocketArcade.v1';
export const USER_KEY_PREFIX = 'pocketArcade.u.';

const defaultGames = () => ({
  grappleRush: { bestTime: null, bestTime_sunset: null, bestTime_cloud: null, bestTime_spring: null, bestTime_chain: null, bestTime_midnight: null, bestTime_pinball: null, bestTime_gauntlet: null },
  neonDodge: { highScore: 0, bestTime: 0 },
  turboSnake: { highScore: 0, classicHigh: 0, turboHigh: 0 },
  brickBlast: { highScore: 0, highestLevel: 1 },
  asteroidDash: { highScore: 0, highestWave: 1 },
  dreamBoutique: { highScore: 0, wins: 0, bestOutfit: 0 },
  sweetheartCafe: { highScore: 0, bestShift: 0, coins: 0 },
  glamStudio: { highScore: 0, challengesWon: 0 },
  driftCircuit: { bestTime_neon: null, bestTime_sunset: null, bestTime_midnight: null, bestLap: null, driftBest: 0 },
  dungeonPocket: { highScore: 0, highestRoom: 0 },
  pocketBlockBlast: { highScore: 0, highScoreTime: 0, highScoreDaily: 0, highCombo: 0, totalLines: 0, totalBlocks: 0, dailiesDone: 0 },
  pocketTag: { highScore: 0, longestEscape: 0 },
});

const defaultProfile = () => ({
  xp: 0,
  joined: 0,
  achievements: {},          // id -> unlock timestamp (ms)
  stats: { sessions: 0, gamesPlayed: 0, totalScore: 0, perGame: {} },
  recent: [],                // [{ id, ts, text }]
  cosmetics: { title: 'rookie', border: 'plain', theme: 'neon', avatar: 'initials' },
  xpLog: [],                 // timestamps of XP-earning runs (rate limiting)
  nudge: { dismissedAt: 0, lastShown: 0 },
});

const defaults = () => ({
  settings: { muted: false, reducedMotion: null, touchPad: false, quickLaunch: false, showOnline: true },
  games: defaultGames(),
  profile: defaultProfile(),
  blobs: {},                 // small per-game JSON documents (unlocks, saved looks, café decor ...)
  meta: { updatedAt: 0 },
});

let state = null;
let activeKey = GUEST_KEY;
let memoryOnly = {};
const listeners = new Set();
const writeHooks = new Set();

const isNum = (v) => typeof v === 'number' && isFinite(v);
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const SAFE_KEY = /^[A-Za-z0-9_.:-]{1,60}$/;

/** Deep copy of plain JSON only (no functions, no prototype tricks), bounded in depth/size. */
export function cleanJson(v, depth = 0) {
  if (depth > 6) return null;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return typeof v === 'string' ? v.slice(0, 2000) : v;
  if (isNum(v)) return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => cleanJson(x, depth + 1));
  if (isPlain(v)) {
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (!SAFE_KEY.test(k) || k === '__proto__') continue;
      if (++n > 200) break;
      o[k] = cleanJson(v[k], depth + 1);
    }
    return o;
  }
  return null;
}

/** Copy `raw` onto `base`, keeping only values whose type matches the default. */
function mergeTyped(base, raw) {
  if (!isPlain(raw)) return base;
  for (const k of Object.keys(raw)) {
    if (!SAFE_KEY.test(k)) continue;
    const v = raw[k];
    if (!(k in base)) {
      if (isNum(v) || typeof v === 'boolean' || typeof v === 'string' || v === null) base[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      continue;
    }
    const d = base[k];
    if (typeof d === 'number') {
      if (isNum(v) && v >= 0) base[k] = v;
    } else if (typeof d === 'boolean') {
      if (typeof v === 'boolean') base[k] = v;
    } else if (typeof d === 'string') {
      if (typeof v === 'string') base[k] = v.slice(0, 200);
    } else if (d === null) {
      if (v === null || (isNum(v) && v > 0) || typeof v === 'boolean') base[k] = v;
    } else if (isPlain(d)) {
      mergeTyped(d, v);
    }
  }
  return base;
}

function sanitizeProfile(raw) {
  const p = defaultProfile();
  if (!isPlain(raw)) return p;
  if (isNum(raw.xp) && raw.xp >= 0) p.xp = Math.floor(raw.xp);
  if (isNum(raw.joined) && raw.joined > 0) p.joined = raw.joined;
  if (isPlain(raw.achievements)) {
    let n = 0;
    for (const id of Object.keys(raw.achievements)) {
      if (!SAFE_KEY.test(id) || n > 300) continue;
      if (isNum(raw.achievements[id]) && raw.achievements[id] > 0) { p.achievements[id] = raw.achievements[id]; n++; }
    }
  }
  if (isPlain(raw.stats)) {
    for (const k of ['sessions', 'gamesPlayed', 'totalScore']) if (isNum(raw.stats[k]) && raw.stats[k] >= 0) p.stats[k] = raw.stats[k];
    if (isPlain(raw.stats.perGame)) {
      for (const gid of Object.keys(raw.stats.perGame)) {
        const g = raw.stats.perGame[gid];
        if (!SAFE_KEY.test(gid) || !isPlain(g)) continue;
        const o = { plays: 0, totalScore: 0, xp: 0, counters: {} };
        for (const k of ['plays', 'totalScore', 'xp']) if (isNum(g[k]) && g[k] >= 0) o[k] = g[k];
        if (isPlain(g.counters)) for (const c of Object.keys(g.counters)) if (SAFE_KEY.test(c) && isNum(g.counters[c]) && g.counters[c] >= 0) o.counters[c] = g.counters[c];
        p.stats.perGame[gid] = o;
      }
    }
  }
  if (Array.isArray(raw.recent)) {
    p.recent = raw.recent.filter((r) => isPlain(r) && typeof r.id === 'string' && isNum(r.ts)).slice(0, 12)
      .map((r) => ({ id: r.id.slice(0, 40), ts: r.ts, text: String(r.text || '').slice(0, 60) }));
  }
  if (isPlain(raw.cosmetics)) mergeTyped(p.cosmetics, raw.cosmetics);
  if (Array.isArray(raw.xpLog)) p.xpLog = raw.xpLog.filter(isNum).slice(-60);
  if (isPlain(raw.nudge)) mergeTyped(p.nudge, raw.nudge);
  return p;
}

function sanitizeBlobs(raw) {
  const out = {};
  if (!isPlain(raw)) return out;
  for (const k of Object.keys(raw)) {
    if (!SAFE_KEY.test(k)) continue;
    const v = cleanJson(raw[k]);
    try { if (JSON.stringify(v).length <= 40000) out[k] = v; } catch (e) { /* skip */ }
  }
  return out;
}

export function sanitize(raw) {
  const s = defaults();
  if (!isPlain(raw)) return s;
  mergeTyped(s.settings, raw.settings);
  if (isPlain(raw.games)) {
    for (const id of Object.keys(raw.games)) {
      if (!SAFE_KEY.test(id) || !isPlain(raw.games[id])) continue;
      if (!s.games[id]) s.games[id] = {};
      mergeTyped(s.games[id], raw.games[id]);
    }
  }
  s.profile = sanitizeProfile(raw.profile);
  s.blobs = sanitizeBlobs(raw.blobs);
  if (isPlain(raw.meta) && isNum(raw.meta.updatedAt)) s.meta.updatedAt = raw.meta.updatedAt;
  return s;
}

function readKey(key) {
  try {
    const txt = window.localStorage.getItem(key);
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    return memoryOnly[key] || null;
  }
}

function writeKey(key, obj) {
  try {
    window.localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    memoryOnly[key] = JSON.parse(JSON.stringify(obj));
  }
}

function notify(changed = true) {
  listeners.forEach((fn) => { try { fn(state); } catch (e) { /* ignore */ } });
  if (changed) writeHooks.forEach((fn) => { try { fn(state); } catch (e) { /* ignore */ } });
}

function write(markUpdated = true) {
  if (markUpdated) state.meta.updatedAt = Date.now();
  writeKey(activeKey, state);
  notify(markUpdated);
}

/** Pick the namespace for the persisted session (guest or signed-in account) and load it. */
export function load() {
  const u = peekUser();
  activeKey = u ? USER_KEY_PREFIX + u.id : GUEST_KEY;
  state = sanitize(readKey(activeKey));
  if (!state.profile.joined) state.profile.joined = Date.now();
  return state;
}

function ensure() { return state || load(); }

/** Switch namespace explicitly (after sign-in / sign-out on the homepage). */
export function useNamespace(userId) {
  activeKey = userId ? USER_KEY_PREFIX + userId : GUEST_KEY;
  state = sanitize(readKey(activeKey));
  if (!state.profile.joined) state.profile.joined = Date.now();
  notify(false);
  return state;
}
export const currentNamespace = () => (activeKey === GUEST_KEY ? null : activeKey.slice(USER_KEY_PREFIX.length));

/** Remove every cached account namespace (called on sign-out so data never lingers). */
export function purgeAccountCaches(exceptUserId = null) {
  try {
    const rm = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(USER_KEY_PREFIX) && k !== USER_KEY_PREFIX + exceptUserId) rm.push(k);
    }
    rm.forEach((k) => window.localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
  for (const k of Object.keys(memoryOnly)) if (k.startsWith(USER_KEY_PREFIX) && k !== USER_KEY_PREFIX + exceptUserId) delete memoryOnly[k];
}

export const readGuestSave = () => sanitize(readKey(GUEST_KEY));
export function hasProgress(s) {
  const p = s.profile;
  return p.stats.gamesPlayed > 0 || p.xp > 0 || Object.keys(p.achievements).length > 0 ||
    Object.values(s.games).some((g) => Object.keys(g).some((k) => /^(highScore|highest|bestTime|bestLap|classicHigh|turboHigh|driftBest|wins|coins|bestShift|bestOutfit|challengesWon)/.test(k) && isNum(g[k]) && g[k] > (k === 'highestLevel' || k === 'highestWave' ? 1 : 0)));
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** Called after every *local* change (used by cloud-save to schedule a sync). */
export const onWrite = (fn) => { writeHooks.add(fn); return () => writeHooks.delete(fn); };
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

export const getProfile = () => ensure().profile;
/** Mutate the profile through a callback, then persist. */
export function updateProfile(fn) { fn(ensure().profile); write(); }

export function getBlob(key, fallback = null) {
  const b = ensure().blobs[key];
  return b === undefined ? fallback : JSON.parse(JSON.stringify(b));
}
export function setBlob(key, value) {
  if (!SAFE_KEY.test(key)) return;
  ensure().blobs[key] = cleanJson(value);
  write();
}

/** Replace the whole save (used by cloud sync). Does not bump updatedAt unless asked. */
export function replaceAll(obj, bump = false) {
  state = sanitize(obj);
  if (!state.profile.joined) state.profile.joined = Date.now();
  write(bump);
}

/** JSON-safe snapshot for cloud upload (no meta). */
export function snapshot() {
  const s = ensure();
  return JSON.parse(JSON.stringify({ settings: s.settings, games: s.games, profile: s.profile, blobs: s.blobs }));
}

/**
 * Merge two saves. mode 'sync' (same account, several devices): numeric progress = max.
 * mode 'migrate' (guest -> account, disjoint histories): counters and XP add up.
 * `a` wins ties for settings/cosmetics. Always returns a sanitized object.
 */
export function mergeSaves(a, b, mode = 'sync') {
  a = sanitize(a); b = sanitize(b);
  const out = sanitize(a);
  const combine = mode === 'migrate' ? (x, y) => x + y : Math.max;
  for (const gid of Object.keys(b.games)) {
    const og = out.games[gid] || (out.games[gid] = {});
    for (const [k, v] of Object.entries(b.games[gid])) {
      const cur = og[k];
      if (isNum(v) && /^bestTime|^bestLap$/.test(k)) og[k] = isNum(cur) && cur > 0 ? (v > 0 ? Math.min(cur, v) : cur) : v;
      else if (isNum(v) && /^(coins|wins|challengesWon)$/.test(k)) og[k] = isNum(cur) ? combine(cur, v) : v;
      else if (isNum(v)) og[k] = isNum(cur) ? Math.max(cur, v) : v;
      else if (cur === undefined) og[k] = v;
    }
  }
  const pa = out.profile, pb = b.profile;
  pa.xp = combine(pa.xp, pb.xp);
  pa.joined = Math.min(pa.joined || Infinity, pb.joined || Infinity);
  if (!isFinite(pa.joined)) pa.joined = Date.now();
  for (const [id, ts] of Object.entries(pb.achievements)) pa.achievements[id] = pa.achievements[id] ? Math.min(pa.achievements[id], ts) : ts;
  for (const k of ['sessions', 'gamesPlayed', 'totalScore']) pa.stats[k] = combine(pa.stats[k], pb.stats[k]);
  for (const [gid, g] of Object.entries(pb.stats.perGame)) {
    const o = pa.stats.perGame[gid] || (pa.stats.perGame[gid] = { plays: 0, totalScore: 0, xp: 0, counters: {} });
    for (const k of ['plays', 'totalScore', 'xp']) o[k] = combine(o[k], g[k]);
    for (const [c, v] of Object.entries(g.counters)) o.counters[c] = combine(o.counters[c] || 0, v);
  }
  const seen = new Set();
  pa.recent = [...pa.recent, ...pb.recent].sort((x, y) => y.ts - x.ts).filter((r) => { const k = r.id + r.ts; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  pa.xpLog = [...new Set([...pa.xpLog, ...pb.xpLog])].sort((x, y) => x - y).slice(-60);
  for (const [k, v] of Object.entries(b.blobs)) {
    if (out.blobs[k] === undefined) out.blobs[k] = v;
    else out.blobs[k] = mergeBlob(k, out.blobs[k], v);
  }
  out.meta.updatedAt = Math.max(a.meta.updatedAt, b.meta.updatedAt);
  return out;
}

/** Blob merge: arrays of strings union, plain objects shallow-union (numbers max), else keep local. */
function mergeBlob(key, x, y) {
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.every((v) => typeof v === 'string') && y.every((v) => typeof v === 'string')) return [...new Set([...x, ...y])].slice(0, 200);
    return x.length >= y.length ? x : y;
  }
  if (isPlain(x) && isPlain(y)) {
    const o = { ...y, ...x };
    for (const k of Object.keys(y)) if (isNum(x[k]) && isNum(y[k])) o[k] = Math.max(x[k], y[k]); else if (Array.isArray(x[k]) && Array.isArray(y[k])) o[k] = mergeBlob(k, x[k], y[k]);
    return o;
  }
  return x;
}

export function resetAll() {
  const keep = ensure().settings;
  const p = ensure().profile;
  state = defaults();
  state.settings = { ...state.settings, muted: keep.muted, reducedMotion: keep.reducedMotion, quickLaunch: keep.quickLaunch };
  state.profile.joined = p.joined || Date.now();
  state.profile.cosmetics.theme = 'neon';
  write();
}
