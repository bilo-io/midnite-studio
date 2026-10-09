// @ts-check
/**
 * Midnite game kit — a DDA grid raycaster (engine-free), the core of the
 * 2.5D (Doom-style) preset.
 *
 * The map is rows of cells, `map[y][x]`; `0` is empty and anything else is a
 * wall id (which the preset maps to a texture). Distances are *perpendicular*
 * to the camera plane, so walls drawn from them have no fisheye.
 */

/**
 * @typedef {readonly (readonly number[])[]} RayMap
 * @typedef {{ x: number, y: number }} Vec2
 * @typedef {{
 *   hit: boolean,
 *   distance: number,
 *   side: 0 | 1,
 *   cellX: number,
 *   cellY: number,
 *   cell: number,
 *   wallX: number,
 * }} RayHit
 */

/**
 * Cast one ray with the DDA (digital differential analyser) walk.
 *
 * `side` is 0 when the ray hit a wall face running north–south (it crossed an x
 * grid line) and 1 for an east–west face; `wallX` is where on that face it hit,
 * in [0, 1), for texture mapping.
 *
 * @param {RayMap} map
 * @param {Vec2} pos
 * @param {Vec2} dir need not be normalised; with a camera-plane ray the distance is already perpendicular
 * @param {{ isSolid?: (cell: number, x: number, y: number) => boolean, maxSteps?: number }} [options]
 * @returns {RayHit}
 */
export function castRay(map, pos, dir, options = {}) {
  const isSolid = options.isSolid ?? ((cell) => cell !== 0);
  const maxSteps = options.maxSteps ?? 256;
  let cellX = Math.floor(pos.x);
  let cellY = Math.floor(pos.y);
  const deltaX = dir.x === 0 ? Infinity : Math.abs(1 / dir.x);
  const deltaY = dir.y === 0 ? Infinity : Math.abs(1 / dir.y);
  const stepX = dir.x < 0 ? -1 : 1;
  const stepY = dir.y < 0 ? -1 : 1;
  let sideX = dir.x < 0 ? (pos.x - cellX) * deltaX : (cellX + 1 - pos.x) * deltaX;
  let sideY = dir.y < 0 ? (pos.y - cellY) * deltaY : (cellY + 1 - pos.y) * deltaY;
  /** @type {0 | 1} */
  let side = 0;

  for (let i = 0; i < maxSteps; i += 1) {
    if (sideX < sideY) {
      sideX += deltaX;
      cellX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      cellY += stepY;
      side = 1;
    }
    const row = map[cellY];
    if (row === undefined || cellX < 0 || cellX >= row.length) break;
    const cell = row[cellX] ?? 0;
    if (isSolid(cell, cellX, cellY)) {
      const distance = side === 0 ? sideX - deltaX : sideY - deltaY;
      let wallX = side === 0 ? pos.y + distance * dir.y : pos.x + distance * dir.x;
      wallX -= Math.floor(wallX);
      return { hit: true, distance, side, cellX, cellY, cell, wallX };
    }
  }
  return { hit: false, distance: Infinity, side, cellX, cellY, cell: 0, wallX: 0 };
}

/**
 * One ray per screen column across a field of view — the whole frame's walls.
 *
 * @param {RayMap} map
 * @param {Vec2} pos
 * @param {number} angle facing, radians (0 = +x, π/2 = +y, screen-down)
 * @param {number} fovDeg horizontal field of view
 * @param {number} columns
 * @param {{ isSolid?: (cell: number, x: number, y: number) => boolean, maxSteps?: number }} [options]
 * @returns {RayHit[]}
 */
export function castRays(map, pos, angle, fovDeg, columns, options) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const planeLength = Math.tan((fovDeg * Math.PI) / 360);
  const plane = { x: -dir.y * planeLength, y: dir.x * planeLength };
  /** @type {RayHit[]} */
  const hits = [];
  for (let column = 0; column < columns; column += 1) {
    const cameraX = (2 * column) / columns - 1;
    hits.push(castRay(map, pos, { x: dir.x + plane.x * cameraX, y: dir.y + plane.y * cameraX }, options));
  }
  return hits;
}

/**
 * Where a billboard sprite lands on screen, or `null` when it is behind the
 * camera. `depth` is perpendicular, comparable with a column's wall distance.
 *
 * @param {Vec2} pos camera position
 * @param {number} angle camera facing, radians
 * @param {number} fovDeg
 * @param {Vec2} sprite world position
 * @param {number} screenWidth px
 */
export function projectSprite(pos, angle, fovDeg, sprite, screenWidth) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const planeLength = Math.tan((fovDeg * Math.PI) / 360);
  const plane = { x: -dir.y * planeLength, y: dir.x * planeLength };
  const rel = { x: sprite.x - pos.x, y: sprite.y - pos.y };
  const inv = 1 / (plane.x * dir.y - dir.x * plane.y);
  const tx = inv * (dir.y * rel.x - dir.x * rel.y);
  const depth = inv * (-plane.y * rel.x + plane.x * rel.y);
  if (depth <= 0.0001) return null;
  return { screenX: (screenWidth / 2) * (1 + tx / depth), depth };
}
