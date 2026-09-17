/**
 * The "expand from a core" intro (Phase 89 Theme B): on first paint of a
 * payload, every node bursts from the graph's centroid out to its laid-out
 * `{x, y}` — hubs first, leaves trailing — while edges fade in behind them.
 * A position-channel tween beside `knowledge-bounce.ts`'s `PulseTracker`,
 * same pure shape (clock injected, `start`/`sample`/`clear`, an `animating`
 * flag that keeps the caller's rAF loop alive only while the burst is in
 * flight) — but tweening `{x, y}` instead of `size`, which is why it cannot
 * be `PulseTracker` itself: see the re-indexation note in `use-sigma-graph.ts`
 * next to where this is driven.
 */

export type IntroPoint = { x: number; y: number };

/** What the caller hands in per node — `degree` only orders the stagger, it is never stored. */
export type IntroNodeSpec = {
  id: string;
  to: IntroPoint;
  degree: number;
};

type IntroTween = {
  /** Absolute clock time this node's OWN tween begins — `start(now)` + its stagger delay. */
  startedAt: number;
  durationMs: number;
  from: IntroPoint;
  to: IntroPoint;
};

export type IntroSample = {
  /** Current `{x, y}` for every node still mid-tween this frame. */
  positions: ReadonlyMap<string, IntroPoint>;
  /** 0 at `start()`, 1 once the whole staggered burst (not just one node) has landed — drives the edges' fade-in. */
  progress: number;
  /** True while at least one node is still mid-tween — keeps the frame loop alive. */
  animating: boolean;
};

/** Ease-out cubic — no overshoot: a burst that overshot past its target position would read as jitter, not motion. */
function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function lerpPoint(from: IntroPoint, to: IntroPoint, eased: number): IntroPoint {
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

/**
 * Tracks one position tween per node id, all sharing a single origin and
 * started together but staggered by degree — the highest-degree node's tween
 * begins at `now`, the lowest-degree one begins up to `staggerMs` later, so
 * the shape of the graph (its hubs) resolves before its leaves arrive.
 *
 * Unlike `PulseTracker`, a burst never restarts mid-flight from wherever it
 * happens to be — `start()` always begins a fresh burst from `origin`, which
 * is correct for its one caller: a payload change, never a hover or a click.
 */
export class IntroTracker {
  private tweens = new Map<string, IntroTween>();
  private startedAt = 0;
  private totalDurationMs = 0;
  private live = false;

  /**
   * Begins a burst from `origin` to each node's `to`. Sorted by degree
   * descending (ties broken by id, so the order — and therefore the visible
   * shape of the burst — is deterministic and test-covered). `opts.durationMs`
   * is how long any ONE node's tween takes; `opts.staggerMs` is how far the
   * last node's start lags the first's, so the whole burst takes
   * `staggerMs + durationMs` end to end.
   */
  start(
    nodes: readonly IntroNodeSpec[],
    now: number,
    origin: IntroPoint,
    opts: { durationMs: number; staggerMs: number },
  ): void {
    this.tweens.clear();
    this.startedAt = now;
    this.totalDurationMs = opts.staggerMs + opts.durationMs;
    this.live = nodes.length > 0 && opts.durationMs > 0;
    if (!this.live) return;

    const sorted = [...nodes].sort(
      (a, b) => b.degree - a.degree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const lastIndex = Math.max(1, sorted.length - 1);
    for (const [index, node] of sorted.entries()) {
      const delay = opts.staggerMs <= 0 ? 0 : (index / lastIndex) * opts.staggerMs;
      this.tweens.set(node.id, {
        startedAt: now + delay,
        durationMs: opts.durationMs,
        from: origin,
        to: node.to,
      });
    }
  }

  /**
   * Every node touched this frame — mid-tween, still waiting out its stagger
   * delay, or landing exactly now — plus the burst's overall progress. A
   * node that crosses `t=1` this sample reports its exact `to` ONE last time
   * and is then dropped from tracking, exactly `PulseTracker.sample`'s
   * `finished` precedent: the caller must write that final position before
   * the id stops appearing, or it is left frozen a fraction short of its
   * target forever (nothing else in this class ever touches it again).
   */
  sample(now: number): IntroSample {
    if (!this.live) return { positions: new Map(), progress: 1, animating: false };

    const positions = new Map<string, IntroPoint>();
    for (const [id, tween] of this.tweens) {
      const t = (now - tween.startedAt) / tween.durationMs;
      if (t >= 1) {
        positions.set(id, tween.to);
        this.tweens.delete(id);
        continue;
      }
      // Not started yet (still in its stagger delay) — hold at the origin so it doesn't pop in early.
      positions.set(id, t < 0 ? tween.from : lerpPoint(tween.from, tween.to, easeOutCubic(t)));
    }

    const progress =
      this.totalDurationMs <= 0
        ? 1
        : Math.min(1, Math.max(0, (now - this.startedAt) / this.totalDurationMs));
    const animating = this.tweens.size > 0;
    this.live = animating;
    return { positions, progress, animating };
  }

  /** Drops every in-flight tween — a graph rebuild has invalidated every id, or the burst should not resume after a repo switch mid-flight. */
  clear(): void {
    this.tweens.clear();
    this.live = false;
    this.totalDurationMs = 0;
  }

  get animating(): boolean {
    return this.live;
  }
}

/** The graph's centroid over its laid-out positions — the burst origin. The ForceAtlas2 output is not centred on `{0, 0}`; bursting from the wrong point reads as a slide, not an expansion. Falls back to `{0, 0}` only when there is nothing to average (an empty graph). */
export function computeCentroid(positions: Readonly<Record<string, IntroPoint>>): IntroPoint {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const key in positions) {
    const point = positions[key];
    if (!point) continue;
    sumX += point.x;
    sumY += point.y;
    count++;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: sumX / count, y: sumY / count };
}

/** The tuned intro timing, in one place so the hook reads as intent. */
export const INTRO_TIMING = {
  /** How long any one node's own burst takes. */
  nodeDurationMs: 700,
  /** How far the lowest-degree node's start lags the highest-degree node's — the hubs-first stagger. */
  staggerMs: 550,
  /** How long, from intro start, the edges take to fade from invisible to their resting alpha — driven independently of the node stagger above, at the call site (`elapsedMs / edgeFadeMs`, fed into `introEdgeAlphaMultiplier`). */
  edgeFadeMs: 900,
} as const;

/**
 * A single scalar (0 at the burst's start, 1 once every edge should be at
 * full alpha) that scales edge alpha during the intro — the phase doc's "edges
 * fade in behind the nodes rather than stretching from the centroid": tweening
 * 37,036 edges' endpoints individually is the expensive half of this feature
 * and reads worse than the nodes just resolving in front of a still-forming
 * edge set. One multiplier for every edge, not a per-edge tween. `t` is
 * elapsed-since-intro-start ÷ `INTRO_TIMING.edgeFadeMs`; the caller owns that
 * division (and the clamp — this clamps too, defensively) so this function
 * stays a plain, table-driven 0..1 curve with nothing else to inject.
 */
export function introEdgeAlphaMultiplier(t: number): number {
  return easeOutCubic(t);
}
