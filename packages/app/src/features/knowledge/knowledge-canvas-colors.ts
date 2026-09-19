/**
 * `rgb(r, g, b)` (what `communityColor` produces — see its own docblock for
 * why not `hsl()`) with an alpha channel blended in — sigma/WebGL takes a
 * plain colour string per node/edge per frame, so "dim everything but the
 * selection" is a colour swap in the reducer, not a CSS class.
 *
 * The channels come back PREMULTIPLIED — `rgba(r·a, g·a, b·a, a)` — because
 * that is what sigma's blend mode expects. sigma 3 draws every layer with
 * `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)` and packs the colour string's
 * channels straight into the vertex buffer, so a *straight* `rgba(r, g, b,
 * 0.1)` lands as `out = rgb + 0.9·dst`: on the dark theme that is the node
 * at full brightness (no dimming at all — the bug the first version of this
 * file shipped with, invisible on a light canvas only because there it
 * washes out towards white instead), and on the light theme a bleached
 * ghost. Premultiplying gives `out = a·rgb + (1−a)·dst`, the ordinary
 * "this much of the colour over whatever is behind it" on either theme.
 */
export function withAlpha(rgbColor: string, alpha: number): string {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgbColor);
  if (!match) return rgbColor;
  const a = Math.min(1, Math.max(0, alpha));
  const [, r, g, b] = match;
  const pre = (channel: string) => Math.round(Number(channel) * a);
  return `rgba(${pre(r!)}, ${pre(g!)}, ${pre(b!)}, ${a})`;
}

/** Edge alpha from weight (Theme D) — a floor so a zero-weight edge is still faintly visible, not invisible. */
export function alphaForWeight(weight: number, min = 0.15, max = 0.8): number {
  const clamped = Math.min(1, Math.max(0, weight));
  return min + clamped * (max - min);
}

/**
 * Default alpha for unselected nodes at rest (Phase 89 Theme C retune) —
 * subtle semitransparency so the graph breathes. Lowered from the Theme A/D
 * value of 0.65 toward the "marvel-graphs" read: a graph with nothing
 * focused should already look composed — edges and hubs standing forward of
 * a quieter mass of leaves — not uniformly lit at three-quarter strength.
 * Landed with the before/after pair in this PR's description rather than an
 * assertion that it looks better, per the phase doc.
 */
export const DEFAULT_NODE_ALPHA = 0.5;

/** Dimmed alpha for nodes or edges not in the active focus or neighbourhood. */
export const DIMMED_ALPHA = 0.1;

/** Alpha for 1-hop neighbours of a focused node. */
export const NEIGHBOR_NODE_ALPHA = 0.85;

/**
 * The plain alpha SCALAR for a paint state — pulled out of `nodeColorForState`
 * (Theme C) so `AlphaRampTracker` can interpolate the number and premultiply
 * only once, at the end, rather than being handed an already-premultiplied
 * `rgba()` string with no channel left to lerp.
 */
export function targetAlphaForState(state: {
  dimmed: boolean;
  isFocus: boolean;
  isNeighbor?: boolean;
}): number {
  if (state.dimmed) return DIMMED_ALPHA;
  if (state.isFocus) return 1;
  if (state.isNeighbor) return NEIGHBOR_NODE_ALPHA;
  return DEFAULT_NODE_ALPHA;
}

/**
 * Node colour state derived from active focus sets:
 * - dimmed: node is not focused and not a neighbour, while something is focused -> DIMMED_ALPHA (0.1)
 * - isFocus: node is selected, search-matched, or hovered -> 1.0 (fully opaque base colour)
 * - isNeighbor: node is a 1-hop neighbour of a focused node -> NEIGHBOR_NODE_ALPHA (0.85)
 * - otherwise (at rest / default / unselected) -> DEFAULT_NODE_ALPHA
 *
 * A one-shot lookup with no ramp — `AlphaRampTracker` below is what the
 * canvas reducer actually calls per frame; this stays for callers (and
 * tests) that want the state's steady-state colour with no animation.
 */
export function nodeColorForState(
  baseRgbColor: string,
  state: { dimmed: boolean; isFocus: boolean; isNeighbor?: boolean },
): string {
  const alpha = targetAlphaForState(state);
  return alpha >= 1 ? baseRgbColor : withAlpha(baseRgbColor, alpha);
}

/** Ease-out cubic — same curve `knowledge-intro.ts` uses for its position tween, so a colour ramp and a position burst read as the same house motion. */
function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function lerp(from: number, to: number, eased: number): number {
  return from + (to - from) * eased;
}

/** How long an alpha ramp takes end to end — short enough to read as a reaction, not a wait, matching the hover pulses' own scale (`knowledge-bounce.ts`'s `PULSES`). */
export const ALPHA_RAMP_MS = 260;

const ALPHA_EPSILON = 0.0015;

/**
 * Tracks a chasing alpha value per item id — the "ramps rather than snaps"
 * half of Theme C. Same shape as `PulseTracker`
 * (`knowledge-bounce.ts`): a tween keyed by id, started fresh from wherever
 * the id currently sits whenever its TARGET changes, so a fast
 * focus/unfocus flicker never jumps. Unlike `PulseTracker`'s single fixed
 * "resting" value of `1`, every caller here has its own identity value (a
 * node's `DEFAULT_NODE_ALPHA`, an edge's own weight-derived rest alpha) —
 * `restValue` is that identity, passed in per call, and is what lets a
 * finished ramp back at rest drop its bookkeeping instead of holding an
 * entry per node forever.
 *
 * `valueFor` both READS the current value and (as a side effect) advances
 * the id's tween — it is meant to be called from inside the sigma node/edge
 * reducer itself, once per item per `refresh()`, so it always sees a fresh
 * `now` and never needs a separate `sample()` pass over the whole graph.
 */
export class AlphaRampTracker {
  private readonly tweens = new Map<
    string,
    { startedAt: number; durationMs: number; from: number; to: number }
  >();
  private readonly resting = new Map<string, number>();

  valueFor(
    id: string,
    target: number,
    restValue: number,
    now: number,
    durationMs: number = ALPHA_RAMP_MS,
  ): number {
    // `paused` (Phase 84) and `prefers-reduced-motion` (Phase 46) call with
    // `durationMs: 0` — land on `target` THIS call, not next, and drop any
    // tween already in flight rather than let it finish over stale time.
    if (durationMs <= 0) {
      this.tweens.delete(id);
      this.settle(id, target, restValue);
      return target;
    }

    const tween = this.tweens.get(id);
    if (tween) {
      const t = tween.durationMs <= 0 ? 1 : (now - tween.startedAt) / tween.durationMs;
      if (t >= 1) {
        this.tweens.delete(id);
        this.settle(id, target, restValue);
        return target;
      }
      if (tween.to !== target) {
        // The target moved again before the previous ramp landed — retarget
        // from wherever it currently is, never from the old tween's `from`.
        const current = lerp(tween.from, tween.to, easeOutCubic(t));
        this.tweens.set(id, { startedAt: now, durationMs, from: current, to: target });
        return current;
      }
      return lerp(tween.from, tween.to, easeOutCubic(t));
    }

    const current = this.resting.get(id) ?? restValue;
    if (Math.abs(current - target) < ALPHA_EPSILON) {
      this.settle(id, target, restValue);
      return target;
    }
    this.tweens.set(id, { startedAt: now, durationMs, from: current, to: target });
    return current;
  }

  /** Records where an id landed. Dropped entirely once it lands back at its own identity value — an id nothing has ever touched needs no entry, so this keeps the map bounded by "currently different from rest," not by graph size. */
  private settle(id: string, target: number, restValue: number): void {
    if (Math.abs(target - restValue) < ALPHA_EPSILON) this.resting.delete(id);
    else this.resting.set(id, target);
  }

  /** Every id whose ramp is still in flight this frame — what the caller repaints. */
  activeIds(): IterableIterator<string> {
    return this.tweens.keys();
  }

  get animating(): boolean {
    return this.tweens.size > 0;
  }

  /** Drops every tween and resting value — a graph rebuild has invalidated every id. */
  clear(): void {
    this.tweens.clear();
    this.resting.clear();
  }
}

