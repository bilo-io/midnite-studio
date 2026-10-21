// @ts-check
/**
 * Midnite game kit — a fixed-timestep clock (engine-free).
 *
 * Game logic advances in whole `stepMs` steps however uneven the real frame
 * times are, so physics and play-tests behave the same at 30 or 144 fps.
 * `pause()` stops real time from advancing it; `step(n)` advances exactly n
 * steps while paused — what `window.__midnite.step(n)` drives.
 */

/**
 * @param {{ stepMs?: number, maxStepsPerFrame?: number }} [options]
 */
export function createClock(options = {}) {
  const stepMs = options.stepMs ?? 1000 / 60;
  const maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
  let accumulator = 0;
  let frame = 0;
  let time = 0;
  let paused = false;

  return {
    stepMs,
    /** Steps taken since start. */
    get frame() {
      return frame;
    },
    /** Game time in ms: `frame × stepMs`. */
    get time() {
      return time;
    },
    get paused() {
      return paused;
    },
    pause() {
      paused = true;
      accumulator = 0;
    },
    resume() {
      paused = false;
    },
    /**
     * Feed real elapsed time; returns how many fixed steps to run now. A long
     * stall (a background tab) is capped at `maxStepsPerFrame` rather than
     * replayed as a burst.
     * @param {number} elapsedMs
     */
    advance(elapsedMs) {
      if (paused || !(elapsedMs > 0)) return 0;
      accumulator += elapsedMs;
      let steps = Math.floor(accumulator / stepMs);
      accumulator -= steps * stepMs;
      if (steps > maxStepsPerFrame) {
        steps = maxStepsPerFrame;
        accumulator = 0;
      }
      frame += steps;
      time = frame * stepMs;
      return steps;
    },
    /**
     * Advance exactly `n` steps regardless of pause (the debug hook's `step`).
     * @param {number} n
     */
    step(n = 1) {
      const steps = Math.max(0, Math.floor(n));
      frame += steps;
      time = frame * stepMs;
      return steps;
    },
    /** Leftover fraction of a step, for render interpolation. */
    alpha() {
      return accumulator / stepMs;
    },
  };
}

/**
 * The three.js kit's fixed-timestep accumulator: feed it real frame time and
 * it says how many `1/hz` steps to simulate, plus `alpha`, the leftover
 * fraction of a step to interpolate rendering by. At most `maxSteps` per frame
 * (a stall drops the excess rather than spiralling), so `advance(1000)` at
 * 60 Hz is 5 steps, not 60.
 * @param {number} [hz]
 * @param {number} [maxSteps]
 */
export function createFixedStep(hz = 60, maxSteps = 5) {
  const stepMs = 1000 / hz;
  let accumulator = 0;
  return {
    stepMs,
    /** Seconds per step — what physics and game logic integrate with. */
    dt: 1 / hz,
    get alpha() {
      return accumulator / stepMs;
    },
    /**
     * @param {number} dtMs real elapsed time since the last frame
     * @returns {{ steps: number, alpha: number }}
     */
    advance(dtMs) {
      if (dtMs > 0) accumulator += dtMs;
      // Rounding guard: 3 × 16.666… must count as 3 steps, not 2 and a sliver.
      let steps = Math.floor(accumulator / stepMs + 1e-9);
      accumulator = Math.max(0, accumulator - steps * stepMs);
      if (accumulator < 1e-6) accumulator = 0;
      if (steps > maxSteps) {
        steps = maxSteps;
        accumulator = 0;
      }
      return { steps, alpha: accumulator / stepMs };
    },
    reset() {
      accumulator = 0;
    },
  };
}
