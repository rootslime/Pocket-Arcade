// Dream Boutique data: wardrobe items, styles and styling challenges.
// style weights are 0-3 for: cute, glam, sporty, casual, elegant, edgy
export const STYLES = ['cute', 'glam', 'sporty', 'casual', 'elegant', 'edgy'];
export const STYLE_LABEL = { cute: 'Cute', glam: 'Glamorous', sporty: 'Sporty', casual: 'Casual', elegant: 'Elegant', edgy: 'Edgy' };

export const SLOTS = [
  { id: 'hair', name: 'Hair', icon: '💇', weight: 1, optional: false },
  { id: 'top', name: 'Top / Dress', icon: '👚', weight: 3, optional: false },
  { id: 'bottom', name: 'Bottom', icon: '👖', weight: 2, optional: false },
  { id: 'shoes', name: 'Shoes', icon: '👟', weight: 1.5, optional: false },
  { id: 'accessory', name: 'Accessory', icon: '🎀', weight: 1, optional: true },
  { id: 'bag', name: 'Bag', icon: '👜', weight: 1, optional: true },
  { id: 'jewelry', name: 'Jewelry', icon: '💎', weight: 1, optional: true },
  { id: 'makeup', name: 'Makeup', icon: '💄', weight: 1, optional: true },
];

// s: [cute, glam, sporty, casual, elegant, edgy]   f: formality 0-3   u: wins needed to unlock
const I = (id, slot, name, s, f, u = 0, extra = {}) => ({ id, slot, name, s, f, u, ...extra });
export const ITEMS = [
  // hair (colour = hair colour, chosen separately)
  I('long', 'hair', 'Long Waves', [1, 2, 0, 2, 2, 1], 1),
  I('bob', 'hair', 'Sleek Bob', [3, 1, 1, 2, 2, 2], 1),
  I('ponytail', 'hair', 'High Ponytail', [2, 0, 3, 2, 1, 1], 0),
  I('bun', 'hair', 'Elegant Bun', [1, 2, 2, 1, 3, 0], 2, 1),
  I('curly', 'hair', 'Big Curls', [2, 3, 0, 2, 1, 1], 1, 3),
  I('pixie', 'hair', 'Pixie Cut', [1, 1, 2, 1, 0, 3], 0, 5),
  // tops
  I('tee', 'top', 'Graphic Tee', [1, 0, 2, 3, 0, 1], 0),
  I('tank', 'top', 'Sport Tank', [1, 0, 3, 2, 0, 1], 0),
  I('crop', 'top', 'Crop Top', [2, 1, 2, 2, 0, 3], 0),
  I('blouse', 'top', 'Silk Blouse', [2, 1, 0, 2, 3, 0], 2),
  I('hoodie', 'top', 'Cozy Hoodie', [1, 0, 2, 3, 0, 2], 0),
  I('sweater', 'top', 'Soft Sweater', [3, 0, 0, 3, 1, 0], 1),
  I('sequin', 'top', 'Sequin Top', [1, 3, 0, 0, 2, 2], 2, 2),
  I('bodysuit', 'top', 'Bodysuit', [0, 2, 1, 1, 1, 3], 1, 4),
  // dresses (slot top, dress:true)
  I('sundress', 'top', 'Sundress', [3, 1, 0, 3, 1, 0], 1, 0, { dress: true }),
  I('partymini', 'top', 'Party Mini Dress', [3, 3, 0, 1, 1, 2], 2, 1, { dress: true }),
  I('ballgown', 'top', 'Ball Gown', [1, 3, 0, 0, 3, 0], 3, 3, { dress: true }),
  I('slip', 'top', 'Satin Slip Dress', [0, 3, 0, 1, 3, 2], 3, 6, { dress: true }),
  I('bodycon', 'top', 'Bodycon Dress', [0, 3, 1, 1, 2, 3], 2, 8, { dress: true }),
  // bottoms
  I('jeans', 'bottom', 'Denim Jeans', [1, 0, 1, 3, 0, 2], 0),
  I('shorts', 'bottom', 'Easy Shorts', [2, 0, 3, 3, 0, 1], 0),
  I('miniskirt', 'bottom', 'Mini Skirt', [3, 2, 1, 1, 0, 2], 1),
  I('midi', 'bottom', 'Midi Skirt', [2, 2, 0, 2, 3, 0], 2, 1),
  I('leggings', 'bottom', 'Leggings', [0, 0, 3, 2, 0, 2], 0),
  I('pleated', 'bottom', 'Pleated Skirt', [3, 1, 1, 2, 2, 0], 1, 2),
  I('leather', 'bottom', 'Leather Pants', [0, 2, 0, 1, 0, 3], 1, 5),
  // shoes
  I('sneakers', 'shoes', 'Sneakers', [1, 0, 3, 3, 0, 1], 0),
  I('heels', 'shoes', 'High Heels', [0, 3, 0, 0, 3, 1], 3),
  I('boots', 'shoes', 'Combat Boots', [0, 1, 1, 2, 1, 3], 1),
  I('flats', 'shoes', 'Ballet Flats', [3, 0, 0, 2, 2, 0], 2),
  I('sandals', 'shoes', 'Strappy Sandals', [2, 1, 1, 3, 1, 0], 0, 2),
  I('platforms', 'shoes', 'Platforms', [2, 3, 0, 0, 1, 3], 1, 4),
  // accessories
  I('bow', 'accessory', 'Big Bow', [3, 1, 0, 1, 1, 0], 0),
  I('cap', 'accessory', 'Baseball Cap', [1, 0, 3, 3, 0, 2], 0),
  I('sunglasses', 'accessory', 'Sunglasses', [0, 3, 2, 2, 1, 3], 0),
  I('tiara', 'accessory', 'Sparkle Tiara', [3, 3, 0, 0, 3, 0], 2, 1),
  I('headband', 'accessory', 'Headband', [2, 1, 2, 2, 2, 0], 0),
  I('beanie', 'accessory', 'Pom Beanie', [2, 0, 1, 3, 0, 2], 0, 3),
  // bags
  I('tote', 'bag', 'Canvas Tote', [1, 0, 1, 3, 1, 0], 0),
  I('clutch', 'bag', 'Evening Clutch', [0, 3, 0, 0, 3, 1], 3),
  I('backpack', 'bag', 'Backpack', [2, 0, 3, 3, 0, 2], 0),
  I('minibag', 'bag', 'Mini Bag', [3, 2, 0, 1, 2, 2], 1, 2),
  // jewelry
  I('pearls', 'jewelry', 'Pearl Necklace', [2, 2, 0, 1, 3, 0], 2),
  I('hoops', 'jewelry', 'Hoop Earrings', [1, 2, 1, 3, 1, 2], 0),
  I('choker', 'jewelry', 'Choker', [1, 2, 0, 1, 0, 3], 1, 3),
  I('pendant', 'jewelry', 'Pendant', [2, 2, 0, 2, 2, 1], 1),
  I('starstuds', 'jewelry', 'Star Studs', [3, 2, 1, 2, 0, 1], 0, 5),
  // makeup (colour = lip / shadow colour)
  I('natural', 'makeup', 'Natural Glow', [2, 0, 2, 3, 2, 0], 0),
  I('rosy', 'makeup', 'Rosy Cheeks', [3, 1, 0, 2, 1, 0], 0),
  I('smoky', 'makeup', 'Smoky Eyes', [0, 3, 0, 0, 2, 3], 2, 2),
  I('glitter', 'makeup', 'Glitter Glam', [2, 3, 0, 0, 1, 2], 1, 4),
  I('boldlip', 'makeup', 'Bold Lip', [0, 3, 0, 1, 3, 2], 2, 1),
];
export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

export const BACKGROUNDS = [
  { id: 'studio', name: 'Studio', u: 0 }, { id: 'blush', name: 'Blush Hearts', u: 2 },
  { id: 'city', name: 'City Lights', u: 5 }, { id: 'stars', name: 'Starry Night', u: 8 },
];
export const HAIR_COLORS = ['#3b2418', '#7a4a2a', '#d9a066', '#f1d27a', '#d94a4a', '#ff8ad8', '#8b5cff', '#2de2e6', '#23232f', '#e9e9ef'];
export const SKIN_TONES = ['#ffe0c7', '#f1c27d', '#d9a066', '#a8714a', '#6e4630'];

// Challenges. required: color(any-of families) | slot | item(any-of) | formal(avg>=n) | dress
//            bonus: count(accessories+bag+jewelry+makeup >= n) | jewelryMatch | item(any-of)
export const CHALLENGES = [
  { id: 'birthday', title: 'Birthday Party', icon: '🎂', style: 'cute', diff: 1, required: [{ type: 'color', any: ['pink'], label: 'Pink item' }], bonus: { type: 'count', n: 2, label: 'Accessories (2+)' } },
  { id: 'beach', title: 'Beach Day', icon: '🏖️', style: 'casual', diff: 1, required: [{ type: 'slot', slot: 'accessory', label: 'An accessory' }], bonus: { type: 'slot', slot: 'bag', label: 'Add a bag' } },
  { id: 'gym', title: 'Gym Session', icon: '🏋️', style: 'sporty', diff: 1, required: [{ type: 'item', any: ['sneakers'], label: 'Sneakers' }], bonus: { type: 'item', any: ['cap', 'headband'], label: 'Cap or headband' } },
  { id: 'market', title: 'Weekend Market', icon: '🥕', style: 'casual', diff: 1, required: [{ type: 'slot', slot: 'bag', label: 'A bag' }, { type: 'color', any: ['yellow', 'green'], label: 'Yellow or green item' }], bonus: { type: 'item', any: ['hoops'], label: 'Hoop earrings' } },
  { id: 'cafe', title: 'Café Date', icon: '☕', style: 'cute', diff: 2, required: [{ type: 'color', any: ['red', 'pink', 'orange'], label: 'Warm-colored item' }], bonus: { type: 'count', n: 3, label: 'Accessories (3+)' } },
  { id: 'school', title: 'School Spirit', icon: '📣', style: 'sporty', diff: 2, required: [{ type: 'color', any: ['blue', 'teal'], label: 'Blue item' }, { type: 'slot', slot: 'bag', label: 'A bag' }], bonus: { type: 'slot', slot: 'accessory', label: 'Add an accessory' } },
  { id: 'garden', title: 'Garden Tea', icon: '🫖', style: 'elegant', diff: 2, required: [{ type: 'formal', n: 1.5, label: 'Dressy outfit' }, { type: 'color', any: ['green', 'pink', 'white'], label: 'Green, pink or white item' }], bonus: { type: 'item', any: ['pearls'], label: 'Pearl necklace' } },
  { id: 'concert', title: 'Concert Night', icon: '🎸', style: 'edgy', diff: 3, required: [{ type: 'color', any: ['black'], label: 'Black item' }, { type: 'slot', slot: 'shoes', label: 'Statement shoes' }], bonus: { type: 'item', any: ['sunglasses', 'choker'], label: 'Shades or choker' } },
  { id: 'street', title: 'Street Style', icon: '🛹', style: 'edgy', diff: 3, required: [{ type: 'color', any: ['black', 'red'], label: 'Black or red item' }, { type: 'item', any: ['boots', 'platforms', 'sneakers'], label: 'Bold footwear' }], bonus: { type: 'count', n: 3, label: 'Accessories (3+)' } },
  { id: 'prom', title: 'Prom Night', icon: '👑', style: 'glam', diff: 3, required: [{ type: 'dress', label: 'A dress' }, { type: 'color', any: ['pink', 'purple', 'blue'], label: 'Pink, purple or blue item' }], bonus: { type: 'jewelryMatch', label: 'Matching jewelry' } },
  { id: 'redcarpet', title: 'Red Carpet', icon: '🎬', style: 'glam', diff: 4, required: [{ type: 'formal', n: 2, label: 'Formal outfit' }], bonus: { type: 'jewelryMatch', label: 'Matching jewelry' } },
  { id: 'gala', title: 'Winter Gala', icon: '❄️', style: 'elegant', diff: 4, required: [{ type: 'formal', n: 2, label: 'Formal outfit' }, { type: 'color', any: ['purple', 'blue', 'silver'], label: 'Purple, blue or silver item' }], bonus: { type: 'count', n: 3, label: 'Accessories (3+)' } },
];
