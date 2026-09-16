/**
 * The subtle bounce a node or edge gives when the pointer lands on it or
 * clicks it — a size tween that overshoots and settles, sampled per frame by
 * `use-sigma-graph.ts` and pushed to sigma through a partial refresh of just
 * the items in flight. Pure: the clock is injected, so the curve and the
 * bookkeeping are vitest-covered with no rAF involved.
 */

/** Ease-out with a single overshoot — the "bounce". `t` in 0..1; overshoots past 1 around t≈0.4 and settles at 1. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + overshoot * u * u;
}

/**
 * Scale factor at progress `t`: starts at `from`, bounces past `to` and lands
 * on `to`. `peak` sets how far past — 1 is no overshoot at all.
 */
export function bounceScale(t: number, from: number, to: number, overshoot = 1.70158): number {
  const clamped = Math.min(1, Math.max(0, t));
  return from + (to - from) * easeOutBack(clamped, overshoot);
}

export type Pulse = {
  startedAt: number;
  durationMs: number;
  from: number;
  to: number;
  overshoot: number;
};

export type PulseSample = {
  /** Current scale per item still animating or resting away from 1. */
  scales: Map<string, number>;
  /** Ids whose tween finished this sample and rest at exactly 1 — the caller repaints them one last time, then forgets them. */
  finished: string[];
  /** True while at least one tween is mid-flight — keep the frame loop alive. */
  animating: boolean;
};

/**
 * Tracks one tween per item id. Starting a new pulse on an item already in
 * flight begins from its CURRENT scale, so a fast hover-in/hover-out never
 * snaps. An item whose tween lands on `1` is dropped on the next sample; one
 * landing elsewhere (a hovered node resting at 1.2×) stays in `scales` until
 * a later pulse brings it home.
 */
export class PulseTracker {
  private readonly pulses = new Map<string, Pulse>();
  private readonly resting = new Map<string, number>();

  start(id: string, now: number, opts: { to: number; durationMs: number; overshoot?: number }): void {
    const from = this.currentScale(id, now);
    this.resting.delete(id);
    this.pulses.set(id, {
      startedAt: now,
      durationMs: opts.durationMs,
      from,
      to: opts.to,
      overshoot: opts.overshoot ?? 1.70158,
    });
  }

  /** Where `id` is right now — mid-tween, resting, or 1 when untouched. */
  currentScale(id: string, now: number): number {
    const pulse = this.pulses.get(id);
    if (pulse) {
      const t = pulse.durationMs <= 0 ? 1 : (now - pulse.startedAt) / pulse.durationMs;
      return bounceScale(t, pulse.from, pulse.to, pulse.overshoot);
    }
    return this.resting.get(id) ?? 1;
  }

  /** Every id with a scale other than 1 — the ones the reducer must multiply. */
  sample(now: number): PulseSample {
    const scales = new Map<string, number>(this.resting);
    const finished: string[] = [];
    for (const [id, pulse] of this.pulses) {
      const t = pulse.durationMs <= 0 ? 1 : (now - pulse.startedAt) / pulse.durationMs;
      if (t >= 1) {
        this.pulses.delete(id);
        if (pulse.to === 1) {
          finished.push(id);
          scales.delete(id);
        } else {
          this.resting.set(id, pulse.to);
          scales.set(id, pulse.to);
        }
        continue;
      }
      scales.set(id, bounceScale(t, pulse.from, pulse.to, pulse.overshoot));
    }
    return { scales, finished, animating: this.pulses.size > 0 };
  }

  /** Drop everything — a graph rebuild has invalidated every id. */
  clear(): void {
    this.pulses.clear();
    this.resting.clear();
  }

  get size(): number {
    return this.pulses.size + this.resting.size;
  }
}

/** The tuned pulses, in one place so the hook reads as intent. Durations short enough to feel like a reaction, not an animation. */
export const PULSES = {
  nodeHoverIn: { to: 1.25, durationMs: 320, overshoot: 2.6 },
  nodeHoverOut: { to: 1, durationMs: 260, overshoot: 1.2 },
  nodeClick: { to: 1.25, durationMs: 420, overshoot: 4 },
  edgeHoverIn: { to: 1.9, durationMs: 300, overshoot: 2.4 },
  edgeHoverOut: { to: 1, durationMs: 240, overshoot: 1.2 },
  edgeClick: { to: 1.9, durationMs: 400, overshoot: 3.5 },
} as const;
