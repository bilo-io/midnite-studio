// @ts-check
/**
 * The soulslike's ruined courtyard. It replaces the third-person base's arena so the genre
 * gets the fidelity stack (`../genre/fx.js`) before it installs: the bonfire's light, the
 * death curtain and the weight of every hit all run through the same juice object that
 * drives the camera and the post-processing.
 *
 * Cold moonlight, thick fog and dark normal-mapped stone and brick: broken pillars,
 * a wooden gate and a fallen slab, so the only warm thing on the screen is the bonfire.
 * The movement, camera and lock-on are the base's, unchanged.
 */
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createEnvironment } from 'kit/three/environment.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { repeatFor } from 'kit/three/materials.js';
import { initPhysics } from 'kit/three/physics.js';

import config from '../game.config.js';
import { createFx } from '../genre/fx.js';
import { installGenre } from '../genre/index.js';

const MODE = 'third-person';

const box = (size, material, position) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

export async function startLevel() {
  const scene = new THREE.Scene();

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const renderer = createRenderer(canvas);
  // Moonlit: the kit's night sky (stars, cold sun as the moon) with the courtyard's thick fog (kit/three/environment.js).
  const env = createEnvironment({ scene, renderer, preset: 'night', fog: [14, 60], shadowSize: 26 });
  const input = createInput(THREE_BINDINGS);
  const physics = await initPhysics();
  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  // A low exposure keeps the courtyard dark; the bloom threshold is low enough that only the fire and the sword glow.
  const fx = createFx({ gameName: 'soulslike', scene, camera: rig.camera, renderer, bloom: { strength: 0.55, radius: 0.7, threshold: 0.78 }, exposure: 1.2 });
  const { materials, juice, sfx } = fx;

  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('stone', { repeat: repeatFor(80, 80, 3.5), tint: 0x6f7690, normalScale: 1.5, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Broken pillars where the base had crates: tall brick, a stone cap, static colliders.
  for (const [x, z, h] of [[-5, -6, 4.2], [0, -10, 5.4], [5, -6, 3.4]]) {
    const pillar = box([2, h, 2], materials.get('brick', { repeat: [1, h / 2], tint: 0x8b8397, normalScale: 1.3 }), [x, h / 2, z]);
    const cap = box([2.5, 0.4, 2.5], materials.get('stone', { repeat: [1, 1], tint: 0x7d8296 }), [x, h + 0.2, z]);
    cap.rotation.y = 0.2;
    scene.add(pillar, cap);
    physics.addBox([x, h / 2, z], [1, h / 2, 1]);
  }
  const ramp = box([4, 0.3, 6], materials.get('stone', { repeat: [2, 3], tint: 0x6a6f84 }), [9, 0.6, 2]);
  ramp.rotation.x = -0.2;
  scene.add(ramp);
  physics.addMesh(ramp);

  const door = box([2, 3, 0.3], materials.get('wood', { repeat: [1, 1.5], tint: 0x8c7255 }), [0, 1.5, -3]);
  scene.add(door);
  const doorCollider = physics.addBox([0, 1.5, -3], [1, 1.5, 0.15]);
  let doorOpen = false;

  // Rubble: a scatter of half-buried stone blocks (no collider), so the floor is not a bare plane.
  for (const [x, z, s, r] of [[-9, 2, 0.9, 0.4], [11, -4, 1.2, 1.1], [-12, -14, 1.5, 0.2], [14, 9, 0.8, 0.7], [-2, 14, 0.7, 1.4], [7, -16, 1.3, 0.9]]) {
    const block = box([s, s * 0.7, s], materials.get('stone', { repeat: [1, 1], tint: 0x5f6579 }), [x, s * 0.25, z]);
    block.rotation.set(0.1, r, 0.08);
    scene.add(block);
  }

  const enemy = box([1, 1, 1], materials.get('stone', { repeat: [1, 1], tint: 0x8c3b3f, normalScale: 1.4 }), [-3, 0.5, 4]);
  scene.add(enemy);

  // The player: a cloaked knight stand-in, a capsule with a visor and a sword, until a Models asset replaces it.
  const avatar = new THREE.Group();
  avatar.rotation.order = 'YXZ';
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), materials.get('metal', { repeat: [1, 2], tint: 0x7a8aa6, normalScale: 0.7, metalness: 0.6, roughness: 0.55 }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, emissive: 0xffb36b, emissiveIntensity: 0.6 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  scene.add(avatar);

  const hud = createHud({ hint: '' });
  const genre = installGenre(scene, { physics, character, rig, hud, input, fx, avatar });

  let wasGrounded = true;
  let airtime = 0;
  let stride = 0;
  let hurtCooldown = 0;

  // A low night wind through the ruins; it rides the juice volume and ends with the loop.
  fx.ambience('ambience-wind', { volume: 0.4, pitch: 0.8, power: 0.55 });

  const loop = startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    renderFrame: (dt) => fx.postfx.render(dt),
    onResize: (w, h) => fx.postfx.setSize(w, h),
    render: () => juice.applyCamera(),
    update(realDt, frame) {
      // Effects first: this undoes last frame's camera shake and returns dt scaled by hit-stop and slow motion.
      const dt = juice.update(realDt);
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      if (dt === 0) return; // frozen in a hit-stop
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: true };
      const feet = () => [character.position[0], character.position[1] + 0.05, character.position[2]];
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();
      enemy.position.x = -3 + Math.sin(frame / 60) * 3;

      if (character.grounded && !wasGrounded && airtime > 0.18) juice.trigger('land', { object: avatar, position: feet(), strength: Math.min(1.4, airtime) });
      airtime = character.grounded ? 0 : airtime + dt;
      wasGrounded = character.grounded;
      if (character.grounded && character.speed > 0.5) {
        stride += character.speed * dt;
        if (stride > 1.8) {
          stride = 0;
          juice.trigger('footstep');
        }
      }

      const [px, , pz] = character.position;
      hurtCooldown = Math.max(0, hurtCooldown - dt);
      if (hurtCooldown === 0 && Math.hypot(px - enemy.position.x, pz - enemy.position.z) < 1.1) {
        hurtCooldown = 1;
        juice.trigger('hurt', { object: avatar, position: [px, 1, pz], text: -1, textKind: 'crit' });
        juice.flash(enemy);
      }
      if (input.justPressed('interact') && Math.hypot(px - 0, pz + 3) < 3) {
        doorOpen = !doorOpen;
        door.position.y = doorOpen ? 4.5 : 1.5;
        doorCollider.setTranslation({ x: 0, y: doorOpen ? 4.5 : 1.5, z: -3 });
        sfx.play('door', { position: [0, 1.5, -3] });
      }
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      env.follow(character.position);
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      doorOpen,
      camera: rig.preset,
      juice: juice.state(),
      ...genre.state(),
    }),
  });
  // Shutdown ends the wind bed and releases the sky along with the loop.
  const stopLoop = loop.stop;
  loop.stop = () => {
    fx.shutdown();
    env.dispose();
    stopLoop();
  };
}
