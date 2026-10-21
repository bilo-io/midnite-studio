// @ts-check
/**
 * The shooter's arena. It replaces the base level on both perspectives (first and third
 * person) because the genre needs the fidelity stack (`../genre/fx.js`) before it installs:
 * muzzle flashes, impact decals and the hit-stop on a kill all go through the same juice
 * object that drives the camera and the post-processing.
 *
 * The arena is a concrete yard: normal-mapped stone ground, brick and metal crates, a ramp
 * and a wooden door, lit by emissive floodlight pylons that the bloom pass picks up. The
 * movement, camera and collision are the base's, unchanged.
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

const MODE = config.perspective === 'third-person' ? 'third-person' : 'first-person';

/** A shadow-casting box. */
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
  // Dusk over the yard: the kit's sky dome, sun, hemisphere light, fog and reflection map in one call (kit/three/environment.js).
  const env = createEnvironment({ scene, renderer, preset: 'dusk', fog: [26, 70], shadowSize: 34 });
  // Light the arena from behind the camera so its faces read (the default sun sits ahead of it and backlights everything).
  env.setSun(2.3, 0.8);
  // The preset's lights are gentler than this yard's old rig; scale them to keep its brightness (the env's own lights, no extras).
  env.hemi.intensity *= 1.6;
  env.sun.intensity *= 1.6;
  const input = createInput(THREE_BINDINGS);
  const physics = await initPhysics();
  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  // Bloom lifts the muzzle flashes and floodlights; the exposure is a touch low so they read as lights.
  const fx = createFx({ gameName: 'shooter', scene, camera: rig.camera, renderer, bloom: { strength: 0.42, radius: 0.6, threshold: 0.82 }, exposure: 1.05 });
  const { materials, juice, sfx } = fx;

  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('stone', { repeat: repeatFor(80, 80, 4), tint: 0x9aa4b8, normalScale: 1.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The arena: three brick blocks and a metal ramp, all static colliders.
  for (const [x, z] of [[-5, -6], [0, -10], [5, -6]]) {
    scene.add(box([2, 2, 2], materials.get('brick', { repeat: [1, 1], tint: 0xd8c4b4 }), [x, 1, z]));
    physics.addBox([x, 1, z], [1, 1, 1]);
  }
  const ramp = box([4, 0.3, 6], materials.get('metal', { repeat: [2, 3], tint: 0xc4ccd8 }), [9, 0.6, 2]);
  ramp.rotation.x = -0.2;
  scene.add(ramp);
  physics.addMesh(ramp);

  const door = box([2, 3, 0.3], materials.get('wood', { repeat: [1, 1.5] }), [0, 1.5, -3]);
  scene.add(door);
  const doorCollider = physics.addBox([0, 1.5, -3], [1, 1.5, 0.15]);
  let doorOpen = false;

  // Floodlight pylons round the yard: emissive heads (the bloom pass lights them) on metal posts.
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe3ff, emissive: 0x9ec5ff, emissiveIntensity: 2.4 });
  for (const [x, z] of [[-24, -24], [24, -24], [-24, 12], [24, 12]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 10), materials.get('metal', { repeat: [1, 3], tint: 0x8892a6 }));
    post.position.set(x, 4.5, z);
    post.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), lampMaterial);
    head.position.set(x, 9.2, z);
    scene.add(post, head);
  }

  // The patrolling obstacle: a hazard-striped steel crate (procedural metal, a dull amber tint), not a flat red cube.
  const enemy = box([1, 1, 1], materials.get('metal', { repeat: [1, 1], tint: 0xc9a03a, normalScale: 0.9, metalness: 0.6, roughness: 0.45 }), [-3, 0.5, 4]);
  scene.add(enemy);

  /** A stand-in third-person body; first person shows the viewmodel the genre adds instead. */
  const avatar = new THREE.Group();
  if (MODE === 'third-person') {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), materials.get('metal', { repeat: [1, 2], tint: 0x4a7fe0, normalScale: 0.6, metalness: 0.5 }));
    torso.position.y = 0.9;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, emissive: 0x335577, emissiveIntensity: 0.5 }));
    visor.position.set(0, 1.45, -0.28);
    torso.castShadow = visor.castShadow = true;
    avatar.add(torso, visor);
    scene.add(avatar);
  }

  const hud = createHud({ hint: '' });
  hud.crosshair(MODE === 'first-person');
  const genre = installGenre(scene, { physics, character, rig, hud, input, fx, avatar: MODE === 'third-person' ? avatar : null, enemyProbe: enemy });

  let wasGrounded = true;
  let airtime = 0;
  let stride = 0;
  let hurtCooldown = 0;

  // A faint room-tone wind over the yard; it rides the juice volume and ends with the loop.
  fx.ambience('ambience-wind', { volume: 0.35, power: 0.5 });

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
      if (input.justPressed('camera-next') && MODE === 'third-person') rig.cycle();
      if (dt === 0) return; // frozen in a hit-stop
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
      const feet = () => [character.position[0], character.position[1] + 0.05, character.position[2]];
      if (wish.jump && character.grounded) juice.trigger('jump', { ...(MODE === 'third-person' ? { object: avatar } : {}), position: feet() });
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();
      enemy.position.x = -3 + Math.sin(frame / 60) * 3;

      if (character.grounded && !wasGrounded && airtime > 0.18) juice.trigger('land', { ...(MODE === 'third-person' ? { object: avatar } : {}), position: feet(), strength: Math.min(1.4, airtime) });
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
        juice.trigger('hurt', { ...(MODE === 'third-person' ? { object: avatar } : {}), position: [px, 1, pz], text: -1, textKind: 'crit' });
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
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
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
