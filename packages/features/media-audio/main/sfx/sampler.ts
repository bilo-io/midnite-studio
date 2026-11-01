/**
 * Stable Audio Open Small's sampler, in TypeScript — the maths `stable-audio-tools` runs as
 * `sample_flow_pingpong` for a rectified-flow (`rf_denoiser`) model, so no Python is needed.
 *
 * The model predicts a velocity `v` at noise level `t` (1 = pure noise, 0 = clean). Each step takes the
 * clean estimate `den = x - t·v` and re-noises it to the next level with fresh noise:
 * `x' = (1 - t') · den + t' · ε`. The last level is 0, so the final step returns `den` itself.
 *
 * The levels are `linspace(1 → 0, steps + 1)` pushed through the model's LogSNR shift (rate 0, anchor −6.2,
 * end 2.0): `t = sigmoid(8.2·u − 2)`, with both endpoints pinned so the run starts at pure noise and ends clean.
 */

/** Noise levels for `steps` ping-pong steps: `steps + 1` values from exactly 1 down to exactly 0. */
export function pingPongSchedule(steps: number): Float64Array {
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`steps must be a positive integer, got ${steps}`);
  const out = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i += 1) {
    const u = 1 - i / steps;
    if (u >= 1) out[i] = 1;
    else if (u <= 0) out[i] = 0;
    else out[i] = 1 / (1 + Math.exp(-(8.2 * u - 2)));
  }
  return out;
}

/** mulberry32 — a small, fast, well-distributed 32-bit PRNG; the same seed always gives the same take. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded standard-normal source (Box–Muller over {@link mulberry32}). */
export function createGaussian(seed: number): (out: Float32Array) => Float32Array {
  const uniform = mulberry32(seed);
  let spare: number | null = null;
  const next = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u <= Number.EPSILON) u = uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return (out) => {
    for (let i = 0; i < out.length; i += 1) out[i] = next();
    return out;
  };
}

/** Classifier-free guidance: `uncond + (cond − uncond) · scale`, in place into `cond`'s copy. */
export function applyGuidance(cond: Float32Array, uncond: Float32Array, scale: number): Float32Array {
  if (cond.length !== uncond.length) throw new Error('guidance: conditional and unconditional outputs differ in size');
  const out = new Float32Array(cond.length);
  for (let i = 0; i < cond.length; i += 1) out[i] = uncond[i]! + (cond[i]! - uncond[i]!) * scale;
  return out;
}

export type PingPongOptions = {
  /** `x` at t = 1 (pure noise); not modified. */
  initial: Float32Array;
  schedule: Float64Array;
  /** The model's velocity at `(x, t)`. */
  velocity: (x: Float32Array, t: number) => Promise<Float32Array>;
  /** Fresh noise for the re-noise after step `i`; fills and returns `out`. */
  noise: (out: Float32Array) => Float32Array;
  onStep?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
};

/** Runs the ping-pong loop and returns the clean latent. Throws `Error('cancelled')` between steps. */
export async function samplePingPong(opts: PingPongOptions): Promise<Float32Array> {
  const { schedule } = opts;
  const steps = schedule.length - 1;
  let x = Float32Array.from(opts.initial);
  const fresh = new Float32Array(x.length);
  for (let i = 0; i < steps; i += 1) {
    if (opts.isCancelled?.()) throw new Error('cancelled');
    const t = schedule[i]!;
    const next = schedule[i + 1]!;
    const v = await opts.velocity(x, t);
    if (v.length !== x.length) throw new Error(`The model returned ${v.length} values for a ${x.length}-value latent.`);
    const out = new Float32Array(x.length);
    if (next > 0) {
      opts.noise(fresh);
      for (let j = 0; j < x.length; j += 1) out[j] = (1 - next) * (x[j]! - t * v[j]!) + next * fresh[j]!;
    } else {
      for (let j = 0; j < x.length; j += 1) out[j] = x[j]! - t * v[j]!;
    }
    x = out;
    opts.onStep?.(i + 1, steps);
  }
  return x;
}
