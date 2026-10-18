import type { CaptureRegionRect } from '@midnite/studio-shared';

/**
 * The region rectangle's arithmetic (Phase 113 Theme K), shared by the in-view picker and the desktop
 * overlay page — plain functions over numbers, no DOM and no React, so the overlay's tiny bundle carries
 * nothing else.
 */

/** Below this (as a fraction of either side) a drag is a click, not a region. */
export const MIN_REGION_FRACTION = 0.005;

export type Box = { left: number; top: number; width: number; height: number };

/** The fractional rectangle two pointer positions span inside `box`, clamped to it; null when too small. */
export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: Box,
): CaptureRegionRect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const ax = clamp((a.x - box.left) / box.width);
  const ay = clamp((a.y - box.top) / box.height);
  const bx = clamp((b.x - box.left) / box.width);
  const by = clamp((b.y - box.top) / box.height);
  const rect = {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
  if (rect.width < MIN_REGION_FRACTION || rect.height < MIN_REGION_FRACTION) return null;
  return rect;
}

/** The whole frame — what Enter with no selection takes. */
export const WHOLE_FRAME: CaptureRegionRect = { x: 0, y: 0, width: 1, height: 1 };
