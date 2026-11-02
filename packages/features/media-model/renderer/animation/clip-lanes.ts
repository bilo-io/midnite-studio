import { parseTrackName } from './bone-names';

/**
 * The per-bone lanes under the timeline (Phase 125 Theme D), pure: a clip's tracks folded to one lane per bone
 * holding the sorted, de-duplicated key times, plus the windowing a long lane list needs.
 */
export type TrackTimes = { name: string; times: ArrayLike<number> };
export type Lane = { bone: string; keys: number[] };

/** More lanes than this start collapsed to one summary lane and window their rows when expanded. */
export const LANE_COLLAPSE_THRESHOLD = 60;
export const LANE_ROW_HEIGHT = 16;

export function clipLanes(tracks: readonly TrackTimes[]): Lane[] {
  const byBone = new Map<string, Set<number>>();
  for (const track of tracks) {
    const target = parseTrackName(track.name);
    if (!target) continue;
    const set = byBone.get(target.bone) ?? new Set<number>();
    for (let i = 0; i < track.times.length; i++) set.add(Math.round(track.times[i]! * 1e4) / 1e4);
    byBone.set(target.bone, set);
  }
  return [...byBone].map(([bone, set]) => ({ bone, keys: [...set].sort((a, b) => a - b) }));
}

/** Every lane's keys on one lane. */
export function summaryLane(lanes: readonly Lane[]): Lane {
  const all = new Set<number>();
  for (const lane of lanes) for (const key of lane.keys) all.add(key);
  return { bone: `All ${lanes.length} bones`, keys: [...all].sort((a, b) => a - b) };
}

/** The rows `[start, end)` to render for a scrolled list, with `overscan` rows either side. */
export function visibleLaneRange(scrollTop: number, viewport: number, count: number, rowHeight = LANE_ROW_HEIGHT, overscan = 4): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  const from = Math.min(start, count);
  return { start: from, end: Math.max(from, Math.min(count, end)) };
}

/** `time` as a percentage of `duration`, clamped to the lane. */
export const timePercent = (time: number, duration: number): number => (duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0);
