// Shared colour palette + helpers for the styling games.
export const PALETTE = [
  { id: 'pink', name: 'Pink', hex: '#ff8ad8', hue: 320 },
  { id: 'red', name: 'Red', hex: '#ff3c5a', hue: 352 },
  { id: 'orange', name: 'Orange', hex: '#ff9a3d', hue: 30 },
  { id: 'yellow', name: 'Yellow', hex: '#ffe14d', hue: 52 },
  { id: 'green', name: 'Green', hex: '#4fd98a', hue: 145 },
  { id: 'teal', name: 'Teal', hex: '#2de2e6', hue: 182 },
  { id: 'blue', name: 'Blue', hex: '#4d7bff', hue: 225 },
  { id: 'purple', name: 'Purple', hex: '#a870ff', hue: 270 },
  { id: 'white', name: 'White', hex: '#f6f2ff', hue: null },
  { id: 'black', name: 'Black', hex: '#2a2a38', hue: null },
  { id: 'gold', name: 'Gold', hex: '#e8b84a', hue: null },
  { id: 'silver', name: 'Silver', hex: '#c5ccd9', hue: null },
];
export const colorById = (id) => PALETTE.find((c) => c.id === id) || PALETTE[0];
export const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Darken a #rrggbb colour by factor k (0..1). */
export function shade(hex, k = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
export function tint(hex, k = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const m = (v) => Math.round(v + (255 - v) * k);
  const r = m((n >> 16) & 255), g = m((n >> 8) & 255), b = m(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
