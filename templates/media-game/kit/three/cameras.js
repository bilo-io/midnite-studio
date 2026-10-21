// @ts-check
/**
 * Midnite game kit — camera rigs for three.js games.
 *
 * - **first person**: mouse-look under pointer lock, head bob, a 60–100° FOV
 * - **third person**: the five named presets from `kit/core/cameras.js`, cycled
 *   by the `camera-next` action, each on a spring arm that ray-casts from the
 *   head pivot and pulls in before it would clip a wall, then eases back out
 * - **lock-on**: the third-person yaw turns to keep a target in front
 * - **versus**: the fighter's side-on camera, outside the cycle
 *
 * The rig only positions the camera; the loop renders with it.
 */

import * as THREE from 'three';

import {
  CAMERA_IDS,
  FIRST_PERSON,
  THIRD_PERSON_FOV,
  cameraArm,
  chooseLockTarget,
  clampFirstPersonFov,
  headBob,
  nextCamera,
  relaxArm,
  springArmDistance,
  versusCamera,
} from '../core/cameras.js';

const MAX_PITCH = 1.2;
const MIN_PITCH = -0.9;

/**
 * @typedef {'first-person' | 'third-person' | 'versus'} RigMode
 * @typedef {import('../core/cameras.js').CameraId} CameraId
 */

/**
 * @param {{
 *   camera?: THREE.PerspectiveCamera,
 *   physics?: import('./physics.js').Physics,
 *   exclude?: import('@dimforge/rapier3d-compat').Collider,
 *   mode?: RigMode,
 *   preset?: CameraId,
 *   allowed?: readonly string[],
 *   fov?: number,
 *   sensitivity?: number,
 *   canvas?: HTMLCanvasElement,
 * }} [options] `allowed` is the manifest's `cameraPresets`; `fov` the first-person setting
 */
export function createCameraRig(options = {}) {
  const camera = options.camera ?? new THREE.PerspectiveCamera(THIRD_PERSON_FOV, 16 / 9, 0.05, 2000);
  camera.rotation.order = 'YXZ';
  let mode = options.mode ?? 'third-person';
  /** @type {CameraId} */
  let preset = options.preset ?? 'behind';
  let firstPersonFov = clampFirstPersonFov(options.fov ?? FIRST_PERSON.fov);
  const sensitivity = options.sensitivity ?? 0.0025;
  let yaw = 0;
  let pitch = 0.15;
  let arm = cameraArm(preset, yaw, pitch).length;
  let bobTime = 0;
  /** @type {{ position: readonly number[] } | null} */
  let lockTarget = null;

  const applyFov = () => {
    const fov = mode === 'first-person' ? firstPersonFov : THIRD_PERSON_FOV;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  };
  applyFov();

  if (options.canvas) {
    const canvas = options.canvas;
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
  }

  return {
    camera,
    get mode() {
      return mode;
    },
    get preset() {
      return preset;
    },
    get yaw() {
      return yaw;
    },
    set yaw(value) {
      yaw = value;
    },
    get pitch() {
      return pitch;
    },
    get lockTarget() {
      return lockTarget;
    },
    /** The current arm length (shorter than the preset's while something is in the way). */
    get armLength() {
      return arm;
    },
    /** @param {RigMode} next */
    setMode(next) {
      mode = next;
      applyFov();
    },
    /** @param {CameraId} id */
    setPreset(id) {
      if (!CAMERA_IDS.includes(id)) return;
      preset = id;
      // A new preset starts at its own length; the spring arm pulls it in if blocked.
      arm = cameraArm(preset, yaw, pitch).length;
    },
    /** The `camera-next` action: the next preset in the (manifest-limited) cycle. */
    cycle() {
      if (mode !== 'third-person') return preset;
      this.setPreset(nextCamera(preset, options.allowed ?? []));
      return preset;
    },
    /** First-person FOV setting, clamped to 60–100°. */
    setFov(/** @type {number} */ fov) {
      firstPersonFov = clampFirstPersonFov(fov);
      applyFov();
    },
    /**
     * Toggle lock-on: pick the best target in front of the player, or release.
     * @template {{ position: readonly number[] }} T
     * @param {readonly number[]} player
     * @param {readonly T[]} candidates
     */
    toggleLock(player, candidates) {
      if (lockTarget) {
        lockTarget = null;
        return null;
      }
      const forward = [-Math.sin(yaw), 0, -Math.cos(yaw)];
      lockTarget = chooseLockTarget(player, forward, candidates);
      return lockTarget;
    },
    clearLock() {
      lockTarget = null;
    },
    /**
     * Position the camera for this frame.
     * @param {number} dt seconds since the last frame
     * @param {{
     *   pivot: readonly number[],
     *   look?: { x: number, y: number },
     *   speed?: number,
     *   opponent?: readonly number[],
     * }} frame `pivot` is the head; `opponent` the other fighter (versus)
     */
    update(dt, frame) {
      const [px = 0, py = 0, pz = 0] = frame.pivot;
      if (frame.look) {
        yaw -= frame.look.x * sensitivity;
        pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch + frame.look.y * sensitivity));
      }
      applyFov();

      if (mode === 'versus' && frame.opponent) {
        const shot = versusCamera(frame.pivot, frame.opponent);
        camera.position.set(...shot.position);
        camera.lookAt(...shot.target);
        return;
      }

      if (mode === 'first-person') {
        bobTime += dt;
        camera.position.set(px, py + headBob(bobTime, frame.speed ?? 0), pz);
        camera.rotation.set(-pitch, yaw, 0);
        return;
      }

      if (lockTarget) {
        const dx = (lockTarget.position[0] ?? 0) - px;
        const dz = (lockTarget.position[2] ?? 0) - pz;
        const target = Math.atan2(-dx, -dz);
        const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
        yaw += delta * Math.min(1, 8 * dt);
      }

      const { direction, length } = cameraArm(preset, yaw, pitch);
      const hit = options.physics ? options.physics.castRay(frame.pivot, direction, length, options.exclude) : null;
      arm = relaxArm(arm, springArmDistance(length, hit), dt);
      camera.position.set(px + direction[0] * arm, py + direction[1] * arm, pz + direction[2] * arm);
      camera.rotation.set(-pitch, yaw, 0);
    },
  };
}
