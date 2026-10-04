// Profile helpers: arcade-style avatars (procedural pixel sprites / initials), derived stats and
// the HTML for the profile dashboard. Only data the player owns is shown here.
import { GAMES, gameById, formatRecord, recordRows } from './games.js';
import { levelInfo, bestGameId, TITLES, BORDERS, THEMES, AVATARS, unlockedIds } from './progression.js';
import { ACHIEVEMENTS, byId, forGame } from './achievements.js';
import { esc } from './ui.js';
import { formatScore } from './util.js';

const PALETTES = [['#2de2e6', '#ff3cac'], ['#ffe14d', '#8b5cff'], ['#5dff8f', '#2de2e6'], ['#ff8a3d', '#ff3cac'], ['#8b5cff', '#2de2e6'], ['#ff8ad8', '#ffe14d']];

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function spriteSVG(seedKey) {
  let h = hashStr(seedKey);
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const [a, b] = PALETTES[hashStr(seedKey + 'p') % PALETTES.length];
  let cells = '';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) {
    if (rnd() > 0.52) {
      const col = y < 3 ? a : b;
      cells += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${col}"/><rect x="${7 - x}" y="${y + 1}" width="1" height="1" fill="${col}"/>`;
    }
  }
  cells += '<rect x="2" y="3" width="1" height="1" fill="#fff"/><rect x="6" y="3" width="1" height="1" fill="#fff"/>';
  return `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><rect width="9" height="9" fill="#0d1030"/>${cells}</svg>`;
}

/** Avatar markup. opts: { name, avatar, border, size } */
export function avatarHTML(opts) {
  const size = opts.size || 40;
  const border = BORDERS.find((b) => b.id === opts.border) || BORDERS[0];
  const name = opts.name || 'Guest';
  const inner = opts.avatar && opts.avatar.startsWith('sprite-')
    ? spriteSVG(opts.avatar)
    : `<span class="av-letters" style="background:linear-gradient(135deg,${PALETTES[hashStr(name) % PALETTES.length].join(',')})">${esc(name.trim().slice(0, 2).toUpperCase() || '?')}</span>`;
  return `<span class="avatar" style="--s:${size}px;background:${border.css}" role="img" aria-label="Avatar for ${esc(name)}"><span class="av-in">${inner}</span></span>`;
}

export function summarize(save) {
  const p = save.profile;
  const info = levelInfo(p.xp);
  const bg = bestGameId();
  return {
    info, xp: p.xp, gamesPlayed: p.stats.gamesPlayed, sessions: p.stats.sessions, totalScore: p.stats.totalScore,
    achievements: Object.keys(p.achievements).length, achievementsTotal: ACHIEVEMENTS.length,
    bestGame: bg ? gameById(bg) : null,
    title: (TITLES.find((t) => t.id === p.cosmetics.title && t.level <= info.level) || TITLES[0]).name,
    border: p.cosmetics.border, avatar: p.cosmetics.avatar,
  };
}

export function xpBarHTML(info, compact = false) {
  return `<div class="xp ${compact ? 'compact' : ''}"><div class="xp-head"><b>LEVEL ${info.level}</b><span>${info.into} / ${info.need} XP</span></div>
    <div class="xp-bar" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="${info.need}" aria-valuenow="${info.into}"><i style="width:${Math.round(info.pct * 100)}%"></i></div></div>`;
}

export function recordsHTML(save, all = false) {
  const items = GAMES.map((g) => {
    const rows = recordRows(g, save, all);
    if (!rows.length) return '';
    return `<div class="rec" style="--accent:${g.theme.accent}"><h4>${esc(g.title)}</h4>${rows.map((r) => `<div class="rec-row"><span>${esc(r.label)}</span><b>${esc(r.text)}</b></div>`).join('')}</div>`;
  }).join('');
  return items || '<p class="muted">Play a game to set your first record.</p>';
}

export function achievementCount(save, gameId) {
  const list = forGame(gameId);
  const done = list.filter((a) => save.profile.achievements[a.id]).length;
  return { done, total: list.length };
}

export function recentAchievements(save, n = 4) {
  return Object.entries(save.profile.achievements).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, ts]) => ({ def: byId(id), ts })).filter((x) => x.def);
}

export const dateText = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export function cosmeticsUnlocked(level) {
  return {
    titles: TITLES.filter((t) => t.level <= level), borders: BORDERS.filter((t) => t.level <= level),
    themes: THEMES.filter((t) => t.level <= level), avatars: AVATARS.filter((t) => t.level <= level),
  };
}
export { unlockedIds, formatScore, formatRecord };
