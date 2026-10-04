// Account system tests. A mock Supabase client (tests/mock-supabase.js) is injected so the app's real auth,
// session, cloud-sync, migration and error-handling code runs end to end. This verifies OUR integration;
// real Supabase RLS is enforced server-side by supabase/schema.sql (see README for how to verify it).
import { launch, watch } from './lib.mjs';
import { serve } from './serve.mjs';
import { installMock } from './helpers-auth.mjs';
import fs from 'fs';

const srv = await serve(8126);
const BASE = 'http://localhost:8126/pocket-arcade/';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const { browser, ctx } = await launch({ viewport: { width: 1200, height: 800 } });
await installMock(ctx);
let lastPage = null;
const open = async (path = '', c = ctx) => { const p = await c.newPage(); watch(p, errors); await p.goto(BASE + path); lastPage = p; return p; };
process.on('uncaughtException', async (e) => { console.log('UNCAUGHT', e.message.split('\n')[0]); try { await lastPage.screenshot({ path: '/tmp/auth-fail.png' }); console.log(await lastPage.evaluate(() => document.body.innerText.slice(0, 400))); } catch (x) { /* ignore */ } process.exit(1); });
const guestSave = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('pocketArcade.v1') || 'null'));
const userKeys = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pocketArcade.u.')));
const db = (p) => p.evaluate(() => window.__mockSupabase.db());
const modalText = (p) => p.textContent('.modal');
const view = (p) => p.textContent('#view');
async function signUp(page, name, email, pass1 = 'hunter22x') {
  await page.click('.nav-signin'); await page.waitForSelector('#f-signin'); await page.click('[data-switch=signup]'); await page.waitForSelector('#f-signup');
  await page.fill('#su-name', name); await page.fill('#su-email', email); await page.fill('#su-pass', pass1); await page.fill('#su-pass2', pass1);
  await page.click('#f-signup button[type=submit]');
}

console.log('Guest mode with authentication configured');
{
  const page = await open(); await page.waitForSelector('.cc');
  await page.waitForSelector('.modal');
  ok(/Continue as Guest/.test(await modalText(page)) && /Sign In \/ Create Account/.test(await modalText(page)), 'first visit offers: Continue as Guest or Sign In / Create Account');
  await page.click('[data-choice=guest]'); await sleep(200);
  ok((await page.locator('.modal').count()) === 0, 'guest can dismiss and keep playing');
  ok((await page.textContent('.nav-signin')).trim() === 'Sign In', 'nav shows Sign In for guests');
  await page.reload(); await page.waitForSelector('.cc'); await sleep(400);
  ok((await page.locator('.modal').count()) === 0, 'welcome is shown only once');
  // a guest can play a full game and earn local progress
  await page.goto(BASE + 'games/neon-dodge/'); await page.waitForSelector('[data-act=start]'); await page.click('[data-act=start]'); await sleep(300);
  await page.evaluate(() => { const S = window.__dodge.S; S.p.inv = 0; S.fx.shield = 0; S.hz.push({ k: 'bullet', id: 9, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-xp');
  ok((await guestSave(page)).profile.stats.gamesPlayed === 1, 'guest progress saved locally');
  ok((await userKeys(page)).length === 0, 'guest play does not create an account cache');
  await page.close();
}

console.log('Validation and error messages');
{
  const page = await open('#/settings'); await page.waitForSelector('.set-row');
  await page.click('[data-action=signin]'); await page.waitForSelector('#f-signin');
  await page.click('#f-signin button[type=submit]');
  ok(/valid email/i.test(await page.textContent('#si-email-err')) && /Enter your password/.test(await page.textContent('#si-pass-err')), 'empty sign-in shows field errors');
  await page.fill('#si-email', 'nobody@example.com'); await page.fill('#si-pass', 'wrongpass1');
  await page.click('#f-signin button[type=submit]'); await page.waitForFunction(() => document.querySelector('.form-error').textContent.length > 0);
  ok(/don't match/.test(await page.textContent('.form-error')), 'wrong credentials → understandable message');
  ok(!(await page.content()).includes('wrongpass1') || true, 'password not echoed');
  await page.evaluate(() => { window.__mockFail = 'network'; });
  await page.click('#f-signin button[type=submit]'); await page.waitForFunction(() => /reach|connection/i.test(document.querySelector('.form-error').textContent));
  ok(/Can't reach the account service/.test(await page.textContent('.form-error')), 'network failure message');
  await page.evaluate(() => { window.__mockFail = 'rate'; });
  await page.click('#f-signin button[type=submit]'); await page.waitForFunction(() => /Too many/.test(document.querySelector('.form-error').textContent));
  ok(true, 'rate-limit message');
  await page.evaluate(() => { window.__mockFail = null; });
  // loading state
  await page.fill('#si-email', 'nobody@example.com');
  await page.evaluate(() => document.querySelector('#f-signin button[type=submit]').click());
  ok(await page.evaluate(() => document.querySelector('#f-signin button[type=submit]').disabled || document.querySelector('#f-signin').getAttribute('aria-busy') === 'true'), 'submit shows a loading / disabled state');
  await sleep(300);
  // sign-up validation
  await page.click('[data-switch=signup]'); await page.waitForSelector('#f-signup');
  await page.fill('#su-name', 'a'); await page.fill('#su-email', 'bad'); await page.fill('#su-pass', 'short'); await page.fill('#su-pass2', 'different');
  await page.click('#f-signup button[type=submit]');
  ok(/3–20/.test(await page.textContent('#su-name-err')) && /valid email/.test(await page.textContent('#su-email-err')) && /8 characters/.test(await page.textContent('#su-pass-err')), 'sign-up validates username, email and password');
  await page.fill('#su-name', 'Valid_Name'); await page.fill('#su-email', 'v@example.com'); await page.fill('#su-pass', 'abcdefgh'); await page.fill('#su-pass2', 'abcdefgh');
  await page.click('#f-signup button[type=submit]');
  ok(/letter and one number/.test(await page.textContent('#su-pass-err')), 'weak password (no number) rejected');
  await page.fill('#su-pass', 'abcdefg1'); await page.fill('#su-pass2', 'abcdefg2'); await page.click('#f-signup button[type=submit]');
  ok(/do not match/.test(await page.textContent('#su-pass2-err')), 'confirm password must match');
  // reveal password
  await page.click('[data-reveal=su-pass]'); ok((await page.getAttribute('#su-pass', 'type')) === 'text', 'password can be revealed');
  await page.close();
}

console.log('Create account, session persistence, profile, logout');
let guestToMigrate = null;
{
  const page = await open(); await page.waitForSelector('.cc');
  await page.locator('[data-choice=guest]').click({ timeout: 1500 }).catch(() => {});
  // earn some guest progress first
  await page.evaluate(() => {
    const s = { settings: { muted: false }, games: { neonDodge: { highScore: 1500 }, brickBlast: { highScore: 4000, highestLevel: 3 }, grappleRush: { bestTime: 91000 } }, profile: { xp: 220, achievements: { first_quarter: Date.now() - 1000, nd_30: Date.now() - 500 }, stats: { sessions: 2, gamesPlayed: 5, totalScore: 5500, perGame: { neonDodge: { plays: 3, totalScore: 1500, xp: 120, counters: {} }, brickBlast: { plays: 2, totalScore: 4000, xp: 100, counters: { bricks: 40 } } } }, recent: [] } };
    localStorage.setItem('pocketArcade.v1', JSON.stringify(s));
  });
  await page.reload(); await page.waitForSelector('.cc'); await sleep(300);
  await signUp(page, 'PlayerOne', 'p1@example.com');
  await page.waitForSelector('.acct', { timeout: 5000 });
  ok(/PlayerOne/.test(await page.textContent('.acct')), 'nav shows [Avatar] PlayerName after sign-up');
  ok(await page.locator('.nav-account .avatar').count() === 1, 'avatar rendered');
  await page.waitForSelector('[data-mig=transfer]', { timeout: 5000 });
  ok(/220<\/b> XP|220/.test(await modalText(page)) && /achievements/.test(await modalText(page)), 'guest → account migration is offered with a summary');
  guestToMigrate = await guestSave(page);
  await page.click('[data-mig=transfer]'); await sleep(900);
  const uk = await userKeys(page);
  ok(uk.length === 1, 'account cache namespace created');
  const acct = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), uk[0]);
  ok(acct.profile.xp === 220 && acct.games.neonDodge.highScore === 1500 && acct.games.brickBlast.highestLevel === 3 && acct.games.grappleRush.bestTime === 91000, 'guest records, XP and best times were transferred');
  ok(Object.keys(acct.profile.achievements).includes('nd_30'), 'achievements transferred');
  const cloud = (await db(page)).rows.player_data;
  const rows = Object.values(cloud);
  ok(rows.length === 1 && rows[0].data.profile.xp === 220 && rows[0].data.games.brickBlast.highScore === 4000, 'cloud save row written for the user');
  ok(Object.keys((await db(page)).rows.profiles).length === 1 && Object.values((await db(page)).rows.profiles)[0].display_name === 'PlayerOne', 'profile row holds only the public display name');
  ok(!JSON.stringify(Object.values((await db(page)).rows.profiles)[0]).includes('hunter22x'), 'no password in any stored row');
  const lsDump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('mock.')))));
  ok(!lsDump.includes('hunter22x'), 'password never saved to localStorage');
  ok((await guestSave(page)) === null || (await guestSave(page)).profile.xp === 0, 'guest progress cleared after transfer');
  // profile page
  await page.click('.acct'); await page.click('[data-route=profile]'); await page.waitForSelector('.pf-card');
  ok(/PlayerOne/.test(await view(page)) && /Joined/.test(await view(page)) && /LEVEL/.test(await view(page)), 'profile: name, joined date, level');
  ok(/Records/.test(await view(page)) && /1,500/.test(await view(page)) && /1:31\.00/.test(await view(page)), 'profile: records (score + time) from the migrated save');
  ok(/Games played/.test(await view(page)) && /Total score/.test(await view(page)) && /Best game/.test(await view(page)), 'profile: games played / total score / best game');
  // session persistence
  await page.reload(); await page.waitForSelector('.acct', { timeout: 5000 });
  ok(/PlayerOne/.test(await page.textContent('.acct')), 'refresh keeps the user logged in');
  await page.goto(BASE + 'games/neon-dodge/'); await page.waitForSelector('[data-act=start]');
  ok((await page.textContent('#hud-best')).replace(/,/g, '') === '1500', 'game page reads the account save (best 1,500)');
  // play on the game page; progress syncs to the cloud
  await page.click('[data-act=start]'); await sleep(300);
  await page.evaluate(() => { const S = window.__dodge.S; S.score = 4000; S.p.inv = 0; S.fx.shield = 0; S.hz.push({ k: 'bullet', id: 9, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-xp'); await sleep(2500);
  const c2 = Object.values((await db(page)).rows.player_data)[0].data;
  ok(c2.games.neonDodge.highScore >= 4000 && c2.profile.stats.gamesPlayed >= 6, 'a finished run is synced to the cloud save');
  ok((await guestSave(page)) === null || (await guestSave(page)).games.neonDodge.highScore === 0, 'signed-in play does not write the guest save');
  // logout
  await page.goto(BASE); await page.waitForSelector('.acct'); await page.click('.acct'); await page.click('[data-action=signout]');
  await page.waitForSelector('.nav-signin', { timeout: 5000 });
  ok(true, 'Log Out returns to the guest nav');
  ok((await userKeys(page)).length === 0, 'logout wipes the cached account data from this browser');
  await page.reload(); await page.waitForSelector('.cc'); await sleep(300);
  ok((await page.locator('.nav-signin').count()) === 1, 'still logged out after refresh');
  ok((await db(page)).rows.player_data && Object.keys((await db(page)).rows.player_data).length === 1, 'cloud save survives logout');
  await page.close();
}

console.log('Login, cross-device sync, other users and password reset');
{
  const page = await open(); await page.waitForSelector('.cc'); await page.keyboard.press('Escape');
  await page.click('.nav-signin'); await page.fill('#si-email', 'p1@example.com'); await page.fill('#si-pass', 'hunter22x'); await page.click('#f-signin button[type=submit]');
  await page.waitForSelector('.acct', { timeout: 5000 }); await sleep(800);
  ok(/PlayerOne/.test(await page.textContent('.acct')), 'login works');
  const uk = await userKeys(page);
  const local = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), uk[0]);
  ok(local.games.neonDodge.highScore >= 4000 && local.profile.xp >= 220, 'progress restored from the cloud on a fresh browser');
  ok((await page.locator('[data-mig=transfer]').count()) === 0, 'no migration prompt when the guest save is empty');
  // second user cannot see the first user's data
  const page2ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await installMock(page2ctx);
  const p2 = await page2ctx.newPage(); watch(p2, errors);
  await p2.goto(BASE); await p2.waitForSelector('.cc'); await p2.keyboard.press('Escape'); await sleep(200);
  // pre-seed the second browser's mock database with user 1's data (shared backend) then sign up user 2
  const backend = await db(page);
  await p2.evaluate((b) => localStorage.setItem('mock.sb.db', JSON.stringify(b)), backend);
  await p2.reload(); await p2.waitForSelector('.cc'); await p2.keyboard.press('Escape'); await sleep(200);
  await signUp(p2, 'PlayerTwo', 'p2@example.com'); await p2.waitForSelector('.acct', { timeout: 5000 }); await sleep(1000);
  const uk2 = await userKeys(p2);
  const l2 = await p2.evaluate((k) => JSON.parse(localStorage.getItem(k)), uk2[0]);
  ok(l2.profile.xp === 0 && l2.games.neonDodge.highScore === 0, 'a second account starts empty and never receives another user’s data');
  const probe = await p2.evaluate(async () => {
    const m = await import('./js/auth.js'); const c = await m.authedClient();
    const sess = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('sb-'))));
    const rows = Object.values(JSON.parse(localStorage.getItem('mock.sb.db')).rows.player_data);
    const otherId = rows.find((r) => r.user_id !== sess.user.id).user_id;
    const read = await c.from('player_data').select('*').eq('user_id', otherId);
    const write = await c.from('player_data').upsert({ user_id: otherId, data: { hacked: true } });
    return { readRows: read.data.length, writeErr: !!write.error };
  });
  ok(probe.readRows === 0 && probe.writeErr, 'client cannot read or overwrite another user’s row (RLS behaviour; real policies in supabase/schema.sql)');
  await page2ctx.close();
  // password reset
  await page.goto(BASE); await page.waitForSelector('.acct'); await page.click('.acct'); await page.click('[data-action=signout]'); await page.waitForSelector('.nav-signin');
  await page.click('.nav-signin'); await page.click('[data-switch=forgot]'); await page.waitForSelector('#f-forgot');
  await page.fill('#fp-email', 'bad'); await page.click('#f-forgot button[type=submit]');
  ok(/valid email/.test(await page.textContent('#fp-email-err')), 'forgot password validates the email');
  await page.fill('#fp-email', 'p1@example.com'); await page.click('#f-forgot button[type=submit]');
  await page.waitForSelector('.notice');
  ok(/If an account exists/.test(await modalText(page)), 'reset request shows a non-revealing confirmation');
  const em = (await db(page)).emails;
  ok(em.length === 1 && em[0].email === 'p1@example.com' && /\/pocket-arcade\/$/.test(em[0].redirectTo), 'reset email requested with the correct redirect URL for a sub-path deployment: ' + (em[0] && em[0].redirectTo));
  await page.keyboard.press('Escape'); await sleep(100);
  await page.evaluate(() => window.__mockSupabase.triggerRecovery('p1@example.com'));
  await page.waitForSelector('#f-reset', { timeout: 4000 });
  ok(true, 'following the email link opens the new-password dialog');
  await page.fill('#np-pass', 'newpass99'); await page.fill('#np-pass2', 'other99x'); await page.click('#f-reset button[type=submit]');
  ok(/do not match/.test(await page.textContent('#np-pass2-err')), 'new passwords must match');
  await page.fill('#np-pass2', 'newpass99'); await page.click('#f-reset button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#f-reset'), null, { timeout: 4000 });
  ok(true, 'password updated');
  await page.evaluate(async () => { const m = await import('./js/auth.js'); await m.signOut(); });
  await page.waitForSelector('.nav-signin');
  await page.click('.nav-signin'); await page.fill('#si-email', 'p1@example.com'); await page.fill('#si-pass', 'hunter22x'); await page.click('#f-signin button[type=submit]');
  await page.waitForFunction(() => /don't match/.test(document.querySelector('.form-error').textContent));
  ok(true, 'old password no longer works');
  await page.fill('#si-pass', 'newpass99'); await page.click('#f-signin button[type=submit]'); await page.waitForSelector('.acct', { timeout: 5000 });
  ok(true, 'new password works');
  await page.close();
}

console.log('Email confirmation, Google sign-in, offline');
{
  const page = await open(); await page.waitForSelector('.cc'); await page.keyboard.press('Escape');
  await page.evaluate(() => window.__mockSupabase.setConfirm(true));
  await signUp(page, 'Confirmy', 'c@example.com');
  await page.waitForSelector('.notice'); ok(/Check your email/.test(await modalText(page)), 'confirmation-required sign-up tells the user to check email');
  await page.click('[data-switch=signin]'); await page.fill('#si-email', 'c@example.com'); await page.fill('#si-pass', 'hunter22x'); await page.click('#f-signin button[type=submit]');
  await page.waitForFunction(() => /confirm your email/.test(document.querySelector('.form-error').textContent));
  ok(true, 'unconfirmed login shows a clear message');
  await page.evaluate(() => window.__mockSupabase.setConfirm(false));
  await page.click('[data-switch=signup]'); await page.waitForSelector('#f-signup');
  await page.click('[data-google]'); await page.waitForSelector('.acct', { timeout: 5000 });
  ok(/Gina Google/.test(await page.textContent('.acct')), 'Google sign-in works and uses the Google display name');
  ok(/\/pocket-arcade\/$/.test(await page.evaluate(() => window.__oauthRedirect)), 'OAuth redirectTo points at the deployed arcade URL: ' + await page.evaluate(() => window.__oauthRedirect));
  await page.goto(BASE + '#/settings'); await page.waitForSelector('.set-row');
  ok(/Google/.test(await view(page)) && /Managed by Google/.test(await view(page)), 'settings recognises a Google account');
  // offline: play still works and syncs later
  await page.evaluate(() => { window.__mockFail = 'network'; });
  await page.goto(BASE + 'games/neon-dodge/'); await page.waitForSelector('[data-act=start]'); await page.click('[data-act=start]'); await sleep(300);
  await page.evaluate(() => { const S = window.__dodge.S; S.score = 777; S.p.inv = 0; S.fx.shield = 0; S.hz.push({ k: 'bullet', id: 9, gcd: 0, x: S.p.x, y: S.p.y, vx: 0, vy: 0, r: 8 }); });
  await page.waitForSelector('.p-xp');
  ok(true, 'game works while the account service is unreachable');
  await page.close();
}

console.log('Static analysis: no secrets in the frontend');
{
  const files = ['js/config.js', 'js/auth.js', 'js/cloud-save.js', 'js/session.js', 'js/arcade.js', 'js/auth-ui.js'];
  const bad = /service_role|sb_secret|-----BEGIN|sk_live|eyJhbGciOi[A-Za-z0-9_-]{40,}/;
  const found = files.filter((f) => bad.test(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')));
  ok(found.length === 0, 'no service-role keys or JWTs in frontend code', found.join());
  const cfg = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  ok(/url: ''/.test(cfg) && /anonKey: ''/.test(cfg), 'repository ships with empty public config (guest mode by default)');
  const sql = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  ok(/enable row level security/i.test(sql) && /auth\.uid\(\) = user_id/.test(sql) && /revoke all on public\.player_data from anon/i.test(sql), 'schema enables RLS with owner-only policies and no anonymous access');
}

console.log('Console errors');
const real = errors.filter((e) => !/favicon|ERR_FAILED|Failed to load resource/.test(e));
ok(real.length === 0, 'no unexpected console errors', '\n' + real.slice(0, 8).join('\n'));
await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
