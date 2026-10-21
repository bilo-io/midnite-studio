// @ts-check
/**
 * Midnite game kit — fog of war (engine-free). Cells are 0 unexplored,
 * 1 explored (remembered) and 2 visible this tick.
 */

export const FOG = /** @type {const} */ ({ hidden: 0, explored: 1, visible: 2 });

/** @param {number} width @param {number} height */
export function createVisibility(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
}

/**
 * Downgrade last tick's visible cells to explored, then light every cell within
 * `radius` tiles of a unit.
 * @param {number[][]} visibility mutated in place
 * @param {readonly { x: number, y: number }[]} units positions in tile units
 * @param {number} radius
 * @returns {number[][]} the same grid
 */
export function fogUpdate(visibility, units, radius) {
  for (const row of visibility) for (let x = 0; x < row.length; x += 1) if (row[x] === 2) row[x] = 1;
  const r = Math.ceil(radius);
  for (const u of units) {
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    for (let y = cy - r; y <= cy + r; y += 1) {
      const row = visibility[y];
      if (!row) continue;
      for (let x = cx - r; x <= cx + r; x += 1) {
        if (x < 0 || x >= row.length) continue;
        if (Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y) <= radius) row[x] = 2;
      }
    }
  }
  return visibility;
}

/** Cells currently visible. @param {readonly (readonly number[])[]} visibility */
export const visibleCount = (visibility) => visibility.reduce((n, row) => n + row.filter((c) => c === 2).length, 0);
