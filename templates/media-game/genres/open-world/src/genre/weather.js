// @ts-check
/**
 * Weather-lite: a deterministic cycle of clear spells and rain showers, drawn as falling streaks around
 * the camera plus a closer fog while it rains (and a few drifting motes when it is clear). The shower
 * state is value noise over the game clock, so a replay rains at the same moments. It follows the juice
 * settings: with effects off the rain is not drawn (the fog and the sound still change only a little),
 * and reduced motion halves the streaks and slows their fall.
 */
import * as THREE from 'three';

import { valueNoise } from 'kit/core/procedural-textures.js';
import { createRng } from 'kit/core/rng.js';

const STREAKS = 450;
const BOX = 36;
/** Rain intensity 0..1 at `seconds` into the game: shower weather where the noise rises past 0.6. */
export const rainAt = (/** @type {number} */ seconds) => {
  const n = valueNoise(41, seconds / 70, 0.5) * 0.7 + valueNoise(43, seconds / 23, 0.5) * 0.3;
  return Math.min(1, Math.max(0, (n - 0.6) / 0.15));
};

/**
 * @param {THREE.Scene} scene
 * @param {{ resolved(): { enabled: boolean, reducedMotion: boolean, particles: number } }} settings
 */
export function createWeather(scene, settings) {
  const rng = createRng(0x7a1);
  const seeds = new Float32Array(STREAKS * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = rng.next();
  const positions = new Float32Array(STREAKS * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xbfd0e6, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 9;
  scene.add(lines);
  const baseFog = scene.fog ? { near: /** @type {THREE.Fog} */ (scene.fog).near, far: /** @type {THREE.Fog} */ (scene.fog).far } : null;
  let rain = 0;

  return {
    /** 0..1, eased. */
    get rain() {
      return rain;
    },
    /**
     * @param {number} dt
     * @param {number} seconds game clock
     * @param {THREE.Vector3} at the camera
     */
    update(dt, seconds, at) {
      const target = rainAt(seconds);
      rain += (target - rain) * Math.min(1, dt * 0.6);
      const s = settings.resolved();
      const visible = s.enabled && s.particles > 0 && rain > 0.02;
      lines.visible = visible;
      if (scene.fog && baseFog) {
        const fog = /** @type {THREE.Fog} */ (scene.fog);
        fog.near = baseFog.near * (1 - rain * 0.6);
        fog.far = baseFog.far * (1 - rain * 0.55);
      }
      if (!visible) return;
      const count = Math.floor(STREAKS * rain * (s.reducedMotion ? 0.5 : 1) * Math.min(1, s.particles));
      const fall = (s.reducedMotion ? 14 : 30) * 1;
      for (let i = 0; i < STREAKS; i += 1) {
        const k = i * 3;
        const on = i < count;
        const x = (((seeds[k] ?? 0) * BOX * 2 + 0) % (BOX * 2)) - BOX;
        const z = (((seeds[k + 1] ?? 0) * BOX * 2) % (BOX * 2)) - BOX;
        // Fall is a pure function of the clock, so the rain is the same on every replay.
        const y = 18 - ((((seeds[k + 2] ?? 0) * 18 + seconds * fall) % 18) + 18) % 18;
        const px = at.x + x;
        const pz = at.z + z;
        const o = i * 6;
        positions[o] = px; positions[o + 1] = on ? at.y + y - 6 : -9999; positions[o + 2] = pz;
        positions[o + 3] = px - 0.05; positions[o + 4] = on ? at.y + y - 5.3 : -9999; positions[o + 5] = pz;
      }
      /** @type {THREE.BufferAttribute} */ (geometry.getAttribute('position')).needsUpdate = true;
      material.opacity = 0.35 * rain;
    },
    dispose() {
      scene.remove(lines);
      geometry.dispose();
      material.dispose();
    },
  };
}
