// @ts-check
/**
 * Midnite game kit — post-processing for three.js games.
 *
 * An `EffectComposer` chain of bloom, a vignette + chromatic-aberration pass and
 * the output pass (ACES tone mapping, sRGB). Each effect follows the juice
 * settings (`kit/core/juice-settings.js`): with post-processing off, or under
 * reduced motion, `render()` is a plain `renderer.render` (the cheap path; the
 * composer is not even built until first needed). Tone mapping and sRGB output are
 * applied either way, so the two paths look alike apart from the effects.
 *
 *   const fx = createPostFx({ renderer, scene, camera: rig.camera, settings });
 *   startLoop({ ..., renderFrame: (dt) => fx.render(dt), onResize: (w, h) => fx.setSize(w, h) });
 *   fx.hit(0.6);   // a chromatic-aberration pulse on a hit
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Vignette and chromatic aberration in one pass. `uAberration` is a UV offset, kept at 0 until a hit pulses it. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uAberration: { value: 0 }, uSaturation: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uAberration; uniform float uSaturation; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec2 off = d * uAberration;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float v = smoothstep(0.85, 0.25, length(d) * (1.0 + uVignette));
      c *= mix(1.0 - uVignette, 1.0, v);
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSaturation);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * The level's `midnite.post` presets (Phase 144). `none` skips the composer; the others set the bloom and grade
 * passes. `aberration` is a constant UV offset (a hit pulse adds to it).
 * @type {Record<string, { off?: boolean, bloom: { strength: number, radius: number, threshold: number }, vignette: number, saturation: number, aberration: number }>}
 */
export const POST_PRESETS = {
  none: { off: true, bloom: { strength: 0, radius: 0, threshold: 1 }, vignette: 0, saturation: 1, aberration: 0 },
  soft: { bloom: { strength: 0.4, radius: 0.55, threshold: 0.88 }, vignette: 0.2, saturation: 1, aberration: 0 },
  vivid: { bloom: { strength: 0.8, radius: 0.55, threshold: 0.85 }, vignette: 0.32, saturation: 1.35, aberration: 0 },
  cinematic: { bloom: { strength: 0.6, radius: 0.6, threshold: 0.88 }, vignette: 0.45, saturation: 0.95, aberration: 0.002 },
};

/**
 * @param {{
 *   renderer: THREE.WebGLRenderer, scene: THREE.Scene,
 *   camera: THREE.Camera | (() => THREE.Camera),
 *   settings?: { resolved(): { postfx: boolean, flash: number, intensity: number } },
 *   bloom?: { strength?: number, radius?: number, threshold?: number },
 *   exposure?: number,
 * }} options
 */
export function createPostFx(options) {
  const { renderer, scene } = options;
  const cameraOf = () => (typeof options.camera === 'function' ? options.camera() : options.camera);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /** @type {EffectComposer | null} */
  let composer = null;
  /** @type {RenderPass | null} */
  let renderPass = null;
  /** @type {ShaderPass | null} */
  let grade = null;
  let width = renderer.domElement.clientWidth || 960;
  let height = renderer.domElement.clientHeight || 540;
  let aberration = 0;
  let usedComposer = false;
  /** The level's `midnite.post` preset, or `null` for the game's own look. @type {string | null} */
  let presetName = null;
  /** @type {UnrealBloomPass | null} */
  let bloomPass = null;
  const preset = () => (presetName ? POST_PRESETS[presetName] ?? null : null);
  /** Push the active preset's values into the passes once they exist. */
  const applyPreset = () => {
    const p = preset();
    if (bloomPass) {
      const b = p?.bloom ?? options.bloom ?? {};
      bloomPass.strength = b.strength ?? 0.32;
      bloomPass.radius = b.radius ?? 0.55;
      bloomPass.threshold = b.threshold ?? 0.88;
    }
    if (grade) {
      grade.uniforms['uVignette'].value = p ? p.vignette : 0.32;
      grade.uniforms['uSaturation'].value = p ? p.saturation : 1;
    }
  };

  const build = () => {
    const size = renderer.getSize(new THREE.Vector2());
    width = size.x || width;
    height = size.y || height;
    const c = new EffectComposer(renderer);
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(width, height);
    renderPass = new RenderPass(scene, cameraOf());
    c.addPass(renderPass);
    const bloom = options.bloom ?? {};
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), bloom.strength ?? 0.32, bloom.radius ?? 0.55, bloom.threshold ?? 0.88);
    c.addPass(bloomPass);
    grade = new ShaderPass(GradeShader);
    c.addPass(grade);
    c.addPass(new OutputPass());
    composer = c;
    applyPreset();
  };

  return {
    /** Which path the last `render` took, for `getState` and tests. */
    get usingComposer() {
      return usedComposer;
    },
    /** @param {number} w @param {number} h */
    setSize(w, h) {
      width = w;
      height = h;
      composer?.setSize(w, h);
    },
    /** Switch the look to a `POST_PRESETS` name, or `null` for the game's own. An unknown name is ignored. @param {string | null} name */
    setPreset(name) {
      if (name !== null && !POST_PRESETS[name]) return;
      presetName = name;
      applyPreset();
    },
    /** Apply a level's environment (`levelEnvironment(map)` from `kit/core/level.js`): its `post` preset, when set. @param {{ post?: string | null } | null | undefined} env */
    applyLevel(env) {
      if (env && typeof env.post === 'string') this.setPreset(env.post);
    },
    /** The active preset name, or `null`. */
    get preset() {
      return presetName;
    },
    /** Pulse chromatic aberration (0..1); it decays by itself. @param {number} [amount] */
    hit(amount = 0.6) {
      const s = options.settings?.resolved();
      const k = s ? s.flash : 1;
      aberration = Math.min(1, Math.max(aberration, amount * k));
    },
    /** Draw the frame. @param {number} dt seconds, for the aberration decay */
    render(dt) {
      aberration = Math.max(0, aberration - dt * 3.2);
      const enabled = (options.settings ? options.settings.resolved().postfx : true) && !preset()?.off;
      if (!enabled) {
        usedComposer = false;
        renderer.render(scene, cameraOf());
        return;
      }
      if (!composer) build();
      usedComposer = true;
      if (renderPass) renderPass.camera = cameraOf();
      if (grade) grade.uniforms['uAberration'].value = aberration * 0.012 + (preset()?.aberration ?? 0);
      /** @type {EffectComposer} */ (composer).render(dt);
    },
    dispose() {
      composer?.dispose();
      composer = null;
    },
  };
}
