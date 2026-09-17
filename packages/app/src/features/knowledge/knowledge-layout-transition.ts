/**
 * A layout switch's own position tween (Phase 89 Theme E) — every node
 * eases together from wherever it currently sits to its newly requested
 * layout's coordinates, over one fixed duration, no stagger. Same
 * clock-injected `start`/`sample`/`clear`/`animating` shape as
 * `knowledge-bounce.ts`'s `PulseTracker` and (once #436 lands)
 * `knowledge-intro.ts`'s `IntroTracker` — this is deliberately its OWN small
 * class rather than a reach into either: `IntroTracker` tweens every node
 * from a SINGLE shared origin (the burst's whole point), where a layout
 * switch tweens each node from its OWN current position, a different shape
 * `IntroTracker.start()` doesn't accept. If Theme B's `knowledge-intro.ts`
 * grows a per-node `from` before this lands, this class is the seam to
 * retire in favour of it — nothing outside `use-sigma-graph.tsx` depends on
 * this file's name.
 */

export type LayoutPoint = { x: number; y: number };

export type LayoutTransitionSample = {
  /** Every node's position this frame — all of them, every sample, since every node moves together (no stagger to filter down to a subset). */
  positions: ReadonlyMap<string, LayoutPoint>;
  /** True while the tween is still in flight — keeps the caller's rAF loop alive. */
  animating: boolean;
};

/** Ease-in-out cubic — a layout switch is a re-settle, not an arrival; symmetric easing reads as "the graph reorganised itself," not a launch. */
function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function lerpPoint(from: LayoutPoint, to: LayoutPoint, eased: number): LayoutPoint {
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

export class LayoutTransition {
  private from = new Map<string, LayoutPoint>();
  private to = new Map<string, LayoutPoint>();
  private startedAt = 0;
  private durationMs = 0;
  private live = false;

  /**
   * Begins a tween from `from` (typically the renderer's own current
   * positions) to `to` (the newly fetched layout). A node present in `to`
   * but missing from `from` (should not happen — same node set, a different
   * layout of it) tweens from its own target, i.e. does not move, rather
   * than throwing.
   */
  start(
    from: ReadonlyMap<string, LayoutPoint>,
    to: Readonly<Record<string, LayoutPoint>>,
    now: number,
    durationMs: number,
  ): void {
    this.from = new Map(from);
    this.to = new Map(Object.entries(to));
    this.startedAt = now;
    this.durationMs = durationMs;
    this.live = this.to.size > 0 && durationMs > 0;
  }

  /**
   * Every node's position this frame, plus whether the tween is still in
   * flight. Once `t >= 1` the tween reports its exact targets one last time
   * (matching `PulseTracker`/`IntroTracker`'s own "final sample lands
   * exactly, then stops" contract) and then `animating: false` forever after,
   * until the next `start()`.
   */
  sample(now: number): LayoutTransitionSample {
    if (!this.live) return { positions: new Map(), animating: false };

    const t = (now - this.startedAt) / this.durationMs;
    if (t >= 1) {
      this.live = false;
      return { positions: this.to, animating: false };
    }

    const eased = easeInOutCubic(t);
    const positions = new Map<string, LayoutPoint>();
    for (const [id, target] of this.to) {
      const start = this.from.get(id) ?? target;
      positions.set(id, lerpPoint(start, target, eased));
    }
    return { positions, animating: true };
  }

  /** Drops the in-flight tween — a graph rebuild has invalidated every id, or a repo switch shouldn't resume it. */
  clear(): void {
    this.live = false;
    this.from = new Map();
    this.to = new Map();
  }

  get animating(): boolean {
    return this.live;
  }
}
