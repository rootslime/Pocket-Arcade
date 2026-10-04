// Pocket Arcade console UI: home, library, game detail, achievements, profile and settings.
// Everything is generated from games.js / achievements.js and the player's save data.
import { GAMES, CATEGORIES, gameById, gameBySlug, headline, recordRows } from './games.js';
import * as store from './storage.js';
import * as auth from './auth.js';
import * as cloud from './cloud-save.js';
import { sfx } from './audio.js';
import { levelInfo, THEMES, TITLES, BORDERS, AVATARS, bestGameId } from './progression.js';
import { ACHIEVEMENTS, forGame, ARCADE_ID } from './achievements.js';
import { avatarHTML, summarize, xpBarHTML, recordsHTML, achievementCount, recentAchievements, dateText, cosmeticsUnlocked } from './profile.js';
import { esc, openModal, closeTopModal, hasModal, topModal, closeAllModals } from './ui.js';
import * as authUI from './auth-ui.js';
import { toast } from './toast.js';
import { moveFocus, isTyping } from './nav.js';
import * as gp from './gamepad.js';
import { isConfigured, peekUser } from './session.js';
import { formatScore } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const ROUTES = ['home', 'library', 'achievements', 'profile', 'settings'];
const NAV_TITLES = { home: 'Home', library: 'Library', achievements: 'Achievements', profile: 'Profile', settings: 'Settings' };

let user = null;             // signed-in user (from auth.js) or null for guests
let sel = Number(sessionStorage.getItem('pa.sel') || 0) || 0;
let filter = 'all';
let achFilter = 'all';
let route = { name: 'home' };
let renderToken = 0;
let prevRoute = 'home';
let syncLabel = '';

const save = () => store.getSave();
const reduced = () => store.prefersReducedMotion();
const hash = (r) => '#/' + r;

// ------------------------------------------------------------------ theme + background
function applyTheme() {
  const s = save();
  const lvl = levelInfo(s.profile.xp).level;
  const t = THEMES.find((x) => x.id === s.profile.cosmetics.theme && x.level <= lvl) || THEMES[0];
  document.documentElement.style.setProperty('--t1', t.a);
  document.documentElement.style.setProperty('--t2', t.b);
  document.body.classList.toggle('reduce-motion', reduced());
}

let bgOn = 0;
function setBackground(g) {
  const layers = document.querySelectorAll('.bg-layer');
  if (!layers.length) return;
  const next = layers[1 - bgOn];
  next.style.background = g ? g.theme.background : '';
  next.style.setProperty('--accent', g ? g.theme.accent : 'var(--t1)');
  next.classList.add('on'); layers[bgOn].classList.remove('on');
  bgOn = 1 - bgOn;
  document.documentElement.style.setProperty('--accent', g ? g.theme.accent : 'var(--t1)');
}

function makeParticles() {
  const host = $('#bg-particles');
  if (!host || host.childElementCount) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', `${(i * 47) % 100}%`);
    p.style.setProperty('--d', `${9 + (i % 7) * 2.3}s`);
    p.style.setProperty('--delay', `${-(i * 1.7) % 12}s`);
    p.style.setProperty('--s', `${3 + (i % 4) * 2}px`);
    host.appendChild(p);
  }
}

// ------------------------------------------------------------------ nav / account chip
function renderAccount() {
  const host = $('#nav-account');
  const s = save();
  if (!user) {
    host.innerHTML = `<button type="button" class="btn nav-signin" data-action="signin">Sign In</button>`;
    return;
  }
  const sm = summarize(s);
  host.innerHTML = `<button type="button" class="acct" id="acct-btn" aria-haspopup="menu" aria-expanded="false" data-action="acct-menu">
      ${avatarHTML({ name: user.name, avatar: sm.avatar, border: sm.border, size: 34 })}<span class="acct-name">${esc(user.name)}</span><span class="caret" aria-hidden="true">▾</span></button>
    <div class="acct-menu" id="acct-menu" role="menu" hidden>
      <button role="menuitem" type="button" data-action="go" data-route="profile">Profile</button>
      <button role="menuitem" type="button" data-action="go" data-route="achievements">Achievements</button>
      <button role="menuitem" type="button" data-action="go" data-route="settings">Settings</button>
      <button role="menuitem" type="button" data-action="signout">Log Out</button></div>`;
}
function closeAcctMenu() { const m = $('#acct-menu'); if (m && !m.hidden) { m.hidden = true; const b = $('#acct-btn'); if (b) b.setAttribute('aria-expanded', 'false'); } }

function renderNavState() {
  document.querySelectorAll('.nav-tab').forEach((b) => {
    const on = b.dataset.route === (route.name === 'game' ? 'library' : route.name);
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

// ------------------------------------------------------------------ views
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'GOOD EVENING' : h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
}

function heroHTML(g) {
  const s = save();
  const hl = headline(g, s);
  const ac = achievementCount(s, g.id);
  const rows = recordRows(g, s).filter((r) => r.label !== (g.records[0] || {}).label).slice(0, 2);
  return `<div class="hero-copy" style="--accent:${g.theme.accent}">
      <small class="eyebrow">${g.genre.map(esc).join(' • ')}</small>
      <h1 class="hero-title">${esc(g.title)}</h1>
      <p class="hero-tag">${esc(g.tagline)}</p>
      <div class="hero-stats">
        <div><span>${esc(hl.label.toUpperCase())}</span><b class="${hl.has ? '' : 'empty'}">${esc(hl.text)}</b></div>
        ${rows.map((r) => `<div><span>${esc(r.label.toUpperCase())}</span><b>${esc(r.text)}</b></div>`).join('')}
        <div><span>ACHIEVEMENTS</span><b>${ac.done} / ${ac.total}</b></div>
      </div>
      <div class="hero-btns"><button type="button" class="btn primary big" data-action="play" data-game="${g.id}" id="hero-play">▶ PLAY</button>
        <button type="button" class="btn big" data-action="open" data-game="${g.id}">Details</button></div>
    </div>
    <div class="hero-art"><img src="${g.icon}" alt="" width="240" height="150"></div>`;
}

function cardHTML(g, i) {
  return `<button type="button" class="cc${i === sel ? ' sel' : ''}" role="option" aria-selected="${i === sel}" data-action="card" data-idx="${i}" data-game="${g.id}" style="--accent:${g.theme.accent}" aria-label="${esc(g.title)}, ${esc(g.tagline)}">
    <img src="${g.icon}" alt="" width="240" height="150"><span class="cc-title">${esc(g.title)}</span></button>`;
}

function playerStrip(s) {
  const sm = summarize(s);
  const name = user ? user.name : 'Guest';
  return `<div class="strip">
    ${avatarHTML({ name, avatar: user ? sm.avatar : 'initials', border: sm.border, size: 56 })}
    <div class="strip-main"><small class="eyebrow">${user ? `${greeting()}, ${esc(name.toUpperCase())}` : 'WELCOME TO POCKET ARCADE'}</small>
      <div class="strip-title">${esc(sm.title)}</div>${xpBarHTML(sm.info, true)}</div>
    <div class="strip-stats"><div><b>${formatScore(sm.gamesPlayed)}</b><span>Games played</span></div><div><b>${sm.achievements}/${sm.achievementsTotal}</b><span>Achievements</span></div></div></div>`;
}

function nudgeNeeded(s) {
  if (user || !isConfigured()) return false;
  const p = s.profile;
  if (p.stats.gamesPlayed < 3 && Object.keys(p.achievements).length < 2) return false;
  const day = 3 * 86400000;
  if (!p.nudge.dismissedAt) return true;
  return Date.now() - p.nudge.dismissedAt > day || p.stats.gamesPlayed - p.nudge.lastShown >= 10;
}

function dashboardHTML() {
  const s = save();
  const p = s.profile;
  const played = p.recent.map((r) => ({ g: gameById(r.id), r })).filter((x) => x.g).slice(0, 4);
  const last = played[0];
  const unplayed = GAMES.find((g) => !(p.stats.perGame[g.id] || {}).plays);
  const cont = last ? last.g : unplayed || GAMES[0];
  let html = playerStrip(s);
  if (nudgeNeeded(s)) {
    html += `<div class="nudge" role="note"><span aria-hidden="true">☁️</span><div><b>Protect your progress.</b> Create a free account to sync scores, XP and achievements across devices.</div>
      <div class="nudge-btns"><button type="button" class="btn primary" data-action="signup">Create account</button><button type="button" class="btn" data-action="nudge-dismiss">Not now</button></div></div>`;
  }
  html += `<div class="dash-grid">
    <section class="panel"><h3>Continue playing</h3>
      <button type="button" class="cont" data-action="play" data-game="${cont.id}" style="--accent:${cont.theme.accent}"><img src="${cont.icon}" alt=""><span><b>${esc(cont.title)}</b><small>${last ? esc(last.r.text || 'Pick up where you left off') : 'Start your first run'}</small></span><i aria-hidden="true">▶</i></button>
      ${unplayed && last ? `<button type="button" class="cont alt" data-action="open" data-game="${unplayed.id}" style="--accent:${unplayed.theme.accent}"><img src="${unplayed.icon}" alt=""><span><b>Try ${esc(unplayed.title)}</b><small>New to you · ${esc(unplayed.genre[0])}</small></span><i aria-hidden="true">›</i></button>` : ''}
    </section>`;
  if (!user && !played.length) {
    html += `<section class="panel"><h3>Recently played</h3><p class="muted">Games you play will show up here.</p></section>`;
  } else {
    html += `<section class="panel"><h3>Recently played</h3>${played.length ? played.map((x) => `<button type="button" class="row" data-action="open" data-game="${x.g.id}" style="--accent:${x.g.theme.accent}"><b>${esc(x.g.title)}</b><span>${esc(x.r.text || '')}</span></button>`).join('') : '<p class="muted">Games you play will show up here.</p>'}</section>`;
  }
  if (user) {
    html += `<section class="panel wide"><h3>Your records</h3><div class="rec-grid">${recordsHTML(s)}</div></section>`;
  }
  const ra = recentAchievements(s);
  html += `<section class="panel${user ? '' : ' wide'}"><h3>Recent achievements</h3>${ra.length ? ra.map((a) => `<div class="row ach-mini"><span class="ic" aria-hidden="true">${esc(a.def.icon)}</span><span><b>${esc(a.def.name)}</b><small>${esc(a.def.desc)}</small></span></div>`).join('') : '<p class="muted">Unlock achievements by playing. Your first one is one game away.</p>'}</section></div>`;
  return html;
}

function homeHTML() {
  const g = GAMES[sel] || GAMES[0];
  return `<div class="home">
    <section class="hero" id="hero" aria-live="polite">${heroHTML(g)}</section>
    <div class="carousel" id="carousel" role="listbox" aria-label="Games">${GAMES.map(cardHTML).join('')}</div>
    <div class="dash">${dashboardHTML()}</div></div>`;
}

function libCard(g) {
  const s = save();
  const hl = headline(g, s);
  const ac = achievementCount(s, g.id);
  const plays = (s.profile.stats.perGame[g.id] || {}).plays || 0;
  return `<article class="lib" style="--accent:${g.theme.accent}"><button type="button" class="lib-main" data-action="open" data-game="${g.id}" aria-label="${esc(g.title)} details">
      <img src="${g.icon}" alt="" width="240" height="150"><span class="status ${plays ? 'played' : 'new'}">${plays ? `Played ×${plays}` : 'New'}</span>
      <h3>${esc(g.title)}</h3><p class="lib-genre">${g.genre.map(esc).join(' • ')}</p>
      <div class="lib-stats"><div><span>${esc(hl.label)}</span><b class="${hl.has ? '' : 'empty'}">${esc(hl.text)}</b></div><div><span>Achievements</span><b>${ac.done} / ${ac.total}</b></div></div></button>
    <button type="button" class="btn primary" data-action="play" data-game="${g.id}">▶ PLAY</button></article>`;
}

function libraryHTML() {
  const list = GAMES.filter((g) => filter === 'all' || g.categories.includes(filter));
  return `<div class="page"><header class="page-head"><h1>Library</h1><p class="muted">${GAMES.length} games · ${list.length} shown</p></header>
    <div class="chips" role="tablist" aria-label="Filter games">${CATEGORIES.map((c) => `<button type="button" role="tab" class="chip${c.id === filter ? ' on' : ''}" aria-selected="${c.id === filter}" data-action="filter" data-cat="${c.id}">${esc(c.label.toUpperCase())}</button>`).join('')}</div>
    <div class="lib-grid">${list.map(libCard).join('')}</div></div>`;
}

function inputChips(g) {
  return `<div class="inputs">${[['keyboard', '⌨️ Keyboard'], ['touch', '👆 Touch'], ['gamepad', '🎮 Controller']].map(([k, label]) => `<span class="pill${g.controls[k] ? '' : ' off'}">${label}${g.controls[k] ? '' : ' — n/a'}</span>`).join('')}</div>`;
}

function detailHTML(g) {
  const s = save();
  const hl = headline(g, s);
  const ac = achievementCount(s, g.id);
  const rows = recordRows(g, s);
  return `<div class="page detail" style="--accent:${g.theme.accent}">
    <button type="button" class="btn back" data-action="back">‹ Back</button>
    <div class="detail-grid">
      <div class="detail-art"><img src="${g.icon}" alt="${esc(g.title)} artwork" width="480" height="300"></div>
      <div class="detail-info">
        <small class="eyebrow">${g.genre.map(esc).join(' • ')}</small>
        <h1>${esc(g.title)}</h1><p class="hero-tag">${esc(g.tagline)}</p><p class="desc">${esc(g.description)}</p>
        <div class="hero-stats"><div><span>${esc(hl.label.toUpperCase())}</span><b class="${hl.has ? '' : 'empty'}">${esc(hl.text)}</b></div>
          ${rows.filter((r) => r.label !== (g.records[0] || {}).label).slice(0, 3).map((r) => `<div><span>${esc(r.label.toUpperCase())}</span><b>${esc(r.text)}</b></div>`).join('')}
          <div><span>ACHIEVEMENTS</span><b>${ac.done} / ${ac.total}</b></div></div>
        <div class="controls-box"><h4>Controls</h4><ul>${g.controlsText.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${inputChips(g)}</div>
        <div class="hero-btns"><button type="button" class="btn primary big" data-action="play" data-game="${g.id}" id="detail-play">▶ PLAY</button>
          <button type="button" class="btn big" data-action="howto" data-game="${g.id}">How to Play</button>
          <button type="button" class="btn big" data-action="game-ach" data-game="${g.id}">Achievements</button></div>
      </div></div></div>`;
}

function achItem(a, s) {
  const ts = s.profile.achievements[a.id];
  return `<li class="ach ${ts ? 'got' : 'lock'}"><span class="ach-ic" aria-hidden="true">${ts ? esc(a.icon) : '🔒'}</span>
    <span class="ach-t"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span><span class="ach-d">${ts ? `Unlocked<br>${esc(dateText(ts))}` : 'Locked'}</span></li>`;
}

function achievementsHTML() {
  const s = save();
  const total = ACHIEVEMENTS.length, done = Object.keys(s.profile.achievements).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length;
  const groups = [{ id: ARCADE_ID, title: 'Arcade-wide' }, ...GAMES.map((g) => ({ id: g.id, title: g.title }))].filter((x) => achFilter === 'all' || achFilter === x.id);
  return `<div class="page"><header class="page-head"><h1>Achievements</h1><p class="muted">${done} of ${total} unlocked</p></header>
    <div class="xp-bar big" role="progressbar" aria-label="Achievements unlocked" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${Math.round(done / total * 100)}%"></i></div>
    <div class="chips" role="tablist" aria-label="Filter achievements"><button type="button" role="tab" class="chip${achFilter === 'all' ? ' on' : ''}" data-action="ach-filter" data-id="all" aria-selected="${achFilter === 'all'}">ALL</button>
      <button type="button" role="tab" class="chip${achFilter === ARCADE_ID ? ' on' : ''}" data-action="ach-filter" data-id="${ARCADE_ID}" aria-selected="${achFilter === ARCADE_ID}">ARCADE</button>
      ${GAMES.map((g) => `<button type="button" role="tab" class="chip${achFilter === g.id ? ' on' : ''}" data-action="ach-filter" data-id="${g.id}" aria-selected="${achFilter === g.id}">${esc(g.title.toUpperCase())}</button>`).join('')}</div>
    ${groups.map((gr) => { const list = forGame(gr.id); const d = list.filter((a) => s.profile.achievements[a.id]).length; return `<section class="ach-group"><h2>${esc(gr.title)} <small>${d} / ${list.length}</small></h2><ul class="ach-list">${list.map((a) => achItem(a, s)).join('')}</ul></section>`; }).join('')}</div>`;
}

function profileHTML() {
  const s = save();
  const sm = summarize(s);
  const p = s.profile;
  const name = user ? user.name : 'Guest';
  const unlocked = cosmeticsUnlocked(sm.info.level);
  const opt = (list, cur, kind) => list.map((o) => `<button type="button" class="opt${o.id === cur ? ' on' : ''}" data-action="cosmetic" data-kind="${kind}" data-id="${o.id}" aria-pressed="${o.id === cur}">${esc(o.name)}</button>`).join('');
  const locked = (list, level) => list.filter((o) => o.level > level).map((o) => `<span class="opt lock" title="Unlocks at level ${o.level}">🔒 ${esc(o.name)} · Lv ${o.level}</span>`).join('');
  return `<div class="page profile"><header class="page-head"><h1>${user ? 'Player Profile' : 'Guest Profile'}</h1></header>
    <section class="pf-card">${avatarHTML({ name, avatar: user ? sm.avatar : 'initials', border: sm.border, size: 96 })}
      <div class="pf-id"><h2>${esc(name)}</h2><div class="pf-title">${esc(sm.title)}</div>
        ${user ? `<small class="muted">Joined ${esc(dateText(user.createdAt || p.joined))}</small>` : `<small class="muted">Playing as a guest · progress is saved on this device</small>`}</div>
      <div class="pf-level"><div class="pf-lv">LEVEL <b>${sm.info.level}</b></div>${xpBarHTML(sm.info)}</div></section>
    ${user ? '' : `<div class="nudge" role="note"><span aria-hidden="true">☁️</span><div><b>${isConfigured() ? 'Create a free account' : 'Guest mode'}</b> ${isConfigured() ? 'to keep this progress safe and sync it across devices.' : '— accounts aren’t configured on this site, but everything is saved locally.'}</div>${isConfigured() ? '<div class="nudge-btns"><button type="button" class="btn primary" data-action="signup">Create account</button><button type="button" class="btn" data-action="signin">Sign in</button></div>' : ''}</div>`}
    <section class="stat-row"><div><b>${formatScore(sm.gamesPlayed)}</b><span>Games played</span></div><div><b>${formatScore(p.stats.sessions)}</b><span>Play sessions</span></div><div><b>${formatScore(sm.totalScore)}</b><span>Total score</span></div><div><b>${sm.bestGame ? esc(sm.bestGame.title) : '—'}</b><span>Best game</span></div><div><b>${sm.achievements}/${sm.achievementsTotal}</b><span>Achievements</span></div></section>
    <section class="panel wide"><h3>Records</h3><div class="rec-grid">${recordsHTML(s, true)}</div></section>
    <section class="panel wide"><h3>Game statistics</h3><div class="gstats">${GAMES.map((g) => { const pg = p.stats.perGame[g.id] || { plays: 0, totalScore: 0, xp: 0 }; return `<div class="gs-row" style="--accent:${g.theme.accent}"><b>${esc(g.title)}</b><span>${pg.plays} plays</span><span>${pg.xp} XP</span></div>`; }).join('')}</div></section>
    <section class="panel wide"><h3>Customize</h3>
      <h4>Title</h4><div class="opts">${opt(unlocked.titles, p.cosmetics.title, 'title')}${locked(TITLES, sm.info.level)}</div>
      <h4>Avatar</h4><div class="opts">${opt(unlocked.avatars, p.cosmetics.avatar, 'avatar')}${locked(AVATARS, sm.info.level)}</div>
      <h4>Profile border</h4><div class="opts">${opt(unlocked.borders, p.cosmetics.border, 'border')}${locked(BORDERS, sm.info.level)}</div>
      <h4>Arcade theme</h4><div class="opts">${opt(unlocked.themes, p.cosmetics.theme, 'theme')}${locked(THEMES, sm.info.level)}</div>
      <p class="muted small">Cosmetics never change gameplay. Level up by playing to unlock more.</p></section></div>`;
}

function toggleBtn(action, label, on, desc) {
  return `<div class="set-row"><div><b>${label}</b><small>${desc}</small></div><button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-action="${action}" aria-label="${label}"><i></i></button></div>`;
}

function settingsHTML() {
  const s = save();
  const cfg = isConfigured();
  const guest = store.readGuestSave();
  const canTransfer = user && store.hasProgress(guest);
  return `<div class="page"><header class="page-head"><h1>Settings</h1></header>
    <section class="panel wide"><h3>Preferences</h3>
      ${toggleBtn('set-sound', 'Sound effects', !store.isMuted(), 'Generated arcade sounds')}
      ${toggleBtn('set-motion', 'Reduced motion', reduced(), 'Fewer animations and no screen shake')}
      ${toggleBtn('set-quick', 'Quick Launch', !!s.settings.quickLaunch, 'Selecting a game starts it immediately')}
      <div class="set-row"><div><b>Controller</b><small id="pad-state">${gp.isConnected() ? 'Controller connected: D-pad navigates, A selects, B goes back.' : 'No controller detected. Connect one and press any button.'}</small></div></div></section>
    <section class="panel wide"><h3>Account</h3>${user ? `
      <div class="set-row"><div><b>${esc(user.name)}</b><small>${esc(user.email)} · ${user.provider === 'google' ? 'Google' : 'Email'} sign-in</small></div></div>
      <div class="set-row"><div><b>Cloud save</b><small id="sync-state">${esc(syncLabel || 'Synced automatically')}</small></div><button type="button" class="btn" data-action="sync-now">Sync now</button></div>
      ${canTransfer ? '<div class="set-row"><div><b>Guest progress on this device</b><small>Merge it into your account</small></div><button type="button" class="btn" data-action="transfer">Transfer</button></div>' : ''}
      <div class="set-row"><div><b>Password</b><small>We’ll email you a reset link</small></div>${user.provider === 'google' ? '<span class="muted">Managed by Google</span>' : '<button type="button" class="btn" data-action="change-pass">Send reset email</button>'}</div>
      <div class="set-row"><div><b>Delete cloud save</b><small>Removes your synced progress from the server</small></div><button type="button" class="btn danger" data-action="delete-cloud">Delete</button></div>
      <div class="set-row"><div><b>Log out</b><small>Your cloud save stays safe</small></div><button type="button" class="btn" data-action="signout">Log Out</button></div>` : `
      <div class="set-row"><div><b>Guest mode</b><small>${cfg ? 'Sign in to sync progress across devices.' : 'Accounts are not configured on this site (see README → Authentication Setup).'}</small></div>${cfg ? '<div class="nudge-btns"><button type="button" class="btn primary" data-action="signin">Sign In</button><button type="button" class="btn" data-action="signup">Create account</button></div>' : ''}</div>`}</section>
    <section class="panel wide"><h3>Data</h3>
      <div class="set-row"><div><b>Reset saved data</b><small>Clears scores, XP and achievements ${user ? 'on this device and in your account' : 'on this device'}</small></div><button type="button" class="btn danger" data-action="reset">Reset…</button></div></section></div>`;
}

// ------------------------------------------------------------------ render + transitions
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, arg] = h.split('/');
  if (name === 'game' && gameBySlug(arg)) return { name: 'game', slug: arg };
  if (ROUTES.includes(name)) return { name };
  return { name: 'home' };
}

function html() {
  switch (route.name) {
    case 'library': return libraryHTML();
    case 'game': return detailHTML(gameBySlug(route.slug));
    case 'achievements': return achievementsHTML();
    case 'profile': return profileHTML();
    case 'settings': return settingsHTML();
    default: return homeHTML();
  }
}

function afterRender() {
  renderNavState();
  if (route.name === 'home') {
    const g = GAMES[sel] || GAMES[0];
    setBackground(g);
    const sc = $('#carousel .sel');
    if (sc) sc.scrollIntoView({ inline: 'center', block: 'nearest' });
  } else if (route.name === 'game') setBackground(gameBySlug(route.slug));
  else setBackground(null);
  const t = route.name === 'game' ? gameBySlug(route.slug).title : NAV_TITLES[route.name];
  document.title = `${t} · Pocket Arcade`;
  const first = route.name === 'home' ? $('#hero-play') : route.name === 'game' ? $('#detail-play') : view.querySelector('.chip.on, .opt.on, button, a[href]');
  if (first && !hasModal() && document.activeElement !== first) first.focus({ preventScroll: true });
}

function render(opts = {}) {
  const token = ++renderToken;
  const draw = () => {
    if (token !== renderToken) return;
    view.innerHTML = html();
    view.classList.remove('leaving');
    if (!reduced() && !opts.instant) { view.classList.add('entering'); setTimeout(() => view.classList.remove('entering'), 320); }
    afterRender();
  };
  if (opts.instant || reduced() || !view.innerHTML) draw();
  else { view.classList.add('leaving'); setTimeout(draw, 120); }
}

function go(name, extra) {
  prevRoute = route.name === 'game' ? 'library' : route.name;
  location.hash = hash(extra ? `${name}/${extra}` : name);
}
window.addEventListener('hashchange', () => { route = parseRoute(); closeAcctMenu(); render(); });

// ------------------------------------------------------------------ actions
function launch(g) {
  sfx.unlock(); sfx.play('click');
  sessionStorage.setItem('pa.sel', String(GAMES.indexOf(g)));
  const go = () => { location.href = g.path; };
  if (reduced()) return go();
  document.body.classList.add('launching');
  const card = document.querySelector(`[data-game="${g.id}"].cc, [data-game="${g.id}"].lib-main`);
  if (card) card.classList.add('zoom');
  setTimeout(go, 240);
}

function openGame(g) {
  if (save().settings.quickLaunch) return launch(g);
  go('game', g.slug);
}

function selectIdx(i, scroll = false) {
  if (i === sel || i < 0 || i >= GAMES.length) return;
  sel = i;
  sessionStorage.setItem('pa.sel', String(i));
  document.querySelectorAll('#carousel .cc').forEach((c, k) => { c.classList.toggle('sel', k === i); c.setAttribute('aria-selected', String(k === i)); });
  const hero = $('#hero');
  if (hero) { hero.classList.remove('swap'); void hero.offsetWidth; hero.innerHTML = heroHTML(GAMES[i]); if (!reduced()) hero.classList.add('swap'); }
  setBackground(GAMES[i]);
  if (scroll) { const c = document.querySelectorAll('#carousel .cc')[i]; if (c) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }
}

function showHowTo(g) {
  openModal({ title: `How to play ${g.title}`, html: `<p><b>Goal.</b> ${esc(g.goal)}</p><h3>Controls</h3><ul class="plain">${g.controlsText.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${inputChips(g)}<h3>Tips</h3><ul class="plain">${g.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><div class="p-btns"><button type="button" class="btn primary" data-close>Got it</button></div>` });
}
function showGameAch(g) {
  const s = save();
  const list = forGame(g.id);
  openModal({ title: `${g.title} achievements`, wide: true, html: `<ul class="ach-list">${list.map((a) => achItem(a, s)).join('')}</ul>` });
}

function confirmReset() {
  const m = openModal({ title: 'Reset all saved data?', html: `<p>This clears every high score, best time, XP and achievement ${user ? 'on this device <b>and in your account</b>' : 'on this device'}. Your sound and motion settings stay.</p><div class="p-btns"><button type="button" class="btn primary" data-close>Keep my progress</button><button type="button" class="btn danger" id="do-reset">Reset everything</button></div>` });
  m.card.querySelector('#do-reset').addEventListener('click', async () => {
    store.resetAll();
    if (user) await cloud.syncNow().catch(() => {});
    m.close(); applyTheme(); renderAccount(); render({ instant: true });
    toast({ icon: '🧹', title: 'Saved data cleared', color: '#2de2e6' });
  });
}

async function doSignOut() {
  closeAcctMenu();
  await auth.signOut();
}

function runMigration(guestSave, viaSettings = false) {
  const summary = {
    xp: guestSave.profile.xp, achievements: Object.keys(guestSave.profile.achievements).length, gamesPlayed: guestSave.profile.stats.gamesPlayed,
    records: GAMES.reduce((n, g) => n + recordRows(g, guestSave).length, 0),
  };
  authUI.openMigration(summary, async (choice) => {
    const flag = `pocketArcade.migrated.${user.id}`;
    if (choice === 'transfer') {
      toast({ icon: '☁️', title: 'Transferring progress…', color: '#2de2e6', ms: 1800 });
      const ok = await cloud.syncNow({ extraMerge: (m) => store.mergeSaves(m, guestSave, 'migrate') });
      if (ok) {
        try { localStorage.setItem(flag, 'done'); localStorage.removeItem(store.GUEST_KEY); } catch (e) { /* ignore */ }
        toast({ icon: '✅', kicker: 'Done', title: 'Guest progress added to your account', color: '#5dff8f' });
      } else toast({ icon: '⚠️', title: 'Could not sync right now', text: 'Your progress is safe on this device. Try again in Settings.', color: '#ff8a3d', ms: 5000 });
    } else {
      try { localStorage.setItem(flag, 'skipped'); } catch (e) { /* ignore */ }
      await cloud.syncNow();
    }
    applyTheme(); renderAccount(); render({ instant: true });
  });
  void viaSettings;
}

let handledId = null;
async function handleUser(u, ev) {
  user = u;
  handledId = u ? u.id : null;
  if (u && !u.offline) {
    store.useNamespace(u.id);
    applyTheme(); renderAccount(); render({ instant: true });
    const guest = store.readGuestSave();
    let flag = null;
    try { flag = localStorage.getItem(`pocketArcade.migrated.${u.id}`); } catch (e) { /* ignore */ }
    if (store.hasProgress(guest) && !flag) { await cloud.syncNow(); runMigration(guest); }
    else await cloud.syncNow();
  } else if (u && u.offline) {
    store.useNamespace(u.id);
  } else if (ev === 'SIGNED_OUT') {
    store.purgeAccountCaches();
    store.useNamespace(null);
    toast({ icon: '👋', title: 'Logged out', text: 'Your progress is saved to your account.', color: '#2de2e6' });
  }
  applyTheme(); renderAccount(); render({ instant: true });
}

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
  const open = $('#acct-menu');
  if (open && !open.hidden && !e.target.closest('.nav-account')) closeAcctMenu();
  const navTab = e.target.closest('.nav-tab');
  if (navTab) { sfx.unlock(); go(navTab.dataset.route); return; }
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const act = t.dataset.action;
  const g = t.dataset.game ? gameById(t.dataset.game) : null;
  switch (act) {
    case 'play': if (g) launch(g); break;
    case 'open': if (g) { sfx.unlock(); sfx.play('click'); openGame(g); } break;
    case 'card': {
      const i = Number(t.dataset.idx);
      if (i !== sel) selectIdx(i, true);
      else if (e.detail !== 0 || e.pointerType) openGame(GAMES[i]);
      else openGame(GAMES[i]);
      break;
    }
    case 'filter': filter = t.dataset.cat; render({ instant: true }); { const c = view.querySelector('.chip.on'); if (c) c.focus(); } break;
    case 'ach-filter': achFilter = t.dataset.id; render({ instant: true }); { const c = view.querySelector('.chip.on'); if (c) c.focus(); } break;
    case 'howto': if (g) showHowTo(g); break;
    case 'game-ach': if (g) showGameAch(g); break;
    case 'back': history.length > 1 && prevRoute ? go(prevRoute) : go('library'); break;
    case 'go': closeAcctMenu(); go(t.dataset.route); break;
    case 'signin': authUI.openSignIn(); break;
    case 'signup': authUI.openSignUp(); break;
    case 'signout': await doSignOut(); break;
    case 'acct-menu': { const m = $('#acct-menu'); const willOpen = m.hidden; m.hidden = !willOpen; t.setAttribute('aria-expanded', String(willOpen)); if (willOpen) m.querySelector('button').focus(); break; }
    case 'nudge-dismiss': store.updateProfile((p) => { p.nudge.dismissedAt = Date.now(); p.nudge.lastShown = p.stats.gamesPlayed; }); render({ instant: true }); break;
    case 'set-sound': sfx.unlock(); store.setMuted(!store.isMuted()); t.classList.toggle('on', !store.isMuted()); t.setAttribute('aria-checked', String(!store.isMuted())); if (!store.isMuted()) sfx.play('click'); break;
    case 'set-motion': store.setSetting('reducedMotion', !reduced()); applyTheme(); t.classList.toggle('on', reduced()); t.setAttribute('aria-checked', String(reduced())); break;
    case 'set-quick': { const v = !save().settings.quickLaunch; store.setSetting('quickLaunch', v); t.classList.toggle('on', v); t.setAttribute('aria-checked', String(v)); break; }
    case 'cosmetic': {
      const kind = t.dataset.kind, id = t.dataset.id;
      store.updateProfile((p) => { p.cosmetics[kind] = id; });
      applyTheme(); renderAccount(); render({ instant: true });
      { const b = view.querySelector(`[data-kind="${kind}"][data-id="${id}"]`); if (b) b.focus(); }
      break;
    }
    case 'sync-now': t.disabled = true; await cloud.syncNow(); t.disabled = false; break;
    case 'transfer': runMigration(store.readGuestSave(), true); break;
    case 'change-pass': { const r = await auth.sendPasswordReset(user.email); toast(r.ok ? { icon: '📬', title: 'Reset email sent', text: user.email, color: '#5dff8f' } : { icon: '⚠️', title: r.error, color: '#ff8a3d' }); break; }
    case 'delete-cloud': {
      const m = openModal({ title: 'Delete cloud save?', html: '<p>This permanently deletes your synced progress from the server. Progress on this device is kept.</p><div class="p-btns"><button type="button" class="btn primary" data-close>Cancel</button><button type="button" class="btn danger" id="do-del">Delete</button></div>' });
      m.card.querySelector('#do-del').addEventListener('click', async () => { const r = await cloud.deleteCloudSave(); m.close(); toast({ icon: r.ok ? '🗑️' : '⚠️', title: r.ok ? 'Cloud save deleted' : r.error, color: r.ok ? '#2de2e6' : '#ff8a3d' }); });
      break;
    }
    case 'reset': confirmReset(); break;
    default: break;
  }
});

document.addEventListener('mouseover', (e) => { const c = e.target.closest('#carousel .cc'); if (c) selectIdx(Number(c.dataset.idx)); });
document.addEventListener('focusin', (e) => { const c = e.target.closest && e.target.closest('#carousel .cc'); if (c) selectIdx(Number(c.dataset.idx)); });
document.addEventListener('wheel', (e) => { const c = e.target.closest && e.target.closest('#carousel'); if (c && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { c.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

function goBack() {
  if (hasModal()) { closeTopModal(); return; }
  const m = $('#acct-menu');
  if (m && !m.hidden) { closeAcctMenu(); const b = $('#acct-btn'); if (b) b.focus(); return; }
  if (route.name === 'game') go(prevRoute && prevRoute !== 'game' ? prevRoute : 'library');
  else if (route.name !== 'home') go('home');
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (hasModal()) return; // the modal handles it
    e.preventDefault(); goBack(); return;
  }
  if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
  if (isTyping(e.target)) return;
  const dir = e.key.slice(5).toLowerCase();
  const tm = topModal();
  e.preventDefault();
  if (tm) { moveFocus(tm.card, dir); return; }
  const menu = $('#acct-menu');
  if (menu && !menu.hidden) { moveFocus(menu, dir); return; }
  moveFocus(document.body, dir);
});

// controller
gp.initGamepad();
gp.startMenuNav((d) => {
  if (['up', 'down', 'left', 'right'].includes(d)) {
    const tm = topModal();
    if (tm) moveFocus(tm.card, d); else moveFocus(document.body, d);
  } else if (d === 'select') { const el = document.activeElement; if (el && el !== document.body) el.click(); }
  else if (d === 'back') goBack();
  else if (d === 'start' && route.name === 'home' && !hasModal()) launch(GAMES[sel]);
});
gp.onConnectionChange((c) => {
  const el = $('#pad-indicator'); if (el) el.hidden = !c;
  const st = $('#pad-state'); if (st) st.textContent = c ? 'Controller connected: D-pad navigates, A selects, B goes back.' : 'No controller detected. Connect one and press any button.';
});

store.subscribe(() => { /* keep header chip in sync with cosmetic changes */ });
cloud.onStatus((s) => {
  syncLabel = s.state === 'ok' ? `Synced ${new Date(s.last).toLocaleTimeString()}` : s.state === 'syncing' ? 'Syncing…' : s.state === 'offline' ? 'Offline: will sync when you reconnect' : s.state === 'error' ? 'Sync problem: retrying' : '';
  const el = $('#sync-state'); if (el && syncLabel) el.textContent = syncLabel;
});
window.addEventListener('pageshow', (e) => { if (e.persisted) { store.load(); applyTheme(); render({ instant: true }); } });

// ------------------------------------------------------------------ boot
async function boot() {
  const peek = peekUser();
  if (peek) { user = { id: peek.id, email: peek.email || '', name: peek.name || 'Player', provider: 'email', createdAt: 0, offline: false }; store.useNamespace(peek.id); }
  makeParticles();
  applyTheme();
  route = parseRoute();
  renderAccount();
  render({ instant: true });
  if (!isConfigured()) { try { sessionStorage.setItem('pa.unconfigured', '1'); } catch (e) { /* ignore */ } }
  if (isConfigured()) {
    auth.onAuthChange((ev, u) => {
      if (ev === 'PASSWORD_RECOVERY') { user = u; authUI.openSetNewPassword(); return; }
      if (ev === 'SIGNED_IN' && u && handledId === u.id) return; // token refresh / tab focus: nothing new
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') handleUser(u, ev);
    });
    const u = await auth.init();
    await handleUser(u, 'INITIAL');
    // first visit: let people choose guest vs account
    let seen = null;
    try { seen = localStorage.getItem('pocketArcade.welcomed'); } catch (e) { /* ignore */ }
    if (!u && !seen && !hasModal()) { try { localStorage.setItem('pocketArcade.welcomed', '1'); } catch (e) { /* ignore */ } authUI.openWelcome(); }
  }
  window.__arcade = { go, render, get user() { return user; }, GAMES };
}
boot();
