// Multiplayer foundation shared by every Pocket Arcade game: public identity, display-name hygiene,
// a resilient Supabase Realtime link (connect / lose / reconnect), message validation and a snapshot
// interpolation buffer. Game rules never live here; see js/rooms.js for rooms and games/*/ for gameplay.
//
// Online play needs a realtime service. Pocket Arcade uses Supabase Realtime (Broadcast + Presence),
// which works from a static site and has a free tier. Without configuration every online option is hidden
// and the games keep working locally and against bots.
import { isConfigured, peekUser } from './session.js';
import * as store from './storage.js';

export const onlineAvailable = () => isConfigured();

// ------------------------------------------------------------------ public identity
const NAME_KEY = 'pocketArcade.displayName';
const GUEST_KEY = 'pocketArcade.guestName';
const PID_KEY = 'pocketArcade.pid';
const ADJ = ['Pocket', 'Neon', 'Arcade', 'Turbo', 'Pixel', 'Cosmic', 'Retro', 'Glitch', 'Jelly', 'Zippy', 'Sunny', 'Comet'];
const NOUN = ['Fox', 'Runner', 'Cat', 'Panda', 'Comet', 'Ghost', 'Falcon', 'Otter', 'Bunny', 'Rocket', 'Ninja', 'Koala'];
export const NAME_MAX = 16;

const ls = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

/** Clean a user-supplied display name: no control / invisible / bidi characters, no markup, bounded length. */
export function sanitizeName(raw) {
  let s = String(raw ?? '');
  try { s = s.normalize('NFKC'); } catch (e) { /* ignore */ }
  s = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ').trim();
  // cap by code points so emoji aren't cut in half
  s = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return s;
}

const pickRand = (a) => a[Math.floor(Math.random() * a.length)];
/** A friendly temporary name for guests, e.g. NeonRunner18. Stable per browser. */
export function guestName() {
  let n = sanitizeName(ls.get(GUEST_KEY));
  if (!n) { n = `${pickRand(ADJ)}${pickRand(NOUN)}${10 + Math.floor(Math.random() * 90)}`; ls.set(GUEST_KEY, n); }
  return n;
}

export function getDisplayName() {
  if (typeof window !== 'undefined' && window.__PA_NAME) return sanitizeName(window.__PA_NAME) || guestName(); // test hook
  const custom = sanitizeName(ls.get(NAME_KEY));
  if (custom) return custom;
  const u = peekUser();
  const acct = u && sanitizeName(u.name);
  return acct || guestName();
}
export function setDisplayName(name) {
  const n = sanitizeName(name);
  if (n) ls.set(NAME_KEY, n); else { try { window.localStorage.removeItem(NAME_KEY); } catch (e) { /* ignore */ } }
  return getDisplayName();
}

/** Public player id: random, device-scoped, unrelated to the account id (which is never shared). */
export function publicId() {
  if (typeof window !== 'undefined' && /^[a-z0-9]{8,12}$/.test(window.__PA_PID || '')) return window.__PA_PID; // test hook: lets two tabs act as two players
  let id = ls.get(PID_KEY);
  if (!id || !/^[a-z0-9]{8,12}$/.test(id)) {
    const a = new Uint8Array(8);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256); }
    id = Array.from(a, (b) => (b % 36).toString(36)).join('');
    ls.set(PID_KEY, id);
  }
  return id;
}

const AVATAR_OK = /^(initials|sprite-[1-6])$/;
const BORDER_OK = /^(plain|cyan|pink|gold|rainbow|holo)$/;

/** What other players are allowed to see about you. Never email, tokens or the account id. */
export function identity() {
  let level = 1, avatar = 'initials', border = 'plain';
  try {
    const p = store.getProfile();
    level = Math.max(1, Math.min(99, Number(p.cosmetics && p.xp !== undefined ? levelFromXp(p.xp) : 1)));
    if (AVATAR_OK.test(p.cosmetics.avatar)) avatar = p.cosmetics.avatar;
    if (BORDER_OK.test(p.cosmetics.border)) border = p.cosmetics.border;
  } catch (e) { /* defaults */ }
  return { pid: publicId(), name: getDisplayName(), lv: level, av: avatar, bd: border, signedIn: !!peekUser() };
}
function levelFromXp(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (left >= 100 + (level - 1) * 50 && level < 99) { left -= 100 + (level - 1) * 50; level++; }
  return level;
}

/** Validate presence / profile data received from other players. */
export function cleanPublicMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const pid = typeof m.pid === 'string' && /^[a-z0-9]{8,12}$/.test(m.pid) ? m.pid : null;
  if (!pid) return null;
  const name = sanitizeName(m.name) || 'Player';
  const lv = Number.isFinite(m.lv) ? Math.max(1, Math.min(99, Math.floor(m.lv))) : 1;
  return { pid, name, lv, av: AVATAR_OK.test(m.av) ? m.av : 'initials', bd: BORDER_OK.test(m.bd) ? m.bd : 'plain' };
}

// ------------------------------------------------------------------ small utilities
export const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
export const int = (v, lo, hi, d = 0) => Math.floor(num(v, lo, hi, d));

export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) { if (!this._h.has(ev)) this._h.set(ev, new Set()); this._h.get(ev).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const s = this._h.get(ev); if (s) s.delete(fn); }
  emit(ev, ...a) { const s = this._h.get(ev); if (s) for (const fn of [...s]) { try { fn(...a); } catch (e) { console.error(e); } } }
}

// ------------------------------------------------------------------ realtime link
export const LINK = { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', LOST: 'lost', RECONNECTING: 'reconnecting', CLOSED: 'closed' };

let clientPromise = null;
/** The shared Supabase client (the same one the account system uses, so there is one socket). */
export async function realtimeClient() {
  if (!onlineAvailable()) { const e = new Error('Online play is not set up on this site.'); e.code = 'not_configured'; throw e; }
  if (!clientPromise) clientPromise = import('./auth.js').then((m) => m.getClient());
  return clientPromise;
}

/**
 * One realtime channel with state tracking and automatic reconnection.
 *   link.on(event, fn)        broadcast listener
 *   link.send(event, payload) broadcast (dropped, returns false, while not connected)
 *   link.track(meta)          presence (re-announced automatically after a reconnect)
 *   link.onState(fn)          'connecting' | 'connected' | 'lost' | 'reconnecting' | 'closed'
 */
export class Link extends Emitter {
  constructor(topic, { key = publicId(), ack = false } = {}) {
    super();
    this.topic = topic; this.key = key; this.ack = ack;
    this.state = LINK.IDLE;
    this.ch = null; this.client = null;
    this.handlers = []; this.meta = null; this.wantClosed = false;
    this.attempt = 0; this.retryTimer = 0; this.everConnected = false;
    this._online = () => { if (this.state === LINK.LOST || this.state === LINK.RECONNECTING) this._retryNow(); };
    if (typeof window !== 'undefined') window.addEventListener('online', this._online);
  }

  setState(s, info) {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', s, info);
  }

  async open(timeoutMs = 9000) {
    this.setState(LINK.CONNECTING);
    this.client = await realtimeClient();
    await this._subscribe(timeoutMs);
    this.everConnected = true;
    this.attempt = 0;
    this.setState(LINK.CONNECTED);
    return this;
  }

  _build() {
    const ch = this.client.channel(this.topic, { config: { broadcast: { self: false, ack: this.ack }, presence: { key: this.key } } });
    for (const h of this.handlers) ch.on('broadcast', { event: h.event }, (msg) => { try { h.fn(msg && msg.payload !== undefined ? msg.payload : msg); } catch (e) { console.error(e); } });
    const pres = () => this.emit('presence', this.presence());
    ch.on('presence', { event: 'sync' }, pres);
    ch.on('presence', { event: 'join' }, (p) => { this.emit('join', p); });
    ch.on('presence', { event: 'leave' }, (p) => { this.emit('leave', p); });
    return ch;
  }

  _subscribe(timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const ch = this._build();
      this.ch = ch;
      const timer = setTimeout(() => { if (!done) { done = true; reject(Object.assign(new Error('Timed out connecting'), { code: 'timeout' })); } }, timeoutMs);
      ch.subscribe((status, err) => {
        if (this.ch !== ch) return;
        if (status === 'SUBSCRIBED') {
          if (!done) { done = true; clearTimeout(timer); resolve(); }
          else if (this.state !== LINK.CONNECTED) { /* resubscribed by the client library itself */ this._recovered(); }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!done) { done = true; clearTimeout(timer); reject(Object.assign(new Error(err && err.message ? err.message : 'Connection failed'), { code: 'connect' })); }
          else if (!this.wantClosed) this._lost();
        }
      });
    });
  }

  _recovered() {
    this.attempt = 0;
    this.setState(LINK.CONNECTED);
    if (this.meta) { try { this.ch.track(this.meta); } catch (e) { /* ignore */ } }
    this.emit('reconnected');
  }

  _lost() {
    if (this.wantClosed || this.state === LINK.CLOSED) return;
    if (this.state === LINK.CONNECTED || this.state === LINK.CONNECTING) this.setState(LINK.LOST);
    this._scheduleRetry();
  }

  _scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (this.wantClosed) return;
    if (this.attempt >= 7) { this.setState(LINK.CLOSED, { reason: 'connection' }); this.emit('closed', { reason: 'connection' }); return; }
    const wait = Math.min(8000, 800 * 2 ** this.attempt);
    this.retryTimer = setTimeout(() => this._retryNow(), wait);
  }

  async _retryNow() {
    clearTimeout(this.retryTimer);
    if (this.wantClosed || this.state === LINK.CLOSED) return;
    this.attempt++;
    this.setState(LINK.RECONNECTING);
    try { if (this.ch) { const old = this.ch; this.ch = null; await this.client.removeChannel(old).catch(() => {}); } } catch (e) { /* ignore */ }
    try {
      await this._subscribe(7000);
      this._recovered();
    } catch (e) {
      this.setState(LINK.LOST);
      this._scheduleRetry();
    }
  }

  on(event, fn) {
    if (event === 'state' || event === 'presence' || event === 'join' || event === 'leave' || event === 'reconnected' || event === 'closed') return super.on(event, fn);
    // broadcast event
    this.handlers.push({ event, fn });
    if (this.ch) this.ch.on('broadcast', { event }, (msg) => { try { fn(msg && msg.payload !== undefined ? msg.payload : msg); } catch (e) { console.error(e); } });
    return () => { this.handlers = this.handlers.filter((h) => h.fn !== fn); };
  }
  onState(fn) { fn(this.state); return super.on('state', fn); }
  onPresence(fn) { return super.on('presence', fn); }

  send(event, payload) {
    if (this.state !== LINK.CONNECTED || !this.ch) return false;
    try { this.ch.send({ type: 'broadcast', event, payload }); return true; } catch (e) { return false; }
  }

  async track(meta) {
    this.meta = meta;
    if (this.state !== LINK.CONNECTED || !this.ch) return false;
    try { await this.ch.track(meta); return true; } catch (e) { return false; }
  }
  async untrack() { this.meta = null; try { if (this.ch) await this.ch.untrack(); } catch (e) { /* ignore */ } }

  /** Flat list of everyone currently present: [{ key, meta }] */
  presence() {
    try {
      const st = this.ch ? this.ch.presenceState() : {};
      return Object.keys(st).map((k) => ({ key: k, meta: (st[k] && st[k][st[k].length - 1]) || {} }));
    } catch (e) { return []; }
  }

  async close() {
    this.wantClosed = true;
    clearTimeout(this.retryTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', this._online);
    const ch = this.ch; this.ch = null;
    this.setState(LINK.CLOSED, { reason: 'left' });
    try { if (ch) { try { await ch.untrack(); } catch (e) { /* ignore */ } await this.client.removeChannel(ch); } } catch (e) { /* ignore */ }
  }
}

/** Human readable connection label for the UI. */
export const stateLabel = (s) => ({ connecting: 'CONNECTING…', connected: 'CONNECTED', lost: 'CONNECTION LOST', reconnecting: 'RECONNECTING…', closed: 'DISCONNECTED', idle: 'OFFLINE' }[s] || 'OFFLINE');

// ------------------------------------------------------------------ snapshot interpolation
/**
 * Smooths a remote entity that is only sampled a few times per second. Samples are buffered with their
 * arrival time; rendering happens `delay` ms in the past so there are normally two samples to blend between.
 * If packets are late the entity is extrapolated with its velocity for a short while, then holds still.
 */
export class Track {
  constructor(delay = 130) { this.delay = delay; this.buf = []; }
  push(s, t = performance.now()) {
    const b = this.buf;
    if (b.length && t <= b[b.length - 1].t) t = b[b.length - 1].t + 1;
    b.push({ t, ...s });
    while (b.length > 10) b.shift();
  }
  get last() { return this.buf[this.buf.length - 1] || null; }
  at(now = performance.now()) {
    const b = this.buf;
    if (!b.length) return null;
    const target = now - this.delay;
    if (target <= b[0].t) return { ...b[0] };
    const last = b[b.length - 1];
    if (target >= last.t) {
      const dt = Math.min((target - last.t) / 1000, 0.18);
      return { ...last, x: last.x + (last.vx || 0) * dt, y: last.y + (last.vy || 0) * dt };
    }
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (a.t <= target && target <= c.t) {
        const k = (target - a.t) / Math.max(1, c.t - a.t);
        const L = (p, q) => p + (q - p) * k;
        return { ...c, x: L(a.x, c.x), y: L(a.y, c.y), z: L(a.z || 0, c.z || 0), vx: L(a.vx || 0, c.vx || 0), vy: L(a.vy || 0, c.vy || 0) };
      }
    }
    return { ...last };
  }
}

/** Send-rate limiter so a slow device never floods the channel. */
export class Ticker {
  constructor(hz) { this.set(hz); this.acc = 0; }
  set(hz) { this.step = 1 / Math.max(1, hz); }
  /** returns true when a send is due */
  tick(dt) { this.acc += dt; if (this.acc >= this.step) { this.acc = Math.min(this.acc - this.step, this.step); return true; } return false; }
}
