// Reusable multiplayer lobby UI: menu (Quick Play / Create / Join / Local / Bots), match setup and the room
// lobby (code, players, ready, host controls). Any game can use it by declaring `multiplayer` in games.js and
// passing a settings schema; the game itself only implements onStart(match).
import { Room, normalizeCode, isValidCode, ROOM_ERRORS } from './rooms.js';
import { onlineAvailable, identity, getDisplayName, setDisplayName, sanitizeName, stateLabel, LINK, NAME_MAX } from './multiplayer.js';
import { avatarHTML } from './profile.js';
import { esc } from './ui.js';
import { moveFocus, isTyping } from './nav.js';
import * as gp from './gamepad.js';
import * as presence from './presence.js';
import { sfx } from './audio.js';

const STATUS_ICON = { l: '🟡 IN LOBBY', g: '🎮 IN GAME', away: '⚫ OFFLINE' };

export function createLobby(cfg) {
  const { game, schema, defaults } = cfg;
  const mp = game.mp;
  const el = document.createElement('div');
  el.className = 'lb';
  el.hidden = true;
  el.style.setProperty('--accent', game.accent || '#2de2e6');
  el.innerHTML = '<div class="lb-card" role="dialog" aria-modal="true" aria-labelledby="lb-title" tabindex="-1"></div>';
  document.body.appendChild(el);
  const card = el.firstElementChild;

  const S = { screen: 'menu', settings: { ...defaults }, humans: 2, room: null, busy: '', error: '', info: '', code: '', countdown: null, offs: [] };
  let stopNav = null, autoTimer = 0, tickTimer = 0;

  const isOpen = () => !el.hidden;
  const settingsOf = () => (S.room ? S.room.settings : S.settings);

  // ------------------------------------------------------------------ rendering helpers
  const chipGroup = (def, value, editable) => `<div class="lb-field"><span class="lb-label">${esc(def.label)}</span>
    <div class="lb-chips" role="radiogroup" aria-label="${esc(def.label)}">${(def.type === 'toggle' ? [{ v: true, label: 'On' }, { v: false, label: 'Off' }] : def.options).map((o) =>
      `<button type="button" class="lb-chip" role="radio" aria-checked="${o.v === value}" ${editable ? '' : 'disabled'} data-lb="set" data-key="${esc(def.key)}" data-val="${esc(JSON.stringify(o.v))}">${esc(o.label)}</button>`).join('')}</div>
    ${def.hint ? `<small class="lb-hint">${esc(typeof def.hint === 'function' ? def.hint(value) : def.hint)}</small>` : ''}</div>`;

  const settingsForm = (values, editable) => schema.filter((d) => !d.when || d.when(values)).map((d) => chipGroup(d, values[d.key], editable)).join('');

  const nameBox = () => `<div class="lb-name"><label for="lb-name-in" class="lb-label">Your name</label>
    <div class="lb-name-row"><input id="lb-name-in" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" value="${esc(getDisplayName())}" aria-describedby="lb-name-hint"><button type="button" class="g-btn" data-lb="save-name">Save</button></div>
    <small id="lb-name-hint" class="lb-hint">Shown to other players. Letters, numbers and emoji; up to ${NAME_MAX} characters.</small></div>`;

  const banner = () => (S.error ? `<p class="lb-msg err" role="alert">${esc(S.error)}</p>` : S.info ? `<p class="lb-msg" role="status">${esc(S.info)}</p>` : '');

  function menuHTML() {
    const online = onlineAvailable() && mp.online;
    const btn = (act, title, sub, primary) => `<button type="button" class="lb-opt${primary ? ' primary' : ''}" data-lb="${act}"${S.busy ? ' disabled' : ''}><b>${title}</b><small>${sub}</small></button>`;
    return `<h2 id="lb-title">Play ${esc(game.title)}</h2>
      <p class="lb-sub">${esc(game.players || `${mp.minPlayers}–${mp.maxPlayers} players`)}</p>
      ${banner()}
      <div class="lb-opts">
        ${online ? btn('quick', 'QUICK PLAY', 'Find a public match', true) : ''}
        ${online ? btn('create', 'CREATE ROOM', 'Private room with a code') : ''}
        ${online ? `<div class="lb-join"><label for="lb-code" class="lb-label">JOIN ROOM</label><div class="lb-name-row"><input id="lb-code" class="code" maxlength="5" placeholder="K7P4Q" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(S.code)}" aria-label="Room code"><button type="button" class="g-btn primary" data-lb="join"${S.busy ? ' disabled' : ''}>Join</button></div></div>` : ''}
        ${mp.local ? btn('local', 'LOCAL PLAY', 'Same device · up to ' + (cfg.localMax || 4) + ' players') : ''}
        ${mp.bots ? btn('bots', 'PLAY WITH BOTS', 'Start right away', !online) : ''}
      </div>
      ${online ? '' : `<p class="lb-note">🌐 Online play isn’t set up on this copy of Pocket Arcade${onlineAvailable() ? '' : ' (see README → Multiplayer Setup)'}. Local play and bots work everywhere.</p>`}
      ${online ? nameBox() : ''}
      <div class="lb-btns"><a class="g-btn" href="../../index.html#/multiplayer">Arcade</a></div>`;
  }

  function setupHTML() {
    const local = S.screen === 'local';
    const humansDef = { key: 'humans', label: 'Players on this device', type: 'select', options: Array.from({ length: (cfg.localMax || 4) - 1 }, (_, i) => ({ v: i + 2, label: String(i + 2) })) };
    const values = { ...S.settings, humans: S.humans };
    return `<h2 id="lb-title">${local ? 'Local Play' : 'Play with Bots'}</h2>
      ${banner()}
      ${local ? chipGroup(humansDef, S.humans, true) + `<p class="lb-note">${esc(cfg.localHelp || 'Player 1: WASD · Player 2: arrow keys. Extra players use game controllers.')}</p>` : ''}
      ${settingsForm(values, true)}
      <div class="lb-btns"><button type="button" class="g-btn primary big" data-lb="go-offline">START</button><button type="button" class="g-btn" data-lb="menu">Back</button></div>`;
  }

  function roomHTML() {
    const r = S.room;
    const list = r.list;
    const rows = [];
    for (let i = 0; i < r.max; i++) {
      const m = list[i];
      if (!m) { rows.push(`<li class="lb-row empty"><span class="lb-num">${i + 1}</span><span class="lb-wait">Waiting…</span></li>`); continue; }
      const st = m.host ? 'READY' : m.rd ? 'READY' : 'NOT READY';
      rows.push(`<li class="lb-row${m.me ? ' me' : ''}"><span class="lb-num">${i + 1}</span>${avatarHTML({ name: m.name, avatar: m.av, border: m.bd, size: 32 })}
        <span class="lb-who"><b>${esc(m.name)}</b>${m.host ? ' <i class="lb-host">HOST</i>' : ''}${m.me ? ' <i class="lb-you">YOU</i>' : ''}<small>Level ${m.lv} · ${STATUS_ICON[m.ph] || ''}</small></span>
        <span class="lb-ready ${m.host || m.rd ? 'yes' : 'no'}">${st}</span></li>`);
    }
    const connected = r.state === LINK.CONNECTED;
    const everyoneReady = list.filter((m) => !m.host).every((m) => m.rd);
    const notReady = list.filter((m) => !m.host && !m.rd).length;
    const canStart = r.isHost && connected && list.length >= 1;
    const cd = S.countdown !== null ? `<p class="lb-msg" role="status">Public match starting in <b>${S.countdown}</b>…</p>` : '';
    return `<h2 id="lb-title">Your Room</h2>
      <div class="lb-conn ${esc(r.state)}" role="status" aria-live="polite">${stateLabel(r.state)}</div>
      <div class="lb-code"><span class="lb-label">Room Code</span><b id="lb-code-text" aria-label="Room code ${esc(r.code.split('').join(' '))}">${esc(r.code)}</b>
        <div class="lb-row-btns"><button type="button" class="g-btn" data-lb="copy">Copy room code</button><button type="button" class="g-btn" data-lb="invite">Invite link</button></div>
        <small class="lb-hint">${r.pub ? 'Public room: anyone using Quick Play can join.' : 'Private room: only people with this code can join.'}</small></div>
      ${banner()}${cd}
      <h3 class="lb-h3">Players (${list.length}/${r.max})</h3>
      <ol class="lb-list">${rows.join('')}</ol>
      ${r.isHost ? `<div class="lb-host-box"><h3 class="lb-h3">Host controls</h3>${settingsForm(r.settings, true)}</div>`
        : `<div class="lb-host-box ro"><h3 class="lb-h3">Match settings</h3>${settingsForm(r.settings, false)}<small class="lb-hint">Only the host can change these.</small></div>`}
      <div class="lb-btns">
        ${r.isHost ? `<button type="button" class="g-btn primary big" data-lb="start"${canStart ? '' : ' disabled'}>${notReady ? `START ANYWAY (${notReady} not ready)` : 'START MATCH'}</button>`
          : `<button type="button" class="g-btn primary big" data-lb="ready" aria-pressed="${r.ready}">${r.ready ? 'READY ✓ (tap to cancel)' : 'READY'}</button>`}
        <button type="button" class="g-btn" data-lb="leave">Leave room</button>
      </div>
      ${r.isHost ? (everyoneReady ? '' : '<small class="lb-hint">Players who aren’t ready will still be included if you start.</small>') : '<small class="lb-hint">Waiting for the host to start the match…</small>'}`;
  }

  function busyHTML() {
    return `<h2 id="lb-title">${esc(S.busy)}</h2><div class="lb-spin" aria-hidden="true"></div><div class="lb-btns"><button type="button" class="g-btn" data-lb="cancel">Cancel</button></div>`;
  }

  function render() {
    if (!isOpen()) return;
    const active = document.activeElement;
    const keep = active && card.contains(active) ? (active.dataset.lb ? `[data-lb="${active.dataset.lb}"]${active.dataset.key ? `[data-key="${active.dataset.key}"][data-val='${active.dataset.val}']` : ''}` : active.id ? '#' + active.id : null) : null;
    const typing = active && isTyping(active) ? { id: active.id, v: active.value, s: active.selectionStart } : null;
    card.innerHTML = S.busy ? busyHTML() : S.screen === 'room' && S.room ? roomHTML() : S.screen === 'bots' || S.screen === 'local' ? setupHTML() : menuHTML();
    if (typing && typing.id) { const i = card.querySelector('#' + typing.id); if (i) { i.value = typing.v; i.focus(); try { i.setSelectionRange(typing.s, typing.s); } catch (e) { /* ignore */ } return; } }
    let target = keep ? card.querySelector(keep) : null;
    if (!target) target = card.querySelector('.primary:not(:disabled), button:not(:disabled), input');
    if (target) target.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ flows
  function show(screen) { S.screen = screen; S.error = ''; el.hidden = false; render(); startNav(); }
  function fail(e) { S.busy = ''; S.error = (e && e.message) || 'Something went wrong.'; S.screen = 'menu'; render(); }

  async function connectFlow(label, make) {
    S.busy = label; S.error = ''; render();
    const token = Symbol();
    S.token = token;
    try {
      const room = await make();
      if (S.token !== token) { try { await room.leave(); } catch (e) { /* ignore */ } return; }
      S.busy = ''; attachRoom(room);
    } catch (e) { if (S.token === token) fail(e); }
  }

  function attachRoom(room) {
    detachRoom();
    S.room = room; S.screen = 'room'; S.error = ''; S.info = ''; S.countdown = null;
    const re = () => { render(); updateAuto(); };
    S.offs = [
      room.on('members', re), room.on('settings', re), room.on('state', re), room.on('phase', re),
      room.on('hostchange', (h) => { S.info = h.me ? 'The host left. You’re now the host.' : `${h.host ? h.host.name : 'Someone'} is now the host.`; re(); }),
      room.on('left', (l) => { if (l.member && S.screen === 'room') { S.info = `${l.member.name} ${l.graceful ? 'left the room' : 'disconnected'}.`; render(); } }),
      room.on('closed', (c) => {
        S.room = null; detachRoom(); stopAuto();
        if (cfg.onRoomClosed) cfg.onRoomClosed(c);
        if (c.reason === 'connection') { S.error = 'Connection lost and couldn’t be restored. Check your network and try again.'; show('menu'); }
        else if (isOpen()) { S.screen = 'menu'; render(); }
      }),
      room.onMsg('start', (d) => {
        if (!d || typeof d.id !== 'string' || !Array.isArray(d.roster) || d.roster.length > 16) return;
        if (room.phase === 'playing' && room.matchId === d.id) return;
        room.matchId = d.id;
        room.enterMatch();
        launchOnline(room, d);
      }, { hostOnly: true }),
    ];
    presence.setStatus('lobby');
    show('room');
  }
  function detachRoom() { S.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); S.offs = []; }

  function launchOnline(room, d) {
    stopAuto();
    hide();
    presence.setStatus('game');
    cfg.onStart({ kind: 'online', room, matchId: d.id, roster: d.roster, settings: d.s || room.settings, extra: d.x || null, isHost: room.isHost });
  }

  // public rooms start themselves shortly after a second player arrives
  function updateAuto() {
    const r = S.room;
    const want = r && r.isHost && r.pub && r.phase === 'lobby' && r.count >= 2 && r.state === LINK.CONNECTED && isOpen();
    if (want && !autoTimer) {
      S.countdown = 15;
      autoTimer = setInterval(() => {
        if (!S.room || !S.room.isHost || S.room.count < 2) { stopAuto(); render(); return; }
        S.countdown -= 1;
        if (S.countdown <= 0) { stopAuto(); doStart(); return; }
        render();
      }, 1000);
    } else if (!want && autoTimer) { stopAuto(); render(); }
  }
  function stopAuto() { clearInterval(autoTimer); autoTimer = 0; S.countdown = null; }

  async function doStart() {
    const r = S.room;
    if (!r || !r.isHost) return;
    stopAuto();
    const info = await r.start(cfg.hostExtra ? cfg.hostExtra(r) : null);
    if (!info) return;
    r.matchId = info.id;
    launchOnline(r, { id: info.id, roster: info.roster, s: info.settings, x: info.extra });
  }

  async function leaveRoom() {
    const r = S.room;
    S.room = null; detachRoom(); stopAuto();
    if (r) { try { await r.leave(); } catch (e) { /* ignore */ } }
    presence.setStatus('online');
    S.info = ''; show('menu');
  }

  const onlineOpts = () => ({ game: game.id, mp, schema, defaults, settings: S.settings });

  const actions = {
    quick: () => connectFlow('Finding a match…', () => Room.quick(onlineOpts())),
    create: () => connectFlow('Creating your room…', () => Room.create(onlineOpts())),
    join: () => {
      const input = card.querySelector('#lb-code');
      const code = normalizeCode(input ? input.value : S.code);
      S.code = code;
      if (!isValidCode(code)) { S.error = ROOM_ERRORS.bad_code; render(); return; }
      connectFlow('Joining ' + code + '…', () => Room.join(onlineOpts(), code));
    },
    local: () => show('local'),
    bots: () => show('bots'),
    menu: () => show('menu'),
    cancel: () => { S.token = null; S.busy = ''; show('menu'); },
    'go-offline': () => {
      const kind = S.screen === 'local' ? 'local' : 'bots';
      hide();
      cfg.onStart({ kind, settings: { ...S.settings }, humans: kind === 'local' ? S.humans : 1 });
    },
    start: () => doStart(),
    ready: async () => { await S.room.setReady(!S.room.ready); render(); },
    leave: () => leaveRoom(),
    copy: async () => { const ok = await copyText(S.room.code); S.info = ok ? 'Room code copied.' : 'Copy failed — select the code and copy it manually.'; render(); },
    invite: async () => {
      const url = S.room.inviteUrl();
      const text = `Join my ${game.title} room: ${S.room.code}`;
      try { if (navigator.share) { await navigator.share({ title: game.title, text, url }); return; } } catch (e) { /* cancelled */ }
      const ok = await copyText(`${text} ${url}`);
      S.info = ok ? 'Invite link copied.' : 'Copy failed.'; render();
    },
    'save-name': () => {
      const v = sanitizeName(card.querySelector('#lb-name-in').value);
      if (!v) { S.error = 'Please enter a name.'; render(); return; }
      setDisplayName(v); S.info = 'Name saved.'; S.error = '';
      if (S.room) S.room._announce();
      render();
    },
  };

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fallback */ }
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }

  card.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lb]');
    if (!t || t.disabled) return;
    sfx.unlock(); sfx.play('click');
    const a = t.dataset.lb;
    if (a === 'set') {
      let val; try { val = JSON.parse(t.dataset.val); } catch (er) { return; }
      const key = t.dataset.key;
      if (key === 'humans') { S.humans = val; render(); return; }
      if (S.room) { if (S.room.isHost) S.room.setSettings({ [key]: val }); return; }
      S.settings = { ...S.settings, [key]: val };
      render();
      return;
    }
    if (actions[a]) actions[a]();
  });
  card.addEventListener('input', (e) => { if (e.target.id === 'lb-code') { const v = normalizeCode(e.target.value); e.target.value = v; S.code = v; } });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'lb-code') { e.preventDefault(); actions.join(); }
    if (e.key === 'Enter' && e.target.id === 'lb-name-in') { e.preventDefault(); actions['save-name'](); }
  });

  function back() {
    if (S.busy) return actions.cancel();
    if (S.screen === 'room') return leaveRoom();
    if (S.screen === 'bots' || S.screen === 'local') return show('menu');
    location.href = '../../index.html#/multiplayer';
  }
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back(); return; }
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key) || isTyping(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    moveFocus(card, e.key.slice(5).toLowerCase());
  }, true);

  function startNav() {
    if (stopNav) return;
    stopNav = gp.startMenuNav((d) => {
      if (!isOpen()) return;
      if (d === 'select') { const a = document.activeElement; if (a && card.contains(a)) a.click(); }
      else if (d === 'back') back();
      else if (['up', 'down', 'left', 'right'].includes(d)) moveFocus(card, d);
    });
  }
  function hide() { el.hidden = true; }

  // ------------------------------------------------------------------ public API
  return {
    el,
    isOpen,
    close: hide,
    openMenu(info) { S.info = info || ''; show('menu'); },
    /** Open from a URL: ?mp=quick|create|join|local|bots[&code=K7P4Q] */
    openFromUrl(params) {
      const mode = params.get('mp'), code = normalizeCode(params.get('code'));
      if (code) S.code = code;
      if (mode === 'quick' && mp.online) { show('menu'); actions.quick(); }
      else if (mode === 'create' && mp.online) { show('menu'); actions.create(); }
      else if (mode === 'join' && mp.online) { show('menu'); if (isValidCode(code)) actions.join(); }
      else if (mode === 'local' && mp.local) show('local');
      else if (mode === 'bots' && mp.bots) show('bots');
      else show('menu');
    },
    /** Return to the room lobby after an online match. */
    async backToRoom(room, { ready = false } = {}) {
      await room.backToLobby({ ready });
      attachRoom(room);
    },
    settings: () => ({ ...S.settings }),
    setSettings(p) { S.settings = { ...S.settings, ...p }; },
    showSetup(kind) { show(kind); },
    get room() { return S.room; },
  };
}
