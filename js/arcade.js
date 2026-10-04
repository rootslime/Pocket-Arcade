// Homepage: builds the game grid from games.js and wires the global controls.
import { GAMES } from './games.js';
import * as store from './storage.js';
import { sfx } from './audio.js';
import { formatTime, formatScore } from './util.js';

const grid = document.getElementById('game-grid');
const soundBtn = document.getElementById('toggle-sound');
const motionBtn = document.getElementById('toggle-motion');
const resetBtn = document.getElementById('reset-data');
const dialog = document.getElementById('confirm');

function bestText(g) {
  const save = store.getGame(g.id);
  const v = save[g.scoreField];
  let main;
  if (g.scoreType === 'time') main = v ? formatTime(v) : '—';
  else main = v ? formatScore(v) : '—';
  let extra = '';
  if (g.extraField && save[g.extraField.field] > 1) extra = ` · ${g.extraField.label} ${save[g.extraField.field]}`;
  return { main, extra, label: g.scoreType === 'time' ? 'Best time' : 'High score', has: !!v };
}

function renderCards() {
  grid.innerHTML = '';
  GAMES.forEach((g, i) => {
    const b = bestText(g);
    const li = document.createElement('li');
    li.className = 'card';
    li.style.setProperty('--accent', g.accent);
    li.style.setProperty('--i', i);
    li.innerHTML = `
      <a class="card-art" href="${g.path}" tabindex="-1" aria-hidden="true"><img src="${g.icon}" alt="" width="240" height="150" loading="lazy"></a>
      <div class="card-body">
        <span class="chip">${g.genre}</span>
        <h3 class="card-title">${g.title}</h3>
        <p class="card-desc">${g.description}</p>
        <div class="card-foot">
          <div class="best" aria-label="${b.label}: ${b.main}">
            <span class="best-label">${b.label}</span>
            <span class="best-val${b.has ? '' : ' is-empty'}">${b.main}<small>${b.extra}</small></span>
          </div>
          <a class="play-btn" href="${g.path}" aria-label="Play ${g.title}">Play <span aria-hidden="true">▶</span></a>
        </div>
      </div>`;
    grid.appendChild(li);
  });
}

function syncControls() {
  const muted = store.isMuted();
  soundBtn.setAttribute('aria-pressed', String(!muted));
  soundBtn.querySelector('.ctl-state').textContent = muted ? 'Off' : 'On';
  const reduced = store.prefersReducedMotion();
  motionBtn.setAttribute('aria-pressed', String(reduced));
  motionBtn.querySelector('.ctl-state').textContent = reduced ? 'On' : 'Off';
  document.body.classList.toggle('reduce-motion', reduced);
}

soundBtn.addEventListener('click', () => {
  sfx.unlock();
  store.setMuted(!store.isMuted());
  syncControls();
  sfx.play('click');
});
motionBtn.addEventListener('click', () => {
  store.setSetting('reducedMotion', !store.prefersReducedMotion());
  syncControls();
  sfx.play('click');
});

// Reset flow uses an in-page dialog (no alert/confirm).
resetBtn.addEventListener('click', () => {
  sfx.unlock();
  dialog.hidden = false;
  dialog.querySelector('[data-no]').focus();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('[data-no]')) { dialog.hidden = true; resetBtn.focus(); return; }
  if (e.target.closest('[data-yes]')) {
    store.resetAll();
    renderCards();
    dialog.hidden = true;
    resetBtn.focus();
    const t = document.getElementById('toast');
    t.textContent = 'Saved scores cleared.';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dialog.hidden) { dialog.hidden = true; resetBtn.focus(); }
  if (e.key === 'Tab' && !dialog.hidden) {
    const f = [...dialog.querySelectorAll('button')];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Refresh bests when returning via the browser's back/forward cache.
window.addEventListener('pageshow', (e) => { if (e.persisted) { store.load(); renderCards(); syncControls(); } });

syncControls();
renderCards();
