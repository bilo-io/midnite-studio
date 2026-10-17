import {
  MUSIC_MAX_CLIPS,
  MUSIC_MAX_TICKS,
  clipEndTick,
  clipSourceLength,
  type Song,
  type SongClip,
} from '@midnite/studio-shared';

/**
 * Pure clip edits for the arrangement (Phase 101 Theme G). A clip owns the track notes whose start
 * lies in its source range and plays them at its own position — see `media-music-clips.ts`. Each
 * function returns the next song, or the same reference when nothing changed, so a no-op is never an
 * undo step.
 */

export const nextClipId = (song: Song): string => {
  const used = new Set(song.clips.map((c) => c.id));
  for (let i = song.clips.length + 1; ; i += 1) if (!used.has(`clip-${i}`)) return `clip-${i}`;
};

const patchClip = (song: Song, id: string, fn: (clip: SongClip) => SongClip): Song => {
  let changed = false;
  const clips = song.clips.map((clip) => {
    if (clip.id !== id) return clip;
    const next = fn(clip);
    if (next !== clip) changed = true;
    return next;
  });
  return changed ? { ...song, clips } : song;
};

export const findClip = (song: Song, id: string | null): SongClip | undefined =>
  id ? song.clips.find((c) => c.id === id) : undefined;

/** The clip on a track that covers a tick (later clips win, as they draw on top). */
export function clipAt(song: Song, trackId: string, tick: number): SongClip | undefined {
  return [...song.clips].reverse().find((c) => c.trackId === trackId && tick >= c.startTick && tick < clipEndTick(c));
}

/** A clip over `[startTick, startTick + lengthTicks)` of a track, taking its notes as the source. */
export function createClip(
  song: Song,
  trackId: string,
  startTick: number,
  lengthTicks: number,
): { song: Song; id: string } | null {
  if (song.clips.length >= MUSIC_MAX_CLIPS || !song.tracks.some((t) => t.id === trackId) || lengthTicks < 1) return null;
  const start = Math.max(0, Math.round(startTick));
  const length = Math.min(Math.round(lengthTicks), MUSIC_MAX_TICKS - start);
  if (length < 1) return null;
  const id = nextClipId(song);
  const track = song.tracks.find((t) => t.id === trackId)!;
  const clip: SongClip = {
    id,
    trackId,
    name: `${track.name || 'Clip'} ${song.clips.filter((c) => c.trackId === trackId).length + 1}`,
    startTick: start,
    lengthTicks: length,
    sourceStartTick: start,
    loop: false,
  };
  return { song: { ...song, clips: [...song.clips, clip] }, id };
}

/** A clip around all of a track's notes, rounded out to whole bars; null for an empty track. */
export function createClipFromNotes(song: Song, trackId: string, bar: number): { song: Song; id: string } | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track || track.notes.length === 0) return null;
  let lo = Infinity;
  let hi = 0;
  for (const n of track.notes) {
    lo = Math.min(lo, n.startTick);
    hi = Math.max(hi, n.startTick + n.durationTicks);
  }
  const start = Math.floor(lo / bar) * bar;
  return createClip(song, trackId, start, Math.max(bar, Math.ceil(hi / bar) * bar - start));
}

export const moveClip = (song: Song, id: string, startTick: number): Song =>
  patchClip(song, id, (c) => {
    const start = Math.max(0, Math.min(Math.round(startTick), MUSIC_MAX_TICKS - c.lengthTicks));
    return start === c.startTick ? c : { ...c, startTick: start };
  });

export const resizeClip = (song: Song, id: string, lengthTicks: number): Song =>
  patchClip(song, id, (c) => {
    const length = Math.max(1, Math.min(Math.round(lengthTicks), MUSIC_MAX_TICKS - c.startTick));
    return length === c.lengthTicks ? c : { ...c, lengthTicks: length, sourceLengthTicks: clipSourceLength(c) };
  });

/** Looping repeats the source to fill the clip; turning it off trims the clip back to one pass. */
export const setClipLoop = (song: Song, id: string, loop: boolean): Song =>
  patchClip(song, id, (c) => {
    if (c.loop === loop) return c;
    const source = clipSourceLength(c);
    return loop
      ? { ...c, loop, sourceLengthTicks: source }
      : { ...c, loop, lengthTicks: Math.min(c.lengthTicks, source), sourceLengthTicks: source };
  });

export const renameClip = (song: Song, id: string, name: string): Song =>
  patchClip(song, id, (c) => (c.name === name ? c : { ...c, name }));

export function deleteClip(song: Song, id: string): Song {
  return song.clips.some((c) => c.id === id) ? { ...song, clips: song.clips.filter((c) => c.id !== id) } : song;
}

/** A copy placed straight after the original, over the same source notes. */
export function duplicateClip(song: Song, id: string): { song: Song; id: string } | null {
  const clip = findClip(song, id);
  if (!clip || song.clips.length >= MUSIC_MAX_CLIPS || clipEndTick(clip) >= MUSIC_MAX_TICKS) return null;
  const copyId = nextClipId(song);
  const length = Math.min(clip.lengthTicks, MUSIC_MAX_TICKS - clipEndTick(clip));
  return {
    song: { ...song, clips: [...song.clips, { ...clip, id: copyId, startTick: clipEndTick(clip), lengthTicks: length }] },
    id: copyId,
  };
}

/**
 * Cut a clip in two at `tick`. A plain clip splits exactly there, the right half continuing the
 * source where the left stops. A looping clip splits on the repeat boundary at or before `tick`, so
 * both halves keep a whole pattern; a cut inside the first repeat is a no-op.
 */
export function splitClip(song: Song, id: string, tick: number): { song: Song; id: string } | null {
  const clip = findClip(song, id);
  if (!clip || song.clips.length >= MUSIC_MAX_CLIPS) return null;
  const source = clipSourceLength(clip);
  const at = clip.loop ? clip.startTick + Math.floor((tick - clip.startTick) / source) * source : Math.round(tick);
  if (at <= clip.startTick || at >= clipEndTick(clip)) return null;
  const rightId = nextClipId(song);
  const leftLength = at - clip.startTick;
  const left: SongClip = clip.loop ? { ...clip, lengthTicks: leftLength } : { ...clip, lengthTicks: leftLength, sourceLengthTicks: leftLength };
  const right: SongClip = clip.loop
    ? { ...clip, id: rightId, startTick: at, lengthTicks: clipEndTick(clip) - at }
    : {
        ...clip,
        id: rightId,
        startTick: at,
        lengthTicks: clipEndTick(clip) - at,
        sourceStartTick: clip.sourceStartTick + leftLength,
        sourceLengthTicks: source - leftLength,
      };
  const clips = song.clips.flatMap((c) => (c.id === id ? [left, right] : [c]));
  return { song: { ...song, clips }, id: rightId };
}

/** The clip that can join `id`: next on the same track, touching it in time and in the source. */
export function joinCandidate(song: Song, id: string): SongClip | undefined {
  const clip = findClip(song, id);
  if (!clip || clip.loop) return undefined;
  return song.clips.find(
    (o) =>
      o.id !== id &&
      o.trackId === clip.trackId &&
      !o.loop &&
      o.startTick === clipEndTick(clip) &&
      o.sourceStartTick === clip.sourceStartTick + clipSourceLength(clip),
  );
}

/** Merge a clip with the one that follows it (the inverse of a plain split). */
export function joinClips(song: Song, id: string): Song {
  const clip = findClip(song, id);
  const next = joinCandidate(song, id);
  if (!clip || !next) return song;
  const joined: SongClip = {
    ...clip,
    lengthTicks: clip.lengthTicks + next.lengthTicks,
    sourceLengthTicks: clipSourceLength(clip) + clipSourceLength(next),
  };
  return { ...song, clips: song.clips.filter((c) => c.id !== next.id).map((c) => (c.id === id ? joined : c)) };
}
