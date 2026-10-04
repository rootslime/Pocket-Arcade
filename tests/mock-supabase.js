// In-browser stand-in for @supabase/supabase-js used ONLY by the tests (served through Playwright route
// interception). It mimics the parts of the API Pocket Arcade uses, including per-user Row Level Security,
// so the app's account / sync / migration code paths can be exercised without a real project.
const DBKEY = 'mock.sb.db';
const load = () => { try { return JSON.parse(localStorage.getItem(DBKEY)) || { users: [], rows: { player_data: {}, profiles: {} }, emails: [] }; } catch (e) { return { users: [], rows: { player_data: {}, profiles: {} }, emails: [] }; } };
const saveDb = (db) => localStorage.setItem(DBKEY, JSON.stringify(db));
const uid = () => Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32) + '-0000-4000-8000-000000000000';

export function createClient(url, key) {
  const ref = new URL(url).hostname.split('.')[0];
  const SKEY = `sb-${ref}-auth-token`;
  const subs = new Set();
  const getSess = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; } };
  const setSess = (s) => { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); };
  const emit = (event, session) => subs.forEach((cb) => cb(event, session));
  window.__mockEmit = emit;
  const publicUser = (u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.meta || {}, app_metadata: { provider: u.provider || 'email' } });
  const mkSession = (u) => ({ access_token: 'tok-' + u.id, refresh_token: 'ref-' + u.id, expires_at: Math.floor(Date.now() / 1000) + 3600, user: publicUser(u) });
  const err = (message, code, status = 400) => Object.assign(new Error(message), { code, status, message });
  const delay = () => new Promise((r) => setTimeout(r, 15));
  window.__mockFail = window.__mockFail || null;
  window.__mockUrl = url;

  const auth = {
    async getSession() { await delay(); const s = getSess(); return { data: { session: s }, error: null }; },
    onAuthStateChange(cb) { subs.add(cb); setTimeout(() => cb('INITIAL_SESSION', getSess()), 5); return { data: { subscription: { unsubscribe: () => subs.delete(cb) } } }; },
    async signUp({ email, password, options }) {
      await delay();
      if (window.__mockFail === 'network') return { data: null, error: Object.assign(new TypeError('Failed to fetch'), { name: 'AuthRetryableFetchError' }) };
      if (password.length < 6) return { data: null, error: err('Password should be at least 6 characters.', 'weak_password', 422) };
      const db = load();
      if (db.users.some((u) => u.email === email.toLowerCase())) return { data: { user: { id: 'x', identities: [] }, session: null }, error: null }; // does not reveal existing accounts
      const u = { id: uid(), email: email.toLowerCase(), password, meta: options && options.data, created_at: new Date().toISOString(), confirmed: localStorage.getItem('mock.confirm') !== '1' };
      db.users.push(u);
      db.rows.profiles[u.id] = { id: u.id, display_name: (u.meta && u.meta.username) || email.split('@')[0] }; // the DB trigger
      saveDb(db);
      if (!u.confirmed) return { data: { user: publicUser(u), session: null }, error: null };
      const s = mkSession(u); setSess(s); setTimeout(() => emit('SIGNED_IN', s), 0);
      return { data: { user: publicUser(u), session: s }, error: null };
    },
    async signInWithPassword({ email, password }) {
      await delay();
      if (window.__mockFail === 'network') return { data: null, error: Object.assign(new TypeError('Failed to fetch'), {}) };
      if (window.__mockFail === 'rate') return { data: null, error: err('Email rate limit exceeded', 'over_request_rate_limit', 429) };
      const u = load().users.find((x) => x.email === email.toLowerCase());
      if (!u || u.password !== password) return { data: null, error: err('Invalid login credentials', 'invalid_credentials', 400) };
      if (!u.confirmed) return { data: null, error: err('Email not confirmed', 'email_not_confirmed', 400) };
      const s = mkSession(u); setSess(s); setTimeout(() => emit('SIGNED_IN', s), 0);
      return { data: { user: publicUser(u), session: s }, error: null };
    },
    async signInWithOAuth({ provider, options }) {
      await delay();
      const db = load();
      let u = db.users.find((x) => x.email === 'gina@example.com');
      if (!u) { u = { id: uid(), email: 'gina@example.com', password: null, meta: { full_name: 'Gina Google' }, provider, created_at: new Date().toISOString(), confirmed: true }; db.users.push(u); db.rows.profiles[u.id] = { id: u.id, display_name: 'Gina Google' }; saveDb(db); }
      window.__oauthRedirect = options && options.redirectTo;
      const s = mkSession(u); setSess(s); setTimeout(() => emit('SIGNED_IN', s), 0);
      return { data: { provider, url: options && options.redirectTo }, error: null };
    },
    async signOut() { await delay(); setSess(null); emit('SIGNED_OUT', null); return { error: null }; },
    async resetPasswordForEmail(email, opts) {
      await delay();
      const db = load(); db.emails.push({ type: 'recovery', email: email.toLowerCase(), redirectTo: opts && opts.redirectTo, at: Date.now() }); saveDb(db);
      return { data: {}, error: null };
    },
    async updateUser({ password }) {
      await delay();
      const s = getSess(); if (!s) return { data: null, error: err('Auth session missing!', 'session_not_found', 401) };
      const db = load(); const u = db.users.find((x) => x.id === s.user.id);
      if (password.length < 6) return { data: null, error: err('Password should be at least 6 characters.', 'weak_password', 422) };
      if (u.password === password) return { data: null, error: err('New password should be different from the old password.', 'same_password', 422) };
      u.password = password; saveDb(db);
      return { data: { user: publicUser(u) }, error: null };
    },
  };

  // minimal PostgREST-like builder with Row Level Security (owner only)
  const owner = { player_data: 'user_id', profiles: 'id' };
  function from(table) {
    const q = { filters: [], op: 'select', payload: null };
    const run = async () => {
      await delay();
      if (window.__mockFail === 'network') return { data: null, error: Object.assign(new TypeError('Failed to fetch'), {}) };
      const s = getSess();
      if (!s) return { data: null, error: err('permission denied for table ' + table, '42501', 401) };
      const col = owner[table];
      const db = load(); const rows = db.rows[table];
      const matches = Object.values(rows).filter((r) => q.filters.every(([k, v]) => r[k] === v));
      if (q.op === 'select') return { data: matches.filter((r) => r[col] === s.user.id), error: null }; // RLS hides other users' rows
      if (q.op === 'upsert') {
        if (q.payload[col] !== s.user.id) return { data: null, error: err('new row violates row-level security policy for table "' + table + '"', '42501', 403) };
        rows[q.payload[col]] = JSON.parse(JSON.stringify(q.payload)); saveDb(db); return { data: null, error: null };
      }
      if (q.op === 'delete') { for (const r of matches) if (r[col] === s.user.id) delete rows[r[col]]; saveDb(db); return { data: null, error: null }; }
      return { data: null, error: null };
    };
    const api = {
      select() { q.op = 'select'; return api; },
      eq(k, v) { q.filters.push([k, v]); return api; },
      upsert(p) { q.op = 'upsert'; q.payload = p; return api.then ? api : api; },
      delete() { q.op = 'delete'; return api; },
      async maybeSingle() { const r = await run(); if (r.error) return r; return { data: r.data[0] || null, error: null }; },
      then(res, rej) { return run().then(res, rej); },
    };
    return api;
  }
  return { auth, from };
}

// helpers the tests call from page.evaluate
window.__mockSupabase = {
  db: load,
  setConfirm(v) { localStorage.setItem('mock.confirm', v ? '1' : '0'); },
  emails: () => load().emails,
  async triggerRecovery(email) {
    const db = load(); const u = db.users.find((x) => x.email === email.toLowerCase());
    const ref = new URL(window.__mockUrl).hostname.split('.')[0];
    const s = { access_token: 'tok-' + u.id, refresh_token: 'ref-' + u.id, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.meta || {}, app_metadata: { provider: 'email' } } };
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
    window.__mockEmit && window.__mockEmit('PASSWORD_RECOVERY', s);
  },
};
export default { createClient };
