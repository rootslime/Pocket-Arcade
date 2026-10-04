import { createRequire } from 'module';
const require = createRequire('/node-tools/node_modules/');
export const { chromium, devices } = require('playwright');
export const BASE = process.env.BASE || 'http://localhost:8123/';
export async function launch(opts = {}) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(opts);
  return { browser, ctx };
}
export function watch(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) errors.push('[reqfail] ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
}
