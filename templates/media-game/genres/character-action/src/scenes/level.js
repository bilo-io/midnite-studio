// @ts-check
/**
 * The character-action stage. It replaces the third-person base's arena with
 * an empty colosseum floor: the player starts outside the south gate, and
 * the genre module (`../genre/index.js`) builds the ring, seals it when the
 * player walks in, and runs the waves, combos and style meter. Everything
 * else — the character, the five cameras, the loop and the `intent` seam —
 * is the base's, unchanged.
 */
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { initPhysics } from 'kit/three/physics.js';

import config from '../game.config.js';
import { installGenre, PLAYER_SPAWN } from '../genre/index.js';

const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

export async function startLevel() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x150e12);
  scene.fog = new THREE.Fog(0x150e12, 30, 70);
  scene.add(new THREE.HemisphereLight(0xffd9c4, 0x24161c, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0e0, 1.7);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
  sun.shadow.camera.right = sun.shadow.camera.top = 20;
  scene.add(sun);

  const physics = await initPhysics();
  physics.addGround(90);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x3a2f2a }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const character = createCharacter(physics, { position: PLAYER_SPAWN });
  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0xb91c1c }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  scene.add(avatar);

  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const rig = createCameraRig({ mode: 'third-person', physics, exclude: character.collider, allowed: config.cameras, canvas });
  const hud = createHud({ hint: 'WASD move · SPACE jump · C camera' });
  const genre = installGenre(scene, { physics, character, rig, hud, input, avatar });

  const renderer = createRenderer(canvas);
  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    update(dt, frame) {
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: true };
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      camera: rig.preset,
      ...genre.state(),
    }),
  });
}
