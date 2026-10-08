// @ts-check
/**
 * The character-action stage. It replaces the third-person base's arena with
 * an empty colosseum floor: the player starts outside the south gate, and
 * the genre module (`../genre/index.js`) builds the ring, seals it when the
 * player walks in, and runs the waves, combos and style meter. Everything
 * else — the character, the five cameras, the loop and the `intent` seam —
 * is the base's, unchanged.
 *
 * It also owns the fidelity stack (`../genre/fx.js`): a normal-mapped tiled floor, a
 * sunset-lit colosseum, bloom for the slash arcs and the sealing walls, and hit-stop and
 * slow motion. The combo timeline runs in frames, so the level hands the genre its own
 * frame counter, which stops during a hit-stop instead of letting a move's active window pass.
 */
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { repeatFor } from 'kit/three/materials.js';
import { initPhysics } from 'kit/three/physics.js';

import config from '../game.config.js';
import { createFx } from '../genre/fx.js';
import { installGenre, PLAYER_SPAWN } from '../genre/index.js';

const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

export async function startLevel() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24131a);
  scene.fog = new THREE.Fog(0x24131a, 34, 80);
  scene.add(new THREE.HemisphereLight(0xffd9c4, 0x3a2430, 1.9));
  const sun = new THREE.DirectionalLight(0xffc89a, 3.0);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
  sun.shadow.camera.right = sun.shadow.camera.top = 20;
  scene.add(sun);

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const renderer = createRenderer(canvas);
  const physics = await initPhysics();
  physics.addGround(90);
  const character = createCharacter(physics, { position: PLAYER_SPAWN });
  const input = createInput(THREE_BINDINGS);
  const rig = createCameraRig({ mode: 'third-person', physics, exclude: character.collider, allowed: config.cameras, canvas });
  // Bloom lifts the slash arcs, the sealing walls and the afterimages; a warm exposure suits the dusk.
  const fx = createFx({ gameName: 'character-action', scene, camera: rig.camera, renderer, bloom: { strength: 0.5, radius: 0.65, threshold: 0.8 }, exposure: 1.1 });
  const { juice } = fx;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), fx.materials.get('stone', { repeat: repeatFor(90, 90, 4), tint: 0x9a8678, normalScale: 1.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The player: a crimson stand-in with a visor, until a Models asset replaces it. YXZ so a lean (x) follows the yaw (y).
  const avatar = new THREE.Group();
  avatar.rotation.order = 'YXZ';
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), fx.materials.get('metal', { repeat: [1, 2], tint: 0xe0505a, normalScale: 0.6, metalness: 0.45, roughness: 0.55 }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x5ab0ff, emissiveIntensity: 0.9 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  scene.add(avatar);

  const hud = createHud({ hint: 'WASD move · SPACE jump · C camera' });
  const genre = installGenre(scene, { physics, character, rig, hud, input, avatar, fx });

  let simFrame = 0;
  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    renderFrame: (dt) => fx.postfx.render(dt),
    onResize: (w, h) => fx.postfx.setSize(w, h),
    render: () => juice.applyCamera(),
    update(realDt) {
      // Effects first: undoes last frame's shake and returns dt scaled by hit-stop and slow motion.
      const dt = juice.update(realDt);
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      if (dt === 0) return; // frozen in a hit-stop: the combo's frame counter freezes with it
      simFrame += 1;
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: true };
      character.move(genre.intent ? genre.intent(wish, dt, simFrame) : wish, dt);
      physics.step();
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      genre.update(dt, simFrame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      camera: rig.preset,
      juice: juice.state(),
      ...genre.state(),
    }),
  });
}
