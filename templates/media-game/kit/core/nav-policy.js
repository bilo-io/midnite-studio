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
