import { MUSIC_MAX_NOTES_PER_TRACK, MUSIC_MAX_TICKS, type Song, type SongNote, type SongTrack } from '@midnite/studio-shared';

/**
 * The drum grid's model (Phase 101 Theme G): a step-sequencer *view* over a track's ordinary notes.
 * Nothing here is stored as steps — a step is a note whose start sits on a grid slot, so the piano
 * roll and the grid always edit the same data. Slots are `steps` per bar (16 or 32); swing delays
 * every odd slot by `swing` of a step, which is baked into the note's tick so playback, export and
 * the `.mid` need no knowledge of it.
 */

export const DRUM_STEP_OPTIONS = [16, 32] as const;
export type DrumSteps = (typeof DRUM_STEP_OPTIONS)[number];
export type GridConfig = { steps: DrumSteps; swing: number };
export const DEFAULT_GRID: GridConfig = { steps: 16, swing: 0 };
export const DEFAULT_STEP_VELOCITY = 100;

export const gridOf = (track: Pick<SongTrack, 'grid'>): GridConfig => ({ ...DEFAULT_GRID, ...(track.grid ?? {}) });

/** The General MIDI percussion pieces the grid always offers a lane for. */
export const DRUM_LANES: ReadonlyArray<{ pitch: number; name: string }> = [
  { pitch: 49, name: 'Crash' },
  { pitch: 51, name: 'Ride' },
  { pitch: 46, name: 'Open hat' },
  { pitch: 42, name: 'Closed hat' },
  { pitch: 50, name: 'High tom' },
  { pitch: 47, name: 'Mid tom' },
  { pitch: 45, name: 'Low tom' },
  { pitch: 39, name: 'Clap' },
  { pitch: 38, name: 'Snare' },
  { pitch: 36, name: 'Kick' },
];

export const drumName = (pitch: number): string => DRUM_LANES.find((l) => l.pitch === pitch)?.name ?? `Pitch ${pitch}`;

/** The lanes to show: the standard kit, plus any other pitch the track already uses. */
export function lanesFor(track: Pick<SongTrack, 'notes'>): number[] {
  const known = new Set(DRUM_LANES.map((l) => l.pitch));
  const extra = [...new Set(track.notes.map((n) => n.pitch))].filter((p) => !known.has(p)).sort((a, b) => b - a);
  return [...extra, ...DRUM_LANES.map((l) => l.pitch)];
}

const stepLen = (bar: number, cfg: GridConfig): number => bar / cfg.steps;

/** The tick of global slot `g` (slot 0 is the song's start): odd slots carry the swing. */
export function slotTick(g: number, bar: number, cfg: GridConfig): number {
  const len = stepLen(bar, cfg);
  return Math.round(g * len + (g % 2 === 1 ? cfg.swing * len : 0));
}

/** The slot a tick sits on, or null when it is further than a quarter step from every slot. */
export function slotOf(tick: number, bar: number, cfg: GridConfig): number | null {
  const len = stepLen(bar, cfg);
  const base = Math.floor(tick / len);
  let best: number | null = null;
  let bestDist = Infinity;
  for (let g = Math.max(0, base - 1); g <= base + 2; g += 1) {
    const d = Math.abs(tick - slotTick(g, bar, cfg));
    if (d < bestDist) {
      best = g;
      bestDist = d;
    }
  }
  return best !== null && bestDist <= Math.max(1, len / 4) ? best : null;
}

/** Per lane, one velocity per step of the bar (0 = off). Notes off the grid do not show. */
export function readPattern(track: SongTrack, barIndex: number, bar: number, cfg: GridConfig): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const pitch of lanesFor(track)) out.set(pitch, new Array<number>(cfg.steps).fill(0));
  for (const n of track.notes) {
    const g = slotOf(n.startTick, bar, cfg);
    if (g === null || Math.floor(g / cfg.steps) !== barIndex) continue;
    const row = out.get(n.pitch);
    if (row) row[g % cfg.steps] = Math.max(row[g % cfg.steps]!, n.velocity);
  }
  return out;
}

const patch = (song: Song, trackId: string, fn: (track: SongTrack) => SongTrack): Song => {
  let changed = false;
  const tracks = song.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...song, tracks } : song;
};

export type StepRef = { barIndex: number; step: number; pitch: number };

const globalSlot = (ref: StepRef, cfg: GridConfig): number => ref.barIndex * cfg.steps + ref.step;

/** Turn a step on at `velocity`, or off when it is already on and no velocity is given. */
export function toggleStep(song: Song, trackId: string, ref: StepRef, bar: number, velocity?: number): Song {
  return patch(song, trackId, (track) => {
    const cfg = gridOf(track);
    const g = globalSlot(ref, cfg);
    if (slotTick(g, bar, cfg) >= MUSIC_MAX_TICKS) return track;
    const hits = (n: SongNote) => n.pitch === ref.pitch && slotOf(n.startTick, bar, cfg) === g;
    if (track.notes.some(hits)) {
      if (velocity === undefined) return { ...track, notes: track.notes.filter((n) => !hits(n)) };
      return { ...track, notes: track.notes.map((n) => (hits(n) ? { ...n, velocity: clampVelocity(velocity) } : n)) };
    }
    if (track.notes.length >= MUSIC_MAX_NOTES_PER_TRACK) return track;
    const note: SongNote = {
      pitch: ref.pitch,
      startTick: slotTick(g, bar, cfg),
      durationTicks: Math.max(1, Math.round(stepLen(bar, cfg))),
      velocity: clampVelocity(velocity ?? DEFAULT_STEP_VELOCITY),
    };
    return { ...track, notes: [...track.notes, note] };
  });
}

const clampVelocity = (v: number): number => Math.max(1, Math.min(127, Math.round(v)));

/** Change the grid's steps or swing; every on-grid note is re-timed so the pattern keeps its shape. */
export function setGrid(song: Song, trackId: string, change: Partial<GridConfig>, bar: number): Song {
  return patch(song, trackId, (track) => {
    const old = gridOf(track);
    const next: GridConfig = { steps: change.steps ?? old.steps, swing: change.swing ?? old.swing };
    if (next.steps === old.steps && next.swing === old.swing && track.grid) return track;
    const oldLen = stepLen(bar, old);
    const newLen = stepLen(bar, next);
    const notes = track.notes.map((n) => {
      const g = slotOf(n.startTick, bar, old);
      if (g === null) return n;
      const straight = g * oldLen;
      const ng = straight / newLen;
      const startTick = Number.isInteger(Math.round(ng * 1e6) / 1e6) ? slotTick(Math.round(ng), bar, next) : Math.round(straight);
      return startTick === n.startTick ? n : { ...n, startTick };
    });
    return { ...track, notes, grid: next };
  });
}
