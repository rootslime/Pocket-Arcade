# Pocket Arcade

**Five games. One pocket-sized arcade.** A neon-styled browser arcade built with plain HTML, CSS and ES-module JavaScript (Canvas + Web Audio). No build step, no backend, no dependencies: it runs as a static site on GitHub Pages and plays on desktop and mobile. Scores, personal bests and settings are stored in `localStorage`.

## Games

| Game | Genre | Score | Summary |
|---|---|---|---|
| **Grapple Rush** | Speedrun platformer | Best time | Cross a handcrafted 10,000 px rooftop course. Run, jump, hold to grapple glowing nodes, swing, reel in, and release to keep your momentum. 5 checkpoints, falls respawn you, the clock keeps running. Coyote time, jump buffering, camera easing, speed trails. |
| **Neon Dodge** | Survival | High score | Endless arena with authored hazard patterns (rain, lasers, sliding walls, bullet fans, homing mines, sweepers) that unlock and combine over time. Graze hazards for streak multipliers, dash through danger, collect Shield / Slow Time / x2 / Dash Charge. |
| **Turbo Snake** | Classic arcade | High score per mode | Classic mode plus Turbo mode (faster ramp, bonus food, Slow-mo / Double points / Ghost). Buffered input, swipe controls and an optional D-pad. |
| **Brick Blast** | Breakout | High score + highest level | Six levels with normal, strong, unbreakable and bonus bricks. Paddle hit position steers the ball; anti-boring angle correction; Wide / Multi-ball / Slow / Extra life drops. |
| **Asteroid Dash** | Space shooter | High score + highest wave | Momentum flying with screen wrap, splitting asteroids, saucers (wave 3+), telegraphed comets (wave 4+), upgrades (Rapid, Triple, Shield, Turbo thrust, x2), chain bonuses. |

Every game has an instructions screen, pause/resume/restart, mute, a personal best, game-over / victory panels and a Return to Arcade button. Keys common to all games: `P`/`Esc` pause, `M` mute, `R` restart (when paused or over; instant in Grapple Rush).

## Project structure

```
index.html            homepage
css/style.css         homepage + design tokens
css/game.css          shared game-page chrome (HUD, overlays, touch controls)
js/games.js           central game registry (homepage is generated from it)
js/arcade.js          homepage logic (cards, sound/motion toggles, reset dialog)
js/shell.js           shared game shell: layout, canvas scaling, loop, overlays, HUD, touch buttons, save hooks
js/storage.js         localStorage save/load with corruption-safe parsing
js/audio.js           procedural Web Audio sound effects (starts after a user gesture)
js/input.js           keyboard + multi-touch action mapper, swipe helper
js/fx.js              pooled particles, score popups, screen shake
js/util.js            math / formatting helpers
assets/icons/         card artwork (SVG) + favicon
games/<folder>/       index.html + game.js (Grapple Rush also has sim.js, level.js; Brick Blast has levels.js)
tests/                automated checks (see below)
```

## Running locally

Any static file server works (ES modules need `http://`, not `file://`).

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
# or
npx serve .
```

**GitHub Codespaces:** open the repo in a Codespace, run `python3 -m http.server 8000` in the terminal, and open the forwarded port 8000 from the *Ports* tab.

### Tests (optional)

Playwright is only needed for the tests, not the site.

```bash
node tests/levels-check.mjs   # every Brick Blast brick is reachable
node tests/grapple-bot.mjs    # headless search proves each rooftop link is solvable
node tests/e2e.mjs            # full browser QA (needs Playwright + Chromium); serves the site under /pocket-arcade/
```

## Deploying to GitHub Pages

1. Create a repository (e.g. `pocket-arcade`) and push this project to the `main` branch.
2. Open the repository **Settings**.
3. Click **Pages** in the sidebar.
4. Under **Build and deployment → Source** choose **Deploy from a branch**, then select branch `main` and folder `/ (root)`.
5. Click **Save**; the first publish takes a minute or two.
6. Open `https://<your-username>.github.io/pocket-arcade/`.

All paths are relative, so the site works from a sub-path such as `/pocket-arcade/` (`tests/e2e.mjs` verifies this).

## Adding another game

1. Create `games/my-game/` containing `index.html` (copy any existing game's `index.html`, change the `<title>`) and `game.js`.
2. In `game.js`, `import { createShell } from '../../js/shell.js'` and call it with a config (id, title, accent, `size`, `hud`, `best`, `keys`, optional `touch` / `modes`, `instructions`, and callbacks `reset(mode)`, `update(dt)`, `render(ctx, W, H)`). Use `shell.sfx.play('name')`, `shell.hud(id, text)` and `shell.finish({ win, score, stats, extras })`. Reuse `Particles`, `Popups`, `Shake` from `js/fx.js`.
3. Add default save fields in `js/storage.js` (`defaults().games`) if you want typed defaults (unknown games are still saved safely), and register the game in `js/games.js`.
4. Add an artwork SVG in `assets/icons/`.
5. Test with a server mounted on a sub-path (as in `tests/serve.mjs`) to confirm relative paths.

### `js/games.js` entry

```js
{
  id: 'myGame',                 // key in the save file
  title: 'My Game',
  description: 'One sentence pitch.',
  path: 'games/my-game/',       // folder relative to site root
  genre: 'Puzzle',
  icon: 'assets/icons/my-game.svg',
  accent: '#ff8a3d',            // card glow / button colour
  scoreType: 'score',           // 'score' or 'time' (lower is better)
  scoreField: 'highScore',      // field shown as "best" on the card
  extraField: { field: 'highestLevel', label: 'Level' },   // optional
}
```

## Save data

Stored under `localStorage['pocketArcade.v1']` as `{ settings: { muted, reducedMotion, ... }, games: { grappleRush: { bestTime }, neonDodge: { highScore }, turboSnake: { highScore, classicHigh, turboHigh }, brickBlast: { highScore, highestLevel }, asteroidDash: { highScore, highestWave } } }`. Invalid or corrupted data falls back to defaults field by field. "Reset saved data" on the homepage clears scores (sound and motion settings are kept).
