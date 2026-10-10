// Tiny procedural sound engine (Web Audio). Nothing starts until a user gesture.
import { isMuted } from './storage.js';

let ctx = null;
let master = null;
let noiseBuf = null;
const lastPlayed = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return ctx;
}

/** Call from a click/touch/key handler to satisfy autoplay policies. */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq, end, dur, type = 'square', vol = 0.5, delay = 0) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (end && end !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.5, freq = 1200, delay = 0, q = 0.7) {
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.15), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

const arp = (notes, step, type = 'square', vol = 0.35, len = 0.14) =>
  notes.forEach((n, i) => tone(n, n, len, type, vol, i * step));

// name -> [min ms between plays, synth fn]
const SOUNDS = {
  click: [40, () => tone(660, 880, 0.06, 'square', 0.25)],
  jump: [60, () => tone(280, 640, 0.14, 'square', 0.28)],
  land: [80, () => noise(0.07, 0.25, 700)],
  grapple: [60, () => { tone(180, 900, 0.1, 'sawtooth', 0.25); noise(0.05, 0.2, 3000); }],
  release: [60, () => tone(520, 260, 0.09, 'triangle', 0.3)],
  checkpoint: [200, () => arp([523, 659, 784], 0.07, 'triangle', 0.4)],
  pickup: [50, () => { tone(660, 660, 0.07, 'square', 0.28); tone(990, 990, 0.1, 'square', 0.28, 0.06); }],
  powerup: [100, () => arp([392, 523, 659, 880], 0.055, 'square', 0.3, 0.12)],
  eat: [40, () => tone(500, 760, 0.07, 'square', 0.28)],
  hit: [50, () => { tone(200, 60, 0.22, 'sawtooth', 0.4); noise(0.15, 0.4, 1800); }],
  bounce: [30, () => tone(330, 280, 0.05, 'triangle', 0.35)],
  brick: [25, () => { tone(760, 520, 0.07, 'square', 0.28); noise(0.04, 0.18, 4000); }],
  brickStrong: [25, () => tone(300, 220, 0.08, 'square', 0.35)],
  shoot: [45, () => tone(900, 160, 0.12, 'sawtooth', 0.2)],
  explosion: [50, () => { noise(0.5, 0.7, 1600); tone(130, 35, 0.4, 'sawtooth', 0.35); }],
  smallBoom: [40, () => { noise(0.22, 0.5, 2200); tone(160, 60, 0.15, 'sawtooth', 0.2); }],
  score: [40, () => tone(880, 1320, 0.08, 'square', 0.22)],
  combo: [40, () => tone(700, 1400, 0.1, 'triangle', 0.3)],
  dash: [60, () => { noise(0.14, 0.3, 4000); tone(300, 900, 0.1, 'triangle', 0.2); }],
  warn: [200, () => tone(440, 440, 0.12, 'square', 0.2)],
  place: [30, () => { tone(260, 150, 0.09, 'triangle', 0.4); noise(0.03, 0.12, 900); }],
  blockclear: [40, () => arp([523, 659, 784], 0.05, 'triangle', 0.36, 0.1)],
  blast: [100, () => { noise(0.28, 0.4, 2600); arp([392, 523, 659, 784, 1047], 0.05, 'square', 0.3, 0.12); }],
  newbest: [400, () => arp([523, 659, 784, 1047, 1319, 1047, 1319, 1568], 0.09, 'triangle', 0.36, 0.18)],
  tag: [80, () => { noise(0.16, 0.5, 2600); tone(180, 70, 0.2, 'sawtooth', 0.4); tone(880, 1320, 0.09, 'square', 0.25, 0.04); }],
  freeze: [80, () => { tone(1500, 600, 0.25, 'triangle', 0.3); tone(2200, 900, 0.2, 'sine', 0.2, 0.05); }],
  thaw: [100, () => arp([523, 784, 1047], 0.05, 'triangle', 0.3, 0.1)],
  shield: [100, () => { tone(300, 900, 0.18, 'sine', 0.35); noise(0.1, 0.25, 5000); }],
  whoosh: [60, () => noise(0.16, 0.28, 3000)],
  tick: [100, () => tone(600, 600, 0.07, 'square', 0.25)],
  go: [200, () => tone(880, 1320, 0.25, 'square', 0.35)],
  crown: [120, () => arp([523, 659, 784, 1047], 0.06, 'triangle', 0.35, 0.12)],
  victory: [300, () => arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 'square', 0.32, 0.2)],
  gameover: [300, () => arp([392, 330, 262, 196], 0.17, 'sawtooth', 0.3, 0.3)],
};

export const sfx = {
  unlock,
  play(name) {
    if (isMuted()) return;
    const def = SOUNDS[name];
    if (!def || !ensure()) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < def[0]) return;
    lastPlayed[name] = now;
    try { def[1](); } catch (e) { /* audio must never break gameplay */ }
  },
};
