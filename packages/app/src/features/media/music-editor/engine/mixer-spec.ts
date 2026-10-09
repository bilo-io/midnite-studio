import { parseAutomationTarget, type Song, type SongTrack } from '@midnite/studio-shared';

import { laneEvents, valueAtSeconds, type TimedValue } from '../model/automation';
import { resolvedParams } from '../model/effects';
import { audibleTracks } from './scheduler';
import type { TickMap } from './tick-map';

/**
 * The mixer as plain data (Phase 101 Theme F): what `tone-host.ts` builds Tone nodes from. All the
 * decisions — which effects are in the chain, what a muted or soloed track does, how a lane becomes
 * timed values — are made here and unit-tested; the host only maps this onto audio nodes.
 */
export type ChainNode = { id: string; type: string; params: Record<string, number> };

export type LaneSpec =
  | { kind: 'volume'; events: TimedValue[] }
  | { kind: 'pan'; events: TimedValue[] }
  | { kind: 'effect'; effectId: string; param: string; events: TimedValue[] };

export type StripSpec = {
  /** Linear gain, 0 when the track is silenced by mute or by another track's solo. */
  gain: number;
  /** True when mute or another track's solo silences the strip; an automated volume cannot undo that. */
  silenced: boolean;
  pan: number;
  /** Effects in signal order with the bypassed ones already left out. */
  chain: ChainNode[];
  lanes: LaneSpec[];
};

export type MixerSpec = {
  tracks: Record<string, StripSpec>;
  master: { gain: number; pan: number };
};

const gainOf = (volume: number, audible: boolean): number => (audible ? volume : 0);

/** The chain a track plays through: its effects, minus the bypassed ones. */
export function chainFor(track: Pick<SongTrack, 'effects'>): ChainNode[] {
  return track.effects
    .filter((fx) => !fx.bypass)
    .map((fx) => ({ id: fx.id, type: fx.type, params: resolvedParams(fx) }));
}

/** Changes when the chain's shape does (effects added, removed, reordered, bypassed), not its values. */
export const chainShapeKey = (chain: readonly ChainNode[]): string =>
  chain.map((n) => `${n.id}:${n.type}`).join('|');

/** The track's lanes as timed events. A lane aimed at a bypassed or missing effect is kept: it still sets the value. */
export function lanesFor(track: Pick<SongTrack, 'automation'>, map: TickMap): LaneSpec[] {
  const out: LaneSpec[] = [];
  for (const lane of track.automation) {
    const target = parseAutomationTarget(lane.target);
    if (!target || lane.points.length === 0) continue;
    const events = laneEvents(lane, map);
    if (target.kind === 'effect')
      out.push({ kind: 'effect', effectId: target.effectId, param: target.param, events });
    else out.push({ kind: target.kind, events });
  }
  return out;
}

export function buildMixerSpec(song: Song, map: TickMap): MixerSpec {
  const audible = new Set(audibleTracks(song).map((t) => t.id));
  const tracks: Record<string, StripSpec> = {};
  for (const track of song.tracks) {
    tracks[track.id] = {
      gain: gainOf(track.mixer.volume, audible.has(track.id)),
      silenced: !audible.has(track.id),
      pan: track.mixer.pan,
      chain: chainFor(track),
      lanes: lanesFor(track, map),
    };
  }
  const master = song.mixer.master;
  return { tracks, master: { gain: gainOf(master.volume, !master.mute), pan: master.pan } };
}

/** Linear gain to decibels; silence is -100 dB rather than -Infinity, which Tone's params reject. */
export const gainToDb = (gain: number): number => (gain <= 0.00001 ? -100 : 20 * Math.log10(gain));

/** A strip's static value for a lane kind, overridden by the lane's value at `seconds` when it has one. */
export function stripValuesAt(
  strip: StripSpec,
  seconds: number,
): { gain: number; pan: number; effects: Record<string, Record<string, number>> } {
  let gain = strip.gain;
  let pan = strip.pan;
  const effects: Record<string, Record<string, number>> = {};
  for (const lane of strip.lanes) {
    if (lane.kind === 'volume')
      gain = strip.silenced ? 0 : valueAtSeconds(lane.events, seconds, gain);
    else if (lane.kind === 'pan') pan = valueAtSeconds(lane.events, seconds, pan);
    else (effects[lane.effectId] ??= {})[lane.param] = valueAtSeconds(lane.events, seconds, NaN);
  }
  return { gain, pan, effects };
}

/** Whether two strips need their automation rescheduled. */
export const lanesKey = (strip: StripSpec): string => JSON.stringify(strip.lanes);
