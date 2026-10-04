// Unified action input: keyboard + virtual (touch) buttons feed the same state.
export class Input {
  /** @param {Record<string,string[]>} bindings action -> KeyboardEvent.code list */
  constructor(bindings) {
    this.map = new Map();
    this.actions = Object.keys(bindings);
    this.state = {};
    this.edge = {};
    this.rel = {};
    this.sources = {};
    this.active = true;
    for (const a of this.actions) {
      this.state[a] = false; this.edge[a] = false; this.rel[a] = false;
      this.sources[a] = new Set();
      for (const code of bindings[a]) {
        if (!this.map.has(code)) this.map.set(code, []);
        this.map.get(code).push(a);
      }
    }
    this._kd = (e) => this._key(e, true);
    this._ku = (e) => this._key(e, false);
    this._blur = () => this.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }
  _key(e, isDown) {
    const acts = this.map.get(e.code);
    if (!acts || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.active) return;
    if (isDown) e.preventDefault();
    if (isDown && e.repeat) return;
    for (const a of acts) this.set('k:' + e.code, a, isDown);
  }
  /** Mark a source (key / touch pointer) as holding an action. */
  set(source, action, isDown) {
    const s = this.sources[action];
    if (!s) return;
    const was = s.size > 0;
    if (isDown) s.add(source); else s.delete(source);
    const now = s.size > 0;
    this.state[action] = now;
    if (!was && now) this.edge[action] = true;
    if (was && !now) this.rel[action] = true;
  }
  down(a) { return this.state[a]; }
  pressed(a) { return this.edge[a]; }
  released(a) { return this.rel[a]; }
  /** Horizontal / vertical axis helper: -1, 0, 1 */
  axis(neg, pos) { return (this.state[pos] ? 1 : 0) - (this.state[neg] ? 1 : 0); }
  endStep() { for (const a of this.actions) { this.edge[a] = false; this.rel[a] = false; } }
  clear() {
    for (const a of this.actions) {
      this.sources[a].clear(); this.state[a] = false; this.edge[a] = false; this.rel[a] = false;
    }
  }
  destroy() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
  }
}

/** Wire a DOM button so pointer presses drive an action. Supports multi-touch. */
export function bindTouchButton(el, input, action, onPress) {
  const id = () => 'p:' + action;
  const held = new Set();
  const down = (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    held.add(e.pointerId);
    input.set(id() + e.pointerId, action, true);
    el.classList.add('is-down');
    if (onPress) onPress();
  };
  const up = (e) => {
    if (!held.has(e.pointerId)) return;
    held.delete(e.pointerId);
    input.set(id() + e.pointerId, action, false);
    if (!held.size) el.classList.remove('is-down');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Swipe detector on any element. Calls cb('left'|'right'|'up'|'down'). */
export function attachSwipe(el, cb, minDist = 24) {
  let sx = 0, sy = 0, id = null, fired = false;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId; sx = e.clientX; sy = e.clientY; fired = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || fired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < minDist) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    sx = e.clientX; sy = e.clientY; // allow chained swipes in one drag
  });
  const end = (e) => { if (e.pointerId === id) id = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Client coords -> logical canvas coords. */
export function canvasPoint(e, canvas, W, H) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
