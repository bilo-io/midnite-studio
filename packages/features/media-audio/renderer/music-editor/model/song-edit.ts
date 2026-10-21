import {
  MUSIC_DRUM_CHANNEL,
  MUSIC_MAX_NOTES,
  MUSIC_MAX_NOTES_PER_TRACK,
  MUSIC_MAX_TICKS,
  MUSIC_MAX_TRACKS,
  MUSIC_PPQ,
  type Song,
  type SongNote,
  type SongTrack,
  SongTrackSchema,
} from '@midnite/studio-shared';

/**
 * Pure song edits for the piano roll and arrangement (Phase 101 Theme E). Every function takes a
 * song and returns the next one without mutating either; an edit that changes nothing returns the
 * same reference, which is what lets the history skip it. Notes carry no id in the schema, so a
 * selection is a set of indices into one track's `notes` — and every edit here keeps the order of
 * that array (duplicate appends), so indices stay meaningful until a delete.
 */

export const MIN_PITCH = 0;
export const MAX_PITCH = 127;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Grid divisions the snap control offers, as a fraction of a whole note. */
export const SNAP_DIVISIONS = [1, 2, 4, 8, 16, 32] as const;
export type SnapDivision = (typeof SNAP_DIVISIONS)[number];

/** Ticks in one grid cell: a whole note is four quarters. */
export const gridTicks = (division: SnapDivision | number): number =>
  Math.max(1, Math.round((MUSIC_PPQ * 4) / division));

/** Round a tick to the nearest grid line. A grid of 0 (snap off) leaves it alone. */
export function snapTick(tick: number, grid: number): number {
  if (grid <= 0) return Math.max(0, Math.round(tick));
  return Math.max(0, Math.round(tick / grid) * grid);
}

/** Floor to the grid, for placing a new note under the pointer. */
export function floorTick(tick: number, grid: number): number {
  if (grid <= 0) return Math.max(0, Math.round(tick));
  return Math.max(0, Math.floor(tick / grid) * grid);
}

export const barTicks = (numerator: number, denominator: number): number =>
  Math.round((numerator * MUSIC_PPQ * 4) / denominator);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** Scientific pitch name, middle C (60) being C4. */
export const pitchName = (pitch: number): string =>
  `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
export const isBlackKey = (pitch: number): boolean => [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);

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

const inRange = (index: number, length: number) => index >= 0 && index < length;

/** Insert one note (clamped into range). Returns the new song and the note's index, or null at a limit. */
export function addNote(
  song: Song,
  trackId: string,
  note: SongNote,
): { song: Song; index: number } | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track || track.notes.length >= MUSIC_MAX_NOTES_PER_TRACK) return null;
  if (song.tracks.reduce((sum, t) => sum + t.notes.length, 0) >= MUSIC_MAX_NOTES) return null;
  const startTick = clamp(Math.round(note.startTick), 0, MUSIC_MAX_TICKS - 1);
  const clean: SongNote = {
    pitch: clamp(Math.round(note.pitch), MIN_PITCH, MAX_PITCH),
    startTick,
    durationTicks: clamp(Math.round(note.durationTicks), 1, MUSIC_MAX_TICKS - startTick),
    velocity: clamp(Math.round(note.velocity), 1, 127),
  };
  return {
    song: patchTrack(song, trackId, (t) => ({ ...t, notes: [...t.notes, clean] })),
    index: track.notes.length,
  };
}

/** Shift notes in time and pitch. The delta is clamped so the whole selection stays in range. */
export function moveNotes(
  song: Song,
  trackId: string,
  indices: Iterable<number>,
  dTick: number,
  dPitch: number,
): Song {
  const set = new Set(indices);
  return patchTrack(song, trackId, (track) => {
    const picked = track.notes.filter((_, i) => set.has(i));
    if (picked.length === 0) return track;
    const minStart = Math.min(...picked.map((n) => n.startTick));
    const maxEnd = Math.max(...picked.map((n) => n.startTick + n.durationTicks));
    const minPitch = Math.min(...picked.map((n) => n.pitch));
    const maxPitch = Math.max(...picked.map((n) => n.pitch));
    const dt = clamp(Math.round(dTick), -minStart, MUSIC_MAX_TICKS - maxEnd);
    const dp = clamp(Math.round(dPitch), MIN_PITCH - minPitch, MAX_PITCH - maxPitch);
    if (dt === 0 && dp === 0) return track;
    return {
      ...track,
      notes: track.notes.map((n, i) =>
        set.has(i) ? { ...n, startTick: n.startTick + dt, pitch: n.pitch + dp } : n,
      ),
    };
  });
}

/** Lengthen or shorten notes by `dTicks`; none goes below one tick or past the song limit. */
export function resizeNotes(
  song: Song,
  trackId: string,
  indices: Iterable<number>,
  dTicks: number,
): Song {
  const set = new Set(indices);
  return patchTrack(song, trackId, (track) => {
    let changed = false;
    const notes = track.notes.map((n, i) => {
      if (!set.has(i)) return n;
      const durationTicks = clamp(
        Math.round(n.durationTicks + dTicks),
        1,
        MUSIC_MAX_TICKS - n.startTick,
      );
      if (durationTicks === n.durationTicks) return n;
      changed = true;
      return { ...n, durationTicks };
    });
    return changed ? { ...track, notes } : track;
  });
}

/** Remove notes. Indices after a removed note shift down, so callers clear their selection. */
export function deleteNotes(song: Song, trackId: string, indices: Iterable<number>): Song {
  const set = new Set(indices);
  return patchTrack(song, trackId, (track) => {
    if (![...set].some((i) => inRange(i, track.notes.length))) return track;
    return { ...track, notes: track.notes.filter((_, i) => !set.has(i)) };
  });
}

/**
 * Copy notes to just after the selection (offset by its span, rounded up to `grid`). The copies are
 * appended, so the returned indices are the new selection.
 */
export function duplicateNotes(
  song: Song,
  trackId: string,
  indices: Iterable<number>,
  grid: number,
): { song: Song; indices: number[] } | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const picked = [...new Set(indices)].filter((i) => inRange(i, track.notes.length)).sort((a, b) => a - b);
  if (picked.length === 0) return null;
  const room = Math.min(
    MUSIC_MAX_NOTES_PER_TRACK - track.notes.length,
    MUSIC_MAX_NOTES - song.tracks.reduce((sum, t) => sum + t.notes.length, 0),
  );
  if (room < picked.length) return null;
  const start = Math.min(...picked.map((i) => track.notes[i]!.startTick));
  const end = Math.max(...picked.map((i) => track.notes[i]!.startTick + track.notes[i]!.durationTicks));
  const step = grid > 0 ? Math.max(grid, Math.ceil((end - start) / grid) * grid) : end - start;
  if (end + step > MUSIC_MAX_TICKS) return null;
  const copies = picked.map((i) => {
    const n = track.notes[i]!;
    return { ...n, startTick: n.startTick + step };
  });
  const first = track.notes.length;
  return {
    song: patchTrack(song, trackId, (t) => ({ ...t, notes: [...t.notes, ...copies] })),
    indices: copies.map((_, k) => first + k),
  };
}

/** Snap each note's start to the grid, keeping its length. `strength` 1 snaps fully, 0.5 halfway. */
export function quantizeNotes(
  song: Song,
  trackId: string,
  indices: Iterable<number> | 'all',
  grid: number,
  strength = 1,
): Song {
  const set = indices === 'all' ? null : new Set(indices);
  return patchTrack(song, trackId, (track) => {
    let changed = false;
    const notes = track.notes.map((n, i) => {
      if (set && !set.has(i)) return n;
      const target = snapTick(n.startTick, grid);
      const startTick = clamp(
        Math.round(n.startTick + (target - n.startTick) * strength),
        0,
        MUSIC_MAX_TICKS - n.durationTicks,
      );
      if (startTick === n.startTick) return n;
      changed = true;
      return { ...n, startTick };
    });
    return changed ? { ...track, notes } : track;
  });
}

/** Set velocity per note index. Indices not in the map are untouched. */
export function setVelocities(
  song: Song,
  trackId: string,
  velocities: ReadonlyMap<number, number>,
): Song {
  return patchTrack(song, trackId, (track) => {
    let changed = false;
    const notes = track.notes.map((n, i) => {
      const v = velocities.get(i);
      if (v === undefined) return n;
      const velocity = clamp(Math.round(v), 1, 127);
      if (velocity === n.velocity) return n;
      changed = true;
      return { ...n, velocity };
    });
    return changed ? { ...track, notes } : track;
  });
}

export const allIndices = (song: Song, trackId: string): number[] =>
  (song.tracks.find((t) => t.id === trackId)?.notes ?? []).map((_, i) => i);

// --- tracks ---------------------------------------------------------------------

const TRACK_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

export function nextTrackId(song: Song): string {
  const used = new Set(song.tracks.map((t) => t.id));
  for (let n = song.tracks.length + 1; ; n++) if (!used.has(`track-${n}`)) return `track-${n}`;
}

export function addTrack(song: Song, patch: Partial<Pick<SongTrack, 'name' | 'program' | 'channel' | 'color'>> = {}): Song {
  if (song.tracks.length >= MUSIC_MAX_TRACKS) return song;
  const id = nextTrackId(song);
  const track = SongTrackSchema.parse({
    id,
    name: `Track ${song.tracks.length + 1}`,
    color: TRACK_COLORS[song.tracks.length % TRACK_COLORS.length],
    ...patch,
  });
  return { ...song, tracks: [...song.tracks, track] };
}

export function removeTrack(song: Song, trackId: string): Song {
  if (!song.tracks.some((t) => t.id === trackId)) return song;
  return {
    ...song,
    tracks: song.tracks.filter((t) => t.id !== trackId),
    clips: song.clips.filter((c) => c.trackId !== trackId),
  };
}

export function updateTrack(
  song: Song,
  trackId: string,
  patch: Partial<Pick<SongTrack, 'name' | 'color' | 'program' | 'channel'>>,
): Song {
  return patchTrack(song, trackId, (track) => {
    const next = { ...track, ...patch };
    return (Object.keys(patch) as Array<keyof typeof patch>).every((k) => track[k] === next[k]) ? track : next;
  });
}

export function setMixerFlag(song: Song, trackId: string, flag: 'mute' | 'solo', value: boolean): Song {
  return patchTrack(song, trackId, (track) =>
    track.mixer[flag] === value ? track : { ...track, mixer: { ...track.mixer, [flag]: value } },
  );
}

/** What the per-track instrument control chooses: a GM program, or the drum kit on channel 10. */
export type InstrumentChoice = { kind: 'program'; program: number } | { kind: 'drums' };

export const instrumentOf = (track: Pick<SongTrack, 'program' | 'channel'>): InstrumentChoice =>
  track.channel === MUSIC_DRUM_CHANNEL ? { kind: 'drums' } : { kind: 'program', program: track.program };

/** Picking the kit moves the track to channel 10; picking a program moves it back off it. */
export function setInstrument(song: Song, trackId: string, choice: InstrumentChoice): Song {
  return patchTrack(song, trackId, (track) => {
    const channel = choice.kind === 'drums' ? MUSIC_DRUM_CHANNEL : track.channel === MUSIC_DRUM_CHANNEL ? 0 : track.channel;
    const program = choice.kind === 'drums' ? 0 : choice.program;
    return track.channel === channel && track.program === program ? track : { ...track, channel, program };
  });
}
