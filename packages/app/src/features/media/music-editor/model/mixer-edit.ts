import {
  MUSIC_MAX_AUTOMATION_LANES_PER_TRACK,
  MUSIC_MAX_EFFECTS_PER_TRACK,
  effectAutomationTarget,
  parseAutomationTarget,
  type Song,
  type SongAutomationLane,
  type SongEffectType,
  type SongMixerChannel,
  type SongTrack,
} from '@midnite/studio-shared';

import { insertPoint, movePoint, removePoint, type AutomationPoint } from './automation';
import { EFFECTS, clampParam, effectParam, paramSpec } from './effects';

/**
 * Pure mixer, effects-chain and automation edits (Phase 101 Theme F), in the same shape as
 * `song-edit.ts`: a song in, the next song out, the same reference when nothing changed.
 */
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function patchTrack(song: Song, trackId: string, fn: (track: SongTrack) => SongTrack): Song {
  let changed = false;
  const tracks = song.tracks.map((track) => {
    if (track.id !== trackId) return track;
    const next = fn(track);
    if (next !== track) changed = true;
    return next;
  });
  return changed ? { ...song, tracks } : song;
}

const nextId = (prefix: string, taken: readonly string[]): string => {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
};

// --- mixer strips ----------------------------------------------------------------

export const VOLUME_RANGE = { min: 0, max: 2, default: 0.8 } as const;
export const PAN_RANGE = { min: -1, max: 1, default: 0 } as const;

export function setChannel(song: Song, trackId: string | 'master', patch: Partial<SongMixerChannel>): Song {
  const apply = (c: SongMixerChannel): SongMixerChannel => {
    const next: SongMixerChannel = {
      volume: patch.volume === undefined ? c.volume : clamp(patch.volume, VOLUME_RANGE.min, VOLUME_RANGE.max),
      pan: patch.pan === undefined ? c.pan : clamp(patch.pan, PAN_RANGE.min, PAN_RANGE.max),
      mute: patch.mute ?? c.mute,
      solo: patch.solo ?? c.solo,
    };
    return next.volume === c.volume && next.pan === c.pan && next.mute === c.mute && next.solo === c.solo ? c : next;
  };
  if (trackId === 'master') {
    const next = apply(song.mixer.master);
    return next === song.mixer.master ? song : { ...song, mixer: { ...song.mixer, master: next } };
  }
  return patchTrack(song, trackId, (t) => {
    const mixer = apply(t.mixer);
    return mixer === t.mixer ? t : { ...t, mixer };
  });
}

// --- effects ---------------------------------------------------------------------

export function addEffect(song: Song, trackId: string, type: SongEffectType): { song: Song; id: string } | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track || track.effects.length >= MUSIC_MAX_EFFECTS_PER_TRACK || !EFFECTS[type]) return null;
  const id = nextId('fx', track.effects.map((e) => e.id));
  return {
    id,
    song: patchTrack(song, trackId, (t) => ({ ...t, effects: [...t.effects, { id, type, bypass: false, params: {} }] })),
  };
}

/** Removing an effect also drops the lanes that automate it — a lane with no target is invalid. */
export function removeEffect(song: Song, trackId: string, effectId: string): Song {
  return patchTrack(song, trackId, (t) => {
    if (!t.effects.some((e) => e.id === effectId)) return t;
    return {
      ...t,
      effects: t.effects.filter((e) => e.id !== effectId),
      automation: t.automation.filter((l) => {
        const target = parseAutomationTarget(l.target);
        return !(target?.kind === 'effect' && target.effectId === effectId);
      }),
    };
  });
}

/** Move an effect to `toIndex` in the chain (clamped). */
export function moveEffect(song: Song, trackId: string, effectId: string, toIndex: number): Song {
  return patchTrack(song, trackId, (t) => {
    const from = t.effects.findIndex((e) => e.id === effectId);
    if (from < 0) return t;
    const to = clamp(toIndex, 0, t.effects.length - 1);
    if (to === from) return t;
    const effects = [...t.effects];
    const [moved] = effects.splice(from, 1);
    effects.splice(to, 0, moved!);
    return { ...t, effects };
  });
}

export function setEffectBypass(song: Song, trackId: string, effectId: string, bypass: boolean): Song {
  return patchTrack(song, trackId, (t) => {
    const fx = t.effects.find((e) => e.id === effectId);
    if (!fx || fx.bypass === bypass) return t;
    return { ...t, effects: t.effects.map((e) => (e === fx ? { ...e, bypass } : e)) };
  });
}

export function setEffectParam(song: Song, trackId: string, effectId: string, key: string, value: number): Song {
  return patchTrack(song, trackId, (t) => {
    const fx = t.effects.find((e) => e.id === effectId);
    const spec = fx && paramSpec(fx.type, key);
    if (!fx || !spec) return t;
    const next = clampParam(spec, value);
    if (effectParam(fx, key) === next && fx.params[key] === next) return t;
    return { ...t, effects: t.effects.map((e) => (e === fx ? { ...e, params: { ...e.params, [key]: next } } : e)) };
  });
}

// --- automation ------------------------------------------------------------------

export type AutomationRange = { min: number; max: number; default: number; label: string };

/** What a lane's target spans, for drawing it and clamping a dragged point. Null for a dangling target. */
export function targetRange(track: Pick<SongTrack, 'effects' | 'mixer'>, target: string): AutomationRange | null {
  const t = parseAutomationTarget(target);
  if (!t) return null;
  if (t.kind === 'volume') return { ...VOLUME_RANGE, label: 'Volume' };
  if (t.kind === 'pan') return { ...PAN_RANGE, label: 'Pan' };
  const fx = track.effects.find((e) => e.id === t.effectId);
  const spec = fx && paramSpec(fx.type, t.param);
  return fx && spec ? { min: spec.min, max: spec.max, default: effectParam(fx, t.param), label: `${EFFECTS[fx.type].label} ${spec.label}` } : null;
}

/** Every target a lane could be added for on this track, minus those that already have one. */
export function availableTargets(track: SongTrack): { target: string; label: string }[] {
  const all = [{ target: 'volume', label: 'Volume' }, { target: 'pan', label: 'Pan' }];
  for (const fx of track.effects) {
    for (const spec of EFFECTS[fx.type].params) {
      all.push({ target: effectAutomationTarget(fx.id, spec.key), label: `${EFFECTS[fx.type].label} ${spec.label}` });
    }
  }
  const used = new Set(track.automation.map((l) => l.target));
  return all.filter((a) => !used.has(a.target));
}

export function addLane(song: Song, trackId: string, target: string): { song: Song; id: string } | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track || track.automation.length >= MUSIC_MAX_AUTOMATION_LANES_PER_TRACK) return null;
  if (track.automation.some((l) => l.target === target) || !targetRange(track, target)) return null;
  const id = nextId('lane', track.automation.map((l) => l.id));
  const lane: SongAutomationLane = { id, target, curve: 'linear', points: [] };
  return { id, song: patchTrack(song, trackId, (t) => ({ ...t, automation: [...t.automation, lane] })) };
}

function patchLane(song: Song, trackId: string, laneId: string, fn: (lane: SongAutomationLane, track: SongTrack) => SongAutomationLane): Song {
  return patchTrack(song, trackId, (t) => {
    const lane = t.automation.find((l) => l.id === laneId);
    if (!lane) return t;
    const next = fn(lane, t);
    return next === lane ? t : { ...t, automation: t.automation.map((l) => (l === lane ? next : l)) };
  });
}

export const removeLane = (song: Song, trackId: string, laneId: string): Song =>
  patchTrack(song, trackId, (t) =>
    t.automation.some((l) => l.id === laneId) ? { ...t, automation: t.automation.filter((l) => l.id !== laneId) } : t,
  );

export const setLaneCurve = (song: Song, trackId: string, laneId: string, curve: 'linear' | 'step'): Song =>
  patchLane(song, trackId, laneId, (l) => (l.curve === curve ? l : { ...l, curve }));

const clampToTarget = (track: SongTrack, lane: SongAutomationLane, value: number): number => {
  const range = targetRange(track, lane.target);
  return range ? clamp(value, range.min, range.max) : value;
};

export const addLanePoint = (song: Song, trackId: string, laneId: string, point: AutomationPoint): Song =>
  patchLane(song, trackId, laneId, (l, t) => {
    const points = insertPoint(l.points, { tick: point.tick, value: clampToTarget(t, l, point.value) });
    return points ? { ...l, points } : l;
  });

export const moveLanePoint = (song: Song, trackId: string, laneId: string, index: number, to: AutomationPoint): Song =>
  patchLane(song, trackId, laneId, (l, t) => ({ ...l, points: movePoint(l.points, index, { tick: to.tick, value: clampToTarget(t, l, to.value) }) }));

export const removeLanePoint = (song: Song, trackId: string, laneId: string, index: number): Song =>
  patchLane(song, trackId, laneId, (l) => (index >= 0 && index < l.points.length ? { ...l, points: removePoint(l.points, index) } : l));
