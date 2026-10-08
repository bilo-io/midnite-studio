// @ts-check
/**
 * The genre's fidelity stack in one place: juice settings, procedural materials,
 * sound, post-processing and the juice object, plus `moment(name, ...)` which plays
 * a row of this genre's `MOMENTS` table (`./moments.js`) through them.
 *
 * `moment` is the genre-side twin of the kit's `juice.trigger`. The kit's TRIGGERS
 * table is shared by every game, so a genre's own moments (a hit marker, a parry, a
 * style rank) live in its own table and reuse the kit's primitives: shake, hit-stop,
 * slow motion, screen flash, aberration, particle bursts and the synthesized sfx.
 * Everything runs on the loop's dt and the kit rng, so a replay plays it exactly.
 *
 * The same file sits in each 3D action genre; only `moments.js` differs.
 */

import { extendHook } from 'kit/core/hook.js';
import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { createAudio } from 'kit/three/audio.js';
import { createJuice } from 'kit/three/juice.js';
import { createMaterials } from 'kit/three/materials.js';
import { createPostFx } from 'kit/three/postfx.js';

import { MOMENTS } from './moments.js';

/** A DOM line that pops in (scale and fade) over the canvas: combo counts, ranks, "KILL". */
const POP_STYLE = 'position:fixed;pointer-events:none;z-index:6;font:900 28px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 2px 0 #000a,0 0 18px currentColor;opacity:0;white-space:nowrap';

/**
 * @param {{
 *   gameName: string,
 *   scene: import('three').Scene,
 *   camera: import('three').PerspectiveCamera,
 *   renderer: import('three').WebGLRenderer,
 *   floorY?: number,
 *   bloom?: { strength?: number, radius?: number, threshold?: number },
 *   exposure?: number,
 * }} options
 */
export function createFx(options) {
  const { scene, camera, renderer } = options;
  const settings = createJuiceSettings({ gameName: options.gameName });
  const materials = createMaterials({ renderer });
  const audio = createAudio(camera);
  const postfx = createPostFx({ renderer, scene, camera, settings, ...(options.bloom ? { bloom: options.bloom } : {}), ...(options.exposure ? { exposure: options.exposure } : {}) });
  const juice = createJuice({ scene, camera, renderer, settings, sfx: audio.sfx, postfx, floorY: options.floorY ?? 0 });
  const applyVolume = () => audio.sfx.setVolume(settings.resolved().volume);
  applyVolume();
  settings.subscribe(applyVolume);

  let moments = 0;
  /** @type {string | null} */
  let lastMoment = null;

  /**
   * Play one row of `MOMENTS`.
   * @param {string} name
   * @param {{ object?: import('three').Object3D, position?: readonly number[], dir?: readonly number[], strength?: number, pitch?: number, text?: number | string, textKind?: 'hit' | 'crit' | 'heal' }} [o]
   */
  const moment = (name, o = {}) => {
    const m = MOMENTS[name];
    if (!m) throw new Error(`unknown moment: ${name}`);
    const k = o.strength ?? 1;
    moments += 1;
    lastMoment = name;
    if (m.shake) juice.shake(m.shake * k);
    if (m.hitStop) juice.hitStop(m.hitStop * k);
    if (m.slowMo) juice.slowMo(m.slowMo[0], m.slowMo[1]);
    if (m.flash) juice.screenFlash(m.flashColor ?? 0xffffff, m.flash * k, m.flashSeconds ?? 0.18);
    if (m.aberration) postfx.hit(m.aberration * k);
    if (o.object && m.squash) juice.squash(o.object, m.squash);
    if (o.object && m.glow) juice.flash(o.object, { color: m.glow, duration: 0.16 });
    if (o.position) for (const p of m.particles ?? []) juice.burst(p.kind, o.position, { ...(o.dir ? { dir: o.dir } : {}), scale: k * (p.scale ?? 1), ...(p.count ? { count: p.count } : {}), ...(p.colors ? { colors: p.colors } : {}) });
    for (const c of m.sfx ?? []) audio.sfx.play(c.name, { pitch: (c.pitch ?? 1) * (o.pitch ?? 1), power: c.power ?? 1, ...(o.position ? { position: o.position } : {}) });
    if (o.text !== undefined && o.position) juice.text(o.position, o.text, o.textKind ?? m.textKind ?? 'hit');
  };

  /**
   * A pop-in text line at a screen position (percent of the viewport). Reduced motion keeps the fade and drops the scale.
   * @param {string} text
   * @param {{ x?: number, y?: number, color?: string, size?: number, seconds?: number }} [o]
   */
  const pop = (text, o = {}) => {
    if (typeof document === 'undefined' || !settings.resolved().enabled) return;
    const el = document.createElement('div');
    el.style.cssText = POP_STYLE;
    el.textContent = text;
    el.style.left = `${o.x ?? 50}%`;
    el.style.top = `${o.y ?? 30}%`;
    el.style.color = o.color ?? '#ffe08a';
    el.style.fontSize = `${o.size ?? 28}px`;
    document.body.append(el);
    const calm = settings.resolved().reducedMotion;
    juice.tween({
      duration: o.seconds ?? 0.9,
      ease: calm ? 'linear' : 'outBack',
      onUpdate: (/** @type {number} */ e, /** @type {number} */ t) => {
        const grow = calm ? 1 : 0.5 + 0.5 * e;
        el.style.transform = `translate(-50%,-50%) scale(${grow})`;
        el.style.opacity = String(t < 0.12 ? t / 0.12 : 1 - Math.max(0, t - 0.6) / 0.4);
      },
      onComplete: () => el.remove(),
    });
  };

  extendHook('fx', {
    trigger: (/** @type {string} */ name) => moment(name, { position: [0, 1.4, 0] }),
    state: () => ({ ...juice.state(), moments, lastMoment, sfx: audio.sfx.played, postfx: postfx.usingComposer }),
  });

  return { settings, materials, audio, sfx: audio.sfx, postfx, juice, moment, pop, get moments() { return moments; }, get lastMoment() { return lastMoment; } };
}
