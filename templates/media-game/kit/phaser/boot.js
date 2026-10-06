// @ts-check
/**
 * Midnite game kit — booting a Phaser game wired to Midnite Studio.
 *
 * `boot()` creates the `Phaser.Game`, installs `window.__midnite` against it
 * (pause/resume/step drive Phaser's own loop; `getState` reports the active
 * scene, the frame count and whatever the scene's `kitState()` adds) and
 * prints `midnite-ready` once the first scene has run a frame.
 */

import Phaser from 'phaser';

import { HOOK_VERSION, installHook, markReady } from '../core/hook.js';
import { rng } from '../core/rng.js';

const STEP_MS = 1000 / 60;

/**
 * @param {{
 *   scenes: (typeof Phaser.Scene)[],
 *   width?: number,
 *   height?: number,
 *   gravity?: number,
 *   physics?: boolean,
 *   pixelArt?: boolean,
 *   backgroundColor?: string,
 *   parent?: string | HTMLElement,
 *   canvas?: HTMLCanvasElement,
 * }} options
 */
export function boot(options) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: options.width ?? 960,
    height: options.height ?? 540,
    backgroundColor: options.backgroundColor ?? '#0b0d12',
    pixelArt: options.pixelArt ?? true,
    ...(options.canvas ? { canvas: options.canvas } : { parent: options.parent ?? document.body }),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true },
    ...(options.physics === false
      ? {}
      : { physics: { default: 'arcade', arcade: { gravity: { x: 0, y: options.gravity ?? 0 }, debug: false } } }),
    scene: options.scenes,
  });

  let paused = false;
  let manualTime = 0;

  const activeScene = () => game.scene.getScenes(true)[0] ?? null;

  installHook({
    getState() {
      const scene = /** @type {(Phaser.Scene & { kitState?: () => Record<string, unknown> }) | null} */ (activeScene());
      return {
        version: HOOK_VERSION,
        scene: scene?.scene.key ?? 'boot',
        frame: game.loop.frame,
        time: Math.max(0, Math.round(game.loop.time)),
        ...(scene?.kitState?.() ?? {}),
      };
    },
    pause() {
      if (paused) return;
      paused = true;
      manualTime = game.loop.time;
      game.loop.sleep();
    },
    resume() {
      if (!paused) return;
      paused = false;
      game.loop.wake();
    },
    step(n = 1) {
      if (!paused) {
        paused = true;
        manualTime = game.loop.time;
        game.loop.sleep();
      }
      for (let i = 0; i < Math.max(0, Math.floor(n)); i += 1) {
        manualTime += STEP_MS;
        game.step(manualTime, STEP_MS);
      }
    },
    setSeed(seed) {
      Phaser.Math.RND.sow([String(seed)]);
    },
    setOverlay(on) {
      game.events.emit('midnite:overlay', on === true);
    },
  });
  // The kit's own RNG starts from the same default seed every run.
  rng.reseed(1);

  game.events.once(Phaser.Core.Events.POST_STEP, () => markReady());
  return game;
}
