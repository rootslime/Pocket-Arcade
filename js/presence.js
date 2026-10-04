// Online presence for signed-in players: 🟢 ONLINE · 🟡 IN LOBBY · 🎮 IN GAME · ⚫ OFFLINE.
//
// Only a public display name, level, avatar and status are shared (never email, tokens or account ids).
// Guests are never listed. Players can turn the status off in Settings. A closed tab or lost connection
// simply disappears from the list when Realtime notices the socket is gone.
import { Link, identity, cleanPublicMeta, onlineAvailable, LINK } from './multiplayer.js';
import * as store from './storage.js';
import { peekUser } from './session.js';

export const STATUS = {
  online: { id: 'online', icon: '🟢', label: 'ONLINE' },
  lobby: { id: 'lobby', icon: '🟡', label: 'IN LOBBY' },
  game: { id: 'game', icon: '🎮', label: 'IN GAME' },
  offline: { id: 'offline', icon: '⚫', label: 'OFFLINE' },
};
const TOPIC = 'pa:online';
const listeners = new Set();
let link = null, current = 'online', starting = null;

export const isEnabled = () => onlineAvailable() && !!peekUser() && store.getSetting('showOnline') !== false;

const snapshot = () => {
  if (!link) return [];
  const out = [];
  const seen = new Set();
  for (const p of link.presence()) {
    const m = cleanPublicMeta(p.meta);
    if (!m || seen.has(m.pid)) continue;
    seen.add(m.pid);
    out.push({ ...m, status: STATUS[p.meta.st] ? p.meta.st : 'online' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};
const notify = () => { const l = snapshot(); listeners.forEach((fn) => { try { fn(l); } catch (e) { /* ignore */ } }); };

export function onPresenceChange(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }
export const onlineList = snapshot;

/** Start announcing yourself (no-op for guests / when disabled). */
export async function startPresence(status = 'online') {
  current = status;
  if (!isEnabled()) return false;
  if (link) { await setStatus(status); return true; }
  if (starting) return starting;
  starting = (async () => {
    try {
      const l = new Link(TOPIC);
      l.onPresence(notify);
      await l.open();
      link = l;
      await l.track({ ...publicMeta(), st: current });
      return true;
    } catch (e) { link = null; return false; } finally { starting = null; }
  })();
  return starting;
}
function publicMeta() { const i = identity(); return { pid: i.pid, name: i.name, lv: i.lv, av: i.av, bd: i.bd }; }

export async function setStatus(status) {
  current = STATUS[status] ? status : 'online';
  if (!link || link.state !== LINK.CONNECTED) { if (!link && isEnabled()) return startPresence(current); return false; }
  return link.track({ ...publicMeta(), st: current });
}
export async function stopPresence() { const l = link; link = null; if (l) { try { await l.close(); } catch (e) { /* ignore */ } } notify(); }
export const connected = () => !!link && link.state === LINK.CONNECTED;
