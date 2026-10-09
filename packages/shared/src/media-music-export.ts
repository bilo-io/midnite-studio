/**
 * Media ▸ Audio ▸ Editor (Phase 101 Themes J and K) — exporting a song, and handing it to Generator.
 *
 * Pure helpers over {@link Song} plus the two wire contracts. Zod only, like the rest of `shared`.
 *
 * **Theme K's limitation.** MusicGen-melody has no ONNX build (`docs/research/musicgen-melody-onnx.md`),
 * so "Send to Generator" cannot condition generation on the melody itself. It hands Generator a
 * rendered reference clip plus {@link describeSong}, a deterministic text description (key, tempo,
 * instrumentation, mood) the prompt form is seeded with. The description is derived from the notes
 * alone — the same song always yields the same words.
 */
import { z } from 'zod';

import { GitOpResultOf } from './domain/result';
import { MediaProjectNameSchema } from './media';
import { gmProgram } from './media-music-gm';
import { MUSIC_DRUM_CHANNEL, MUSIC_PPQ, SongNameSchema, SongSchema, songEndTick, type Song } from './media-music';

/** The Editor's export menu: the interchange file, the offline render, and its MP3 transcode. */
export const MUSIC_EXPORT_FORMATS = ['mid', 'wav', 'mp3'] as const;
export type MusicExportFormat = (typeof MUSIC_EXPORT_FORMATS)[number];

export type MusicRegion = { startTick: number; endTick: number };

/** Which part of the song an export covers. */
export type MusicExportRange = 'song' | 'loop';

const clampTick = (value: number, max: number): number => Math.max(0, Math.min(max, value));

/**
 * The song cut to `region` and moved to tick 0: notes are clipped to the window, the tempo and time
 * signature in force at its start become the new first entries, and clips are dropped (they refer to
 * the original arrangement). A null region returns the song untouched.
 */
export function sliceSong(song: Song, region: MusicRegion | null): Song {
  if (!region) return song;
  const start = clampTick(region.startTick, songEndTick(song) + MUSIC_PPQ * 4);
  const end = Math.max(start + 1, region.endTick);
  const inWindow = <T extends { tick: number }>(events: readonly T[]): T[] =>
    events.filter((e) => e.tick >= start && e.tick < end).map((e) => ({ ...e, tick: e.tick - start }));
  const carried = <T extends { tick: number }>(events: readonly T[]): T[] => {
    const inForce = [...events].reverse().find((e) => e.tick <= start);
    const later = events.filter((e) => e.tick > start && e.tick < end).map((e) => ({ ...e, tick: e.tick - start }));
    return inForce ? [{ ...inForce, tick: 0 }, ...later] : later;
  };
  return SongSchema.parse({
    ...song,
    tempos: carried(song.tempos).length > 0 ? carried(song.tempos) : [{ tick: 0, bpm: song.tempos[0]?.bpm ?? 120 }],
    timeSignatures:
      carried(song.timeSignatures).length > 0
        ? carried(song.timeSignatures)
        : [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: carried(song.keySignatures),
    meta: inWindow(song.meta),
    clips: [],
    tracks: song.tracks.map((track) => ({
      ...track,
      notes: track.notes
        .filter((n) => n.startTick < end && n.startTick + n.durationTicks > start)
        .map((n) => {
          const from = Math.max(n.startTick, start);
          const to = Math.min(n.startTick + n.durationTicks, end);
          return { ...n, startTick: from - start, durationTicks: Math.max(1, to - from) };
        }),
      controlChanges: inWindow(track.controlChanges),
      pitchBends: inWindow(track.pitchBends),
      automation: track.automation.map((lane) => ({ ...lane, points: inWindow(lane.points) })),
    })),
  });
}

// --- the deterministic description (Theme K) -----------------------------------

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** Krumhansl–Kessler key profiles. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const correlation = (a: readonly number[], b: readonly number[]): number => {
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
};

export type SongKey = { key: string; scale: 'major' | 'minor' };

/** The song's key: its own key signature when it carries one, else the best Krumhansl–Schmuckler fit. */
export function detectKey(song: Song): SongKey | null {
  const declared = song.keySignatures[0];
  if (declared) return { key: declared.key, scale: declared.scale };
  const weights = new Array<number>(12).fill(0);
  for (const track of song.tracks) {
    if (track.channel === MUSIC_DRUM_CHANNEL) continue;
    for (const note of track.notes) weights[note.pitch % 12]! += note.durationTicks;
  }
  if (weights.every((w) => w === 0)) return null;
  let best: { score: number; key: SongKey } | null = null;
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotate = (profile: readonly number[]) => profile.map((_, i) => profile[(i - tonic + 12) % 12]!);
    for (const [scale, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      const score = correlation(weights, rotate(profile));
      if (!best || score > best.score) best = { score, key: { key: PITCH_NAMES[tonic]!, scale } };
    }
  }
  return best?.key ?? null;
}

const tempoWord = (bpm: number): string =>
  bpm < 76 ? 'slow' : bpm < 108 ? 'relaxed' : bpm < 140 ? 'upbeat' : 'energetic';

export type SongDescription = {
  key: SongKey | null;
  bpm: number;
  timeSignature: string;
  /** GM instrument names, in track order, deduplicated; `Drum kit` for the percussion channel. */
  instruments: string[];
  /** Two adjectives drawn from tempo and mode. */
  mood: string;
  /** One sentence for the Generator's caption (≤ 400 characters). */
  text: string;
  /** Short style tags for the prompt form (each ≤ 40 characters). */
  tags: string[];
};

/** Same song in, same words out: no randomness, no clock, no model. */
export function describeSong(song: Song): SongDescription {
  const bpm = Math.round(song.tempos[0]?.bpm ?? 120);
  const sig = song.timeSignatures[0];
  const timeSignature = `${sig?.numerator ?? 4}/${sig?.denominator ?? 4}`;
  const key = detectKey(song);
  const instruments: string[] = [];
  for (const track of song.tracks) {
    if (track.notes.length === 0) continue;
    const name = track.channel === MUSIC_DRUM_CHANNEL ? 'Drum kit' : (gmProgram(track.program)?.name ?? 'Piano');
    if (!instruments.includes(name)) instruments.push(name);
  }
  const mode = key ? (key.scale === 'minor' ? 'melancholic' : 'bright') : 'neutral';
  const mood = `${tempoWord(bpm)}, ${mode}`;
  const keyText = key ? `${key.key} ${key.scale}` : 'no clear key';
  const gear = instruments.length > 0 ? instruments.slice(0, 6).join(', ') : 'no instruments';
  const text = `Instrumental, ${mood} mood, ${keyText}, ${bpm} BPM in ${timeSignature}, played on ${gear}.`.slice(0, 400);
  const tags = [
    tempoWord(bpm),
    mode,
    ...(key ? [`${key.key} ${key.scale}`] : []),
    `${bpm} bpm`,
    ...instruments.slice(0, 4).map((i) => i.toLowerCase()),
  ]
    .filter((t) => t !== 'neutral')
    .map((t) => t.slice(0, 40));
  return { key, bpm, timeSignature, instruments, mood, text, tags };
}

// --- wire: export and send-to-generator -----------------------------------------

const Scope = { repoId: z.string().min(1), project: MediaProjectNameSchema };

/**
 * One export. `wav` is the renderer's `Tone.Offline` result (main has no Web Audio) and is required
 * for `wav` and `mp3`; `mid` is encoded in main from `song`. Main opens the save dialog.
 */
export const MusicExportRequestSchema = z.object({
  ...Scope,
  name: SongNameSchema,
  exportId: z.string().min(1),
  format: z.enum(MUSIC_EXPORT_FORMATS),
  song: SongSchema,
  wav: z.instanceof(Uint8Array).optional(),
  bitrateKbps: z.number().int().min(32).max(320).optional(),
  defaultDir: z.string().optional(),
});
export type MusicExportRequest = z.infer<typeof MusicExportRequestSchema>;

/** Rendered reference for Generator: the WAV plus the song it came from. */
export const MusicSendToGeneratorRequestSchema = z.object({
  ...Scope,
  name: SongNameSchema,
  song: SongSchema,
  wav: z.instanceof(Uint8Array),
  durationS: z.number().nonnegative(),
});
export type MusicSendToGeneratorRequest = z.infer<typeof MusicSendToGeneratorRequestSchema>;

export const MusicSendToGeneratorResultSchema = z.object({
  /** The reference clip, relative to the project folder. */
  file: z.string().min(1),
  sessionId: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
});
export type MusicSendToGeneratorResult = z.infer<typeof MusicSendToGeneratorResultSchema>;

export const MusicExportResultSchemas = {
  export: GitOpResultOf(z.object({ dest: z.string() })),
  sendToGenerator: GitOpResultOf(MusicSendToGeneratorResultSchema),
} as const;
