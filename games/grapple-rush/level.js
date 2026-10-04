// Grapple Rush course. Coordinates in pixels, y grows downward.
// Sections: 1 run & jump · 2 first swing · 3 chained swings · 4 climb · 5 drop & sprint · 6 momentum launches · 7 finish.
const roof = (x, y, w, h = 1400) => ({ x, y, w, h });

export const LEVEL = {
  name: 'Neon Heights',
  spawn: { x: 90, y: 520 },
  deathY: 1100,
  platforms: [
    // 1 — run & jump (forgiving)
    roof(0, 520, 640),
    roof(770, 520, 420),
    roof(1340, 490, 300),
    roof(1815, 470, 420),
    // 2 — first swing
    roof(2595, 470, 500),
    // 3 — chained swings
    roof(3270, 440, 260),
    roof(3980, 400, 380),
    // 4 — climb
    roof(4520, 380, 200),
    roof(4900, 300, 180),
    roof(5260, 190, 160),
    roof(5620, 70, 240),
    // 5 — drop & sprint
    roof(6030, 330, 460),
    roof(6700, 330, 300),
    roof(7500, 360, 420),
    // 6 — momentum launches
    roof(8620, 300, 180),
    roof(9240, 400, 140),
    // 7 — finish
    roof(9900, 300, 800),
  ],
  anchors: [
    { x: 2415, y: 210 },
    { x: 3700, y: 170 }, { x: 3900, y: 150 },
    { x: 4790, y: 230 }, { x: 5150, y: 130 }, { x: 5500, y: 10 },
    { x: 7150, y: 90 }, { x: 7330, y: 70 },
    { x: 8040, y: 60 }, { x: 8260, y: 30 }, { x: 8480, y: 70 },
    { x: 8960, y: 60 },
    { x: 9560, y: 90 }, { x: 9740, y: 120 },
  ],
  checkpoints: [
    { x: 1960, y: 470 },
    { x: 4100, y: 400 },
    { x: 5700, y: 70 },
    { x: 7600, y: 360 },
    { x: 8700, y: 300 },
  ],
  finish: { x: 10400, y: 300 },
  // On-screen coaching: shown while the player is between x and to.
  hints: [
    { x: 0, to: 700, text: 'A / D to run  ·  SPACE to jump (hold for height)', touch: 'Use ◀ ▶ to run and JUMP to leap' },
    { x: 1900, to: 2500, text: 'Hold E or click a glowing node to grapple  ·  release to launch', touch: 'Hold GRAPPLE (or tap a node), release to launch' },
    { x: 3300, to: 4000, text: 'Chain swings: let go, then grab the next node', touch: 'Let go, then grab the next node' },
    { x: 4380, to: 4900, text: 'Hold SPACE while swinging to reel in and climb', touch: 'Hold JUMP while swinging to climb' },
    { x: 7000, to: 7500, text: 'Release at the top of the arc to keep your speed', touch: 'Release at the top of the arc to keep speed' },
  ],
};
