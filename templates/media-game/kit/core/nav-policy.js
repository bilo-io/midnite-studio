// @ts-check
/**
 * Midnite game kit — which games load the navmesh (engine-free).
 *
 * `kit/three/nav.js` pulls in recast-navigation's WebAssembly (~1.3 MB), so it
 * is never imported statically: a starter checks `needsNav(genre)` and only
 * then does `await import('kit/three/nav.js')`.
 */

export const NAV_GENRES = /** @type {const} */ (['shooter', 'rpg', 'soulslike', 'open-world']);

/** @param {string | null | undefined} genre the manifest's `genre` */
export const needsNav = (genre) => genre != null && /** @type {readonly string[]} */ (NAV_GENRES).includes(genre);

/**
 * A nav-mesh's triangles as plan polygons: `positions` is the flat `[x, y, z, ...]` vertex list and `indices` the
 * triangle list (as recast's `getNavMeshPositionsAndIndices` returns). Each polygon is three `[x, z]` points in metres
 * (the last joins the first); a degenerate or out-of-range triangle is skipped.
 * @param {readonly number[]} positions
 * @param {readonly number[]} indices
 * @returns {[number, number][][]}
 */
export function trianglesToPolygons(positions, indices) {
  /** @type {[number, number][][]} */
  const polygons = [];
  const count = Math.floor(positions.length / 3);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    if (!tri.every((v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) < count)) continue;
    const polygon = /** @type {[number, number][]} */ (tri.map((v) => [Number(positions[/** @type {number} */ (v) * 3]), Number(positions[/** @type {number} */ (v) * 3 + 2])]));
    if (polygon.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))) polygons.push(polygon);
  }
  return polygons;
}
