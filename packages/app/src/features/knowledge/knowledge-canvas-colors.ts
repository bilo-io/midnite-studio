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

/** Default alpha for unselected nodes at rest — subtle semitransparency so the graph breathes. */
export const DEFAULT_NODE_ALPHA = 0.65;

/** Dimmed alpha for nodes or edges not in the active focus or neighbourhood. */
export const DIMMED_ALPHA = 0.1;

/** Alpha for 1-hop neighbours of a focused node. */
export const NEIGHBOR_NODE_ALPHA = 0.85;

/**
 * Node colour state derived from active focus sets:
 * - dimmed: node is not focused and not a neighbour, while something is focused -> DIMMED_ALPHA (0.1)
 * - isFocus: node is selected, search-matched, or hovered -> 1.0 (fully opaque base colour)
 * - isNeighbor: node is a 1-hop neighbour of a focused node -> NEIGHBOR_NODE_ALPHA (0.85)
 * - otherwise (at rest / default / unselected) -> DEFAULT_NODE_ALPHA (0.65)
 */
export function nodeColorForState(
  baseRgbColor: string,
  state: { dimmed: boolean; isFocus: boolean; isNeighbor?: boolean },
): string {
  if (state.dimmed) return withAlpha(baseRgbColor, DIMMED_ALPHA);
  if (state.isFocus) return baseRgbColor;
  if (state.isNeighbor) return withAlpha(baseRgbColor, NEIGHBOR_NODE_ALPHA);
  return withAlpha(baseRgbColor, DEFAULT_NODE_ALPHA);
}

