// XP, arcade level, rewards and run recording.
//
// Anti-exploit (best effort for a static client): runs shorter than 20 s earn no XP, XP per run is
// capped, repeated very short runs are discounted, and there is an hourly soft cap. A client-side game
// can never be fully tamper-proof; XP is cosmetic and never affects gameplay.
import * as store from './storage.js';
import { evaluate, byId, ALL_GAMES } from './achievements.js';

const HOUR = 3600 * 1000;
export const MIN_RUN_SECS = 20;
export const MAX_RUN_XP = 320;

/** XP needed to go from level n to n+1 */
export const xpToNext = (level) => 100 + (level - 1) * 50;

export function levelInfo(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level) && level < 99) { left -= xpToNext(level); level++; }
  const need = xpToNext(level);
  return { level, into: left, need, pct: Math.min(1, left / need) };
}

// ---- cosmetic rewards unlocked by arcade level
export const TITLES = [
  { id: 'rookie', name: 'Rookie', level: 1 }, { id: 'pixel_pal', name: 'Pixel Pal', level: 3 },
  { id: 'regular', name: 'Arcade Regular', level: 5 }, { id: 'combo_crafter', name: 'Combo Crafter', level: 8 },
  { id: 'hunter', name: 'High Score Hunter', level: 10 }, { id: 'neon_knight', name: 'Neon Knight', level: 15 },
  { id: 'legend', name: 'Pocket Legend', level: 20 }, { id: 'royalty', name: 'Arcade Royalty', level: 30 },
];
export const BORDERS = [
  { id: 'plain', name: 'Plain', level: 1, css: 'linear-gradient(135deg,#7f86c9,#4b5290)' },
  { id: 'cyan', name: 'Cyan Pulse', level: 2, css: 'linear-gradient(135deg,#2de2e6,#2b7bff)' },
  { id: 'pink', name: 'Hot Pink', level: 4, css: 'linear-gradient(135deg,#ff3cac,#ff8a3d)' },
  { id: 'gold', name: 'Gold Rush', level: 7, css: 'linear-gradient(135deg,#ffe14d,#ff9d2e)' },
  { id: 'rainbow', name: 'Rainbow', level: 12, css: 'conic-gradient(#ff3c6e,#ffe14d,#5dff8f,#2de2e6,#8b5cff,#ff3c6e)' },
  { id: 'holo', name: 'Hologram', level: 18, css: 'linear-gradient(135deg,#9fe8ff,#d6a8ff,#ffd6f2,#9fe8ff)' },
];
export const THEMES = [
  { id: 'neon', name: 'Neon Night', level: 1, a: '#2de2e6', b: '#ff3cac' },
  { id: 'sunset', name: 'Sunset Strip', level: 3, a: '#ff8a3d', b: '#ff3c6e' },
  { id: 'mint', name: 'Mint Arcade', level: 6, a: '#5dff8f', b: '#2de2e6' },
  { id: 'midnight', name: 'Midnight', level: 9, a: '#8b5cff', b: '#2b7bff' },
  { id: 'candy', name: 'Candy Pop', level: 14, a: '#ff8ad8', b: '#ffe14d' },
];
export const AVATARS = [
  { id: 'initials', name: 'Initials', level: 1 },
  { id: 'sprite-1', name: 'Pixel Pal', level: 2 }, { id: 'sprite-2', name: 'Blob Buddy', level: 4 },
  { id: 'sprite-3', name: 'Space Bug', level: 6 }, { id: 'sprite-4', name: 'Neon Mask', level: 8 },
  { id: 'sprite-5', name: 'Robo Cat', level: 11 }, { id: 'sprite-6', name: 'Crown Ghost', level: 16 },
];
export const unlockedIds = (list, level) => list.filter((r) => r.level <= level).map((r) => r.id);
export const rewardsAtLevel = (level) => [
  ...TITLES.filter((r) => r.level === level).map((r) => ({ kind: 'title', ...r })),
  ...BORDERS.filter((r) => r.level === level).map((r) => ({ kind: 'border', ...r })),
  ...THEMES.filter((r) => r.level === level).map((r) => ({ kind: 'theme', ...r })),
  ...AVATARS.filter((r) => r.level === level).map((r) => ({ kind: 'avatar', ...r })),
];

export function arcadeLevel() { return levelInfo(store.getProfile().xp).level; }

/**
 * Record a finished run.
 * run: { secs, score, scoreKind, isNewBest, win, summary, facts, counters, milestones:[[label,xp]], countsScore }
 * Returns { xp, breakdown, level, leveledUp, newLevel, achievements:[def], rewards:[] }
 */
export function recordRun(gameId, run) {
  const now = Date.now();
  const before = levelInfo(store.getProfile().xp);
  const result = { xp: 0, breakdown: [], level: before.level, leveledUp: false, achievements: [], rewards: [], valid: false };

  store.updateProfile((p) => {
    const pg = p.stats.perGame[gameId] || (p.stats.perGame[gameId] = { plays: 0, totalScore: 0, xp: 0, counters: {} });
    const firstTime = pg.plays === 0;
    pg.plays++;
    p.stats.gamesPlayed++;
    if (run.countsScore !== false && typeof run.score === 'number' && isFinite(run.score) && run.scoreKind !== 'low') {
      const s = Math.max(0, Math.min(5e6, Math.floor(run.score)));
      pg.totalScore += s; p.stats.totalScore += s;
    }
    for (const [k, v] of Object.entries(run.counters || {})) {
      if (typeof v === 'number' && isFinite(v) && v > 0) pg.counters[k] = (pg.counters[k] || 0) + Math.min(v, 100000);
    }
    p.recent = [{ id: gameId, ts: now, text: String(run.summary || '').slice(0, 60) }, ...p.recent.filter((r) => r.id !== gameId)].slice(0, 12);

    // ---- XP
    const valid = (run.secs || 0) >= MIN_RUN_SECS;
    result.valid = valid;
    if (valid) {
      const parts = [];
      parts.push(['Run complete', Math.min(40, Math.floor(run.secs / 6))]);
      if (firstTime) parts.push(['First time playing', 30]);
      if (run.isNewBest) parts.push(['New personal best', 25]);
      if (run.win) parts.push(['Victory', 30]);
      let ms = 0;
      for (const [label, xp] of run.milestones || []) { const v = Math.max(0, Math.min(60, Math.floor(xp))); if (v) { parts.push([label, v]); ms += v; if (ms >= 100) break; } }
      result.breakdown = parts;
    }
    // achievements are evaluated even on short runs (they are about what you did), XP only on valid runs
    const level = levelInfo(p.xp).level;
    const ids = evaluate(gameId, run.facts || {}, { c: pg.counters, g: pg, p, level }, p.achievements);
    // evaluating twice lets arcade-wide achievements see newly unlocked ones (e.g. collector)
    for (const id of ids) { p.achievements[id] = now; result.achievements.push(byId(id)); }
    const again = evaluate(gameId, run.facts || {}, { c: pg.counters, g: pg, p, level }, p.achievements);
    for (const id of again) { p.achievements[id] = now; result.achievements.push(byId(id)); }
    if (valid) for (const a of result.achievements) result.breakdown.push([`Achievement: ${a.name}`, 40]);

    let xp = result.breakdown.reduce((a, b) => a + b[1], 0);
    if (valid) {
      // soft rate limits
      p.xpLog = p.xpLog.filter((t) => now - t < HOUR);
      let mult = 1;
      if (p.xpLog.length && now - p.xpLog[p.xpLog.length - 1] < 45000) mult *= 0.5;
      if (p.xpLog.length >= 12) mult *= 0.25;
      xp = Math.min(MAX_RUN_XP, Math.round(xp * mult));
      p.xpLog.push(now);
      if (mult < 1) result.breakdown.push(['Fast-replay adjustment', xp - result.breakdown.reduce((a, b) => a + b[1], 0)]);
    } else xp = 0;
    result.xp = xp;
    p.xp += xp;
    pg.xp += xp;
  });

  const after = levelInfo(store.getProfile().xp);
  result.level = after.level;
  if (after.level > before.level) {
    result.leveledUp = true;
    for (let l = before.level + 1; l <= after.level; l++) result.rewards.push(...rewardsAtLevel(l));
  }
  return result;
}

/** Evaluate achievements mid-run (live facts). Returns newly unlocked defs. Does not touch XP/stats. */
export function checkLive(gameId, facts) {
  const p = store.getProfile();
  const pg = p.stats.perGame[gameId] || { plays: 0, totalScore: 0, xp: 0, counters: {} };
  const level = levelInfo(p.xp).level;
  const ids = evaluate(gameId, facts, { c: { ...pg.counters, ...(facts._counters || {}) }, g: pg, p, level }, p.achievements);
  if (!ids.length) return [];
  const now = Date.now();
  store.updateProfile((pp) => { for (const id of ids) pp.achievements[id] = now; pp.xp += 40; (pp.stats.perGame[gameId] || (pp.stats.perGame[gameId] = { plays: 0, totalScore: 0, xp: 0, counters: {} })).xp += 40; });
  return ids.map(byId);
}

export function bestGameId() {
  const pg = store.getProfile().stats.perGame;
  let best = null, bx = -1;
  for (const id of ALL_GAMES) { const g = pg[id]; if (g && (g.xp > bx || (g.xp === bx && g.plays > (pg[best] || {}).plays))) { best = id; bx = g.xp; } }
  return best && pg[best].plays > 0 ? best : null;
}
