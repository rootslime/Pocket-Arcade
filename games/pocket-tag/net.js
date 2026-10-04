// Pocket Tag online sync (runs on top of js/rooms.js).
//
//   * Every player simulates their own movement (instant response, i.e. client-side prediction) and sends it
//     ~10x per second (8x with many players). Other players are rendered 130 ms in the past, interpolated.
//   * The host runs the rules and the bots: it validates positions (impossible jumps are corrected), resolves
//     tags (with lag compensation against recent positions), and broadcasts compact rule snapshots (4x/s),
//     bot positions (10x/s) and one-off events (tags, power-ups ...).
//   * If the host leaves, the next player in the room takes over from the last snapshot they received.
import { Track, Ticker, num, int } from '../../js/multiplayer.js';

const EVENTS = new Set(['tag', 'thaw', 'pickup', 'shield', 'go', 'end', 'left', 'it', 'crown', 'fall', 'respawn']);
const POS_HZ = 10, BOT_HZ = 10, RULES_HZ = 4;

export class NetSession {
  constructor({ room, world, myIdx, keyToIdx, onEvent, onEnd }) {
    this.room = room; this.world = world; this.myIdx = myIdx;
    this.keyToIdx = keyToIdx; this.idxToKey = [];
    keyToIdx.forEach((i, k) => { this.idxToKey[i] = k; });
    this.onEvent = onEvent; this.onEnd = onEnd;
    this.isHost = room.isHost;
    this.tracks = new Map();
    this.seq = 0; this.lastSeq = new Map(); this.rulesSeq = 0;
    const humans = [...keyToIdx.values()].length;
    const hz = humans >= 6 ? 8 : POS_HZ;
    this.posT = new Ticker(hz); this.botT = new Ticker(hz); this.rulesT = new Ticker(RULES_HZ);
    this.awayAt = new Map();
    this.forceRules = false;
    this.claimAt = new Map();
    this.lastRulesAt = performance.now();
    this.stats = { sent: 0, recv: 0 };
    this.offs = [];
    const on = (ev, fn, opts) => this.offs.push(room.onMsg(ev, fn, opts));
    on('p', (d, from) => this.onPos(d, from));
    on('claim', (d, from) => this.onClaim(d, from));
    on('bots', (d) => this.onBots(d), { hostOnly: true });
    on('rules', (d) => this.onRules(d), { hostOnly: true });
    on('ev', (d) => this.onEv(d), { hostOnly: true });
    on('corr', (d) => this.onCorr(d), { hostOnly: true });
    on('end', (d) => this.onEndMsg(d), { hostOnly: true });
    this.offs.push(room.on('left', (l) => { if (this.isHost && l.graceful) { const i = this.keyToIdx.get(l.key); if (i !== undefined) this.world.removePlayer(i); } }));
  }

  trackOf(i) { let t = this.tracks.get(i); if (!t) { t = new Track(130); this.tracks.set(i, t); } return t; }

  // ------------------------------------------------------------------ receive
  onPos(d, from) {
    const i = this.keyToIdx.get(from.key);
    if (i === undefined || i === this.myIdx || !Array.isArray(d) || d.length < 7) return;
    const seq = int(d[0], 0, 1e9, -1);
    const last = this.lastSeq.get(i) ?? -1;
    if (seq <= last && last - seq < 1000) return;                 // old / duplicate packet
    this.lastSeq.set(i, seq);
    const s = { x: num(d[1], -50, 5000), y: num(d[2], -50, 5000), z: num(d[3], 0, 300), vx: num(d[4], -1000, 1000), vy: num(d[5], -1000, 1000), fl: int(d[6], 0, 255), stam: num(d[7], 0, 100, 100) };
    this.trackOf(i).push(s);
    this.stats.recv++;
    const w = this.world;
    if (this.isHost) {
      const ok = w.setRemote(i, s);
      if (!ok) { const p = w.players[i]; if (p && p.corr) { this.room.send('corr', { i, x: Math.round(p.corr.x), y: Math.round(p.corr.y) }); p.corr = null; } }
    } else w.setRemote(i, s);
  }

  onBots(d) {
    if (!d || !Array.isArray(d.b)) return;
    const w = this.world;
    for (const a of d.b.slice(0, 16)) {
      if (!Array.isArray(a)) continue;
      const i = int(a[0], 0, 15, -1), p = w.players[i];
      if (!p || p.ctrl === 'local') continue;
      const s = { x: num(a[1], -50, 5000), y: num(a[2], -50, 5000), z: num(a[3], 0, 300), vx: num(a[4], -1000, 1000), vy: num(a[5], -1000, 1000), fl: int(a[6], 0, 255) };
      this.trackOf(i).push(s);
      w.setRemote(i, s);
    }
  }

  onRules(d) {
    if (!d || typeof d !== 'object') return;
    const n = int(d.n, 0, 1e9, 0);
    if (n < this.rulesSeq && this.rulesSeq - n < 1000) return;
    this.rulesSeq = n;
    this.lastRulesAt = performance.now();
    const r = d.r;
    if (!r || !Array.isArray(r.s) || r.s.length !== this.world.players.length) return;
    const wasOver = this.world.over;
    this.world.importRules(r);
    if (!wasOver && this.world.over) this.onEnd(this.world.results());
  }

  onEv(d) {
    if (!Array.isArray(d)) return;
    for (const e of d.slice(0, 20)) {
      if (!e || !EVENTS.has(e.k)) continue;
      this.onEvent({ k: e.k, a: int(e.a, -1, 15, -1), b: int(e.b, -1, 15, -1), i: int(e.i, -1, 15, -1), kind: typeof e.kind === 'string' ? e.kind.slice(0, 8) : undefined, mode: typeof e.mode === 'string' ? e.mode.slice(0, 10) : undefined, why: typeof e.why === 'string' ? e.why.slice(0, 10) : undefined });
    }
  }

  onClaim(d, from) {
    if (!this.isHost || !d) return;
    const a = this.keyToIdx.get(from.key);
    const bi = int(d.b, 0, 15, -1);
    if (a === undefined || int(d.a, 0, 15, -2) !== a || bi < 0) return;
    this.world.claimTag(a, bi);
  }

  onCorr(d) {
    if (!d || int(d.i, 0, 15, -1) !== this.myIdx) return;
    const p = this.world.players[this.myIdx];
    if (!p) return;
    p.x = num(d.x, 0, 5000); p.y = num(d.y, 0, 5000); p.vx = p.vy = 0;
  }

  onEndMsg(d) {
    if (!d || !Array.isArray(d.list) || d.list.length > 16) return;
    const w = this.world;
    if (w.over) return;
    w.over = true; w.phase = 'over';
    w.resultCache = {
      list: d.list.map((r, i) => ({ idx: int(r.idx, 0, 15, i), id: String(r.id || '').slice(0, 40), name: String(r.name || '').slice(0, 20), color: String(r.color || '#fff').slice(0, 9), human: !!r.human, left: !!r.left, score: int(r.score, 0, 1e7, 0), tags: int(r.tags, 0, 9999, 0), tagged: int(r.tagged, 0, 9999, 0), escape: num(r.escape, 0, 9999, 0), dist: int(r.dist, 0, 1e8, 0), thaws: int(r.thaws, 0, 999, 0), pickups: int(r.pickups, 0, 999, 0), held: int(r.held, 0, 9999, 0), rank: int(r.rank, 1, 16, i + 1), win: !!r.win })),
      winners: Array.isArray(d.winners) ? d.winners.map((x) => int(x, 0, 15, 0)).slice(0, 16) : [], mode: w.mode, why: String(d.why || 'time').slice(0, 10), winnersTeam: d.winnersTeam || null, lastSurvivor: int(d.lastSurvivor, -1, 15, -1),
    };
    this.onEnd(w.resultCache);
  }

  // ------------------------------------------------------------------ send
  /** Called every frame. */
  update(dt, evs = []) {
    const w = this.world;
    if (this.posT.tick(dt)) this.sendPos();
    if (!this.isHost) return;
    // forward the one-off events everybody needs to see (tags, power-ups ...)
    if (evs.length) {
      const out = evs.filter((e) => EVENTS.has(e.k));
      if (out.length) { this.room.send('ev', out.slice(0, 20)); this.forceRules = true; }
    }
    if (this.botT.tick(dt)) this.sendBots();
    if (this.forceRules || this.rulesT.tick(dt)) { this.forceRules = false; this.sendRules(); }
    this.checkPresence();
    if (w.over && !this.endSent) { this.endSent = true; const r = w.results(); this.room.send('end', r); setTimeout(() => { if (this.room && !this.room.closed) { this.sendRules(); this.room.send('end', r); } }, 700); }
  }

  sendPos() {
    const p = this.world.players[this.myIdx];
    if (!p || p.left || this.world.over) return;
    this.room.send('p', [this.seq++, Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(p.vx), Math.round(p.vy), p.flags, Math.round(p.stam)]);
    this.stats.sent++;
  }
  sendBots() {
    const list = [];
    for (const p of this.world.players) if (p.ctrl === 'bot' && !p.left) list.push([p.idx, Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(p.vx), Math.round(p.vy), p.flags]);
    if (list.length) this.room.send('bots', { n: this.seq, b: list });
  }
  sendRules() { this.room.send('rules', { n: ++this.rulesSeq, r: this.world.exportRules() }); }

  claim(a, b) {
    const key = a * 16 + b, now = performance.now();
    if (now - (this.claimAt.get(key) || 0) < 280) return;
    this.claimAt.set(key, now);
    this.room.send('claim', { a, b });
  }

  /** Host: notice players whose connection dropped, let a bot cover for them, and take them back when they return. */
  checkPresence() {
    const w = this.world, now = performance.now();
    if (now - (this._pc || 0) < 500) return;
    this._pc = now;
    for (const [key, i] of this.keyToIdx) {
      if (i === this.myIdx) continue;
      const p = w.players[i];
      if (!p || p.left) continue;
      const here = this.room.members.has(key);
      if (!here) {
        if (!this.awayAt.has(i)) this.awayAt.set(i, now);
        if (now - this.awayAt.get(i) > 2000 && !p.away) { p.away = true; p.awayT = 0; p.ctrl = 'bot'; p.diff = 'normal'; p.bot = { diff: 'normal' }; this.forceRules = true; }
      } else if (this.awayAt.has(i)) {
        this.awayAt.delete(i);
        if (p.away) { p.away = false; p.awayT = 0; p.ctrl = 'remote'; p.bot = null; this.forceRules = true; }
      }
    }
  }

  becomeHost() {
    this.isHost = true;
    this.world.promote();
    // humans keep their positions from the tracks; bots continue from the last known positions
    this.forceRules = true;
    this.endSent = this.world.over;
  }

  /** Smoothed render position for a remote entity (null → use the simulated position). */
  render(p) {
    if (p.idx === this.myIdx) return null;
    const t = this.tracks.get(p.idx);
    if (!t) return null;
    if (this.isHost && p.ctrl === 'bot' && !p.away) return null;       // host simulates bots itself
    return t.at();
  }

  dispose() { this.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); this.offs = []; }
}
