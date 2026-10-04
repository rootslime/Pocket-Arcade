// Procedural SVG model for Dream Boutique (original artwork, no external assets).
import { shade, tint, colorById } from '../../js/colors.js';
import { SKIN_TONES } from './data.js';

const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const R = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;

const col = (o) => (o ? colorById(o.color).hex : '#ccc');

// ---- clothing shapes (viewBox 220 x 420, body centre x = 110)
const TOPS = {
  tee: (c, d) => P('M84 104 Q110 98 136 104 L152 132 L138 140 L134 128 L132 192 L88 192 L86 128 L82 140 L68 132 Z', c) + R(90, 128, 40, 4, d, 2, 'opacity=".25"'),
  tank: (c, d) => P('M92 106 L98 102 Q110 112 122 102 L128 106 L132 192 L88 192 Z', c) + R(90, 188, 40, 5, d, 2),
  crop: (c, d) => P('M84 104 Q110 98 136 104 L150 128 L138 134 L134 124 L132 156 L88 156 L86 124 L82 134 L70 128 Z', c) + R(88, 152, 44, 5, d, 2),
  blouse: (c, d) => P('M84 104 Q110 98 136 104 L136 192 L84 192 Z', c) + C(76, 126, 15, c) + C(144, 126, 15, c) + P('M100 100 L110 116 L120 100 Q110 94 100 100 Z', d) + R(88, 186, 44, 6, d, 3, 'opacity=".5"'),
  hoodie: (c, d) => P('M84 104 Q110 98 136 104 L156 186 L144 190 L134 134 L132 198 L88 198 L86 134 L76 190 L64 186 Z', c) + P('M92 104 Q110 124 128 104 Q110 90 92 104 Z', d) + R(96, 168, 28, 16, d, 4, 'opacity=".5"'),
  sweater: (c, d) => P('M84 104 Q110 98 136 104 L156 184 L144 188 L134 134 L132 200 L88 200 L86 134 L76 188 L64 184 Z', c) + R(88, 194, 44, 8, d, 3) + R(62, 180, 14, 8, d, 3) + R(144, 180, 14, 8, d, 3) + R(96, 100, 28, 8, d, 4),
  sequin: (c, d) => P('M84 104 Q110 98 136 104 L150 130 L138 138 L134 126 L132 192 L88 192 L86 126 L82 138 L70 130 Z', c) + [[96, 130], [110, 118], [122, 144], [100, 160], [118, 170], [104, 184]].map(([x, y]) => `<path d="M${x} ${y - 4} L${x + 1.5} ${y - 1.5} L${x + 4} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 4} L${x - 1.5} ${y + 1.5} L${x - 4} ${y} L${x - 1.5} ${y - 1.5} Z" fill="#fff" opacity=".85"/>`).join(''),
  bodysuit: (c, d) => P('M84 104 Q110 98 136 104 L156 184 L144 188 L134 134 L136 214 L84 214 L86 134 L76 188 L64 184 Z', c) + R(84, 208, 52, 6, d, 3, 'opacity=".5"'),
};
const DRESSES = {
  sundress: (c, d) => P('M92 104 L98 102 Q110 112 122 102 L128 104 L128 170 L160 292 L60 292 L92 170 Z', c) + R(92, 166, 36, 6, d, 3) + P('M60 292 L160 292 L160 298 L60 298 Z', d, 'opacity=".5"'),
  partymini: (c, d) => P('M84 104 Q110 98 136 104 L136 168 L158 248 L62 248 L84 168 Z', c) + R(84, 164, 52, 7, d, 3) + [0, 1, 2, 3, 4, 5].map((i) => C(70 + i * 16, 248, 8, c)).join('') + [[100, 130], [120, 146], [96, 206], [128, 222]].map(([x, y]) => C(x, y, 2.2, '#fff', 'opacity=".8"')).join(''),
  ballgown: (c, d) => P('M86 104 Q110 96 134 104 L132 166 L184 372 L36 372 L88 166 Z', c) + P('M86 104 Q110 118 134 104 L134 112 Q110 126 86 112 Z', d, 'opacity=".5"') + R(88, 162, 44, 7, d, 3) + [[70, 340], [150, 340], [110, 300], [90, 250], [132, 250]].map(([x, y]) => C(x, y, 2.5, '#fff', 'opacity=".7"')).join('') + P('M36 372 L184 372 L184 380 L36 380 Z', d, 'opacity=".6"'),
  slip: (c, d) => P('M94 104 L98 102 Q110 110 122 102 L126 104 L132 190 L146 344 L74 344 L88 190 Z', c) + P('M94 104 Q92 90 90 86 M126 104 Q128 90 130 86', 'none', `stroke="${d}" stroke-width="2.5"`) + P('M100 150 Q110 160 120 150', 'none', 'stroke="#fff" stroke-width="2" opacity=".35"'),
  bodycon: (c, d) => P('M86 104 Q110 98 134 104 L136 160 L138 200 L134 288 L86 288 L82 200 L84 160 Z', c) + R(86, 282, 48, 6, d, 3) + P('M88 150 Q110 160 132 150', 'none', 'stroke="#fff" stroke-width="2" opacity=".3"'),
};
const BOTTOMS = {
  jeans: (c, d) => R(88, 192, 44, 12, d, 3) + P('M88 198 L132 198 L130 358 L112 358 L110 230 L108 358 L90 358 Z', c) + R(106, 200, 4, 30, d, 2, 'opacity=".4"'),
  shorts: (c, d) => R(88, 192, 44, 10, d, 3) + P('M88 198 L132 198 L134 262 L112 262 L110 224 L108 262 L86 262 Z', c),
  miniskirt: (c, d) => R(88, 192, 44, 8, d, 3) + P('M88 198 L132 198 L148 250 L72 250 Z', c),
  midi: (c, d) => R(88, 192, 44, 8, d, 3) + P('M88 198 L132 198 L152 308 L68 308 Z', c) + P('M96 210 L90 300 M110 210 L110 304 M124 210 L130 300', 'none', `stroke="${d}" stroke-width="2" opacity=".4"`),
  leggings: (c, d) => R(89, 192, 42, 8, d, 3) + P('M89 198 L131 198 L127 356 L112 356 L110 232 L108 356 L93 356 Z', c) + P('M96 220 L96 340 M124 220 L124 340', 'none', 'stroke="#fff" stroke-width="1.5" opacity=".2"'),
  pleated: (c, d) => R(88, 192, 44, 8, d, 3) + P('M88 198 L132 198 L150 272 L70 272 Z', c) + [76, 88, 100, 112, 124, 136, 146].map((x) => `<path d="M${x} 274 L${88 + (x - 110) * 0.35 + 22} 200" stroke="${d}" stroke-width="1.6" opacity=".45"/>`).join(''),
  leather: (c, d) => R(88, 192, 44, 10, d, 3) + P('M88 198 L132 198 L130 358 L112 358 L110 232 L108 358 L90 358 Z', c) + P('M94 210 L92 300 M126 210 L128 300', 'none', 'stroke="#fff" stroke-width="2" opacity=".35"') + R(106, 202, 8, 6, '#c5ccd9', 1),
};
const SHOES = {
  sneakers: (c, d) => [[84, 98], [112, 126]].map(([a, b], i) => P(`M${a} 354 L${b - 2} 354 L${b + (i ? 8 : -8) + 6} 372 L${a + (i ? -4 : -10)} 372 Z`, c) + R(a + (i ? -6 : -12), 370, 38, 6, '#fff', 3)).join(''),
  heels: (c, d) => P('M86 354 L106 354 L104 366 L92 372 L88 372 L88 392 L84 392 L84 372 Z', c) + P('M114 354 L134 354 L136 372 L132 372 L132 392 L128 392 L128 372 L122 366 Z', c).replace('', ''),
  boots: (c, d) => P('M86 312 L106 312 L106 372 L78 372 L78 362 L86 358 Z', c) + P('M114 312 L134 312 L142 358 L142 372 L114 372 Z', c) + R(84, 366, 24, 7, d, 2) + R(112, 366, 30, 7, d, 2),
  flats: (c, d) => P('M86 356 L106 356 L108 368 L82 370 Z', c) + P('M114 356 L134 356 L138 370 L112 368 Z', c) + C(94, 362, 2, d) + C(126, 362, 2, d),
  sandals: (c, d) => R(84, 366, 24, 5, c, 2) + R(112, 366, 26, 5, c, 2) + P('M88 352 L104 366 M104 352 L90 366 M116 352 L132 366 M132 352 L118 366', 'none', `stroke="${c}" stroke-width="3"`),
  platforms: (c, d) => P('M84 352 L106 352 L108 366 L82 366 Z', c) + P('M114 352 L136 352 L140 366 L112 366 Z', c) + R(80, 366, 30, 12, d, 3) + R(110, 366, 32, 12, d, 3),
};
const BAGS = {
  tote: (c, d) => P('M146 178 Q146 160 156 160 Q166 160 166 178', 'none', `stroke="${d}" stroke-width="3"`) + R(138, 178, 38, 40, c, 4) + R(138, 178, 38, 6, d, 2),
  clutch: (c, d) => R(96, 198, 34, 20, c, 4) + C(113, 208, 3, '#fff', 'opacity=".8"'),
  backpack: (c, d) => R(66, 112, 14, 62, c, 7) + R(140, 112, 14, 62, c, 7) + P('M84 108 L90 150 M136 108 L130 150', 'none', `stroke="${d}" stroke-width="4"`),
  minibag: (c, d) => P('M80 110 L134 200', 'none', `stroke="${d}" stroke-width="3"`) + R(130, 196, 28, 22, c, 5) + P('M130 204 L158 204', 'none', `stroke="${d}" stroke-width="2"`) + C(144, 208, 2.5, '#fff'),
};
const JEWELRY = {
  pearls: (c) => Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (0.12 + i * 0.095); return C(110 + Math.cos(a) * 15 * -1, 98 + Math.sin(a) * 16, 3, c, 'stroke="#fff" stroke-opacity=".5"'); }).join('') + C(110, 118, 3.4, c),
  hoops: (c) => `<circle cx="80" cy="76" r="8" fill="none" stroke="${c}" stroke-width="3"/><circle cx="140" cy="76" r="8" fill="none" stroke="${c}" stroke-width="3"/>`,
  choker: (c) => P('M98 94 Q110 104 122 94 L122 99 Q110 109 98 99 Z', c) + C(110, 105, 3, '#fff', 'opacity=".8"'),
  pendant: (c) => P('M96 98 L110 130 L124 98', 'none', `stroke="${c}" stroke-width="1.8"`) + `<path d="M110 126 L114 132 L110 140 L106 132 Z" fill="${c}" stroke="#fff" stroke-opacity=".6"/>`,
  starstuds: (c) => [[80, 74], [140, 74]].map(([x, y]) => `<path d="M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y - 2} L${x + 3} ${y + 1} L${x + 4} ${y + 6} L${x} ${y + 3} L${x - 4} ${y + 6} L${x - 3} ${y + 1} L${x - 6} ${y - 2} L${x - 2} ${y - 2} Z" fill="${c}"/>`).join(''),
};
const ACCESSORIES = {
  bow: (c, d) => P('M126 38 L146 28 L146 50 Z M126 38 L106 28 L106 50 Z', c) + C(126, 38, 6, d),
  cap: (c, d) => P('M80 56 Q80 22 110 22 Q140 22 140 56 Z', c) + P('M104 54 Q140 50 158 62 L152 66 Q130 58 104 60 Z', d),
  sunglasses: (c) => R(86, 54, 20, 14, c, 6) + R(114, 54, 20, 14, c, 6) + R(104, 58, 12, 3, c) + P('M86 58 L80 54 M134 58 L140 54', 'none', `stroke="${c}" stroke-width="3"`),
  tiara: (c) => P('M88 38 L94 22 L102 34 L110 18 L118 34 L126 22 L132 38 Z', c, 'stroke="#fff" stroke-opacity=".6"') + C(110, 24, 2.5, '#fff'),
  headband: (c) => P('M82 56 Q110 14 138 56', 'none', `stroke="${c}" stroke-width="6" stroke-linecap="round"`),
  beanie: (c, d) => P('M80 52 Q80 18 110 18 Q140 18 140 52 Z', c) + R(78, 46, 64, 12, d, 5) + C(110, 14, 8, d),
};

// ---- hair (back layer, front layer)
const HAIR = {
  long: { back: (c) => P('M80 56 Q76 130 88 176 L132 176 Q144 130 140 56 Z', c), front: (c) => P('M80 62 Q80 30 110 30 Q140 30 140 62 Q130 46 110 46 Q92 46 80 62 Z', c) },
  bob: { back: (c) => P('M80 56 Q74 96 84 104 L136 104 Q146 96 140 56 Z', c), front: (c) => P('M80 64 Q80 28 110 28 Q140 28 140 64 Q130 44 110 44 Q92 44 80 64 Z', c) },
  ponytail: { back: (c) => P('M128 40 Q164 40 160 110 Q150 80 132 70 Z', c) + P('M84 56 Q84 34 110 34 L110 70 L84 70 Z', c, 'opacity="0"'), front: (c) => P('M80 62 Q80 26 110 26 Q140 26 140 62 Q130 42 110 42 Q92 42 80 62 Z', c) + C(132, 42, 5, '#ff8ad8') },
  bun: { back: () => '', front: (c) => C(110, 20, 15, c) + P('M80 62 Q80 28 110 28 Q140 28 140 62 Q130 44 110 44 Q92 44 80 62 Z', c) },
  curly: { back: (c) => [[78, 70], [74, 92], [82, 114], [142, 70], [146, 92], [138, 114]].map(([x, y]) => C(x, y, 14, c)).join(''), front: (c) => [[88, 40], [104, 32], [120, 32], [134, 42], [82, 56], [140, 56]].map(([x, y]) => C(x, y, 15, c)).join('') },
  pixie: { back: () => '', front: (c) => P('M80 64 Q76 24 112 24 Q146 26 140 62 Q130 40 112 38 Q96 40 94 54 Q88 50 80 64 Z', c) },
};

function face(skin, makeup, makeupColor) {
  const dark = shade(skin, 0.55);
  let s = '';
  s += C(110, 62, 28, skin) + C(100, 64, 2.6, '#2a1a22') + C(120, 64, 2.6, '#2a1a22');
  s += P('M101 76 Q110 83 119 76', 'none', 'stroke="#c55a7a" stroke-width="2.4" stroke-linecap="round"');
  s += P('M95 57 Q100 54 105 57 M115 57 Q120 54 125 57', 'none', `stroke="${dark}" stroke-width="2" stroke-linecap="round"`);
  if (makeup === 'natural') s += C(94, 72, 5, '#ff9aa8', 'opacity=".35"') + C(126, 72, 5, '#ff9aa8', 'opacity=".35"');
  if (makeup === 'rosy') s += C(94, 72, 6, '#ff5f9a', 'opacity=".5"') + C(126, 72, 6, '#ff5f9a', 'opacity=".5"') + P('M102 77 Q110 84 118 77 Q110 80 102 77 Z', makeupColor);
  if (makeup === 'smoky') s += `<ellipse cx="100" cy="62" rx="7" ry="4.5" fill="${makeupColor}" opacity=".55"/><ellipse cx="120" cy="62" rx="7" ry="4.5" fill="${makeupColor}" opacity=".55"/>`;
  if (makeup === 'glitter') s += [[92, 70], [97, 75], [128, 70], [123, 75], [110, 50], [100, 53], [120, 53]].map(([x, y]) => C(x, y, 1.8, makeupColor, 'opacity=".9"')).join('') + C(94, 72, 5, '#ffb3e6', 'opacity=".3"') + C(126, 72, 5, '#ffb3e6', 'opacity=".3"');
  if (makeup === 'boldlip') s += P('M101 76 Q110 86 119 76 Q110 79 101 76 Z', makeupColor, 'stroke="#fff" stroke-opacity=".3"');
  return s;
}

function background(id) {
  if (id === 'blush') return `<rect width="220" height="420" fill="#ffd6ec"/>${[[30, 60], [180, 100], [40, 230], [190, 300], [100, 390]].map(([x, y]) => `<path d="M${x} ${y + 6} C${x - 14} ${y - 6} ${x - 6} ${y - 14} ${x} ${y - 6} C${x + 6} ${y - 14} ${x + 14} ${y - 6} ${x} ${y + 6}" fill="#ff8ad8" opacity=".55"/>`).join('')}`;
  if (id === 'city') return `<rect width="220" height="420" fill="#2b1a5e"/>${[[0, 220, 40], [38, 170, 36], [72, 250, 40], [112, 190, 34], [146, 230, 38], [182, 200, 38]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${420 - y}" fill="#1a1042"/>${[0, 1, 2, 3, 4].map((k) => `<rect x="${x + 6}" y="${y + 10 + k * 22}" width="6" height="8" fill="#ffe14d" opacity=".8"/><rect x="${x + 20}" y="${y + 10 + k * 22}" width="6" height="8" fill="#2de2e6" opacity=".7"/>`).join('')}`).join('')}`;
  if (id === 'stars') return `<rect width="220" height="420" fill="#120b3a"/>${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 73) % 220}" cy="${(i * 131) % 400}" r="${1 + (i % 3) * 0.7}" fill="#fff" opacity="${0.4 + (i % 4) * 0.15}"/>`).join('')}<circle cx="170" cy="50" r="22" fill="#ffe9a8" opacity=".9"/>`;
  return `<defs><linearGradient id="bgs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e9ff"/><stop offset="1" stop-color="#cdbbf0"/></linearGradient></defs><rect width="220" height="420" fill="url(#bgs)"/><ellipse cx="110" cy="396" rx="80" ry="10" fill="#000" opacity=".12"/>`;
}

/** Build the SVG markup for an outfit. outfit: { hair:{id,color}, top, bottom, shoes, accessory, bag, jewelry, makeup }, look: {skin, bg} */
export function modelSVG(outfit, look = {}, opts = {}) {
  const skin = SKIN_TONES[look.skin ?? 1] || SKIN_TONES[1];
  const dark = shade(skin, 0.8);
  const g = (slot, table, which) => {
    const o = outfit[slot];
    if (!o || !o.id || !table[o.id]) return '';
    const hex = col(o);
    return table[o.id](hex, shade(hex, 0.7));
  };
  const hair = outfit.hair && outfit.hair.id ? HAIR[outfit.hair.id] : null;
  const hairHex = outfit.hair ? outfit.hair.color : '#3b2418';
  const dress = outfit.top && DRESSES[outfit.top.id];
  const makeupId = outfit.makeup && outfit.makeup.id;
  const makeupHex = outfit.makeup ? colorById(outfit.makeup.color).hex : '#ff5f9a';
  const bagId = outfit.bag && outfit.bag.id;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 420" role="img" aria-label="${opts.label || 'Styled model'}">`;
  s += background(look.bg);
  if (bagId === 'backpack') s += g('bag', BAGS);
  if (hair) s += hair.back(hairHex);
  // body
  s += P('M103 88 L117 88 L117 106 L103 106 Z', skin);
  s += P('M84 104 Q110 98 136 104 L132 196 L88 196 Z', skin);
  s += P('M84 106 L66 190 L76 194 L92 118 Z', skin) + P('M136 106 L154 190 L144 194 L128 118 Z', skin);
  s += P('M88 194 L132 194 L134 214 L86 214 Z', skin);
  s += P('M90 212 L88 358 L106 358 L110 212 Z', skin) + P('M110 212 L114 358 L132 358 L130 212 Z', skin) + P('M110 214 L110 300', 'none', `stroke="${dark}" stroke-width="1.5" opacity=".5"`);
  // plain base layer (so the model is always dressed)
  s += P('M90 108 L98 104 Q110 114 122 104 L130 108 L131 194 L89 194 Z', '#efe6fa') + P('M88 192 L132 192 L138 236 L112 236 L110 226 L108 236 L82 236 Z', '#efe6fa');
  if (!dress) s += g('bottom', BOTTOMS);
  if (dress) s += g('top', DRESSES); else s += g('top', TOPS);
  s += g('shoes', SHOES);
  if (bagId && bagId !== 'backpack') s += g('bag', BAGS);
  s += face(skin, makeupId, makeupHex);
  if (hair) s += hair.front(hairHex);
  s += g('accessory', ACCESSORIES);
  if (outfit.jewelry && JEWELRY[outfit.jewelry.id]) s += JEWELRY[outfit.jewelry.id](col(outfit.jewelry));
  return s + '</svg>';
}
