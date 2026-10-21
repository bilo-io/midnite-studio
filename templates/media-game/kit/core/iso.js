// @ts-check
/**
 * Midnite game kit — isometric (2:1 diamond) projection (engine-free).
 *
 * Grid coordinates (x, y) are tile units; screen coordinates are pixels with
 * the origin at the top corner of tile (0, 0).
 */

/**
 * Grid → screen: the top corner of the diamond for tile (x, y).
 * @param {number} x
 * @param {number} y
 * @param {number} tileW diamond width in px
 * @param {number} tileH diamond height in px (usually tileW / 2)
 */
export function isoToScreen(x, y, tileW, tileH) {
  return { x: (x - y) * (tileW / 2), y: (x + y) * (tileH / 2) };
}

/**
 * Screen → grid: the exact inverse of {@link isoToScreen} (fractional tiles).
 * @param {number} px
 * @param {number} py
 * @param {number} tileW
 * @param {number} tileH
 */
export function screenToIso(px, py, tileW, tileH) {
  const a = px / (tileW / 2);
  const b = py / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * The tile under a screen point (what the pointer is over), or `null` off the map.
 * @param {number} px
 * @param {number} py
 * @param {number} tileW
 * @param {number} tileH
 * @param {{ width: number, height: number }} [bounds] map size in tiles
 */
export function pickTile(px, py, tileW, tileH, bounds) {
  const { x, y } = screenToIso(px, py, tileW, tileH);
  const tile = { x: Math.floor(x), y: Math.floor(y) };
  if (bounds && (tile.x < 0 || tile.y < 0 || tile.x >= bounds.width || tile.y >= bounds.height)) return null;
  return tile;
}

/**
 * Draw order: things further down-screen draw later. `z` (height) breaks ties
 * so a character standing on a tile draws after the tile itself.
 * @param {number} x
 * @param {number} y
 * @param {number} [z]
 */
export function isoDepth(x, y, z = 0) {
  return (x + y) * 10 + z;
}
