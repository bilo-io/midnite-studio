// @ts-check
/**
 * Midnite game kit — sound effects and music (Audio tab exports).
 *
 * Phaser unlocks audio on the first input; the runner grants autoplay, so music
 * can start at once. Mute from the runner toolbar mutes the whole view.
 */

/**
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string | string[]} url
 */
export function preloadAudio(scene, key, url) {
  scene.load.audio(key, url);
}

/** @param {Phaser.Scene} scene */
export function createAudio(scene) {
  /** @type {Phaser.Sound.BaseSound | null} */
  let music = null;
  return {
    /** @param {string} key @param {Phaser.Types.Sound.SoundConfig} [config] */
    play(key, config) {
      if (scene.cache.audio.exists(key)) scene.sound.play(key, config);
    },
    /** Start looping music, replacing whatever was playing. @param {string} key @param {number} [volume] */
    music(key, volume = 0.6) {
      music?.stop();
      music = scene.cache.audio.exists(key) ? scene.sound.add(key, { loop: true, volume }) : null;
      music?.play();
    },
    stopMusic() {
      music?.stop();
      music = null;
    },
    setMuted: (/** @type {boolean} */ muted) => {
      scene.sound.mute = muted;
    },
  };
}
