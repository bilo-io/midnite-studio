import type { Song, SongTrack } from '@midnite/studio-shared';

import type { TickMap } from './tick-map';

/** One note to fire, in transport seconds. */
export type ScheduledNote = { time: number; pitch: number; duration: number; velocity: number };

/** Audible tracks: any solo wins over everything not soloed; mute always silences. */
export function audibleTracks(song: Pick<Song, 'tracks'>): SongTrack[] {
  const anySolo = song.tracks.some((t) => t.mixer.solo);
  return song.tracks.filter((t) => !t.mixer.mute && (!anySolo || t.mixer.solo));
}

/** A track's notes as timed events, sorted by time. The tempo map is baked in here. */
export function trackEvents(track: SongTrack, map: TickMap): ScheduledNote[] {
  return track.notes
    .map((n) => {
      const time = map.ticksToSeconds(n.startTick);
      return {
        time,
        pitch: n.pitch,
        duration: Math.max(0.01, map.ticksToSeconds(n.startTick + n.durationTicks) - time),
        velocity: n.velocity / 127,
      };
    })
    .sort((a, b) => a.time - b.time || a.pitch - b.pitch);
}

/**
 * A cheap content signature for what the scheduler consumes from a track. Two tracks with the
 * same signature schedule identically, so the engine reschedules only tracks whose signature moved.
 */
export function trackSignature(track: SongTrack): string {
  let h = 2166136261;
  const mix = (n: number) => {
    h = Math.imul(h ^ (n | 0), 16777619);
  };
  for (const n of track.notes) {
    mix(n.pitch);
    mix(n.startTick);
    mix(n.durationTicks);
    mix(n.velocity);
  }
  return `${track.channel}:${track.program}:${track.notes.length}:${h >>> 0}`;
}

export function tempoSignature(song: Pick<Song, 'tempos'>): string {
  return song.tempos.map((t) => `${t.tick}@${t.bpm}`).join(',');
}

export type TrackDiff = { added: string[]; removed: string[]; changed: string[] };

/** id -> signature for every track, audibility included: a muted track schedules nothing. */
export function scheduleSignatures(song: Pick<Song, 'tracks'>): Map<string, string> {
  const audible = new Set(audibleTracks(song).map((t) => t.id));
  return new Map(
    song.tracks.map((t) => [t.id, trackSignature(t) + (audible.has(t.id) ? '' : ':off')] as const),
  );
}

/** Which track ids need (re)scheduling going from `prev` signatures to `song`. */
export function diffTracks(
  prev: ReadonlyMap<string, string>,
  song: Pick<Song, 'tracks'>,
): TrackDiff {
  const next = scheduleSignatures(song);
  const added: string[] = [];
  const changed: string[] = [];
  for (const [id, sig] of next) {
    if (!prev.has(id)) added.push(id);
    else if (prev.get(id) !== sig) changed.push(id);
  }
  const removed = [...prev.keys()].filter((id) => !next.has(id));
  return { added, removed, changed };
}
