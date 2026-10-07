// @ts-check
/**
 * The open world's stage. It replaces the base's flat arena with a Phase 105
 * terrain pack — streaming LOD chunks, a Rapier heightfield collider, foliage,
 * buildings and the road network — looked up through `assets/index.json`
 * (kind `terrain`), so importing a real terrain through the asset bridge and
 * pointing the entry at it is all it takes to change the world. The starter
 * ships a small fixture pack (`assets/terrain/fixture.terrain/`, a 512 m plus
 * of roads) so it runs before any import.
 *
 * On foot the player is the base's character; `E` beside a car's driver door
 * gets in (Theme F's ray-cast vehicle) and out again. Traffic, pedestrians,
 * the wanted level and police, the day/night cycle, the minimap and the GPS
 * route are the genre module, `../genre/index.js`.
 */
import * as THREE from 'three';

import { loadAssetIndex } from 'kit/core/asset-index.js';
import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { initPhysics } from 'kit/three/physics.js';
import { loadTerrain } from 'kit/three/terrain.js';
import { createVehicle, nearestVehicle } from 'kit/three/vehicle.js';

import config from '../game.config.js';
import { installGenre } from '../genre/index.js';

const MODE = config.perspective === 'first-person' ? 'first-person' : 'third-person';
/** The terrain `assets/index.json` names; the asset bridge can repoint it at an imported pack. */
const TERRAIN = { kind: 'terrain', name: 'world', manifest: 'terrain.manifest.json' };
/** Where the player starts and the cars are parked: `[x, z, yaw]`, beside the south road. */
const PLAYER_START = /** @type {const} */ ([2.2, 31, 0]);
const PARKED = /** @type {const} */ ([[4.5, 26, 0, '#d1453b'], [-4.5, -30, Math.PI, '#3b82f6'], [30, 4.5, Math.PI / 2, '#eab308']]);

const animationState = (character) => {
  if (!character.grounded) return 'jump';
  if (character.speed > 4) return 'run';
  return character.speed > 0.1 ? 'walk' : 'idle';
};

const wrap = (/** @type {number} */ a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function startLevel() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x87b5e0, 120, 420);
  const ambient = new THREE.HemisphereLight(0xdfeeff, 0x3a4030, 1.0);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top = 60;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const physics = await initPhysics();
  const assets = await loadAssetIndex();
  const relative = assets.url(TERRAIN.kind, TERRAIN.name, TERRAIN.manifest);
  if (!relative) throw new Error(`assets/index.json has no ${TERRAIN.kind} named "${TERRAIN.name}".`);
  const terrainUrl = new URL(relative, document.baseURI).href;
  const terrain = await loadTerrain(terrainUrl, { scene, physics });

  const ground = (/** @type {number} */ x, /** @type {number} */ z) => terrain.heightAt(x, z);
  const character = createCharacter(physics, { position: [PLAYER_START[0], ground(PLAYER_START[0], PLAYER_START[1]) + 0.3, PLAYER_START[1]] });
  character.yaw = PLAYER_START[2];

  const avatar = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0x22c55e }));
  torso.position.y = 0.9;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  visor.position.set(0, 1.45, -0.28);
  torso.castShadow = visor.castShadow = true;
  avatar.add(torso, visor);
  avatar.visible = MODE === 'third-person';
  scene.add(avatar);

  const cars = PARKED.map(([x, z, yaw, color]) => {
    const car = createVehicle(physics, { position: [x, ground(x, z) + 1.2, z], yaw, color, tuning: { engineForce: 4500 } });
    scene.add(car.object);
    return car;
  });
  /** @type {ReturnType<typeof createVehicle> | null} */
  let driving = null;
  /** The on-foot camera preset, restored on getting out (a car wants the arm further back). */
  let footPreset = /** @type {string | null} */ (null);

  const input = createInput(THREE_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  // The spring arm ignores whichever body the player is in: the capsule on foot, the chassis when driving.
  const rigOptions = { mode: MODE, physics, exclude: character.collider, allowed: config.cameras, canvas };
  const rig = createCameraRig(rigOptions);
  rig.camera.far = 900;
  const hud = createHud({ hint: '' });
  hud.crosshair(MODE === 'first-person');

  const enter = (/** @type {ReturnType<typeof createVehicle>} */ car) => {
    driving = car;
    car.enter();
    character.setEnabled(false);
    avatar.visible = false;
    rigOptions.exclude = car.collider;
    if (MODE === 'third-person') {
      footPreset = rig.preset;
      rig.setPreset('much-further-behind');
    }
  };
  const exit = () => {
    if (!driving) return;
    const [x = 0, , z = 0] = driving.exit();
    driving = null;
    character.setEnabled(true);
    character.teleport([x, ground(x, z) + 0.3, z]);
    avatar.visible = MODE === 'third-person';
    rigOptions.exclude = character.collider;
    if (footPreset) rig.setPreset(footPreset);
    footPreset = null;
  };

  const genre = installGenre(scene, {
    rig,
    hud,
    input,
    terrain,
    terrainUrl,
    cars,
    lights: { sun, ambient },
    driving: () => driving,
    /** Where the player is, on foot or at the wheel. */
    playerPosition: () => (driving ? [driving.object.position.x, driving.object.position.y, driving.object.position.z] : [...character.position]),
    bust: () => {
      exit();
      character.teleport([PLAYER_START[0], ground(PLAYER_START[0], PLAYER_START[1]) + 0.3, PLAYER_START[1]]);
    },
  });

  const renderer = createRenderer(canvas);
  renderer.shadowMap.enabled = true;
  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    update(dt, frame) {
      input.update();
      if (input.justPressed('camera-next')) rig.cycle();
      const look = input.takeLook();
      const stick = input.move();

      if (input.justPressed('interact')) {
        if (driving) {
          if (Math.abs(driving.speed) < 3) exit();
        } else {
          const car = nearestVehicle(character.position, cars);
          if (car) enter(car);
        }
      }

      if (driving) {
        const throttle = -stick.y;
        // Off the throttle and nearly stopped, the brake holds the car on a slope.
        const hold = Math.abs(throttle) < 0.05 && Math.abs(driving.speed) < 1.5;
        driving.drive({ throttle, steer: -stick.x, handbrake: input.isDown('jump') || hold });
        // Swing the camera round behind the car (the rig only turns on look input).
        const behind = wrap(driving.yaw - rig.yaw) * Math.min(1, dt * 3);
        look.x -= behind / 0.0025;
      } else {
        const direction = moveRelativeToYaw(stick, rig.yaw);
        const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
        character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
      }
      for (const car of cars) car.update(dt);
      physics.step();
      for (const car of cars) car.render();

      const pivot = driving
        ? [driving.object.position.x, driving.object.position.y + (MODE === 'first-person' ? 0.9 : 1.8), driving.object.position.z]
        : character.head();
      rig.update(dt, { pivot, look, speed: driving ? 0 : character.speed });
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      terrain.update(rig.camera.position);
      genre.update(dt, frame);

      const near = driving ? null : nearestVehicle(character.position, cars);
      hud.hint(
        driving
          ? 'W/S throttle · A/D steer · SPACE handbrake · E get out · C camera'
          : `WASD move · SPACE jump · J punch · E ${near ? 'get in' : 'interact'} · C camera`,
      );
      hud.set('state', driving ? `driving ${Math.round(Math.abs(driving.speed) * 3.6)} km/h` : animationState(character));
    },
    state: () => ({
      player: {
        position: (driving ? [driving.object.position.x, driving.object.position.y, driving.object.position.z] : character.position).map((v) =>
          Number(v.toFixed(3)),
        ),
        driving: driving !== null,
      },
      animation: driving ? 'drive' : animationState(character),
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
      ...genre.state(),
    }),
  });
}
