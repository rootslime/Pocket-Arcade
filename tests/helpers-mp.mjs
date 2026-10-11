// Helpers for multiplayer tests: configured Supabase (mock Realtime) and per-tab player identities.
import { installMock } from './helpers-auth.mjs';
export const GAME = 'http://localhost:8131/pocket-arcade/games/pocket-tag/';
export const HOME = 'http://localhost:8131/pocket-arcade/';
export async function newPlayer(ctx, name, pid, errors) {
  const page = await ctx.newPage();
  if (errors) page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  if (errors) page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
  await page.addInitScript(([n, p]) => { window.__PA_NAME = n; window.__PA_PID = p; try { localStorage.setItem('pocketArcade.welcomed', '1'); } catch (e) { /* ignore */ } }, [name, pid]);
  return page;
}
export { installMock };
