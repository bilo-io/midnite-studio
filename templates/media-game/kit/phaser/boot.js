// @ts-check
/**
 * Midnite game kit — booting a Phaser game wired to Midnite Studio.
 *
 * `boot()` creates the `Phaser.Game`, installs `window.__midnite` against it
 * (pause/resume/step drive Phaser's own loop; `getState` reports the active
 * scene, the frame count and whatever the scene's `kitState()` adds) and
 * prints `midnite-ready` once the first scene has run a frame. Every step
 * first calls `beforeKitStep` (virtual clock, replay input); in deterministic
 * mode Phaser's own loop runs exactly one 1/60 s step per animation frame.
 */

import * as Phaser from 'phaser';

import { determinism } from '../core/determinism.js';
import { HOOK_VERSION, installHook, markReady, startSeed } from '../core/hook.js';
import { beforeKitStep } from '../core/replay.js';

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
  // `index.html` ships an empty `<canvas id="game">` for hand-written games. Phaser appends its own
  // canvas, which would land below that one and leave the page showing the empty canvas, so drop it
  // unless the game asked for a specific canvas or parent.
  if (!options.canvas && !options.parent && typeof document !== 'undefined') document.getElementById('game')?.remove();
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
  // Phaser's loop counts only frames it ran itself; steps taken while paused add to it.
  let manualFrames = 0;

  game.events.on(Phaser.Core.Events.PRE_STEP, () => beforeKitStep(STEP_MS));
  // Deterministic mode: whatever time the browser reports, each loop tick is one fixed step on a
  // virtual clock. Patched before the loop starts (it binds `game.step` once textures are ready).
  const realStep = game.step.bind(game);
  let virtualTime = 0;
  if (determinism.enabled) {
    game.step = (_time, _delta) => {
      virtualTime += STEP_MS;
      realStep(virtualTime, STEP_MS);
    };
  }

  const activeScene = () => game.scene.getScenes(true)[0] ?? null;

  installHook({
    getState() {
      const scene = /** @type {(Phaser.Scene & { kitState?: () => Record<string, unknown> }) | null} */ (activeScene());
      return {
        version: HOOK_VERSION,
        scene: scene?.scene.key ?? 'boot',
        frame: game.loop.frame + manualFrames,
        time: Math.max(0, Math.round(paused ? manualTime : game.loop.time)),
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
        manualFrames += 1;
        if (determinism.enabled) {
          virtualTime += STEP_MS;
          manualTime = virtualTime;
          realStep(virtualTime, STEP_MS);
        } else {
          manualTime += STEP_MS;
          realStep(manualTime, STEP_MS);
        }
      }
    },
    setSeed(seed) {
      Phaser.Math.RND.sow([String(seed)]);
    },
    setOverlay(on) {
      game.events.emit('midnite:overlay', on === true);
    },
  });
  // Every random stream starts from the same seed each run: 1, or the run's in deterministic mode.
  determinism.reseed(startSeed());
  Phaser.Math.RND.sow([String(startSeed())]);

  game.events.once(Phaser.Core.Events.POST_STEP, () => markReady());
  return game;
}
