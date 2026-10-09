// @ts-check
/**
 * Midnite game kit — navigation meshes (recast-navigation).
 *
 * Load this module only when a game needs AI pathing — `needsNav(genre)` in
 * `kit/core/nav-policy.js` says when — and always dynamically:
 *
 *   if (needsNav(manifest.genre)) {
 *     const { createNavMesh } = await import('kit/three/nav.js');
 *     nav = await createNavMesh(walkableMeshes);
 *   }
 *
 * so games without enemies never download recast's WebAssembly.
 */

// The vendored bundle re-exports `@recast-navigation/three` beside the core.
import { NavMeshQuery, init, threeToSoloNavMesh } from 'recast-navigation';

/** Agent-sized defaults (metres): a 1.8 m tall, 0.35 m radius humanoid. */
export const NAV_DEFAULTS = {
  cs: 0.25,
  ch: 0.2,
  walkableSlopeAngle: 45,
  walkableHeight: 9, // cells: 1.8 m / ch
  walkableClimb: 2, // cells: 0.4 m
  walkableRadius: 2, // cells: ~0.5 m
};

let ready = /** @type {Promise<void> | null} */ (null);

/**
 * Build a navmesh from the meshes agents may walk on (ground, floors, ramps —
 * tag them and pass them in; walls and props are obstacles only if passed).
 * @param {import('three').Mesh[]} meshes
 * @param {Partial<typeof NAV_DEFAULTS>} [config]
 */
export async function createNavMesh(meshes, config = {}) {
  ready ??= init();
  await ready;
  const result = threeToSoloNavMesh(meshes, { ...NAV_DEFAULTS, ...config });
  if (!result.success || !result.navMesh) throw new Error('Could not build a navmesh from these meshes.');
  const navMesh = result.navMesh;
  const query = new NavMeshQuery(navMesh);
  /** @param {readonly number[]} p */
  const vec = (p) => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 });

  return {
    navMesh,
    query,
    /**
     * A path of `[x, y, z]` waypoints from `from` to `to`, or `[]` when there is none.
     * @param {readonly number[]} from
     * @param {readonly number[]} to
     * @returns {[number, number, number][]}
     */
    findPath(from, to) {
      const { success, path } = query.computePath(vec(from), vec(to));
      if (!success) return [];
      return path.map((p) => /** @type {[number, number, number]} */ ([p.x, p.y, p.z]));
    },
    /** The nearest point on the navmesh to `point`, or null. */
    closestPoint(/** @type {readonly number[]} */ point) {
      const { success, point: p } = query.findClosestPoint(vec(point));
      return success ? /** @type {[number, number, number]} */ ([p.x, p.y, p.z]) : null;
    },
    dispose() {
      query.destroy();
      navMesh.destroy();
    },
  };
}
