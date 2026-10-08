// @ts-check
/**
 * The fidelity kit wired for a Phaser scene in one call: juice settings, synthesized sound effects, the
 * juice player (shake, hit-stop, flashes, particles, floating numbers), Light2D and the post effects.
 * The three 2D bases carry this same file so a genre can lean on it whichever base it runs on.
 *
 *   const fx = createFx(this, { name: 'top-down', ambient: 0x8a93b0 });
 *   // update(): const scale = fx.juice.update(delta); if (scale === 0) return;
 *   fx.juice.trigger('hit', { x, y, text: 12 });   fx.play('door', { x });
 */

import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { createAudio } from 'kit/phaser/audio.js';
import { applyPostFx, createJuice, createLighting } from 'kit/phaser/juice.js';

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {Phaser.Scene} scene
 * @param {{ name: string, ambient?: number | null, postfx?: boolean, floorY?: number }} options `ambient: null` skips Light2D
 */
export function createFx(scene, options) {
  const settings = createJuiceSettings({ gameName: options.name });
  const audio = createAudio(scene);
  audio.sfx.setVolume(settings.resolved().volume);
  settings.subscribe(() => audio.sfx.setVolume(settings.resolved().volume));
  const juice = createJuice(scene, { settings, sfx: audio.sfx, ...(options.floorY === undefined ? {} : { floorY: options.floorY }) });
  const lighting = options.ambient === null ? null : createLighting(scene, { ambient: options.ambient ?? 0x8a93b0 });
  const post = options.postfx === false ? null : applyPostFx(scene, settings);
  const depth = 1000;

  return {
    settings,
    sfx: audio.sfx,
    juice,
    lighting,
    post,
    /** Play a sound, panned by where `x` (world pixels) sits on screen. @param {string} name @param {{ x?: number, pitch?: number, power?: number, volume?: number, variation?: number }} [o] */
    play(name, o = {}) {
      const cam = scene.cameras.main;
      const pan = o.x === undefined ? 0 : clamp(((o.x - cam.midPoint.x) / (cam.width / 2)) * 0.6, -0.8, 0.8);
      audio.sfx.play(name, { pan, ...(o.pitch === undefined ? {} : { pitch: o.pitch }), ...(o.power === undefined ? {} : { power: o.power }), ...(o.volume === undefined ? {} : { volume: o.volume }), ...(o.variation === undefined ? {} : { variation: o.variation }) });
    },
    /** An expanding ring (a click ping, a shockwave). Follows the particles setting. @param {number} x @param {number} y @param {{ color?: number, radius?: number, ms?: number, width?: number, alpha?: number, squash?: number }} [o] */
    ring(x, y, o = {}) {
      if (settings.resolved().particles <= 0) return;
      const ring = scene.add.ellipse(x, y, 20, 20 * (o.squash ?? 1)).setStrokeStyle(o.width ?? 2, o.color ?? 0xffffff, o.alpha ?? 0.9).setDepth(depth - 1);
      scene.tweens.add({ targets: ring, scaleX: (o.radius ?? 60) / 10, scaleY: (o.radius ?? 60) / 10, alpha: 0, duration: o.ms ?? 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    },
    /** A soft flicker for a torch or fire: deterministic in `seconds`, no random. @param {number} seconds @param {number} [seed] */
    flicker: (seconds, seed = 0) => 0.9 + 0.1 * Math.sin(seconds * 9 + seed) * Math.sin(seconds * 5.3 + seed * 2.1) + 0.04 * Math.sin(seconds * 23 + seed),
  };
}
