import { useCallback, useEffect, useRef, useState } from 'react';

import type { SimIn, SimKind, SimOut, TicksPerFrame } from './types';

/** The slice of `Worker` the hook uses, so a test can inject a fake. */
export type SimWorkerLike = {
  postMessage(message: SimIn, transfer?: ArrayBuffer[]): void;
  terminate(): void;
  onmessage: ((event: { data: SimOut }) => void) | null;
};
export type SimWorkerFactory = () => SimWorkerLike;

/** One frame handed to a sandbox's draw callback; `data` is valid only until the callback returns. */
export type SimFrame = { tick: number; data: Float32Array; stats: Record<string, number> };

export type UseSimOptions = {
  params: unknown;
  seed: number;
  /** Draws a frame. Called on `requestAnimationFrame`; the buffer goes back to the worker right after. */
  onFrame: (frame: SimFrame) => void;
};

export type SimHandle = {
  playing: boolean;
  tick: number;
  stats: Record<string, number>;
  /** The last error the worker reported (an unregistered kind, a bad restore), else null. */
  error: string | null;
  play(): void;
  pause(): void;
  step(): void;
  /** Re-inits with the current params and seed. */
  reset(): void;
  setSpeed(ticksPerFrame: TicksPerFrame): void;
  /** Asks the worker for its state; resolves with it. */
  serialise(): Promise<unknown>;
  restore(state: unknown): void;
};

const STATS_EVERY_MS = 100;

/**
 * Builds the sim hook over a worker factory (Phase 127 Theme B.2). The worker owns the fixed-timestep loop; the
 * hook relays transport commands, draws each frame on `requestAnimationFrame`, hands the buffer straight back,
 * and pauses the worker while the window is hidden (resuming only if it was playing). Changing `kind`, or
 * calling `reset`, re-inits the engine from the current `params` and `seed`.
 */
export function createUseSim(factory: SimWorkerFactory | null) {
  return function useSim(kind: SimKind, options: UseSimOptions): SimHandle {
    const [playing, setPlaying] = useState(false);
    const [view, setView] = useState<{ tick: number; stats: Record<string, number> }>({ tick: 0, stats: {} });
    const [error, setError] = useState<string | null>(null);
    const worker = useRef<SimWorkerLike | null>(null);
    const opts = useRef(options);
    opts.current = options;
    const playingRef = useRef(false);
    const pending = useRef<Array<(state: unknown) => void>>([]);

    const post = useCallback((message: SimIn, transfer?: ArrayBuffer[]) => worker.current?.postMessage(message, transfer), []);

    const init = useCallback(() => {
      post({ type: 'init', kind, params: opts.current.params, seed: opts.current.seed });
    }, [kind, post]);

    useEffect(() => {
      if (factory === null) return;
      const w = factory();
      worker.current = w;
      let latest: { tick: number; length: number; buffer: ArrayBuffer; stats: Record<string, number> } | null = null;
      let raf: number | null = null;
      let lastStats = 0;
      const draw = () => {
        raf = null;
        const f = latest;
        if (f === null) return;
        latest = null;
        opts.current.onFrame({ tick: f.tick, data: new Float32Array(f.buffer, 0, f.length), stats: f.stats });
        w.postMessage({ type: 'return', buffer: f.buffer }, [f.buffer]);
        const now = Date.now();
        if (now - lastStats >= STATS_EVERY_MS) {
          lastStats = now;
          setView({ tick: f.tick, stats: f.stats });
        }
      };
      w.onmessage = (event) => {
        const m = event.data;
        if (m.type === 'frame') {
          // Only two buffers exist, but never sit on a stale one: send it back and draw the newer frame.
          if (latest !== null) w.postMessage({ type: 'return', buffer: latest.buffer }, [latest.buffer]);
          latest = m;
          raf ??= requestAnimationFrame(draw);
        } else if (m.type === 'state') pending.current.shift()?.(m.state);
        else setError(m.message);
      };
      setError(null);
      playingRef.current = false;
      setPlaying(false);
      init();

      let resumeOnVisible = false;
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          resumeOnVisible = playingRef.current;
          if (resumeOnVisible) w.postMessage({ type: 'pause' });
        } else if (resumeOnVisible) {
          resumeOnVisible = false;
          w.postMessage({ type: 'play' });
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        if (raf !== null) cancelAnimationFrame(raf);
        w.onmessage = null;
        w.terminate();
        worker.current = null;
      };
    }, [init]);

    return {
      playing,
      tick: view.tick,
      stats: view.stats,
      error,
      play: () => {
        playingRef.current = true;
        setPlaying(true);
        post({ type: 'play' });
      },
      pause: () => {
        playingRef.current = false;
        setPlaying(false);
        post({ type: 'pause' });
      },
      step: () => post({ type: 'step' }),
      reset: () => {
        playingRef.current = false;
        setPlaying(false);
        setError(null);
        init();
      },
      setSpeed: (ticksPerFrame) => post({ type: 'speed', ticksPerFrame }),
      serialise: () =>
        new Promise((resolve) => {
          pending.current.push(resolve);
          post({ type: 'serialise' });
        }),
      restore: (state) => post({ type: 'restore', state }),
    };
  };
}
