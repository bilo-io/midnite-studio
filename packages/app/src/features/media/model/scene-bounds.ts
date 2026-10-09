import type { MeshPart } from '@midnite/studio-shared';

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

/** World bounds of the solid meshes whose source part is in `only` (all of them when omitted). */
export function boundsOf(parts: readonly MeshPart[], only?: ReadonlySet<number>): Bounds | null {
  const min: Bounds['min'] = [Infinity, Infinity, Infinity];
  const max: Bounds['max'] = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    if (part.role !== 'solid') continue;
    if (only && !only.has(part.sourceIndex)) continue;
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const v = part.positions[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

export const sizeOf = (b: Bounds): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
export const centreOf = (b: Bounds): [number, number, number] => [(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2];

/** `1.25 × 0.8 × 2` — metres to two decimals. */
export const formatSize = (size: readonly number[]): string => size.map((n) => (Math.round(n * 100) / 100).toString()).join(' × ');

export const distanceBetween = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export type CameraView = 'perspective' | 'front' | 'side' | 'top';

/** Where each orthographic view looks from (a unit vector from the model towards the camera). */
export const VIEW_DIRECTIONS: Record<Exclude<CameraView, 'perspective'>, [number, number, number]> = {
  front: [0, 0, 1],
  side: [1, 0, 0],
  // Not exactly +Y: OrbitControls' polar limit makes a dead-on top view degenerate.
  top: [0, 1, 0.0001],
};

/** Orthographic zoom (pixels per unit) that fits `extent` (the two screen-facing sizes) in a viewport with margin. */
export function orthoZoom(extent: readonly [number, number], viewport: { width: number; height: number }): number {
  const fit = Math.min(viewport.width / Math.max(extent[0], 1e-3), viewport.height / Math.max(extent[1], 1e-3));
  return fit / 1.3;
}

/** Which two model axes face the camera in an orthographic view, as [horizontal, vertical]. */
export const VIEW_PLANE: Record<Exclude<CameraView, 'perspective'>, [number, number]> = { front: [0, 1], side: [2, 1], top: [0, 2] };
