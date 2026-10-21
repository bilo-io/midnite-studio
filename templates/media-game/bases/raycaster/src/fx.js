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
import { mixColor, SKY_PRESETS, skyAtTime } from 'kit/core/sky.js';
import { createAudio } from 'kit/phaser/audio.js';
import { applyPostFx, createJuice, createLighting } from 'kit/phaser/juice.js';

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(hi, v));

/**
 * The Light2D ambient colour for a sky preset (`kit/core/sky.js`): the sky and ground bounce light blended, then
 * dimmed with the preset's hemisphere intensity so night is dark and blue, noon bright, dusk warm.
 * @param {import('kit/core/sky.js').SkyPreset} preset
 */
export function ambientFor(preset) {
  const base = mixColor(preset.hemiSky, preset.hemiGround, 0.35);
  const level = 0.4 + 0.5 * clamp((preset.hemiIntensity - 0.55) / 0.75, 0, 1);
  const channel = (/** @type {number} */ shift) => Math.round(clamp(((base >> shift) & 255) * level, 0, 255));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

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
  const depth = 1000;
  // Camera post effects (bloom, vignette) are one framebuffer pass over the whole view. With hundreds of Light2D tiles
  // behind them some drivers drop the lit layer, so scenes made of many lit tiles ask for 'vignette': a gradient
  // sprite pinned to the screen, no framebuffer, follows the same `postfx` setting.
  const post = options.postfx === false || options.postfx === 'vignette' ? null : applyPostFx(scene, settings);
  /** @type {Phaser.GameObjects.Image | null} */
  let vignetteImage = null;
  if (options.postfx === 'vignette') {
    if (!scene.textures.exists('kit-vignette')) {
      const canvas = scene.textures.createCanvas('kit-vignette', 256, 144);
      const c = /** @type {CanvasRenderingContext2D} */ (canvas?.getContext());
      const g = c.createRadialGradient(128, 72, 40, 128, 72, 150);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 144);
      canvas?.refresh();
    }
    const vignette = scene.add.image(0, 0, 'kit-vignette').setOrigin(0).setScrollFactor(0).setDepth(depth - 2).setDisplaySize(scene.scale.width, scene.scale.height);
    vignetteImage = vignette;
    const sync = () => vignette.setVisible(settings.resolved().postfx);
    settings.subscribe(sync);
    sync();
  }

  // Looping beds (ambience, engines). Every loop is tracked so it can follow the volume and enabled settings and be
  // stopped with the scene; `wanted` holds what should be playing, `live` what the audio engine is actually running.
  /** @type {Set<{ name: string, opts: Record<string, unknown>, live: { stop(): void, set(p: object): void } | null, stopped: boolean }>} */
  const wanted = new Set();
  const audible = () => {
    const r = settings.resolved();
    return r.enabled && r.volume > 0;
  };
  const syncLoops = () => {
    for (const entry of wanted) {
      if (entry.stopped) continue;
      if (audible() && !entry.live) entry.live = audio.sfx.loop(entry.name, entry.opts);
      else if (!audible() && entry.live) {
        entry.live.stop();
        entry.live = null;
      }
    }
  };
  settings.subscribe(syncLoops);
  /** @type {{ stop(): void, set(p: object): void } | null} */
  let bed = null;
  const stopAll = () => {
    for (const entry of wanted) {
      entry.stopped = true;
      entry.live?.stop();
      entry.live = null;
    }
    wanted.clear();
    bed = null;
  };
  scene.events.once('shutdown', stopAll);
  scene.events.once('destroy', stopAll);

  const api = {
    /** True once a genre has covered the base's own world (`world.cover()`): the base then stops its own pickups, footsteps and swings. */
    owned: false,
    /**
     * A genre that draws its own world calls this after `world.cover()` (which hides everything the base made, the
     * vignette included): it brings the vignette back and drops the base's torches, keeping only `keep`, the light that follows the player.
     * @param {Phaser.GameObjects.Light | null} [keep]
     */
    takeOver(keep = null) {
      api.owned = true;
      vignetteImage?.setVisible(settings.resolved().postfx);
      if (lighting) for (const light of [...lighting.lights.lights]) if (light !== keep) lighting.lights.removeLight(light);
    },
    /**
     * Start a looping sound (`engine-loop`, `ambience-*`). Silent while juice is off or the volume is 0, and ended when the scene shuts down.
     * `set({ volume, pitch })` retunes it live; `stop()` ends it for good. @param {string} name @param {{ volume?: number, pitch?: number, power?: number }} [opts]
     */
    loop(name, opts = {}) {
      const entry = { name, opts: { ...opts }, live: /** @type {{ stop(): void, set(p: object): void } | null} */ (null), stopped: false };
      wanted.add(entry);
      syncLoops();
      return {
        stop() {
          entry.stopped = true;
          entry.live?.stop();
          entry.live = null;
          wanted.delete(entry);
        },
        /** @param {{ volume?: number, pitch?: number, power?: number }} patch */
        set(patch) {
          entry.opts = { ...entry.opts, ...patch };
          entry.live?.set(patch);
        },
      };
    },
    /**
     * The scene's one ambience bed. Calling it again replaces the previous bed (so a genre overriding the base's default
     * never doubles up); `null` silences it. A repeat call with the same name only retunes the volume. @param {string | null} name @param {{ volume?: number, pitch?: number }} [opts]
     */
    ambience(name, opts = {}) {
      if (name === api.bedName) {
        if (name) bed?.set(opts);
        return;
      }
      bed?.stop();
      bed = name ? api.loop(name, { volume: 0.5, ...opts }) : null;
      api.bedName = name;
    },
    /** Name of the running ambience bed, or null. */
    bedName: /** @type {string | null} */ (null),
    /** Stop every loop this scene started. */
    stopLoops: stopAll,
    /** Sky colours last set with `tint`. */
    sky: /** @type {import('kit/core/sky.js').SkyPreset | null} */ (null),
    /**
     * Light the scene for a sky preset name (`day`, `dawn`, `dusk`, `night`, `overcast`) or an hour 0..24, through the
     * kit's sky maths: the Light2D ambient colour follows the preset. Call it per frame to sweep a day; it is cheap and
     * deterministic. Returns the preset in use. @param {string | number} spec
     */
    tint(spec) {
      const preset = typeof spec === 'number' ? skyAtTime(spec).preset : SKY_PRESETS[spec] ?? SKY_PRESETS['day'];
      api.sky = /** @type {import('kit/core/sky.js').SkyPreset} */ (preset);
      lighting?.lights.setAmbientColor(ambientFor(api.sky));
      return api.sky;
    },
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
  return api;
}
