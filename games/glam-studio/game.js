// Glam Studio — themed makeover challenges (timed) and a relaxed creative mode with a look gallery.
import { createShell } from '../../js/shell.js';
import * as store from '../../js/storage.js';
import { formatScore, clamp, pick } from '../../js/util.js';
import { OPTIONS, COLORED, COLORS, TABS, SKINS, CHALLENGES, defaultLook, sanitizeLook, distinctColors } from './data.js';
import { lookSVG } from './look.js';

const ID = 'glamStudio';
const ROUNDS = 3;
const MAX_LOOKS = 6;
const G = { mode: 'challenge', look: defaultLook(), tab: 'hair', idx: 0, picked: [], time: 90, results: [], runScore: 0, wins: 0, over: false, bestTimeLeft: 0, bonusDone: false, colorWins: 0, timeShown: -1 };
let els = {};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = () => store.getGame(ID).challengesWon || 0;
const looks = () => (store.getBlob('gs_looks', []) || []).map(sanitizeLook).slice(0, MAX_LOOKS);
const unlockedCount = () => Object.entries(OPTIONS).reduce((n, [, list]) => n + list.filter((o) => o.u > 0 && o.u <= won()).length, 0);

const shell = createShell({
  id: ID,
  title: 'Glam Studio',
  accent: '#c78bff',
  dom: true,
  modeLabel: 'Choose a mode',
  modes: [
    { id: 'challenge', label: 'Challenges', desc: `${ROUNDS} timed looks · earn score & unlocks` },
    { id: 'creative', label: 'Creative', desc: 'No timer · save looks to your gallery' },
  ],
  hud: [{ id: 'time', label: 'TIME', init: '1:30' }, { id: 'score', label: 'SCORE', init: '0' }],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {},
  instructions: {
    goal: 'Complete the checklist for each themed look before the timer runs out. Or relax in Creative mode.',
    controls: [
      ['Click / Tap', 'Choose styles, then pick a colour for them'],
      ['Tab + Enter', 'Every option is keyboard accessible'],
      ['P / Esc', 'Pause'],
    ],
    touch: 'Tap a category, tap an option, then tap a colour swatch. Scroll the panel for more.',
    tips: [
      'The checklist updates live, so you can see exactly what is left to do.',
      'Finish early for a time bonus; extra categories earn a variety bonus.',
      'Winning challenges unlocks new styles. Creative mode lets you use everything you have unlocked.',
    ],
  },
  reset,
  update,
});

function reset(mode) {
  G.mode = mode === 'creative' ? 'creative' : 'challenge';
  G.look = defaultLook();
  G.tab = 'hair'; G.idx = 0; G.results = []; G.runScore = 0; G.over = false; G.bestTimeLeft = 0; G.bonusDone = false; G.colorWins = 0; G.wins = 0; G.timeShown = -1;
  if (G.mode === 'challenge') {
    const w = won();
    G.picked = [];
    for (let i = 0; i < ROUNDS; i++) {
      const maxDiff = 1 + Math.min(2, Math.floor((i + w / 2) / 1.2));
      const pool = CHALLENGES.filter((c) => c.diff <= maxDiff && !G.picked.includes(c));
      G.picked.push(pick(pool));
    }
    G.time = G.picked[0].time;
  }
  build();
  refresh();
  shell.hud('score', '0');
  shell.hud('time', G.mode === 'creative' ? '∞' : fmtTime(G.time));
}

const fmtTime = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.ceil(Math.max(0, t)) % 60).padStart(2, '0')}`.replace(/^(\d):60$/, (m, a) => `${Number(a) + 1}:00`);

function build() {
  const root = shell.root;
  const creative = G.mode === 'creative';
  root.innerHTML = `
  <div class="gs">
    <section class="gs-stage" aria-label="Your look">
      <div class="gs-model" id="gs-model"></div>
      ${creative ? '' : '<div class="gs-brief" id="gs-brief"></div>'}
      <div class="gs-actions">
        ${creative ? '<button type="button" class="g-btn primary" id="gs-save">💾 Save look</button><button type="button" class="g-btn" id="gs-gallery">🖼️ Gallery</button><button type="button" class="g-btn" id="gs-random">🎲 Surprise me</button>' : '<button type="button" class="g-btn primary big" id="gs-done">I\'m done!</button>'}
      </div>
    </section>
    <section class="gs-panel" aria-label="Customize">
      <div class="gs-tabs" role="tablist" id="gs-tabs"></div>
      <div class="gs-opts" id="gs-opts" role="tabpanel"></div>
    </section>
  </div>`;
  els = { model: root.querySelector('#gs-model'), brief: root.querySelector('#gs-brief'), tabs: root.querySelector('#gs-tabs'), opts: root.querySelector('#gs-opts') };
  els.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { shell.sfx.play('click'); G.tab = b.dataset.tab; refresh(); } });
  els.opts.addEventListener('click', onOpt);
  const done = root.querySelector('#gs-done');
  if (done) done.addEventListener('click', () => submit(false));
  const save = root.querySelector('#gs-save');
  if (save) save.addEventListener('click', () => saveLook());
  const gal = root.querySelector('#gs-gallery');
  if (gal) gal.addEventListener('click', openGallery);
  const rnd = root.querySelector('#gs-random');
  if (rnd) rnd.addEventListener('click', surprise);
}

function optionLocked(o) { return o.u > won(); }

function refresh() {
  els.tabs.innerHTML = TABS.map((t) => `<button type="button" role="tab" class="gs-tab${G.tab === t.id ? ' on' : ''}" data-tab="${t.id}" aria-selected="${G.tab === t.id}"><span aria-hidden="true">${t.icon}</span><span>${t.name}</span></button>`).join('');
  const tab = TABS.find((t) => t.id === G.tab);
  let html = '';
  for (const [key, label] of tab.sections) {
    const list = OPTIONS[key];
    const cur = G.look[key];
    html += `<div class="gs-sec"><h3>${label}</h3><div class="gs-chips">`;
    for (const o of list) {
      const on = key === 'fx' ? G.look.fx.includes(o.id) : key === 'bg' ? G.look.bg === o.id : cur && cur.id === o.id;
      const locked = optionLocked(o);
      html += `<button type="button" class="gs-chip${on ? ' on' : ''}${locked ? ' locked' : ''}" data-key="${key}" data-opt="${o.id}" ${locked ? 'disabled' : ''} aria-pressed="${!!on}">${locked ? '🔒 ' : ''}${esc(o.name)}${locked ? `<small>Win ${o.u - won()} more</small>` : ''}</button>`;
    }
    html += '</div>';
    if (COLORED.includes(key) && cur && cur.id !== 'none') {
      const palette = key === 'hair' ? COLORS : COLORS.filter((c) => !c.hairOnly);
      html += `<div class="gs-colors" role="group" aria-label="${label} colour">${palette.map((c) => `<button type="button" class="gs-sw${cur.color === c.id ? ' on' : ''}" data-key="${key}" data-color="${c.id}" style="background:${c.hex}" aria-label="${esc(c.name)}" aria-pressed="${cur.color === c.id}" title="${esc(c.name)}"></button>`).join('')}</div>`;
    }
    html += '</div>';
  }
  if (G.tab === 'scene') html += `<div class="gs-sec"><h3>Skin tone</h3><div class="gs-colors">${SKINS.map((c, i) => `<button type="button" class="gs-sw${G.look.skin === i ? ' on' : ''}" data-skin="${i}" style="background:${c}" aria-label="Skin tone ${i + 1}" aria-pressed="${G.look.skin === i}"></button>`).join('')}</div></div>`;
  els.opts.innerHTML = html;
  drawModel();
}

function drawModel() {
  els.model.innerHTML = lookSVG(G.look);
  if (G.mode === 'challenge') drawBrief();
}

function evaluate(ch, look) {
  const reqs = ch.required.map((r) => ({ label: r.label, ok: !!r.test(look), prog: r.progress ? r.progress(look) : '' }));
  const bonusOk = !!ch.bonus.test(look);
  return { reqs, bonusOk };
}

function drawBrief() {
  const ch = G.picked[G.idx];
  const ev = evaluate(ch, G.look);
  els.brief.innerHTML = `<div class="gs-brief-head"><span aria-hidden="true">${ch.icon}</span><div><small>LOOK ${G.idx + 1} OF ${ROUNDS}</small><h2>${esc(ch.title)}</h2></div></div>
    <p class="gs-blurb">${esc(ch.blurb)}</p>
    <ul class="gs-check">${ev.reqs.map((r) => `<li class="${r.ok ? 'ok' : ''}">${esc(r.label)}${r.prog ? ` <em>${r.prog}</em>` : ''}</li>`).join('')}<li class="bonus ${ev.bonusOk ? 'ok' : ''}">${esc(ch.bonus.label)}</li></ul>
    <div class="gs-timebar" aria-hidden="true"><i id="gs-timebar" style="width:${(G.time / ch.time) * 100}%"></i></div>`;
}

function onOpt(e) {
  const skin = e.target.closest('[data-skin]');
  if (skin) { G.look.skin = Number(skin.dataset.skin); shell.sfx.play('click'); refresh(); return; }
  const col = e.target.closest('[data-color]');
  if (col) { G.look[col.dataset.key].color = col.dataset.color; shell.sfx.play('click'); refresh(); return; }
  const b = e.target.closest('[data-opt]');
  if (!b) return;
  const key = b.dataset.key, id = b.dataset.opt;
  shell.sfx.play('pickup');
  if (key === 'bg') G.look.bg = id;
  else if (key === 'fx') { const i = G.look.fx.indexOf(id); if (i >= 0) G.look.fx.splice(i, 1); else { G.look.fx.push(id); if (G.look.fx.length > 2) G.look.fx.shift(); } }
  else G.look[key].id = id;
  refresh();
}

function surprise() {
  const l = defaultLook();
  const rndOpt = (key) => { const ok = OPTIONS[key].filter((o) => !optionLocked(o)); return pick(ok).id; };
  const col = (hair) => pick(COLORS.filter((c) => hair || !c.hairOnly)).id;
  l.skin = G.look.skin;
  for (const key of Object.keys(OPTIONS)) {
    if (key === 'bg') l.bg = rndOpt('bg');
    else if (key === 'fx') { const f = rndOpt('fx'); l.fx = Math.random() < 0.6 ? [f] : []; }
    else { l[key].id = rndOpt(key); if (COLORED.includes(key)) l[key].color = col(key === 'hair'); }
  }
  G.look = l;
  shell.sfx.play('powerup');
  refresh();
}

function saveLook(fromModal = false) {
  const list = looks();
  list.unshift(JSON.parse(JSON.stringify(G.look)));
  store.setBlob('gs_looks', list.slice(0, MAX_LOOKS));
  shell.sfx.play('victory');
  shell.facts({ saved: Math.min(MAX_LOOKS, store.getBlob('gs_savedTotal', 0) + 1) });
  store.setBlob('gs_savedTotal', (store.getBlob('gs_savedTotal', 0) || 0) + 1);
  if (!fromModal) {
    const b = shell.root.querySelector('#gs-save');
    if (b) { b.textContent = '✔ Saved!'; setTimeout(() => { if (b.isConnected) b.textContent = '💾 Save look'; }, 1400); }
  }
}

function openGallery() {
  const render = () => {
    const list = looks();
    const html = `<h2 id="g-panel-title">🖼️ Gallery</h2><p class="p-sub">${list.length ? 'Load a saved look to keep editing it.' : 'Nothing saved yet. Make a look and press Save!'}</p>
      <div class="gs-gallery">${list.map((l, i) => `<div class="gs-card"><div class="gs-thumb">${lookSVG(l, { label: `Saved look ${i + 1}` })}</div><div class="gs-card-btns"><button type="button" class="g-btn primary" data-modal="load:${i}">Load</button><button type="button" class="g-btn" data-modal="del:${i}" aria-label="Delete look ${i + 1}">🗑️</button></div></div>`).join('')}</div>
      <div class="p-btns"><button type="button" class="g-btn primary big" data-modal="close">Close</button></div>`;
    shell.modal(html, (act) => {
      if (act === 'close') shell.closeModal();
      else if (act.startsWith('load:')) { G.look = looks()[Number(act.slice(5))] || G.look; shell.closeModal(); refresh(); }
      else if (act.startsWith('del:')) { const l = looks(); l.splice(Number(act.slice(4)), 1); store.setBlob('gs_looks', l); render(); }
    });
  };
  render();
}

// ---------------------------------------------------------------- challenge flow
function update(dt) {
  if (G.mode !== 'challenge' || G.over) return;
  G.time -= dt;
  const t = Math.ceil(Math.max(0, G.time));
  if (G.timeShown !== t) {
    G.timeShown = t;
    shell.hud('time', fmtTime(G.time));
    if (t <= 10 && t > 0) shell.sfx.play('warn');
  }
  const bar = document.getElementById('gs-timebar');
  if (bar) bar.style.width = `${clamp(G.time / G.picked[G.idx].time, 0, 1) * 100}%`;
  if (G.time <= 0) submit(true);
}

function usedCategories(look) {
  return ['glasses', 'sticker', 'hairacc', 'shadow', 'lips', 'blush', 'earrings', 'necklace'].filter((k) => look[k].id !== 'none').length + (look.fx.length ? 1 : 0);
}

function submit(timeout) {
  if (G.over || shell.state !== 'playing') return;
  const ch = G.picked[G.idx];
  const ev = evaluate(ch, G.look);
  const reqDone = ev.reqs.filter((r) => r.ok).length;
  const allReq = reqDone === ch.required.length;
  const timeLeft = Math.max(0, G.time);
  const variety = Math.min(360, usedCategories(G.look) * 40);
  const timeBonus = allReq ? Math.round(timeLeft * 15) : 0;
  const bonus = allReq && ev.bonusOk ? 600 : 0;
  const score = reqDone * 800 + bonus + variety + timeBonus;
  if (allReq) { G.wins++; store.setField(ID, 'challengesWon', won() + 1); G.bestTimeLeft = Math.max(G.bestTimeLeft, timeLeft); if (ev.bonusOk) G.bonusDone = true; if (ch.color) G.colorWins++; }
  G.runScore += score;
  shell.hud('score', formatScore(G.runScore));
  shell.sfx.play(allReq ? 'victory' : 'gameover');
  shell.facts({ done: G.wins, timeLeft: allReq ? timeLeft : 0, bonusDone: allReq && ev.bonusOk, unlocked: unlockedCount(), saved: store.getBlob('gs_savedTotal', 0) || 0 });
  const last = G.idx === ROUNDS - 1;
  const html = `
    <h2 id="g-panel-title" class="${allReq ? 'is-win' : 'is-lose'}">${allReq ? 'LOOK COMPLETE!' : timeout ? 'TIME\'S UP' : 'LOOK SUBMITTED'}</h2>
    <p class="p-sub">${ch.icon} ${esc(ch.title)}</p>
    <div class="db-result gs-result">
      <div class="db-result-model">${lookSVG(G.look, { label: 'Your look' })}</div>
      <div class="db-result-body">
        <ul class="db-checks">${ev.reqs.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✔' : '✖'} ${esc(r.label)}</li>`).join('')}<li class="${ev.bonusOk ? 'ok' : 'no'}">${ev.bonusOk ? '✔' : '✖'} ${esc(ch.bonus.label)}</li></ul>
        <ul class="p-xp-list gs-math"><li><span>Objectives (${reqDone}/${ch.required.length})</span><strong>+${reqDone * 800}</strong></li><li><span>Bonus</span><strong>+${bonus}</strong></li><li><span>Variety</span><strong>+${variety}</strong></li><li><span>Time bonus</span><strong>+${timeBonus}</strong></li></ul>
        <div class="p-score">${formatScore(score)}</div>
        ${allReq ? '<p class="db-win">Challenge won — new styles may unlock!</p>' : '<p class="db-lose">Finish every objective to win and unlock styles.</p>'}
      </div>
    </div>
    <div class="p-btns"><button type="button" class="g-btn" data-modal="save">💾 Save look</button><button type="button" class="g-btn primary big" data-modal="${last ? 'finish' : 'next'}">${last ? 'See Results' : 'Next Look'}</button></div>`;
  const handler = (act, el) => {
    if (act === 'save') { saveLook(true); if (el) { el.textContent = '✔ Saved'; el.disabled = true; } }
    else if (act === 'next') { shell.closeModal(); G.idx++; G.look = defaultLook(); G.tab = 'hair'; G.time = G.picked[G.idx].time; G.timeShown = -1; refresh(); shell.hud('time', fmtTime(G.time)); }
    else if (act === 'finish') { shell.closeModal(); finishRun(); }
  };
  shell.modal(html, handler);
}

function finishRun() {
  G.over = true;
  const win = G.wins >= 2;
  shell.finish({
    win, title: win ? 'Style Star!' : 'Studio Closed', subtitle: `${G.wins} of ${ROUNDS} looks completed`,
    score: G.runScore, delay: 150, againLabel: 'New Challenges',
    facts: { done: G.wins, timeLeft: G.bestTimeLeft, bonusDone: G.bonusDone, unlocked: unlockedCount(), saved: store.getBlob('gs_savedTotal', 0) || 0 },
    counters: { colorWins: G.colorWins },
    milestones: [['Looks completed', Math.min(60, G.wins * 15)], ['Time bonus', G.bestTimeLeft >= 30 ? 15 : 0]],
    summary: `Score ${formatScore(G.runScore)}`,
    stats: [['Looks completed', `${G.wins}/${ROUNDS}`], ['Colour-theme wins', String(G.colorWins)], ['Best time left', `${Math.round(G.bestTimeLeft)}s`], ['Styles unlocked', String(unlockedCount())]],
  });
}

void distinctColors;
window.__glam = { G, shell };
