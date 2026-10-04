// Sweetheart Café — cozy order-management: brew, bake and serve before patience runs out.
import { createShell } from '../../js/shell.js';
import * as store from '../../js/storage.js';
import { formatScore, rand, randInt, pick, clamp } from '../../js/util.js';
import { RECIPES, SHIFTS, GUESTS, SHOP, SHOP_CATS, DEFAULT_OWNED, DEFAULT_EQUIPPED, recipeById, shopItem } from './data.js';

const ID = 'sweetheartCafe';
const TRAY_SIZE = 4;
const COMBO_WINDOW = 8;                 // seconds between serves to keep the combo going

const S = {
  shift: 0, time: 0, spawn: 0, seats: [], stations: [], tray: [], sel: -1, score: 0, runScore: 0,
  combo: 0, comboT: 0, bestCombo: 0, served: 0, perfect: 0, lost: 0, wrong: 0, tips: 0, coins: 0, uid: 0,
  runTips: 0, runBestCombo: 0, shiftsDone: 0, runBestServed: 0, anyPerfectShift: false, over: false, ending: false,
};
let els = {};
const cache = {};
let cosmetics = { owned: DEFAULT_OWNED, equipped: DEFAULT_EQUIPPED };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadCosmetics = () => {
  const b = store.getBlob('sc_cosmetics', null);
  cosmetics = {
    owned: [...new Set([...DEFAULT_OWNED, ...((b && Array.isArray(b.owned)) ? b.owned.filter((id) => shopItem(id)) : [])])],
    equipped: { ...DEFAULT_EQUIPPED, ...((b && b.equipped) || {}) },
  };
  for (const [cat, id] of Object.entries(cosmetics.equipped)) { const it = shopItem(id); if (!it || it.cat !== cat || !cosmetics.owned.includes(id)) cosmetics.equipped[cat] = DEFAULT_EQUIPPED[cat]; }
};
const saveCosmetics = () => store.setBlob('sc_cosmetics', cosmetics);
const equipped = (cat) => shopItem(cosmetics.equipped[cat]);
const boughtCount = () => cosmetics.owned.filter((id) => (shopItem(id) || {}).price > 0).length;

const bestShift = store.getGame(ID).bestShift || 0;
const shell = createShell({
  id: ID,
  title: 'Sweetheart Café',
  accent: '#ff9bb3',
  dom: true,
  modeLabel: 'Where to start',
  modes: bestShift >= 1 ? [{ id: 'new', label: 'New Day', desc: 'Start at Shift 1' }, { id: 'cont', label: `Shift ${Math.min(SHIFTS.length, bestShift + 1)}`, desc: 'Continue where you left off' }] : null,
  hud: [{ id: 'shift', label: 'SHIFT', init: `1/${SHIFTS.length}` }, { id: 'score', label: 'SCORE', init: '0' }, { id: 'coins', label: 'COINS', init: '0' }],
  best: { field: 'highScore', kind: 'high', label: 'BEST' },
  keys: {},
  instructions: {
    goal: 'Serve enough customers each shift before their patience runs out. Clear all six shifts!',
    controls: [
      ['1 – 5 / Click', 'Make an item at a station'],
      ['Q W E R / Click', 'Serve the guest in that seat'],
      ['Click tray item', 'Select it, then pick a guest to serve it'],
    ],
    touch: 'Tap a station to prepare an item. Tap a guest to hand over the matching items from your tray.',
    tips: [
      'Items you make wait on the tray (4 slots). Tapping a guest serves everything they ordered that you hold.',
      'Serve fast to keep the combo going and earn bigger tips. Wrong items break your combo!',
      'Spend coins in the Café Shop (top right) on tables, plants and themes.',
    ],
  },
  reset,
  update,
});

function reset(mode) {
  loadCosmetics();
  const start = mode === 'cont' ? Math.min(SHIFTS.length - 1, (store.getGame(ID).bestShift || 0)) : 0;
  Object.assign(S, { shift: start, score: 0, runScore: 0, runTips: 0, runBestCombo: 0, shiftsDone: 0, runBestServed: 0, anyPerfectShift: false, over: false, ending: false, coins: 0 });
  startShift();
}

function startShift() {
  const sh = SHIFTS[S.shift];
  Object.assign(S, { time: sh.dur, spawn: 0.8, seats: Array.from({ length: sh.seats }, () => null), tray: [], sel: -1, score: 0, combo: 0, comboT: 0, bestCombo: 0, served: 0, perfect: 0, lost: 0, wrong: 0, tips: 0, coins: 0, ending: false });
  S.stations = RECIPES.map((r, i) => ({ id: r.id, on: i < sh.recipes, t: 0, busy: false, ready: false }));
  build();
  shell.hud('shift', `${S.shift + 1}/${SHIFTS.length}`);
  shell.hud('score', formatScore(S.runScore));
  shell.hud('coins', formatScore(store.getGame(ID).coins || 0));
}

// ---------------------------------------------------------------- DOM
function cssVars() {
  const th = equipped('theme'), tb = equipped('table'), ct = equipped('counter'), sg = equipped('sign'), cu = equipped('cup');
  return `--wall1:${th.css[0]};--wall2:${th.css[1]};--sc-ink:${th.dark ? '#f4ecff' : '#4a2c2a'};--table1:${tb.css[0]};--table2:${tb.css[1]};--ctr1:${ct.css[0]};--ctr2:${ct.css[1]};--sign1:${sg.css[0]};--sign2:${sg.css[1]};--cup1:${cu.css[0]};--cup2:${cu.css[1]};`;
}

function build() {
  const root = shell.root;
  const sh = SHIFTS[S.shift];
  const plant = equipped('plant'), wall = equipped('wall');
  root.innerHTML = `
  <div class="sc" style="${cssVars()}">
    <div class="sc-top">
      <div class="sc-sign" aria-hidden="true"><span>Sweetheart Café</span></div>
      <div class="sc-clock"><div class="sc-clock-bar"><i id="sc-time"></i></div><span id="sc-time-text"></span></div>
      <div class="sc-goal" id="sc-goal"></div>
      <button type="button" class="g-btn" id="sc-shop">🛍️ Café Shop</button>
    </div>
    <div class="sc-room">
      <div class="sc-wall-deco" aria-hidden="true">${wall.emoji ? `<span>${wall.emoji}</span><span>${wall.emoji}</span><span>${wall.emoji}</span>` : ''}</div>
      <div class="sc-plant" aria-hidden="true">${plant.emoji || ''}</div>
      <div class="sc-combo" id="sc-combo" role="status" aria-live="polite"></div>
      <div class="sc-seats" id="sc-seats">${S.seats.map((_, i) => `<button type="button" class="sc-seat" data-seat="${i}" aria-label="Guest seat ${i + 1}"><span class="sc-key">${'QWER'[i]}</span><div class="sc-empty">Free table</div></button>`).join('')}</div>
      <div class="sc-popups" id="sc-popups" aria-hidden="true"></div>
    </div>
    <div class="sc-counter">
      <div class="sc-tray" id="sc-tray" aria-label="Your tray"><span class="sc-tray-label">Tray</span>${Array.from({ length: TRAY_SIZE }, (_, i) => `<button type="button" class="sc-slot" data-slot="${i}" aria-label="Tray slot ${i + 1} empty"></button>`).join('')}<button type="button" class="sc-bin" id="sc-bin" aria-label="Throw away selected item" title="Throw away selected">🗑️</button></div>
      <div class="sc-stations" id="sc-stations">${RECIPES.map((r, i) => `<button type="button" class="sc-station" data-station="${r.id}" ${S.stations[i].on ? '' : 'disabled'} aria-label="${r.name}${S.stations[i].on ? '' : ' (not on the menu yet)'}"><span class="sc-key">${r.key}</span><span class="sc-emoji">${r.emoji}</span><b>${r.name}</b><small>${S.stations[i].on ? r.station : 'Unlocks later'}</small><i class="sc-prog"></i></button>`).join('')}</div>
    </div>
  </div>`;
  els = {
    time: root.querySelector('#sc-time'), timeText: root.querySelector('#sc-time-text'), goal: root.querySelector('#sc-goal'), combo: root.querySelector('#sc-combo'),
    seats: [...root.querySelectorAll('.sc-seat')], slots: [...root.querySelectorAll('.sc-slot')], stations: [...root.querySelectorAll('.sc-station')], popups: root.querySelector('#sc-popups'),
  };
  for (const k of Object.keys(cache)) delete cache[k];
  root.querySelector('#sc-stations').addEventListener('click', (e) => { const b = e.target.closest('[data-station]'); if (b) startStation(b.dataset.station); });
  root.querySelector('#sc-seats').addEventListener('click', (e) => { const b = e.target.closest('[data-seat]'); if (b) serveSeat(Number(b.dataset.seat)); });
  root.querySelector('#sc-tray').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (b) { const i = Number(b.dataset.slot); if (S.tray[i]) { S.sel = S.sel === i ? -1 : i; shell.sfx.play('click'); drawTray(); } return; }
    if (e.target.closest('#sc-bin')) discard();
  });
  root.querySelector('#sc-shop').addEventListener('click', () => openShop());
  window.removeEventListener('keydown', onKey);
  window.addEventListener('keydown', onKey);
  drawTray(); drawGoal();
}

function onKey(e) {
  if (shell.state !== 'playing' || e.ctrlKey || e.metaKey || e.altKey) return;
  const st = RECIPES.find((r) => r.key === e.key);
  if (st) { e.preventDefault(); startStation(st.id); return; }
  const si = 'qwer'.indexOf(e.key.toLowerCase());
  if (si >= 0 && e.key.length === 1 && si < S.seats.length) { e.preventDefault(); serveSeat(si); }
}

const recipeEmoji = (id) => recipeById(id).emoji;

function drawGoal() {
  const sh = SHIFTS[S.shift];
  els.goal.innerHTML = `Served <b>${S.served}</b> / ${sh.goal}${S.served >= sh.goal ? ' ✔' : ''}`;
  els.goal.classList.toggle('ok', S.served >= sh.goal);
}

function drawTray() {
  els.slots.forEach((el, i) => {
    const t = S.tray[i];
    el.className = 'sc-slot' + (t ? ' full' : '') + (S.sel === i ? ' sel' : '');
    el.innerHTML = t ? `<span class="sc-cup">${recipeEmoji(t)}</span>` : '';
    el.setAttribute('aria-label', t ? `${recipeById(t).name} on tray${S.sel === i ? ' (selected)' : ''}` : `Tray slot ${i + 1} empty`);
  });
}

function drawSeat(i) {
  const g = S.seats[i], el = els.seats[i];
  if (!g) { el.className = 'sc-seat'; el.innerHTML = `<span class="sc-key">${'QWER'[i]}</span><div class="sc-empty">Free table</div>`; return; }
  const mood = g.pat > 0.6 ? '' : g.pat > 0.3 ? ' meh' : ' angry';
  el.className = 'sc-seat occupied' + mood;
  el.innerHTML = `<span class="sc-key">${'QWER'[i]}</span>
    <div class="sc-bubble" aria-label="Wants ${g.order.map((o) => recipeById(o.id).name).join(', ')}">${g.order.map((o) => `<span class="${o.done ? 'done' : ''}">${recipeEmoji(o.id)}${o.done ? '<i>✔</i>' : ''}</span>`).join('')}</div>
    <div class="sc-guest">${g.face}</div>
    <div class="sc-pat"><i style="width:${Math.round(g.pat * 100)}%"></i></div>`;
}

function popup(text, i, cls = '') {
  const seat = els.seats[i] || els.seats[0];
  const p = document.createElement('span');
  p.className = 'sc-pop ' + cls;
  p.textContent = text;
  const room = els.popups.getBoundingClientRect(), r = seat.getBoundingClientRect();
  p.style.left = `${r.left - room.left + r.width / 2}px`; p.style.top = `${r.top - room.top + 20}px`;
  els.popups.appendChild(p);
  setTimeout(() => p.remove(), 1100);
}

// ---------------------------------------------------------------- gameplay
function startStation(id) {
  if (shell.state !== 'playing') return;
  const st = S.stations.find((s) => s.id === id);
  if (!st || !st.on || st.busy || st.ready) { if (st && st.ready) moveReady(); return; }
  st.busy = true; st.t = 0;
  shell.sfx.play('click');
  const el = els.stations.find((e) => e.dataset.station === id);
  el.classList.add('busy');
}

function moveReady() {
  for (const st of S.stations) {
    if (!st.ready) continue;
    const free = S.tray.length < TRAY_SIZE;
    if (!free) return;
    S.tray.push(st.id);
    st.ready = false;
    shell.sfx.play('pickup');
    const el = els.stations.find((e) => e.dataset.station === st.id);
    el.classList.remove('ready', 'busy'); el.querySelector('.sc-prog').style.width = '0%';
    drawTray();
  }
}

function discard() {
  if (S.sel < 0 || !S.tray[S.sel]) return;
  S.tray.splice(S.sel, 1); S.sel = -1; shell.sfx.play('land'); drawTray();
}

function serveSeat(i) {
  if (shell.state !== 'playing') return;
  const g = S.seats[i];
  if (!g) return;
  if (S.sel >= 0 && S.tray[S.sel]) {
    // deliberate delivery of the selected item
    const id = S.tray[S.sel];
    const need = g.order.find((o) => o.id === id && !o.done);
    if (!need) {
      // wrong item: combo breaks, item is wasted
      S.tray.splice(S.sel, 1); S.sel = -1; S.wrong++; S.combo = 0; S.comboT = 0;
      shell.sfx.play('hit'); popup('Not what I ordered!', i, 'bad'); drawTray(); drawCombo();
      g.pat = Math.max(0, g.pat - 0.12);
      return;
    }
    need.done = true; S.tray.splice(S.sel, 1); S.sel = -1;
    shell.sfx.play('pickup');
  } else {
    // auto-deliver everything that matches
    let any = false;
    for (const o of g.order) {
      if (o.done) continue;
      const ti = S.tray.indexOf(o.id);
      if (ti >= 0) { o.done = true; S.tray.splice(ti, 1); any = true; }
    }
    if (!any) { shell.sfx.play('warn'); popup('Nothing to serve yet', i, 'hint'); return; }
    shell.sfx.play('pickup');
  }
  drawTray();
  if (g.order.every((o) => o.done)) completeGuest(i, g);
  else drawSeat(i);
}

function completeGuest(i, g) {
  const n = g.order.length;
  S.combo = S.comboT > 0 || S.combo === 0 ? S.combo + 1 : 1;
  S.comboT = COMBO_WINDOW;
  S.bestCombo = Math.max(S.bestCombo, S.combo);
  const fast = g.pat > 0.66;
  const tip = Math.round(g.pat * 8) + (fast ? 3 : 0);
  const coins = n * 4 + tip;
  const mult = Math.min(5, S.combo);
  const pts = coins * 10 * mult;
  S.served++; S.tips += tip; S.coins += coins; S.score += pts; S.runScore += pts; S.runTips += tip;
  if (fast) S.perfect++;
  shell.sfx.play(S.combo >= 3 ? 'combo' : 'score');
  popup(`+${pts}`, i, 'good');
  if (fast && S.combo >= 2) popup('PERFECT SERVICE!', i, 'perfect');
  S.seats[i] = null; drawSeat(i);
  shell.hud('score', formatScore(S.runScore));
  drawCombo(); drawGoal();
  if (S.bestCombo === 5) shell.facts({ bestCombo: 5 });
}

function drawCombo() {
  if (S.combo >= 2) { els.combo.textContent = `COMBO x${Math.min(5, S.combo)}`; els.combo.className = 'sc-combo on'; }
  else { els.combo.textContent = ''; els.combo.className = 'sc-combo'; }
}

function spawnGuest() {
  const sh = SHIFTS[S.shift];
  const free = S.seats.map((g, i) => (g ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return;
  const i = pick(free);
  const menu = RECIPES.slice(0, sh.recipes);
  const n = randInt(sh.items[0], sh.items[1]);
  const order = Array.from({ length: n }, () => ({ id: pick(menu).id, done: false }));
  S.seats[i] = { face: pick(GUESTS), order, pat: 1, max: sh.patience * (0.9 + n * 0.12), uid: ++S.uid };
  drawSeat(i);
  shell.sfx.play('click');
}

function update(dt) {
  if (S.over || S.ending) return;
  const sh = SHIFTS[S.shift];
  S.time -= dt;
  S.comboT -= dt;
  if (S.comboT <= 0 && S.combo > 0) { S.combo = 0; drawCombo(); }
  S.spawn -= dt;
  if (S.spawn <= 0 && S.time > 4) { spawnGuest(); S.spawn = sh.interval * rand(0.8, 1.2); }
  // stations
  for (const st of S.stations) {
    const el = els.stations.find((e) => e.dataset.station === st.id);
    if (st.busy) {
      st.t += dt;
      const r = recipeById(st.id);
      const k = clamp(st.t / r.prep, 0, 1);
      el.querySelector('.sc-prog').style.width = `${Math.round(k * 100)}%`;
      if (k >= 1) { st.busy = false; st.ready = true; el.classList.add('ready'); shell.sfx.play('score'); }
    }
  }
  if (S.stations.some((s) => s.ready)) moveReady();
  // guests lose patience
  for (let i = 0; i < S.seats.length; i++) {
    const g = S.seats[i];
    if (!g) continue;
    const before = Math.round(g.pat * 20);
    g.pat -= dt / g.max;
    if (g.pat <= 0) {
      S.seats[i] = null; S.lost++; S.combo = 0; S.comboT = 0;
      shell.sfx.play('hit'); popup('Left unhappy…', i, 'bad'); drawSeat(i); drawCombo();
      continue;
    }
    if (Math.round(g.pat * 20) !== before) { const bar = els.seats[i].querySelector('.sc-pat i'); if (bar) bar.style.width = `${Math.round(g.pat * 100)}%`; const mood = g.pat > 0.6 ? 0 : g.pat > 0.3 ? 1 : 2; if (g.mood !== mood) { g.mood = mood; drawSeat(i); } }
  }
  // clock
  const k = clamp(S.time / sh.dur, 0, 1);
  if (cache.t !== Math.round(k * 200)) { cache.t = Math.round(k * 200); els.time.style.width = `${k * 100}%`; }
  const sec = Math.max(0, Math.ceil(S.time));
  if (cache.s !== sec) { cache.s = sec; els.timeText.textContent = `${sec}s`; if (sec <= 5 && sec > 0) shell.sfx.play('warn'); }
  if (S.time <= 0) endShift();
}

// ---------------------------------------------------------------- shift end / shop
function endShift() {
  S.ending = true;
  const sh = SHIFTS[S.shift];
  const passed = S.served >= sh.goal;
  const g = store.getGame(ID);
  const perfectShift = S.wrong === 0 && S.served >= 5;
  if (passed) {
    S.shiftsDone++;
    store.setField(ID, 'coins', (g.coins || 0) + S.coins);
    store.submit(ID, 'bestShift', S.shift + 1, 'high');
    S.runBestServed = Math.max(S.runBestServed, S.served);
    if (perfectShift) S.anyPerfectShift = true;
  }
  S.runBestCombo = Math.max(S.runBestCombo, S.bestCombo);
  shell.hud('coins', formatScore(store.getGame(ID).coins || 0));
  shell.facts({ shiftsDone: S.shiftsDone, served: S.served, perfectShift: passed && perfectShift, bestCombo: S.runBestCombo, tips: S.runTips, bought: boughtCount() });
  shell.sfx.play(passed ? 'victory' : 'gameover');
  const last = S.shift === SHIFTS.length - 1;
  const html = `
    <h2 id="g-panel-title" class="${passed ? 'is-win' : 'is-lose'}">${passed ? `Shift ${S.shift + 1} Complete!` : 'Shift Failed'}</h2>
    <p class="p-sub">${passed ? (last ? 'You ran the café all week!' : 'Great service — the café is buzzing.') : `You needed to serve ${sh.goal} guests.`}</p>
    <ul class="p-stats sc-stats">
      <li><span>Customers Served</span><strong>${S.served} / ${sh.goal}</strong></li>
      <li><span>Perfect Orders</span><strong>${S.perfect}</strong></li>
      <li><span>Best Combo</span><strong>x${Math.min(5, S.bestCombo)}${S.bestCombo > 5 ? '+' : ''}</strong></li>
      <li><span>Tips Earned</span><strong>${S.tips} 🪙</strong></li>
      <li><span>Guests Lost</span><strong>${S.lost}</strong></li>
      <li><span>Wrong Items</span><strong>${S.wrong}</strong></li>
    </ul>
    <div class="p-score" aria-label="Shift score">${formatScore(S.score)}</div>
    <p class="p-sub">${passed ? `+${S.coins} coins earned` : 'No coins this time.'}</p>
    <div class="p-btns">
      ${passed && !last ? '<button type="button" class="g-btn primary big" data-modal="next">Next Shift</button>' : `<button type="button" class="g-btn primary big" data-modal="finish">${passed ? 'See Results' : 'See Results'}</button>`}
      ${passed ? '<button type="button" class="g-btn" data-modal="shop">🛍️ Café Shop</button>' : ''}
    </div>`;
  const handler = (act) => {
    if (act === 'shop') { openShop(() => shell.modal(html, handler)); }
    else if (act === 'next') { shell.closeModal(); S.shift++; startShift(); }
    else if (act === 'finish') { shell.closeModal(); finishRun(passed && last); }
  };
  shell.modal(html, handler);
}

function openShop(onClose) {
  let cat = 'theme';
  const render = () => {
    const coins = store.getGame(ID).coins || 0;
    const items = SHOP.filter((s) => s.cat === cat);
    const html = `
      <h2 id="g-panel-title">🛍️ Café Shop</h2>
      <p class="p-sub">You have <b>${formatScore(coins)} 🪙</b></p>
      <div class="sc-shop-tabs" role="tablist">${SHOP_CATS.map((c) => `<button type="button" role="tab" class="g-btn${c.id === cat ? ' primary' : ''}" data-modal="cat:${c.id}" aria-selected="${c.id === cat}">${c.icon} ${c.name}</button>`).join('')}</div>
      <div class="sc-shop-grid">${items.map((it) => {
        const owned = cosmetics.owned.includes(it.id), on = cosmetics.equipped[it.cat] === it.id;
        const swatch = it.css ? `<span class="sc-sw" style="background:linear-gradient(135deg,${it.css[0]},${it.css[1]})"></span>` : `<span class="sc-sw em">${it.emoji || '∅'}</span>`;
        return `<div class="sc-shop-item${on ? ' on' : ''}">${swatch}<b>${esc(it.name)}</b>${on ? '<small>Equipped</small>' : owned ? `<button type="button" class="g-btn" data-modal="equip:${it.id}">Equip</button>` : `<button type="button" class="g-btn primary" data-modal="buy:${it.id}" ${coins < it.price ? 'disabled' : ''}>${it.price} 🪙</button>`}</div>`;
      }).join('')}</div>
      <div class="p-btns"><button type="button" class="g-btn primary big" data-modal="close">Done</button></div>`;
    shell.modal(html, (act) => {
      if (act.startsWith('cat:')) { cat = act.slice(4); shell.sfx.play('click'); render(); }
      else if (act.startsWith('equip:')) { const it = shopItem(act.slice(6)); cosmetics.equipped[it.cat] = it.id; saveCosmetics(); render(); }
      else if (act.startsWith('buy:')) {
        const it = shopItem(act.slice(4)); const g = store.getGame(ID);
        if ((g.coins || 0) >= it.price && !cosmetics.owned.includes(it.id)) {
          store.setField(ID, 'coins', (g.coins || 0) - it.price);
          cosmetics.owned.push(it.id); cosmetics.equipped[it.cat] = it.id; saveCosmetics();
          shell.sfx.play('powerup'); shell.hud('coins', formatScore(store.getGame(ID).coins || 0));
          shell.facts({ bought: boughtCount() });
          render();
        }
      } else if (act === 'close') {
        if (onClose) onClose();
        else { shell.closeModal(); const c = shell.root.querySelector('.sc'); if (c) c.setAttribute('style', cssVars()); rebuildDeco(); }
      }
    });
  };
  render();
}

/** Re-apply cosmetic choices without restarting the shift. */
function rebuildDeco() {
  const c = shell.root.querySelector('.sc');
  if (!c) return;
  c.setAttribute('style', cssVars());
  const plant = equipped('plant'), wall = equipped('wall');
  c.querySelector('.sc-plant').textContent = plant.emoji || '';
  c.querySelector('.sc-wall-deco').innerHTML = wall.emoji ? `<span>${wall.emoji}</span><span>${wall.emoji}</span><span>${wall.emoji}</span>` : '';
}

function finishRun(win) {
  S.over = true;
  const avgPct = 0;
  void avgPct;
  shell.finish({
    win, title: win ? 'Café Superstar!' : 'Café Closed', subtitle: win ? 'All six shifts complete' : `Reached shift ${S.shift + 1} of ${SHIFTS.length}`,
    score: S.runScore, delay: 150, againLabel: 'Open Again',
    facts: { shiftsDone: S.shiftsDone, served: S.runBestServed, perfectShift: S.anyPerfectShift, bestCombo: S.runBestCombo, tips: S.runTips, won: win, bought: boughtCount() },
    counters: { tips: S.runTips },
    milestones: [['Shifts completed', Math.min(60, S.shiftsDone * 12)], ['Best combo', Math.min(20, S.runBestCombo * 4)]],
    summary: `Score ${formatScore(S.runScore)} · Shift ${Math.min(S.shift + 1, SHIFTS.length)}`,
    stats: [['Shifts completed', `${S.shiftsDone}/${SHIFTS.length}`], ['Best combo', `x${Math.min(5, S.runBestCombo)}`], ['Tips earned', String(S.runTips)], ['Coins', formatScore(store.getGame(ID).coins || 0)]],
  });
}

window.__cafe = { S, shell, SHIFTS };
