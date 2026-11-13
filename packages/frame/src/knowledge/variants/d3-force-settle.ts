/**
 * When the live d3-force simulation stops (Phase 89 Theme I).
 *
 * A simulation that never stops is exactly the idle-CPU cost Phase 84 spent eleven themes removing,
 * so "settled" is an explicit state with a HARD ceiling, not a hope that alpha decays in time. Pure
 * and clock-free (the caller passes elapsed time) so the arithmetic is unit-tested, not timed.
 */
export const SETTLE = {
  /** d3's own convergence point: below it the layout moves less than a pixel. */
  alphaMin: 0.002,
  /** Hard ceiling on ticks for a first run, whatever alpha says. */
  maxTicks: 300,
  /** Hard ceiling on wall-clock time from the start, so a slow machine stops too. */
  maxMs: 5000,
  /** A re-settle after a collapse or expand starts hot but needs far fewer ticks. */
  maxTicksResettle: 120,
  /** Per-frame simulation budget: run ticks until it is spent, never block a frame longer. */
  frameBudgetMs: 8,
} as const;

export type SettleVerdict = 'run' | 'settled' | 'ceiling';

export function settleVerdict(input: {
  ticks: number;
  elapsedMs: number;
  alpha: number;
  maxTicks: number;
}): SettleVerdict {
  if (input.alpha < SETTLE.alphaMin) return 'settled';
  if (input.ticks >= input.maxTicks || input.elapsedMs >= SETTLE.maxMs) return 'ceiling';
  return 'run';
}

/** Edge opacity ramp while the layout forms: 0 at the first tick, 1 by `rampTicks` — the live sim's version of Theme B's edge fade-in. */
export function edgeRamp(ticks: number, rampTicks = 60): number {
  const t = Math.min(1, Math.max(0, ticks / rampTicks));
  return 1 - Math.pow(1 - t, 3);
}

/** Pan/zoom camera of the live canvas: screen = world * k + (x, y). */
export type Camera = { k: number; x: number; y: number };

/** The camera that fits a world-space box into a viewport with `padding` px around it. */
export function fitCamera(
  box: { minX: number; maxX: number; minY: number; maxY: number },
  viewport: { width: number; height: number },
  padding = 40,
): Camera {
  const spanX = Math.max(box.maxX - box.minX, 1);
  const spanY = Math.max(box.maxY - box.minY, 1);
  const k = Math.min(
    Math.max(Math.min((viewport.width - padding * 2) / spanX, (viewport.height - padding * 2) / spanY), 0.02),
    12,
  );
  return {
    k,
    x: viewport.width / 2 - ((box.minX + box.maxX) / 2) * k,
    y: viewport.height / 2 - ((box.minY + box.maxY) / 2) * k,
  };
}

/** Zoom by `factor` keeping the world point under the screen point `(sx, sy)` fixed. */
export function zoomAt(camera: Camera, factor: number, sx: number, sy: number): Camera {
  const k = Math.min(Math.max(camera.k * factor, 0.02), 12);
  const ratio = k / camera.k;
  return { k, x: sx - (sx - camera.x) * ratio, y: sy - (sy - camera.y) * ratio };
}
