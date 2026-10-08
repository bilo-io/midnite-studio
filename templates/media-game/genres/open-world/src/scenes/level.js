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
 *
 * Fidelity and juice (kit v0.10.0): the ground wears normal-mapped grass, dirt and rock blended by the
 * pack's land cover, foliage sways in a wind, footsteps sound by surface, the car has an engine whose
 * pitch follows its speed plus skid dust, tyre screech and crash shake, rain showers roll through,
 * the sky is a day-tinted dome, and a gentle bloom and vignette sit over the frame.
 */
import * as THREE from 'three';

import { loadAssetIndex } from 'kit/core/asset-index.js';
import { moveRelativeToYaw } from 'kit/core/cameras.js';
import { hourAt, skyAt } from 'kit/core/genre/open-world/daynight.js';
import { extendHook } from 'kit/core/hook.js';
import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { decodePng16 } from 'kit/core/png16.js';
import { createRng } from 'kit/core/rng.js';
import { resolveTerrainPath } from 'kit/core/terrain-manifest.js';
import { THREE_BINDINGS } from 'kit/core/three-defaults.js';
import { createAudio } from 'kit/three/audio.js';
import { createCameraRig } from 'kit/three/cameras.js';
import { createCharacter } from 'kit/three/character.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createJuice } from 'kit/three/juice.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { initPhysics } from 'kit/three/physics.js';
import { createPostFx } from 'kit/three/postfx.js';
import { loadTerrain } from 'kit/three/terrain.js';
import { createVehicle, nearestVehicle } from 'kit/three/vehicle.js';

import config from '../game.config.js';
import { createSoundBeds } from '../genre/engine-audio.js';
import { applyGroundDetail, findGroundMaterial } from '../genre/ground-material.js';
import { classAt, SURFACES, splatTexture } from '../genre/ground-splat.js';
import { installGenre } from '../genre/index.js';
import { createSkyDome } from '../genre/sky-dome.js';
import { createWeather } from '../genre/weather.js';
import { addFoliageWind } from '../genre/wind.js';

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
/** Seconds in one game day; the genre's clock uses the same, and the sky follows it from here. */
const DAY_SECONDS = 240;

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

  // Land cover under the world: it picks the ground's detail layers and what a footstep sounds like.
  /** @type {{ classes: ArrayLike<number>, size: number, legend: { classes: string[] } } | null} */
  let cover = null;
  const { maps } = terrain.manifest;
  if (maps.landcover && maps.landcoverLegend) {
    try {
      const legend = await (await fetch(resolveTerrainPath(terrainUrl, maps.landcoverLegend))).json();
      const png = await decodePng16(await (await fetch(resolveTerrainPath(terrainUrl, maps.landcover))).arrayBuffer());
      cover = { classes: png.data, size: png.width, legend };
      const material = findGroundMaterial(terrain.group);
      if (material) applyGroundDetail(material, splatTexture(png.data, png.width, legend, 128), 128, terrain.heightfield.worldSize);
    } catch {
      cover = null; // plain drape, default footsteps
    }
  }
  const wind = addFoliageWind(terrain.group);
  const surfaceAt = (/** @type {number} */ x, /** @type {number} */ z) => (cover ? classAt(cover.classes, cover.size, cover.legend, terrain.heightfield.worldSize, x, z) : 'grass');

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

  const renderer = createRenderer(canvas);
  renderer.shadowMap.enabled = true;
  // Juice kit: on by default; `?juice=off` or `__midnite.juice.off()` silences it.
  const settings = createJuiceSettings({ gameName: 'open-world' });
  const audio = createAudio(rig.camera);
  const postfx = createPostFx({ renderer, scene, camera: rig.camera, settings, bloom: { strength: 0.22, radius: 0.5, threshold: 0.92 } });
  const juice = createJuice({ scene, camera: rig.camera, renderer, settings, sfx: audio.sfx, postfx, floorY: ground(PLAYER_START[0], PLAYER_START[1]) });
  const beds = createSoundBeds({ context: audio.sfx.context, rng: createRng(0xb1d) });
  const applyVolume = () => {
    const r = settings.resolved();
    audio.sfx.setVolume(r.volume);
    beds.setVolume(r.enabled ? r.volume : 0);
  };
  applyVolume();
  settings.subscribe(applyVolume);
  const sky = createSkyDome(scene);
  const weather = createWeather(scene, settings);
  const skyColor = new THREE.Color();
  extendHook('fx', {
    trigger: (/** @type {string} */ name) => juice.trigger(name, { object: avatar, position: [character.position[0], character.position[1] + 1.2, character.position[2] - 2] }),
    state: () => ({ ...juice.state(), rain: Number(weather.rain.toFixed(3)), windSwayed: wind.count }),
  });

  const genre = installGenre(scene, {
    juice,
    sfx: audio.sfx,
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

  let seconds = 0;
  let stride = 0;
  let wasGrounded = true;
  let airtime = 0;
  let lastCarSpeed = 0;
  let throttleNow = 0;
  const lastCarAt = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();

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
      seconds += dt;
      const look = input.takeLook();
      const stick = input.move();

      if (input.justPressed('interact')) {
        if (driving) {
          if (Math.abs(driving.speed) < 3) {
            audio.sfx.play('door', { position: [driving.object.position.x, driving.object.position.y, driving.object.position.z] });
            exit();
          }
        } else {
          const car = nearestVehicle(character.position, cars);
          if (car) {
            audio.sfx.play('door', { position: [car.object.position.x, car.object.position.y, car.object.position.z] });
            enter(car);
            lastCarSpeed = 0;
            lastCarAt.copy(car.object.position);
          }
        }
      }

      if (driving) {
        const throttle = -stick.y;
        // Off the throttle and nearly stopped, the brake holds the car on a slope.
        const hold = Math.abs(throttle) < 0.05 && Math.abs(driving.speed) < 1.5;
        throttleNow = throttle;
        driving.drive({ throttle, steer: -stick.x, handbrake: input.isDown('jump') || hold });
        // Swing the camera round behind the car (the rig only turns on look input).
        const behind = wrap(driving.yaw - rig.yaw) * Math.min(1, dt * 3);
        look.x -= behind / 0.0025;
      } else {
        const direction = moveRelativeToYaw(stick, rig.yaw);
        const wish = { direction, run: input.isDown('sprint'), jump: input.justPressed('jump'), face: MODE === 'third-person' };
        const feet = [character.position[0], character.position[1] + 0.05, character.position[2]];
        if (wish.jump && character.grounded) juice.trigger('jump', { object: avatar, position: feet });
        character.move(genre.intent ? genre.intent(wish, dt, frame) : wish, dt);
        if (character.grounded && !wasGrounded && airtime > 0.18) juice.trigger('land', { object: avatar, position: feet, strength: Math.min(1.4, airtime) });
        airtime = character.grounded ? 0 : airtime + dt;
        wasGrounded = character.grounded;
        // Footsteps by surface: pitch and dust come from the land cover under the player.
        if (character.grounded && character.speed > 0.5) {
          stride += character.speed * dt;
          if (stride > (character.speed > 4 ? 1.6 : 1.9)) {
            stride = 0;
            const surface = SURFACES[/** @type {keyof typeof SURFACES} */ (surfaceAt(feet[0] ?? 0, feet[2] ?? 0))] ?? SURFACES.grass;
            audio.sfx.play(surface.sound, { pitch: surface.pitch, power: character.speed > 4 ? 0.9 : 0.6, position: feet });
            if (surface.dust > 0 && character.speed > 3) juice.burst('dust', feet, { scale: 0.4 * surface.dust, count: 3 });
          }
        }
      }
      for (const car of cars) car.update(dt);
      physics.step();
      for (const car of cars) car.render();

      // --- the car: crash shake, skid dust, tyre screech (slip is sideways speed against the way it faces) -----------
      let slip = 0;
      if (driving) {
        const p = driving.object.position;
        velocity.copy(p).sub(lastCarAt).divideScalar(Math.max(1e-3, dt));
        lastCarAt.copy(p);
        forward.set(-Math.sin(driving.yaw), 0, -Math.cos(driving.yaw));
        const lateral = Math.abs(velocity.x * forward.z - velocity.z * forward.x);
        slip = Math.abs(driving.speed) > 4 ? Math.min(1, Math.max(0, lateral - 2.5) / 5) : 0;
        if (slip > 0.15) juice.burst('dust', [p.x - forward.x * 1.6, p.y - 0.2, p.z - forward.z * 1.6], { scale: 0.5 * slip, count: 2, dir: [-forward.x, 0.2, -forward.z] });
        // A sudden loss of speed is a crash.
        const lost = Math.abs(lastCarSpeed) - Math.abs(driving.speed);
        if (lost > 5 && Math.abs(lastCarSpeed) > 8) {
          const hit = Math.min(1.4, lost / 10);
          juice.shake(0.35 + hit * 0.4);
          juice.burst('debris', [p.x + forward.x * 1.8, p.y + 0.3, p.z + forward.z * 1.8], { scale: hit });
          audio.sfx.play('block', { pitch: 0.55, power: 1 + hit * 0.4, position: [p.x, p.y, p.z] });
          postfx.hit(hit * 0.5);
        }
        lastCarSpeed = driving.speed;
      }

      const pivot = driving
        ? [driving.object.position.x, driving.object.position.y + (MODE === 'first-person' ? 0.9 : 1.8), driving.object.position.z]
        : character.head();
      rig.update(dt, { pivot, look, speed: driving ? 0 : character.speed });
      avatar.position.set(...character.position);
      avatar.rotation.y = character.yaw;
      terrain.update(rig.camera.position);
      genre.update(dt, frame);

      // --- sky, weather, wind and the sound beds -----------------------------------------------------------------
      const hour = hourAt(seconds, DAY_SECONDS, 9);
      const skyNow = skyAt(hour);
      weather.update(dt, seconds, rig.camera.position);
      skyColor.setRGB((skyNow.sky[0] ?? 0) / 255, (skyNow.sky[1] ?? 0) / 255, (skyNow.sky[2] ?? 0) / 255, THREE.SRGBColorSpace);
      sky.update(skyColor, skyNow, weather.rain, rig.camera.position);
      const fx = settings.resolved();
      wind.set(seconds, !fx.enabled ? 0 : fx.reducedMotion ? 0.25 : 0.6 + 0.4 * Math.min(1.5, fx.intensity) + weather.rain * 0.8);
      beds.update(dt, { car: driving ? { speed: driving.speed, throttle: throttleNow } : null, slip, hour, rain: weather.rain });

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
      juice: juice.state(),
      weather: { rain: Number(weather.rain.toFixed(3)) },
      camera: MODE === 'third-person' ? rig.preset : 'first-person',
      ...genre.state(),
    }),
  });
}
