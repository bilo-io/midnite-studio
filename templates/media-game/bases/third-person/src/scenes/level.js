// @ts-check
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

const MODE = 'third-person';

/** A shadow-casting box. `material` is any three material; the textured presets come from `createMaterials`. */
const box = (size, material, position) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
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
  scene.fog = new THREE.Fog(0x0b0d12, 30, 75);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a2f3a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  scene.add(sun);

  // Fidelity kit: textures, normal and bump maps are generated in code (no image files). Cached per preset.
  const materials = createMaterials();
  const physics = await initPhysics();
  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('stone', { repeat: repeatFor(80, 80, 4), tint: 0xb4bdd0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The arena: three brick crates and a metal ramp, all static colliders.
  for (const [x, z] of [[-5, -6], [0, -10], [5, -6]]) {
    scene.add(box([2, 2, 2], materials.get('brick', { repeat: [1, 1] }), [x, 1, z]));
    physics.addBox([x, 1, z], [1, 1, 1]);
  }
  const ramp = box([4, 0.3, 6], materials.get('metal', { repeat: [2, 3] }), [9, 0.6, 2]);
  ramp.rotation.x = -0.2;
  scene.add(ramp);
  physics.addMesh(ramp);

  // The interactable: a wooden door that opens on `interact` when the player is close.
  const door = box([2, 3, 0.3], materials.get('wood', { repeat: [1, 1.5] }), [0, 1.5, -3]);
  scene.add(door);
  const doorCollider = physics.addBox([0, 1.5, -3], [1, 1.5, 0.15]);
  let doorOpen = false;

  // One obstacle-enemy: a red cube that patrols side to side. Touching it hurts.
  const enemy = box([1, 1, 1], new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5 }), [-3, 0.5, 4]);
  scene.add(enemy);

  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  // A stand-in body until a Models asset supplies one: a capsule with a visor showing which way it faces.
  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  scene.add(avatar);
  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  const hud = createHud({ hint: 'WASD move · SPACE jump · E interact' + (MODE === 'third-person' ? ' · C camera' : '') });
  hud.crosshair(MODE === 'first-person');
  const genre = installGenre(scene, { physics, character, rig, hud, input });

  const renderer = createRenderer(canvas);
  // Juice kit: settings (on by default, `?juice=off` or `__midnite.juice.off()` to silence), sound, post-processing, effects.
  const settings = createJuiceSettings({ gameName: 'third-person' });
  const audio = createAudio(rig.camera);
  const postfx = createPostFx({ renderer, scene, camera: rig.camera, settings });
  const juice = createJuice({ scene, camera: rig.camera, renderer, settings, sfx: audio.sfx, postfx });
  const applyVolume = () => audio.sfx.setVolume(settings.resolved().volume);
  applyVolume();
  settings.subscribe(applyVolume);
  extendHook('fx', { trigger: (name) => juice.trigger(name, { object: avatar, position: [character.position[0], character.position[1] + 1.2, character.position[2] - 2] }), state: () => juice.state() });

  let wasGrounded = true;
  let airtime = 0;
  let stride = 0;
  let hurtCooldown = 0;

  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    renderFrame: (dt) => postfx.render(dt),
    onResize: (w, h) => postfx.setSize(w, h),
    render: () => juice.applyCamera(),
    update(realDt, frame) {
      // Effects first: this undoes last frame's camera shake and returns dt scaled by hit-stop.
      const dt = juice.update(realDt);
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      if (dt === 0) return; // frozen in a hit-stop
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
      const feet = () => [character.position[0], character.position[1] + 0.05, character.position[2]];
      if (wish.jump && character.grounded) juice.trigger('jump', { object: avatar, position: feet() });
      // A genre may reshape the step's movement (a dodge roll, rooted attacks, facing a lock-on target).
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
        audio.sfx.play('door', { position: [0, 1.5, -3] });
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
      doorOpen,
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
      juice: juice.state(),
      ...genre.state(),
    }),
  });
}
