// @ts-check
/**
 * Midnite game kit — floating damage numbers for three.js games.
 *
 * A DOM overlay like the HUD: each number is an element positioned by
 * projecting its world point through the camera every step, rising and fading
 * over `lifeSeconds`. Numbers behind the camera are hidden. Shared by the 3D
 * genre starters (shooter hits, soulslike blows).
 */

import * as THREE from 'three';

const STYLE = `
.midnite-dmg { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.midnite-dmg span { position: absolute; transform: translate(-50%, -50%); font: 800 16px/1 ui-monospace, Menlo, monospace; color: #ffe08a; text-shadow: 0 1px 2px #000c, 0 0 6px #000a; white-space: nowrap; }
.midnite-dmg span.crit { color: #ff6b6b; font-size: 20px; }
.midnite-dmg span.heal { color: #6ee7a8; }
`;

/**
 * @param {{ camera: THREE.Camera, parent?: HTMLElement, lifeSeconds?: number, riseMetres?: number }} options
 */
export function createDamageNumbers(options) {
  if (!document.getElementById('midnite-dmg-style')) {
    const style = document.createElement('style');
    style.id = 'midnite-dmg-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = 'midnite-dmg';
  (options.parent ?? document.body).append(root);
  const life = options.lifeSeconds ?? 0.9;
  const rise = options.riseMetres ?? 1.2;
  const v = new THREE.Vector3();
  /** @type {{ el: HTMLSpanElement, at: [number, number, number], age: number }[]} */
  const live = [];

  return {
    root,
    /** How many numbers are on screen (for `getState`). */
    get count() {
      return live.length;
    },
    /**
     * @param {readonly number[]} position world `[x, y, z]`
     * @param {number | string} amount
     * @param {{ kind?: 'hit' | 'crit' | 'heal' }} [opts]
     */
    spawn(position, amount, opts = {}) {
      const el = document.createElement('span');
      el.textContent = String(amount);
      if (opts.kind && opts.kind !== 'hit') el.className = opts.kind;
      root.append(el);
      // A little horizontal jitter so a burst does not stack into one number.
      const jitter = ((live.length % 5) - 2) * 0.12;
      live.push({ el, at: [(position[0] ?? 0) + jitter, position[1] ?? 0, position[2] ?? 0], age: 0 });
    },
    /** Advance and re-project; call once per step after the camera has moved. */
    update(/** @type {number} */ dt) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const n = /** @type {(typeof live)[number]} */ (live[i]);
        n.age += dt;
        if (n.age >= life) {
          n.el.remove();
          live.splice(i, 1);
          continue;
        }
        v.set(n.at[0], n.at[1] + (rise * n.age) / life, n.at[2]).project(options.camera);
        const visible = v.z < 1 && v.z > -1;
        n.el.style.display = visible ? 'block' : 'none';
        n.el.style.left = `${((v.x + 1) / 2) * w}px`;
        n.el.style.top = `${((1 - v.y) / 2) * h}px`;
        n.el.style.opacity = String(1 - n.age / life);
      }
    },
    dispose() {
      root.remove();
      live.length = 0;
    },
  };
}
