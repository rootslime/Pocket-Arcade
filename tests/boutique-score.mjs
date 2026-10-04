// Sanity tests for the Dream Boutique scoring (deterministic, monotonic, reachable).
import { ITEMS, CHALLENGES } from '../games/dream-boutique/data.js';
import { scoreOutfit } from '../games/dream-boutique/scoring.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const best = (slot, ci, base = true) => ITEMS.filter((i) => i.slot === slot && (!base || i.u === 0)).sort((a, b) => b.s[ci] - a.s[ci])[0];
import { STYLES } from '../games/dream-boutique/data.js';

for (const ch of CHALLENGES) {
  const ci = STYLES.indexOf(ch.style);
  // greedy "expert" outfit using ALL items, best colour = pink/neutral so colours are coherent
  const make = (base) => {
    const o = {};
    for (const slot of ['hair', 'top', 'bottom', 'shoes', 'accessory', 'bag', 'jewelry', 'makeup']) {
      const pool = ITEMS.filter((i) => i.slot === slot && (!base || i.u === 0));
      const bestItem = pool.sort((a, b) => b.s[ci] - a.s[ci] || b.f - a.f)[0];
      o[slot] = { id: bestItem.id, color: ch.required.find((r) => r.type === 'color') ? ch.required.find((r) => r.type === 'color').any[0] : 'pink' };
    }
    return o;
  };
  const r = scoreOutfit(make(false), ch);
  ok(r.theme >= 90, `${ch.title}: full wardrobe can reach theme >= 90 (got ${r.theme})`);
  const rb = scoreOutfit(make(true), ch);
  ok(rb.theme >= 60, `${ch.title}: base wardrobe theme >= 60 (got ${rb.theme}, score ${rb.score})`);
  const empty = scoreOutfit({}, ch);
  ok(empty.score < 1500 && !empty.win, `${ch.title}: empty outfit scores low (${empty.score})`);
  ok(JSON.stringify(scoreOutfit(make(false), ch)) === JSON.stringify(r), `${ch.title}: deterministic`);
}
// monotonic: swapping a poor-style item for a better one never lowers theme
const ch = CHALLENGES.find((c) => c.id === 'redcarpet');
const o1 = { hair: { id: 'long', color: '#000' }, top: { id: 'tee', color: 'white' }, bottom: { id: 'jeans', color: 'blue' }, shoes: { id: 'sneakers', color: 'white' } };
const o2 = { ...o1, shoes: { id: 'heels', color: 'white' } };
ok(scoreOutfit(o2, ch).theme > scoreOutfit(o1, ch).theme, 'better style item raises theme match');
process.exit(fail ? 1 : 0);
