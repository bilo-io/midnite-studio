// @ts-check
/**
 * The fighter's stage. It replaces the third-person base's arena: a fighter has no free
 * camera and no spring arm, just a round dojo, two fighters and the **versus** camera
 * (`kit/three/cameras.js` mode `'versus'`), which frames both fighters side-on and is
 * outside the five third-person presets. The fight itself — move lists, hit boxes, rounds
 * and the CPU — is the genre module, `../genre/index.js`.
 *
 * The dojo is lit by paper lanterns (emissive, so the bloom pass blooms them, with a few
 * real warm lights among them): a normal-mapped wooden floor, a brick back wall and
 * stone lantern bases. The fight is frame-counted at 60 steps a second, so hit-stop and
 * slow motion are applied by feeding the genre fewer or no steps (`simSteps` in
 * `../genre/moments.js`), never by scaling its dt.
 */
import * as THREE from 'three';

import { createCameraRig } from 'kit/three/cameras.js';
import { createEnvironment } from 'kit/three/environment.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';
import { repeatFor } from 'kit/three/materials.js';

import { createFx } from '../genre/fx.js';
import { FIGHTER_BINDINGS, installGenre } from '../genre/index.js';
import { flickerOf, simSteps } from '../genre/moments.js';

export async function startLevel() {
  const scene = new THREE.Scene();

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const renderer = createRenderer(canvas);
  // Dusk over the dojo: the walls are open to the sky, and the lantern posts carry the warm light (kit/three/environment.js).
  const env = createEnvironment({ scene, renderer, preset: 'dusk', fog: [16, 36], shadowSize: 12 });
  // The preset's lights are gentler than the dojo's old rig; scale them to keep its brightness (the env's own lights, no extras).
  env.hemi.intensity *= 2.1;
  env.sun.intensity *= 1.6;
  const input = createInput(FIGHTER_BINDINGS);
  const rig = createCameraRig({ mode: 'versus' });
  const fx = createFx({ gameName: 'fighter', scene, camera: rig.camera, renderer, bloom: { strength: 0.5, radius: 0.65, threshold: 0.8 }, exposure: 1.1 });
  const { materials, juice } = fx;

  // The dojo: a normal-mapped wooden disc, a painted ring, a brick back wall and a circle of lantern posts.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), materials.get('wood', { repeat: repeatFor(18, 18, 1.6), tint: 0xe6c8a0, normalScale: 0.6, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.8, 7.0, 64), new THREE.MeshStandardMaterial({ color: 0xe6d29a, emissive: 0xb8964a, emissiveIntensity: 0.55 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 7, 48, 1, true), materials.get('brick', { repeat: [14, 2], tint: 0x8a7a8e, normalScale: 1.2 }));
  wall.material.side = THREE.BackSide;
  wall.position.y = 3.5;
  scene.add(wall);

  const lantern = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a2e, emissiveIntensity: 2.2 });
  const postMaterial = materials.get('wood', { repeat: [1, 3], tint: 0x5a4030 });
  const baseMaterial = materials.get('stone', { repeat: [1, 1], tint: 0x8a8498 });
  /** @type {THREE.PointLight[]} */
  const lights = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 10;
    const z = Math.sin(a) * 10;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), postMaterial);
    post.position.set(x, 1.5, z);
    post.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), baseMaterial);
    base.position.set(x, 0.2, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), lantern);
    lamp.position.set(x, 3.2, z);
    lamp.scale.y = 1.25;
    scene.add(post, base, lamp);
    // A real light on every sixth lantern (two warm pools on the floor is plenty).
    if (i % 6 === 0) {
      const light = new THREE.PointLight(0xff9a3c, 14, 16, 1.6);
      light.position.set(x * 0.9, 2.8, z * 0.9);
      scene.add(light);
      lights.push(light);
    }
  }

  const hud = createHud({ hint: 'A/D walk (hold back to guard) · W/S sidestep · C crouch · U I J K punch/punch/kick/kick' });
  const genre = installGenre(scene, { rig, hud, input, fx });

  let accumulator = 0;
  let simFrame = 0;
  let clock = 0;

  // A dojo crowd murmur behind the ring; it rides the juice volume and ends with the loop.
  fx.ambience('ambience-crowd', { volume: 0.4, power: 0.5 });

  const loop = startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    renderFrame: (dt) => fx.postfx.render(dt),
    onResize: (w, h) => fx.postfx.setSize(w, h),
    render: () => juice.applyCamera(),
    update(realDt) {
      // Effects first: undoes last frame's shake and returns dt scaled by hit-stop and slow motion.
      const scaled = juice.update(realDt);
      clock += realDt;
      // The fight advances in whole 1/60 steps: none in a hit-stop, a fraction under slow motion.
      const sim = simSteps(accumulator, scaled);
      accumulator = sim.accumulator;
      if (sim.steps > 0) input.update();
      for (let i = 0; i < sim.steps; i += 1) {
        simFrame += 1;
        genre.update(1 / 60, simFrame);
      }
      rig.update(realDt, genre.cameraFrame());
      lights.forEach((l, i) => (l.intensity = 8 + flickerOf(clock, i * 2.1) * 3));
    },
    state: () => ({ camera: rig.mode, juice: juice.state(), ...genre.state() }),
  });
  // Shutdown ends the crowd bed and releases the sky along with the loop.
  const stopLoop = loop.stop;
  loop.stop = () => {
    fx.shutdown();
    env.dispose();
    stopLoop();
  };
}
