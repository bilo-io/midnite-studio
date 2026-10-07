// @ts-check
/**
 * A fighter drawn from primitives, posed by state. A Models asset with
 * Phase 103 clips replaces this through `kit/three/animator.js` (idle, walk,
 * attack, hit, die) once the asset bridge brings one in.
 */
import * as THREE from 'three';

/**
 * @param {number} color the gi
 * @param {number} belt
 */
export function createFighterModel(color, belt) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const gi = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.6 });
  const beltMat = new THREE.MeshStandardMaterial({ color: belt });

  const part = (/** @type {THREE.BufferGeometry} */ g, /** @type {THREE.Material} */ m, /** @type {[number, number, number]} */ at) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...at);
    mesh.castShadow = true;
    return mesh;
  };
  const torso = part(new THREE.BoxGeometry(0.5, 0.65, 0.28), gi, [0, 1.2, 0]);
  const waist = part(new THREE.BoxGeometry(0.52, 0.1, 0.3), beltMat, [0, 0.86, 0]);
  const head = part(new THREE.SphereGeometry(0.15, 14, 10), skin, [0, 1.68, 0]);
  body.add(torso, waist, head);

  /** A limb hangs from a pivot so it can swing. */
  const limb = (/** @type {[number, number, number]} */ at, /** @type {number} */ length, /** @type {number} */ width, /** @type {THREE.Material} */ m) => {
    const pivot = new THREE.Group();
    pivot.position.set(...at);
    pivot.add(part(new THREE.BoxGeometry(width, length, width), m, [0, -length / 2, 0]));
    body.add(pivot);
    return pivot;
  };
  const armL = limb([-0.32, 1.48, 0], 0.62, 0.12, skin);
  const armR = limb([0.32, 1.48, 0], 0.62, 0.12, skin);
  const legL = limb([-0.13, 0.84, 0], 0.84, 0.16, gi);
  const legR = limb([0.13, 0.84, 0], 0.84, 0.16, gi);
  const material = /** @type {THREE.MeshStandardMaterial[]} */ ([gi, skin]);

  return {
    root,
    /**
     * Pose for this step. `facing` is the yaw to the opponent; `attack` names
     * the limb that strikes and how far through its active frames the move is.
     * @param {{
     *   position: readonly number[], y: number, facing: number, walk: number, crouching: boolean,
     *   guarding: boolean, stunned: boolean, airborne: boolean, down: boolean,
     *   attack: { limb: 'punch-l' | 'punch-r' | 'kick-l' | 'kick-r', extend: number, level: string } | null,
     *   flash: boolean,
     * }} s
     */
    pose(s) {
      root.position.set(s.position[0] ?? 0, s.y, s.position[2] ?? 0);
      // The model is built facing +z; `facing` is `atan2(fx, fz)` of the direction to the opponent.
      root.rotation.set(0, s.facing, 0);
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      body.scale.set(1, 1, 1);
      for (const p of [armL, armR, legL, legR]) p.rotation.set(0, 0, 0);
      const swing = Math.sin(s.walk * 10) * 0.5;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -0.9;
      armR.rotation.x = -0.6;
      armL.rotation.z = 0.2;
      armR.rotation.z = -0.2;
      if (s.guarding) {
        armL.rotation.x = armR.rotation.x = -2.2;
      }
      if (s.crouching) {
        body.scale.y = 0.65;
        legL.rotation.x = -0.6;
        legR.rotation.x = 0.4;
      }
      if (s.attack) {
        const e = Math.max(0, Math.min(1, s.attack.extend));
        const height = s.attack.level === 'low' ? -0.4 : s.attack.level === 'high' ? 0.1 : -0.2;
        if (s.attack.limb === 'punch-l') armL.rotation.x = -Math.PI / 2 - height - e * 0.2;
        if (s.attack.limb === 'punch-r') armR.rotation.x = -Math.PI / 2 - height - (s.attack.level === 'mid' ? e * 0.9 : e * 0.2);
        if (s.attack.limb === 'kick-l') legL.rotation.x = -(0.4 + e * (s.attack.level === 'low' ? 0.6 : 1.2));
        if (s.attack.limb === 'kick-r') legR.rotation.x = -(0.4 + e * (s.attack.level === 'low' ? 0.6 : 1.3));
      }
      if (s.stunned) body.rotation.x = -0.25;
      if (s.airborne) body.rotation.x = -0.9;
      if (s.down) {
        body.rotation.x = -Math.PI / 2;
        body.position.y = 0.2;
      }
      for (const m of material) m.emissive.setHex(s.flash ? 0x553322 : 0x000000);
    },
  };
}
