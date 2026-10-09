// @ts-check
/**
 * Midnite game kit — the Rapier physics world.
 *
 * `initPhysics()` loads Rapier's WebAssembly (the `-compat` build embeds it, so
 * no separate fetch) and returns a world that steps at the loop's fixed rate,
 * plus helpers for the colliders every starter needs and a ray cast the camera
 * spring arm and the vehicle use.
 */

import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

let ready = /** @type {Promise<void> | null} */ (null);

/**
 * @param {{ gravity?: number, dt?: number }} [options] gravity in m/s², downwards
 */
export async function initPhysics(options = {}) {
  ready ??= RAPIER.init();
  await ready;
  const world = new RAPIER.World({ x: 0, y: -(options.gravity ?? 20), z: 0 });
  world.timestep = options.dt ?? 1 / 60;
  /** @type {{ body: RAPIER.RigidBody, object: import('three').Object3D }[]} */
  const synced = [];

  return {
    RAPIER,
    world,
    /** One fixed step; then dynamic bodies' meshes follow their bodies. */
    step() {
      world.step();
      for (const { body, object } of synced) {
        const t = body.translation();
        const r = body.rotation();
        object.position.set(t.x, t.y, t.z);
        object.quaternion.set(r.x, r.y, r.z, r.w);
      }
    },
    /**
     * Make `object` follow `body` after each step.
     * @param {RAPIER.RigidBody} body
     * @param {import('three').Object3D} object
     */
    sync(body, object) {
      synced.push({ body, object });
    },
    /** A static box, centred at `position`, with `half` extents. */
    addBox(/** @type {readonly number[]} */ position, /** @type {readonly number[]} */ half, rotationY = 0) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0)
          .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) }),
      );
      return world.createCollider(RAPIER.ColliderDesc.cuboid(half[0] ?? 0.5, half[1] ?? 0.5, half[2] ?? 0.5), body);
    },
    /** A flat static ground at `y`, `size` metres across. */
    addGround(size = 200, y = 0) {
      return world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(0, y - 0.5, 0));
    },
    /**
     * A fixed trimesh collider from a mesh's world-space geometry (ramps,
     * stairs, level geometry).
     * @param {import('three').Mesh} mesh
     */
    addMesh(mesh) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const position = geometry.getAttribute('position');
      const vertices = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i += 1) {
        vertices[i * 3] = position.getX(i);
        vertices[i * 3 + 1] = position.getY(i);
        vertices[i * 3 + 2] = position.getZ(i);
      }
      const indices = geometry.index
        ? Uint32Array.from(geometry.index.array)
        : Uint32Array.from({ length: position.count }, (_, i) => i);
      geometry.dispose();
      return world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
    },
    /**
     * The first solid hit along a ray, as a distance, or null.
     * @param {readonly number[]} origin
     * @param {readonly number[]} direction unit vector
     * @param {number} maxDistance
     * @param {RAPIER.Collider} [exclude] usually the player's own collider
     */
    castRay(origin, direction, maxDistance, exclude) {
      const ray = new RAPIER.Ray(
        { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 },
        { x: direction[0] ?? 0, y: direction[1] ?? 0, z: direction[2] ?? 0 },
      );
      const hit = world.castRay(ray, maxDistance, true, undefined, undefined, exclude);
      return hit ? hit.timeOfImpact : null;
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof initPhysics>>} Physics */
