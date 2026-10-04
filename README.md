# Pocket Arcade

**Eleven games. One pocket-sized arcade.** A neon console-style arcade built with plain HTML, CSS and ES-module JavaScript (Canvas, DOM and Web Audio). It runs as a **static site on GitHub Pages**: no build step, no server of your own. Players can **play instantly as a guest**, or create a free account (Supabase Auth) to get cloud saves, cross-device XP, achievements and a profile. **Pocket Tag** adds bots, same-screen play and optional **online rooms** (Supabase Realtime).

* Console-style launcher: horizontal game library, game detail screens, dashboard, library filters, achievements, profile and settings
* Keyboard, mouse, touch **and gamepad** navigation and controls
* Arcade-wide XP / level, 88 achievements, cosmetic rewards (titles, avatars, borders, themes)
* Multiplayer screen: Quick Play, Create / Join Room (5-letter codes), Local Play and Play with Bots, driven by each game's `multiplayer` config
* Guest mode is complete: all eleven games, local saves, local achievements, bots and local multiplayer. Accounts only add sync; online play needs a realtime service (see *Multiplayer setup*)

## Games

| Game | Category | Score | Summary |
|---|---|---|---|
| **Pocket Tag** | Action / Multiplayer | High score, longest escape | The playground classic, turbocharged: run, sprint, slide, vault, jump and dash through four maps in Classic Tag, Freeze Tag, Infection and Crown Chase. 2–8 players: bots (3 difficulties), same-screen local play, or online rooms. |
| **Grapple Rush** | Action | Best time | Swing across a handcrafted rooftop course. Hold to grapple, release at the right moment to keep your speed. Checkpoints, coyote time, jump buffering. |
| **Asteroid Dash** | Action / Arcade | High score, best wave | Momentum-based space shooter: splitting asteroids, saucers, telegraphed comets, upgrades. |
| **Dungeon Pocket** | Action | High score, deepest room | Twin-stick dungeon survival. Readable enemy telegraphs (slimes, bats, imps, golems), a mini-boss every 5 rooms, 14 stackable upgrades (3 to choose from every two rooms). |
| **Neon Dodge** | Arcade | High score | Endless survival with authored hazard patterns, near-miss streaks, dash and four power-ups. |
| **Brick Blast** | Arcade | High score, highest level | Breakout with six levels, four brick types, angle-controlled paddle and power-ups. |
| **Turbo Snake** | Classic | High score per mode | Classic and Turbo (power-ups, bonus food) Snake with buffered input and swipe / D-pad. |
| **Drift Circuit** | Racing | Best race time, best lap, drift score | Top-down drift racing on three tracks with boost pads, dirt shortcuts, DRIFT / MEGA DRIFT scoring and medals. |
| **Dream Boutique** | Creative / Cozy | High score, best outfit | Read the brief, style an outfit from ~50 procedural wardrobe items. Scoring is deterministic and explained (theme match, colour harmony, required pieces, accessories, bonus). Winning unlocks items. |
| **Sweetheart Café** | Cozy | High score, best shift | Café management: stations, tray, guests with patience, combos, tips, six shifts, coin shop with cosmetic decorations. |
| **Glam Studio** | Creative | High score, challenges won | Timed themed makeover challenges or a no-pressure Creative mode with a saved-look gallery (looks are stored as configuration data and recreated on load). |

All art is original procedural SVG / Canvas / CSS. No external assets, brands or characters.

## Project structure

```
index.html            console UI shell
css/style.css         console UI        css/game.css  shared in-game chrome
js/
  games.js            central game registry (everything in the UI is generated from it)
  arcade.js           console UI: home / library / detail / achievements / profile / settings
  auth.js             Supabase Auth wrapper (sign up / in / out / reset / Google), friendly errors
  auth-ui.js          account dialogs (sign in, create account, forgot / reset password, migration)
  cloud-save.js       cloud sync: pull → merge → push, offline-safe
  config.js           ← public client configuration goes here
  session.js          cheap peek at the persisted session (picks the local save namespace)
  storage.js          localStorage saves (guest + per-account cache), merge logic, sanitising
  progression.js      XP, levels, rewards, anti-exploit rules, run recording
  achievements.js     all 88 achievement definitions + evaluation
  multiplayer.js      public identity, display-name hygiene, realtime link (reconnects), interpolation
  rooms.js            room codes, presence-based membership, ready, host handover, public matchmaking
  lobby.js            reusable lobby UI (menu, setup, room) for any multiplayer game
  presence.js         online status for signed-in players (🟢 🟡 🎮 ⚫)
  profile.js          avatars, profile dashboard helpers
  shell.js            shared game shell (overlays, HUD, canvas/DOM stage, touch, pause, finish → progression)
  gamepad.js nav.js   controller support + spatial menu navigation
  audio.js input.js fx.js toast.js ui.js util.js colors.js
games/<slug>/         index.html + game.js (+ data/sim/level modules, style.css for DOM games)
games/pocket-tag/     sim.js (rules + physics, pure) · bots.js · maps.js · net.js · render.js · game.js
supabase/schema.sql   database tables + Row Level Security
tests/                automated checks (see "Testing")
```

## Running locally

Any static file server works (ES modules need `http://`, not `file://`).

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
# or: npx serve .
```

**GitHub Codespaces:** open the repo in a Codespace, run `python3 -m http.server 8000`, then open the forwarded port 8000 from the *Ports* tab.

With no configuration the arcade runs in **guest mode** (Sign In explains that accounts are not set up). Everything else works.

## Deploying to GitHub Pages

1. Push the repository to GitHub (branch `main`).
2. Open the repository **Settings**.
3. Click **Pages**.
4. Under **Build and deployment → Source** choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
5. Wait a minute or two.
6. Open `https://<your-username>.github.io/<repo-name>/`.

Every path is relative, so the site works from a sub-path like `/Pocket-Arcade/` (verified by the tests, which serve it under `/pocket-arcade/`).

---

## Authentication setup (optional, enables accounts and cloud saves)

### 1. Which provider, and why

**Supabase** (Auth + Postgres). It has a generous free tier, hosted email/password and Google sign-in, an official browser SDK (`@supabase/supabase-js`) that handles sessions, token refresh and PKCE, and **Row Level Security**, which lets a static site talk to the database safely using only a public key. Passwords are handled entirely by Supabase; this repo never sees, hashes or stores them.

### 2. Create the free project

1. Sign up at <https://supabase.com> and click **New project** (free plan). Pick a name, a database password (keep it private, it is not used by the app) and a region.
2. When it is ready open **Project Settings → API** and note the **Project URL** and the **anon public** key. (Never use the `service_role` key anywhere in this repo.)

### 3. Create the tables and security policies

1. Open **SQL Editor → New query**.
2. Paste the whole contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. (It is safe to run twice.)

This creates:

| Table | Purpose | Who can access |
|---|---|---|
| `profiles` | `id`, `display_name`, `avatar`, `created_at`: the *public-facing* identity only. No email, no progress. A trigger creates the row on sign-up. | owner only (RLS) |
| `player_data` | `user_id`, `data jsonb` (settings, records, XP, achievements, stats, unlocks), `updated_at`. Size-limited by a CHECK constraint. | owner only (RLS) |

Row Level Security is **enabled** on both tables with policies `auth.uid() = id / user_id` for select, insert, update and delete, and all access is revoked from the `anon` role. The user id always comes from the verified JWT (`auth.uid()`), never from client input, so one player cannot read or modify another's rows. If you later add public leaderboards, create a *separate* table/view that contains only intentionally public columns.

### 4. Enable email + password

**Authentication → Providers → Email** is enabled by default. Choices:

* **Confirm email** (recommended): new users get a confirmation link; the arcade tells them to check their inbox.
* Disable it under **Authentication → Providers → Email → Confirm email** if you want instant sign-in for testing.

### 5. (Optional) Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** (type *Web application*).
2. Add the **Authorized redirect URI** shown in Supabase under **Authentication → Providers → Google** (`https://<project-ref>.supabase.co/auth/v1/callback`).
3. Paste the Client ID and secret into the Supabase Google provider and enable it.
4. In `js/config.js` set `googleEnabled: true`. The *Continue with Google* button appears on the sign-in and sign-up dialogs.

### 6. Add your site URLs (redirects)

**Authentication → URL Configuration:**

* **Site URL**: your deployed arcade, e.g. `https://<user>.github.io/<repo>/`
* **Redirect URLs** (add each): `https://<user>.github.io/<repo>/` and, for local testing, `http://localhost:8000/`

These are used for email confirmation links, password-reset links and Google sign-in. The app always sends the arcade's own home URL (the directory of `index.html`), so a GitHub Pages sub-path works.

### 7. Put the public configuration in `js/config.js`

```js
export const AUTH_CONFIG = {
  provider: 'supabase',
  url: 'https://<project-ref>.supabase.co',
  anonKey: '<anon public key>',
  googleEnabled: false, // true once Google is enabled
};
```

The anon key is **designed to be public**: it is safe in frontend code *because* Row Level Security protects the data. Commit it, push, and the Sign In button starts working. Leave both strings empty and the arcade stays in guest mode: nothing breaks.

### 8. How cloud saves work

* Signed-in players get a **per-account local cache** (`pocketArcade.u.<id>`) which is wiped on log out, and a **cloud copy** in `player_data`.
* After every save the app syncs: it **pulls** the cloud copy, **merges** (best score / best time / highest level & wave = best of both, XP and counters = max, achievements = union with the earliest date, unlocks = union), then **pushes** if anything changed. Playing on two devices never loses progress.
* Syncing is debounced, retried with back-off while offline, and also runs when you leave the page. Games keep working with no connection.
* The synced document contains: preferences, records, XP / level, achievements, per-game statistics and game unlock data. Passwords and emails are never in it.

### 9. Guest → account migration

Guests save to `localStorage` (`pocketArcade.v1`). When someone signs in on a device that holds guest progress, the arcade shows a summary and asks **Transfer to my account** or **Keep separate**. Transfer merges the guest save into the account (counters and XP add up, bests are kept) and then clears the guest copy. You can also run it later from **Settings → Account → Transfer**.

### 10. Security notes

* Real authentication only (Supabase sessions). `localStorage` is never treated as identity.
* No passwords, hashes or service keys in the repo; the test suite scans for them.
* Row Level Security, owner-only policies, no anonymous access, size-limited documents.
* XP / achievements are computed client-side, so a determined player can tamper with *their own* save. This is unavoidable for a static game; XP is cosmetic and never affects gameplay. Basic protections: no XP for runs under 20 s, per-run cap, replay and hourly soft caps, input sanitising on load and on cloud merge, size limits server-side.
* To add rate limiting, CAPTCHA or stricter password rules use the Supabase dashboard (**Authentication → Rate Limits / Attack Protection / Providers**).

---

---

## Pocket Tag

*Run. Chase. Don’t get tagged.* A fast, colourful tag game for 2–8 players (humans and bots).

**Modes**

| Mode | How it works |
|---|---|
| **Classic Tag** | One player is **It**. Points for every second you are *not* It; a bonus if you aren’t It at the buzzer. After a tag the previous It is protected for ~1.8 s (no instant tag-back) and the new It is briefly dazed. |
| **Freeze Tag** | Taggers freeze runners; a runner who stands next to a frozen teammate for ~0.8 s thaws them. Taggers win if everyone is frozen, runners win if someone survives. |
| **Infection** | One player starts infected; everyone they tag joins them. The last survivor gets a large bonus. |
| **Crown Chase** | Everyone chases the crown holder; tagging them steals the crown. Most crown time wins. |

**Maps** (original, symmetrical and checked for connectivity by the tests): *Playground* (slides, benches, tunnels, climbing frame), *Rooftop* (ramps, vents, 2–3 tile gaps; falling respawns you on the roof), *Neon Mall* (escalators, stores, atrium, upper/lower halls), *Water Park* (pools slow you, bridges and slides are fast).

**Movement**: run, **sprint** (stamina bar), **jump**, **slide** (under tunnels and pipes, keeps momentum), **dash** (cooldown), automatic **vaulting** over low obstacles, ramps that launch you, conveyor slides. There are no collisions between players, so nobody can be body-blocked.

**Power-ups** (optional, the host can switch them off): ⚡ speed burst, 🛡️ shield (blocks one tag), 👻 ghost (pass through obstacles), ❄️ slow zone, 💨 dash refill. All are short and modest, so skill still decides matches.

**Controls**: WASD / arrows to run · Shift sprint · Space / Enter jump · C / . slide · F / / dash. Controller: left stick (full push sprints), A jump, B slide, X dash. Touch: drag anywhere to run (push to the edge to sprint) and the JUMP / SLIDE / DASH buttons. **Local play**: Player 1 WASD, Player 2 arrow keys, further players use controllers.

**Bots** (Easy / Normal / Hard) path-find around obstacles, chase, flee (using a “safety map” so they run around loops rather than into corners), use sprint / dash / slide with the same stamina and cooldowns as you, make occasional mistakes, and never react faster than 250 ms. Difficulty changes reaction time, accuracy, mistakes and how often abilities are used, not speed or perception.

## Multiplayer

### What works where

| Option | Needs a realtime service? |
|---|---|
| **Play with Bots** | No |
| **Local Play** (same device, up to 4 players) | No |
| **Create Room / Join Room / Quick Play** | **Yes** (Supabase Realtime) |

If the service isn’t configured the online buttons are not shown (the screen explains why). Bots and local play always work. Nothing pretends to be online.

### Multiplayer in the other games

Every mode below is real and tested; modes that need online play simply don’t appear until a realtime service is configured.

| Game | Mode | Players | Where it works |
|---|---|---|---|
| **Turbo Snake** | **Snake Battle**: shared arena, last snake alive wins (food, knock-out trails, head-on = both out) | 2–4 | bots · same screen · online (host runs the simulation, 8 state updates/s) |
| **Brick Blast** | **Brick Battle**: identical bricks and capsule drops from a shared seed, highest score wins | 2–4 | pass-and-play on one device · online (everyone plays at once, live opponent scores) |
| **Neon Dodge** | **Last Standing**: everyone faces the same seeded hazard sequence; last player alive wins | 2–6 | online only |
| **Drift Circuit** | **Multiplayer Race**: same track, positions streamed and interpolated, finish times decide, *Photo Finish* achievement | 2–6 | online only |
| **Asteroid Dash** | **Co-op**: shared battlefield and waves, individual lives and scores, no friendly fire | 2–4 | same screen only (online co-op would need an authoritative server) |

These use the shared `js/mp-kit.js` helpers (lobby, connection banner, host handover, standings, `PeerBoard` for score/progress heartbeats) on top of `js/rooms.js`.

### Multiplayer setup (Supabase Realtime)

Pocket Arcade reuses the same Supabase project as accounts. **Realtime Broadcast and Presence need no tables and no SQL.**

1. Put the project URL and anon key in `js/config.js` (see *Authentication setup*, step 7). Guests can play online too; accounts are not required.
2. In the Supabase dashboard open **Realtime → Settings** (or **Project Settings → Realtime**) and make sure **Allow public access** is enabled (default for new projects). Rooms use public Broadcast/Presence channels so guests can join without signing in.
3. That’s it. Deploy to GitHub Pages as usual.

**Free-tier limits.** Supabase’s free plan limits concurrent connections, messages per second and monthly messages (check the current numbers on their pricing page). A running match uses roughly: each human ≈ 8 position updates/s, the host ≈ 8 combined bot + rules updates/s. If you hit limits lower `POS_HZ` / `HOST_HZ` in `games/pocket-tag/net.js`; interpolation hides lower rates. A few friends playing is comfortable on the free tier; a popular public arcade would need a paid plan or your own game server.

### How it works

* **Rooms**: a room is a Realtime channel `pa:room:<game>:<CODE>`. It exists while someone is present in it. Codes are 5 characters from an alphabet without look-alikes (`K7P4Q`). Joining a code nobody is in says “No room with that code”. Full rooms, matches in progress and duplicate players (same player id in two tabs) are refused with a clear message.
* **Quick Play** uses a second channel where public rooms advertise (code, players, state). You join the fullest open room, or become the host of a new public one; a public room starts a 15 s countdown once two players are in.
* **Host** = the player who has been in the room longest. Settings, ready flags and the roster are presence data. If the host leaves, the next player takes over automatically (in a lobby *and* mid-match, continuing from the last state snapshot).
* **Network model for Pocket Tag**: every player simulates their *own* movement locally (no input lag = client-side prediction) and sends it ~8×/s. Other players are drawn ~130 ms in the past and interpolated, with brief extrapolation if packets are late. The **host runs the rules and the bots**: it validates positions (an impossible jump is corrected with a `corr` message), resolves tags (a client says “I touched X”; the host checks recent positions with lag compensation), and broadcasts compact rule snapshots, bot positions and one-off events.
* **Connection handling**: `CONNECTING… / CONNECTED / CONNECTION LOST / RECONNECTING…` is shown; the link retries with back-off. A player who drops is replaced by a bot after 2 s and gets their character back if they return within 25 s. Nothing leaves players on a dead loading screen: if reconnecting fails the match ends with an explanation.
* **Public data only**: display name (max 16 chars, sanitised, never inserted as HTML), arcade level, avatar and border, a random per-device public player id, and online status. Email, tokens and the account id are never sent. Guests get a generated name like `NeonRunner18`.
* **Presence** (🟢 ONLINE · 🟡 IN LOBBY · 🎮 IN GAME · ⚫ OFFLINE) is shown for signed-in players who leave *Show my online status* on (Settings). Guests are never listed.
* **Friends**: share the room code or the invite link (`#/multiplayer?game=pocketTag&code=K7P4Q`). No contacts access.

### Security and honesty about cheating

Messages are validated (shape, ranges, membership, host-only commands), rooms can’t be started by non-hosts, scores are computed only by the host, and impossible movement is corrected. **But this is a casual, client-authoritative design:** the browser is untrusted, Realtime messages carry a self-declared sender key, and someone who reads the source can forge messages (for example claim to be the host in a room they join). Strong competitive anti-cheat requires an authoritative game server (for example a Supabase Edge Function / Colyseus / a small Node server holding the simulation), which a purely static site cannot provide. XP from multiplayer matches is cosmetic and rate-limited like everything else.

### Adding multiplayer to another game

Declare it in `js/games.js`:

```js
multiplayer: { supported: true, minPlayers: 2, maxPlayers: 8, bots: true, local: true, online: true, players: '2–8 players', modes: ['…'] }
```

The Multiplayer screen, library and detail pages then show exactly the buttons the game supports (online ones only when a realtime service is configured). In the game, create the lobby with `createLobby({ game, schema, defaults, onStart })` from `js/lobby.js` (the schema describes the host’s settings) and use `Room` (`js/rooms.js`) + `Track` / `Ticker` (`js/multiplayer.js`) for messages, interpolation and send rates. `games/pocket-tag/game.js` is the reference.

---

## Progression, achievements and rewards

* **XP** comes from finishing runs (time played, first time in a game, personal bests, victories, game milestones and achievements). Runs under 20 s earn nothing, so start-and-quit does not farm XP.
* **Arcade level**: level *n* needs `100 + 50 × (n − 1)` XP. Levels unlock cosmetic titles (Rookie → Pocket Legend), avatars, profile borders and console themes. Cosmetics never change gameplay.
* **88 achievements** (6 arcade-wide + 5-10 per game, including Pocket Tag’s *You’re It!*, *Can’t Catch Me*, *Tag Master*, *Last One Standing* and *Party Time*). Unlocks show an animated toast and are listed with dates under *Achievements* and on each game's detail screen.

## Controls and controller support

Every game supports keyboard, touch and (where it makes sense) a gamepad; the creative / management games are pointer-first. Console navigation: arrow keys / D-pad move focus, Enter / A selects, Esc / B goes back. `CONTROLLER CONNECTED` appears when a pad is detected.

## Adding another game

1. Create `games/my-game/` with `index.html` (copy an existing one) and `game.js`.
2. In `game.js` call `createShell({...})` from `js/shell.js` (canvas games provide `size`, `reset`, `update`, `render`; DOM games set `dom: true`). Use `shell.finish({ score, facts, counters, milestones, stats })` to end a run; the shell records XP, stats, achievements and cloud sync for you. Add `gamepad` / `touch` / `modes` as needed.
3. Add an entry to `js/games.js` (see the field list at the top of that file) and artwork in `assets/icons/`. The home carousel, library, detail screen, profile records and filters pick it up automatically.
4. Add achievements to `js/achievements.js` (and default save fields in `js/storage.js` for typed defaults).
5. Test under a sub-path: `node tests/serve.mjs` serves the repo at `/pocket-arcade/`.

## Testing

```bash
node tests/levels-check.mjs      # Brick Blast: every brick reachable
node tests/grapple-bot.mjs       # Grapple Rush: every rooftop link solvable
node tests/drift-bot.mjs         # Drift Circuit: bot completes every track; drifting scores
node tests/boutique-score.mjs    # Dream Boutique scoring is deterministic and reachable
node tests/tag-sim.mjs           # Pocket Tag: maps connected, all modes × maps with bots, rules, movement, bot limits
node tests/e2e-games.mjs         # all games in a real browser (Playwright + Chromium)
node tests/e2e-multiplayer.mjs   # Pocket Tag + multiplayer: bots, local, rooms, sync, host handover, reconnects, validation
node tests/battle-sim.mjs        # Snake Battle rules + bots (headless)
node tests/e2e-battle.mjs        # Snake Battle in the browser: bots, local, online, host handover
node tests/e2e-mpgames.mjs       # Neon Dodge Last Standing, Brick Battle, Drift race, Asteroid co-op (ONLY=dodge|brick|drift|coop to run one)
node tests/e2e-console.mjs       # console UI, navigation, gamepad, guest progression
node tests/e2e-auth.mjs          # accounts, sync, migration, password reset (mock Supabase)
```

The browser tests need Playwright (`npm i playwright && npx playwright install chromium`); adjust the `require` path in `tests/lib.mjs` if it is not installed at `/node-tools`. The multiplayer tests run Pocket Arcade’s real room / lobby / networking code against an in-browser mock of Supabase Realtime (tabs talk through `BroadcastChannel`, with switchable outage / latency / loss). That verifies our protocol, host handover, reconnection and validation, **not** Supabase’s service, latency or limits: do a manual two-device test after configuring your project. The auth tests run the app's real account code against an in-browser mock of the Supabase client, which verifies our integration and error handling. They cannot prove Supabase's own policies, so after setting up your project do this manual check: sign up two test users, then in the browser console of user B run `(await supabase.from('player_data').select('*')).data` and confirm only B's row is returned.
