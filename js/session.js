// Cheap, dependency-free peek at the persisted Supabase session so every page can decide which
// local save namespace to use before (or without) loading the heavy auth client.
// This is only used to pick a *cache* namespace. Authorization always happens server-side.
import { AUTH_CONFIG } from './config.js';

export function isConfigured() {
  return !!(AUTH_CONFIG.url && AUTH_CONFIG.anonKey && /^https?:\/\//.test(AUTH_CONFIG.url));
}

export function storageKeyName() {
  try { return `sb-${new URL(AUTH_CONFIG.url).hostname.split('.')[0]}-auth-token`; } catch (e) { return null; }
}

/** @returns {{id:string, email?:string, name?:string}|null} */
export function peekUser() {
  if (!isConfigured()) return null;
  try {
    const k = storageKeyName();
    const raw = k && window.localStorage.getItem(k);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const u = s && s.user;
    if (!u || typeof u.id !== 'string' || !/^[0-9a-f-]{20,}$/i.test(u.id)) return null;
    // a refresh token keeps the session valid even when the access token has expired
    if (!s.refresh_token && s.expires_at && s.expires_at * 1000 < Date.now()) return null;
    const md = u.user_metadata || {};
    return { id: u.id, email: u.email, name: md.username || md.display_name || (u.email || '').split('@')[0] };
  } catch (e) { return null; }
}
