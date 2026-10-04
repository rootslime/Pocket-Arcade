// Rooms: private codes, public matchmaking, ready states, host controls and host handover.
// Built on Supabase Realtime Presence (who is in the room) + Broadcast (messages). There is no server code:
// a room exists exactly while somebody is present in its channel.
//
// Trust model (casual play): the host's client is the referee. Messages carry the sender's presence key and
// are validated (shape, ranges, membership, host-only commands) but a determined cheater with the source code
// could still spoof them. Real competitive anti-cheat needs an authoritative server (see README → Multiplayer).
import { Emitter, Link, LINK, identity, cleanPublicMeta, publicId, int } from './multiplayer.js';
import { onlineAvailable } from './multiplayer.js';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I, L, O, 0, 1
export const CODE_LEN = 5;
export const makeCode = () => { let c = ''; for (let i = 0; i < CODE_LEN; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; return c; };
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '').slice(0, CODE_LEN);
export const isValidCode = (c) => new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`).test(c || '');

const roomTopic = (game, code) => `pa:room:${game}:${code}`;
const pubTopic = (game) => `pa:pub:${game}`;

export const ROOM_ERRORS = {
  offline: 'Online play isn’t set up on this site. You can still play with bots or on one device.',
  connect: 'Couldn’t reach the multiplayer service. Check your connection and try again.',
  bad_code: 'Room codes are 5 characters, like K7P4Q.',
  not_found: 'No room with that code. Check the code and ask the host if the room is still open.',
  full: 'That room is full.',
  in_progress: 'That match has already started. Try again when it finishes.',
  duplicate: 'You’re already in that room (another tab?).',
  timeout: 'The connection timed out. Please try again.',
};
const roomError = (code, extra) => Object.assign(new Error(ROOM_ERRORS[code] || 'Something went wrong.'), { code, ...extra });

/** Check a value against a settings schema entry. */
function validSetting(def, v) {
  if (!def) return false;
  if (def.type === 'toggle') return typeof v === 'boolean';
  if (def.type === 'number') return Number.isFinite(v) && v >= def.min && v <= def.max;
  return (def.options || []).some((o) => o.v === v);
}
export function cleanSettings(schema, raw, base) {
  const out = { ...base };
  if (raw && typeof raw === 'object') for (const def of schema) if (validSetting(def, raw[def.key])) out[def.key] = raw[def.key];
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the first presence sync has happened, then give late joiners a moment to appear. */
async function readPresence(link, { settle = 700, maxWait = 3000 } = {}) {
  const t0 = performance.now();
  let synced = link.presence().length > 0;
  const off = link.onPresence(() => { synced = true; });
  while (!synced && performance.now() - t0 < maxWait) await wait(40);
  off();
  const left = settle - (performance.now() - t0);
  if (left > 0) await wait(left);
  return link.presence();
}

export class Room extends Emitter {
  /**
   * opts: { game, mp:{minPlayers,maxPlayers}, schema, defaults, pub }
   */
  constructor(code, opts) {
    super();
    this.code = code; this.game = opts.game; this.mp = opts.mp || { minPlayers: 2, maxPlayers: 8 };
    this.schema = opts.schema || []; this.defaults = opts.defaults || {};
    this.settings = { ...this.defaults };
    this.pub = !!opts.pub;
    this.id = identity();
    this.key = `${this.id.pid}.${Math.random().toString(36).slice(2, 6)}`;
    this.members = new Map();            // key -> meta
    this.hostKey = null;
    this.phase = 'lobby';
    this.link = null; this.pubLink = null;
    this.ready = false; this.jn = 1;
    this.byeFrom = new Map();            // pid -> time of the last graceful goodbye
    this.matchId = null;
    this.closed = false;
    this.hostOnly = new Set();
  }

  get isHost() { return this.hostKey === this.key; }
  get state() { return this.link ? this.link.state : LINK.IDLE; }
  get list() {
    return [...this.members.entries()].map(([key, m]) => ({ key, ...m, host: key === this.hostKey, me: key === this.key }))
      .sort((a, b) => (b.host - a.host) || a.jn - b.jn || (a.pid < b.pid ? -1 : 1));
  }
  get count() { return this.members.size; }
  get max() { return int(this.mp.maxPlayers, 2, 16, 8); }
  member(key) { return this.members.has(key) ? { key, ...this.members.get(key), host: key === this.hostKey } : null; }

  // ------------------------------------------------------------------ factories
  static async create(opts) {
    if (!onlineAvailable()) throw roomError('offline');
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      const room = new Room(code, opts);
      try {
        await room._connect();
        const present = await readPresence(room.link, { settle: 500 });
        if (present.length) { await room.link.close(); continue; }          // code collision: pick another
        room.jn = 1;
        room.hostKey = room.key;
        room.settings = cleanSettings(room.schema, opts.settings, room.defaults);
        await room._announce();
        room._refresh();
        if (room.pub) await room._advertise();
        return room;
      } catch (e) { lastErr = e; try { if (room.link) await room.link.close(); } catch (e2) { /* ignore */ } break; }
    }
    throw lastErr && lastErr.code ? (ROOM_ERRORS[lastErr.code] ? roomError(lastErr.code) : roomError('connect')) : roomError('connect');
  }

  static async join(opts, rawCode) {
    if (!onlineAvailable()) throw roomError('offline');
    const code = normalizeCode(rawCode);
    if (!isValidCode(code)) throw roomError('bad_code');
    const room = new Room(code, opts);
    try {
      await room._connect();
    } catch (e) { throw roomError(e && e.code === 'timeout' ? 'timeout' : e && e.code === 'not_configured' ? 'offline' : 'connect'); }
    const present = await readPresence(room.link);
    const others = present.map((p) => ({ key: p.key, meta: p.meta })).filter((p) => cleanPublicMeta(p.meta));
    if (!others.length) { await room.link.close(); throw roomError('not_found'); }
    const metas = others.map((o) => o.meta);
    const host = metas.slice().sort((a, b) => (a.jn || 99) - (b.jn || 99))[0];
    if (host && host.ph === 'g') { await room.link.close(); throw roomError('in_progress'); }
    if (others.length >= room.max) { await room.link.close(); throw roomError('full'); }
    if (metas.some((m) => m.pid === room.id.pid)) { await room.link.close(); throw roomError('duplicate'); }
    room.jn = Math.max(1, ...metas.map((m) => int(m.jn, 1, 9999, 1))) + 1;
    await room._announce();
    room._refresh();
    return room;
  }

  /** Public matchmaking: join the fullest open public room, or become the host of a new one. */
  static async quick(opts) {
    if (!onlineAvailable()) throw roomError('offline');
    const link = new Link(pubTopic(opts.game), { key: `${publicId()}.q${Math.random().toString(36).slice(2, 5)}` });
    try { await link.open(); } catch (e) { throw roomError(e && e.code === 'timeout' ? 'timeout' : 'connect'); }
    const adverts = (await readPresence(link, { settle: 600 })).map((p) => p.meta)
      .filter((m) => m && typeof m.code === 'string' && isValidCode(m.code) && m.ph === 'l' && int(m.n, 0, 16, 99) < int(m.max, 2, 16, 8))
      .sort((a, b) => b.n - a.n || (Math.random() < 0.5 ? -1 : 1));
    await link.close();
    for (const ad of adverts.slice(0, 4)) {
      try { return await Room.join(opts, ad.code); } catch (e) { /* race: full / started / gone → try the next one */ }
    }
    return Room.create({ ...opts, pub: true });
  }

  // ------------------------------------------------------------------ connection plumbing
  async _connect() {
    const link = new Link(roomTopic(this.game, this.code), { key: this.key });
    this.link = link;
    link.on('msg', (env) => this._onMessage(env));
    link.onPresence(() => this._refresh());
    link.on('leave', (p) => this._onLeave(p));
    link.on('state', (s, info) => { this.emit('state', s, info); if (s === LINK.CLOSED && info && info.reason === 'connection') this._close('connection'); });
    link.on('reconnected', () => { link.track(this._meta()); this._refresh(); if (this.isHost && this.pub) this._advertise(); this.emit('reconnected'); });
    await link.open();
  }

  _meta() {
    const m = { pid: this.id.pid, name: this.id.name, lv: this.id.lv, av: this.id.av, bd: this.id.bd, rd: this.ready, jn: this.jn, ph: this.phase === 'playing' ? 'g' : 'l' };
    if (this.isHost) m.s = this.settings;
    return m;
  }
  async _announce() { await this.link.track(this._meta()); }

  async _advertise() {
    if (!this.pub || this.closed) return;
    try {
      if (!this.pubLink) { this.pubLink = new Link(pubTopic(this.game), { key: `${this.id.pid}.h${Math.random().toString(36).slice(2, 5)}` }); await this.pubLink.open(); }
      await this.pubLink.track({ code: this.code, n: this.count, max: this.max, ph: this.phase === 'playing' ? 'g' : 'l', host: this.id.name, s: this.settings });
    } catch (e) { /* matchmaking listing is best-effort */ }
  }
  async _unadvertise() { if (this.pubLink) { const l = this.pubLink; this.pubLink = null; try { await l.close(); } catch (e) { /* ignore */ } } }

  /** Rebuild members / host / settings from presence. */
  _refresh() {
    if (this.closed || !this.link) return;
    const pres = this.link.presence();
    const next = new Map();
    for (const p of pres) {
      const pub = cleanPublicMeta(p.meta);
      if (!pub) continue;
      if (next.has(p.key)) continue;
      next.set(p.key, { ...pub, rd: !!p.meta.rd, jn: int(p.meta.jn, 1, 9999, 1), ph: p.meta.ph === 'g' ? 'g' : 'l', s: p.meta.s });
    }
    const prevHost = this.hostKey;
    this.members = next;
    // host: sticky while present; otherwise the member who has been here longest takes over
    if (!this.hostKey || !next.has(this.hostKey)) {
      const cand = [...next.entries()].sort((a, b) => a[1].jn - b[1].jn || (a[1].pid < b[1].pid ? -1 : 1))[0];
      this.hostKey = cand ? cand[0] : null;
    }
    const host = this.hostKey ? next.get(this.hostKey) : null;
    if (host && host.s) {
      const s = cleanSettings(this.schema, host.s, this.defaults);
      if (JSON.stringify(s) !== JSON.stringify(this.settings)) { this.settings = s; this.emit('settings', s); }
    }
    if (host) {
      const ph = host.ph === 'g' ? 'playing' : 'lobby';
      if (ph !== this.phase && !this.isHost) { this.phase = ph; this.emit('phase', ph); }
    }
    const mine = next.get(this.key);
    if (mine) this.ready = !!mine.rd;
    if (prevHost !== this.hostKey && prevHost) {
      this.emit('hostchange', { host: this.member(this.hostKey), me: this.isHost });
      if (this.isHost) { this._announce(); if (this.pub) this._advertise(); }
    }
    this.emit('members', this.list);
    if (this.isHost && this.pub) this._advertise();
  }

  _onLeave(p) {
    const key = p && p.key;
    if (!key || key === this.key) return;
    const pid = String(key).split('.')[0];
    const graceful = performance.now() - (this.byeFrom.get(pid) || -1e9) < 4000;
    const gone = this.members.get(key) || (p.leftPresences && cleanPublicMeta(p.leftPresences[0]));
    setTimeout(() => this.emit('left', { key, pid, graceful, member: gone || null }), 0);
  }

  // ------------------------------------------------------------------ messaging
  /** Register a game message handler. Host-only events are ignored unless they come from the host. */
  onMsg(event, fn, { hostOnly = false } = {}) {
    if (hostOnly) this.hostOnly.add(event);
    return super.on('msg:' + event, fn);
  }
  _onMessage(env) {
    if (this.closed || !env || typeof env !== 'object' || typeof env.e !== 'string' || typeof env.f !== 'string') return;
    if (env.f === this.key) return;
    const m = this.members.get(env.f);
    if (!m) return;                                                  // unknown sender
    if (this.hostOnly.has(env.e) && env.f !== this.hostKey) return;  // only the host may send this
    if (env.e === 'bye') { this.byeFrom.set(m.pid, performance.now()); return; }
    this.emit('msg:' + env.e, env.d, { key: env.f, ...m, host: env.f === this.hostKey });
  }
  /** Broadcast a game message to everyone else in the room. */
  send(event, data) { return this.link ? this.link.send('msg', { f: this.key, e: event, d: data }) : false; }

  // ------------------------------------------------------------------ player actions
  async setReady(v) { this.ready = !!v; await this._announce(); this._refresh(); }

  /** Host only. Unknown or invalid values are ignored. */
  async setSettings(patch) {
    if (!this.isHost) return false;
    this.settings = cleanSettings(this.schema, { ...this.settings, ...patch }, this.defaults);
    await this._announce();
    this.emit('settings', this.settings);
    this._refresh();
    return true;
  }

  /** Host only: lock the room and tell everybody to start. `extra` carries the game's own start payload. */
  async start(extra) {
    if (!this.isHost || this.phase === 'playing') return false;
    this.phase = 'playing';
    this.matchId = Math.random().toString(36).slice(2, 10);
    const roster = this.list.map((m) => ({ key: m.key, pid: m.pid, name: m.name, lv: m.lv, av: m.av, bd: m.bd }));
    await this._announce();
    this.emit('phase', 'playing');
    if (this.pub) this._advertise();
    this.send('start', { id: this.matchId, roster, s: this.settings, x: extra || null });
    return { id: this.matchId, roster, settings: this.settings, extra };
  }

  /** Everyone calls this when a match is over to return to the lobby. */
  async backToLobby({ ready = false } = {}) {
    this.phase = 'lobby'; this.ready = ready;
    await this._announce();
    this._refresh();
    this.emit('phase', 'lobby');
    if (this.isHost && this.pub) this._advertise();
  }

  /** Called by the game when the match starts for a joiner (the host's 'start' message is handled in the lobby). */
  async enterMatch() { this.phase = 'playing'; await this._announce(); this._refresh(); }

  async leave(reason = 'left') {
    if (this.closed) return;
    try { this.send('bye', {}); } catch (e) { /* ignore */ }
    await this._close(reason);
  }

  async _close(reason) {
    if (this.closed) return;
    this.closed = true;
    await this._unadvertise();
    try { if (this.link) await this.link.close(); } catch (e) { /* ignore */ }
    this.emit('closed', { reason });
  }

  /** Link a friend can open to land on the Join Room dialog with the code filled in. */
  inviteUrl() {
    const base = location.href.split('#')[0].split('?')[0].replace(/games\/.*$/, '');
    return `${base}#/multiplayer?game=${encodeURIComponent(this.game)}&code=${this.code}`;
  }
}
