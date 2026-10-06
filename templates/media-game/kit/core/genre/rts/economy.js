// @ts-check
/**
 * Midnite game kit — RTS economy (engine-free): gathering, a build queue and
 * unit production, all advanced by `tickEconomy(state, dt)`.
 */

/** @type {Readonly<Record<string, { cost: number, buildMs: number, supply: number }>>} */
export const UNIT_TYPES = {
  worker: { cost: 50, buildMs: 4000, supply: 1 },
  soldier: { cost: 100, buildMs: 6000, supply: 2 },
};

export const GATHER_PER_TRIP = 8;

export function createEconomy(start = {}) {
  return { minerals: 200, supplyCap: 10, supplyUsed: 0, queue: /** @type {{ type: string, left: number }[]} */ ([]), produced: /** @type {string[]} */ ([]), ...start };
}

/** @typedef {ReturnType<typeof createEconomy>} Economy */

/** A worker returned a load. */
export function deposit(/** @type {Economy} */ eco, amount = GATHER_PER_TRIP) {
  eco.minerals += amount;
  return eco.minerals;
}

/**
 * Queue a unit: refused (with the reason) when it is unaffordable or over supply.
 * Cost is paid when queued, as in StarCraft.
 * @param {Economy} eco
 * @param {string} type
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function queueUnit(eco, type) {
  const def = UNIT_TYPES[type];
  if (!def) return { ok: false, reason: `Unknown unit ${type}.` };
  if (eco.minerals < def.cost) return { ok: false, reason: 'Not enough minerals.' };
  const pending = eco.queue.reduce((n, q) => n + (UNIT_TYPES[q.type]?.supply ?? 0), 0);
  if (eco.supplyUsed + pending + def.supply > eco.supplyCap) return { ok: false, reason: 'Supply capped.' };
  eco.minerals -= def.cost;
  eco.queue.push({ type, left: def.buildMs });
  return { ok: true };
}

/**
 * Advance the head of the queue by `dt` ms. Returns the unit types finished this tick.
 * @param {Economy} eco
 * @param {number} dt
 */
export function tickEconomy(eco, dt) {
  /** @type {string[]} */
  const done = [];
  const head = eco.queue[0];
  if (!head) return done;
  head.left -= dt;
  if (head.left <= 0) {
    eco.queue.shift();
    eco.supplyUsed += UNIT_TYPES[head.type]?.supply ?? 0;
    eco.produced.push(head.type);
    done.push(head.type);
  }
  return done;
}
