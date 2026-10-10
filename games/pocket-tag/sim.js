// Pocket Tag simulation: movement physics, tagging rules for all four modes, power-ups and scoring.
// Pure logic (no DOM, no network) so it runs the same in the browser, in bots and in headless tests.
//
// Roles
//   'auth'     solo / local / online host. Runs the rules and the bots and is the source of truth.
//   'follower' online client. Simulates only its own movement; rules arrive as snapshots from the host.
import { TILE, mapById, prepareMap, walkableForNav } from './maps.js';
import { thinkBot, buildNav } from './bots.js';

export const R = 11;                          // body radius
export const PH = {
  run: 205, sprint: 285, accel: 1500, airAccel: 650, decel: 1700, overRate: 3.2,
  jumpV: 420, grav: 1350, vaultV: 300, vaultT: 0.5, lowZ: 14, coyote: 0.1, jumpBuf: 0.12,
  dashV: 560, dashT: 0.16, dashCd: 2.2, slideT: 0.55, slideCd: 0.8, slideV: 320,
  stamMax: 100, stamDrain: 26, stamRegen: 18, stamDelay: 0.7, exhaustBelow: 0, exhaustUntil: 25,
  waterMul: 0.55, slowMul: 0.55, speedMul: 1.3, dazeMul: 0.5,
  chaseMul: { classic: 1.0, freeze: 0.98, infection: 0.92, crown: 1.0 },
  conveyor: 1500, conveyorMax: 330, rampV: 440, rampPush: 180,
  reach: 26, dashReach: 32, tagDz: 26, claimSlack: 30, protAfterTag: 1.8, thawTime: 0.8, thawReach: 34,
  dazeT: 0.7, countdown: 3, fallTime: 0.55, fallStun: 0.6, maxPlausible: 900,
};

export const MODES = {
  classic: { id: 'classic', label: 'Classic Tag', dur: 90, blurb: 'One player is It. Don’t be It when the timer hits zero.' },
  freeze: { id: 'freeze', label: 'Freeze Tag', dur: 120, blurb: 'Taggers freeze runners. Runners thaw teammates.' },
  infection: { id: 'infection', label: 'Infection', dur: 120, blurb: 'Tagged players join the infected. Be the last survivor.' },
  crown: { id: 'crown', label: 'Crown Chase', dur: 120, blurb: 'Tag the crown holder to steal the crown. Hold it longest.' },
};
export const MODE_LIST = Object.values(MODES);

export const PICKUPS = {
  speed: { icon: '⚡', label: 'SPEED', dur: 5 },
  shield: { icon: '🛡️', label: 'SHIELD', dur: 10 },
  ghost: { icon: '👻', label: 'GHOST', dur: 5 },
  slow: { icon: '❄️', label: 'SLOW ZONE', dur: 5 },
  dash: { icon: '💨', label: 'DASH', dur: 0 },
};
const PICK_WEIGHTS = [['speed', 0.26], ['dash', 0.26], ['shield', 0.2], ['slow', 0.16], ['ghost', 0.12]];

export const COLORS = ['#ff4d6d', '#2de2e6', '#ffe14d', '#5dff8f', '#c78bff', '#ff8a3d', '#4d9bff', '#ff8ad8'];

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

// flag bits sent over the network / used by the renderer
export const FL = { air: 1, slide: 2, dash: 4, fall: 8, vault: 16, stun: 32 };

export function makePlayer(idx, info, spawn) {
  return {
    idx, id: info.id, name: info.name, color: COLORS[idx % COLORS.length], level: info.level || 1, avatar: info.avatar || 'initials',
    ctrl: info.ctrl || 'bot',            // 'local' | 'remote' | 'bot' (also used for disconnected players)
    human: !!info.human, diff: info.diff || 'normal', slot: info.slot || 0,
    x: spawn.x, y: spawn.y, z: 0, vx: 0, vy: 0, vz: 0, fx: 1, fy: 0,
    stam: PH.stamMax, exhausted: false, sprintIdle: 0, dashCd: 0, dashT: 0, dashDx: 1, dashDy: 0, slideT: 0, slideCd: 0,
    coyote: 0, jumpBuf: 0, grounded: true, falling: 0, stun: 0, vaultT: 0, safeX: spawn.x, safeY: spawn.y, safeT: 0, tile: '.', sprinting: false,
    score: 0, tags: 0, tagged: 0, escape: 0, bestEscape: 0, held: 0, dist: 0, thaws: 0, pickups: 0,
    it: false, frozen: false, infected: false, crown: false, role: 'runner', thaw: 0,
    prot: 0, shieldT: 0, speedT: 0, ghostT: 0, daze: 0, tagCd: 0, lastBy: -1, lastAt: -99, left: false, away: false, awayT: 0,
    hist: [], bot: null, flags: 0,
  };
}

export class World {
  /**
   * opts: { mapId, mode, seed, roster:[{id,name,ctrl,human,diff,level,avatar}], role, powerups, dur, practice }
   */
  constructor(opts) {
    this.map = prepareMap(mapById(opts.mapId));
    this.nav = buildNav(this.map);
    this.hasGaps = !!this.nav.gap;
    this.mode = MODES[opts.mode] ? opts.mode : 'classic';
    this.role = opts.role || 'auth';
    this.powerups = opts.powerups !== false;
    this.seed = opts.seed >>> 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.time = 0; this.el = 0;
    this.dur = opts.dur || MODES[this.mode].dur;
    this.left = this.dur;
    this.phase = 'countdown'; this.cd = PH.countdown;
    this.ev = [];
    this.zones = [];
    this.winnersTeam = null;
    this.lastSurvivor = -1;
    this.over = false; this.resultCache = null;
    const spawns = this.map.spawns.slice();
    const sr = mulberry32(this.seed ^ 0x51ed);
    for (let i = spawns.length - 1; i > 0; i--) { const j = Math.floor(sr() * (i + 1)); [spawns[i], spawns[j]] = [spawns[j], spawns[i]]; }
    this.players = opts.roster.map((r, i) => makePlayer(i, r, spawns[i % spawns.length]));
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.players.forEach((p) => { if (p.ctrl === 'bot') p.bot = { diff: p.diff }; });
    this.pk = this.map.pickups.map((s, i) => ({ id: i, x: s.x, y: s.y, kind: null, cd: 3 + i * 0.7 }));
    this.assignRoles();
  }

  // ------------------------------------------------------------------ roles
  active() { return this.players.filter((p) => !p.left); }
  assignRoles() {
    const act = this.active();
    const r = this.rng;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    if (this.mode === 'classic') pick(act).it = true;
    else if (this.mode === 'infection') pick(act).infected = true;
    else if (this.mode === 'crown') pick(act).crown = true;
    else if (this.mode === 'freeze') {
      const n = act.length <= 6 ? 1 : 2;
      const pool = act.slice();
      for (let i = 0; i < n && pool.length; i++) { const k = Math.floor(r() * pool.length); pool[k].role = 'tagger'; pool.splice(k, 1); }
      act.forEach((p) => { if (p.role !== 'tagger') p.role = 'runner'; });
    }
    if (this.mode !== 'freeze') this.players.forEach((p) => { p.role = 'runner'; });
  }

  isChaser(p) {
    if (p.left) return false;
    switch (this.mode) {
      case 'classic': return p.it;
      case 'freeze': return p.role === 'tagger';
      case 'infection': return p.infected;
      default: return !p.crown;
    }
  }
  /** a player who is currently "safe" and being chased (counts for survival scoring) */
  isEvader(p) {
    if (p.left) return false;
    switch (this.mode) {
      case 'classic': return !p.it;
      case 'freeze': return p.role === 'runner' && !p.frozen;
      case 'infection': return !p.infected;
      default: return p.crown;
    }
  }
  isHighlighted(p) { return this.mode === 'crown' ? p.crown : this.isChaser(p) && this.mode !== 'crown'; }

  canTag(a, b) {
    if (a === b || a.left || b.left) return false;
    if (a.frozen || a.stun > 0 || a.falling > 0 || a.tagCd > 0) return false;
    if (b.stun > 0 || b.falling > 0 || b.prot > 0) return false;
    switch (this.mode) {
      case 'classic': return a.it && !b.it;
      case 'freeze': return a.role === 'tagger' && b.role === 'runner' && !b.frozen;
      case 'infection': return a.infected && !b.infected;
      default: return !a.crown && b.crown;
    }
  }

  // ------------------------------------------------------------------ tiles
  tile(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return '#';
    return this.map.rows[ty][tx];
  }
  blocks(ch, p) {
    if (ch === '#') return true;
    if (ch === 'b') return !(p.z >= PH.lowZ || p.ghostT > 0 || p.vaultT > 0);
    if (ch === 'o') return !(p.slideT > 0 || p.ghostT > 0);
    return false;
  }
  resolve(p) {
    const r = R;
    const x0 = Math.floor((p.x - r) / TILE), x1 = Math.floor((p.x + r) / TILE);
    const y0 = Math.floor((p.y - r) / TILE), y1 = Math.floor((p.y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h ? '#' : this.map.rows[ty][tx];
        if (!this.blocks(ch, p)) continue;
        const rx = tx * TILE, ry = ty * TILE;
        const nx = clamp(p.x, rx, rx + TILE), ny = clamp(p.y, ry, ry + TILE);
        let dx = p.x - nx, dy = p.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), push = r - d;
          dx /= d; dy /= d;
          p.x += dx * push; p.y += dy * push;
          const vn = p.vx * dx + p.vy * dy;
          if (vn < 0) { p.vx -= vn * dx; p.vy -= vn * dy; }
        } else {
          // centre inside the tile: push out along the shallowest axis
          const l = p.x - rx, rr = rx + TILE - p.x, t = p.y - ry, bt = ry + TILE - p.y;
          const m = Math.min(l, rr, t, bt);
          if (m === l) { p.x = rx - r; p.vx = Math.min(p.vx, 0); } else if (m === rr) { p.x = rx + TILE + r; p.vx = Math.max(p.vx, 0); } else if (m === t) { p.y = ry - r; p.vy = Math.min(p.vy, 0); } else { p.y = ry + TILE + r; p.vy = Math.max(p.vy, 0); }
        }
      }
    }
  }

  // ------------------------------------------------------------------ movement
  /** Advance one body. inp: { mx, my, sprint, jump, slide, dash } (jump/slide/dash are edge triggers). */
  stepPlayer(p, inp, dt) {
    if (p.left) return;
    // physics timers
    p.dashCd = Math.max(0, p.dashCd - dt); p.slideCd = Math.max(0, p.slideCd - dt);
    p.stun = Math.max(0, p.stun - dt); p.vaultT = Math.max(0, p.vaultT - dt);
    p.coyote = Math.max(0, p.coyote - dt); p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.dashT = Math.max(0, p.dashT - dt); p.slideT = Math.max(0, p.slideT - dt);
    const ch0 = this.tile(p.x, p.y);

    if (p.falling > 0) {
      p.falling -= dt; p.vx *= 0.9; p.vy *= 0.9;
      if (p.falling <= 0) { p.falling = 0; p.x = p.safeX; p.y = p.safeY; p.vx = p.vy = 0; p.z = 0; p.vz = 0; p.grounded = true; p.stun = PH.fallStun; p.slideT = 0; p.dashT = 0; this.ev.push({ k: 'respawn', i: p.idx }); }
      this.setFlags(p); return;
    }
    const frozen = p.frozen || p.stun > 0 || this.phase === 'countdown';
    let mx = inp ? inp.mx : 0, my = inp ? inp.my : 0;
    let ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    if (frozen) { mx = my = 0; ml = 0; }
    const moving = ml > 0.12;
    if (moving) { p.fx = mx / ml; p.fy = my / ml; }

    // ---- sliding under tunnels: keep sliding until we are clear of an overhead tile
    if (p.slideT <= 0 && ch0 === 'o' && !frozen) p.slideT = 0.2;

    // ---- actions
    if (!frozen && inp) {
      if (inp.jump) p.jumpBuf = PH.jumpBuf;
      if (inp.slide && p.grounded && p.slideCd <= 0 && p.slideT <= 0) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 70 || moving) {
          let dx = p.vx, dy = p.vy; const dl = Math.hypot(dx, dy);
          if (dl > 40) { dx /= dl; dy /= dl; } else if (moving) { dx = mx / ml; dy = my / ml; } else { dx = p.fx; dy = p.fy; }
          const v = Math.max(sp, PH.slideV);
          p.vx = dx * v; p.vy = dy * v; p.slideT = PH.slideT; p.slideCd = PH.slideCd; this.ev.push({ k: 'slide', i: p.idx });
        }
      }
      if (inp.dash && p.dashCd <= 0 && p.dashT <= 0) {
        let dx = p.fx, dy = p.fy;
        if (moving) { dx = mx / ml; dy = my / ml; }
        p.dashDx = dx; p.dashDy = dy; p.dashT = PH.dashT; p.dashCd = PH.dashCd; p.slideT = 0;
        p.vx = dx * PH.dashV; p.vy = dy * PH.dashV; this.ev.push({ k: 'dash', i: p.idx });
      }
    }
    if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0) && ch0 !== 'o' && !frozen) {
      p.vz = PH.jumpV * (ch0 === '~' ? 0.85 : 1); p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.slideT = 0;
      this.ev.push({ k: 'jump', i: p.idx });
    }

    // ---- speed limits
    const water = ch0 === '~' && p.grounded && p.ghostT <= 0;
    let mul = 1;
    if (p.speedT > 0) mul *= PH.speedMul;
    if (water) mul *= PH.waterMul;
    if (p.daze > 0) mul *= PH.dazeMul;
    for (const z of this.zones) if (z.owner !== p.idx && Math.hypot(p.x - z.x, p.y - z.y) < z.r) { mul *= PH.slowMul; break; }
    if (this.isChaser(p)) mul *= PH.chaseMul[this.mode] || 1;
    const wantSprint = inp && inp.sprint && moving && p.grounded && !water && !p.exhausted && p.stam > 0 && p.slideT <= 0 && p.dashT <= 0;
    p.sprinting = !!wantSprint;
    const top = (wantSprint ? PH.sprint : PH.run) * mul;
    const wx = mx * top, wy = my * top;

    // ---- velocity
    if (p.dashT > 0) {
      p.vx = p.dashDx * PH.dashV; p.vy = p.dashDy * PH.dashV;
    } else {
      const sp = Math.hypot(p.vx, p.vy);
      const wl = Math.hypot(wx, wy);
      if (p.slideT > 0) {
        // low friction, weak steering
        const steer = 220 * dt;
        p.vx += mx * steer; p.vy += my * steer;
        const f = Math.max(0, 1 - 1.6 * dt); p.vx *= f; p.vy *= f;
      } else if (sp > wl * 1.05 && sp > PH.run * 0.95) {
        // momentum: overspeed decays smoothly while still allowing steering
        const k = 1 - Math.exp(-(moving ? PH.overRate : PH.overRate * 2.8) * dt);
        p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
      } else {
        const a = (p.grounded ? (moving ? PH.accel : PH.decel) : (moving ? PH.airAccel : 160)) * dt;
        const dx = wx - p.vx, dy = wy - p.vy, dl = Math.hypot(dx, dy);
        if (dl <= a) { p.vx = wx; p.vy = wy; } else { p.vx += (dx / dl) * a; p.vy += (dy / dl) * a; }
      }
    }
    // conveyors (slides, escalators)
    if (p.grounded) {
      const c = ch0;
      const cd = c === '>' ? [1, 0] : c === '<' ? [-1, 0] : c === '^' ? [0, -1] : c === 'v' ? [0, 1] : null;
      if (cd) {
        const along = p.vx * cd[0] + p.vy * cd[1];
        if (along < PH.conveyorMax) { const add = Math.min(PH.conveyor * dt, PH.conveyorMax - along); p.vx += cd[0] * add; p.vy += cd[1] * add; }
      }
    }

    // ---- auto vault: hop over low obstacles when running into them
    if (p.grounded && p.vaultT <= 0 && p.slideT <= 0 && p.dashT <= 0 && !frozen) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 140) {
        const ux = p.vx / sp, uy = p.vy / sp;
        if (this.tile(p.x + ux * (R + 16), p.y + uy * (R + 16)) === 'b') { p.vz = PH.vaultV; p.grounded = false; p.vaultT = PH.vaultT; this.ev.push({ k: 'vault', i: p.idx }); }
      }
    }

    // ---- integrate + collide (substepped so fast bodies never skip through walls)
    const sp2 = Math.hypot(p.vx, p.vy);
    const n = Math.max(1, Math.ceil((sp2 * dt) / 7));
    const sdt = dt / n;
    const lastTile = p.tile;
    for (let i = 0; i < n; i++) {
      p.x += p.vx * sdt; this.resolve(p);
      p.y += p.vy * sdt; this.resolve(p);
    }
    p.dist += Math.hypot(p.vx, p.vy) * dt;

    // ---- vertical
    if (!p.grounded) {
      p.vz -= PH.grav * dt; p.z += p.vz * dt;
      if (p.z <= 0) { p.z = 0; p.vz = 0; p.grounded = true; }
    } else { p.z = 0; p.vz = 0; }

    const ch = this.tile(p.x, p.y);
    p.tile = ch;
    if (p.grounded) {
      p.coyote = PH.coyote;
      if (ch === '_') { p.falling = PH.fallTime; p.slideT = 0; p.dashT = 0; this.ev.push({ k: 'fall', i: p.idx }); }
      else {
        // ramps launch you
        if (ch !== lastTile && '1234'.includes(ch) && Math.hypot(p.vx, p.vy) > 60) {
          const d = ch === '1' ? [1, 0] : ch === '2' ? [0, 1] : ch === '3' ? [-1, 0] : [0, -1];
          p.vz = PH.rampV; p.grounded = false; p.vx += d[0] * PH.rampPush; p.vy += d[1] * PH.rampPush;
          this.ev.push({ k: 'ramp', i: p.idx });
        }
        // remember the last safe footing (not next to a gap)
        p.safeT -= dt;
        if (p.safeT <= 0 && ch !== '~' && '.=<>^vb'.includes(ch) && !this.nearGap(p.x, p.y)) { p.safeX = p.x; p.safeY = p.y; p.safeT = 0.25; }
      }
    }

    // ---- stamina
    if (p.sprinting) { p.stam = Math.max(0, p.stam - PH.stamDrain * dt); p.sprintIdle = PH.stamDelay; if (p.stam <= PH.exhaustBelow) p.exhausted = true; }
    else { p.sprintIdle = Math.max(0, p.sprintIdle - dt); if (p.sprintIdle <= 0) p.stam = Math.min(PH.stamMax, p.stam + PH.stamRegen * dt); }
    if (p.exhausted && p.stam >= PH.exhaustUntil) p.exhausted = false;

    const sp3 = Math.hypot(p.vx, p.vy);
    if (sp3 > 25) { const f = Math.atan2(p.vy, p.vx); const cur = Math.atan2(p.fy, p.fx); let d = f - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const a = cur + d * Math.min(1, dt * 14); p.fx = Math.cos(a); p.fy = Math.sin(a); }
    this.setFlags(p);
  }

  nearGap(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.tile(x + dx * TILE * 0.8, y + dy * TILE * 0.8) === '_') return true;
    return false;
  }
  setFlags(p) {
    p.flags = (p.z > 2 || !p.grounded ? FL.air : 0) | (p.slideT > 0 ? FL.slide : 0) | (p.dashT > 0 ? FL.dash : 0) | (p.falling > 0 ? FL.fall : 0) | (p.vaultT > 0 ? FL.vault : 0) | (p.stun > 0 ? FL.stun : 0);
  }

  // ------------------------------------------------------------------ main step
  /**
   * Advance the world. inputs: Map(playerId -> input) for locally controlled players.
   * Bots think on their own. Remote humans are moved by setRemote().
   */
  step(dt, inputs) {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    for (const p of this.players) {
      if (p.left) continue;
      this.tickTimers(p, dt);
      let inp = null;
      if (p.ctrl === 'local') inp = inputs && inputs.get(p.id);
      else if (p.ctrl === 'bot') { if (this.role === 'auth') inp = thinkBot(this, p, dt); }
      if (p.ctrl === 'local' || (p.ctrl === 'bot' && this.role === 'auth')) this.stepPlayer(p, inp || NOINPUT, dt);
      else if (p.ctrl === 'bot' && this.role === 'follower') { /* host streams bot positions */ }
      p.hist.push({ t: this.time, x: p.x, y: p.y });
      while (p.hist.length && this.time - p.hist[0].t > 0.6) p.hist.shift();
    }
    if (this.role === 'auth') this.stepRules(dt);
    else this.followerCountdown(dt);
  }

  tickTimers(p, dt) {
    p.prot = Math.max(0, p.prot - dt); p.shieldT = Math.max(0, p.shieldT - dt); p.speedT = Math.max(0, p.speedT - dt);
    p.ghostT = Math.max(0, p.ghostT - dt); p.daze = Math.max(0, p.daze - dt); p.tagCd = Math.max(0, p.tagCd - dt);
  }

  followerCountdown(dt) {
    if (this.phase === 'countdown') { this.cd -= dt; }
    else if (this.phase === 'play') { this.el += dt; this.left = Math.max(0, this.left - dt); }
    for (let i = this.zones.length - 1; i >= 0; i--) { this.zones[i].t -= dt; if (this.zones[i].t <= 0) this.zones.splice(i, 1); }
  }

  // ------------------------------------------------------------------ rules (authority)
  stepRules(dt) {
    if (this.phase === 'countdown') {
      this.cd -= dt;
      if (this.cd <= 0) { this.phase = 'play'; this.ev.push({ k: 'go' }); }
      return;
    }
    if (this.phase !== 'play') return;
    this.el += dt; this.left = Math.max(0, this.left - dt);
    const act = this.active();

    // survival / holding score
    for (const p of act) {
      if (this.isEvader(p)) {
        p.escape += dt; p.held += dt; p.bestEscape = Math.max(p.bestEscape, p.escape);
        p.score += (this.mode === 'crown' ? 15 : 10) * dt;
      } else p.escape = 0;
    }

    // players that left or disconnected for too long
    for (const p of this.players) {
      if (p.away) { p.awayT += dt; if (p.awayT > 25 && !p.left) this.removePlayer(p.idx); }
    }

    this.stepPickups(dt);
    for (let i = this.zones.length - 1; i >= 0; i--) { this.zones[i].t -= dt; if (this.zones[i].t <= 0) this.zones.splice(i, 1); }
    if (this.mode === 'freeze') this.stepThaw(dt);

    // tag detection (positions are the latest known; remote humans get a little slack)
    for (const a of act) {
      if (!this.isChaser(a) || a.frozen) continue;
      let best = null, bd = 1e9;
      for (const b of act) {
        if (!this.canTag(a, b)) continue;
        const reach = (a.dashT > 0 ? PH.dashReach : PH.reach) + (a.ctrl === 'remote' || b.ctrl === 'remote' ? 6 : 0);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < reach && Math.abs(a.z - b.z) < PH.tagDz && d < bd) { best = b; bd = d; }
      }
      if (best) this.applyTag(a, best);
    }

    this.checkEnd();
  }

  /** Remote human tagger says it touched `b`. Validated against recent positions (lag compensation). */
  claimTag(ai, bi) {
    if (this.role !== 'auth' || this.phase !== 'play') return false;
    const a = this.players[ai], b = this.players[bi];
    if (!a || !b || !this.canTag(a, b)) return false;
    const reach = PH.reach + PH.claimSlack;
    let ok = Math.hypot(a.x - b.x, a.y - b.y) < reach;
    if (!ok) for (const h of b.hist) if (Math.hypot(a.x - h.x, a.y - h.y) < reach) { ok = true; break; }
    if (!ok) return false;
    this.applyTag(a, b);
    return true;
  }

  applyTag(a, b) {
    if (b.shieldT > 0) {
      b.shieldT = 0; a.tagCd = 0.9; this.ev.push({ k: 'shield', a: a.idx, b: b.idx });
      return false;
    }
    a.tags++; b.tagged++; b.lastBy = a.idx; b.lastAt = this.time;
    switch (this.mode) {
      case 'classic':
        a.it = false; b.it = true; a.prot = PH.protAfterTag; b.daze = PH.dazeT; b.escape = 0; a.score += 50; break;
      case 'freeze':
        b.frozen = true; b.thaw = 0; b.vx = b.vy = 0; b.escape = 0; a.score += 150; break;
      case 'infection':
        b.infected = true; b.escape = 0; a.score += 120; b.daze = 0.3;
        if (!this.active().some((p) => !p.infected)) this.lastSurvivor = b.idx;
        break;
      default: // crown
        b.crown = false; a.crown = true; a.prot = PH.protAfterTag; a.score += 50; a.escape = 0; b.escape = 0;
    }
    this.ev.push({ k: 'tag', a: a.idx, b: b.idx, mode: this.mode });
    return true;
  }

  stepThaw(dt) {
    for (const f of this.players) {
      if (!f.frozen || f.left) continue;
      let rescuer = null, rd = 1e9;
      for (const r of this.players) {
        if (r.left || r.role !== 'runner' || r.frozen || r.stun > 0 || r.falling > 0) continue;
        const d = Math.hypot(r.x - f.x, r.y - f.y);
        if (d < PH.thawReach && d < rd) { rescuer = r; rd = d; }
      }
      if (rescuer) {
        f.thaw += dt;
        if (f.thaw >= PH.thawTime) { f.frozen = false; f.thaw = 0; f.prot = 2; rescuer.score += 200; rescuer.thaws++; this.ev.push({ k: 'thaw', a: rescuer.idx, b: f.idx }); }
      } else f.thaw = Math.max(0, f.thaw - dt * 0.6);
    }
  }

  stepPickups(dt) {
    if (!this.powerups) return;
    const rs = this.rng;
    for (const k of this.pk) {
      if (!k.kind) {
        k.cd -= dt;
        if (k.cd <= 0) {
          let t = rs() * PICK_WEIGHTS.reduce((s, w) => s + w[1], 0), kind = 'speed';
          for (const [n, w] of PICK_WEIGHTS) { t -= w; if (t <= 0) { kind = n; break; } }
          k.kind = kind; k.cd = 0;
        }
        continue;
      }
      for (const p of this.players) {
        if (p.left || p.frozen || p.falling > 0 || p.z > 22) continue;
        if (Math.hypot(p.x - k.x, p.y - k.y) < 20) { this.givePickup(p, k.kind); k.kind = null; k.cd = 9 + rs() * 4; break; }
      }
    }
  }
  givePickup(p, kind) {
    p.pickups++;
    if (kind === 'speed') p.speedT = PICKUPS.speed.dur;
    else if (kind === 'shield') p.shieldT = PICKUPS.shield.dur;
    else if (kind === 'ghost') p.ghostT = PICKUPS.ghost.dur;
    else if (kind === 'slow') this.zones.push({ x: p.x, y: p.y, r: 80, t: PICKUPS.slow.dur, owner: p.idx });
    else if (kind === 'dash') { p.dashCd = 0; p.stam = PH.stamMax; p.exhausted = false; }
    this.ev.push({ k: 'pickup', i: p.idx, kind });
  }

  removePlayer(idx) {
    const p = this.players[idx];
    if (!p || p.left) return;
    p.left = true; p.away = false;
    const others = this.active();
    if (this.mode === 'classic' && p.it && others.length) { const n = others[Math.floor(this.rng() * others.length)]; n.it = true; n.daze = 0.45; this.ev.push({ k: 'it', b: n.idx }); }
    if (this.mode === 'crown' && p.crown && others.length) { const n = others[Math.floor(this.rng() * others.length)]; n.crown = true; n.prot = PH.protAfterTag; this.ev.push({ k: 'crown', b: n.idx }); }
    if (this.mode === 'infection' && !others.some((q) => q.infected) && others.length) { const n = others[Math.floor(this.rng() * others.length)]; n.infected = true; }
    if (this.mode === 'freeze' && others.length && !others.some((q) => q.role === 'tagger')) others[Math.floor(this.rng() * others.length)].role = 'tagger';
    this.ev.push({ k: 'left', i: idx });
  }

  checkEnd() {
    if (this.over) return;
    const act = this.active();
    let ended = this.left <= 0;
    let why = 'time';
    if (act.length < 2 && !this.practice) { ended = true; why = 'alone'; }
    if (this.mode === 'freeze') {
      const runners = act.filter((p) => p.role === 'runner');
      if (runners.length && runners.every((p) => p.frozen)) { ended = true; why = 'frozen'; }
    }
    if (this.mode === 'infection' && !act.some((p) => !p.infected)) { ended = true; why = 'infected'; }
    if (!ended) return;
    this.finish(why);
  }

  finish(why) {
    if (this.over) return;
    const act = this.active();
    this.over = true; this.phase = 'over'; this.why = why;
    if (this.mode === 'classic') { for (const p of act) if (!p.it) p.score += 250; }
    if (this.mode === 'freeze') {
      const runners = act.filter((p) => p.role === 'runner'), alive = runners.filter((p) => !p.frozen);
      this.winnersTeam = alive.length ? 'runner' : 'tagger';
      for (const p of act) if (p.role === this.winnersTeam && (p.role === 'tagger' || !p.frozen)) p.score += 400;
    }
    if (this.mode === 'infection') {
      const surv = act.filter((p) => !p.infected);
      if (surv.length) for (const p of surv) p.score += surv.length === 1 ? 1000 : 600;
      else if (this.lastSurvivor >= 0 && this.players[this.lastSurvivor]) this.players[this.lastSurvivor].score += 800;
    }
    this.ev.push({ k: 'end', why });
    this.resultCache = this.computeResults();
  }

  computeResults() {
    const list = this.players.map((p) => ({
      idx: p.idx, id: p.id, name: p.name, color: p.color, human: p.human, left: p.left,
      score: Math.round(p.score), tags: p.tags, tagged: p.tagged, escape: Math.round(p.bestEscape * 10) / 10, held: Math.round(p.held), dist: Math.round(p.dist), thaws: p.thaws, pickups: p.pickups,
    }));
    list.sort((a, b) => b.score - a.score || b.tags - a.tags);
    list.forEach((r, i) => { r.rank = i + 1; });
    let winners;
    if (this.mode === 'freeze' && this.winnersTeam) winners = this.players.filter((p) => !p.left && p.role === this.winnersTeam).map((p) => p.idx);
    else if (this.mode === 'infection' && this.lastSurvivor >= 0 && !this.players.some((p) => !p.left && !p.infected)) winners = [this.lastSurvivor];
    else winners = list.length ? [list[0].idx] : [];
    if (this.mode === 'infection') { const s = this.players.filter((p) => !p.left && !p.infected).map((p) => p.idx); if (s.length) winners = s; }
    list.forEach((r) => { r.win = winners.includes(r.idx); });
    return { list, winners, mode: this.mode, why: this.why, winnersTeam: this.winnersTeam, lastSurvivor: this.lastSurvivor };
  }

  results() { return this.resultCache || this.computeResults(); }

  // ------------------------------------------------------------------ networking helpers
  /** Position update for a remote human. Returns false if it looks impossible (caller sends a correction). */
  setRemote(idx, s) {
    const p = this.players[idx];
    if (!p || p.left) return true;
    const dt = Math.max(0.02, this.time - (p.rxT || this.time - 0.1));
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (this.role === 'auth' && p.rxT && d > PH.maxPlausible * dt + 90) { p.corr = { x: p.x, y: p.y }; return false; }
    p.rxT = this.time;
    p.x = clamp(s.x, 0, this.map.px); p.y = clamp(s.y, 0, this.map.py); p.z = clamp(s.z || 0, 0, 200);
    p.vx = clamp(s.vx || 0, -900, 900); p.vy = clamp(s.vy || 0, -900, 900);
    p.flags = s.fl | 0;
    p.grounded = p.z <= 0.5;
    p.stam = s.stam === undefined ? p.stam : clamp(s.stam, 0, 100);
    p.tile = this.tile(p.x, p.y);
    if (Math.hypot(p.vx, p.vy) > 25) { const l = Math.hypot(p.vx, p.vy); p.fx = p.vx / l; p.fy = p.vy / l; }
    return true;
  }

  /** Compact rules snapshot sent by the host. */
  exportRules() {
    const bits = (p) => (p.it ? 1 : 0) | (p.frozen ? 2 : 0) | (p.infected ? 4 : 0) | (p.crown ? 8 : 0) | (p.role === 'tagger' ? 16 : 0) | (p.left ? 32 : 0) | (p.away ? 64 : 0);
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      ph: this.phase === 'countdown' ? 0 : this.phase === 'play' ? 1 : 2, cd: r1(this.cd), tl: r1(this.left), el: r1(this.el),
      s: this.players.map((p) => [Math.round(p.score), bits(p), r1(p.prot), r1(p.shieldT), r1(p.speedT), r1(p.ghostT), r1(p.escape), p.tags, p.tagged, r1(p.thaw), r1(p.bestEscape), p.thaws, p.pickups, r1(p.held)]),
      pk: this.pk.map((k) => (k.kind ? [k.id, k.kind] : [k.id, 0])),
      zn: this.zones.map((z) => [Math.round(z.x), Math.round(z.y), z.r, r1(z.t), z.owner]),
      ls: this.lastSurvivor, wt: this.winnersTeam || 0,
    };
  }

  importRules(s) {
    if (!s || !Array.isArray(s.s)) return;
    const wasPhase = this.phase;
    this.phase = s.ph === 0 ? 'countdown' : s.ph === 1 ? 'play' : 'over';
    this.cd = +s.cd || 0; this.left = +s.tl || 0; this.el = +s.el || 0;
    s.s.forEach((a, i) => {
      const p = this.players[i]; if (!p || !Array.isArray(a)) return;
      const b = a[1] | 0;
      p.score = +a[0] || 0; p.it = !!(b & 1); p.frozen = !!(b & 2); p.infected = !!(b & 4); p.crown = !!(b & 8); p.role = b & 16 ? 'tagger' : 'runner'; p.left = !!(b & 32); p.away = !!(b & 64);
      p.prot = +a[2] || 0; p.shieldT = +a[3] || 0; p.speedT = +a[4] || 0; p.ghostT = +a[5] || 0; p.escape = +a[6] || 0; p.tags = a[7] | 0; p.tagged = a[8] | 0; p.thaw = +a[9] || 0;
      p.bestEscape = +a[10] || 0; p.thaws = a[11] | 0; p.pickups = a[12] | 0; p.held = +a[13] || 0;
    });
    if (Array.isArray(s.pk)) s.pk.forEach(([id, kind]) => { const k = this.pk[id]; if (k) k.kind = kind || null; });
    this.zones = Array.isArray(s.zn) ? s.zn.map((z) => ({ x: z[0], y: z[1], r: z[2], t: z[3], owner: z[4] })) : [];
    this.lastSurvivor = s.ls === undefined ? -1 : s.ls; this.winnersTeam = s.wt || null;
    if (this.phase === 'over' && wasPhase !== 'over') { this.over = true; this.why = this.why || 'time'; this.resultCache = this.computeResults(); }
    this.over = this.phase === 'over';
  }

  /** Become the authority after the previous host left (state is already mirrored from snapshots). */
  promote() {
    this.role = 'auth';
    this.rng = mulberry32((this.seed ^ 0xabcdef) + Math.floor(this.time * 1000));
    for (const p of this.players) if (p.ctrl === 'bot' && !p.bot) p.bot = { diff: p.diff };
  }

  drain() { const e = this.ev; this.ev = []; return e; }
}

export const NOINPUT = { mx: 0, my: 0, sprint: false, jump: false, slide: false, dash: false };
export { walkableForNav };
