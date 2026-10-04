// Cloud save for signed-in players (Supabase Postgres, protected by Row Level Security).
//
// Data model (see supabase/schema.sql)
//   profiles    (id = auth.uid(), display_name, avatar, created_at)   -> public-facing identity only
//   player_data (user_id = auth.uid(), data jsonb, updated_at)        -> private progress document
// The user id always comes from the verified session (auth.uid() in SQL), never from client input.
//
// Sync strategy: pull -> merge (max for records, union for achievements) -> push. Merging means
// playing on two devices never loses progress. Guests stay 100% local.
import * as store from './storage.js';
import { authedClient, getUser, onAuthChange, isConfigured } from './auth.js';
import { peekUser } from './session.js';

export const status = { state: isConfigured() ? 'idle' : 'off', last: 0, message: '' };
const statusListeners = new Set();
export const onStatus = (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); };
function setStatus(state, message = '') {
  status.state = state; status.message = message;
  if (state === 'ok') status.last = Date.now();
  statusListeners.forEach((fn) => { try { fn(status); } catch (e) { /* ignore */ } });
}

let timer = 0;
let syncing = false;
let again = false;
let hooked = false;
let retryDelay = 15000;

const signedInId = () => { const u = getUser(); return u ? u.id : (peekUser() || {}).id || null; };

async function fetchRemote(c, uid) {
  const { data, error } = await c.from('player_data').select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureProfile(c, u) {
  try {
    const { data } = await c.from('profiles').select('id').eq('id', u.id).maybeSingle();
    if (!data) await c.from('profiles').upsert({ id: u.id, display_name: u.name }, { onConflict: 'id' });
  } catch (e) { /* the DB trigger normally creates this row; ignore */ }
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Pull, merge, and push. Safe to call repeatedly. Returns true on success. */
export async function syncNow(opts = {}) {
  const user = getUser();
  if (!user || user.offline) return false;
  if (syncing) { again = true; return false; }
  syncing = true;
  setStatus('syncing');
  try {
    const c = await authedClient();
    if (!c) throw new Error('offline');
    const uid = user.id;
    if (store.currentNamespace() !== uid) store.useNamespace(uid);
    const remote = await fetchRemote(c, uid);
    let merged = store.snapshot();
    if (remote && remote.data) merged = store.mergeSaves(store.snapshot(), remote.data, 'sync');
    if (opts.extraMerge) merged = opts.extraMerge(merged); // guest -> account migration
    const changedLocal = !sameJson(store.sanitize(merged).profile, store.getSave().profile) || !sameJson(store.sanitize(merged).games, store.getSave().games) || !sameJson(store.sanitize(merged).blobs, store.getSave().blobs);
    if (changedLocal) store.replaceAll(merged, false);
    const out = store.snapshot();
    if (!remote || !remote.data || !sameJson(store.sanitize(remote.data).profile, store.sanitize(out).profile) || !sameJson(store.sanitize(remote.data).games, store.sanitize(out).games) || !sameJson(store.sanitize(remote.data).blobs, store.sanitize(out).blobs) || !sameJson(store.sanitize(remote.data).settings, store.sanitize(out).settings)) {
      const { error } = await c.from('player_data').upsert({ user_id: uid, data: out, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    if (!remote) await ensureProfile(c, user);
    retryDelay = 15000;
    setStatus('ok');
    return true;
  } catch (e) {
    setStatus(navigator.onLine === false ? 'offline' : 'error', (e && e.message) || 'sync failed');
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 300000);
    return false;
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(1500); }
  }
}

export function scheduleSync(ms = 4000) {
  if (!signedInId()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

/** Start cloud sync for this page (idempotent). Cheap for guests: nothing is loaded. */
export function initCloud() {
  if (hooked || !isConfigured()) return;
  hooked = true;
  store.onWrite(() => scheduleSync());
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); syncNow(); } });
  onAuthChange((ev, user) => { if (user && (ev === 'INITIAL' || ev === 'SIGNED_IN')) scheduleSync(300); });
  // On game pages auth.init() is not called by the homepage: resolve the session lazily if a user is cached.
  if (peekUser() && !getUser()) import('./auth.js').then((m) => m.init()).then((u) => { if (u) scheduleSync(1500); });
}

/** Delete this player's cloud data (used by "Delete cloud save" in Settings). */
export async function deleteCloudSave() {
  const user = getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  try {
    const c = await authedClient();
    const { error } = await c.from('player_data').delete().eq('user_id', user.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Could not delete the cloud save. Try again later.' }; }
}
