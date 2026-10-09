// @ts-check
/**
 * Midnite game kit — RPG stats and levelling (engine-free).
 *
 * Four attributes (strength, agility, intellect, vitality); experience fills
 * a curve; every level grants points to spend and a flat bump to health and
 * mana. Derived numbers come from one function so a game cannot drift them.
 */

export const ATTRIBUTES = /** @type {const} */ (['str', 'agi', 'int', 'vit']);
export const MAX_LEVEL = 30;
export const POINTS_PER_LEVEL = 3;

/** Total experience needed to *reach* `level` (level 1 needs 0). */
export const xpForLevel = (/** @type {number} */ level) => (level <= 1 ? 0 : Math.round(100 * (level - 1) ** 1.5));

/** @param {Partial<Record<typeof ATTRIBUTES[number], number>>} [base] */
export function createStats(base = {}) {
  return {
    level: 1,
    xp: 0,
    points: 0,
    attrs: { str: 5, agi: 5, int: 5, vit: 5, ...base },
  };
}

/** @typedef {ReturnType<typeof createStats>} Stats */

/**
 * Add experience; returns how many levels were gained (several at once is fine).
 * @param {Stats} stats
 * @param {number} xp
 */
export function gainXp(stats, xp) {
  stats.xp += Math.max(0, xp);
  let gained = 0;
  while (stats.level < MAX_LEVEL && stats.xp >= xpForLevel(stats.level + 1)) {
    stats.level += 1;
    stats.points += POINTS_PER_LEVEL;
    gained += 1;
  }
  return gained;
}

/** Spend one unspent point on an attribute. @returns {boolean} */
export function spendPoint(/** @type {Stats} */ stats, /** @type {typeof ATTRIBUTES[number]} */ attr) {
  if (stats.points <= 0 || !ATTRIBUTES.includes(attr)) return false;
  stats.points -= 1;
  stats.attrs[attr] += 1;
  return true;
}

/**
 * Health, mana, damage and defence from the attributes, level and gear.
 * @param {Stats} stats
 * @param {number} [gearPower] total power of equipped items (`equippedPower` in the ARPG inventory)
 */
export function derived(stats, gearPower = 0) {
  const { str, agi, int, vit } = stats.attrs;
  return {
    maxHp: 40 + vit * 8 + stats.level * 6,
    maxMana: 20 + int * 6 + stats.level * 3,
    damage: Math.round(4 + str * 1.5 + gearPower),
    defence: Math.round(agi * 0.8 + gearPower * 0.5),
    critChance: Math.min(0.5, 0.02 + agi * 0.005),
  };
}

/** Experience to the next level as a 0..1 fraction (1 at the cap). */
export function levelProgress(/** @type {Stats} */ stats) {
  if (stats.level >= MAX_LEVEL) return 1;
  const from = xpForLevel(stats.level);
  const to = xpForLevel(stats.level + 1);
  return (stats.xp - from) / (to - from);
}
