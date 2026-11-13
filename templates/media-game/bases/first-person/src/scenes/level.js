// @ts-check
import * as THREE from 'three';

import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { extendHook } from 'kit/core/hook.js';
import { currentLevel, fetchLevel } from 'kit/core/level.js';
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
import { buildLevel3d } from 'kit/three/level.js';
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
  const metal = materials.get('metal', { repeat: [1, 0.4], tint: 0xd0d4dc, normalScale: 0.6, roughness: 0.45 });
  const grip = materials.get('wood', { repeat: [0.3, 0.6] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.3, 12), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.34);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.09), grip);
  handle.position.set(0, -0.13, 0.12);
  handle.rotation.x = 0.25;
  group.add(body, barrel, handle);
  group.position.set(0.22, -0.25, -0.55);
  group.scale.setScalar(0.85);
  // The muzzle flash: an additive star on the barrel tip with a short-lived light.
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (glow.getContext('2d'));
  const ramp = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  ramp.addColorStop(0, 'rgba(255,255,255,1)');
  ramp.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  ramp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ramp;
  g.fillRect(0, 0, 64, 64);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glow), color: 0xffd58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.get('tiles', { repeat: repeatFor(80, 80, 3), tint: 0xd9d6cf, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The layout (walls, crates, ramp, door, enemy and spawn) is `levels/level.tmj`; the materials and the door's moving collider are here.
  const levelName = currentLevel('level');
  const level = await buildLevel3d({ scene, physics }, await fetchLevel(levelName));
  const named = (/** @type {string} */ name) => level.entities.filter((p) => p.entity.name === name);
  /** Re-skin the meshes the builder made for `name`: it draws a plain box, the scene owns the look. */
  const skin = (/** @type {string} */ name, /** @type {(size: number[]) => THREE.Material} */ material) => {
    for (const part of named(name)) if (part.object instanceof THREE.Mesh) part.object.material = material(part.world.size);
  };
  skin('wall', ([w, , d]) => materials.get('brick', { repeat: [Math.max(w ?? 1, d ?? 1) / 3, 1.3] }));
  skin('crate', () => materials.get('wood', { repeat: [1, 1], tint: 0xc9a77c }));
  skin('ramp', () => materials.get('metal', { repeat: [2, 3] }));
  for (const ramp of named('ramp')) if (ramp.object instanceof THREE.Mesh) physics.addMesh(ramp.object);
  // Stone pillars to look past.
  skin('pillar', () => materials.get('stone', { repeat: [1, 3.5] }));

  // The interactable: a door that opens on `interact` when the player is close.
  skin('door', () => materials.get('wood', { repeat: [1, 1.5] }));
  const doorPart = named('door')[0];
  const door = /** @type {THREE.Object3D | null} */ (doorPart?.object ?? null);
  const doorClosed = door ? door.position.clone() : new THREE.Vector3();
  const doorCollider = doorPart ? physics.addBox([doorClosed.x, doorClosed.y, doorClosed.z], doorPart.world.size.map((v) => v / 2)) : null;
  let doorOpen = false;

  // One enemy: a red cube that patrols side to side. Shoot it: it has a few hits, then bursts.
  const enemyHome = named('enemy')[0]?.world.position ?? [-3, 0.5, 4];
  const enemy = box([1, 1, 1], new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5 }), [enemyHome[0], enemyHome[1] ?? 0.5, enemyHome[2]]);
  scene.add(enemy);
  let enemyHealth = ENEMY_HEALTH;
  let respawn = 0;

  const spawn = level.spawns[0]?.position ?? [0, 0.1, 6];
  const character = createCharacter(physics, { position: spawn });
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
      enemy.position.x = enemyHome[0] + Math.sin(frame / 60) * 3;
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
      if (door && doorCollider && input.justPressed('interact') && Math.hypot(px - doorClosed.x, pz - doorClosed.z) < 3) {
        doorOpen = !doorOpen;
        door.position.y = doorClosed.y + (doorOpen ? 3 : 0);
        doorCollider.setTranslation({ x: doorClosed.x, y: door.position.y, z: doorClosed.z });
        audio.sfx.play('door', { position: [doorClosed.x, doorClosed.y, doorClosed.z] });
      }
      rig.update(dt, { pivot: character.head(), look, speed: character.speed });
      env.follow(character.position);
      genre.update(dt, frame);
      hud.set('state', animationState(character));
    },
    state: () => ({
      player: { position: character.position.map((v) => Number(v.toFixed(3))) },
      animation: animationState(character),
      level: levelName,
      doorOpen,
      camera: 'first-person',
      weapon: { ammo, reloading: reloading > 0, shots },
      enemy: { health: enemyHealth },
      juice: juice.state(),
      ...genre.state(),
    }),
  });
}
