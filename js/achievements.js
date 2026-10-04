// Achievement definitions shared by every game, plus evaluation.
//
// Each game reports "facts" about a run (see the table below) and cumulative "counters" that persist
// across runs. An achievement's `check(f, x)` receives the run facts `f` and a context `x`:
//   x.c  – this game's cumulative counters (already including the finishing run)
//   x.g  – this game's stats { plays, totalScore, xp }
//   x.p  – the whole profile (xp, stats, achievements …)
//   x.level – arcade level
//
// FACTS reported by each game
//  grappleRush   won, ms, falls, grapples
//  neonDodge     secs, score, grazes, streak, picks, dashes
//  turboSnake    score, length, mode, bonus, ghost
//  brickBlast    score, level, won, bricks, perfectLevel, combo
//  asteroidDash  score, wave, saucers, chain, rocks, upgrades
//  dreamBoutique outfits, perfect, bestTheme, runScore, stars, colorStars, wins
//  sweetheartCafe shift, served, perfectShift, bestCombo, tips, shiftsDone, won
//  glamStudio    won, done, timeLeft, bonusDone, colorTheme
//  driftCircuit  track, ms, lapMs, drift, megaDrifts, cleanLap, boosts, medal, clean
//  dungeonPocket rooms, kills, boss, noHitRoom, upgrades
const A = (id, game, name, desc, icon, check) => ({ id, game, name, desc, icon, check });

export const ARCADE_ID = 'arcade';

export const ACHIEVEMENTS = [
  // ---- arcade-wide
  A('first_quarter', ARCADE_ID, 'First Quarter', 'Play your first Pocket Arcade game.', '🪙', (f, x) => x.p.stats.gamesPlayed >= 1),
  A('arcade_regular', ARCADE_ID, 'Arcade Regular', 'Play every Pocket Arcade game.', '🕹️', (f, x) => ALL_GAMES.every((g) => (x.p.stats.perGame[g] || {}).plays > 0)),
  A('level_5', ARCADE_ID, 'Getting Warm', 'Reach arcade level 5.', '🔥', (f, x) => x.level >= 5),
  A('level_10', ARCADE_ID, 'High Score Hunter', 'Reach arcade level 10.', '🎯', (f, x) => x.level >= 10),
  A('dedicated', ARCADE_ID, 'Dedicated', 'Play on 10 different visits.', '📅', (f, x) => x.p.stats.sessions >= 10),
  A('collector', ARCADE_ID, 'Collector', 'Unlock 20 achievements.', '🏆', (f, x) => Object.keys(x.p.achievements).length >= 20),

  // ---- Grapple Rush
  A('gr_first', 'grappleRush', 'Rooftop Rookie', 'Cross the finish line.', '🏁', (f) => f.won),
  A('gr_speed', 'grappleRush', 'Speed Demon', 'Finish in under 1:30.', '⚡', (f) => f.won && f.ms < 90000),
  A('gr_light', 'grappleRush', 'Lightning Line', 'Finish in under 1:10.', '🌩️', (f) => f.won && f.ms < 70000),
  A('gr_flawless', 'grappleRush', 'Sure Footed', 'Finish without falling.', '🦶', (f) => f.won && f.falls === 0),
  A('gr_swing', 'grappleRush', 'Swing Set', 'Grapple 100 times in total.', '🪝', (f, x) => (x.c.grapples || 0) >= 100),
  A('gr_comeback', 'grappleRush', 'Never Give Up', 'Finish after falling at least 5 times.', '💪', (f) => f.won && f.falls >= 5),

  // ---- Neon Dodge
  A('nd_30', 'neonDodge', 'Warm-up', 'Survive 30 seconds.', '⏱️', (f) => f.secs >= 30),
  A('nd_untouchable', 'neonDodge', 'Untouchable', 'Survive 2 minutes in one run.', '👻', (f) => f.secs >= 120),
  A('nd_close', 'neonDodge', 'Close Call', 'Graze hazards 25 times in one run.', '😬', (f) => f.grazes >= 25),
  A('nd_streak', 'neonDodge', 'Streak Master', 'Reach a graze streak of 15.', '🔗', (f) => f.streak >= 15),
  A('nd_power', 'neonDodge', 'Power Player', 'Collect 5 power-ups in one run.', '🔋', (f) => f.picks >= 5),
  A('nd_score', 'neonDodge', 'High Roller', 'Score 3,000 points.', '💎', (f) => f.score >= 3000),

  // ---- Turbo Snake
  A('ts_first', 'turboSnake', 'First Bite', 'Eat your first food.', '🍎', (f) => f.length >= 4),
  A('ts_grow', 'turboSnake', 'Growing Problem', 'Reach a length of 30.', '🐍', (f) => f.length >= 30),
  A('ts_long', 'turboSnake', 'Long Boy', 'Reach a length of 50.', '📏', (f) => f.length >= 50),
  A('ts_turbo', 'turboSnake', 'Turbo Charged', 'Score 500 in Turbo mode.', '🚀', (f) => f.mode === 'turbo' && f.score >= 500),
  A('ts_classic', 'turboSnake', 'Classic Fan', 'Score 300 in Classic mode.', '🎮', (f) => f.mode === 'classic' && f.score >= 300),
  A('ts_ghost', 'turboSnake', 'Ghost Rider', 'Collect a Ghost power-up.', '👻', (f) => (f.ghost || 0) >= 1),
  A('ts_gold', 'turboSnake', 'Golden Snack', 'Eat 3 gold bonus foods in one run.', '⭐', (f) => (f.bonus || 0) >= 3),

  // ---- Brick Blast
  A('bb_first', 'brickBlast', 'First Break', 'Clear level 1.', '🧱', (f) => f.level >= 2 || f.won),
  A('bb_climb', 'brickBlast', 'Level Climber', 'Reach level 4.', '🪜', (f) => f.level >= 4),
  A('bb_perfect', 'brickBlast', 'Perfect Level', 'Clear a level without losing a ball.', '✨', (f) => !!f.perfectLevel),
  A('bb_combo', 'brickBlast', 'Combo King', 'Break 12 bricks without touching the paddle.', '👑', (f) => f.combo >= 12),
  A('bb_demo', 'brickBlast', 'Demolition Crew', 'Destroy 500 bricks in total.', '💥', (f, x) => (x.c.bricks || 0) >= 500),
  A('bb_power', 'brickBlast', 'Power Hungry', 'Catch 10 power-ups in total.', '🍬', (f, x) => (x.c.powerups || 0) >= 10),
  A('bb_win', 'brickBlast', 'Brick Champion', 'Clear all six levels.', '🏆', (f) => f.won),

  // ---- Asteroid Dash
  A('ad_wave2', 'asteroidDash', 'Lift Off', 'Reach wave 2.', '🛰️', (f) => f.wave >= 2),
  A('ad_ace', 'asteroidDash', 'Space Ace', 'Reach wave 8.', '🚀', (f) => f.wave >= 8),
  A('ad_saucer', 'asteroidDash', 'Saucer Hunter', 'Destroy 5 saucers in total.', '🛸', (f, x) => (x.c.saucers || 0) >= 5),
  A('ad_rocks', 'asteroidDash', 'Rock Smasher', 'Destroy 300 asteroids in total.', '☄️', (f, x) => (x.c.rocks || 0) >= 300),
  A('ad_chain', 'asteroidDash', 'Chain Reaction', 'Reach a kill chain of 8.', '⛓️', (f) => f.chain >= 8),
  A('ad_upgrades', 'asteroidDash', 'Fully Loaded', 'Collect 10 upgrades in total.', '🔧', (f, x) => (x.c.upgrades || 0) >= 10),

  // ---- Dream Boutique
  A('db_first', 'dreamBoutique', 'First Look', 'Complete your first outfit.', '👗', (f) => f.outfits >= 1),
  A('db_perfect', 'dreamBoutique', 'Perfect Match', 'Earn a theme match of 95% or more.', '💯', (f) => f.bestTheme >= 95),
  A('db_stars', 'dreamBoutique', 'Five Star Style', 'Earn five stars overall on an outfit.', '⭐', (f) => f.stars >= 5),
  A('db_week', 'dreamBoutique', 'Fashion Week', 'Complete a full five-outfit show.', '🎀', (f) => f.outfits >= 5),
  A('db_closet', 'dreamBoutique', 'Growing Closet', 'Unlock 10 wardrobe items.', '🧥', (f) => (f.unlocked || 0) >= 10),
  A('db_color', 'dreamBoutique', 'Color Coordinator', 'Earn five color stars three times.', '🎨', (f, x) => (x.c.colorFive || 0) >= 3),
  A('db_trend', 'dreamBoutique', 'Trendsetter', 'Win 10 styling challenges.', '📸', (f) => (f.totalWins || 0) >= 10),

  // ---- Sweetheart Café
  A('sc_first', 'sweetheartCafe', 'Grand Opening', 'Finish your first shift.', '☕', (f) => f.shiftsDone >= 1),
  A('sc_perfect', 'sweetheartCafe', 'Perfect Service', 'Complete a shift without an incorrect order.', '💖', (f) => !!f.perfectShift),
  A('sc_rush', 'sweetheartCafe', 'Rush Hour', 'Serve 20 customers in one shift.', '🏃', (f) => f.served >= 20),
  A('sc_combo', 'sweetheartCafe', 'Combo Barista', 'Reach a combo of x5.', '🔥', (f) => f.bestCombo >= 5),
  A('sc_tips', 'sweetheartCafe', 'Tip Jar', 'Earn 100 coins in tips in total.', '🪙', (f, x) => (x.c.tips || 0) >= 100),
  A('sc_decor', 'sweetheartCafe', 'Interior Designer', 'Buy 3 café upgrades.', '🪴', (f) => (f.bought || 0) >= 3),
  A('sc_all', 'sweetheartCafe', 'Barista Pro', 'Complete all six shifts.', '🌟', (f) => !!f.won),

  // ---- Glam Studio
  A('gs_first', 'glamStudio', 'Creative Spark', 'Complete your first challenge.', '✨', (f) => f.done >= 1),
  A('gs_color', 'glamStudio', 'Color Queen', 'Complete 3 color-themed challenges.', '🌈', (f, x) => (x.c.colorWins || 0) >= 3),
  A('gs_fast', 'glamStudio', 'Speed Stylist', 'Finish a challenge with 30+ seconds left.', '⏲️', (f) => f.done >= 1 && f.timeLeft >= 30),
  A('gs_bonus', 'glamStudio', 'Overachiever', 'Complete every objective plus the bonus.', '💫', (f) => !!f.bonusDone),
  A('gs_gallery', 'glamStudio', 'Gallery Wall', 'Save 3 looks.', '🖼️', (f) => (f.saved || 0) >= 3),
  A('gs_unlock', 'glamStudio', 'Beauty Vault', 'Unlock 10 styling items.', '💄', (f) => (f.unlocked || 0) >= 10),

  // ---- Drift Circuit
  A('dc_rookie', 'driftCircuit', 'Drift Rookie', 'Complete your first successful drift.', '🏎️', (f) => f.drift >= 100),
  A('dc_legend', 'driftCircuit', 'Drift Legend', 'Score 5,000 drift points in one race.', '🌀', (f) => f.drift >= 5000),
  A('dc_mega', 'driftCircuit', 'Mega Drift', 'Land a MEGA DRIFT.', '💨', (f) => f.megaDrifts >= 1),
  A('dc_clean', 'driftCircuit', 'Clean Lap', 'Finish a lap without touching a wall.', '🧼', (f) => !!f.cleanLap),
  A('dc_gold', 'driftCircuit', 'Gold Medal', 'Earn a gold medal on any track.', '🥇', (f) => f.medal === 'gold'),
  A('dc_all', 'driftCircuit', 'Triple Threat', 'Finish all three tracks.', '🏁', (f, x) => ((x.c.t_neon || 0) > 0) && ((x.c.t_sunset || 0) > 0) && ((x.c.t_midnight || 0) > 0)),
  A('dc_boost', 'driftCircuit', 'Boost Junkie', 'Use boost 25 times in total.', '🔋', (f, x) => (x.c.boosts || 0) >= 25),

  // ---- Dungeon Pocket
  A('dp_10', 'dungeonPocket', 'Dungeon Crawler', 'Clear 10 rooms in one run.', '🗝️', (f) => f.rooms >= 10),
  A('dp_20', 'dungeonPocket', 'Deep Delver', 'Clear 20 rooms in one run.', '⛏️', (f) => f.rooms >= 20),
  A('dp_untouch', 'dungeonPocket', 'Untouchable', 'Clear room 5 or deeper without taking damage.', '🛡️', (f) => !!f.noHitRoom),
  A('dp_boss', 'dungeonPocket', 'Boss Slayer', 'Defeat a mini-boss.', '👹', (f) => (f.boss || 0) >= 1),
  A('dp_build', 'dungeonPocket', 'Build Crafter', 'Hold 8 upgrades at once.', '🧩', (f) => f.upgrades >= 8),
  A('dp_slayer', 'dungeonPocket', 'Monster Masher', 'Defeat 200 monsters in total.', '⚔️', (f, x) => (x.c.kills || 0) >= 200),
];

export const ALL_GAMES = ['grappleRush', 'neonDodge', 'turboSnake', 'brickBlast', 'asteroidDash', 'dreamBoutique', 'sweetheartCafe', 'glamStudio', 'driftCircuit', 'dungeonPocket'];
export const byId = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;
export const forGame = (gid) => ACHIEVEMENTS.filter((a) => a.game === gid);

/** Return the ids of achievements that newly pass their check. Never throws. */
export function evaluate(gameId, facts, x, already) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (already[a.id]) continue;
    if (a.game !== ARCADE_ID && a.game !== gameId) continue;
    try { if (a.check(facts || {}, x)) out.push(a.id); } catch (e) { /* a faulty check never breaks the game */ }
  }
  return out;
}
