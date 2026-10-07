// @ts-check
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
import { installGenre } from '../genre/index.js';

const MODE = 'first-person';

const box = (size, color, position) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

/** Animation state the character is in; a Models asset's clips (`kit/three/animator.js`) key off the same names. */
const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

export async function startLevel() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a2f3a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  scene.add(sun);

  const physics = await initPhysics();
  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x2d3748 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The arena: three boxes and a ramp, all static colliders.
  for (const [x, z] of [[-5, -6], [0, -10], [5, -6]]) {
    scene.add(box([2, 2, 2], 0x4a5568, [x, 1, z]));
    physics.addBox([x, 1, z], [1, 1, 1]);
  }
  const ramp = box([4, 0.3, 6], 0x8b8b5a, [9, 0.6, 2]);
  ramp.rotation.x = -0.2;
  scene.add(ramp);
  physics.addMesh(ramp);

  // The interactable: a door that opens on `interact` when the player is close.
  const door = box([2, 3, 0.3], 0xa07040, [0, 1.5, -3]);
  scene.add(door);
  const doorCollider = physics.addBox([0, 1.5, -3], [1, 1.5, 0.15]);
  let doorOpen = false;

  // One obstacle-enemy: a red cube that patrols side to side.
  const enemy = box([1, 1, 1], 0xe5484d, [-3, 0.5, 4]);
  scene.add(enemy);

  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  const hud = createHud({ hint: 'WASD move · SPACE jump · E interact' + (MODE === 'third-person' ? ' · C camera' : '') });
  hud.crosshair(MODE === 'first-person');
  const genre = installGenre(scene, { physics, character, rig, hud, input });

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
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
      // A genre may reshape the step's movement (a dodge roll, rooted attacks, facing a lock-on target).
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();
      enemy.position.x = -3 + Math.sin(frame / 60) * 3;

      const [px, , pz] = character.position;
      if (input.justPressed('interact') && Math.hypot(px - 0, pz + 3) < 3) {
        doorOpen = !doorOpen;
        door.position.y = doorOpen ? 4.5 : 1.5;
        doorCollider.setTranslation({ x: 0, y: doorOpen ? 4.5 : 1.5, z: -3 });
      }
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      doorOpen,
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
      ...genre.state(),
    }),
  });
}
