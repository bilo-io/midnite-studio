/** Screen-space marquee selection for the 3D view (Phase 137 Theme D): pure, no three. */

export type MarqueeItem = { id: number; centre: [number, number, number] };
export type ScreenPoint = { x: number; y: number; inFront: boolean };
export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };

/** The ids of items whose projected centre is in front of the camera and inside `rect` (corners in any order). */
export function marqueeHits(items: readonly MarqueeItem[], project: (p: [number, number, number]) => ScreenPoint, rect: ScreenRect): number[] {
  const minX = Math.min(rect.x0, rect.x1), maxX = Math.max(rect.x0, rect.x1);
  const minY = Math.min(rect.y0, rect.y1), maxY = Math.max(rect.y0, rect.y1);
  const hits: number[] = [];
  for (const it of items) {
    const p = project(it.centre);
    if (p.inFront && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) hits.push(it.id);
  }
  return hits;
}
