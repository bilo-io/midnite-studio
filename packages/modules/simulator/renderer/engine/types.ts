/** The sandboxes the worker can run (Phase 127 Theme B.2). */
export type SimKind = 'life' | 'elementary' | 'nbody' | 'boids' | 'predprey';

/** Ticks advanced per 60 Hz interval; below 1 means a tick every 1 / n intervals. */
export type TicksPerFrame = 0.25 | 0.5 | 1 | 2 | 4;
export const SPEEDS: readonly TicksPerFrame[] = [0.25, 0.5, 1, 2, 4];

/**
 * What every sandbox implements (Phase 127 Theme B.1). Deterministic: the same `seed` and `params` always
 * play out the same way, because every random draw goes through `mulberry32`.
 */
export interface SimEngine<P = unknown, S = unknown> {
  /** The most floats `snapshot` can write for the current params; the worker sizes its two buffers from it. */
  readonly capacity: number;
  init(params: P, seed: number): void;
  /** Advances exactly one fixed tick (each engine owns its `dt`). */
  step(): void;
  /** Writes render data into `out` and returns the floats written. */
  snapshot(out: Float32Array): number;
  stats(): Record<string, number>;
  serialise(): S;
  restore(state: S): void;
}

/** Messages into the worker. */
export type SimIn =
  | { type: 'init'; kind: SimKind; params: unknown; seed: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'speed'; ticksPerFrame: TicksPerFrame }
  | { type: 'restore'; state: unknown }
  | { type: 'serialise' }
  | { type: 'return'; buffer: ArrayBuffer };

/** Messages out of the worker. A frame's `buffer` is transferred, and goes back with `return`. */
export type SimOut =
  | { type: 'frame'; tick: number; length: number; buffer: ArrayBuffer; stats: Record<string, number> }
  | { type: 'state'; state: unknown }
  | { type: 'error'; message: string };

/** An engine as the worker holds it: params and state are checked by the engine itself (method bivariance). */
export type AnySimEngine = SimEngine<never, unknown>;
export type EngineFactories = Partial<Record<SimKind, () => AnySimEngine>>;
