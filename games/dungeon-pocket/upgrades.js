// Dungeon Pocket upgrades. Each has `max` levels; effects are applied in game.js via the build stats.
export const UPGRADES = [
  { id: 'quick', icon: '⚡', name: 'Quick Hands', desc: '+20% attack speed', max: 5 },
  { id: 'vital', icon: '❤️', name: 'Vitality', desc: '+25 max health and heal 25', max: 5 },
  { id: 'fire', icon: '🔥', name: 'Fire Orb', desc: 'Attacks fire an additional projectile', max: 3 },
  { id: 'heavy', icon: '💥', name: 'Heavy Hit', desc: '+25% damage', max: 5 },
  { id: 'boots', icon: '👟', name: 'Swift Boots', desc: '+12% movement speed', max: 4 },
  { id: 'dash', icon: '💨', name: 'Dash Master', desc: 'Dash recharges 25% faster', max: 3 },
  { id: 'pierce', icon: '🏹', name: 'Piercing Shots', desc: 'Projectiles pass through 1 more enemy', max: 3 },
  { id: 'speedy', icon: '🚀', name: 'Fast Bolts', desc: '+30% projectile speed and range', max: 3 },
  { id: 'skin', icon: '🛡️', name: 'Thick Skin', desc: 'Take 15% less damage', max: 4 },
  { id: 'crit', icon: '🎯', name: 'Lucky Strike', desc: '+12% critical chance (double damage)', max: 4 },
  { id: 'leech', icon: '🩸', name: 'Vampiric', desc: 'Heal 2 health for every enemy defeated', max: 3 },
  { id: 'bounce', icon: '🔄', name: 'Ricochet', desc: 'Projectiles bounce off walls once', max: 2 },
  { id: 'shock', icon: '🌀', name: 'Shock Dash', desc: 'Dashing damages nearby enemies', max: 3 },
  { id: 'regen', icon: '✨', name: 'Regeneration', desc: 'Recover 1 health every 3 seconds', max: 3 },
];
export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);

/** Derived stats from upgrade levels. */
export function stats(lv) {
  const L = (id) => lv[id] || 0;
  return {
    maxHp: 100 + 25 * L('vital'),
    fireDelay: 0.4 / (1 + 0.2 * L('quick')),
    shots: 1 + L('fire'),
    dmg: 10 * (1 + 0.25 * L('heavy')),
    speed: 235 * (1 + 0.12 * L('boots')),
    dashCd: 1.15 * Math.pow(0.75, L('dash')),
    pierce: L('pierce'),
    shotSpeed: 520 * (1 + 0.3 * L('speedy')),
    range: 0.9 * (1 + 0.3 * L('speedy')),
    dr: Math.pow(0.85, L('skin')),
    crit: 0.05 + 0.12 * L('crit'),
    leech: 2 * L('leech'),
    bounce: L('bounce'),
    shock: L('shock'),
    regen: L('regen'),
  };
}

/** Pick `n` distinct upgrades the player has not maxed out. */
export function offer(lv, n = 3, rnd = Math.random) {
  const pool = UPGRADES.filter((u) => (lv[u.id] || 0) < u.max);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
