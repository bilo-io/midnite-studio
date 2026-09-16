/**
 * `rgb(r, g, b)` (what `communityColor` produces — see its own docblock for
 * why not `hsl()`) with an alpha channel blended in — sigma/WebGL takes a
 * plain colour string per node/edge per frame, so "dim everything but the
 * search match" (Theme E) is a colour swap in the reducer, not a CSS class.
 */
export function withAlpha(rgbColor: string, alpha: number): string {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgbColor);
  if (!match) return rgbColor;
  const [, r, g, b] = match;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Edge alpha from weight (Theme D) — a floor so a zero-weight edge is still faintly visible, not invisible. */
export function alphaForWeight(weight: number, min = 0.15, max = 0.8): number {
  const clamped = Math.min(1, Math.max(0, weight));
  return min + clamped * (max - min);
}
