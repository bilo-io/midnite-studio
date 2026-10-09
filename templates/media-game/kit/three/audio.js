// @ts-check
/**
 * Midnite game kit — audio for three.js games.
 *
 * A listener on the camera, one-shot and looping sounds from the Audio tab's
 * assets, and positional sounds attached to objects. Browsers keep audio
 * suspended until the first user gesture, so `unlock()` is wired to the first
 * click or key press.
 *
 * `audio.sfx` is the kit's synthesized sound-effect player (`kit/core/sfx.js`, no files to
 * load) on the same AudioContext: `audio.sfx.play('jump')`, or `play('hit', { position })` to
 * pan and attenuate by where the camera is. Muting the audio mutes it too.
 */

import * as THREE from 'three';

import { createSfx } from '../core/sfx.js';

/**
 * @param {THREE.Camera} camera
 */
export function createAudio(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const loader = new THREE.AudioLoader();
  /** @type {Map<string, Promise<AudioBuffer>>} */
  const buffers = new Map();
  let muted = false;
  const sfx = createSfx({
    context: listener.context,
    listener: () => {
      camera.updateWorldMatrix(true, false);
      const e = camera.matrixWorld.elements;
      return { position: [e[12] ?? 0, e[13] ?? 0, e[14] ?? 0], right: [e[0] ?? 1, e[1] ?? 0, e[2] ?? 0] };
    },
  });

  const unlock = () => {
    if (listener.context.state === 'suspended') void listener.context.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  /** @param {string} url */
  const buffer = (url) => {
    let pending = buffers.get(url);
    if (!pending) {
      pending = loader.loadAsync(url);
      buffers.set(url, pending);
    }
    return pending;
  };

  return {
    listener,
    /** Synthesized sound effects; see `kit/core/sfx.js`. */
    sfx,
    /** Preload sounds so the first `play` is instant. */
    preload: (/** @type {string[]} */ urls) => Promise.all(urls.map(buffer)),
    /**
     * Play a non-positional sound.
     * @param {string} url
     * @param {{ volume?: number, loop?: boolean }} [opts]
     */
    async play(url, opts = {}) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(await buffer(url));
      sound.setLoop(opts.loop ?? false);
      sound.setVolume(opts.volume ?? 1);
      sound.play();
      return sound;
    },
    /**
     * A sound that comes from `object` (an engine on a car, a fire).
     * @param {THREE.Object3D} object
     * @param {string} url
     * @param {{ volume?: number, loop?: boolean, refDistance?: number }} [opts]
     */
    async attach(object, url, opts = {}) {
      const sound = new THREE.PositionalAudio(listener);
      sound.setBuffer(await buffer(url));
      sound.setRefDistance(opts.refDistance ?? 4);
      sound.setLoop(opts.loop ?? true);
      sound.setVolume(opts.volume ?? 1);
      object.add(sound);
      sound.play();
      return sound;
    },
    get muted() {
      return muted;
    },
    setMuted(/** @type {boolean} */ on) {
      muted = on;
      listener.setMasterVolume(on ? 0 : 1);
      sfx.setMuted(on);
    },
  };
}
