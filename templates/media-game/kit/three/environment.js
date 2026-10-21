// @ts-check
/**
 * Midnite game kit — sky and environment for three.js games.
 *
 * One call gives a level a procedural sky dome (zenith-to-horizon gradient, sun glow, optional stars),
 * hemisphere and sun lights with soft shadows, fog matched to the horizon colour and, when a renderer is
 * passed, a small reflection map baked from the sky so metals and wet surfaces pick up something other
 * than black. No image files. Presets and the time-of-day curve are in `kit/core/sky.js`.
 *
 *   const env = createEnvironment({ scene, renderer, preset: 'day' });      // or { timeOfDay: 17.5 }
 *   // loop: env.follow(camera.position) keeps the dome and the shadow box centred on the player
 *   env.setTimeOfDay(19);                                                    // re-light, re-fog, re-bake
 *
 * It owns `scene.background`, `scene.fog` and `scene.environment`; do not add your own lights beside it
 * unless you want more. Sky and shadow-map softness are cosmetic, so the dome is not part of any
 * determinism contract; there is no rng and no clock in here.
 */

import * as THREE from 'three';

import { SKY_PRESETS, skyAtTime, sunDirection } from '../core/sky.js';

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.9999; // pin to the far plane
  }`;

const FRAG = `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColor;
  uniform vec3 uSunDir; uniform float uStars;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;
    vec3 col = up >= 0.0 ? mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, pow(clamp(-up, 0.0, 1.0), 0.4));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
    if (uStars > 0.0 && up > 0.0) {
      vec3 cell = floor(d * 140.0);
      float star = step(0.9965, hash(cell)) * smoothstep(0.0, 0.25, up) * uStars;
      col += vec3(star);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * @param {{
 *   scene: THREE.Scene,
 *   renderer?: THREE.WebGLRenderer,
 *   preset?: string,
 *   timeOfDay?: number,
 *   sunAzimuth?: number,
 *   sunElevation?: number,
 *   shadowSize?: number,
 *   shadowRadius?: number,
 *   fog?: boolean | [number, number],
 *   environmentMap?: boolean,
 *   radius?: number,
 * }} options `shadowSize` is the half-width in metres the sun's shadow box covers around `follow()`; `fog` is true, false or `[near, far]`.
 */
export function createEnvironment(options) {
  const { scene, renderer } = options;
  const radius = options.radius ?? 400;
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uStars: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = 'sky';
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const shadowSize = options.shadowSize ?? 30;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = shadowSize * 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = options.shadowRadius ?? 3;
  sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);
  // three's PCFShadowMap is already the soft, filtered one (PCFSoftShadowMap was folded into it); `radius` widens the blur.

  const fogOption = options.fog ?? true;
  const fog = fogOption === false ? null : new THREE.Fog(0xffffff, Array.isArray(fogOption) ? fogOption[0] : 30, Array.isArray(fogOption) ? fogOption[1] : 90);
  scene.fog = fog;
  const wantEnv = options.environmentMap !== false && !!renderer;
  /** @type {THREE.WebGLRenderTarget | null} */
  let envTarget = null;
  let hours = options.timeOfDay ?? null;
  let presetName = options.preset ?? 'day';
  let azimuth = options.sunAzimuth ?? 0.9;
  let elevation = options.sunElevation ?? 0.8;
  const dir = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const bakeEnvironment = () => {
    if (!wantEnv || !renderer) return;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const bakeScene = new THREE.Scene();
      const probe = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), material.clone());
      bakeScene.add(probe);
      const next = pmrem.fromScene(bakeScene, 0, 0.1, 50);
      envTarget?.dispose();
      envTarget = next;
      scene.environment = next.texture;
      probe.geometry.dispose();
      /** @type {THREE.Material} */ (probe.material).dispose();
      pmrem.dispose();
    } catch {
      scene.environment = null; // no WebGL2 float targets, or a headless context: fall back to lights only
    }
  };

  const apply = () => {
    let p = SKY_PRESETS[presetName] ?? /** @type {NonNullable<typeof SKY_PRESETS[string]>} */ (SKY_PRESETS.day);
    let el = elevation;
    let az = azimuth;
    if (hours !== null) {
      const t = skyAtTime(hours);
      p = t.preset;
      el = t.elevation;
      az = t.azimuth;
    }
    const [dx, dy, dz] = sunDirection(az, Math.max(el, 0.02));
    dir.set(dx, dy, dz);
    uniforms.uZenith.value.setHex(p.zenith);
    uniforms.uHorizon.value.setHex(p.horizon);
    uniforms.uGround.value.setHex(p.ground);
    uniforms.uSunColor.value.setHex(p.sun);
    uniforms.uSunDir.value.copy(dir);
    uniforms.uStars.value = p.stars;
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    sun.color.setHex(p.sun);
    sun.intensity = p.sunIntensity * Math.min(1, Math.max(0.15, el * 3 + 0.4));
    if (fog) fog.color.setHex(p.fog);
    scene.background = new THREE.Color(p.fog);
    sun.position.copy(centre).addScaledVector(dir, shadowSize * 2);
    sun.target.position.copy(centre);
    sun.target.updateMatrixWorld();
  };
  apply();
  bakeEnvironment();

  return {
    dome,
    sun,
    hemi,
    fog,
    /** Switch to a named preset (`day dawn dusk night overcast`) and re-light. */
    setPreset(/** @type {string} */ name) {
      presetName = name;
      hours = null;
      apply();
      bakeEnvironment();
    },
    /** Light by the hour, 0..24 (sunrise 6, sunset 18). */
    setTimeOfDay(/** @type {number} */ h) {
      hours = h;
      apply();
      bakeEnvironment();
    },
    /** Move the sun without changing the palette (radians). */
    setSun(/** @type {number} */ az, /** @type {number} */ el) {
      azimuth = az;
      elevation = el;
      hours = null;
      apply();
    },
    /** Keep the dome and the sun's shadow box centred on the player. Call once a frame, cheap. */
    follow(/** @type {{ x: number, y: number, z: number } | readonly number[]} */ position) {
      const [x, y, z] = Array.isArray(position) ? position : [/** @type {any} */ (position).x, /** @type {any} */ (position).y, /** @type {any} */ (position).z];
      dome.position.set(x, y, z);
      // Snap to the shadow texel grid so shadows do not swim as the box follows.
      const texel = (shadowSize * 2) / 2048;
      centre.set(Math.round(x / texel) * texel, 0, Math.round(z / texel) * texel);
      sun.position.copy(centre).addScaledVector(dir, shadowSize * 2);
      sun.target.position.copy(centre);
      sun.target.updateMatrixWorld();
    },
    state() {
      return { preset: hours === null ? presetName : 'time-of-day', hours, sun: { x: dir.x, y: dir.y, z: dir.z } };
    },
    dispose() {
      scene.remove(dome, hemi, sun, sun.target);
      dome.geometry.dispose();
      material.dispose();
      envTarget?.dispose();
      if (scene.environment === envTarget?.texture) scene.environment = null;
    },
  };
}
