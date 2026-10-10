// Central game registry. The console UI (home, library, detail, profile, achievements) is generated
// from this list, so adding a game means: create games/<slug>/, add an entry here, add its artwork.
//
//  id          key used in the save file (camelCase) – also the shell `id` the game passes to createShell
//  slug        folder name / URL fragment
//  title, tagline, description
//  genre       display labels            categories  filter keys: action arcade racing cozy creative classic
//  path        folder relative to the site root (must end with "/")
//  icon        card artwork (relative to the site root)
//  scoreType   'time' (lower is better) | 'score'
//  scoreField  field in the save file shown as the headline record
//  records     extra record rows for the profile / detail screens  { label, field, fmt: 'time'|'num' }
//  controls    which input methods the game supports; controlsText is shown on the detail screen
//  goal, tips  short copy for the "How to Play" dialog
//  theme       { accent, background } used for the selected-game presentation
export const CATEGORIES = [
  { id: 'all', label: 'All' }, { id: 'action', label: 'Action' }, { id: 'arcade', label: 'Arcade' },
  { id: 'racing', label: 'Racing' }, { id: 'cozy', label: 'Cozy' }, { id: 'creative', label: 'Creative' }, { id: 'classic', label: 'Classic' }, { id: 'multiplayer', label: 'Multiplayer' },
];

export const GAMES = [
  {
    id: 'pocketTag', slug: 'pocket-tag', title: 'Pocket Tag', tagline: 'Run. Chase. Don’t get tagged.',
    description: 'The playground classic, turbocharged: sprint, slide, vault and dash through four maps in Classic Tag, Freeze Tag, Infection and Crown Chase. Play with bots, on one screen or online with friends.',
    genre: ['Action', 'Multiplayer'], categories: ['action', 'arcade', 'multiplayer'], path: 'games/pocket-tag/', icon: 'assets/icons/pocket-tag.svg', featured: true,
    goal: 'Run, chase and avoid being tagged. Each mode has its own way to win.', tips: ['Sprint and dash cost stamina and cooldown, so use them to cut corners.', 'Slide under tunnels, vault benches and use ramps to jump across gaps.', 'After a tag you are protected for a moment. Run!'],
    scoreType: 'score', scoreField: 'highScore',
    multiplayer: { supported: true, minPlayers: 2, maxPlayers: 8, bots: true, local: true, online: true, players: '2–8 players', modes: ['Classic Tag', 'Freeze Tag', 'Infection', 'Crown Chase'] },
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Longest Escape (s)', field: 'longestEscape', fmt: 'num' }],
    stats: { solo: [['Matches vs bots', 'matches'], ['Wins', 'wins'], ['Tags', 'tags']], multi: [['Multiplayer matches', 'mpMatches'], ['Multiplayer wins', 'mpWins'], ['Tags with friends', 'mpTags']] },
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['WASD / Arrows — Run', 'Shift — Sprint · Space — Jump', 'C — Slide · F — Dash', 'Touch: drag to run, buttons on the right'],
    theme: { accent: '#ffb347', background: 'radial-gradient(900px 500px at 60% 25%, #0f6a4a88, transparent), linear-gradient(160deg, #2a1458, #0c3b3a)' },
  },
  {
    id: 'grappleRush', slug: 'grapple-rush', title: 'Grapple Rush', tagline: 'Swing. Launch. Race.',
    description: 'Eight rooftop courses with swings, bounce pads and medal times. Release at the right moment to fling yourself across the gap.',
    genre: ['Action', 'Platformer'], categories: ['action'], path: 'games/grapple-rush/', icon: 'assets/icons/grapple-rush.svg',
    goal: "Cross the rooftops and reach the finish gate as fast as you can.", tips: ["Hold grapple near a glowing node, release at the top of the swing to keep your speed.", "Falling sends you back to your last checkpoint \u2014 the clock keeps running."],
    scoreType: 'time', scoreField: 'bestTime', multiplayer: false,
    records: [
      { label: 'Neon Heights', field: 'bestTime', fmt: 'time' }, { label: 'Sunset Strip', field: 'bestTime_sunset', fmt: 'time' },
      { label: 'Cloud Piercer', field: 'bestTime_cloud', fmt: 'time' }, { label: 'Spring Loaded', field: 'bestTime_spring', fmt: 'time' },
      { label: 'Chain Reaction', field: 'bestTime_chain', fmt: 'time' }, { label: 'Midnight Drop', field: 'bestTime_midnight', fmt: 'time' },
      { label: 'Pinball Alley', field: 'bestTime_pinball', fmt: 'time' }, { label: 'Neon Gauntlet', field: 'bestTime_gauntlet', fmt: 'time' },
    ],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['A / D — Run', 'Space — Jump', 'E / Click — Hold to grapple', '8 levels — pick one on the start screen'],
    theme: { accent: '#2de2e6', background: 'radial-gradient(900px 500px at 70% 20%, #7a1e6c55, transparent), linear-gradient(160deg, #0b0627, #2b0c55)' },
  },
  {
    id: 'neonDodge', slug: 'neon-dodge', title: 'Neon Dodge', tagline: 'Dodge the glow.',
    description: 'Survive an arena of lasers, walls and homing mines. Graze hazards for bonus points and grab power-ups.',
    genre: ['Arcade', 'Survival'], categories: ['arcade'], path: 'games/neon-dodge/', icon: 'assets/icons/neon-dodge.svg',
    goal: "Survive as long as you can and build a score multiplier.", tips: ["Skim hazards for CLOSE! bonuses and bigger multipliers.", "Dash gives brief invulnerability \u2014 use it to blink through lasers."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: { supported: true, minPlayers: 2, maxPlayers: 6, bots: false, local: false, online: true, players: '2–6 players', modes: ['Last Player Standing'] },
    stats: { solo: [], multi: [['Last Standing matches', 'lsMatches'], ['Last Standing wins', 'lsWins']] },
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['WASD / Arrows — Move', 'Space / Shift — Dash'],
    theme: { accent: '#ff3cac', background: 'radial-gradient(800px 500px at 30% 30%, #ff3cac33, transparent), linear-gradient(160deg, #080720, #14083a)' },
  },
  {
    id: 'turboSnake', slug: 'turbo-snake', title: 'Turbo Snake', tagline: 'Eat. Grow. Go Turbo.',
    description: 'The classic you know, plus a Turbo mode with power-ups, bonus food and ghost mode.',
    genre: ['Classic', 'Arcade'], categories: ['classic', 'arcade'], path: 'games/turbo-snake/', icon: 'assets/icons/turbo-snake.svg',
    goal: "Eat food to grow without hitting walls or yourself.", tips: ["Turbo mode adds bonus food and power-ups.", "Quick turns are buffered so you never reverse into yourself."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: { supported: true, minPlayers: 2, maxPlayers: 4, bots: true, local: true, online: true, page: 'battle.html', players: '2–4 players', modes: ['Snake Battle'] },
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Classic', field: 'classicHigh', fmt: 'num' }, { label: 'Turbo', field: 'turboHigh', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: true },
    stats: { solo: [['Snake Battles played', 'battles'], ['Snake Battle wins', 'battleWins']], multi: [['Multiplayer battles', 'mpBattles'], ['Multiplayer wins', 'mpBattleWins']] },
    controlsText: ['Arrows / WASD — Steer', 'Swipe or D-pad on touch', 'Snake Battle: 2–4 snakes, last one alive wins'],
    theme: { accent: '#5dff8f', background: 'radial-gradient(800px 500px at 60% 30%, #5dff8f26, transparent), linear-gradient(160deg, #052a1d, #0b1038)' },
  },
  {
    id: 'brickBlast', slug: 'brick-blast', title: 'Brick Blast', tagline: 'Aim. Smash. Repeat.',
    description: 'Smash through six handcrafted levels. Aim with your paddle, catch power-ups and keep the ball alive.',
    genre: ['Arcade', 'Breakout'], categories: ['arcade'], path: 'games/brick-blast/', icon: 'assets/icons/brick-blast.svg',
    goal: "Break every brick across six levels without losing your last ball.", tips: ["Hit the ball with the paddle edge to steer it.", "Catch falling capsules for wide paddle, multi-ball and more."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: { supported: true, minPlayers: 2, maxPlayers: 4, bots: false, local: true, online: true, players: '2–4 players', modes: ['Brick Battle'] },
    stats: { solo: [], multi: [['Brick Battles played', 'bbMatches'], ['Brick Battle wins', 'bbWins']] },
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Highest Level', field: 'highestLevel', fmt: 'num', min: 2 }],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['← → / Mouse — Paddle', 'Space / Click — Launch'],
    theme: { accent: '#ffe14d', background: 'radial-gradient(800px 500px at 50% 25%, #ff3cac2e, transparent), linear-gradient(160deg, #2a0a3f, #0a0d30)' },
  },
  {
    id: 'asteroidDash', slug: 'asteroid-dash', title: 'Asteroid Dash', tagline: 'Fly. Fight. Survive.',
    description: 'Blast rocks, dodge saucers and survive endless waves with momentum-based flying and upgrades.',
    genre: ['Action', 'Space Shooter'], categories: ['action', 'arcade'], path: 'games/asteroid-dash/', icon: 'assets/icons/asteroid-dash.svg',
    goal: "Survive wave after wave of asteroids, saucers and comets.", tips: ["You keep drifting after you stop thrusting \u2014 plan your turns.", "Chain kills for bonus points and grab upgrades."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: { supported: true, minPlayers: 2, maxPlayers: 4, bots: false, local: true, online: false, page: 'coop.html', players: '2–4 players', modes: ['Co-op (same screen)'] },
    stats: { solo: [], multi: [['Co-op games', 'coopMatches'], ['Co-op waves survived', 'coopWaves']] },
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Highest Wave', field: 'highestWave', fmt: 'num', min: 2 }],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['← → — Rotate', '↑ — Thrust', 'Space — Shoot'],
    theme: { accent: '#8b5cff', background: 'radial-gradient(900px 600px at 50% 40%, #13113a, #03030f)' },
  },
  {
    id: 'dreamBoutique', slug: 'dream-boutique', title: 'Dream Boutique', tagline: 'Style the moment.',
    description: 'Fashion styling challenges: read the brief, build the outfit and wow the crowd. Win to unlock new looks.',
    genre: ['Creative', 'Fashion'], categories: ['creative', 'cozy'], path: 'games/dream-boutique/', icon: 'assets/icons/dream-boutique.svg',
    goal: "Style five outfits that match each event brief.", tips: ["Read the Required and Bonus list, then match the style tags.", "Win challenges to unlock new clothes and backdrops."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: false,
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Best Outfit', field: 'bestOutfit', fmt: 'num' }, { label: 'Challenges Won', field: 'wins', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: false },
    controlsText: ['Click / Tap — Pick items', 'Enter — Submit outfit'],
    theme: { accent: '#ff8ad8', background: 'radial-gradient(800px 500px at 40% 30%, #ff8ad833, transparent), linear-gradient(160deg, #2b0f3e, #4a1650)' },
  },
  {
    id: 'sweetheartCafe', slug: 'sweetheart-cafe', title: 'Sweetheart Café', tagline: 'Serve with a smile.',
    description: 'Run a cozy café: brew, bake and serve before patience runs out. Earn coins and decorate your shop.',
    genre: ['Cozy', 'Management'], categories: ['cozy'], path: 'games/sweetheart-cafe/', icon: 'assets/icons/sweetheart-cafe.svg',
    goal: "Serve enough guests every shift before their patience runs out.", tips: ["Make items at stations; they wait on your tray until you serve.", "Quick serves build combos and bigger tips. Spend coins in the shop."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: false,
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Best Shift', field: 'bestShift', fmt: 'num' }, { label: 'Coins', field: 'coins', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: false },
    controlsText: ['Click / Tap — Stations & guests', '1–5 — Stations · Q W E R — Guests'],
    theme: { accent: '#ff9bb3', background: 'radial-gradient(800px 500px at 55% 30%, #ffd6a533, transparent), linear-gradient(160deg, #3a1c2f, #5a2a3a)' },
  },
  {
    id: 'glamStudio', slug: 'glam-studio', title: 'Glam Studio', tagline: 'Make it sparkle.',
    description: 'Create themed looks against the clock or relax in creative mode. Unlock new styles as you play.',
    genre: ['Creative', 'Makeover'], categories: ['creative'], path: 'games/glam-studio/', icon: 'assets/icons/glam-studio.svg',
    goal: "Complete every checklist item for each themed look before time runs out.", tips: ["Finish early for a time bonus.", "Creative mode has no timer and lets you save looks to a gallery."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: false,
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Challenges Won', field: 'challengesWon', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: false },
    controlsText: ['Click / Tap — Customize', 'Finish when the checklist is complete'],
    theme: { accent: '#c78bff', background: 'radial-gradient(800px 500px at 45% 30%, #c78bff33, transparent), linear-gradient(160deg, #20103e, #3a1b5e)' },
  },
  {
    id: 'driftCircuit', slug: 'drift-circuit', title: 'Drift Circuit', tagline: 'Slide into the lead.',
    description: 'Top-down arcade racing: master the drift, charge your boost and chase gold on three tracks.',
    genre: ['Racing', 'Arcade'], categories: ['racing', 'action'], path: 'games/drift-circuit/', icon: 'assets/icons/drift-circuit.svg',
    goal: "Finish three laps as quickly as possible. Chase the gold time.", tips: ["Hold the handbrake while turning to drift and charge your boost.", "Dirt shortcuts are faster in a straight line but grip is lower."],
    scoreType: 'time', scoreField: 'bestLap', multiplayer: { supported: true, minPlayers: 2, maxPlayers: 6, bots: false, local: false, online: true, players: '2–6 players', modes: ['Multiplayer Race'] },
    stats: { solo: [], multi: [['Multiplayer races', 'mpRaces'], ['Race wins', 'raceWins']] },
    records: [{ label: 'Best Lap', field: 'bestLap', fmt: 'time' }, { label: 'Neon City', field: 'bestTime_neon', fmt: 'time' }, { label: 'Sunset Coast', field: 'bestTime_sunset', fmt: 'time' }, { label: 'Midnight Circuit', field: 'bestTime_midnight', fmt: 'time' }, { label: 'Best Drift Score', field: 'driftBest', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['W / S — Gas / Brake', 'A / D — Steer', 'Space — Drift · Shift — Boost'],
    theme: { accent: '#ff8a3d', background: 'radial-gradient(900px 500px at 60% 30%, #ff3c6e33, transparent), linear-gradient(160deg, #1a0a2e, #3b1450)' },
  },
  {
    id: 'dungeonPocket', slug: 'dungeon-pocket', title: 'Dungeon Pocket', tagline: 'Clear. Upgrade. Survive.',
    description: 'Fight through stylized dungeon rooms, pick upgrades and build a champion. How deep can you go?',
    genre: ['Action', 'Dungeon'], categories: ['action'], path: 'games/dungeon-pocket/', icon: 'assets/icons/dungeon-pocket.svg',
    goal: "Clear rooms, choose upgrades and defeat the mini-bosses.", tips: ["Red rings and lines telegraph attacks. Dash through danger.", "Combine upgrades to build a unique hero."],
    scoreType: 'score', scoreField: 'highScore', multiplayer: false,
    records: [{ label: 'High Score', field: 'highScore', fmt: 'num' }, { label: 'Deepest Room', field: 'highestRoom', fmt: 'num' }],
    controls: { keyboard: true, touch: true, gamepad: true },
    controlsText: ['WASD — Move', 'Mouse / Arrows — Aim', 'Click / Space — Attack · Shift — Dash'],
    theme: { accent: '#ffb347', background: 'radial-gradient(800px 500px at 50% 30%, #8b5cff30, transparent), linear-gradient(160deg, #130d2a, #261444)' },
  },
];

/** Home screen shelves. `ids` are explicit lists; `filter` selects by metadata; `continue` is built from recent play. */
export const SHELVES = [
  { id: 'featured', title: 'Featured', ids: ['pocketTag'] },
  { id: 'continue', title: 'Continue playing' },
  { id: 'friends', title: 'Play with friends', filter: (g) => g.multiplayer && g.multiplayer.supported },
  { id: 'cozy', title: 'Cozy & creative', ids: ['dreamBoutique', 'sweetheartCafe', 'glamStudio'] },
  { id: 'quick', title: 'Quick games', ids: ['turboSnake', 'brickBlast', 'neonDodge'] },
  { id: 'action', title: 'Action', ids: ['grappleRush', 'asteroidDash', 'dungeonPocket'] },
  { id: 'racing', title: 'Racing', ids: ['driftCircuit'] },
];

// ---- helpers shared by the console UI and the profile screen
import { formatTime, formatScore } from './util.js';

// every game that declares multiplayer is also listed under the Multiplayer filter
for (const g of GAMES) if (g.multiplayer && g.multiplayer.supported && !g.categories.includes('multiplayer')) g.categories.push('multiplayer');

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
export const gameBySlug = (slug) => GAMES.find((g) => g.slug === slug) || null;
export const accentOf = (g) => g.theme.accent;

export function formatRecord(fmt, v) {
  if (v === null || v === undefined || v === 0) return '—';
  return fmt === 'time' ? formatTime(v) : formatScore(v);
}

/** Headline best for a game given a save object. */
export function headline(g, save) {
  const data = (save.games && save.games[g.id]) || {};
  const v = data[g.scoreField];
  const has = !!v && v > 0;
  return { has, text: formatRecord(g.scoreType === 'time' ? 'time' : 'num', has ? v : null), label: g.scoreType === 'time' ? 'Best time' : 'High score' };
}

/** Rows for "records" lists (skips empty ones unless `all`). */
export function recordRows(g, save, all = false) {
  const data = (save.games && save.games[g.id]) || {};
  return g.records
    .map((r) => ({ label: r.label, value: data[r.field], text: formatRecord(r.fmt, data[r.field]), has: !!data[r.field] && data[r.field] > (r.min ? r.min - 1 : 0) }))
    .filter((r) => all || r.has);
}
