// @ts-check
/**
 * Midnite game kit — A* on a tile grid (engine-free).
 *
 * `grid[y][x]` is 0 for walkable and anything else for blocked. Eight
 * neighbours with the octile heuristic; a diagonal step may not cut a blocked
 * corner. Returns the cells from `from` to `to` inclusive, or `null`.
 */

/** @typedef {{ x: number, y: number }} Cell */

const SQRT2 = Math.SQRT2;
export const NEIGHBOURS = /** @type {const} */ ([
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
]);

/** @param {readonly (readonly number[])[]} grid @param {number} x @param {number} y */
export const walkable = (grid, x, y) => (grid[y]?.[x] ?? 1) === 0;

/** @param {Cell} a @param {Cell} b */
export function octile(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * @param {readonly (readonly number[])[]} grid
 * @param {Cell} from
 * @param {Cell} to
 * @returns {Cell[] | null}
 */
export function astar(grid, from, to) {
  if (!walkable(grid, from.x, from.y) || !walkable(grid, to.x, to.y)) return null;
  const width = grid[0]?.length ?? 0;
  const id = (/** @type {number} */ x, /** @type {number} */ y) => y * width + x;
  /** @type {Map<number, number>} */
  const g = new Map([[id(from.x, from.y), 0]]);
  /** @type {Map<number, number>} */
  const parent = new Map();
  /** @type {{ x: number, y: number, f: number }[]} */
  const open = [{ x: from.x, y: from.y, f: octile(from, to) }];
  const closed = new Set();
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) if ((open[i]?.f ?? 0) < (open[best]?.f ?? 0)) best = i;
    const [current] = open.splice(best, 1);
    if (!current) break;
    const cid = id(current.x, current.y);
    if (closed.has(cid)) continue;
    closed.add(cid);
    if (current.x === to.x && current.y === to.y) {
      /** @type {Cell[]} */
      const path = [];
      let at = cid;
      for (;;) {
        path.push({ x: at % width, y: Math.floor(at / width) });
        const up = parent.get(at);
        if (up === undefined) break;
        at = up;
      }
      return path.reverse();
    }
    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!walkable(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!walkable(grid, current.x + dx, current.y) || !walkable(grid, current.x, current.y + dy))) continue;
      const nid = id(nx, ny);
      if (closed.has(nid)) continue;
      const tentative = (g.get(cid) ?? 0) + cost;
      if (tentative < (g.get(nid) ?? Infinity)) {
        g.set(nid, tentative);
        parent.set(nid, cid);
        open.push({ x: nx, y: ny, f: tentative + octile({ x: nx, y: ny }, to) });
      }
    }
  }
  return null;
}

/** Path length in step costs (diagonals count √2). @param {readonly Cell[]} path */
export function pathCost(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = /** @type {Cell} */ (path[i - 1]);
    const b = /** @type {Cell} */ (path[i]);
    total += a.x !== b.x && a.y !== b.y ? SQRT2 : 1;
  }
  return total;
}
