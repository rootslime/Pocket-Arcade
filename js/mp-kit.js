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
