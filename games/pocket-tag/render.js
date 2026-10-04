// Pocket Tag renderer: pre-rendered map, animated tiles, players with clear It / crown / frozen / infected
// styling, nameplates, edge arrows, particles and screen effects. Pure drawing, no game rules.
import { TILE } from './maps.js';
import { PICKUPS, FL, R } from './sim.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Renderer {
  constructor() {
    this.map = null; this.layer = null;
    this.parts = [];
    this.shake = 0; this.flash = 0; this.flashColor = '#fff';
    this.cam = { x: 0, y: 0, z: 1 };
    this.banner = null; this.toast = null;
    this.time = 0;
    this.low = false;
  }

  setMap(map) {
    this.map = map;
    const T = TILE;
    const c = document.createElement('canvas');
    c.width = map.px; c.height = map.py;
    const g = c.getContext('2d');
    const th = map.theme;
    g.fillStyle = th.sky; g.fillRect(0, 0, c.width, c.height);
    const rows = map.rows;
    const at = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? '#' : rows[y][x]);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const ch = rows[y][x], px = x * T, py = y * T;
        if (ch === '_') {
          const gr = g.createLinearGradient(px, py, px, py + T);
          gr.addColorStop(0, '#04040c'); gr.addColorStop(1, '#0b0c24');
          g.fillStyle = gr; g.fillRect(px, py, T, T);
          if ((x + y) % 3 === 0) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(px + 6, py + 10, 2, 2); }
          continue;
        }
        if (ch === '#') continue;
        g.fillStyle = ch === '=' ? th.floor2 : th.floor[(x + y) & 1];
        g.fillRect(px, py, T, T);
        if (ch === '=') { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let i = 8; i < T; i += 8) { g.beginPath(); g.moveTo(px, py + i); g.lineTo(px + T, py + i); g.stroke(); } }
        if (ch === '~') {
          g.fillStyle = th.water; g.fillRect(px, py, T, T);
          g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(px, py, T, T / 2);
        }
        // gap edges: dark rim so you can see where the roof ends
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (at(x + dx, y + dy) === '_') {
            g.fillStyle = 'rgba(0,0,0,.35)';
            if (dx === 0) g.fillRect(px, dy < 0 ? py : py + T - 4, T, 4); else g.fillRect(dx < 0 ? px : px + T - 4, py, 4, T);
          }
        }
        if (ch === '1' || ch === '2' || ch === '3' || ch === '4') this._ramp(g, px, py, ch, th);
        if (ch === 'b') this._low(g, px, py, th);
        if (ch === 'o') this._over(g, px, py, th, true);
      }
    }
    // walls (extruded blocks)
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (rows[y][x] !== '#') continue;
        const px = x * T, py = y * T;
        g.fillStyle = th.wall; g.fillRect(px, py, T, T);
        if (at(x, y + 1) !== '#') { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(px, py + T - 9, T, 9); }
        g.fillStyle = th.wallTop; g.fillRect(px, py, T, at(x, y + 1) !== '#' ? T - 9 : T);
        g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(px + 2, py + 2, T - 4, 3);
      }
    }
    this.layer = c;
    this.over = []; // overhead tiles are drawn above players
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (rows[y][x] === 'o') this.over.push([x, y]);
  }

  _low(g, px, py, th) {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(px + 3, py + 8, TILE - 4, TILE - 8);
    g.fillStyle = th.low; g.fillRect(px + 2, py + 6, TILE - 4, TILE - 10);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(px + 2, py + 6, TILE - 4, 5);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(px + 2, py + TILE - 8, TILE - 4, 4);
  }
  _over(g, px, py, th, shadowOnly) {
    if (shadowOnly) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px, py, TILE, TILE); g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < TILE; i += 8) g.fillRect(px + i, py, 3, TILE); return; }
    g.globalAlpha = 0.9;
    g.fillStyle = th.over; g.fillRect(px, py + 3, TILE, 12);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(px, py + 3, TILE, 3);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px, py + 15, TILE, 3);
    g.globalAlpha = 1;
  }
  _ramp(g, px, py, ch, th) {
    const d = ch === '1' ? [1, 0] : ch === '2' ? [0, 1] : ch === '3' ? [-1, 0] : [0, -1];
    g.fillStyle = '#ffd24d'; g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 4; i++) { const f = (i + 0.5) / 4; if (d[0]) g.fillRect(px + (d[0] > 0 ? f : 1 - f) * TILE - 2, py + 1, 4, TILE - 2); else g.fillRect(px + 1, py + (d[1] > 0 ? f : 1 - f) * TILE - 2, TILE - 2, 4); }
    g.fillStyle = '#7a4a00';
    g.save(); g.translate(px + TILE / 2, py + TILE / 2); g.rotate(Math.atan2(d[1], d[0]));
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -7); g.lineTo(-5, 7); g.closePath(); g.fill(); g.restore();
  }

  // ------------------------------------------------------------------ effects API
  burst(x, y, color, n = 16, speed = 220) {
    if (this.low) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 2 + Math.random() * 3 });
    }
  }
  puff(x, y, color = 'rgba(255,255,255,.6)', n = 5) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, life: 0.35, max: 0.35, color, size: 3 + Math.random() * 2 }); }
  doShake(v, reduced) { if (!reduced) this.shake = Math.max(this.shake, v); }
  doFlash(color, v, reduced) { if (!reduced) { this.flash = Math.max(this.flash, v); this.flashColor = color; } }
  showBanner(text, color = '#fff', sub = '', ms = 1700) { this.banner = { text, color, sub, t: ms / 1000, max: ms / 1000 }; }

  update(dt) {
    this.time += dt;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    }
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
  }

  // ------------------------------------------------------------------ camera
  /** Frame the given world points. Returns the zoom used. */
  frame(points, W, H, dt, snap) {
    const m = this.map;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of points) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    if (!points.length) { minx = maxx = m.px / 2; miny = maxy = m.py / 2; }
    const pad = 150;
    let z = Math.min(1, W / Math.max(1, maxx - minx + pad * 2), H / Math.max(1, maxy - miny + pad * 2));
    z = Math.max(z, Math.max(W / m.px, H / m.py) * 0.98);       // never show the void outside the map
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const k = snap ? 1 : 1 - Math.exp(-9 * dt);
    this.cam.z += (z - this.cam.z) * (snap ? 1 : 1 - Math.exp(-5 * dt));
    const vw = W / this.cam.z, vh = H / this.cam.z;
    const tx = clamp(cx, vw / 2, Math.max(vw / 2, m.px - vw / 2)), ty = clamp(cy, vh / 2, Math.max(vh / 2, m.py - vh / 2));
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    return this.cam.z;
  }

  // ------------------------------------------------------------------ main draw
  /**
   * s: { world, pos(p)->{x,y,z}, locals:[idx], me: idx|null, now, W, H, reduced, hints:{...} }
   */
  draw(ctx, W, H, s) {
    const w = s.world, map = this.map;
    ctx.fillStyle = '#04040e'; ctx.fillRect(0, 0, W, H);
    if (!this.layer) return;
    ctx.save();
    const sh = this.shake > 0 ? this.shake : 0;
    const z = this.cam.z;
    ctx.translate(W / 2 - this.cam.x * z + (Math.random() - 0.5) * sh, H / 2 - this.cam.y * z + (Math.random() - 0.5) * sh);
    ctx.scale(z, z);
    ctx.drawImage(this.layer, 0, 0);
    const vx0 = this.cam.x - W / z / 2 - 40, vx1 = this.cam.x + W / z / 2 + 40, vy0 = this.cam.y - H / z / 2 - 40, vy1 = this.cam.y + H / z / 2 + 40;
    this._animated(ctx, vx0, vx1, vy0, vy1);

    // zones
    for (const zn of w.zones) {
      ctx.fillStyle = 'rgba(120,200,255,.18)'; ctx.strokeStyle = 'rgba(160,220,255,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r, 0, TAU); ctx.fill(); ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) { const a = this.time * 0.6 + i * 1.26; ctx.fillText('❄', zn.x + Math.cos(a) * zn.r * 0.6, zn.y + Math.sin(a) * zn.r * 0.6); }
    }
    // pickups
    for (const k of w.pk) {
      if (!k.kind) continue;
      const bob = Math.sin(this.time * 4 + k.id) * 2.5;
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(k.x, k.y, 14 + Math.sin(this.time * 5) * 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(10,12,36,.85)'; ctx.beginPath(); ctx.arc(k.x, k.y + bob, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(PICKUPS[k.kind].icon, k.x, k.y + bob + 1);
    }

    // players, back to front
    const order = w.players.filter((p) => !p.left).map((p) => ({ p, pos: s.pos(p) })).sort((a, b) => a.pos.y - b.pos.y);
    for (const o of order) this._player(ctx, w, o.p, o.pos, s);
    // overhead tiles (tunnel roofs, pipes) hide anything sliding under them
    for (const [x, y] of this.over) { if (x * TILE < vx0 || x * TILE > vx1 || y * TILE < vy0 || y * TILE > vy1) continue; this._over(ctx, x * TILE, y * TILE, map.theme, false); }
    // nameplates and indicators above everything
    this._plates(ctx, w, order, s);
    // particles
    for (const p of this.parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._edgeArrows(ctx, W, H, w, order, s);
    this._hud(ctx, W, H, w, s);
    if (this.flash > 0) { ctx.globalAlpha = Math.min(0.5, this.flash * 0.5); ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  _animated(ctx, x0, x1, y0, y1) {
    const map = this.map, T = TILE, t = this.time;
    const tx0 = Math.max(0, Math.floor(x0 / T)), tx1 = Math.min(map.w - 1, Math.floor(x1 / T)), ty0 = Math.max(0, Math.floor(y0 / T)), ty1 = Math.min(map.h - 1, Math.floor(y1 / T));
    ctx.lineWidth = 2;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const ch = map.rows[y][x], px = x * T, py = y * T;
        if (ch === '~') {
          ctx.strokeStyle = 'rgba(255,255,255,.28)';
          ctx.beginPath();
          const o = (t * 14 + x * 7 + y * 11) % T;
          ctx.moveTo(px + 4, py + 10); ctx.quadraticCurveTo(px + 12, py + 6 + Math.sin(t * 2 + x) * 2, px + 20, py + 10); ctx.quadraticCurveTo(px + 26, py + 13, px + 29, py + 9);
          ctx.stroke();
          void o;
        } else if (ch === '>' || ch === '<' || ch === '^' || ch === 'v') {
          const dir = ch === '>' ? [1, 0] : ch === '<' ? [-1, 0] : ch === '^' ? [0, -1] : [0, 1];
          ctx.fillStyle = 'rgba(40,20,70,.55)'; ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = 'rgba(255,230,120,.85)';
          const ph = (t * 40) % 16;
          for (let i = -1; i < 3; i++) {
            const o = ph + i * 16 - 8;
            const cx = px + T / 2 + dir[0] * o, cy = py + T / 2 + dir[1] * o;
            if (Math.abs(cx - (px + T / 2)) > T / 2 - 3 && dir[0]) continue;
            if (Math.abs(cy - (py + T / 2)) > T / 2 - 3 && dir[1]) continue;
            ctx.beginPath();
            if (dir[0]) { ctx.moveTo(cx - dir[0] * 4, cy - 7); ctx.lineTo(cx + dir[0] * 4, cy); ctx.lineTo(cx - dir[0] * 4, cy + 7); }
            else { ctx.moveTo(cx - 7, cy - dir[1] * 4); ctx.lineTo(cx, cy + dir[1] * 4); ctx.lineTo(cx + 7, cy - dir[1] * 4); }
            ctx.stroke();
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ players
  _player(ctx, w, p, pos, s) {
    const z = pos.z || 0, fl = pos.fl || 0;
    const fall = fl & FL.fall ? 1 : 0;
    const sliding = !!(fl & FL.slide), dashing = !!(fl & FL.dash);
    const col = p.infected ? '#7dff5d' : p.color;
    const hi = w.mode === 'crown' ? p.crown : (w.mode !== 'freeze' ? w.isChaser(p) : p.role === 'tagger');
    let alpha = 1;
    if (p.ghostT > 0) alpha = 0.45;
    if (p.away) alpha = 0.4;
    if (p.prot > 0 && Math.floor(this.time * 10) % 2 === 0) alpha *= 0.55;
    ctx.save();
    ctx.globalAlpha = alpha;
    const scale = fall ? Math.max(0.15, (p.falling > 0 ? p.falling / 0.55 : 1)) : 1;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 5, R * (1 - Math.min(0.4, z / 140)) * scale, R * 0.5 * scale, 0, 0, TAU); ctx.fill();
    const by = pos.y - z * 0.75 - 3;
    // speed lines / dash trail
    if (dashing || p.speedT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(pos.x - (pos.vx || 0) * 0.02 * i, by - (pos.vy || 0) * 0.02 * i); ctx.lineTo(pos.x - (pos.vx || 0) * 0.035 * i, by - (pos.vy || 0) * 0.035 * i); ctx.stroke(); }
    }
    ctx.translate(pos.x, by); ctx.scale(scale, scale * (sliding ? 0.62 : 1));
    // aura for It / crown holder
    if (hi) {
      const pulse = 1 + Math.sin(this.time * 8) * 0.12;
      ctx.strokeStyle = w.mode === 'crown' ? '#ffe14d' : '#ff2d55'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, (R + 6) * pulse, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha * 0.25; ctx.fillStyle = w.mode === 'crown' ? '#ffe14d' : '#ff2d55'; ctx.beginPath(); ctx.arc(0, 0, (R + 6) * pulse, 0, TAU); ctx.fill(); ctx.globalAlpha = alpha;
    }
    // body
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-3, -4, R * 0.45, 0, TAU); ctx.fill();
    // eyes toward facing
    const fx = pos.fx || p.fx, fy = pos.fy || p.fy;
    ctx.fillStyle = '#fff';
    const ex = fx * 4, ey = fy * 4, px = -fy * 3.5, py = fx * 3.5;
    ctx.beginPath(); ctx.arc(ex + px, ey + py, 3, 0, TAU); ctx.arc(ex - px, ey - py, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10122e'; ctx.beginPath(); ctx.arc(ex + px + fx, ey + py + fy, 1.6, 0, TAU); ctx.arc(ex - px + fx, ey - py + fy, 1.6, 0, TAU); ctx.fill();
    ctx.restore();

    // status overlays (not squashed)
    ctx.save();
    ctx.translate(pos.x, by);
    if (p.frozen) {
      ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(150,220,255,.75)'; ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(-R - 3, -R - 4, (R + 3) * 2, (R + 4) * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-R, -R - 1, 7, 4);
      if (p.thaw > 0) { ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-14, R + 8, 28, 5); ctx.fillStyle = '#ffe14d'; ctx.fillRect(-14, R + 8, 28 * clamp(p.thaw / 0.8, 0, 1), 5); }
    }
    if (p.shieldT > 0) {
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 9); ctx.strokeStyle = '#6fd2ff'; ctx.fillStyle = 'rgba(120,200,255,.2)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, R + 8, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (p.crown) { ctx.globalAlpha = 1; ctx.font = '16px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('👑', 0, -R - 6); }
    ctx.restore();
  }

  _plates(ctx, w, order, s) {
    ctx.font = '700 10px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    for (const { p, pos } of order) {
      if (p.left) continue;
      const hi = w.mode === 'crown' ? p.crown : (w.mode !== 'freeze' ? w.isChaser(p) : p.role === 'tagger');
      const isMe = s.locals.includes(p.idx);
      let label = p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name;
      let x = pos.x, y = pos.y - (pos.z || 0) * 0.75 - R - (p.crown ? 24 : 12);
      const wd = ctx.measureText(label).width + (hi ? 22 : 10);
      for (const q of placed) if (Math.abs(q.x - x) < (q.w + wd) / 2 && Math.abs(q.y - y) < 12) y = q.y - 12;
      placed.push({ x, y, w: wd });
      ctx.fillStyle = hi ? 'rgba(255,45,85,.92)' : isMe ? 'rgba(255,225,77,.92)' : 'rgba(8,9,30,.72)';
      if (w.mode === 'crown' && hi) ctx.fillStyle = 'rgba(255,196,0,.95)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - wd / 2, y - 8, wd, 15, 7) : ctx.rect(x - wd / 2, y - 8, wd, 15); ctx.fill();
      ctx.fillStyle = isMe && !hi ? '#171a40' : '#fff';
      ctx.fillText(hi && w.mode !== 'crown' ? `IT ${label}` : label, x, y);
      if (p.infected && w.mode === 'infection') { ctx.fillStyle = '#7dff5d'; ctx.fillText('☣', x - wd / 2 - 6, y); }
    }
  }

  _edgeArrows(ctx, W, H, w, order, s) {
    const z = this.cam.z, m = 26;
    const toScreen = (x, y) => ({ x: (x - this.cam.x) * z + W / 2, y: (y - this.cam.y) * z + H / 2 });
    const arrow = (x, y, color, label) => {
      const sp = toScreen(x, y);
      if (sp.x > m && sp.x < W - m && sp.y > m && sp.y < H - m) return;
      const cx = W / 2, cy = H / 2, dx = sp.x - cx, dy = sp.y - cy;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-4, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.font = '800 10px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(label, clamp(ax - Math.cos(ang) * 22, 18, W - 18), clamp(ay - Math.sin(ang) * 22, 10, H - 10));
    };
    const me = s.me !== null && s.me !== undefined ? w.players[s.me] : null;
    for (const { p, pos } of order) {
      if (s.locals.includes(p.idx)) continue;
      if (w.mode === 'crown' && p.crown) arrow(pos.x, pos.y, '#ffe14d', '👑');
      else if (w.mode !== 'crown' && w.mode !== 'freeze' && w.isChaser(p) && (!me || !w.isChaser(me))) arrow(pos.x, pos.y, '#ff2d55', 'IT');
      else if (w.mode === 'freeze' && p.role === 'tagger' && me && me.role === 'runner') arrow(pos.x, pos.y, '#ff2d55', 'TAGGER');
      else if (w.mode === 'freeze' && p.frozen && me && me.role === 'runner' && !me.frozen) arrow(pos.x, pos.y, '#8fd8ff', '❄');
    }
  }

  _hud(ctx, W, H, w, s) {
    const small = W < 520;
    // banner (YOU'RE IT!, JAYDEN IS IT!, ...)
    if (this.banner) {
      const b = this.banner, a = clamp(Math.min(b.t, b.max - b.t) * 6, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `900 ${small ? 24 : 34}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(b.text, W / 2, H * 0.2);
      ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, H * 0.2);
      if (b.sub) { ctx.font = `700 ${small ? 12 : 15}px "Trebuchet MS", sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeText(b.sub, W / 2, H * 0.2 + (small ? 22 : 28)); ctx.fillText(b.sub, W / 2, H * 0.2 + (small ? 22 : 28)); }
      ctx.globalAlpha = 1;
    }
    // countdown
    if (w.phase === 'countdown') {
      const n = Math.ceil(w.cd);
      ctx.font = `900 ${small ? 70 : 110}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#ffe14d';
      const f = w.cd - Math.floor(w.cd);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + f * 0.25, 1 + f * 0.25); ctx.globalAlpha = 0.4 + f * 0.6;
      ctx.strokeText(String(n), 0, 0); ctx.fillText(String(n), 0, 0); ctx.restore(); ctx.globalAlpha = 1;
    }
    // per-local-player status: stamina + dash + effects
    const locals = s.locals;
    locals.forEach((idx, li) => {
      const p = w.players[idx]; if (!p) return;
      const bw = small ? 84 : 110, bh = 9;
      const x = locals.length === 1 ? 12 : (li % 2 === 0 ? 12 : W - bw - 12), y = H - 16 - Math.floor(li / 2) * 34;
      ctx.fillStyle = 'rgba(8,9,30,.72)'; ctx.fillRect(x - 4, y - 14, bw + 8, 30);
      ctx.font = '800 9px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = locals.length > 1 ? p.color : '#cfd3f5';
      ctx.fillText(locals.length > 1 ? `P${li + 1} ${p.name.slice(0, 8)}` : 'STAMINA', x, y - 7);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = p.exhausted ? '#ff6b6b' : p.stam > 35 ? '#5dff8f' : '#ffb347'; ctx.fillRect(x, y, bw * clamp(p.stam / 100, 0, 1), bh);
      ctx.fillStyle = p.dashCd > 0 ? '#555a88' : '#2de2e6'; ctx.fillRect(x + bw - 18, y - 12, 18, 4);
      if (p.dashCd > 0) { ctx.fillStyle = '#2de2e6'; ctx.fillRect(x + bw - 18, y - 12, 18 * (1 - p.dashCd / 2.2), 4); }
      let ex = x;
      const eff = [[p.speedT, '⚡'], [p.shieldT, '🛡️'], [p.ghostT, '👻']];
      ctx.font = '12px system-ui, "Apple Color Emoji", sans-serif';
      for (const [t, ic] of eff) if (t > 0) { ctx.fillText(ic, ex, y - 22); ctx.fillStyle = '#fff'; ctx.font = '700 9px sans-serif'; ctx.fillText(Math.ceil(t) + 's', ex + 14, y - 21); ex += 36; ctx.font = '12px system-ui, "Apple Color Emoji", sans-serif'; }
    });
    // role strip (only for the first local player)
    const me = s.me !== null && s.me !== undefined ? w.players[s.me] : null;
    if (me && w.phase === 'play') {
      let text = '', color = '#fff';
      if (w.mode === 'classic') { text = me.it ? 'YOU’RE IT!' : ''; color = '#ff2d55'; }
      else if (w.mode === 'freeze') { text = me.frozen ? 'FROZEN: wait for a rescue' : me.role === 'tagger' ? 'FREEZE THE RUNNERS' : ''; color = me.frozen ? '#8fd8ff' : '#ff2d55'; }
      else if (w.mode === 'infection') { text = me.infected ? 'YOU’RE INFECTED: spread it!' : ''; color = '#7dff5d'; }
      else if (w.mode === 'crown') { text = me.crown ? 'YOU HAVE THE CROWN!' : 'STEAL THE CROWN'; color = me.crown ? '#ffe14d' : '#fff'; }
      if (text) {
        ctx.font = `900 ${small ? 14 : 18}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, W / 2, 20); ctx.fillStyle = color; ctx.fillText(text, W / 2, 20);
      }
    }
  }
}
