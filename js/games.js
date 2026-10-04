// Central game registry. The homepage builds its cards from this list.
// To add a game: create games/<folder>/ and add one entry here (see README).
//
//  id          unique key; also the key used in the save file (storage.js)
//  title       card + page title
//  description one-sentence pitch
//  path        folder (relative to the site root) containing index.html
//  genre       category label
//  icon        card artwork (relative to the site root)
//  accent      CSS colour used for the card glow / button
//  scoreType   'time' (lower is better), 'score' or 'level' – drives the "Best" label
//  scoreField  field in the save file to display
//  extraField  optional secondary field (e.g. highest level) and its label
export const GAMES = [
  {
    id: 'grappleRush',
    title: 'Grapple Rush',
    description: 'Swing across neon rooftops and chase the fastest time. Release at the right moment to fling yourself across the gap.',
    path: 'games/grapple-rush/',
    genre: 'Speedrun Platformer',
    icon: 'assets/icons/grapple-rush.svg',
    accent: '#2de2e6',
    scoreType: 'time',
    scoreField: 'bestTime',
  },
  {
    id: 'neonDodge',
    title: 'Neon Dodge',
    description: 'Survive an arena of lasers, walls and homing mines. Graze hazards for bonus points and grab power-ups.',
    path: 'games/neon-dodge/',
    genre: 'Survival',
    icon: 'assets/icons/neon-dodge.svg',
    accent: '#ff3cac',
    scoreType: 'score',
    scoreField: 'highScore',
  },
  {
    id: 'turboSnake',
    title: 'Turbo Snake',
    description: 'The classic you know, plus a Turbo mode with power-ups, bonus food and ghost mode.',
    path: 'games/turbo-snake/',
    genre: 'Classic Arcade',
    icon: 'assets/icons/turbo-snake.svg',
    accent: '#5dff8f',
    scoreType: 'score',
    scoreField: 'highScore',
  },
  {
    id: 'brickBlast',
    title: 'Brick Blast',
    description: 'Smash through six handcrafted levels. Aim with your paddle, catch power-ups and keep the ball alive.',
    path: 'games/brick-blast/',
    genre: 'Breakout',
    icon: 'assets/icons/brick-blast.svg',
    accent: '#ffe14d',
    scoreType: 'score',
    scoreField: 'highScore',
    extraField: { field: 'highestLevel', label: 'Level' },
  },
  {
    id: 'asteroidDash',
    title: 'Asteroid Dash',
    description: 'Blast rocks, dodge mines and survive endless waves with momentum-based flying and upgrades.',
    path: 'games/asteroid-dash/',
    genre: 'Space Shooter',
    icon: 'assets/icons/asteroid-dash.svg',
    accent: '#8b5cff',
    scoreType: 'score',
    scoreField: 'highScore',
    extraField: { field: 'highestWave', label: 'Wave' },
  },
];
