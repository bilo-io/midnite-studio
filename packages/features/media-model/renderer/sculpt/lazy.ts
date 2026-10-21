/**
 * Lazy mouse (Phase 104 Theme D): the brush trails the pointer on a string of `radius` pixels, so a shaky
 * hand draws a smooth line. The brush only moves once the pointer pulls the string taut, and then by
 * exactly the slack — a pure function of the previous brush point and the raw pointer.
 */
export type Point2 = [number, number];

export function lazyFollow(brush: Point2, pointer: Point2, radius: number): Point2 {
  if (radius <= 0) return pointer;
  const dx = pointer[0] - brush[0];
  const dy = pointer[1] - brush[1];
  const d = Math.hypot(dx, dy);
  if (d <= radius) return brush;
  const k = (d - radius) / d;
  return [brush[0] + dx * k, brush[1] + dy * k];
}

/** Pressure from a pointer event: a pen's reading, else full (a mouse reports 0.5 while pressed). */
export const pointerPressure = (event: { pointerType: string; pressure: number }): number =>
  event.pointerType === 'pen' && event.pressure > 0 ? Math.min(1, event.pressure) : 1;
