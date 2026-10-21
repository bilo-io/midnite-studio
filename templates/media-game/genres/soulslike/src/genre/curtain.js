// @ts-check
/**
 * Full-screen text curtains: "YOU DIED" fading in over a darkening screen, "BONFIRE LIT" and
 * "ENEMY FELLED" as gold banners over the world. One DOM element driven by the juice tweens
 * (real dt), so a hit-stop or slow motion never stalls a fade, and a replay shows the same one.
 */

import { curtainLevel } from './moments.js';

/**
 * @param {ReturnType<typeof import('./fx.js').createFx>} fx
 */
export function createCurtain(fx) {
  /** @type {HTMLDivElement | null} */
  let root = null;
  /** @type {HTMLDivElement | null} */
  let label = null;
  /** @type {{ cancel: () => void } | null} */
  let running = null;
  if (typeof document !== 'undefined') {
    root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;display:flex;align-items:center;justify-content:center;opacity:0';
    label = document.createElement('div');
    label.style.cssText = 'font:700 64px/1 Georgia,"Times New Roman",serif;letter-spacing:.28em;padding-left:.28em;text-transform:uppercase;white-space:nowrap';
    root.append(label);
    document.body.append(root);
  }

  return {
    get active() {
      return running !== null;
    },
    /**
     * @param {{ text: string, color: string, veil?: number, in: number, hold: number, out: number, size?: number, onBlack?: () => void }} o
     * `veil` is how dark the screen gets behind the text (0..1); `onBlack` fires once, when the fade-in completes.
     */
    show(o) {
      if (!root || !label) {
        o.onBlack?.();
        return;
      }
      running?.cancel();
      const el = root;
      const text = label;
      text.textContent = o.text;
      text.style.color = o.color;
      text.style.fontSize = `${o.size ?? 64}px`;
      text.style.textShadow = `0 0 24px ${o.color}`;
      const calm = fx.settings.resolved().reducedMotion;
      const total = o.in + o.hold + o.out;
      let fired = false;
      running = fx.juice.tween({
        duration: total,
        onUpdate: (_v, k) => {
          const t = k * total;
          const level = curtainLevel(t, o);
          el.style.opacity = String(level);
          el.style.background = `rgba(0,0,0,${(o.veil ?? 0) * level})`;
          text.style.transform = `scale(${calm ? 1 : 1 + 0.08 * k})`;
          if (!fired && t >= o.in) {
            fired = true;
            o.onBlack?.();
          }
        },
        onComplete: () => {
          el.style.opacity = '0';
          running = null;
          if (!fired) o.onBlack?.();
        },
      });
    },
  };
}
