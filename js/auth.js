// Authentication via Supabase Auth (loaded lazily from a CDN, only when configured).
//
// Security notes
//  * Passwords are sent only to Supabase over HTTPS; they are never stored, logged or kept after the call.
//  * Sessions are managed by the official client (persisted + auto-refreshed JWTs, PKCE flow).
//  * Only the public anon key is used. Authorization is enforced server-side by Row Level Security.
//  * If accounts are not configured, every function degrades gracefully and the arcade runs as guest.
import { AUTH_CONFIG, SUPABASE_CDN } from './config.js';
import { isConfigured, peekUser } from './session.js';

export { isConfigured };
export const googleEnabled = () => isConfigured() && !!AUTH_CONFIG.googleEnabled;

let clientPromise = null;
let client = null;
let currentUser = null;
let ready = false;
const subs = new Set();

/** Where Supabase should send the user back to after email links / OAuth (the arcade home). */
export const homeUrl = () => new URL('./', window.location.href.split('#')[0].split('?')[0]).href;

export const toUser = (u) => {
  if (!u) return null;
  const md = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || '',
    name: String(md.username || md.full_name || md.name || (u.email || 'Player').split('@')[0]).slice(0, 24),
    createdAt: u.created_at ? Date.parse(u.created_at) : 0,
    provider: (u.app_metadata && u.app_metadata.provider) || 'email',
  };
};

/** Friendly, non-leaky messages for provider errors. */
export function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const code = String(err.code || err.error_code || '').toLowerCase();
  const msg = String(err.message || err.error_description || err || '').toLowerCase();
  const status = err.status || 0;
  const has = (...w) => w.some((x) => code.includes(x) || msg.includes(x));
  if (has('not_configured')) return 'Accounts are not set up for this copy of Pocket Arcade yet. You can still play as a guest.';
  if (has('invalid_credentials', 'invalid login credentials')) return "That email and password don't match. Check them and try again.";
  if (has('email_not_confirmed', 'email not confirmed')) return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if (has('user_already_exists', 'already registered', 'already been registered')) return 'An account with this email already exists. Try signing in instead.';
  if (has('weak_password', 'password should be', 'password is too')) return 'That password is too weak. Use at least 8 characters with letters and numbers.';
  if (has('same_password', 'different from the old')) return 'Choose a password that is different from your current one.';
  if (has('over_email_send_rate_limit', 'over_request_rate_limit', 'rate limit', 'too many') || status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (has('signup_disabled', 'signups not allowed')) return 'New sign-ups are currently disabled.';
  if (has('validation_failed', 'invalid email', 'unable to validate email')) return 'Please enter a valid email address.';
  if (has('session_not_found', 'refresh_token', 'jwt', 'not authenticated', 'auth session missing')) return 'Your session expired. Please sign in again.';
  if (has('provider is not enabled', 'unsupported provider')) return 'Google sign-in is not enabled for this arcade.';
  if (has('failed to fetch', 'networkerror', 'network request failed', 'load failed', 'fetch')) return "Can't reach the account service. Check your connection and try again.";
  return 'Something went wrong. Please try again.';
}

const fail = (err) => ({ ok: false, error: friendlyError(err) });

function emit(event, user) {
  currentUser = user;
  subs.forEach((fn) => { try { fn(event, user); } catch (e) { /* ignore */ } });
}
export const onAuthChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export async function getClient() {
  if (!isConfigured()) { const e = new Error('not_configured'); e.code = 'not_configured'; throw e; }
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ SUPABASE_CDN).then((m) => {
      const create = m.createClient || (m.default && m.default.createClient);
      client = create(AUTH_CONFIG.url, AUTH_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      });
      client.auth.onAuthStateChange((event, session) => {
        // never call other Supabase methods synchronously inside this callback
        setTimeout(() => {
          const u = toUser(session && session.user);
          if (event === 'PASSWORD_RECOVERY') emit('PASSWORD_RECOVERY', u);
          else if (event === 'SIGNED_OUT') emit('SIGNED_OUT', null);
          else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (event === 'INITIAL_SESSION') { if (!ready) { ready = true; emit('INITIAL', u); } } else emit(event, u);
          }
        }, 0);
      });
      return client;
    }).catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

/** Load the client and resolve the current user (null for guests). Never throws. */
export async function init() {
  if (!isConfigured()) { ready = true; return null; }
  try {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    currentUser = toUser(data && data.session && data.session.user);
    ready = true;
    return currentUser;
  } catch (e) {
    // offline or CDN blocked: fall back to the cached identity so cached data stays usable
    ready = true;
    const p = peekUser();
    currentUser = p ? { id: p.id, email: p.email || '', name: p.name || 'Player', createdAt: 0, provider: 'email', offline: true } : null;
    return currentUser;
  }
}

export const getUser = () => currentUser;

export async function signUp({ email, password, username }) {
  try {
    const c = await getClient();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: homeUrl() } });
    if (error) return fail(error);
    if (data.session) return { ok: true, user: toUser(data.user), signedIn: true };
    // confirmation required (or the address already exists: Supabase deliberately does not say which)
    return { ok: true, needsConfirm: true };
  } catch (e) { return fail(e); }
}

export async function signIn({ email, password }) {
  try {
    const c = await getClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return fail(error);
    return { ok: true, user: toUser(data.user) };
  } catch (e) { return fail(e); }
}

export async function signInWithGoogle() {
  if (!googleEnabled()) return { ok: false, error: 'Google sign-in is not enabled for this arcade.' };
  try {
    const c = await getClient();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: homeUrl() } });
    if (error) return fail(error);
    return { ok: true, redirecting: true };
  } catch (e) { return fail(e); }
}

export async function sendPasswordReset(email) {
  try {
    const c = await getClient();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: homeUrl() });
    if (error && (error.status === 429 || /rate/i.test(error.message || ''))) return fail(error);
    // do not reveal whether the address has an account
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setNewPassword(password) {
  try {
    const c = await getClient();
    const { error } = await c.auth.updateUser({ password });
    if (error) return fail(error);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function signOut() {
  try {
    const c = await getClient();
    await c.auth.signOut();
  } catch (e) { /* even if the network call fails the local session is cleared below */ }
  emit('SIGNED_OUT', null);
  return { ok: true };
}

/** Access to the authenticated client for cloud-save (null if unavailable). */
export async function authedClient() {
  try { return await getClient(); } catch (e) { return null; }
}
