import type { EngineFactories, SimEngine, SimIn, SimOut, TicksPerFrame } from './types';

/** Most whole ticks one 60 Hz interval runs; past it ticks are dropped rather than spiralling. */
export const MAX_TICKS_PER_INTERVAL = 8;
export const INTERVAL_MS = 1000 / 60;

export type SimLoopHost = {
  engines: EngineFactories;
  post(message: SimOut, transfer?: ArrayBuffer[]): void;
  /** Starts a repeating timer; returns a stop function. */
  every(fn: () => void, ms: number): () => void;
  /** Milliseconds on a monotonic clock; a late interval (a throttled timer) accumulates the time it missed. */
  now(): number;
};

/**
 * The worker's brain, free of worker globals so a test can drive it (Phase 127 Theme B.2). A fixed-timestep
 * loop: each interval accumulates `ticksPerFrame` per elapsed 1/60 s and runs whole ticks. Two buffers ping-pong with the
 * renderer — a frame is posted only while one is free, so a slow renderer never queues frames; the loop keeps
 * stepping and the next free buffer carries the latest state.
 */
export function createSimLoop(host: SimLoopHost) {
  let engine: SimEngine<never, never> | null = null;
  let playing = false;
  let stop: (() => void) | null = null;
  let ticksPerFrame: TicksPerFrame = 1;
  let acc = 0;
  let last = 0;
  let tick = 0;
  let dropped = 0;
  let dirty = false;
  let free: ArrayBuffer[] = [];
  let bufferBytes = 0;

  const flush = () => {
    if (engine === null || !dirty) return;
    const buffer = free.pop();
    if (buffer === undefined) return;
    const length = engine.snapshot(new Float32Array(buffer));
    dirty = false;
    host.post(
      { type: 'frame', tick, length, buffer, stats: { ...engine.stats(), tick, droppedTicks: dropped } },
      [buffer],
    );
  };

  const run = (n: number) => {
    if (engine === null) return;
    for (let i = 0; i < n; i++) {
      engine.step();
      tick += 1;
    }
    if (n > 0) dirty = true;
  };

  const onInterval = () => {
    const at = host.now();
    acc += (ticksPerFrame * (at - last)) / INTERVAL_MS;
    last = at;
    let n = Math.floor(acc + 1e-9);
    acc -= n;
    if (n > MAX_TICKS_PER_INTERVAL) {
      dropped += n - MAX_TICKS_PER_INTERVAL;
      n = MAX_TICKS_PER_INTERVAL;
    }
    run(n);
    flush();
  };

  const setPlaying = (value: boolean) => {
    if (value === playing) return;
    playing = value;
    if (value) {
      last = host.now();
      stop = host.every(onInterval, INTERVAL_MS);
    }
    else {
      stop?.();
      stop = null;
    }
  };

  return {
    handle(message: SimIn): void {
      switch (message.type) {
        case 'init': {
          const make = host.engines[message.kind];
          if (make === undefined) {
            host.post({ type: 'error', message: `No engine for "${message.kind}"` });
            return;
          }
          setPlaying(false);
          engine = make();
          (engine as SimEngine<unknown, unknown>).init(message.params, message.seed);
          tick = 0;
          acc = 0;
          dropped = 0;
          bufferBytes = engine.capacity * 4;
          free = [new ArrayBuffer(bufferBytes), new ArrayBuffer(bufferBytes)];
          dirty = true;
          flush();
          return;
        }
        case 'play':
          if (engine !== null) setPlaying(true);
          return;
        case 'pause':
          setPlaying(false);
          return;
        case 'step':
          if (engine === null || playing) return;
          run(1);
          flush();
          return;
        case 'speed':
          ticksPerFrame = message.ticksPerFrame;
          return;
        case 'restore':
          if (engine === null) return;
          (engine as SimEngine<unknown, unknown>).restore(message.state);
          dirty = true;
          flush();
          return;
        case 'serialise':
          if (engine !== null) host.post({ type: 'state', state: engine.serialise() });
          return;
        case 'return':
          // A buffer from before a re-init has the wrong size; drop it rather than reuse it.
          if (message.buffer.byteLength === bufferBytes && free.length < 2) {
            free.push(message.buffer);
            flush();
          }
          return;
      }
    },
    /** Test seam. */
    get state() {
      return { playing, tick, dropped, free: free.length };
    },
  };
}
