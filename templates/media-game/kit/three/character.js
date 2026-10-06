// @ts-check
/**
 * Midnite game kit — a kinematic character on Rapier.
 *
 * A capsule moved by Rapier's `KinematicCharacterController`: it climbs slopes
 * up to 45°, steps up ledges to 35 cm, snaps down to the ground within 30 cm
 * (so walking down stairs does not become a series of falls) and pushes
 * dynamic bodies. Gravity and jumping are integrated here; `move()` runs once
 * per fixed step, before `physics.step()`.
 */

import { CHARACTER_DEFAULTS, withDefaults } from '../core/three-defaults.js';

/**
 * @param {import('./physics.js').Physics} physics
 * @param {Partial<typeof CHARACTER_DEFAULTS> & { position?: readonly number[] }} [options] `position` is the feet
 */
export function createCharacter(physics, options = {}) {
  const { RAPIER, world } = physics;
  const t = withDefaults(CHARACTER_DEFAULTS, options);
  const centre = t.halfHeight + t.radius;
  const [px = 0, py = 0, pz = 0] = options.position ?? [0, 0, 0];

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, py + centre, pz));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(t.halfHeight, t.radius), body);
  const controller = world.createCharacterController(t.offset);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.setMaxSlopeClimbAngle((t.maxSlopeDeg * Math.PI) / 180);
  controller.setMinSlopeSlideAngle(((t.maxSlopeDeg + 5) * Math.PI) / 180);
  controller.enableAutostep(t.autostep.maxHeight, t.autostep.minWidth, t.autostep.includeDynamic);
  controller.enableSnapToGround(t.snapToGround);
  controller.setApplyImpulsesToDynamicBodies(true);

  let verticalVelocity = 0;
  let grounded = false;
  let speed = 0;
  /** Facing yaw (radians, 0 = −z). */
  let yaw = 0;
  /** @type {[number, number, number]} */
  let previous = [px, py, pz];
  /** @type {[number, number, number]} */
  let current = [px, py, pz];

  return {
    body,
    collider,
    controller,
    tuning: t,
    get grounded() {
      return grounded;
    },
    /** Horizontal speed this step, m/s. */
    get speed() {
      return speed;
    },
    get yaw() {
      return yaw;
    },
    set yaw(value) {
      yaw = value;
    },
    /** Feet position after the last step. */
    get position() {
      return current;
    },
    /** The camera pivot: the feet plus head height. */
    head(alpha = 1) {
      const p = this.interpolated(alpha);
      return /** @type {[number, number, number]} */ ([p[0], p[1] + t.headHeight, p[2]]);
    },
    /** Feet position blended between the last two steps, for smooth rendering. */
    interpolated(alpha = 1) {
      return /** @type {[number, number, number]} */ (current.map((c, i) => (previous[i] ?? c) + (c - (previous[i] ?? c)) * alpha));
    },
    /**
     * One fixed step of movement.
     * @param {{ direction: readonly number[], run?: boolean, jump?: boolean, face?: boolean }} intent
     *   `direction` is `[x, z]` on the ground plane, length 0–1
     * @param {number} dt seconds
     */
    move(intent, dt) {
      const [dx = 0, dz = 0] = intent.direction;
      const wish = (intent.run ? t.runSpeed : t.walkSpeed) * Math.min(1, Math.hypot(dx, dz));
      const len = Math.hypot(dx, dz) || 1;
      verticalVelocity -= t.gravity * dt;
      if (grounded && intent.jump) verticalVelocity = t.jumpVelocity;
      const desired = { x: (dx / len) * wish * dt, y: verticalVelocity * dt, z: (dz / len) * wish * dt };

      controller.computeColliderMovement(collider, desired);
      const moved = controller.computedMovement();
      grounded = controller.computedGrounded();
      if (grounded && verticalVelocity < 0) verticalVelocity = 0;

      const at = body.translation();
      body.setNextKinematicTranslation({ x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z });
      previous = current;
      current = [at.x + moved.x, at.y + moved.y - centre, at.z + moved.z];
      speed = Math.hypot(moved.x, moved.z) / dt;

      if (intent.face !== false && wish > 0) {
        const target = Math.atan2(-dx, -dz);
        let delta = target - yaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        yaw += delta * Math.min(1, t.turnSpeed * dt);
      }
    },
    /** Teleport the feet to `position` (spawns, respawns, leaving a vehicle). */
    teleport(/** @type {readonly number[]} */ position) {
      const [x = 0, y = 0, z = 0] = position;
      body.setTranslation({ x, y: y + centre, z }, true);
      body.setNextKinematicTranslation({ x, y: y + centre, z });
      previous = [x, y, z];
      current = [x, y, z];
      verticalVelocity = 0;
    },
    /** Take the capsule out of the world (entering a vehicle) or put it back. */
    setEnabled(/** @type {boolean} */ on) {
      collider.setEnabled(on);
    },
    dispose() {
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
    },
  };
}
