// Deterministic outfit scoring for Dream Boutique. Pure functions (unit-testable in node).
import { SLOTS, STYLES, itemById } from './data.js';
import { PALETTE, hueDiff } from '../../js/colors.js';

const hueOf = (colorId) => { const c = PALETTE.find((p) => p.id === colorId); return c ? c.hue : null; };
const NEUTRAL = new Set(['white', 'black', 'gold', 'silver']);

/** outfit: { hair: {id,color}, top: {id,color}, bottom: ..., shoes, accessory, bag, jewelry, makeup } */
export function slotItem(outfit, slot) {
  const o = outfit[slot];
  if (!o || !o.id) return null;
  const it = itemById(o.id);
  return it ? { item: it, color: o.color } : null;
}
export const wearingDress = (outfit) => { const t = slotItem(outfit, 'top'); return !!(t && t.item.dress); };

export function themeMatch(outfit, style) {
  const si = STYLES.indexOf(style);
  const dress = wearingDress(outfit);
  let got = 0, total = 0;
  for (const slot of SLOTS) {
    let w = slot.weight;
    if (slot.id === 'top' && dress) w = 5;
    if (slot.id === 'bottom' && dress) continue;
    total += w;
    const e = slotItem(outfit, slot.id);
    if (e) got += w * (e.item.s[si] / 3);
  }
  return Math.round((got / total) * 100);
}

export function avgFormality(outfit) {
  const dress = wearingDress(outfit);
  const parts = [];
  const t = slotItem(outfit, 'top'), b = slotItem(outfit, 'bottom'), s = slotItem(outfit, 'shoes');
  if (t) parts.push(...(dress ? [t.item.f, t.item.f] : [t.item.f]));
  if (b && !dress) parts.push(b.item.f);
  if (s) parts.push(s.item.f);
  return parts.length ? parts.reduce((a, c) => a + c, 0) / parts.length : 0;
}

/** Colour coordination 0-100 from the hue relationships of the clothes. */
export function colorHarmony(outfit) {
  const hues = new Set();
  let neutrals = 0;
  for (const slot of ['top', 'bottom', 'shoes', 'bag', 'accessory']) {
    const e = slotItem(outfit, slot);
    if (!e) continue;
    if (slot === 'bottom' && wearingDress(outfit)) continue;
    if (NEUTRAL.has(e.color)) { neutrals++; continue; }
    hues.add(e.color);
  }
  const list = [...hues].map(hueOf);
  const k = list.length;
  if (k === 0) return neutrals ? 88 : 50;
  if (k === 1) return 100;
  if (k === 2) { const d = hueDiff(list[0], list[1]); return d <= 50 ? 94 : d >= 150 ? 88 : d <= 100 ? 72 : 62; }
  if (k === 3) {
    const ds = [hueDiff(list[0], list[1]), hueDiff(list[1], list[2]), hueDiff(list[0], list[2])];
    if (Math.max(...ds) <= 90) return 84;
    if (Math.min(...ds) >= 90) return 70;
    return 55;
  }
  return 38;
}

export function accessoryCount(outfit) {
  return ['accessory', 'bag', 'jewelry', 'makeup'].filter((s) => slotItem(outfit, s)).length;
}

export function jewelryMatches(outfit) {
  const j = slotItem(outfit, 'jewelry');
  if (!j) return false;
  if (j.color === 'gold' || j.color === 'silver') return true;
  return ['bag', 'shoes', 'accessory'].some((s) => { const e = slotItem(outfit, s); return e && e.color === j.color; });
}

function checkRequirement(outfit, r) {
  switch (r.type) {
    case 'color': return ['top', 'bottom', 'shoes', 'bag', 'accessory', 'jewelry'].some((s) => { const e = slotItem(outfit, s); return e && r.any.includes(e.color) && !(s === 'bottom' && wearingDress(outfit)); });
    case 'slot': return !!slotItem(outfit, r.slot);
    case 'item': return Object.keys(outfit).some((s) => { const e = slotItem(outfit, s); return e && r.any.includes(e.item.id); });
    case 'formal': return avgFormality(outfit) >= r.n;
    case 'dress': return wearingDress(outfit);
    default: return false;
  }
}
function checkBonus(outfit, b) {
  switch (b.type) {
    case 'count': return accessoryCount(outfit) >= b.n;
    case 'jewelryMatch': return jewelryMatches(outfit);
    case 'slot': return !!slotItem(outfit, b.slot);
    case 'item': return Object.keys(outfit).some((s) => { const e = slotItem(outfit, s); return e && b.any.includes(e.item.id); });
    default: return false;
  }
}

const starsOf = (pct) => Math.max(1, Math.min(5, Math.round(pct / 20)));

export function scoreOutfit(outfit, challenge) {
  const theme = themeMatch(outfit, challenge.style);
  const colors = colorHarmony(outfit);
  const reqs = challenge.required.map((r) => ({ label: r.label, ok: checkRequirement(outfit, r) }));
  const reqPct = Math.round((reqs.filter((r) => r.ok).length / reqs.length) * 100);
  const n = accessoryCount(outfit);
  const accPct = Math.min(100, n * 25);
  const bonusOk = checkBonus(outfit, challenge.bonus);
  const missing = ['hair', 'top', 'shoes'].filter((s) => !slotItem(outfit, s)).length + (!wearingDress(outfit) && !slotItem(outfit, 'bottom') ? 1 : 0);
  let weighted = theme * 0.4 + colors * 0.2 + reqPct * 0.2 + accPct * 0.1 + (bonusOk ? 100 : 0) * 0.1;
  weighted *= 1 - missing * 0.15; // an unfinished outfit is penalised
  const score = Math.max(0, Math.round(weighted * 100));
  const allReq = reqs.every((r) => r.ok);
  const win = score >= 6500 && allReq && missing === 0;
  return {
    score, theme, colors, accPct, reqs, bonusOk, bonusLabel: challenge.bonus.label, missing, win, allReq,
    stars: { style: starsOf(theme), colors: starsOf(colors), acc: Math.max(1, Math.min(5, 1 + n)), overall: starsOf(weighted) },
  };
}
