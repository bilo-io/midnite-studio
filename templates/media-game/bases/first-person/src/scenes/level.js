// @ts-check
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { extendHook } from 'kit/core/hook.js';
import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createAudio } from 'kit/three/audio.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createEnvironment } from 'kit/three/environment.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createJuice } from 'kit/three/juice.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { createMaterials, repeatFor } from 'kit/three/materials.js';
import { initPhysics } from 'kit/three/physics.js';
import { createPostFx } from 'kit/three/postfx.js';

import config from '../game.config.js';
import { installGenre } from '../genre/index.js';

const MODE = 'first-person';
const MAGAZINE = 12;
const FIRE_INTERVAL = 0.22;
const RELOAD_TIME = 1.1;
const ENEMY_HEALTH = 3;

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

/**
 * The gun the player holds: a group parented to the camera, plus a muzzle flash. Procedural, no model files.
 * `kick` is recoil (0..1) that springs back; `bob` is driven by walking speed.
 */
function createViewmodel(materials) {
  const group = new THREE.Group();
  const metal = materials.get('metal', { repeat: [1, 0.4], tint: 0x9aa4b5, normalScale: 0.6 });
  const grip = materials.get('wood', { repeat: [0.3, 0.6] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.3, 12), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.34);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.09), grip);
  handle.position.set(0, -0.13, 0.12);
  handle.rotation.x = 0.25;
  group.add(body, barrel, handle);
  group.position.set(0.24, -0.23, -0.5);
  // The muzzle flash: an additive star on the barrel tip with a short-lived light.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  flash.position.set(0, 0.03, -0.52);
  const light = new THREE.PointLight(0xffb060, 0, 6, 2);
  light.position.copy(flash.position);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(flash.position);
  group.add(flash, light, muzzle);
  group.traverse((o) => {
    o.frustumCulled = false;
    if (o instanceof THREE.Mesh && o !== flash) o.castShadow = false;
  });
  return { group, flash, light, muzzle, kick: 0, bobTime: 0, flashLife: 0 };
}

export async function startLevel() {
  const scene = new THREE.Scene();
  // A procedural sky, hemisphere and sun with soft shadows, fog and a baked reflection map (kit/three/environment.js).
  const renderer = createRenderer(/** @type {HTMLCanvasElement} */ (document.getElementById('game')));
  const env = createEnvironment({ scene, renderer, preset: 'day', fog: [30, 85] });

  // Fidelity kit: textures, normal and bump maps are generated in code (no image files). Cached per preset.
  const materials = createMaterials({ renderer });
  const physics = await initPhysics();
  physics.addGround(80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('tiles', { repeat: repeatFor(80, 80, 3), tint: 0xaab4c6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Perimeter walls: normal-mapped brick, solid colliders.
  for (const [size, pos] of /** @type {[number[], number[]][]} */ ([
    [[80, 4, 1], [0, 2, -40]], [[80, 4, 1], [0, 2, 40]], [[1, 4, 80], [-40, 2, 0]], [[1, 4, 80], [40, 2, 0]],
  ])) {
    const wall = box(size, materials.get('brick', { repeat: [Math.max(size[0] ?? 1, size[2] ?? 1) / 3, 1.3] }), pos);
    scene.add(wall);
    physics.addBox(pos, [(size[0] ?? 1) / 2, (size[1] ?? 1) / 2, (size[2] ?? 1) / 2]);
  }

  // The arena: three crates and a ramp, all static colliders.
  for (const [x, z] of [[-5, -6], [0, -10], [5, -6]]) {
    scene.add(box([2, 2, 2], materials.get('wood', { repeat: [1, 1], tint: 0xc9a77c }), [x, 1, z]));
    physics.addBox([x, 1, z], [1, 1, 1]);
  }
  const ramp = box([4, 0.3, 6], materials.get('metal', { repeat: [2, 3] }), [9, 0.6, 2]);
  ramp.rotation.x = -0.2;
  scene.add(ramp);
  physics.addMesh(ramp);
  // Stone pillars to look past.
  for (const [x, z] of [[-12, -4], [12, -12], [-8, -20]]) scene.add(box([1.4, 5, 1.4], materials.get('stone', { repeat: [1, 3.5] }), [x, 2.5, z]));

  // The interactable: a door that opens on `interact` when the player is close.
  const door = box([2, 3, 0.3], materials.get('wood', { repeat: [1, 1.5] }), [0, 1.5, -3]);
  scene.add(door);
  const doorCollider = physics.addBox([0, 1.5, -3], [1, 1.5, 0.15]);
  let doorOpen = false;

  // One enemy: a red cube that patrols side to side. Shoot it: it has a few hits, then bursts.
  const enemy = box([1, 1, 1], new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5 }), [-3, 0.5, 4]);
  scene.add(enemy);
  let enemyHealth = ENEMY_HEALTH;
  let respawn = 0;

  const character = createCharacter(physics, { position: [0, 0.1, 6] });
  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (renderer.domElement);
  const rig = createCameraRig({ mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas });
  const hud = createHud({ hint: 'WASD move · SPACE jump · CLICK/J shoot · R reload · E interact' });
  hud.crosshair(true);
  const genre = installGenre(scene, { physics, character, rig, hud, input });

  // The viewmodel lives on the camera, so the camera has to be in the scene to draw it.
  const gun = createViewmodel(materials);
  rig.camera.add(gun.group);
  scene.add(rig.camera);

  // Juice kit: settings (on by default, `?juice=off` or `__midnite.juice.off()` to silence), sound, post-processing, effects.
  const settings = createJuiceSettings({ gameName: 'first-person' });
  const audio = createAudio(rig.camera);
  const postfx = createPostFx({ renderer, scene, camera: rig.camera, settings });
  const juice = createJuice({ scene, camera: rig.camera, renderer, settings, sfx: audio.sfx, postfx });
  const applyVolume = () => audio.sfx.setVolume(settings.resolved().volume);
  applyVolume();
  settings.subscribe(applyVolume);
  extendHook('fx', { trigger: (name) => juice.trigger(name, { position: [character.position[0], character.position[1] + 1.2, character.position[2] - 2] }), state: () => juice.state() });

  let wasGrounded = true;
  let airtime = 0;
  let stride = 0;
  let ammo = MAGAZINE;
  let cooldown = 0;
  let reloading = 0;
  let shots = 0;
  const forward = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();
  const toEnemy = new THREE.Vector3();

  const setAmmoHud = () => hud.set('ammo', reloading > 0 ? 'reloading' : `${ammo}/${MAGAZINE}`);
  setAmmoHud();

  /** One hitscan shot: recoil, muzzle flash, then a ray against the world and the enemy. */
  const shoot = () => {
    ammo -= 1;
    shots += 1;
    cooldown = FIRE_INTERVAL;
    gun.kick = Math.min(1, gun.kick + 0.8);
    gun.flashLife = 0.05;
    rig.camera.updateWorldMatrix(true, true);
    gun.muzzle.getWorldPosition(muzzlePos);
    rig.camera.getWorldDirection(forward);
    juice.trigger('gunshot-pistol', { position: [muzzlePos.x, muzzlePos.y, muzzlePos.z], dir: [forward.x, forward.y, forward.z] });
    origin.copy(rig.camera.position);
    const wall = physics.castRay([origin.x, origin.y, origin.z], [forward.x, forward.y, forward.z], 60, character.collider);
    const wallDist = wall ?? 60;
    // Ray against the enemy's bounding sphere (radius 0.7): good enough for a base to build on.
    toEnemy.copy(enemy.position).sub(origin);
    const along = toEnemy.dot(forward);
    const miss = toEnemy.addScaledVector(forward, -along).length();
    if (enemyHealth > 0 && along > 0 && along < wallDist && miss < 0.7) {
      enemyHealth -= 1;
      const at = [enemy.position.x, enemy.position.y + 0.6, enemy.position.z];
      if (enemyHealth > 0) juice.trigger('hit', { object: enemy, position: at, text: 1 });
      else {
        juice.trigger('explosion', { position: at, strength: 0.7 });
        enemy.visible = false;
        respawn = 3;
      }
    } else if (wall !== null) {
      const hit = origin.addScaledVector(forward, wallDist);
      juice.burst('debris', [hit.x, hit.y, hit.z], { dir: [-forward.x, -forward.y, -forward.z], scale: 0.5 });
    }
    setAmmoHud();
  };

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
      if (dt === 0) return; // frozen in a hit-stop
      const look = input.takeLook();
      const direction = moveRelativeToYaw(input.move(), rig.yaw);
      const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: false };
      const feet = () => [character.position[0], character.position[1] + 0.05, character.position[2]];
      if (wish.jump && character.grounded) juice.trigger('jump', { position: feet() });
      // A genre may reshape the step's movement (a dodge roll, rooted attacks, facing a lock-on target).
      character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      physics.step();
      enemy.position.x = -3 + Math.sin(frame / 60) * 3;
      if (respawn > 0) {
        respawn -= dt;
        if (respawn <= 0) {
          enemyHealth = ENEMY_HEALTH;
          enemy.visible = true;
        }
      }

      if (character.grounded && !wasGrounded && airtime > 0.18) juice.trigger('land', { position: feet(), strength: Math.min(1.4, airtime) });
      airtime = character.grounded ? 0 : airtime + dt;
      wasGrounded = character.grounded;
      if (character.grounded && character.speed > 0.5) {
        stride += character.speed * dt;
        if (stride > 1.8) {
          stride = 0;
          juice.trigger('footstep');
        }
      }

      // Weapon: fire, reload, empty click.
      cooldown = Math.max(0, cooldown - dt);
      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) {
          ammo = MAGAZINE;
          setAmmoHud();
        }
      } else if (input.justPressed('reload') && ammo < MAGAZINE) {
        reloading = RELOAD_TIME;
        juice.trigger('reload');
        setAmmoHud();
      } else if (input.isDown('attack') && cooldown === 0) {
        if (ammo > 0) shoot();
        else {
          cooldown = FIRE_INTERVAL;
          juice.trigger('empty-click');
        }
      }

      // Viewmodel: bob with walking speed, kick back and up on a shot, dip while reloading.
      gun.bobTime += dt * (2 + character.speed * 1.6);
      gun.kick = Math.max(0, gun.kick - dt * 7);
      const walking = character.grounded ? Math.min(1, character.speed / 6) : 0;
      const dip = reloading > 0 ? Math.sin(Math.min(1, 1 - reloading / RELOAD_TIME) * Math.PI) * 0.14 : 0;
      gun.group.position.set(
        0.24 + Math.sin(gun.bobTime) * 0.012 * walking,
        -0.23 - Math.abs(Math.cos(gun.bobTime)) * 0.014 * walking - dip,
        -0.5 + gun.kick * 0.07,
      );
      gun.group.rotation.set(gun.kick * 0.16 + dip * 1.2, 0, Math.sin(gun.bobTime * 0.5) * 0.01 * walking);
      gun.flashLife = Math.max(0, gun.flashLife - dt);
      const lit = gun.flashLife > 0 && settings.resolved().enabled ? 1 : 0;
      /** @type {THREE.MeshBasicMaterial} */ (gun.flash.material).opacity = lit;
      gun.flash.rotation.z = frame * 1.7;
      gun.light.intensity = lit * 14;

      const [px, , pz] = character.position;
      if (input.justPressed('interact') && Math.hypot(px - 0, pz + 3) < 3) {
        doorOpen = !doorOpen;
        door.position.y = doorOpen ? 4.5 : 1.5;
        doorCollider.setTranslation({ x: 0, y: doorOpen ? 4.5 : 1.5, z: -3 });
        audio.sfx.play('door', { position: [0, 1.5, -3] });
      }
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      env.follow(character.position);
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      doorOpen,
      camera: 'first-person',
      weapon: { ammo, reloading: reloading > 0, shots },
      enemy: { health: enemyHealth },
      juice: juice.state(),
      ...genre.state(),
    }),
  });
}
