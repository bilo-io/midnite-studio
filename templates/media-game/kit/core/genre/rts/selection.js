// @ts-check
/**
 * Midnite game kit — RTS selection maths (engine-free): box and click select,
 * control groups.
 */

/** @typedef {{ id: number, x: number, y: number, radius?: number, team?: string }} Unit */

/**
 * Units whose centre is inside the rectangle (corners in any order).
 * @param {readonly Unit[]} units
 * @param {{ x1: number, y1: number, x2: number, y2: number }} rect
 * @param {string} [team] when given, only that team's units
 */
export function selectInBox(units, rect, team) {
  const left = Math.min(rect.x1, rect.x2);
  const right = Math.max(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const bottom = Math.max(rect.y1, rect.y2);
  return units
    .filter((u) => (team === undefined || u.team === team) && u.x >= left && u.x <= right && u.y >= top && u.y <= bottom)
    .map((u) => u.id);
}

/**
 * The unit under a point (nearest centre within its radius), or `null`.
 * @param {readonly Unit[]} units
 * @param {{ x: number, y: number }} point
 * @param {string} [team]
 */
export function selectAt(units, point, team) {
  let best = null;
  let bestDistance = Infinity;
  for (const u of units) {
    if (team !== undefined && u.team !== team) continue;
    const d = Math.hypot(u.x - point.x, u.y - point.y);
    if (d <= (u.radius ?? 0.5) && d < bestDistance) {
      best = u.id;
      bestDistance = d;
    }
  }
  return best;
}

/** Ten control groups, 0-9. */
export function createControlGroups() {
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  return {
    /** Bind the current selection to a group (an empty selection clears it). */
    set(/** @type {number} */ n, /** @type {readonly number[]} */ ids) {
      if (ids.length === 0) groups.delete(n);
      else groups.set(n, [...ids]);
    },
    /** Recall a group, dropping ids that no longer exist. */
    recall(/** @type {number} */ n, /** @type {(id: number) => boolean} */ alive = () => true) {
      return (groups.get(n) ?? []).filter(alive);
    },
    snapshot: () => Object.fromEntries([...groups.entries()].map(([k, v]) => [k, [...v]])),
  };
}
