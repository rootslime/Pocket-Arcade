// Glam Studio data: customization options, unlock levels and themed challenges.
import { PALETTE } from '../../js/colors.js';

export const COLORS = [...PALETTE,
  { id: 'brown', name: 'Brown', hex: '#6b4226', hue: null, hairOnly: true },
  { id: 'blonde', name: 'Blonde', hex: '#f1d27a', hue: null, hairOnly: true },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
export const SKINS = ['#ffe0c7', '#f1c27d', '#d9a066', '#a8714a', '#6e4630'];

// u = number of challenges won needed to unlock
const O = (id, name, u = 0) => ({ id, name, u });
export const OPTIONS = {
  hair: [O('long', 'Long Waves'), O('bob', 'Chic Bob'), O('bun', 'Top Bun'), O('puff', 'Cloud Puffs', 1), O('pigtails', 'Pigtails', 2), O('wavy', 'Mermaid Waves', 4)],
  glasses: [O('none', 'None'), O('round', 'Round Specs'), O('sun', 'Sunglasses'), O('heart', 'Heart Shades', 1)],
  sticker: [O('none', 'None'), O('freckles', 'Freckles'), O('hearts', 'Heart Stickers', 1), O('gems', 'Face Gems', 2), O('stars', 'Star Stickers', 3)],
  hairacc: [O('none', 'None'), O('bow', 'Bow'), O('headband', 'Headband'), O('flowers', 'Flower Crown', 1), O('crown', 'Tiara', 4)],
  shadow: [O('none', 'None'), O('soft', 'Soft Shadow'), O('glitter', 'Sparkle Shadow', 1), O('wing', 'Winged Liner', 3)],
  lips: [O('none', 'None'), O('gloss', 'Gloss'), O('matte', 'Matte'), O('ombre', 'Ombre Lip', 2)],
  blush: [O('none', 'None'), O('soft', 'Soft Blush'), O('sweep', 'Sweep Blush', 2)],
  earrings: [O('none', 'None'), O('studs', 'Studs'), O('hoops', 'Hoops'), O('hearts', 'Hearts', 1), O('drops', 'Drops', 3), O('stars', 'Stars', 4)],
  necklace: [O('none', 'None'), O('choker', 'Choker'), O('pendant', 'Pendant'), O('pearls', 'Pearls', 1), O('chain', 'Chains', 2)],
  outfit: [O('tee', 'Tee'), O('camisole', 'Camisole'), O('hoodie', 'Hoodie', 1), O('blazer', 'Blazer', 2), O('sweater', 'Sweater', 3), O('gown', 'Evening Gown', 4)],
  bg: [O('pastel', 'Pastel Sky'), O('sunset', 'Sunset'), O('festival', 'Festival', 1), O('snow', 'Snowfall', 2), O('garden', 'Garden', 3), O('galaxy', 'Galaxy', 4), O('gold', 'Gold Glow', 5)],
  fx: [O('sparkles', 'Sparkles'), O('hearts', 'Floating Hearts', 1), O('stars', 'Shooting Stars', 2), O('confetti', 'Confetti', 3), O('snow', 'Snow', 4), O('glow', 'Soft Glow', 5)],
};
export const COLORED = ['hair', 'glasses', 'hairacc', 'shadow', 'lips', 'blush', 'earrings', 'necklace', 'outfit'];

export const TABS = [
  { id: 'hair', name: 'Hair', icon: '💇', sections: [['hair', 'Style']] },
  { id: 'face', name: 'Face', icon: '😎', sections: [['glasses', 'Glasses', true], ['sticker', 'Stickers', false], ['hairacc', 'Hair accessory', true]] },
  { id: 'makeup', name: 'Makeup', icon: '💄', sections: [['shadow', 'Eyeshadow', true], ['lips', 'Lips', true], ['blush', 'Blush', true]] },
  { id: 'jewelry', name: 'Jewelry', icon: '💎', sections: [['earrings', 'Earrings', true], ['necklace', 'Necklace', true]] },
  { id: 'outfit', name: 'Outfit', icon: '👚', sections: [['outfit', 'Outfit', true]] },
  { id: 'scene', name: 'Scene', icon: '🌅', sections: [['bg', 'Background', false], ['fx', 'Effects', false]] },
];

export const defaultLook = () => ({
  skin: 1,
  hair: { id: 'long', color: 'brown' }, glasses: { id: 'none', color: 'black' }, sticker: { id: 'none' }, hairacc: { id: 'none', color: 'pink' },
  shadow: { id: 'none', color: 'purple' }, lips: { id: 'none', color: 'red' }, blush: { id: 'none', color: 'pink' },
  earrings: { id: 'none', color: 'gold' }, necklace: { id: 'none', color: 'gold' }, outfit: { id: 'tee', color: 'white' },
  bg: 'pastel', fx: [],
});

/** Validate / repair a look loaded from storage so a corrupted entry can never crash the renderer. */
export function sanitizeLook(raw) {
  const d = defaultLook();
  if (!raw || typeof raw !== 'object') return d;
  if (Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < SKINS.length) d.skin = raw.skin;
  for (const k of Object.keys(OPTIONS)) {
    if (k === 'bg') { if (OPTIONS.bg.some((o) => o.id === raw.bg)) d.bg = raw.bg; continue; }
    if (k === 'fx') { if (Array.isArray(raw.fx)) d.fx = raw.fx.filter((f) => OPTIONS.fx.some((o) => o.id === f)).slice(0, 2); continue; }
    const v = raw[k];
    if (v && typeof v === 'object' && OPTIONS[k].some((o) => o.id === v.id)) {
      d[k].id = v.id;
      if (COLORED.includes(k) && COLORS.some((c) => c.id === v.color)) d[k].color = v.color;
    }
  }
  return d;
}

const colorOf = (look, slot) => (look[slot] && look[slot].id !== 'none' ? look[slot].color : null);
export const allColors = (look) => COLORED.map((s) => colorOf(look, s)).filter(Boolean);
export const countColor = (look, fams) => allColors(look).filter((c) => fams.includes(c)).length;
export const hasHeart = (look) => look.glasses.id === 'heart' || look.sticker.id === 'hearts' || look.earrings.id === 'hearts' || look.fx.includes('hearts');
export const distinctColors = (look) => new Set(allColors(look)).size;
const on = (v) => v && v.id !== 'none';

// Challenge objectives are pure predicates over a look (shown live as a checklist).
const obj = (label, test, progress) => ({ label, test, progress });
export const CHALLENGES = [
  { id: 'pinkparty', title: 'PINK PARTY', icon: '🎀', blurb: 'Make it pink and playful!', color: true, diff: 1, time: 90,
    required: [obj('At least 2 pink items', (l) => countColor(l, ['pink']) >= 2, (l) => `${Math.min(2, countColor(l, ['pink']))}/2`), obj('1 heart accessory', hasHeart), obj('Sparkle makeup', (l) => l.shadow.id === 'glitter')],
    bonus: obj('Bonus: pink lips AND pink blush', (l) => colorOf(l, 'lips') === 'pink' && colorOf(l, 'blush') === 'pink') },
  { id: 'festival', title: 'FESTIVAL LOOK', icon: '🎪', blurb: 'Bright, bold and ready to dance.', diff: 1, time: 90,
    required: [obj('Face gems or star stickers', (l) => l.sticker.id === 'gems' || l.sticker.id === 'stars'), obj('3 different colours', (l) => distinctColors(l) >= 3, (l) => `${Math.min(3, distinctColors(l))}/3`), obj('Confetti or sparkles', (l) => l.fx.includes('confetti') || l.fx.includes('sparkles'))],
    bonus: obj('Bonus: flower crown', (l) => l.hairacc.id === 'flowers') },
  { id: 'winter', title: 'WINTER SPARKLE', icon: '❄️', blurb: 'Icy tones and a little shimmer.', color: true, diff: 2, time: 90,
    required: [obj('2 silver, white or blue items', (l) => countColor(l, ['silver', 'white', 'blue']) >= 2, (l) => `${Math.min(2, countColor(l, ['silver', 'white', 'blue']))}/2`), obj('Pearls or pendant', (l) => l.necklace.id === 'pearls' || l.necklace.id === 'pendant'), obj('Sparkles or snow effect', (l) => l.fx.includes('sparkles') || l.fx.includes('snow'))],
    bonus: obj('Bonus: sparkle shadow', (l) => l.shadow.id === 'glitter') },
  { id: 'retro', title: 'RETRO ROCK', icon: '🎸', blurb: 'Dark, daring and cool.', diff: 2, time: 90,
    required: [obj('2 black items', (l) => countColor(l, ['black']) >= 2, (l) => `${Math.min(2, countColor(l, ['black']))}/2`), obj('Sunglasses', (l) => l.glasses.id === 'sun'), obj('A choker', (l) => l.necklace.id === 'choker')],
    bonus: obj('Bonus: red lips', (l) => colorOf(l, 'lips') === 'red') },
  { id: 'garden', title: 'GARDEN BLOOM', icon: '🌸', blurb: 'Fresh as spring flowers.', color: true, diff: 2, time: 90,
    required: [obj('2 green, pink or yellow items', (l) => countColor(l, ['green', 'pink', 'yellow']) >= 2, (l) => `${Math.min(2, countColor(l, ['green', 'pink', 'yellow']))}/2`), obj('Flower crown', (l) => l.hairacc.id === 'flowers'), obj('Blush', (l) => on(l.blush))],
    bonus: obj('Bonus: garden background', (l) => l.bg === 'garden') },
  { id: 'gala', title: 'GOLDEN GALA', icon: '✨', blurb: 'Red-carpet gold from head to toe.', color: true, diff: 3, time: 90,
    required: [obj('2 gold items', (l) => countColor(l, ['gold']) >= 2, (l) => `${Math.min(2, countColor(l, ['gold']))}/2`), obj('A necklace', (l) => on(l.necklace)), obj('Lipstick', (l) => on(l.lips))],
    bonus: obj('Bonus: evening gown', (l) => l.outfit.id === 'gown') },
  { id: 'candy', title: 'CANDY LAND', icon: '🍭', blurb: 'A sweet rainbow of colour.', color: true, diff: 3, time: 90,
    required: [obj('4 different colours', (l) => distinctColors(l) >= 4, (l) => `${Math.min(4, distinctColors(l))}/4`), obj('Heart accessory', hasHeart), obj('Eyeshadow', (l) => on(l.shadow))],
    bonus: obj('Bonus: confetti effect', (l) => l.fx.includes('confetti')) },
];
