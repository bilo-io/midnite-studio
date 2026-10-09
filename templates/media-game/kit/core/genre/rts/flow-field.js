// @ts-check
/**
 * Midnite game kit — flow fields for group moves (engine-free).
 *
 * One Dijkstra from the goal gives every walkable cell a cost; each cell's
 * direction then points at its cheapest neighbour. A hundred units share one
 * field instead of running a hundred A* searches.
 */

import { NEIGHBOURS, walkable } from './astar.js';

/**
 * @param {readonly (readonly number[])[]} grid
 * @param {{ x: number, y: number }} goal
 * @returns {{ cost: number[][], dir: ({ x: number, y: number } | null)[][] }}
 */
export function flowField(grid, goal) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const cost = Array.from({ length: height }, () => Array.from({ length: width }, () => Infinity));
  /** @type {{ x: number, y: number, c: number }[]} */
  let frontier = [];
  if (walkable(grid, goal.x, goal.y)) {
    /** @type {number[]} */ (cost[goal.y])[goal.x] = 0;
    frontier = [{ x: goal.x, y: goal.y, c: 0 }];
  }
  while (frontier.length > 0) {
    let best = 0;
    for (let i = 1; i < frontier.length; i += 1) if ((frontier[i]?.c ?? 0) < (frontier[best]?.c ?? 0)) best = i;
    const [cell] = frontier.splice(best, 1);
    if (!cell || cell.c > (cost[cell.y]?.[cell.x] ?? Infinity)) continue;
    for (const [dx, dy, step] of NEIGHBOURS) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (!walkable(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!walkable(grid, cell.x + dx, cell.y) || !walkable(grid, cell.x, cell.y + dy))) continue;
      const next = cell.c + step;
      if (next < (cost[ny]?.[nx] ?? Infinity)) {
        /** @type {number[]} */ (cost[ny])[nx] = next;
        frontier.push({ x: nx, y: ny, c: next });
      }
    }
  }
  const dir = cost.map((row, y) =>
    row.map((here, x) => {
      if (!Number.isFinite(here) || here === 0) return null;
      let best = null;
      let bestCost = here;
      for (const [dx, dy] of NEIGHBOURS) {
        const c = cost[y + dy]?.[x + dx] ?? Infinity;
        if (dx !== 0 && dy !== 0 && (!walkable(grid, x + dx, y) || !walkable(grid, x, y + dy))) continue;
        if (c < bestCost) {
          bestCost = c;
          best = { x: dx, y: dy };
        }
      }
      return best;
    }),
  );
  return { cost, dir };
}
