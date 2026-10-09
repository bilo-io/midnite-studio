/** Snapping maths for the editor: grid steps for moving, angle steps for rotating, steps for scaling. */
export const GRID_STEPS = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1] as const;
export const ANGLE_STEPS = [0, 1, 5, 15, 45, 90] as const;
export const SCALE_STEPS = [0, 0.01, 0.05, 0.1, 0.25] as const;

export type SnapSettings = { grid: number; angle: number; scale: number };
export const DEFAULT_SNAP: SnapSettings = { grid: 0.1, angle: 15, scale: 0.05 };

/** Rounds `value` to the nearest multiple of `step`; a step of 0 leaves it alone. */
export function snapValue(value: number, step: number): number {
  if (!(step > 0)) return value;
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 1e6) / 1e6;
}

export const snapVec = (v: readonly [number, number, number], step: number): [number, number, number] => [
  snapValue(v[0], step),
  snapValue(v[1], step),
  snapValue(v[2], step),
];

/** The next / previous entry of a step list (clamped at the ends). */
export function stepAlong(steps: readonly number[], current: number, direction: 1 | -1): number {
  const at = steps.indexOf(current);
  const base = at < 0 ? 0 : at;
  return steps[Math.min(steps.length - 1, Math.max(0, base + direction))]!;
}

/** Shift flips snapping for the duration of a drag: off becomes the default step, on becomes off. */
export function effectiveStep(step: number, shiftHeld: boolean, fallback: number): number {
  if (!shiftHeld) return step;
  return step > 0 ? 0 : fallback;
}

/** How far an arrow key nudges: the grid step (0.1 when off), ten times that with Shift. */
export const nudgeDistance = (grid: number, shift: boolean): number => (grid > 0 ? grid : 0.1) * (shift ? 10 : 1);
