import { MUSIC_MAX_AUTOMATION_POINTS, MUSIC_MAX_TICKS, type SongAutomationLane } from '@midnite/studio-shared';

import type { TickMap } from '../engine/tick-map';

/**
 * Automation lanes (Phase 101 Theme F): breakpoints in ticks with a linear or step curve. All pure.
 * A lane's value before its first point is that point's value, and after its last, the last's.
 */
export type AutomationPoint = { tick: number; value: number };

/** Points sorted by tick; two points on one tick keep the later one. */
export function normalisePoints(points: readonly AutomationPoint[]): AutomationPoint[] {
  const sorted = [...points].sort((a, b) => a.tick - b.tick);
  const out: AutomationPoint[] = [];
  for (const point of sorted) {
    const last = out[out.length - 1];
    if (last && last.tick === point.tick) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/** The lane's value at `tick`, or `fallback` for a lane with no points. */
export function valueAt(lane: Pick<SongAutomationLane, 'curve' | 'points'>, tick: number, fallback: number): number {
  const pts = lane.points;
  if (pts.length === 0) return fallback;
  if (tick <= pts[0]!.tick) return pts[0]!.value;
  const lastPoint = pts[pts.length - 1]!;
  if (tick >= lastPoint.tick) return lastPoint.value;
  // Binary search for the last point at or before `tick`.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.tick <= tick) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  if (lane.curve === 'step') return a.value;
  return a.value + ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick);
}

export type TimedValue = { time: number; value: number };

/** Longest gap between expanded linear events, in seconds. */
export const LINEAR_RESOLUTION_SECONDS = 0.1;
/** A lane never expands to more events than this, however long its segments. */
export const MAX_EXPANDED_EVENTS = 4000;

/**
 * A lane as timed set-value events in transport seconds, for the host to schedule. A step lane is its
 * breakpoints; a linear lane gets intermediate events at most {@link LINEAR_RESOLUTION_SECONDS} apart,
 * so a host that can only set values (an effect option) still glides, and one with real ramps is not
 * made worse. The tempo map is applied here, like note times.
 */
export function laneEvents(
  lane: Pick<SongAutomationLane, 'curve' | 'points'>,
  map: TickMap,
  resolution = LINEAR_RESOLUTION_SECONDS,
): TimedValue[] {
  const pts = lane.points;
  const out: TimedValue[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const ta = map.ticksToSeconds(a.tick);
    out.push({ time: ta, value: a.value });
    const b = pts[i + 1];
    if (!b || lane.curve === 'step' || a.value === b.value) continue;
    const tb = map.ticksToSeconds(b.tick);
    const steps = Math.min(Math.ceil((tb - ta) / resolution), Math.max(0, MAX_EXPANDED_EVENTS - out.length));
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      out.push({ time: ta + (tb - ta) * f, value: a.value + (b.value - a.value) * f });
    }
  }
  return out;
}

/** The value a lane holds at `seconds` of transport time, from its expanded events. */
export function valueAtSeconds(events: readonly TimedValue[], seconds: number, fallback: number): number {
  let value = fallback;
  let seen = false;
  for (const e of events) {
    if (e.time > seconds) {
      if (!seen) value = e.value;
      break;
    }
    value = e.value;
    seen = true;
  }
  return value;
}

// --- edits ---------------------------------------------------------------------

export function insertPoint(points: readonly AutomationPoint[], point: AutomationPoint): AutomationPoint[] | null {
  const tick = Math.min(MUSIC_MAX_TICKS, Math.max(0, Math.round(point.tick)));
  const replacing = points.some((p) => p.tick === tick);
  if (!replacing && points.length >= MUSIC_MAX_AUTOMATION_POINTS) return null;
  return normalisePoints([...points.filter((p) => p.tick !== tick), { tick, value: point.value }]);
}

export const removePoint = (points: readonly AutomationPoint[], index: number): AutomationPoint[] =>
  index >= 0 && index < points.length ? points.filter((_, i) => i !== index) : [...points];

/** Move one breakpoint; it cannot cross its neighbours' ticks (that would reorder the lane mid-drag). */
export function movePoint(points: readonly AutomationPoint[], index: number, to: AutomationPoint): AutomationPoint[] {
  const cur = points[index];
  if (!cur) return [...points];
  const lo = index > 0 ? points[index - 1]!.tick + 1 : 0;
  const hi = index < points.length - 1 ? points[index + 1]!.tick - 1 : MUSIC_MAX_TICKS;
  const tick = Math.min(hi, Math.max(lo, Math.round(to.tick)));
  return points.map((p, i) => (i === index ? { tick, value: to.value } : p));
}
