// @ts-check
/**
 * Midnite game kit — a ray-cast vehicle on Rapier.
 *
 * A dynamic box chassis on Rapier's `DynamicRayCastVehicleController`: four
 * wheels, each a suspension ray with its own spring, damping and friction;
 * the front pair steers, the rear pair drives. Enter and exit with the
 * `interact` action within 2.5 m of the door point (`findEnterable` in
 * `kit/core/vehicle.js`). The car's forward is −z, like the player's.
 */

import * as THREE from 'three';

import { VEHICLE_DEFAULTS } from '../core/three-defaults.js';
import { driveControls, findEnterable, wheelLayout } from '../core/vehicle.js';

/**
 * @param {import('./physics.js').Physics} physics
 * @param {{
 *   position?: readonly number[],
 *   yaw?: number,
 *   tuning?: Partial<typeof VEHICLE_DEFAULTS>,
 *   object?: THREE.Object3D,
 *   color?: THREE.ColorRepresentation,
 * }} [options] `object` replaces the default box body (e.g. a Models-tab car)
 */
export function createVehicle(physics, options = {}) {
  const { RAPIER, world } = physics;
  const t = { ...VEHICLE_DEFAULTS, ...options.tuning };
  const [hx, hy, hz] = /** @type {[number, number, number]} */ (t.chassis.halfExtents);
  const [px = 0, py = 2, pz = 0] = options.position ?? [];
  const yaw = options.yaw ?? 0;

  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, py, pz)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setCanSleep(false),
  );
  const volume = 8 * hx * hy * hz;
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(t.chassis.mass / volume), chassis);

  const controller = world.createVehicleController(chassis);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const wheels = wheelLayout([hx, hy, hz]);
  for (const [x, y, z] of wheels) {
    controller.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, t.wheel.suspensionRest, t.wheel.radius);
  }
  for (let i = 0; i < wheels.length; i += 1) {
    controller.setWheelSuspensionStiffness(i, t.wheel.suspensionStiffness);
    controller.setWheelFrictionSlip(i, t.wheel.frictionSlip);
    controller.setWheelMaxSuspensionTravel(i, t.wheel.maxTravel);
  }

  // --- visuals ------------------------------------------------------------------
  const object = options.object ?? new THREE.Group();
  /** @type {THREE.Object3D[]} */
  const wheelObjects = [];
  if (!options.object) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      new THREE.MeshStandardMaterial({ color: options.color ?? '#d1453b', roughness: 0.4, metalness: 0.2 }),
    );
    body.castShadow = true;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 1.7, hy * 1.4, hz * 0.9),
      new THREE.MeshStandardMaterial({ color: '#1d2433', roughness: 0.2, metalness: 0.5 }),
    );
    cabin.position.set(0, hy * 1.6, hz * 0.1);
    cabin.castShadow = true;
    object.add(body, cabin);
    const wheelGeometry = new THREE.CylinderGeometry(t.wheel.radius, t.wheel.radius, 0.28, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
    for (let i = 0; i < wheels.length; i += 1) {
      const holder = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.castShadow = true;
      holder.add(wheel);
      object.add(holder);
      wheelObjects.push(holder);
    }
  }

  let occupied = false;
  let throttle = 0;
  let steer = 0;
  let handbrake = false;
  /** Door point in chassis space: beside the driver's (left) door. */
  const doorLocal = new THREE.Vector3(-hx - 0.6, 0, -hz * 0.15);

  const vehicle = {
    chassis,
    collider,
    controller,
    object,
    get occupied() {
      return occupied;
    },
    /** Signed forward speed, m/s (positive = driving forwards, along −z). */
    get speed() {
      return -controller.currentVehicleSpeed();
    },
    /** World-space door point, `[x, y, z]`. */
    get door() {
      const p = doorLocal.clone().applyQuaternion(object.quaternion).add(object.position);
      return [p.x, p.y, p.z];
    },
    /** World-space yaw of the chassis (0 = facing −z). */
    get yaw() {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion);
      return Math.atan2(-forward.x, -forward.z);
    },
    /**
     * Drive input for this step; `throttle` and `steer` are −1..1.
     * @param {{ throttle: number, steer: number, handbrake?: boolean }} input
     */
    drive(input) {
      throttle = input.throttle;
      steer = input.steer;
      handbrake = input.handbrake ?? false;
    },
    enter() {
      occupied = true;
    },
    /** Leave the car; returns where the driver stands (the door point). */
    exit() {
      occupied = false;
      throttle = 0;
      steer = 0;
      return vehicle.door;
    },
    /** One fixed step, before `physics.step()`. */
    update(/** @type {number} */ dt) {
      const controls = driveControls(
        occupied ? { throttle, steer, handbrake } : { throttle: 0, steer: 0, handbrake: true },
        vehicle.speed,
        t,
      );
      for (let i = 0; i < 4; i += 1) {
        // Rear-wheel drive; forward is −z, so the force is negated for Rapier's +z axis.
        controller.setWheelEngineForce(i, i >= 2 ? -controls.engineForce : 0);
        controller.setWheelBrake(i, controls.brake);
        controller.setWheelSteering(i, i < 2 ? controls.steering : 0);
      }
      controller.updateVehicle(dt);
    },
    /** Copy the chassis and wheels onto the meshes; call once per frame. */
    render() {
      const at = chassis.translation();
      const r = chassis.rotation();
      object.position.set(at.x, at.y, at.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
      wheelObjects.forEach((holder, i) => {
        const [x = 0, y = 0, z = 0] = wheels[i] ?? [];
        const suspension = controller.wheelSuspensionLength(i) ?? t.wheel.suspensionRest;
        holder.position.set(x, y - suspension, z);
        holder.rotation.set(controller.wheelRotation(i) ?? 0, controller.wheelSteering(i) ?? 0, 0, 'YXZ');
      });
    },
  };
  return vehicle;
}

/**
 * The car the player can get into right now, if any.
 * @template {{ door: readonly number[] }} V
 * @param {readonly number[]} player feet position
 * @param {readonly V[]} vehicles
 */
export const nearestVehicle = (player, vehicles) => findEnterable(player, vehicles);
