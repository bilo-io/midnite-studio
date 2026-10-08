// @ts-check
/**
 * The RPG's stage. It replaces the base's arena with a village on a cobbled square and
 * grass, wires the fidelity and juice kit (normal-mapped materials, sound, particles,
 * floating numbers, a gentle bloom and vignette) and hands the genre module the pieces
 * it needs to make spells, level-ups, loot and quests feel good. Third or first person,
 * from `game.config.js`.
 */
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { extendHook } from 'kit/core/hook.js';
import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createAudio } from 'kit/three/audio.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createJuice } from 'kit/three/juice.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { createMaterials, repeatFor } from 'kit/three/materials.js';
import { initPhysics } from 'kit/three/physics.js';
import { createPostFx } from 'kit/three/postfx.js';

import config from '../game.config.js';
import { installGenre } from '../genre/index.js';

const MODE = config.perspective === 'first-person' ? 'first-person' : 'third-person';

const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

export async function startLevel() {
  const scene = new THREE.Scene();
  // A late-afternoon village: warm sun, a hazy amber sky.
  scene.background = new THREE.Color(0x3a3350);
  scene.fog = new THREE.Fog(0x3a3350, 26, 70);
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3228, 1.0));
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.0);
  sun.position.set(-8, 12, 6);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
  sun.shadow.camera.right = sun.shadow.camera.top = 40;
  scene.add(sun);

  const materials = createMaterials();
  const physics = await initPhysics();
  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('grass', { repeat: repeatFor(80, 80, 3), tint: 0xb8c4a0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // The village square: a cobbled disc just above the grass.
  const square = new THREE.Mesh(new THREE.CircleGeometry(9, 40), materials.get('stone', { repeat: repeatFor(18, 18, 2), tint: 0xc9b9a0 }));
  square.rotation.x = -Math.PI / 2;
  square.position.set(0, 0.02, 0);
  square.receiveShadow = true;
  scene.add(square);

  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  avatar.visible = MODE === 'third-person';
  scene.add(avatar);

  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  const hud = createHud({ hint: '' });
  hud.crosshair(MODE === 'first-person');

  const renderer = createRenderer(canvas);
  // Juice kit: on by default; `?juice=off` or `__midnite.juice.off()` silences it. Bloom is a touch warmer
  // and stronger than the default so spell glow and torch flames read.
  const settings = createJuiceSettings({ gameName: 'rpg' });
  const audio = createAudio(rig.camera);
  const postfx = createPostFx({ renderer, scene, camera: rig.camera, settings, bloom: { strength: 0.4, radius: 0.7, threshold: 0.82 }, exposure: 1.05 });
  const juice = createJuice({ scene, camera: rig.camera, renderer, settings, sfx: audio.sfx, postfx });
  const applyVolume = () => audio.sfx.setVolume(settings.resolved().volume);
  applyVolume();
  settings.subscribe(applyVolume);
  extendHook('fx', {
    trigger: (/** @type {string} */ name) => juice.trigger(name, { object: avatar, position: [character.position[0], character.position[1] + 1.2, character.position[2] - 2] }),
    state: () => juice.state(),
  });

  const genre = installGenre(scene, { physics, character, rig, hud, input, juice, sfx: audio.sfx, materials, settings, avatar });

  let wasGrounded = true;
  let airtime = 0;
  let stride = 0;

  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    renderFrame: (dt) => postfx.render(dt),
    onResize: (w, h) => postfx.setSize(w, h),
    render: () => juice.applyCamera(),
    update(realDt, frame) {
      // Effects first: undoes last frame's shake and returns dt scaled by hit-stop.
      const dt = juice.update(realDt);
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      if (dt === 0) return;
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
      const feet = () => [character.position[0], character.position[1] + 0.05, character.position[2]];
      if (wish.jump && character.grounded) juice.trigger('jump', { object: avatar, position: feet() });
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();

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
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
      juice: juice.state(),
      ...genre.state(),
    }),
  });
}
