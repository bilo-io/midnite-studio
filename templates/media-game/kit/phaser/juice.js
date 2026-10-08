// @ts-check
/**
 * Midnite game kit — juice (game feel), normal-mapped lighting and post effects for Phaser games.
 *
 * `createJuice(scene)` gives camera shake, a screen flash, hit-stop, sprite hit flash,
 * squash and stretch, particle bursts and floating text, plus `trigger(name)` which fans a
 * named moment (`jump`, `land`, `hit`, `hurt`, `pickup`, `explosion`, ...) out to all of
 * them and a sound (`kit/core/sfx.js`). Everything follows the juice settings
 * (`kit/core/juice-settings.js`).
 *
 * Particles are pooled images moved by the kit's own integrator and rng rather than
 * Phaser's emitters: Phaser's emitters draw from their own random generator, which a
 * play-test cannot replay. Textures are generated in code with `generateTexture`.
 *
 * `createLighting(scene)` + `litTexture(...)` give Light2D normal-mapped surfaces from
 * procedural textures (`kit/core/procedural-textures.js`); `applyPostFx(scene)` adds a
 * vignette and bloom to the main camera.
 *
 *   const juice = createJuice(scene, { settings, sfx: audio.sfx });
 *   // in update(time, delta):  const frozen = juice.update(delta);  if (frozen) return;
 *   juice.trigger('land', { target: player, x: player.x, y: player.y + 12 });
 */

import * as Phaser from 'phaser';

import { generateCanvases } from '../core/procedural-textures.js';
import { createTimeScale, spawnParticles, TRIGGERS } from '../core/juice-core.js';
import { createRng } from '../core/rng.js';

const DOT = 'kit-juice-dot';
const CHIP = 'kit-juice-chip';

/** Make the two particle textures once: a soft round glow and a hard square chip. @param {Phaser.Scene} scene */
export function ensureParticleTextures(scene) {
  if (!scene.textures.exists(DOT)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let r = 8; r > 0; r -= 1) {
      g.fillStyle(0xffffff, (1 - r / 8) ** 1.5 * 0.9 + 0.08);
      g.fillCircle(8, 8, r);
    }
    g.generateTexture(DOT, 16, 16);
    g.destroy();
  }
  if (!scene.textures.exists(CHIP)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(CHIP, 8, 8);
    g.destroy();
  }
}

/**
 * @param {Phaser.Scene} scene
 * @param {{
 *   settings?: { resolved(): import('../core/juice-settings.js').ResolvedJuice },
 *   sfx?: { play(name: string, opts?: Record<string, unknown>): unknown } | null,
 *   seed?: number,
 *   pxPerUnit?: number,
 *   floorY?: number,
 *   depth?: number,
 * }} [options] `pxPerUnit` converts the particle presets' world units to pixels (40 by default); `floorY` makes bouncing chips land on a floor line
 */
export function createJuice(scene, options = {}) {
  ensureParticleTextures(scene);
  const rng = createRng(options.seed ?? 0x1ce);
  const time = createTimeScale();
  const px = options.pxPerUnit ?? 40;
  const depth = options.depth ?? 1000;
  /** @type {{ img: Phaser.GameObjects.Image, vx: number, vy: number, age: number, life: number, size: number, gravity: number, drag: number, bounce: number, blend: 'add' | 'normal' }[]} */
  let live = [];
  /** @type {{ sprite: Phaser.GameObjects.Sprite, left: number }[]} */
  let flashing = [];
  /** @type {Phaser.GameObjects.Rectangle | null} */
  let overlay = null;
  let flashLeft = 0;
  let flashTotal = 1;
  let flashAlpha = 0;
  let triggers = 0;
  let worldPaused = false;

  const resolved = () => options.settings?.resolved() ?? /** @type {import('../core/juice-settings.js').ResolvedJuice} */ ({ enabled: true, reducedMotion: false, intensity: 1, shake: 1, flash: 1, particles: 1, postfx: true, volume: 1 });

  const api = {
    time,
    get frozen() {
      return time.frozen;
    },
    /**
     * Advance by Phaser's `delta` (ms). Returns the simulation scale (0 during a hit-stop), and pauses
     * Arcade physics and animations while frozen. Call first in `update`.
     * @param {number} delta
     */
    update(delta) {
      const dt = delta / 1000;
      const scale = time.value;
      time.scale(dt);
      const frozen = time.frozen;
      if (frozen !== worldPaused && scene.physics?.world) {
        worldPaused = frozen;
        if (frozen) {
          scene.physics.world.pause();
          scene.anims.pauseAll();
        } else {
          scene.physics.world.resume();
          scene.anims.resumeAll();
        }
      }
      flashing = flashing.filter((f) => {
        f.left -= dt;
        if (f.left <= 0) {
          f.sprite.clearTint();
          return false;
        }
        return true;
      });
      if (overlay) {
        flashLeft = Math.max(0, flashLeft - dt);
        overlay.setAlpha(flashLeft > 0 ? (flashLeft / flashTotal) ** 2 * flashAlpha : 0);
      }
      const sdt = dt * scale;
      const floor = options.floorY;
      live = live.filter((p) => {
        p.age += sdt;
        if (p.age >= p.life) {
          p.img.destroy();
          return false;
        }
        p.vy += p.gravity * sdt;
        const drag = Math.max(0, 1 - p.drag * sdt);
        p.vx *= drag;
        p.vy *= drag;
        p.img.x += p.vx * sdt;
        p.img.y += p.vy * sdt;
        if (floor !== undefined && p.bounce > 0 && p.img.y > floor && p.vy > 0) {
          p.img.y = floor;
          p.vy *= -p.bounce;
          p.vx *= 0.7;
        }
        const t = p.age / p.life;
        p.img.setAlpha((1 - t) * (1 - t));
        p.img.setScale((p.size * (p.blend === 'add' ? 1 - t * 0.6 : 1 + t * 0.5)) / 16);
        return true;
      });
      return scale;
    },
    /** Shake the main camera by trauma 0..1 (squared into pixels); scaled by the shake setting. @param {number} amount */
    shake(amount) {
      const a = amount * resolved().shake;
      if (a <= 0) return;
      scene.cameras.main.shake(90 + a * 220, Math.min(0.03, 0.002 + a * a * 0.02), true);
    },
    /** Freeze the simulation for `ms`. @param {number} ms */
    hitStop(ms) {
      const r = resolved();
      if (r.enabled && r.shake > 0) time.hitStop(ms * Math.min(1, r.shake));
    },
    /** @param {number} color @param {number} [alpha] @param {number} [ms] */
    screenFlash(color = 0xffffff, alpha = 0.3, ms = 180) {
      const scale = resolved().flash;
      if (scale <= 0) return;
      overlay ??= scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setDepth(depth + 10);
      overlay.setFillStyle(color, 1);
      flashLeft = flashTotal = ms / 1000;
      flashAlpha = Math.min(0.85, alpha * scale);
    },
    /**
     * Tint a sprite solid for a moment (a hit flash).
     * @param {Phaser.GameObjects.Sprite} sprite
     * @param {{ color?: number, ms?: number }} [o]
     */
    flash(sprite, o = {}) {
      if (resolved().flash <= 0) return;
      sprite.setTintFill(o.color ?? 0xffffff);
      const existing = flashing.find((f) => f.sprite === sprite);
      if (existing) existing.left = (o.ms ?? 110) / 1000;
      else flashing.push({ sprite, left: (o.ms ?? 110) / 1000 });
    },
    /**
     * Squash and stretch with an elastic spring back. `[0.8, 1.25]` stretches (a jump), `[1.25, 0.8]` squashes (a landing).
     * @param {Phaser.GameObjects.Components.Transform & { setScale(x: number, y?: number): unknown, getData(k: string): unknown, setData(k: string, v: unknown): unknown }} target
     * @param {readonly [number, number]} factors
     * @param {{ ms?: number }} [o]
     */
    squash(target, factors, o = {}) {
      const k = Math.min(1.5, resolved().shake);
      if (k <= 0) return;
      if (target.getData('juiceBase') === undefined) target.setData('juiceBase', [target.scaleX, target.scaleY]);
      const [bx, by] = /** @type {[number, number]} */ (target.getData('juiceBase'));
      scene.tweens.killTweensOf(target);
      target.setScale(bx * (1 + (factors[0] - 1) * k), by * (1 + (factors[1] - 1) * k));
      scene.tweens.add({ targets: target, scaleX: bx, scaleY: by, duration: o.ms ?? 320, ease: 'Elastic.Out' });
    },
    /**
     * A particle burst at a pixel position. `dir` is `[x, y]` in screen space (y down); default is up.
     * @param {string} kind `spark`, `dust`, `debris`, `muzzle` or `impact`
     * @param {number} x
     * @param {number} y
     * @param {{ dir?: readonly number[], scale?: number, count?: number, colors?: number[] }} [o]
     */
    burst(kind, x, y, o = {}) {
      const scale = (o.scale ?? 1) * resolved().particles;
      const dir = o.dir ? [o.dir[0] ?? 0, -(o.dir[1] ?? -1), 0] : [0, 1, 0];
      for (const q of spawnParticles(kind, rng, { ...o, dir, scale })) {
        const img = scene.add.image(x, y, q.soft ? DOT : CHIP).setTint(q.color).setDepth(depth);
        img.setBlendMode(q.blend === 'add' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        if (live.length > 300) live.shift()?.img.destroy();
        live.push({ img, vx: q.vx * px, vy: -q.vy * px, age: 0, life: q.life, size: q.size * px, gravity: q.gravity * px, drag: q.drag, bounce: q.bounce, blend: q.blend });
      }
    },
    /**
     * Floating text that rises and fades.
     * @param {number} x
     * @param {number} y
     * @param {string | number} text
     * @param {'hit' | 'crit' | 'heal'} [kind]
     */
    text(x, y, text, kind = 'hit') {
      const color = kind === 'crit' ? '#ff6b6b' : kind === 'heal' ? '#6ee7a8' : '#ffe08a';
      const label = scene.add.text(x, y, String(text), { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: kind === 'crit' ? '20px' : '16px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(depth + 1);
      scene.tweens.add({ targets: label, y: y - 34, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => label.destroy() });
    },
    /**
     * Fire a named moment (`TRIGGERS` in `kit/core/juice-core.js`).
     * @param {string} name
     * @param {{ target?: Phaser.GameObjects.Sprite, x?: number, y?: number, dir?: readonly number[], strength?: number, text?: string | number, textKind?: 'hit' | 'crit' | 'heal' }} [o]
     */
    trigger(name, o = {}) {
      const t = TRIGGERS[name];
      if (!t) throw new Error(`unknown juice trigger: ${name}`);
      triggers += 1;
      const strength = o.strength ?? 1;
      if (t.shake) api.shake(t.shake * strength);
      if (t.hitStop) api.hitStop(t.hitStop * strength);
      if (t.flash) api.screenFlash(t.flashColor ?? 0xffffff, t.flash * strength);
      if (t.squash && o.target) api.squash(o.target, t.squash);
      if (o.target && (name === 'hit' || name === 'hurt')) api.flash(o.target, { color: name === 'hurt' ? 0xff4040 : 0xffffff });
      if (t.particles && o.x !== undefined && o.y !== undefined) api.burst(t.particles, o.x, o.y, { dir: o.dir, scale: strength, ...(t.count ? { count: t.count } : {}) });
      if (t.sfx) {
        const cam = scene.cameras.main;
        const pan = o.x === undefined ? 0 : Phaser.Math.Clamp(((o.x - cam.midPoint.x) / (cam.width / 2)) * 0.6, -0.8, 0.8);
        options.sfx?.play(t.sfx, { power: Math.min(1.5, 0.7 + strength * 0.3), pan });
      }
      if (o.text !== undefined && o.x !== undefined && o.y !== undefined) api.text(o.x, o.y - 12, o.text, o.textKind ?? 'hit');
    },
    /** Plain-JSON summary for `getState()`. */
    state() {
      return { frozen: time.frozen, particles: live.length, triggers };
    },
    dispose() {
      for (const p of live) p.img.destroy();
      live = [];
      overlay?.destroy();
    },
  };
  return api;
}

/**
 * Register a procedurally generated surface as a texture with a normal map, so Light2D shades it.
 * Returns the texture key. Sprites using it need `setPipeline('Light2D')` (`lit()` does that).
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {import('../core/procedural-textures.js').TextureKind} kind
 * @param {{ seed?: number, size?: number, base?: number, accent?: number, normalStrength?: number }} [o]
 */
export function litTexture(scene, key, kind, o = {}) {
  if (scene.textures.exists(key)) return key;
  const c = generateCanvases(kind, { size: 64, normalStrength: 3, ...o });
  const texture = scene.textures.addCanvas(key, c.albedo);
  texture?.setDataSource(c.normal);
  return key;
}

/**
 * Light2D lighting for a scene: enables the light manager with an ambient colour and returns helpers.
 * @param {Phaser.Scene} scene
 * @param {{ ambient?: number }} [options]
 */
export function createLighting(scene, options = {}) {
  scene.lights.enable().setAmbientColor(options.ambient ?? 0x6a7384);
  return {
    lights: scene.lights,
    /** @param {number} x @param {number} y @param {{ radius?: number, color?: number, intensity?: number }} [o] */
    add: (x, y, o = {}) => scene.lights.addLight(x, y, o.radius ?? 280, o.color ?? 0xffe2b0, o.intensity ?? 2.2),
    /** Put game objects on the lit pipeline. @template {Phaser.GameObjects.GameObject} T @param {T} object @returns {T} */
    lit(object) {
      /** @type {any} */ (object).setPipeline?.('Light2D');
      return object;
    },
  };
}

/**
 * A vignette and a soft bloom on the main camera (WebGL only), following the juice settings. Returns
 * `{ refresh() }`; call it after changing the settings. A no-op on the Canvas renderer.
 * @param {Phaser.Scene} scene
 * @param {{ resolved(): import('../core/juice-settings.js').ResolvedJuice }} [settings]
 */
export function applyPostFx(scene, settings) {
  const cam = scene.cameras.main;
  /** @type {Phaser.FX.Vignette | null} */
  let vignette = null;
  /** @type {Phaser.FX.Bloom | null} */
  let bloom = null;
  const refresh = () => {
    const on = settings ? settings.resolved().postfx : true;
    if (scene.sys.game.renderer.type !== Phaser.WEBGL || !cam.postFX) return;
    if (on && !vignette) {
      vignette = cam.postFX.addVignette(0.5, 0.5, 0.92, 0.32);
      bloom = cam.postFX.addBloom(0xffffff, 1, 1, 0.8, 1.15, 3);
    } else if (!on && vignette) {
      cam.postFX.clear();
      vignette = bloom = null;
    }
  };
  refresh();
  return { refresh };
}
