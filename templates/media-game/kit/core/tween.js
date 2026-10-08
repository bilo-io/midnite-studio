// @ts-check
/**
 * Midnite game kit — easing and a tiny tween manager (engine-free).
 *
 * Driven by the game's own `dt`, never by wall-clock time, so tweens replay
 * identically in a deterministic play-test. Phaser games can use `scene.tweens`
 * instead; the three.js kit uses this.
 */

/** @typedef {(t: number) => number} Ease */

/** Easing curves over t in [0, 1]. `outBack` overshoots, `outElastic` rings: good for squash and pop. */
export const EASE = /** @type {Record<string, Ease>} */ ({
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1),
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
});

/** The easing named `name`, or linear. @param {string | Ease | undefined} name */
export const easeOf = (name) => (typeof name === 'function' ? name : EASE[name ?? 'linear'] ?? EASE.linear);

/**
 * @typedef {{
 *   from?: number, to?: number, duration: number, delay?: number, ease?: string | Ease,
 *   onUpdate?: (value: number, t: number) => void, onComplete?: () => void,
 * }} TweenOptions
 */

/** A set of running tweens; call `update(dt)` once per step. */
export function createTweens() {
  /** @type {{ o: TweenOptions, age: number, dead: boolean }[]} */
  let live = [];
  return {
    get count() {
      return live.length;
    },
    /** Start a tween. Returns a handle whose `cancel()` stops it without `onComplete`. @param {TweenOptions} o */
    tween(o) {
      const entry = { o, age: -(o.delay ?? 0), dead: false };
      live.push(entry);
      return { cancel: () => { entry.dead = true; } };
    },
    /** @param {number} dt seconds */
    update(dt) {
      for (const e of live) {
        if (e.dead) continue;
        e.age += dt;
        if (e.age < 0) continue;
        const t = Math.min(1, e.age / Math.max(1e-6, e.o.duration));
        const from = e.o.from ?? 0;
        const to = e.o.to ?? 1;
        e.o.onUpdate?.(from + (to - from) * easeOf(e.o.ease)(t), t);
        if (t >= 1) {
          e.dead = true;
          e.o.onComplete?.();
        }
      }
      live = live.filter((e) => !e.dead);
    },
    clear() {
      live = [];
    },
  };
}
