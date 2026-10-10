// Small helpers shared by the multiplayer modes of Snake, Brick Blast, Neon Dodge and Drift Circuit
// (Pocket Tag has its own, richer wiring). They give every game the same lobby, connection banner,
// "you're the host now" handling, results standings and return-to-lobby flow.
import { createLobby } from './lobby.js';
import { cleanSettings } from './rooms.js';
import { LINK, stateLabel } from './multiplayer.js';
import { esc } from './ui.js';
import { toast } from './toast.js';
import * as presence from './presence.js';
import * as store from './storage.js';
import { formatScore } from './util.js';

export const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

/** Standings list used on every results screen. rows: [{ name, text, me, bot, note }] already sorted. */
export function standingsHTML(rows, title = 'Standings') {
  return `<div class="mp-standings"><h3>${esc(title)}</h3><ol>${rows.map((r, i) => `<li class="mp-row${r.me ? ' me' : ''}"><span class="mp-medal">${medal(i)}</span><b>${esc(r.name)}${r.bot ? ' 🤖' : ''}${r.note ? ` <small>${esc(r.note)}</small>` : ''}</b><i>${esc(r.text)}</i></li>`).join('')}</ol></div>`;
}

export const rankText = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/**
 * cfg: { shell, game:{id,title,accent,mp,players}, schema, defaults, localMax, localHelp, hostExtra, onStart, settingsKey }
 * returns { lobby, conn(), notice(), wire(room, {onHostChange}), loadSettings(), saveSettings(), setStatus() }
 */
export function createMpKit(cfg) {
  const { game, shell } = cfg;
  const key = cfg.settingsKey || `mp.${game.id}`;
  let connEl = null, noticeEl = null;

  const loadSettings = () => { let raw = {}; try { raw = JSON.parse(store.getSetting(key) || '{}'); } catch (e) { /* ignore */ } return cleanSettings(cfg.schema, raw, cfg.defaults); };
  const saveSettings = (s) => { try { store.setSetting(key, JSON.stringify(s)); } catch (e) { /* ignore */ } };

  function conn(state) {
    if (!connEl) {
      connEl = document.createElement('div'); connEl.className = 'mp-conn'; connEl.hidden = true;
      connEl.setAttribute('role', 'status'); connEl.setAttribute('aria-live', 'polite');
      document.querySelector('.game-app').appendChild(connEl);
    }
    connEl.hidden = state === LINK.CONNECTED || state === undefined;
    connEl.textContent = stateLabel(state);
    connEl.className = `mp-conn ${state || ''}`;
  }

  function notice(title, text, buttons, onPick) {
    if (noticeEl) noticeEl.remove();
    noticeEl = document.createElement('div');
    noticeEl.className = 'mp-notice';
    noticeEl.innerHTML = `<div class="g-panel" role="alertdialog" aria-modal="true" aria-labelledby="mp-nt"><h2 id="mp-nt">${esc(title)}</h2><p>${esc(text)}</p><div class="p-btns">${buttons.map((b) => `<button type="button" class="g-btn${b.primary ? ' primary' : ''}" data-n="${esc(b.act)}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.querySelector('.game-app').appendChild(noticeEl);
    const first = noticeEl.querySelector('button'); if (first) first.focus();
    noticeEl.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; noticeEl.remove(); noticeEl = null; if (onPick) onPick(b.dataset.n); });
  }
  const clearNotice = () => { if (noticeEl) { noticeEl.remove(); noticeEl = null; } };

  /** Attach standard behaviour to a room: connection banner, host change, hard disconnects. */
  function wire(room, { onHostChange, onClosed } = {}) {
    const offs = [
      room.on('state', (s) => conn(s)),
      room.on('reconnected', () => toast({ icon: '🟢', title: 'Reconnected', color: '#5dff8f', ms: 1800 })),
      room.on('hostchange', (h) => {
        if (h.me) toast({ icon: '👑', title: 'You are now the host', text: 'The previous host left.', color: '#ffe14d', ms: 3500 });
        else toast({ icon: '👑', title: `${h.host ? h.host.name : 'Someone'} is now the host`, color: '#2de2e6', ms: 2500 });
        if (onHostChange) onHostChange(h);
      }),
      room.on('closed', (c) => { if (c.reason === 'connection') { notice('Connection lost', 'We couldn’t get you back online, so the match ended. Your progress so far is saved.', [{ act: 'menu', label: 'Back to menu', primary: true }], () => onClosed && onClosed(c)); } else if (onClosed) onClosed(c); }),
      room.on('left', (l) => { if (l.member) toast({ icon: '👋', title: `${l.member.name} ${l.graceful ? 'left' : 'disconnected'}`, color: '#2de2e6', ms: 2200 }); }),
    ];
    conn(room.state);
    return () => { offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); conn(undefined); };
  }

  const lobby = createLobby({
    game: { id: game.id, title: game.title, accent: game.accent, mp: game.mp, players: game.players },
    schema: cfg.schema, defaults: loadSettings(), localMax: cfg.localMax || 4, localHelp: cfg.localHelp, hostExtra: cfg.hostExtra,
    onStart: (info) => { if (info.kind !== 'online') saveSettings(info.settings); cfg.onStart(info); },
  });
  lobby.setSettings(loadSettings());

  return {
    lobby, conn, notice, clearNotice, wire, loadSettings, saveSettings, presence,
    setStatus: (s) => presence.setStatus(s),
    start() { presence.startPresence('lobby').catch(() => {}); lobby.openFromUrl(new URLSearchParams(location.search)); },
  };
}

export { formatScore };

/**
 * Everyone plays their own copy and reports progress (score races, battles, laps). A PeerBoard tracks the
 * other players from heartbeat messages, notices who vanished, and draws the little opponents panel.
 *   board.update({ done, score, aux })   call every frame with your own state; it sends ~every 0.7 s (immediately when `done` flips)
 *   board.peers                          Map(index -> { name, me, done, score, aux, seen })
 */
export class PeerBoard {
  constructor(room, roster, { event = 'pb', stage = null, fmt = (p) => String(p.score), higher = true } = {}) {
    this.room = room; this.event = event; this.stage = stage; this.fmt = fmt; this.higher = higher;
    this.keyToIdx = new Map(); this.peers = new Map(); this.myIdx = 0; this.t = 0; this.last = 0; this.lastDone = false; this.panel = null; this.panelT = 0;
    roster.forEach((m, i) => {
      this.keyToIdx.set(m.key, i);
      const me = m.key === room.key;
      if (me) this.myIdx = i;
      this.peers.set(i, { name: String(m.name), me, done: false, score: 0, aux: {}, seen: performance.now() });
    });
    this.off = room.onMsg(event, (d, from) => {
      const i = this.keyToIdx.get(from.key);
      if (i === undefined || i === this.myIdx || !d || typeof d !== 'object') return;
      const p = this.peers.get(i);
      p.seen = performance.now();
      p.done = p.done || !!d.d;                                       // once finished, always finished
      p.score = p.done ? Math.max(p.score, Number(d.s) || 0) : (Number(d.s) || 0);
      if (d.x && typeof d.x === 'object') { const x = {}; for (const k of Object.keys(d.x).slice(0, 8)) { const v = Number(d.x[k]); if (Number.isFinite(v)) x[k] = v; } p.aux = x; }
    });
  }
  get me() { return this.peers.get(this.myIdx); }
  get others() { return [...this.peers.entries()].filter(([i]) => i !== this.myIdx).map(([, p]) => p); }
  get allOthersDone() { return this.others.every((p) => p.done); }
  update(dt, mine) {
    const me = this.me;
    if (mine) { me.done = mine.done; me.score = mine.score; me.aux = mine.aux || {}; }
    this.t += dt; this.last -= dt;
    if (this.last <= 0 || me.done !== this.lastDone) { this.last = 0.7; this.lastDone = me.done; this.room.send(this.event, { d: me.done ? 1 : 0, s: me.score, x: me.aux }); }
    const now = performance.now();
    for (const [key, i] of this.keyToIdx) {                         // vanished players count as finished
      const p = this.peers.get(i);
      if (i === this.myIdx || p.done) continue;
      if (now - p.seen > 7000 && !this.room.members.has(key)) p.done = true;
    }
  }
  /** Players sorted best first: finished or not, by score (or lowest when `higher` is false). */
  ranking() { return [...this.peers.entries()].map(([i, p]) => ({ i, ...p })).sort((a, b) => (this.higher ? b.score - a.score : a.score - b.score)); }
  ui(dt) {
    if (!this.stage) return;
    this.panelT -= dt;
    if (this.panelT > 0) return;
    this.panelT = 0.3;
    if (!this.panel) { this.panel = document.createElement('div'); this.panel.className = 'mp-peers'; this.panel.setAttribute('aria-hidden', 'true'); this.stage.appendChild(this.panel); }
    this.panel.innerHTML = this.ranking().map((p) => `<div class="${p.done ? 'out' : ''}${p.me ? ' me' : ''}"><b>${esc(p.name.slice(0, 10))}</b><span>${esc(this.fmt(p))}</span></div>`).join('');
  }
  dispose() { if (this.off) this.off(); if (this.panel) this.panel.remove(); this.panel = null; }
}
