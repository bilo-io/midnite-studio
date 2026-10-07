// @ts-check
/**
 * The fighter's stage. It replaces the third-person base's arena: a fighter
 * has no free camera and no spring arm, just a round dojo, two fighters and
 * the **versus** camera (`kit/three/cameras.js` mode `'versus'`), which frames
 * both fighters side-on and is outside the five third-person presets. The
 * fight itself — move lists, hit boxes, rounds and the CPU — is the genre
 * module, `../genre/index.js`.
 */
import * as THREE from 'three';

import { createCameraRig } from 'kit/three/cameras.js';
import { createHud } from 'kit/three/hud.js';
import { createInput } from 'kit/three/input.js';
import { createRenderer, startLoop } from 'kit/three/loop.js';

import { FIGHTER_BINDINGS, installGenre } from '../genre/index.js';

export async function startLevel() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120d16);
  scene.fog = new THREE.Fog(0x120d16, 14, 32);
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x1d1626, 1.0));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.8);
  key.position.set(4, 10, 8);
  key.castShadow = true;
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  scene.add(key);

  // The dojo: a wooden disc, a painted ring and a circle of lantern posts.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.8, 7.0, 64), new THREE.MeshBasicMaterial({ color: 0xd9c38c }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2a20 }));
    post.position.set(Math.cos(a) * 10, 1.5, Math.sin(a) * 10);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8c1a, emissiveIntensity: 1.2 }));
    lamp.position.set(Math.cos(a) * 10, 3.2, Math.sin(a) * 10);
    scene.add(post, lamp);
  }

  const input = createInput(FIGHTER_BINDINGS);
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const rig = createCameraRig({ mode: 'versus' });
  const hud = createHud({ hint: 'A/D walk (hold back to guard) · W/S sidestep · C crouch · U I J K punch/punch/kick/kick' });
  const genre = installGenre(scene, { rig, hud, input });

  const renderer = createRenderer(canvas);
  startLoop({
    renderer,
    scene,
    camera: rig.camera,
    sceneName: 'level',
    update(dt, frame) {
      input.update();
      genre.update(dt, frame);
      rig.update(dt, genre.cameraFrame());
    },
    state: () => ({ camera: rig.mode, ...genre.state() }),
  });
}
