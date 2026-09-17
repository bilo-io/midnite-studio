/**
 * Constellation's curved-edge geometry (Phase 89 Theme D) — pure math, no
 * WebGL, so the curvature and sampling are vitest-covered without a canvas.
 * `knowledge-edge-curve-program.ts` is the only consumer: it samples a
 * quadratic Bezier into a short straight-segment polyline and hands the
 * segments to sigma's ordinary `EdgeLineProgram`-style buffer layout — the
 * curve is CPU-side geometry, not a shader-level Bezier distance field, so
 * it needed no new WebGL technique to review, only more vertices per edge.
 */

/** How far the curve's control point bows off the straight line, as a fraction of edge length. */
export const CONSTELLATION_CURVATURE = 0.16;

/**
 * Straight-segment count approximating the quadratic Bezier. Six is enough
 * to read as a smooth curve at the zoom levels the graph is actually viewed
 * at, and keeps the per-edge vertex count (6 segments × 2 vertices) to 6×
 * what the straight `EdgeLineProgram` this look is not used for would need —
 * comfortably inside a 37,036-edge graph's frame budget (only Constellation
 * mounts this program; Atlas/Orbit/Clusters keep the default rectangle
 * program untouched).
 */
export const CONSTELLATION_SEGMENTS = 6;

export type Point = { x: number; y: number };

/**
 * A deterministic pseudo-random sign from the edge's own endpoints, so the
 * same edge bows the same way on every render (no per-frame flicker as the
 * camera moves) and neighbouring edges alternate sides rather than all
 * bowing identically on top of one another. Not cryptographic — a standard
 * GLSL-style hash-via-sine, reused here in plain JS since the sign is
 * needed CPU-side, before the vertex buffer is built.
 */
export function curveSign(x1: number, y1: number, x2: number, y2: number): 1 | -1 {
  const h = Math.sin(x1 * 12.9898 + y1 * 78.233 + x2 * 39.346 + y2 * 11.135) * 43758.5453;
  return h - Math.floor(h) < 0.5 ? 1 : -1;
}

/**
 * The quadratic Bezier's one control point: the segment's own midpoint,
 * offset perpendicular to it by `curvature * length`. A zero-length edge
 * (coincident endpoints — never happens in practice, but `processVisibleItem`
 * must not divide by zero) returns the midpoint itself, degenerating the
 * curve to a point.
 */
export function curveControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvature: number = CONSTELLATION_CURVATURE,
): Point {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (length === 0) return { x: mx, y: my };
  const sign = curveSign(x1, y1, x2, y2);
  const offset = curvature * length * sign;
  const nx = -dy / length;
  const ny = dx / length;
  return { x: mx + nx * offset, y: my + ny * offset };
}

/**
 * `segments + 1` points sampling the quadratic Bezier from `(x1, y1)`
 * through `control` to `(x2, y2)`, evenly spaced in `t`. `processVisibleItem`
 * turns each consecutive pair into one `GL_LINES` segment.
 */
export function sampleQuadraticBezier(
  x1: number,
  y1: number,
  control: Point,
  x2: number,
  y2: number,
  segments: number = CONSTELLATION_SEGMENTS,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * x1 + 2 * mt * t * control.x + t * t * x2;
    const y = mt * mt * y1 + 2 * mt * t * control.y + t * t * y2;
    points.push({ x, y });
  }
  return points;
}
