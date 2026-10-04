// Public (browser-safe) authentication configuration.
//
// Pocket Arcade uses Supabase Auth + Postgres for optional accounts and cloud saves.
// The Supabase *anon* key is designed to be public: every table is protected by Row Level
// Security (see supabase/schema.sql), so the key alone cannot read or write anyone's data.
//
// NEVER put the `service_role` key (or any other secret) in this file or anywhere in the repo.
//
// Leave `url` and `anonKey` empty to run the arcade in guest-only mode: everything still works,
// progress is simply stored in this browser.
export const AUTH_CONFIG = {
  provider: 'supabase',
  url: '',            // e.g. 'https://abcdefghijklmnop.supabase.co'
  anonKey: '',        // the "anon public" API key from Project Settings → API
  googleEnabled: false, // set true after enabling the Google provider in Supabase (see README)
};

// Pinned client library, loaded lazily from a CDN only when accounts are configured.
export const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
