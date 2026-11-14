/**
 * Level of detail for the 3D view (Phase 136 Theme B): a model when it is big on screen, its box when it is small,
 * nothing when it is a speck or past the draw distance. Pure.
 */
import type { OptimisationPreset } from './optimisation';

export type Lod = 'full' | 'box' | 'hidden';

/** How many pixels tall a sphere of `radius` metres at `distance` metres looks through a `fovDeg` lens on a `viewportHeight` px canvas. */
export function projectedPx(radius: number, distance: number, fovDeg: number, viewportHeight: number): number {
  if (distance <= radius) return Infinity;
  const half = Math.tan((fovDeg * Math.PI) / 360);
  return ((radius * 2) / (2 * distance * half)) * viewportHeight;
}

/**
 * The detail an item gets. `focusDistance` is how far it is from the camera's focus point (the draw distance is
 * measured there, so a far plan camera with a narrow lens still draws what is in view); `distance` is from the
 * camera itself (what the screen size depends on).
 */
export function lodFor(input: { radius: number; distance: number; focusDistance: number; fovDeg: number; viewportHeight: number }, preset: OptimisationPreset): Lod {
  if (input.focusDistance - input.radius > preset.drawDistance) return 'hidden';
  const px = projectedPx(input.radius, input.distance, input.fovDeg, input.viewportHeight);
  if (px < preset.hideBelowPx) return 'hidden';
  if (px < preset.fullAbovePx) return 'box';
  return 'full';
}

/** The fog band for a draw distance, measured from the camera: it starts at 60% and is opaque at the edge. */
export function fogRange(drawDistance: number, dollyOffset: number): { near: number; far: number } {
  return { near: dollyOffset + drawDistance * 0.6, far: dollyOffset + drawDistance };
}

/** Seconds a model must stay out of range before it is disposed (Theme F). */
export const MODEL_DISPOSE_AFTER_S = 30;
