// @ts-check
/**
 * Midnite game kit — the three.js game loop, wired to Midnite Studio.
 *
 * Game logic and physics run in fixed `1/hz` steps (`createFixedStep`), and
 * rendering happens once per animation frame with `alpha`, the leftover part of
 * a step, so a renderer can interpolate. `startLoop` installs
 * `window.__midnite` — pause, resume and single-stepping drive this loop — and
 * prints `midnite-ready` after the first rendered frame. Each step first calls
 * `beforeKitStep` (virtual clock, replay input); in deterministic mode every
 * animation frame is exactly one step, whatever the wall clock says.
 */

import * as THREE from 'three';

import { createFixedStep } from '../core/clock.js';
import { determinism } from '../core/determinism.js';
import { HOOK_VERSION, installHook, markReady, startSeed } from '../core/hook.js';
import { beforeKitStep } from '../core/replay.js';

/**
 * A renderer sized to its canvas, with shadows and sRGB output.
 * @param {HTMLCanvasElement} [canvas] defaults to `#game`
 */
export function createRenderer(canvas) {
  const target = canvas ?? /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
  const renderer = new THREE.WebGLRenderer({ canvas: target, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

/**
 * @param {{
 *   renderer: THREE.WebGLRenderer,
 *   scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera | (() => THREE.PerspectiveCamera),
 *   update: (dt: number, frame: number) => void,
 *   render?: (alpha: number, frameDt: number) => void,
 *   state?: () => Record<string, unknown>,
 *   sceneName?: string | (() => string),
 *   hz?: number,
 *   onOverlay?: (on: boolean) => void,
 *   onSeed?: (seed: number) => void,
 * }} options
 */
export function startLoop(options) {
  const fixed = createFixedStep(options.hz ?? 60);
  const cameraOf = () => (typeof options.camera === 'function' ? options.camera() : options.camera);
  let frame = 0;
  let paused = false;
  let running = true;
  let last = performance.now();
  /** @type {number} */
  let handle = 0;

  const resize = () => {
    const canvas = options.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    options.renderer.setSize(w, h, false);
    const camera = cameraOf();
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const simulate = (/** @type {number} */ steps) => {
    for (let i = 0; i < steps; i += 1) {
      beforeKitStep(fixed.stepMs);
      frame += 1;
      options.update(fixed.dt, frame);
    }
  };
  const draw = (/** @type {number} */ alpha, /** @type {number} */ frameDt) => {
    options.render?.(alpha, frameDt);
    options.renderer.render(options.scene, cameraOf());
  };

  const tick = (/** @type {number} */ now) => {
    if (!running) return;
    const elapsed = Math.min(250, now - last);
    last = now;
    if (!paused) simulate(determinism.enabled ? 1 : fixed.advance(elapsed).steps);
    // Deterministic: no interpolation and a fixed frame time, so a camera smoothed in `render` matches too.
    if (determinism.enabled) draw(0, fixed.dt);
    else draw(paused ? 0 : fixed.alpha, elapsed / 1000);
    markReady();
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);

  const loop = {
    get frame() {
      return frame;
    },
    /** Game time in ms (`frame × step`), the same paused or not. */
    get time() {
      return Math.round(frame * fixed.stepMs);
    },
    get paused() {
      return paused;
    },
    dt: fixed.dt,
    pause() {
      paused = true;
      fixed.reset();
    },
    resume() {
      paused = false;
      last = performance.now();
    },
    /** Pause, then advance exactly `n` steps and draw once. */
    step(n = 1) {
      loop.pause();
      simulate(Math.max(0, Math.floor(n)));
      draw(0, 0);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
      window.removeEventListener('resize', resize);
    },
  };

  installHook({
    getState: () => ({
      version: HOOK_VERSION,
      scene: typeof options.sceneName === 'function' ? options.sceneName() : options.sceneName ?? 'main',
      frame,
      time: loop.time,
      ...(options.state?.() ?? {}),
    }),
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    step: (n) => loop.step(n),
    setSeed: (seed) => options.onSeed?.(seed),
    setOverlay: (on) => options.onOverlay?.(on === true),
  });
  determinism.reseed(startSeed());
  return loop;
}
