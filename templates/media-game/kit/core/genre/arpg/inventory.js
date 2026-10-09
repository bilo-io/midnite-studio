// @ts-check
/**
 * Midnite game kit — ARPG inventory and equipment (engine-free).
 */

export const SLOTS = /** @type {const} */ (['weapon', 'head', 'body']);

/** @param {number} capacity */
export function createInventory(capacity = 12) {
  return {
    capacity,
    bag: /** @type {import('./loot.js').Item[]} */ ([]),
    equipped: /** @type {Record<string, import('./loot.js').Item | null>} */ (Object.fromEntries(SLOTS.map((s) => [s, null]))),
  };
}

/** @typedef {ReturnType<typeof createInventory>} Inventory */

/** @returns {boolean} false when the bag is full */
export function pickUp(/** @type {Inventory} */ inv, /** @type {import('./loot.js').Item} */ item) {
  if (inv.bag.length >= inv.capacity) return false;
  inv.bag.push(item);
  return true;
}

/** Equip the bag item at `index`; the item it replaces goes back to the bag. */
export function equip(/** @type {Inventory} */ inv, /** @type {number} */ index) {
  const item = inv.bag[index];
  if (!item || !(item.slot in inv.equipped)) return false;
  inv.bag.splice(index, 1);
  const previous = inv.equipped[item.slot];
  inv.equipped[item.slot] = item;
  if (previous) inv.bag.push(previous);
  return true;
}

/** Total power of what is worn. */
export function equippedPower(/** @type {Inventory} */ inv) {
  return Object.values(inv.equipped).reduce((n, item) => n + (item?.power ?? 0), 0);
}
