// Account dialogs: sign in, create account, forgot / reset password, welcome, migration.
// All real authentication is delegated to auth.js (Supabase). This file only validates input for
// friendlier messages and renders UI. Passwords are never logged, stored or kept in variables
// longer than the call that sends them.
import * as auth from './auth.js';
import { openModal, closeAllModals, esc } from './ui.js';
import { toast } from './toast.js';

export const validateEmail = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? '' : 'Enter a valid email address.');
export function validatePassword(v) {
  if (String(v).length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Include at least one letter and one number.';
  if (String(v).length > 72) return 'Password is too long (max 72 characters).';
  return '';
}
export const validateUsername = (v) => (/^[A-Za-z0-9_-]{3,20}$/.test(String(v).trim()) ? '' : 'Use 3–20 letters, numbers, _ or -.');

const field = (id, label, type, attrs = '', hint = '') => `
  <div class="field"><label for="${id}">${label}</label>
    <div class="field-row"><input id="${id}" name="${id}" type="${type}" ${attrs} aria-describedby="${id}-err"/>${type === 'password' ? `<button type="button" class="reveal" data-reveal="${id}" aria-label="Show password" aria-pressed="false">👁</button>` : ''}</div>
    ${hint ? `<small class="hint">${hint}</small>` : ''}<small class="err" id="${id}-err" role="alert"></small></div>`;

function wire(card, onSubmit) {
  const form = card.querySelector('form');
  const formErr = card.querySelector('.form-error');
  const btn = form.querySelector('button[type=submit]');
  card.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => {
    const inp = card.querySelector('#' + b.dataset.reveal);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    formErr.textContent = '';
    card.querySelectorAll('.err').forEach((n) => { n.textContent = ''; });
    card.querySelectorAll('input').forEach((n) => n.removeAttribute('aria-invalid'));
    const setErr = (id, msg) => { const n = card.querySelector(`#${id}-err`); if (n) n.textContent = msg; const i = card.querySelector('#' + id); if (i) { i.setAttribute('aria-invalid', 'true'); } };
    const label = btn.textContent;
    const setBusy = (b, text) => { btn.disabled = b; btn.classList.toggle('loading', b); btn.textContent = b ? (text || 'Please wait…') : label; form.setAttribute('aria-busy', String(b)); };
    await onSubmit({ form, setErr, setBusy, formErr, v: (id) => (form.elements[id] ? form.elements[id].value : ''), focusFirstError: () => { const bad = card.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); } });
  });
}

function notConfigured() {
  return openModal({
    title: 'Accounts not set up',
    html: `<p>This copy of Pocket Arcade is running in <b>guest mode</b>: your scores, achievements and XP are saved in this browser.</p>
      <p class="muted">Developers: add your Supabase project URL and anon key to <code>js/config.js</code> to enable sign-in and cloud saves (see the README).</p>
      <div class="p-btns"><button type="button" class="btn primary" data-close>Continue as Guest</button></div>`,
  });
}

export function openSignIn() {
  if (!auth.isConfigured()) return notConfigured();
  closeAllModals();
  const m = openModal({
    title: 'Sign In',
    html: `<form id="f-signin" novalidate>
      ${field('si-email', 'Email', 'email', 'autocomplete="email" required inputmode="email"')}
      ${field('si-pass', 'Password', 'password', 'autocomplete="current-password" required')}
      <div class="form-error" role="alert" aria-live="assertive"></div>
      <button class="btn primary big" type="submit">SIGN IN</button>
      <button type="button" class="link" data-switch="forgot">Forgot password?</button>
      ${auth.googleEnabled() ? '<div class="or"><span>or</span></div><button type="button" class="btn google" data-google><span aria-hidden="true">G</span> Continue with Google</button>' : ''}
      <p class="alt">Don't have an account? <button type="button" class="link" data-switch="signup">Create Account</button></p>
      <p class="alt"><button type="button" class="link" data-close>Continue as Guest</button></p></form>`,
  });
  wire(m.card, async ({ setErr, setBusy, formErr, v, focusFirstError }) => {
    const email = v('si-email').trim(), pass = v('si-pass');
    let bad = false;
    const e1 = validateEmail(email); if (e1) { setErr('si-email', e1); bad = true; }
    if (!pass) { setErr('si-pass', 'Enter your password.'); bad = true; }
    if (bad) return focusFirstError();
    setBusy(true, 'Signing in…');
    const r = await auth.signIn({ email, password: pass });
    setBusy(false);
    if (!r.ok) { formErr.textContent = r.error; return; }
    m.close();
    toast({ icon: '👋', kicker: 'Signed in', title: `Welcome back, ${r.user.name}!`, color: '#5dff8f' });
  });
  m.card.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-switch]');
    if (sw) { sw.dataset.switch === 'forgot' ? openForgot() : openSignUp(); return; }
    if (e.target.closest('[data-google]')) {
      const r = await auth.signInWithGoogle();
      if (!r.ok) m.card.querySelector('.form-error').textContent = r.error;
    }
  });
  return m;
}

export function openSignUp() {
  if (!auth.isConfigured()) return notConfigured();
  closeAllModals();
  const m = openModal({
    title: 'Create Account',
    html: `<form id="f-signup" novalidate>
      ${field('su-name', 'Username', 'text', 'autocomplete="username" required maxlength="20"', '3–20 letters, numbers, _ or -')}
      ${field('su-email', 'Email', 'email', 'autocomplete="email" required inputmode="email"')}
      ${field('su-pass', 'Password', 'password', 'autocomplete="new-password" required', 'At least 8 characters with a letter and a number')}
      ${field('su-pass2', 'Confirm Password', 'password', 'autocomplete="new-password" required')}
      <div class="form-error" role="alert" aria-live="assertive"></div>
      <button class="btn primary big" type="submit">CREATE ACCOUNT</button>
      ${auth.googleEnabled() ? '<div class="or"><span>or</span></div><button type="button" class="btn google" data-google><span aria-hidden="true">G</span> Continue with Google</button>' : ''}
      <p class="alt">Already have an account? <button type="button" class="link" data-switch="signin">Sign In</button></p>
      <p class="alt"><button type="button" class="link" data-close>Continue as Guest</button></p></form>`,
  });
  wire(m.card, async ({ setErr, setBusy, formErr, v, focusFirstError }) => {
    const name = v('su-name').trim(), email = v('su-email').trim(), pass = v('su-pass'), pass2 = v('su-pass2');
    let bad = false;
    const chk = (id, msg) => { if (msg) { setErr(id, msg); bad = true; } };
    chk('su-name', validateUsername(name)); chk('su-email', validateEmail(email)); chk('su-pass', validatePassword(pass));
    if (!bad && pass !== pass2) chk('su-pass2', 'Passwords do not match.');
    if (bad) return focusFirstError();
    setBusy(true, 'Creating account…');
    const r = await auth.signUp({ email, username: name, password: pass });
    setBusy(false);
    if (!r.ok) { formErr.textContent = r.error; return; }
    if (r.signedIn) { m.close(); toast({ icon: '🎉', kicker: 'Account created', title: `Welcome, ${r.user.name}!`, color: '#5dff8f' }); return; }
    m.card.querySelector('.modal-body').innerHTML = `<div class="notice"><div class="notice-ic" aria-hidden="true">✉️</div>
      <h3>Check your email</h3><p>We sent a confirmation link to <b>${esc(email)}</b>. Open it to finish creating your account, then sign in.</p>
      <p class="muted">Already registered with this address? Try signing in or resetting your password.</p>
      <div class="p-btns"><button type="button" class="btn primary" data-switch="signin">Go to Sign In</button></div></div>`;
  });
  m.card.addEventListener('click', async (e) => {
    if (e.target.closest('[data-switch]')) { openSignIn(); return; }
    if (e.target.closest('[data-google]')) { const r = await auth.signInWithGoogle(); if (!r.ok) m.card.querySelector('.form-error').textContent = r.error; }
  });
  return m;
}

export function openForgot() {
  if (!auth.isConfigured()) return notConfigured();
  closeAllModals();
  const m = openModal({
    title: 'Reset Password',
    html: `<form id="f-forgot" novalidate><p class="muted">Enter your account email and we'll send you a link to choose a new password.</p>
      ${field('fp-email', 'Email', 'email', 'autocomplete="email" required inputmode="email"')}
      <div class="form-error" role="alert" aria-live="assertive"></div>
      <button class="btn primary big" type="submit">SEND RESET LINK</button>
      <p class="alt"><button type="button" class="link" data-switch="signin">Back to Sign In</button></p></form>`,
  });
  wire(m.card, async ({ setErr, setBusy, formErr, v, focusFirstError }) => {
    const email = v('fp-email').trim();
    const e1 = validateEmail(email); if (e1) { setErr('fp-email', e1); return focusFirstError(); }
    setBusy(true, 'Sending…');
    const r = await auth.sendPasswordReset(email);
    setBusy(false);
    if (!r.ok) { formErr.textContent = r.error; return; }
    m.card.querySelector('.modal-body').innerHTML = `<div class="notice"><div class="notice-ic" aria-hidden="true">📬</div><h3>Check your inbox</h3>
      <p>If an account exists for <b>${esc(email)}</b>, a password reset link is on its way. It may take a minute to arrive.</p>
      <div class="p-btns"><button type="button" class="btn primary" data-switch="signin">Back to Sign In</button></div></div>`;
  });
  m.card.addEventListener('click', (e) => { if (e.target.closest('[data-switch]')) openSignIn(); });
  return m;
}

/** Shown after following the password-reset email link (PASSWORD_RECOVERY event). */
export function openSetNewPassword() {
  closeAllModals();
  const m = openModal({
    title: 'Choose a New Password', dismissable: false,
    html: `<form id="f-reset" novalidate>
      ${field('np-pass', 'New password', 'password', 'autocomplete="new-password" required', 'At least 8 characters with a letter and a number')}
      ${field('np-pass2', 'Confirm new password', 'password', 'autocomplete="new-password" required')}
      <div class="form-error" role="alert" aria-live="assertive"></div>
      <button class="btn primary big" type="submit">SAVE PASSWORD</button></form>`,
  });
  wire(m.card, async ({ setErr, setBusy, formErr, v, focusFirstError }) => {
    const p1 = v('np-pass'), p2 = v('np-pass2');
    const e1 = validatePassword(p1);
    if (e1) { setErr('np-pass', e1); return focusFirstError(); }
    if (p1 !== p2) { setErr('np-pass2', 'Passwords do not match.'); return focusFirstError(); }
    setBusy(true, 'Saving…');
    const r = await auth.setNewPassword(p1);
    setBusy(false);
    if (!r.ok) { formErr.textContent = r.error; return; }
    m.close();
    toast({ icon: '🔒', kicker: 'Password updated', title: 'You are signed in with your new password.', color: '#5dff8f' });
  });
  return m;
}

export function openWelcome() {
  const m = openModal({
    title: 'Welcome to Pocket Arcade',
    html: `<p>Play all ten games right away: no account needed. Create a free account to save your progress, XP and achievements across devices.</p>
      <div class="p-btns col"><button type="button" class="btn primary big" data-choice="guest">Continue as Guest</button>
      <button type="button" class="btn big" data-choice="signin">Sign In / Create Account</button></div>`,
  });
  m.card.addEventListener('click', (e) => {
    const c = e.target.closest('[data-choice]');
    if (!c) return;
    m.close();
    if (c.dataset.choice === 'signin') openSignIn();
  });
  return m;
}

/** Ask whether to move guest progress into the account. cb('transfer' | 'skip') */
export function openMigration(summary, cb) {
  const m = openModal({
    title: 'Keep your guest progress?', dismissable: false,
    html: `<p>We found progress on this device that isn't in your account yet:</p>
      <ul class="mig-list"><li><b>${summary.xp}</b> XP</li><li><b>${summary.achievements}</b> achievements</li><li><b>${summary.records}</b> personal records</li><li><b>${summary.gamesPlayed}</b> games played</li></ul>
      <p class="muted">Transfer it to merge these into your account (your best scores are kept). You can also do this later in Settings.</p>
      <div class="p-btns col"><button type="button" class="btn primary big" data-mig="transfer">Transfer to my account</button><button type="button" class="btn big" data-mig="skip">Keep separate for now</button></div>`,
  });
  m.card.addEventListener('click', (e) => { const b = e.target.closest('[data-mig]'); if (b) { m.close(); cb(b.dataset.mig); } });
  return m;
}
