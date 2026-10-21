// @ts-check
/**
 * Midnite game kit — a procedural dungeon of connected rooms (engine-free).
 *
 * `generateDungeon(seed, rooms)` scatters non-overlapping rectangular rooms,
 * then joins room i to room i-1 with an L-shaped corridor, so the whole is
 * connected by construction. The same seed always gives the same dungeon.
 */

import { createRng } from '../../rng.js';

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Room
 * @typedef {{ width: number, height: number, grid: number[][], rooms: Room[], corridors: { from: number, to: number, cells: { x: number, y: number }[] }[] }} Dungeon
 */

/**
 * @param {number} seed
 * @param {number} [roomCount]
 * @param {{ width?: number, height?: number }} [size]
 * @returns {Dungeon}
 */
export function generateDungeon(seed, roomCount = 12, size = {}) {
  const width = size.width ?? 64;
  const height = size.height ?? 48;
  const rng = createRng(seed);
  /** @type {Room[]} */
  const rooms = [];
  for (let attempt = 0; attempt < 2000 && rooms.length < roomCount; attempt += 1) {
    const w = rng.int(4, 9);
    const h = rng.int(4, 8);
    const room = { x: rng.int(1, width - w - 2), y: rng.int(1, height - h - 2), w, h };
    const clear = rooms.every((o) => room.x > o.x + o.w + 1 || o.x > room.x + room.w + 1 || room.y > o.y + o.h + 1 || o.y > room.y + room.h + 1);
    if (clear) rooms.push(room);
  }
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => 1));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) /** @type {number[]} */ (grid[y])[x] = 0;
  const centre = (/** @type {Room} */ r) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  const corridors = [];
  for (let i = 1; i < rooms.length; i += 1) {
    const a = centre(/** @type {Room} */ (rooms[i - 1]));
    const b = centre(/** @type {Room} */ (rooms[i]));
    /** @type {{ x: number, y: number }[]} */
    const cells = [];
    const horizontalFirst = rng.next() < 0.5;
    const carve = (/** @type {number} */ x, /** @type {number} */ y) => {
      /** @type {number[]} */ (grid[y])[x] = 0;
      cells.push({ x, y });
    };
    const hRun = (/** @type {number} */ y) => {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) carve(x, y);
    };
    const vRun = (/** @type {number} */ x) => {
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) carve(x, y);
    };
    if (horizontalFirst) { hRun(a.y); vRun(b.x); } else { vRun(a.x); hRun(b.y); }
    corridors.push({ from: i - 1, to: i, cells });
  }
  return { width, height, grid, rooms, corridors };
}

/**
 * Cells reachable from `from` over floor (4-neighbour) — the connectivity check.
 * @param {readonly (readonly number[])[]} grid
 * @param {{ x: number, y: number }} from
 */
export function reachable(grid, from) {
  const seen = new Set([`${from.x},${from.y}`]);
  const stack = [from];
  while (stack.length > 0) {
    const c = /** @type {{ x: number, y: number }} */ (stack.pop());
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + (dx ?? 0);
      const y = c.y + (dy ?? 0);
      if (grid[y]?.[x] === 0 && !seen.has(`${x},${y}`)) {
        seen.add(`${x},${y}`);
        stack.push({ x, y });
      }
    }
  }
  return seen;
}
