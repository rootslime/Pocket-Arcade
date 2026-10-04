// Shared game shell: page chrome, overlays (start / pause / game over), HUD,
// canvas scaling, fixed-step loop, pause/restart/mute, touch controls and save hooks.
// Each game supplies a config + callbacks; everything else lives here.
import * as store from './storage.js';
import { sfx } from './audio.js';
import { Input, bindTouchButton } from './input.js';
import { formatTime, formatScore } from './util.js';

const ICON = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a2.9 2.9 0 1 1 4.3 2.5c-1 .6-1.5 1.1-1.5 2.3M12 17.5v.1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createShell(cfg) {
  const root = document.getElementById('app');
  const hudItems = [...(cfg.hud || [])];
  const bestCfg = cfg.best || null;
  const fmtBest = (v) => {
    if (bestCfg && bestCfg.format) return bestCfg.format(v);
    return v === null || v === undefined ? '--' : formatScore(v);
  };

  document.documentElement.style.setProperty('--accent', cfg.accent || '#2de2e6');
  document.title = `${cfg.title} · Pocket Arcade`;

  root.innerHTML = `
  <div class="game-app" data-state="ready">
    <header class="g-top">
      <a class="g-btn g-back" href="../../index.html" aria-label="Return to Arcade"><span aria-hidden="true">‹</span><span class="g-back-text">Arcade</span></a>
      <h1 class="g-title">${esc(cfg.title)}</h1>
      <div class="g-actions">
        <button class="g-btn g-icon" id="g-pad" type="button" aria-label="Toggle on-screen D-pad" aria-pressed="false" hidden>${ICON.pad}</button>
        <button class="g-btn g-icon" id="g-help" type="button" aria-label="How to play">${ICON.help}</button>
        <button class="g-btn g-icon" id="g-pause" type="button" aria-label="Pause">${ICON.pause}</button>
        <button class="g-btn g-icon" id="g-mute" type="button" aria-label="Mute sound" aria-pressed="false">${ICON.on}</button>
      </div>
      <div class="g-hud" id="g-hud" aria-live="off">
        ${hudItems.map((h) => `<div class="hud-item"><span class="hud-label">${esc(h.label)}</span><span class="hud-val" id="hud-${h.id}">${esc(h.init ?? '0')}</span></div>`).join('')}
        ${bestCfg ? `<div class="hud-item hud-best"><span class="hud-label">${esc(bestCfg.label || 'BEST')}</span><span class="hud-val" id="hud-best">--</span></div>` : ''}
      </div>
    </header>
    <main class="g-stage" id="g-stage"><canvas id="g-canvas" tabindex="-1" aria-label="${esc(cfg.title)} game area"></canvas></main>
    <div class="g-touch" id="g-touch" hidden></div>
    <div class="g-overlay" id="g-overlay" hidden><div class="g-panel" id="g-panel" role="dialog" aria-modal="true"></div></div>
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const app = root.querySelector('.game-app');
  const stage = $('g-stage'), canvas = $('g-canvas'), overlay = $('g-overlay'), panel = $('g-panel');
  const touchBar = $('g-touch');
  const ctx = canvas.getContext('2d', { alpha: false });
  const input = new Input(cfg.keys || {});
  input.active = false;

  const shell = {
    id: cfg.id, canvas, ctx, input, sfx, store,
    W: 0, H: 0, state: 'ready', mode: null, timeScale: 1,
    reduced: store.prefersReducedMotion(),
    lowFx: false, isTouch: false,
  };

  // ---------- touch / device detection ----------
  const setTouch = () => {
    if (shell.isTouch) return;
    shell.isTouch = true;
    document.body.classList.add('has-touch');
    syncTouchBar();
  };
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) shell.isTouch = true;
  window.addEventListener('touchstart', setTouch, { passive: true, once: true });
  if (shell.isTouch) document.body.classList.add('has-touch');

  // ---------- touch controls ----------
  const optionalTouch = !!(cfg.touch && cfg.touch.optional);
  function buildTouch() {
    const t = cfg.touch;
    if (!t) return;
    const group = (list, cls) => `<div class="t-cluster ${cls || ''}">${list.map((b) =>
      `<button type="button" class="t-btn ${b.cls || ''}" data-action="${b.action}" aria-label="${esc(b.aria || b.label)}" style="${b.area ? 'grid-area:' + b.area : ''}">${b.label}</button>`).join('')}</div>`;
    touchBar.innerHTML = group(t.left || [], t.leftClass) + group(t.right || [], t.rightClass);
    touchBar.querySelectorAll('.t-btn').forEach((b) => bindTouchButton(b, input, b.dataset.action, () => sfx.unlock()));
  }
  function syncTouchBar() {
    const pad = $('g-pad');
    const has = !!cfg.touch;
    pad.hidden = !(has && optionalTouch && shell.isTouch);
    const on = has && shell.isTouch && (!optionalTouch || store.getSetting('touchPad'));
    touchBar.hidden = !on;
    app.classList.toggle('with-touch', !!on);
    pad.setAttribute('aria-pressed', String(!!store.getSetting('touchPad')));
    pad.classList.toggle('is-on', !!store.getSetting('touchPad'));
    requestAnimationFrame(resize);
  }
  buildTouch();
  $('g-pad').addEventListener('click', () => { store.setSetting('touchPad', !store.getSetting('touchPad')); syncTouchBar(); });

  // ---------- HUD ----------
  const hudCache = {};
  shell.hud = (id, text) => {
    text = String(text);
    if (hudCache[id] === text) return;
    hudCache[id] = text;
    const el = $('hud-' + id);
    if (el) el.textContent = text;
  };
  const bestField = () => (typeof bestCfg.field === 'function' ? bestCfg.field(shell.mode) : bestCfg.field);
  shell.bestValue = () => {
    if (!bestCfg) return null;
    const v = store.getGame(cfg.id)[bestField()];
    return v === undefined ? null : v;
  };
  shell.refreshBest = () => {
    if (!bestCfg) return;
    const v = shell.bestValue();
    shell.hud('best', bestCfg.kind === 'low' ? (v ? fmtBest(v) : '--') : fmtBest(v || 0));
  };

  // ---------- audio / motion toggles ----------
  const muteBtn = $('g-mute');
  function syncMute() {
    const m = store.isMuted();
    muteBtn.innerHTML = m ? ICON.off : ICON.on;
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    const pm = panel.querySelector('[data-act="mute"]');
    if (pm) pm.textContent = m ? 'Sound: OFF' : 'Sound: ON';
  }
  function toggleMute() {
    sfx.unlock();
    store.setMuted(!store.isMuted());
    syncMute();
    if (!store.isMuted()) sfx.play('click');
  }
  muteBtn.addEventListener('click', toggleMute);
  function toggleMotion() {
    store.setSetting('reducedMotion', !store.prefersReducedMotion());
    shell.reduced = store.prefersReducedMotion();
    if (cfg.onMotionChange) cfg.onMotionChange(shell.reduced);
    const pm = panel.querySelector('[data-act="motion"]');
    if (pm) pm.textContent = shell.reduced ? 'Reduced motion: ON' : 'Reduced motion: OFF';
  }

  // ---------- canvas sizing ----------
  let dpr = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    const sw = Math.max(50, r.width), sh = Math.max(50, r.height);
    const s = typeof cfg.size === 'function' ? cfg.size(sw / sh) : cfg.size;
    const scale = Math.min(sw / s.w, sh / s.h);
    const cw = Math.floor(s.w * scale), ch = Math.floor(s.h * scale);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    if (shell.W !== s.w || shell.H !== s.h) {
      shell.W = s.w; shell.H = s.h;
      if (cfg.resize) cfg.resize(s.w, s.h);
    }
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ---------- overlay panels ----------
  let panelName = null, prevPanel = null, overTimer = 0;
  const modes = cfg.modes || null;
  shell.mode = modes ? (store.getSetting('mode.' + cfg.id) || modes[0].id) : null;
  if (modes && !modes.some((m) => m.id === shell.mode)) shell.mode = modes[0].id;

  function instructionsHTML(buttonLabel, backable) {
    const ins = cfg.instructions || {};
    const rows = (ins.controls || []).map((c) => `<li><kbd>${esc(c[0])}</kbd><span>${esc(c[1])}</span></li>`).join('');
    const tips = (ins.tips || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const modeHTML = modes && !backable ? `
      <div class="mode-pick" role="radiogroup" aria-label="Game mode">${modes.map((m) =>
        `<button type="button" role="radio" class="mode-btn" data-mode="${m.id}" aria-checked="${m.id === shell.mode}"><strong>${esc(m.label)}</strong><small>${esc(m.desc)}</small></button>`).join('')}</div>` : '';
    return `
      <h2 id="g-panel-title">${esc(cfg.title)}</h2>
      <p class="p-goal"><b>GOAL</b> ${esc(ins.goal || '')}</p>
      ${modeHTML}
      <div class="p-cols">
        <div><h3>Controls</h3><ul class="p-keys">${rows}</ul>${ins.touch ? `<p class="p-touch"><b>Touch:</b> ${esc(ins.touch)}</p>` : ''}</div>
        ${tips ? `<div><h3>Good to know</h3><ul class="p-tips">${tips}</ul></div>` : ''}
      </div>
      <div class="p-btns">
        <button type="button" class="g-btn primary big" data-act="${backable ? 'back' : 'start'}">${buttonLabel}</button>
        ${backable ? '' : '<a class="g-btn" href="../../index.html">Return to Arcade</a>'}
      </div>`;
  }

  function pauseHTML() {
    return `
      <h2 id="g-panel-title">Paused</h2>
      <div class="p-menu">
        <button type="button" class="g-btn primary big" data-act="resume">Resume</button>
        <button type="button" class="g-btn" data-act="restart">Restart</button>
        <button type="button" class="g-btn" data-act="help">How to play</button>
        <button type="button" class="g-btn" data-act="mute">${store.isMuted() ? 'Sound: OFF' : 'Sound: ON'}</button>
        <button type="button" class="g-btn" data-act="motion">${shell.reduced ? 'Reduced motion: ON' : 'Reduced motion: OFF'}</button>
        <a class="g-btn" href="../../index.html">Return to Arcade</a>
      </div>`;
  }

  function overHTML(r) {
    const stats = (r.stats || []).map((s) => `<li><span>${esc(s[0])}</span><strong>${esc(s[1])}</strong></li>`).join('');
    const bestLine = r.result && r.result.isNew
      ? '<div class="p-newbest" role="status">★ NEW PERSONAL BEST ★</div>'
      : (r.bestText ? `<div class="p-prev">${esc(r.bestText)}</div>` : '');
    return `
      <h2 id="g-panel-title" class="${r.win ? 'is-win' : 'is-lose'}">${esc(r.title || (r.win ? 'Victory!' : 'Game Over'))}</h2>
      ${r.subtitle ? `<p class="p-sub">${esc(r.subtitle)}</p>` : ''}
      <div class="p-score" aria-label="Final result">${esc(r.scoreText)}</div>
      ${bestLine}
      ${stats ? `<ul class="p-stats">${stats}</ul>` : ''}
      <div class="p-btns">
        <button type="button" class="g-btn primary big" data-act="restart">Play Again</button>
        <a class="g-btn" href="../../index.html">Return to Arcade</a>
      </div>`;
  }

  function showPanel(name, html) {
    prevPanel = panelName;
    panelName = name;
    panel.innerHTML = html;
    panel.setAttribute('aria-labelledby', 'g-panel-title');
    overlay.hidden = false;
    overlay.scrollTop = 0;
    const f = panel.querySelector('.primary') || panel.querySelector('button, a');
    if (f) f.focus({ preventScroll: true });
  }
  function hidePanel() {
    overlay.hidden = true;
    panelName = null;
    panel.innerHTML = '';
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  panel.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('.mode-btn');
    if (modeBtn) {
      shell.mode = modeBtn.dataset.mode;
      store.setSetting('mode.' + cfg.id, shell.mode);
      panel.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-checked', String(b === modeBtn)));
      sfx.unlock(); sfx.play('click');
      shell.refreshBest();
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    sfx.unlock();
    sfx.play('click');
    switch (b.dataset.act) {
      case 'start': case 'restart': startRun(); break;
      case 'resume': resume(); break;
      case 'mute': toggleMute(); break;
      case 'motion': toggleMotion(); break;
      case 'help': showPanel('help', instructionsHTML('Back', true)); break;
      case 'back': showPanel(prevPanel === 'help' ? 'pause' : prevPanel || 'pause', prevPanelHTML()); break;
      default: break;
    }
  });
  function prevPanelHTML() {
    return shell.state === 'over' && lastResult ? overHTML(lastResult) : pauseHTML();
  }
  // keep the Tab key inside the dialog
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button, a[href]')].filter((n) => !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- state machine ----------
  let lastResult = null;
  function setState(s) {
    shell.state = s;
    app.dataset.state = s;
    input.active = s === 'playing';
    if (s !== 'playing') input.clear();
    $('g-pause').disabled = s !== 'playing';
  }

  function startRun() {
    clearTimeout(overTimer);
    hidePanel();
    lastResult = null;
    shell.timeScale = 1;
    shell.hitStopT = 0;
    input.clear();
    for (const k of Object.keys(hudCache)) delete hudCache[k];
    cfg.reset(shell.mode);
    shell.refreshBest();
    setState('playing');
    resetClock();
    canvas.focus({ preventScroll: true });
  }
  shell.restart = startRun;

  function pause() {
    if (shell.state !== 'playing') return;
    setState('paused');
    if (cfg.onPause) cfg.onPause();
    showPanel('pause', pauseHTML());
  }
  function resume() {
    if (shell.state !== 'paused') return;
    hidePanel();
    setState('playing');
    resetClock();
    if (cfg.onResume) cfg.onResume();
  }
  shell.pause = pause;
  shell.resume = resume;

  /**
   * End the run. r: { win, title, subtitle, score (number to submit), scoreKind, field,
   *   scoreText, stats:[[label,val]], extras:{field:value} }
   */
  shell.finish = (r) => {
    if (shell.state === 'over') return;
    r.result = null;
    if (bestCfg && typeof r.score === 'number') {
      r.result = store.submit(cfg.id, bestField(), r.score, bestCfg.kind || 'high');
    }
    if (r.extras) for (const k of Object.keys(r.extras)) store.submit(cfg.id, k, r.extras[k], 'high');
    if (r.result && !r.result.isNew && r.result.best) r.bestText = `Best: ${fmtBest(r.result.best)}`;
    r.scoreText = r.scoreText ?? (bestCfg ? fmtBest(r.score) : String(r.score));
    if (r.result && r.result.isNew && r.result.prev && bestCfg) r.bestText = `Previous best: ${fmtBest(r.result.prev)}`;
    lastResult = r;
    setState('over');
    shell.refreshBest();
    sfx.play(r.win ? 'victory' : 'gameover');
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (shell.state === 'over') showPanel('over', overHTML(r));
    }, r.delay ?? (r.win ? 500 : 750));
  };

  // ---------- buttons / keys ----------
  $('g-pause').addEventListener('click', () => { sfx.unlock(); pause(); });
  $('g-help').addEventListener('click', () => {
    sfx.unlock();
    if (shell.state === 'playing') pause();
    if (shell.state === 'ready') return;
    showPanel('help', instructionsHTML('Back', true));
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (shell.state === 'playing') { e.preventDefault(); pause(); }
      else if (shell.state === 'paused') {
        e.preventDefault();
        if (panelName === 'help') showPanel('pause', pauseHTML()); else resume();
      }
    } else if (e.code === 'KeyM' && !e.repeat) {
      toggleMute();
    } else if (e.code === 'KeyR' && !e.repeat) {
      if (shell.state === 'paused' || shell.state === 'over' || (shell.state === 'playing' && cfg.quickRestart)) {
        e.preventDefault(); sfx.unlock(); startRun();
      }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => { if (shell.state === 'playing' && !shell.isTouch) pause(); });
  window.addEventListener('pagehide', () => pause());
  store.subscribe(syncMute);
  // block page scroll / pull-to-refresh / pinch inside the game surface
  for (const el of [stage, touchBar]) {
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.g-stage, .g-touch')) e.preventDefault(); });

  // ---------- main loop ----------
  let last = 0, slowAcc = 0, slowN = 0;
  function resetClock() { last = 0; }
  shell.hitStopT = 0;
  shell.hitStop = (sec) => { if (!shell.reduced) shell.hitStopT = Math.max(shell.hitStopT, sec); };
  const MAX_STEP = 1 / 60;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    let dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    if (shell.state === 'playing') {
      // adaptive quality: measure raw frame time while playing
      slowAcc += dt; slowN++;
      if (slowN >= 120) {
        const avg = slowAcc / slowN;
        if (!shell.lowFx && avg > 1 / 38) { shell.lowFx = true; if (cfg.onLowFx) cfg.onLowFx(); }
        slowAcc = 0; slowN = 0;
      }
      let sdt = dt;
      if (shell.hitStopT > 0) { shell.hitStopT -= dt; sdt = 0; }
      sdt = Math.min(sdt, 0.05) * shell.timeScale;
      const steps = Math.max(1, Math.ceil(sdt / MAX_STEP - 1e-6));
      if (sdt > 0) {
        for (let i = 0; i < steps && shell.state === 'playing'; i++) {
          cfg.update(sdt / steps);
          input.endStep();
        }
      }
    } else if (shell.state === 'over' && cfg.ambient) {
      cfg.ambient(Math.min(dt, 0.05));
    }
    ctx.setTransform(canvas.width / shell.W, 0, 0, canvas.height / shell.H, 0, 0);
    cfg.render(ctx, shell.W, shell.H);
  }

  // ---------- boot ----------
  // Deferred one microtask so the game module can finish assigning `shell` before init/reset run.
  Promise.resolve().then(() => {
    resize();
    syncMute();
    syncTouchBar();
    shell.refreshBest();
    if (cfg.init) cfg.init(shell);
    cfg.reset(shell.mode); // so the start screen has a live backdrop
    setState('ready');
    showPanel('start', instructionsHTML('START GAME', false));
    requestAnimationFrame(frame);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) shell.refreshBest(); });
  return shell;
}

export { formatTime, formatScore };
