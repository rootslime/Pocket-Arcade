// Grapple Rush courses. Coordinates in pixels, y grows downward.
//
// Every level is a list of rooftops. A level built with `course()` is described by segments:
//   [gap, width, dy, anchors?, pad?]
//     gap      empty space before this roof (the first roof ignores it)
//     width    roof width
//     dy       height change from the previous roof (negative = higher)
//     anchors  grapple nodes above the gap: [[fraction along the gap, height above the previous roof], ...]
//     pad      a bounce pad on this roof: [offset from the roof's left edge, width]
// `checkpoints` lists the roof indices that hold a checkpoint flag.
const roof = (x, y, w, h = 1400) => ({ x, y, w, h });

function course(meta, segs, checkpoints, hints = []) {
  const platforms = [], anchors = [], pads = [];
  let x = 0, y = meta.base ?? 520, prevEnd = 0, prevY = y;
  segs.forEach((s, i) => {
    const [gap, w, dy, an, pad] = s;
    if (i === 0) { platforms.push(roof(0, y, w)); } else {
      x = prevEnd + gap; y = prevY + dy;
      platforms.push(roof(x, y, w));
      for (const [f, up] of an || []) anchors.push({ x: Math.round(prevEnd + gap * f), y: prevY - up });
    }
    if (pad) pads.push({ x: platforms[i].x + pad[0], y: platforms[i].y, w: pad[1] });
    prevEnd = platforms[i].x + w; prevY = platforms[i].y;
  });
  const last = platforms[platforms.length - 1];
  const lowest = Math.max(...platforms.map((p) => p.y));
  return {
    ...meta,
    spawn: { x: 90, y: platforms[0].y },
    deathY: lowest + 580,
    platforms, anchors, pads,
    checkpoints: checkpoints.map((n) => ({ x: platforms[n].x + 34, y: platforms[n].y })),
    finish: { x: last.x + Math.min(520, last.w - 160), y: last.y },
    hints,
  };
}

// ---------------------------------------------------------------- 1 · Neon Heights (the original course)
const heights = {
  id: 'heights', name: 'Neon Heights', blurb: 'The classic rooftop run', difficulty: 'Easy',
  spawn: { x: 90, y: 520 },
  deathY: 1100,
  platforms: [
    roof(0, 520, 640), roof(740, 520, 420), roof(1280, 490, 300), roof(1730, 470, 480),
    roof(2595, 470, 500),
    roof(3270, 440, 260), roof(3980, 400, 380),
    roof(4520, 380, 200), roof(4900, 300, 180), roof(5260, 190, 160), roof(5620, 70, 240),
    roof(6030, 330, 460), roof(6700, 330, 300), roof(7500, 360, 420),
    roof(8620, 300, 180), roof(9240, 400, 140),
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
  pads: [],
  checkpoints: [{ x: 1900, y: 470 }, { x: 4100, y: 400 }, { x: 5700, y: 70 }, { x: 7600, y: 360 }, { x: 8700, y: 300 }],
  finish: { x: 10400, y: 300 },
  hints: [
    { x: 0, to: 700, text: 'D to run  ·  press SPACE just before the roof edge to jump', touch: 'Use ◀ ▶ to run and JUMP to leap' },
    { x: 1900, to: 2500, text: 'Hold E or click a glowing node to grapple  ·  release to launch', touch: 'Hold GRAPPLE (or tap a node), release to launch' },
    { x: 3300, to: 4000, text: 'Chain swings: let go, then grab the next node', touch: 'Let go, then grab the next node' },
    { x: 4380, to: 4900, text: 'Hold SPACE while swinging to reel in and climb', touch: 'Hold JUMP while swinging to climb' },
    { x: 7000, to: 7500, text: 'Release at the top of the arc to keep your speed', touch: 'Release at the top of the arc to keep speed' },
  ],
};

// ---------------------------------------------------------------- 2 · Sunset Strip
const sunset = course({ id: 'sunset', name: 'Sunset Strip', blurb: 'Quick hops and short swings', difficulty: 'Easy' }, [
  [0, 700, 0], [130, 380, -20], [160, 320, 0], [150, 260, 40],
  [330, 420, -10, [[0.5, 250]]], [140, 260, -40],
  [380, 300, 20, [[0.5, 260]]],
  [440, 300, 0, [[0.3, 250], [0.72, 240]]],
  [150, 340, -60],
  [200, 170, -90, [[0.5, 200]]], [200, 170, -90, [[0.5, 200]]], [220, 320, -70, [[0.5, 210]]],
  [180, 420, 220], [170, 380, 10],
  [420, 420, -30, [[0.5, 260]]],
  [160, 900, 0],
], [4, 8, 11, 14], [
  { x: 0, to: 900, text: 'Same controls, new skyline  ·  watch the gaps', touch: 'Same controls, new skyline' },
]);

// ---------------------------------------------------------------- 3 · Cloud Piercer
const cloud = course({ id: 'cloud', name: 'Cloud Piercer', blurb: 'Climb above the clouds', difficulty: 'Medium', base: 900 }, [
  [0, 600, 0], [180, 260, -60],
  [350, 240, -120, [[0.5, 300]]], [200, 180, -90, [[0.5, 230]]],
  [400, 200, -150, [[0.4, 320], [0.75, 250]]], [180, 180, -90, [[0.5, 210]]],
  [380, 220, -140, [[0.5, 330]]], [200, 160, -100, [[0.5, 220]]],
  [420, 200, -140, [[0.35, 320], [0.75, 290]]], [200, 300, -80, [[0.5, 210]]],
  [440, 260, 100, [[0.5, 330]]], [160, 300, 120], [380, 300, 60, [[0.5, 240]]],
  [150, 900, 0],
], [3, 6, 9, 12], [
  { x: 600, to: 1500, text: 'Hold SPACE while swinging to reel in and gain height', touch: 'Hold JUMP while swinging to gain height' },
]);

// ---------------------------------------------------------------- 4 · Spring Loaded (bounce pads)
const spring = course({ id: 'spring', name: 'Spring Loaded', blurb: 'Bounce pads send you skyward', difficulty: 'Medium' }, [
  [0, 520, 0, null, [380, 90]], [150, 280, -200, null, [170, 80]], [150, 280, -200, null, [170, 80]],
  [330, 300, 0, [[0.5, 260]]], [140, 300, 200, null, [200, 80]],
  [220, 260, -100, null, [160, 80]],
  [260, 260, 100, null, [150, 80]],
  [400, 300, -60, [[0.5, 260]], [190, 80]],
  [150, 260, -220, null, [170, 80]],
  [150, 260, -200, null, [170, 80]],
  [250, 400, 420], [160, 400, 0],
  [420, 420, -30, [[0.5, 260]]],
  [150, 900, 0],
], [3, 5, 9, 12], [
  { x: 380, to: 1100, text: 'Land on a glowing pad to bounce  ·  hold SPACE for even more air', touch: 'Land on a glowing pad to bounce' },
]);

// ---------------------------------------------------------------- 5 · Chain Reaction
const chain = course({ id: 'chain', name: 'Chain Reaction', blurb: 'Long swing chains over deep gaps', difficulty: 'Hard' }, [
  [0, 500, 0],
  [560, 200, -20, [[0.2, 250], [0.5, 280], [0.8, 250]]],
  [300, 200, 0, [[0.5, 250]]],
  [640, 220, -30, [[0.15, 230], [0.38, 260], [0.62, 230], [0.85, 260]]],
  [180, 280, -40],
  [560, 200, 20, [[0.2, 260], [0.5, 300], [0.8, 260]]],
  [260, 200, -60, [[0.5, 260]]],
  [700, 240, 40, [[0.12, 240], [0.3, 270], [0.5, 300], [0.7, 270], [0.88, 240]]],
  [200, 300, -30],
  [320, 200, -100, [[0.5, 280]]],
  [440, 200, 100, [[0.5, 260]]],
  [700, 260, -50, [[0.15, 240], [0.4, 280], [0.62, 280], [0.85, 240]]],
  [200, 900, -20],
], [3, 5, 7, 11], [
  { x: 500, to: 1300, text: 'Do not touch the ground  ·  release one node, grab the next', touch: 'Release one node, then grab the next' },
]);

// ---------------------------------------------------------------- 6 · Midnight Drop
const midnight = course({ id: 'midnight', name: 'Midnight Drop', blurb: 'Fast descents and big launches', difficulty: 'Hard', base: 200 }, [
  [0, 500, 0], [180, 400, 260], [170, 500, 200],
  [400, 300, -20, [[0.5, 260]]], [350, 250, 100, [[0.5, 300]]],
  [200, 600, 200],
  [480, 300, -150, [[0.4, 320], [0.8, 280]]], [180, 280, -60],
  [520, 260, -40, [[0.25, 260], [0.55, 280], [0.85, 250]]],
  [160, 500, 220], [200, 400, 150],
  [500, 300, -220, [[0.3, 300], [0.65, 330]]],
  [170, 900, -60],
], [2, 5, 8, 10], [
  { x: 800, to: 1600, text: 'Release at the bottom of a swing to launch far', touch: 'Release at the bottom of a swing to launch far' },
]);

// ---------------------------------------------------------------- 7 · Pinball Alley (pads + swings)
const pinball = course({ id: 'pinball', name: 'Pinball Alley', blurb: 'Bounce, swing, repeat', difficulty: 'Hard' }, [
  [0, 450, 0, null, [370, 80]], [200, 220, -80], [150, 260, 0, null, [180, 70]],
  [450, 240, -150, [[0.5, 330]]], [180, 260, -60],
  [340, 200, 100, [[0.5, 230]]], [190, 260, -40, null, [190, 60]],
  [320, 200, -220, [[0.5, 330]]], [150, 300, -60],
  [480, 240, 90, [[0.3, 300], [0.7, 280]], [150, 70]],
  [200, 260, 0, null, [180, 70]], [170, 260, -200, null, [170, 70]], [150, 260, -160, null, [170, 70]],
  [380, 260, -20, [[0.5, 300]]], [180, 900, 0],
], [3, 6, 9, 12], [
  { x: 300, to: 1100, text: 'Bounce off a pad, then grab a node at the top', touch: 'Bounce off a pad, then grab a node at the top' },
]);

// ---------------------------------------------------------------- 8 · Neon Gauntlet
const gauntlet = course({ id: 'gauntlet', name: 'Neon Gauntlet', blurb: 'Everything you have learned', difficulty: 'Expert', base: 700 }, [
  [0, 420, 0], [170, 180, -40], [170, 160, -40], [170, 160, 40],
  [440, 200, -30, [[0.5, 260]]],
  [160, 180, -70, null, [60, 70]], [140, 200, -200],
  [560, 200, -20, [[0.2, 250], [0.5, 290], [0.8, 250]]],
  [200, 160, -110, [[0.5, 220]]], [200, 160, -110, [[0.5, 220]]], [200, 240, -100, [[0.5, 220]]],
  [420, 200, 280, [[0.5, 300]]],
  [240, 400, 200],
  [520, 220, -120, [[0.3, 320], [0.7, 300]]],
  [160, 200, -40, null, [100, 70]], [200, 200, -200],
  [640, 220, 60, [[0.15, 280], [0.38, 310], [0.62, 280], [0.85, 300]]],
  [180, 260, -40],
  [420, 180, -160, [[0.5, 320]]], [440, 180, 120, [[0.5, 280]]],
  [700, 240, -60, [[0.12, 260], [0.3, 290], [0.5, 320], [0.7, 290], [0.88, 260]]],
  [180, 1000, 0],
], [4, 7, 11, 14, 17, 20], [
  { x: 0, to: 700, text: 'The final course  ·  no more hints', touch: 'The final course' },
]);

export const LEVELS = [heights, sunset, cloud, spring, chain, midnight, pinball, gauntlet];
for (const L of LEVELS) {
  L.length = L.finish.x;
  // medal times scale with course length (the original course: gold ≈ 1:10, silver ≈ 1:30)
  const k = { heights: 1, sunset: 1.0, cloud: 1.35, spring: 1.2, chain: 1.45, midnight: 1.25, pinball: 1.4, gauntlet: 1.5 }[L.id] || 1;
  L.par = { gold: Math.round(L.length / 150 * k / 5) * 5 * 1000, silver: Math.round(L.length / 115 * k / 5) * 5 * 1000 };
}
export const LEVEL = LEVELS[0];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
