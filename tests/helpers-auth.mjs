// Shared setup for account tests: pretend Supabase is configured and serve the mock client library.
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
export const MOCK_SRC = fs.readFileSync(path.join(here, 'mock-supabase.js'), 'utf8');
export const MOCK_URL = 'https://testproj.supabase.co';
export const CONFIG_SRC = `export const AUTH_CONFIG = { provider: 'supabase', url: '${MOCK_URL}', anonKey: 'test-anon-key', googleEnabled: true };
export const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';`;
export async function installMock(ctx, { configured = true } = {}) {
  if (configured) await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: CONFIG_SRC }));
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: MOCK_SRC }));
}
