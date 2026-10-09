// @ts-check
/**
 * Midnite game kit — ARPG loot tables (engine-free).
 *
 * `rollLoot(table, rng)` first picks a rarity by weight, then an item of that
 * rarity. Rarities: common 70 %, magic 22 %, rare 7 %, unique 1 %.
 */

export const RARITIES = /** @type {const} */ (['common', 'magic', 'rare', 'unique']);
export const RARITY_WEIGHTS = { common: 70, magic: 22, rare: 7, unique: 1 };

/**
 * @typedef {{ id: string, name: string, slot: string, rarity?: string, power: number }} ItemDef
 * @typedef {{ id: string, name: string, slot: string, rarity: string, power: number }} Item
 */

/** @type {readonly ItemDef[]} */
export const DEFAULT_TABLE = [
  { id: 'rusty-sword', name: 'Rusty Sword', slot: 'weapon', power: 4 },
  { id: 'cloth-cap', name: 'Cloth Cap', slot: 'head', power: 1 },
  { id: 'leather-vest', name: 'Leather Vest', slot: 'body', power: 2 },
  { id: 'iron-sword', name: 'Iron Sword', slot: 'weapon', power: 7 },
  { id: 'steel-helm', name: 'Steel Helm', slot: 'head', power: 4 },
  { id: 'chain-mail', name: 'Chain Mail', slot: 'body', power: 6 },
];

/** Power multiplier applied on top of the base item. */
export const RARITY_POWER = { common: 1, magic: 1.5, rare: 2.2, unique: 3.5 };

/**
 * @param {() => number} rng a float in [0, 1)
 * @param {Record<string, number>} [weights]
 */
export function rollRarity(rng, weights = RARITY_WEIGHTS) {
  const total = RARITIES.reduce((n, r) => n + (weights[r] ?? 0), 0);
  let roll = rng() * total;
  for (const rarity of RARITIES) {
    roll -= weights[rarity] ?? 0;
    if (roll < 0) return rarity;
  }
  return 'common';
}

/**
 * @param {readonly ItemDef[]} table
 * @param {() => number} rng
 * @returns {Item}
 */
export function rollLoot(table, rng) {
  const rarity = rollRarity(rng);
  const pool = table.filter((d) => d.rarity === undefined || d.rarity === rarity);
  const def = /** @type {ItemDef} */ (pool[Math.floor(rng() * pool.length)] ?? table[0]);
  return {
    id: def.id,
    name: rarity === 'common' ? def.name : `${rarity[0]?.toUpperCase()}${rarity.slice(1)} ${def.name}`,
    slot: def.slot,
    rarity,
    power: Math.round(def.power * (/** @type {Record<string, number>} */ (RARITY_POWER)[rarity] ?? 1)),
  };
}
