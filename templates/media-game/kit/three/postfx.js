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
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uAberration: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uAberration; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec2 off = d * uAberration;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float v = smoothstep(0.85, 0.25, length(d) * (1.0 + uVignette));
      c *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(c, 1.0);
    }`,
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
    c.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), bloom.strength ?? 0.32, bloom.radius ?? 0.55, bloom.threshold ?? 0.88));
    grade = new ShaderPass(GradeShader);
    c.addPass(grade);
    c.addPass(new OutputPass());
    composer = c;
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
    /** Pulse chromatic aberration (0..1); it decays by itself. @param {number} [amount] */
    hit(amount = 0.6) {
      const s = options.settings?.resolved();
      const k = s ? s.flash : 1;
      aberration = Math.min(1, Math.max(aberration, amount * k));
    },
    /** Draw the frame. @param {number} dt seconds, for the aberration decay */
    render(dt) {
      aberration = Math.max(0, aberration - dt * 3.2);
      const enabled = options.settings ? options.settings.resolved().postfx : true;
      if (!enabled) {
        usedComposer = false;
        renderer.render(scene, cameraOf());
        return;
      }
      if (!composer) build();
      usedComposer = true;
      if (renderPass) renderPass.camera = cameraOf();
      if (grade) grade.uniforms['uAberration'].value = aberration * 0.012;
      /** @type {EffectComposer} */ (composer).render(dt);
    },
    dispose() {
      composer?.dispose();
      composer = null;
    },
  };
}
