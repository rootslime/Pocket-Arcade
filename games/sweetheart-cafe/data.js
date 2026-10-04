// Sweetheart Café data: recipes, shift difficulty and cosmetic shop items.
export const RECIPES = [
  { id: 'coffee', name: 'Coffee', emoji: '☕', prep: 2.0, key: '1', station: 'Coffee Machine' },
  { id: 'cookie', name: 'Cookie', emoji: '🍪', prep: 2.0, key: '2', station: 'Oven' },
  { id: 'cupcake', name: 'Cupcake', emoji: '🧁', prep: 3.0, key: '3', station: 'Baking Table' },
  { id: 'berry', name: 'Strawberry Drink', emoji: '🍓', prep: 2.5, key: '4', station: 'Blender' },
  { id: 'cake', name: 'Cake', emoji: '🍰', prep: 3.5, key: '5', station: 'Cake Counter' },
];
export const recipeById = (id) => RECIPES.find((r) => r.id === id);

// recipes: how many recipes are on the menu this shift (in RECIPES order)
export const SHIFTS = [
  { dur: 60, interval: 7.0, seats: 2, items: [1, 1], patience: 30, goal: 5, recipes: 2 },
  { dur: 70, interval: 6.2, seats: 3, items: [1, 2], patience: 28, goal: 8, recipes: 3 },
  { dur: 75, interval: 5.6, seats: 3, items: [1, 2], patience: 25, goal: 10, recipes: 4 },
  { dur: 80, interval: 5.0, seats: 4, items: [1, 3], patience: 22, goal: 13, recipes: 5 },
  { dur: 85, interval: 4.4, seats: 4, items: [2, 3], patience: 19, goal: 16, recipes: 5 },
  { dur: 90, interval: 3.9, seats: 4, items: [2, 3], patience: 17, goal: 19, recipes: 5 },
];

export const GUESTS = ['🐱', '🐰', '🐻', '🦊', '🐼', '🐸', '🐶', '🦄'];

export const SHOP = [
  { id: 'theme-cream', cat: 'theme', name: 'Cream Latte', price: 0, css: ['#fff1de', '#f6d5c0'] },
  { id: 'theme-mint', cat: 'theme', name: 'Mint Macaron', price: 120, css: ['#dff8ea', '#b6ead2'] },
  { id: 'theme-berry', cat: 'theme', name: 'Berry Sorbet', price: 160, css: ['#ffe0ec', '#ffb6d2'] },
  { id: 'theme-night', cat: 'theme', name: 'Midnight Café', price: 240, css: ['#3b2f66', '#241a46'], dark: true },
  { id: 'table-wood', cat: 'table', name: 'Oak Tables', price: 0, css: ['#c68a54', '#a46c3c'] },
  { id: 'table-pink', cat: 'table', name: 'Pink Tables', price: 60, css: ['#ff9bb3', '#ef7b99'] },
  { id: 'table-glass', cat: 'table', name: 'Glass Tables', price: 110, css: ['#bfe9ff', '#8fd0f2'] },
  { id: 'counter-classic', cat: 'counter', name: 'Classic Counter', price: 0, css: ['#8a5a3a', '#6e4529'] },
  { id: 'counter-marble', cat: 'counter', name: 'Marble Counter', price: 90, css: ['#eee8f5', '#cfc6df'] },
  { id: 'counter-candy', cat: 'counter', name: 'Candy Counter', price: 140, css: ['#ff7fb0', '#ffb347'] },
  { id: 'plant-none', cat: 'plant', name: 'No Plants', price: 0, emoji: '' },
  { id: 'plant-fern', cat: 'plant', name: 'Leafy Fern', price: 50, emoji: '🪴' },
  { id: 'plant-cactus', cat: 'plant', name: 'Cute Cactus', price: 60, emoji: '🌵' },
  { id: 'plant-flowers', cat: 'plant', name: 'Fresh Flowers', price: 80, emoji: '💐' },
  { id: 'wall-none', cat: 'wall', name: 'Plain Wall', price: 0, emoji: '' },
  { id: 'wall-frames', cat: 'wall', name: 'Photo Frames', price: 70, emoji: '🖼️' },
  { id: 'wall-clock', cat: 'wall', name: 'Vintage Clock', price: 90, emoji: '🕰️' },
  { id: 'wall-lights', cat: 'wall', name: 'Fairy Lights', price: 110, emoji: '✨' },
  { id: 'sign-plain', cat: 'sign', name: 'Wooden Sign', price: 0, css: ['#8a5a3a', '#fff'] },
  { id: 'sign-heart', cat: 'sign', name: 'Heart Sign', price: 100, css: ['#ff5f9a', '#fff'] },
  { id: 'sign-neon', cat: 'sign', name: 'Neon Sign', price: 130, css: ['#2b1650', '#2de2e6'] },
  { id: 'cup-white', cat: 'cup', name: 'White Cups', price: 0, css: ['#ffffff', '#d8cfc4'] },
  { id: 'cup-pink', cat: 'cup', name: 'Pink Cups', price: 60, css: ['#ffc3dc', '#ff8cb8'] },
  { id: 'cup-star', cat: 'cup', name: 'Starry Cups', price: 90, css: ['#ffe9a3', '#ffc94d'] },
];
export const SHOP_CATS = [
  { id: 'theme', name: 'Theme', icon: '🎨' }, { id: 'table', name: 'Tables', icon: '🪑' }, { id: 'counter', name: 'Counter', icon: '🧁' },
  { id: 'plant', name: 'Plants', icon: '🪴' }, { id: 'wall', name: 'Wall', icon: '🖼️' }, { id: 'sign', name: 'Sign', icon: '🪧' }, { id: 'cup', name: 'Cups', icon: '☕' },
];
export const shopItem = (id) => SHOP.find((s) => s.id === id) || null;
export const DEFAULT_OWNED = SHOP.filter((s) => s.price === 0).map((s) => s.id);
export const DEFAULT_EQUIPPED = { theme: 'theme-cream', table: 'table-wood', counter: 'counter-classic', plant: 'plant-none', wall: 'wall-none', sign: 'sign-plain', cup: 'cup-white' };
