// Procedural SVG portrait for Glam Studio (original artwork).
import { shade, tint } from '../../js/colors.js';
import { SKINS, colorHex } from './data.js';

const P = (d, f, x = '') => `<path d="${d}" fill="${f}" ${x}/>`;
const C = (x, y, r, f, e = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${e}/>`;
const E = (x, y, rx, ry, f, e = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${e}/>`;
const star = (x, y, r, f, o = 1) => `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z" fill="${f}" opacity="${o}"/>`;
const heart = (x, y, s, f, o = 1) => `<path d="M${x} ${y + s * 0.9} C${x - s * 1.6} ${y - s * 0.2} ${x - s * 0.7} ${y - s * 1.2} ${x} ${y - s * 0.4} C${x + s * 0.7} ${y - s * 1.2} ${x + s * 1.6} ${y - s * 0.2} ${x} ${y + s * 0.9}" fill="${f}" opacity="${o}"/>`;

const HAIR = {
  long: { back: (c) => P('M80 130 Q70 250 92 330 L208 330 Q230 250 220 130 Z', c), front: (c) => P('M86 140 Q80 70 150 62 Q220 70 214 140 Q200 100 150 98 Q110 100 86 140 Z', c) },
  bob: { back: (c) => P('M80 130 Q74 214 100 232 L200 232 Q226 214 220 130 Z', c), front: (c) => P('M84 146 Q80 66 150 60 Q220 66 216 146 Q196 96 150 98 Q104 96 84 146 Z', c) },
  bun: { back: (c) => C(150, 52, 28, c), front: (c) => P('M86 144 Q80 74 150 68 Q220 74 214 144 Q196 100 150 100 Q106 100 86 144 Z', c) },
  puff: { back: (c) => C(84, 120, 38, c) + C(216, 120, 38, c), front: (c) => P('M86 146 Q80 62 150 58 Q220 62 214 146 Q196 96 150 96 Q104 96 86 146 Z', c) },
  pigtails: { back: (c) => P('M90 120 Q40 160 56 270 Q72 230 96 180 Z', c) + P('M210 120 Q260 160 244 270 Q228 230 204 180 Z', c), front: (c) => P('M86 146 Q80 66 150 60 Q220 66 214 146 Q196 96 150 98 Q104 96 86 146 Z', c) },
  wavy: { back: (c) => P('M78 130 Q56 210 80 260 Q60 300 96 334 L204 334 Q240 300 220 260 Q244 210 222 130 Z', c), front: (c) => P('M84 148 Q76 62 150 58 Q224 62 216 148 Q196 90 168 100 Q150 80 132 100 Q104 90 84 148 Z', c) },
};

const OUTFIT = {
  tee: (c, d) => P('M70 340 Q74 262 120 248 Q150 266 180 248 Q226 262 230 340 Z', c) + P('M120 248 Q150 266 180 248 Q150 282 120 248 Z', d),
  camisole: (c, d) => P('M92 340 L100 262 Q122 250 124 250 Q150 270 176 250 Q178 250 200 262 L208 340 Z', c) + P('M112 262 L110 244 M188 262 L190 244', 'none', `stroke="${d}" stroke-width="4"`),
  hoodie: (c, d) => P('M60 340 Q64 262 112 246 Q150 266 188 246 Q236 262 240 340 Z', c) + P('M104 248 Q150 292 196 248 Q150 232 104 248 Z', d) + P('M142 282 L142 330 M158 282 L158 330', 'none', 'stroke="#fff" stroke-width="3" opacity=".6"'),
  blazer: (c, d) => P('M62 340 Q66 262 114 246 L150 330 L186 246 Q234 262 238 340 Z', c) + P('M150 330 L120 250 L114 246 L150 300 Z M150 330 L180 250 L186 246 L150 300 Z', d) + P('M126 252 L150 312 L174 252 Z', '#f6f2ff'),
  sweater: (c, d) => P('M62 340 Q66 258 116 244 Q150 262 184 244 Q234 258 238 340 Z', c) + P('M116 244 Q150 262 184 244 L184 256 Q150 276 116 256 Z', d) + [0, 1, 2, 3].map((i) => `<path d="M${80 + i * 46} 300 L${86 + i * 46} 340" stroke="${d}" stroke-width="3" opacity=".35"/>`).join(''),
  gown: (c, d) => P('M80 340 Q84 268 116 252 Q150 286 184 252 Q216 268 220 340 Z', c) + P('M116 252 Q150 286 184 252 Q150 268 116 252 Z', d) + [[110, 300], [140, 320], [180, 304], [160, 288], [124, 330]].map(([x, y]) => star(x, y, 3.5, '#fff', 0.8)).join(''),
};

function backdrop(id) {
  switch (id) {
    case 'sunset': return `<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a6b"/><stop offset=".6" stop-color="#ff5f9a"/><stop offset="1" stop-color="#7a3cbd"/></linearGradient></defs><rect width="300" height="340" fill="url(#gb)"/>${C(220, 90, 34, '#ffe9a8', 'opacity=".9"')}`;
    case 'festival': return `<rect width="300" height="340" fill="#3b1c78"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${i * 50} 0 L${i * 50 + 25} 80 L${i * 50 + 50} 0 Z" fill="${['#ff3cac', '#ffe14d', '#2de2e6'][i % 3]}" opacity=".8"/>`).join('')}${[40, 110, 190, 260].map((x, i) => C(x, 70 + (i % 2) * 30, 6, '#fff', 'opacity=".7"')).join('')}`;
    case 'snow': return `<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9ff"/><stop offset="1" stop-color="#8fb4e8"/></linearGradient></defs><rect width="300" height="340" fill="url(#gb)"/>`;
    case 'garden': return `<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9f8e4"/><stop offset="1" stop-color="#8fdcb0"/></linearGradient></defs><rect width="300" height="340" fill="url(#gb)"/>${[[30, 290], [80, 310], [240, 300], [270, 270], [190, 320]].map(([x, y], i) => `${C(x, y, 14, ['#ff8ad8', '#ffe14d', '#fff', '#ff9a6b', '#a870ff'][i], 'opacity=".9"')}${C(x, y, 5, '#ffcf4d')}`).join('')}`;
    case 'galaxy': return `<defs><radialGradient id="gb" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#4a2c9a"/><stop offset="1" stop-color="#0a0626"/></radialGradient></defs><rect width="300" height="340" fill="url(#gb)"/>${Array.from({ length: 30 }, (_, i) => C((i * 97) % 300, (i * 53) % 330, 0.8 + (i % 3) * 0.6, '#fff', `opacity="${0.4 + (i % 4) * 0.15}"`)).join('')}`;
    case 'gold': return `<defs><radialGradient id="gb" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#fff1b8"/><stop offset="1" stop-color="#d9972b"/></radialGradient></defs><rect width="300" height="340" fill="url(#gb)"/>`;
    default: return `<defs><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd6f5"/><stop offset="1" stop-color="#cdbbf7"/></linearGradient></defs><rect width="300" height="340" fill="url(#gb)"/>`;
  }
}

function effects(fx) {
  let s = '';
  if (fx.includes('glow')) s += `<radialGradient id="gg" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><rect width="300" height="340" fill="url(#gg)"/>`;
  if (fx.includes('sparkles')) s += [[40, 60, 9], [260, 80, 11], [60, 250, 7], [250, 240, 9], [30, 160, 6], [272, 170, 7]].map(([x, y, r]) => star(x, y, r, '#fff', 0.95)).join('');
  if (fx.includes('hearts')) s += [[44, 90, 8], [256, 60, 10], [58, 230, 7], [248, 220, 9], [270, 140, 6]].map(([x, y, r]) => heart(x, y, r, '#ff5f9a', 0.9)).join('');
  if (fx.includes('stars')) s += [[50, 40], [250, 110], [40, 200], [262, 260]].map(([x, y]) => `<path d="M${x} ${y} L${x + 40} ${y + 14}" stroke="#fff" stroke-width="2" opacity=".6"/>${star(x, y, 7, '#ffe14d')}`).join('');
  if (fx.includes('confetti')) s += Array.from({ length: 26 }, (_, i) => `<rect x="${(i * 61) % 290}" y="${(i * 37) % 320}" width="8" height="4" rx="1" fill="${['#ff3cac', '#ffe14d', '#2de2e6', '#5dff8f', '#a870ff'][i % 5]}" transform="rotate(${(i * 47) % 180} ${(i * 61) % 290} ${(i * 37) % 320})" opacity=".9"/>`).join('');
  if (fx.includes('snow')) s += Array.from({ length: 22 }, (_, i) => C((i * 71) % 300, (i * 43) % 330, 2 + (i % 3), '#fff', 'opacity=".85"')).join('');
  return s;
}

/** look -> SVG string. */
export function lookSVG(look, opts = {}) {
  const skin = SKINS[look.skin] || SKINS[1];
  const sd = shade(skin, 0.82);
  const hx = (slot) => colorHex(look[slot].color);
  const hair = HAIR[look.hair.id] || HAIR.long;
  const hairHex = hx('hair');
  const oc = hx('outfit');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" role="img" aria-label="${opts.label || 'Styled look'}">`;
  s += backdrop(look.bg);
  s += hair.back(hairHex);
  s += P('M126 196 L174 196 L178 256 Q150 276 122 256 Z', skin) + P('M126 214 Q150 232 174 214 L174 222 Q150 240 126 222 Z', sd, 'opacity=".35"');
  s += (OUTFIT[look.outfit.id] || OUTFIT.tee)(oc, shade(oc, 0.72));
  // necklace
  const nk = look.necklace;
  if (nk.id !== 'none') {
    const c = colorHex(nk.color);
    if (nk.id === 'choker') s += P('M122 210 Q150 232 178 210 L178 220 Q150 242 122 220 Z', c) + C(150, 232, 5, '#fff', 'opacity=".8"');
    if (nk.id === 'pendant') s += P('M118 222 Q150 270 182 222', 'none', `stroke="${c}" stroke-width="2.5"`) + `<path d="M150 266 L158 276 L150 290 L142 276 Z" fill="${c}" stroke="#fff" stroke-opacity=".7"/>`;
    if (nk.id === 'pearls') s += Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.1 + i * 0.08); return C(150 - Math.cos(a) * 30, 214 + Math.sin(a) * 30, 5, c, 'stroke="#fff" stroke-opacity=".6"'); }).join('');
    if (nk.id === 'chain') s += P('M116 218 Q150 262 184 218', 'none', `stroke="${c}" stroke-width="3" stroke-dasharray="6 3"`) + P('M126 214 Q150 244 174 214', 'none', `stroke="${c}" stroke-width="2.5"`);
  }
  // face
  s += E(150, 142, 62, 72, skin) + E(88, 150, 8, 14, skin) + E(212, 150, 8, 14, skin);
  s += E(150, 142, 62, 72, 'none', `stroke="${sd}" stroke-width="1.5" opacity=".5"`);
  // earrings
  const er = look.earrings;
  if (er.id !== 'none') {
    const c = colorHex(er.color);
    for (const x of [86, 214]) {
      if (er.id === 'studs') s += C(x, 168, 4.5, c, 'stroke="#fff" stroke-opacity=".6"');
      if (er.id === 'hoops') s += `<circle cx="${x}" cy="182" r="11" fill="none" stroke="${c}" stroke-width="3.5"/>`;
      if (er.id === 'hearts') s += heart(x, 172, 6, c);
      if (er.id === 'drops') s += P(`M${x} 166 L${x} 178`, 'none', `stroke="${c}" stroke-width="2"`) + `<path d="M${x} 176 L${x + 6} 188 L${x} 198 L${x - 6} 188 Z" fill="${c}" stroke="#fff" stroke-opacity=".6"/>`;
      if (er.id === 'stars') s += star(x, 174, 7, c);
    }
  }
  // eyes
  const eyeCols = [[122, 138], [178, 138]];
  const sh = look.shadow;
  for (const [x, y] of eyeCols) {
    if (sh.id !== 'none') {
      const c = colorHex(sh.color);
      s += E(x, y - 8, 17, 10, c, 'opacity=".65"');
      if (sh.id === 'glitter') s += [[-9, -12], [0, -16], [8, -10], [-4, -6], [12, -14]].map(([dx, dy]) => C(x + dx, y + dy, 1.8, '#fff', 'opacity=".95"')).join('');
      if (sh.id === 'wing') s += P(`M${x + (x < 150 ? -18 : 18)} ${y - 4} L${x + (x < 150 ? -28 : 28)} ${y - 14} L${x + (x < 150 ? -12 : 12)} ${y - 8} Z`, shade(c, 0.4));
    }
    s += E(x, y, 12, 8, '#fff') + C(x, y, 5.6, '#3a2418') + C(x - 1.5, y - 2, 1.8, '#fff');
    s += P(`M${x - 13} ${y - 3} Q${x} ${y - 12} ${x + 13} ${y - 3}`, 'none', 'stroke="#2a1a22" stroke-width="2.2" stroke-linecap="round"');
    s += P(`M${x - 14} ${y - 22} Q${x} ${y - 29} ${x + 14} ${y - 22}`, 'none', `stroke="${shade(hairHex, 0.6)}" stroke-width="3.2" stroke-linecap="round"`);
  }
  s += P('M150 146 Q146 160 152 164', 'none', `stroke="${sd}" stroke-width="2" stroke-linecap="round"`);
  // blush
  const bl = look.blush;
  if (bl.id !== 'none') {
    const c = colorHex(bl.color);
    if (bl.id === 'soft') s += E(108, 164, 14, 9, c, 'opacity=".45"') + E(192, 164, 14, 9, c, 'opacity=".45"');
    else s += P('M96 168 Q112 152 128 156 Q112 168 96 168 Z', c, 'opacity=".5"') + P('M204 168 Q188 152 172 156 Q188 168 204 168 Z', c, 'opacity=".5"');
  }
  // lips
  const lp = look.lips;
  const lc = lp.id !== 'none' ? colorHex(lp.color) : '#d9798f';
  s += P('M130 184 Q140 178 150 184 Q160 178 170 184 Q160 202 150 204 Q140 202 130 184 Z', lc, lp.id === 'matte' ? '' : 'stroke="#fff" stroke-opacity=".25"');
  if (lp.id === 'gloss') s += E(144, 190, 6, 2.4, '#fff', 'opacity=".55"');
  if (lp.id === 'ombre') s += P('M132 186 Q150 196 168 186 Q160 200 150 202 Q140 200 132 186 Z', shade(lc, 0.7), 'opacity=".6"');
  s += P('M132 184 Q150 191 168 184', 'none', `stroke="${shade(lc, 0.6)}" stroke-width="1.5" opacity=".6"`);
  // stickers
  const st = look.sticker.id;
  if (st === 'freckles') s += [[110, 156], [118, 160], [124, 154], [190, 156], [182, 160], [176, 154]].map(([x, y]) => C(x, y, 1.7, shade(skin, 0.55), 'opacity=".8"')).join('');
  if (st === 'hearts') s += heart(104, 160, 5, '#ff5f9a') + heart(196, 160, 5, '#ff5f9a') + heart(150, 100, 4, '#ff8ad8');
  if (st === 'gems') s += [[100, 150], [104, 160], [200, 150], [196, 160], [150, 106]].map(([x, y], i) => `<path d="M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z" fill="${['#2de2e6', '#ff8ad8', '#2de2e6', '#ff8ad8', '#ffe14d'][i]}" stroke="#fff" stroke-opacity=".8"/>`).join('');
  if (st === 'stars') s += star(102, 158, 6, '#ffe14d') + star(198, 158, 6, '#ffe14d') + star(150, 102, 5, '#ff8ad8');
  // glasses
  const gl = look.glasses;
  if (gl.id !== 'none') {
    const c = colorHex(gl.color);
    if (gl.id === 'round') s += `<circle cx="122" cy="138" r="17" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="178" cy="138" r="17" fill="none" stroke="${c}" stroke-width="3.5"/>` + P('M139 138 Q150 130 161 138', 'none', `stroke="${c}" stroke-width="3.5"`);
    if (gl.id === 'sun') s += `<rect x="102" y="124" width="40" height="28" rx="10" fill="${c}" opacity=".92"/><rect x="158" y="124" width="40" height="28" rx="10" fill="${c}" opacity=".92"/>` + P('M142 134 L158 134', 'none', `stroke="${c}" stroke-width="4"`) + P('M108 130 L120 128', 'none', 'stroke="#fff" stroke-width="2.5" opacity=".5"');
    if (gl.id === 'heart') s += heart(122, 138, 15, c, 0.92) + heart(178, 138, 15, c, 0.92) + P('M139 134 L161 134', 'none', `stroke="${c}" stroke-width="3.5"`);
  }
  s += hair.front(hairHex);
  // hair accessory
  const ha = look.hairacc;
  if (ha.id !== 'none') {
    const c = colorHex(ha.color);
    if (ha.id === 'bow') s += P('M190 76 L226 58 L226 96 Z M190 76 L154 58 L154 96 Z', c) + C(190, 76, 9, shade(c, 0.7));
    if (ha.id === 'headband') s += P('M90 120 Q150 40 210 120', 'none', `stroke="${c}" stroke-width="9" stroke-linecap="round"`);
    if (ha.id === 'flowers') s += [[96, 98], [122, 78], [150, 70], [178, 78], [204, 98]].map(([x, y], i) => `${C(x, y, 11, i % 2 ? c : tint(c, 0.3))}${C(x, y, 4, '#ffd54d')}`).join('');
    if (ha.id === 'crown') s += P('M104 90 L112 58 L130 78 L150 48 L170 78 L188 58 L196 90 Z', c, 'stroke="#fff" stroke-opacity=".7"') + C(150, 62, 4, '#fff') + C(118, 70, 3, '#fff') + C(182, 70, 3, '#fff');
  }
  s += effects(look.fx);
  return s + '</svg>';
}
