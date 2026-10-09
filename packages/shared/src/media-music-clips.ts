/**
 * Media ▸ Audio ▸ Editor (Phase 101 Theme G) — how clips become notes.
 *
 * A clip is a window onto a track's own notes. The notes whose start falls inside a clip's source
 * range `[sourceStartTick, sourceStartTick + sourceLength)` belong to that clip: they no longer play
 * where they sit, they play where the clip sits, and repeat when the clip loops. Notes no clip owns
 * play as written, so a song with no clips is untouched. Because of that, the scheduler, the
 * offline render, the `.mid` writer and Send to Generator all call {@link expandClips} first and
 * never need to know clips exist.
 *
 * Pure and zod-free: it only reads the already-parsed {@link Song}.
 */
import { MUSIC_MAX_NOTES_PER_TRACK, type Song, type SongClip, type SongNote, type SongTrack } from './media-music';

/** The length of the source a clip repeats. */
export const clipSourceLength = (clip: Pick<SongClip, 'lengthTicks' | 'sourceLengthTicks'>): number =>
  clip.sourceLengthTicks ?? clip.lengthTicks;

export const clipEndTick = (clip: Pick<SongClip, 'startTick' | 'lengthTicks'>): number => clip.startTick + clip.lengthTicks;

/** Whether a clip's source range holds a note's start. */
export const clipOwnsNote = (clip: SongClip, note: Pick<SongNote, 'startTick'>): boolean =>
  note.startTick >= clip.sourceStartTick && note.startTick < clip.sourceStartTick + clipSourceLength(clip);

/** The notes one clip plays, in song ticks, cut at the clip's end. */
export function expandClip(clip: SongClip, notes: readonly SongNote[]): SongNote[] {
  const source = clipSourceLength(clip);
  const end = clipEndTick(clip);
  const owned = notes.filter((n) => clipOwnsNote(clip, n));
  const repeats = clip.loop ? Math.max(1, Math.ceil(clip.lengthTicks / source)) : 1;
  const out: SongNote[] = [];
  for (let k = 0; k < repeats; k += 1) {
    const offset = clip.startTick + k * source - clip.sourceStartTick;
    for (const n of owned) {
      const start = n.startTick + offset;
      if (start >= end) continue;
      out.push({ ...n, startTick: start, durationTicks: Math.max(1, Math.min(n.durationTicks, end - start)) });
      if (out.length >= MUSIC_MAX_NOTES_PER_TRACK) return out;
    }
  }
  return out;
}

/** A track's notes with its clips played out: the notes no clip owns, plus each clip's. */
export function expandTrackNotes(track: Pick<SongTrack, 'id' | 'notes'>, clips: readonly SongClip[]): SongNote[] {
  const mine = clips.filter((c) => c.trackId === track.id);
  if (mine.length === 0) return track.notes;
  const out = track.notes.filter((n) => !mine.some((c) => clipOwnsNote(c, n)));
  for (const clip of mine) {
    for (const n of expandClip(clip, track.notes)) {
      if (out.length >= MUSIC_MAX_NOTES_PER_TRACK) break;
      out.push(n);
    }
  }
  return out.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
}

/**
 * The song as plain notes: clips expanded and dropped. The same reference comes back when there are
 * no clips, so callers can pass any song through at no cost.
 */
export function expandClips(song: Song): Song {
  if (song.clips.length === 0) return song;
  return {
    ...song,
    clips: [],
    tracks: song.tracks.map((t) => (song.clips.some((c) => c.trackId === t.id) ? { ...t, notes: expandTrackNotes(t, song.clips) } : t)),
  };
}
