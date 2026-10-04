// Dream Boutique — fashion styling challenges with deterministic, explainable scoring.
import { createShell } from '../../js/shell.js';
import * as store from '../../js/storage.js';
import { formatScore } from '../../js/util.js';
import { PALETTE, colorById } from '../../js/colors.js';
import { SLOTS, ITEMS, BACKGROUNDS, HAIR_COLORS, SKIN_TONES, CHALLENGES, STYLE_LABEL, STYLES, itemById } from './data.js';
import { scoreOutfit, wearingDress, slotItem } from './scoring.js';
import { modelSVG } from './avatar.js';

const ID = 'dreamBoutique';
const ROUNDS = 5;
const G = {
  idx: 0, challenges: [], outfit: {}, tab: 'top', runScore: 0, results: [], wins: 0, over: false, look: { skin: 1, bg: 'studio' },
  colors: {}, bestTheme: 0, bestStars: 0, colorFive: 0, runWins: 0,
};
let els = {};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gameWins = () => store.getGame(ID).wins || 0;
const unlockedItem = (it) => it.u <= gameWins();
const unlockedCount = () => ITEMS.filter((i) => i.u > 0 && i.u <= gameWins()).length + BACKGROUNDS.filter((b) => b.u > 0 && b.u <= gameWins()).length;

const shell = createShell({
  id: ID,
  title: 'Dream Boutique',
  accent: '#ff8ad8',
  dom: true,
  hud: [{ id: 'round', label: 'OUTFIT', init: `1/${ROUNDS}` }, { id: 'score', label: 'SCORE', init: '0' }],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {},
  instructions: {
    goal: `Style ${ROUNDS} outfits for ${ROUNDS} different events. Match each brief to earn a high score and unlock new clothes.`,
    controls: [
      ['Click / Tap', 'Choose a category, an item and a colour'],
      ['Tab + Enter', 'Keyboard friendly: every button is focusable'],
      ['P / Esc', 'Pause'],
    ],
    touch: 'Tap categories, items and colour swatches. Scroll the panel for more options.',
    tips: [
      'Each item has style tags (like Cute or Glam). The more items that fit the event style, the higher your Theme Match.',
      'Colours score best when they are one colour, neighbours on the colour wheel, or opposites. Neutrals are safe.',
      'Meet every “Required” item and the bonus to score big. Winning a challenge unlocks new items.',
    ],
  },
  reset,
  update() {},
});

function reset() {
  const wins = gameWins();
  // challenges get harder as the show goes on; harder ones need more unlocked wins
  const picked = [];
  for (let i = 0; i < ROUNDS; i++) {
    const maxDiff = 1 + Math.min(3, Math.floor((i + wins / 2) / 1.5));
    const pool = CHALLENGES.filter((c) => c.diff <= maxDiff && !picked.includes(c));
    const preferred = pool.filter((c) => c.diff === maxDiff);
    const from = preferred.length && Math.random() < 0.7 ? preferred : pool;
    picked.push(from[Math.floor(Math.random() * from.length)]);
  }
  Object.assign(G, { idx: 0, challenges: picked, runScore: 0, results: [], over: false, bestTheme: 0, bestStars: 0, colorFive: 0, runWins: 0, tab: 'top' });
  const last = store.getBlob('db_look', null);
  if (last && SKIN_TONES[last.skin] && BACKGROUNDS.some((b) => b.id === last.bg && b.u <= wins)) G.look = last; else G.look = { skin: 1, bg: 'studio' };
  newOutfit();
  build();
  refresh();
  shell.hud('round', `1/${ROUNDS}`);
  shell.hud('score', '0');
}

function newOutfit() {
  G.outfit = { hair: { id: 'long', color: HAIR_COLORS[1] } };
  G.colors = {};
}

// ---------------------------------------------------------------- UI
function build() {
  const root = shell.root;
  const ch = G.challenges[G.idx];
  root.innerHTML = `
  <div class="db">
    <section class="db-brief" aria-label="Styling brief"></section>
    <div class="db-main">
      <section class="db-stage" aria-label="Model preview">
        <div class="db-model" id="db-model"></div>
        <div class="db-stage-note" id="db-note" role="status"></div>
      </section>
      <section class="db-panel" aria-label="Wardrobe">
        <div class="db-tabs" role="tablist" aria-label="Categories" id="db-tabs"></div>
        <div class="db-items" id="db-items" role="tabpanel"></div>
        <div class="db-colors-wrap"><span class="db-label" id="db-color-label">Colour</span><div class="db-colors" id="db-colors" role="group" aria-labelledby="db-color-label"></div></div>
        <div class="db-actions"><button type="button" class="g-btn primary big" id="db-submit">Submit Outfit</button></div>
      </section>
    </div>
  </div>`;
  els = { brief: root.querySelector('.db-brief'), model: root.querySelector('#db-model'), tabs: root.querySelector('#db-tabs'), items: root.querySelector('#db-items'), colors: root.querySelector('#db-colors'), submit: root.querySelector('#db-submit'), note: root.querySelector('#db-note'), colorLabel: root.querySelector('#db-color-label') };
  els.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { shell.sfx.play('click'); G.tab = b.dataset.tab; refresh(); } });
  els.items.addEventListener('click', onItemClick);
  els.colors.addEventListener('click', onColorClick);
  els.submit.addEventListener('click', submit);
  void ch;
}

function renderBrief() {
  const ch = G.challenges[G.idx];
  els.brief.innerHTML = `
    <div class="db-brief-head"><span class="db-icon" aria-hidden="true">${ch.icon}</span>
      <div><small>OUTFIT ${G.idx + 1} OF ${ROUNDS}</small><h2>${esc(ch.title)}</h2></div>
      <span class="db-style">Style: <b>${STYLE_LABEL[ch.style]}</b></span></div>
    <div class="db-reqs">
      <div><b>Required</b><ul>${ch.required.map((r) => `<li data-req="${esc(r.label)}">${esc(r.label)}</li>`).join('')}</ul></div>
      <div><b>Bonus</b><ul><li data-bonus>${esc(ch.bonus.label)}</li></ul></div>
    </div>`;
}

function itemTags(it) {
  const idx = it.s.map((v, i) => [v, i]).filter(([v]) => v >= 3).map(([, i]) => STYLE_LABEL[STYLES[i]]);
  const top = idx.length ? idx : it.s.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 1).map(([, i]) => STYLE_LABEL[STYLES[i]]);
  return top.slice(0, 2).join(' · ') + (it.f >= 2 ? ' · Dressy' : '');
}

function refresh() {
  renderBrief();
  // tabs
  const dress = wearingDress(G.outfit);
  const tabs = [...SLOTS.map((s) => ({ id: s.id, name: s.name, icon: s.icon, disabled: s.id === 'bottom' && dress })), { id: 'model', name: 'Model', icon: '🧍' }];
  if (G.tab === 'bottom' && dress) G.tab = 'top';
  els.tabs.innerHTML = tabs.map((t) => {
    const has = t.id !== 'model' && slotItem(G.outfit, t.id);
    return `<button type="button" role="tab" class="db-tab${G.tab === t.id ? ' on' : ''}${has ? ' has' : ''}" data-tab="${t.id}" aria-selected="${G.tab === t.id}"${t.disabled ? ' disabled title="Your dress covers this"' : ''}><span aria-hidden="true">${t.icon}</span><span>${t.name}</span></button>`;
  }).join('');
  // items
  const wins = gameWins();
  if (G.tab === 'model') {
    els.items.innerHTML = `<div class="db-model-opts"><h3>Skin tone</h3><div class="db-skins">${SKIN_TONES.map((c, i) => `<button type="button" class="db-skin${G.look.skin === i ? ' on' : ''}" data-skin="${i}" style="background:${c}" aria-label="Skin tone ${i + 1}" aria-pressed="${G.look.skin === i}"></button>`).join('')}</div>
      <h3>Backdrop</h3><div class="db-bgs">${BACKGROUNDS.map((b) => `<button type="button" class="db-bg${G.look.bg === b.id ? ' on' : ''}" data-bg="${b.id}" ${b.u > wins ? 'disabled' : ''} aria-pressed="${G.look.bg === b.id}">${b.u > wins ? '🔒 ' : ''}${esc(b.name)}${b.u > wins ? `<small>Win ${b.u - wins} more</small>` : ''}</button>`).join('')}</div></div>`;
    els.colors.innerHTML = '';
    els.colorLabel.textContent = '';
  } else {
    const slot = SLOTS.find((s) => s.id === G.tab);
    const sel = G.outfit[G.tab];
    els.items.innerHTML = ITEMS.filter((i) => i.slot === G.tab).map((it) => {
      const locked = !unlockedItem(it);
      const on = sel && sel.id === it.id;
      return `<button type="button" class="db-item${on ? ' on' : ''}${locked ? ' locked' : ''}" data-item="${it.id}" ${locked ? 'disabled' : ''} aria-pressed="${!!on}">
        <span class="db-item-name">${locked ? '🔒 ' : ''}${esc(it.name)}${it.dress ? ' <em>Dress</em>' : ''}</span>
        <small>${locked ? `Win ${it.u - wins} more challenge${it.u - wins > 1 ? 's' : ''}` : esc(itemTags(it))}</small></button>`;
    }).join('') + (slot.optional ? `<button type="button" class="db-item none${sel ? '' : ' on'}" data-item="" aria-pressed="${!sel}"><span class="db-item-name">None</span><small>Leave it off</small></button>` : '');
    const palette = G.tab === 'hair' ? HAIR_COLORS.map((h) => ({ id: h, hex: h, name: 'Hair colour' })) : (G.tab === 'makeup' ? PALETTE.filter((c) => !['white', 'black', 'gold', 'silver'].includes(c.id)) : PALETTE);
    els.colorLabel.textContent = G.tab === 'hair' ? 'Hair colour' : G.tab === 'makeup' ? 'Lip & eye colour' : 'Colour';
    els.colors.innerHTML = sel ? palette.map((c) => `<button type="button" class="db-swatch${sel.color === c.id ? ' on' : ''}" data-color="${c.id}" style="background:${c.hex}" aria-label="${esc(c.name)}" aria-pressed="${sel.color === c.id}" title="${esc(c.name)}"></button>`).join('') : '<span class="db-hint">Pick an item to choose its colour.</span>';
  }
  els.model.innerHTML = modelSVG(G.outfit, G.look);
  // live checklist
  const ch = G.challenges[G.idx];
  const r = scoreOutfit(G.outfit, ch);
  els.brief.querySelectorAll('[data-req]').forEach((li, i) => li.classList.toggle('ok', r.reqs[i].ok));
  els.brief.querySelector('[data-bonus]').classList.toggle('ok', r.bonusOk);
  const missing = missingList();
  els.submit.disabled = missing.length > 0;
  els.note.textContent = missing.length ? `Still needed: ${missing.join(', ')}` : 'Looking good — submit when you are happy!';
}

function missingList() {
  const m = [];
  if (!slotItem(G.outfit, 'hair')) m.push('hair');
  if (!slotItem(G.outfit, 'top')) m.push('top or dress');
  if (!wearingDress(G.outfit) && !slotItem(G.outfit, 'bottom')) m.push('bottom');
  if (!slotItem(G.outfit, 'shoes')) m.push('shoes');
  return m;
}

function onItemClick(e) {
  const skin = e.target.closest('[data-skin]');
  if (skin) { G.look.skin = Number(skin.dataset.skin); shell.sfx.play('click'); refresh(); return; }
  const bg = e.target.closest('[data-bg]');
  if (bg) { G.look.bg = bg.dataset.bg; shell.sfx.play('click'); refresh(); return; }
  const b = e.target.closest('[data-item]');
  if (!b) return;
  const id = b.dataset.item;
  shell.sfx.play(id ? 'pickup' : 'click');
  if (!id) delete G.outfit[G.tab];
  else {
    const it = itemById(id);
    const prev = G.outfit[G.tab];
    const defColor = G.tab === 'hair' ? (prev ? prev.color : HAIR_COLORS[1]) : (prev ? prev.color : (G.colors[G.tab] || (G.tab === 'jewelry' ? 'gold' : G.tab === 'makeup' ? 'red' : 'white')));
    G.outfit[G.tab] = { id, color: defColor };
    if (it.dress) delete G.outfit.bottom;
  }
  refresh();
}

function onColorClick(e) {
  const b = e.target.closest('[data-color]');
  if (!b || !G.outfit[G.tab]) return;
  G.outfit[G.tab].color = b.dataset.color;
  G.colors[G.tab] = b.dataset.color;
  shell.sfx.play('click');
  refresh();
}

// ---------------------------------------------------------------- results
function starRow(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

function submit() {
  if (G.over || missingList().length) return;
  const ch = G.challenges[G.idx];
  const res = scoreOutfit(G.outfit, ch);
  const g = store.getGame(ID);
  const beforeWins = g.wins || 0;
  const beforeUnlocked = [...ITEMS.filter((i) => i.u > beforeWins && i.u <= beforeWins + 1), ...BACKGROUNDS.filter((b) => b.u > beforeWins && b.u <= beforeWins + 1)];
  if (res.win) { store.setField(ID, 'wins', beforeWins + 1); G.runWins++; }
  const best = store.submit(ID, 'bestOutfit', res.score, 'high');
  store.setBlob('db_look', G.look);
  G.runScore += res.score;
  G.results.push(res);
  G.bestTheme = Math.max(G.bestTheme, res.theme);
  G.bestStars = Math.max(G.bestStars, res.stars.overall);
  if (res.stars.colors === 5) G.colorFive++;
  shell.hud('score', formatScore(G.runScore));
  shell.sfx.play(res.win ? 'victory' : 'score');
  shell.facts({ outfits: G.results.length, bestTheme: G.bestTheme, stars: G.bestStars, totalWins: gameWins(), unlocked: unlockedCount() });

  const last = G.idx === ROUNDS - 1;
  const unlockedNow = res.win ? beforeUnlocked : [];
  const html = `
    <h2 class="is-${res.win ? 'win' : 'lose'}" id="g-panel-title">${res.win ? 'OUTFIT COMPLETE' : 'OUTFIT SUBMITTED'}</h2>
    <p class="p-sub">${ch.icon} ${esc(ch.title)} · ${STYLE_LABEL[ch.style]}</p>
    <div class="db-result">
      <div class="db-result-model">${modelSVG(G.outfit, G.look, { label: 'Your outfit' })}</div>
      <div class="db-result-body">
        <div class="db-big"><span>Theme Match</span><b data-count="${res.theme}">0</b><i>%</i></div>
        <ul class="db-stars">
          <li style="--d:.2s"><span>Style</span><span class="st" aria-label="${res.stars.style} of 5 stars">${starRow(res.stars.style)}</span></li>
          <li style="--d:.5s"><span>Colors</span><span class="st" aria-label="${res.stars.colors} of 5 stars">${starRow(res.stars.colors)}</span></li>
          <li style="--d:.8s"><span>Accessories</span><span class="st" aria-label="${res.stars.acc} of 5 stars">${starRow(res.stars.acc)}</span></li>
        </ul>
        <ul class="db-checks">${res.reqs.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✔' : '✖'} ${esc(r.label)}</li>`).join('')}<li class="${res.bonusOk ? 'ok' : 'no'}">${res.bonusOk ? '✔' : '✖'} Bonus: ${esc(res.bonusLabel)}</li></ul>
        <div class="p-score" data-count="${res.score}" data-fmt="1">0</div>
        ${best.isNew ? '<div class="p-newbest" role="status">★ NEW BEST! ★</div>' : ''}
        ${res.win ? '<p class="db-win">Challenge won!</p>' : `<p class="db-lose">${res.allReq ? 'Almost! Aim for a score of 6,500+.' : 'Meet every required item to win.'}</p>`}
        ${unlockedNow.length ? `<p class="db-unlock">🎁 New unlocked: ${unlockedNow.map((u) => esc(u.name)).join(', ')}</p>` : ''}
      </div>
    </div>
    <div class="p-btns"><button type="button" class="g-btn primary big" data-modal="${last ? 'finish' : 'next'}">${last ? 'See Show Results' : 'Next Outfit'}</button></div>`;
  shell.modal(html, (act) => {
    if (act === 'next') { shell.closeModal(); G.idx++; newOutfit(); G.tab = 'top'; build(); refresh(); shell.hud('round', `${G.idx + 1}/${ROUNDS}`); }
    else if (act === 'finish') { shell.closeModal(); finishRun(); }
  });
  animateCounts();
}

function animateCounts() {
  const panelEls = document.querySelectorAll('#g-panel [data-count]');
  const reduce = shell.reduced;
  panelEls.forEach((el) => {
    const target = Number(el.dataset.count);
    const fmt = el.dataset.fmt;
    if (reduce) { el.textContent = fmt ? formatScore(target) : String(target); return; }
    const t0 = performance.now(), dur = 900;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt ? formatScore(v) : String(v);
      if (k < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function finishRun() {
  G.over = true;
  const n = G.results.length;
  const avgTheme = Math.round(G.results.reduce((a, r) => a + r.theme, 0) / n);
  shell.finish({
    win: G.runWins >= 3, title: G.runWins >= 3 ? 'Show Stopper!' : 'Show Complete', subtitle: `${G.runWins} of ${n} challenges won`,
    score: G.runScore, delay: 150, againLabel: 'New Show',
    facts: { outfits: n, bestTheme: G.bestTheme, stars: G.bestStars, runScore: G.runScore, totalWins: gameWins(), unlocked: unlockedCount(), wins: G.runWins },
    counters: { colorFive: G.colorFive },
    milestones: [['Challenges won', Math.min(60, G.runWins * 12)], ['Theme match', Math.min(30, Math.floor(avgTheme / 10) * 3)]],
    summary: `Score ${formatScore(G.runScore)}`,
    stats: [['Outfits styled', String(n)], ['Challenges won', `${G.runWins}/${n}`], ['Avg theme match', `${avgTheme}%`], ['Best outfit', formatScore(Math.max(...G.results.map((r) => r.score)))]],
  });
}

window.__boutique = { G, shell };
