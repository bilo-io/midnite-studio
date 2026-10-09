/**
 * Media ▸ Audio ▸ Editor (Phase 101 Theme B) — the song model and its wire contract.
 *
 * A song is **MIDI**: notes, controllers, tempo — all in **ticks** at a fixed {@link MUSIC_PPQ}
 * (480 per quarter note), so a tick means the same thing in the renderer's engine, in main's
 * `.mid` writer and in an agent's `music_*` tool call. An imported file at another resolution is
 * rescaled once, on import.
 *
 * On disk a song `<name>` is two files in an Audio project folder, beside any MusicGen variants:
 *
 *   <name>.mid         the interchange file, always written (any DAW opens it)
 *   <name>.song.json   the editor's own state — the full {@link SongSchema}, including what
 *                      MIDI cannot hold (colours, mixer, automation, clips)
 *
 * The sidecar is `.song.json`, not `.json`: an Audio variant's own sidecar is `<variant>.json`, so a
 * song and a rendered variant sharing a base name would otherwise overwrite one another.
 *
 * Zod only — this file imports no other workspace package.
 */
import { z } from 'zod';

import { GitOpResultOf, GitOpResultSchema } from './domain/result';
import { MediaProjectNameSchema } from './media';

// --- limits (named, so every consumer shares them) ----------------------------

/** Ticks per quarter note. Fixed: the whole stack speaks this resolution. */
export const MUSIC_PPQ = 480;
/** A song's last tick: 2 000 bars of 4/4. */
export const MUSIC_MAX_TICKS = MUSIC_PPQ * 4 * 2000;
export const MUSIC_MAX_TRACKS = 64;
export const MUSIC_MAX_NOTES_PER_TRACK = 100_000;
/** Across the whole song, so many full tracks cannot add up to an unbounded payload. */
export const MUSIC_MAX_NOTES = 250_000;
export const MUSIC_MAX_CC_PER_TRACK = 50_000;
export const MUSIC_MAX_PITCH_BENDS_PER_TRACK = 50_000;
export const MUSIC_MAX_TEMPO_EVENTS = 4096;
export const MUSIC_MAX_TIME_SIGNATURES = 1024;
export const MUSIC_MAX_META_EVENTS = 4096;
export const MUSIC_MAX_AUTOMATION_LANES_PER_TRACK = 16;
export const MUSIC_MAX_AUTOMATION_POINTS = 10_000;
export const MUSIC_MAX_CLIPS = 4096;
export const MUSIC_MAX_EFFECTS_PER_TRACK = 8;
export const MUSIC_MIN_BPM = 20;
export const MUSIC_MAX_BPM = 400;
export const MUSIC_DEFAULT_BPM = 120;
export const MUSIC_PITCH_BEND_MIN = -8192;
export const MUSIC_PITCH_BEND_MAX = 8191;
/** The GM drum channel, zero-based (MIDI channel 10). */
export const MUSIC_DRUM_CHANNEL = 9;
/** Files above this are refused on import, before `@tonejs/midi` parses them. */
export const MUSIC_MAX_MIDI_BYTES = 16 * 1024 * 1024;

export const MUSIC_MIDI_EXT = '.mid';
export const MUSIC_SIDECAR_EXT = '.song.json';
export const MUSIC_MIDI_FILE_EXTENSIONS = ['mid', 'midi'] as const;
/** A song named like an Audio project's own bookkeeping file would clobber it. */
export const MUSIC_RESERVED_NAMES = ['project'] as const;

export const musicMidiPath = (name: string): string => `${name}${MUSIC_MIDI_EXT}`;
export const musicSidecarPath = (name: string): string => `${name}${MUSIC_SIDECAR_EXT}`;

// --- the song -----------------------------------------------------------------

const tick = z.number().int().min(0).max(MUSIC_MAX_TICKS);
const midi7 = z.number().int().min(0).max(127);
const idString = z.string().min(1).max(64);

export const SongNameSchema = MediaProjectNameSchema.refine(
  (name) => !(MUSIC_RESERVED_NAMES as readonly string[]).includes(name.toLowerCase()),
  'is reserved',
);

export const SongNoteSchema = z.object({
  pitch: midi7,
  startTick: tick,
  durationTicks: z.number().int().min(1).max(MUSIC_MAX_TICKS),
  velocity: z.number().int().min(1).max(127),
});
export type SongNote = z.infer<typeof SongNoteSchema>;

export const SongControlChangeSchema = z.object({ tick, controller: midi7, value: midi7 });
export type SongControlChange = z.infer<typeof SongControlChangeSchema>;

export const SongPitchBendSchema = z.object({
  tick,
  /** Raw 14-bit bend, centred on 0. */
  value: z.number().int().min(MUSIC_PITCH_BEND_MIN).max(MUSIC_PITCH_BEND_MAX),
});
export type SongPitchBend = z.infer<typeof SongPitchBendSchema>;

export const SongTempoEventSchema = z.object({ tick, bpm: z.number().min(MUSIC_MIN_BPM).max(MUSIC_MAX_BPM) });
export type SongTempoEvent = z.infer<typeof SongTempoEventSchema>;

export const SongTimeSignatureEventSchema = z.object({
  tick,
  numerator: z.number().int().min(1).max(32),
  /** A power of two. */
  denominator: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
});
export type SongTimeSignatureEvent = z.infer<typeof SongTimeSignatureEventSchema>;

export const SongKeySignatureEventSchema = z.object({
  tick,
  key: z.string().min(1).max(3),
  scale: z.enum(['major', 'minor']),
});

/** Header text events (`@tonejs/midi` keeps these four kinds) — carried through untouched. */
export const SongMetaEventSchema = z.object({
  tick,
  type: z.enum(['text', 'cuePoint', 'marker', 'lyrics']),
  text: z.string().max(2000),
});
export type SongMetaEvent = z.infer<typeof SongMetaEventSchema>;

/** `volume`/`pan` or an effect parameter (`fx:<effectId>:<param>`, Theme F). */
export const SongAutomationTargetSchema = z.string().min(1).max(96);

export type AutomationTarget = { kind: 'volume' } | { kind: 'pan' } | { kind: 'effect'; effectId: string; param: string };

/** `volume`, `pan` or `fx:<effectId>:<param>`; null for anything else. */
export function parseAutomationTarget(target: string): AutomationTarget | null {
  if (target === 'volume') return { kind: 'volume' };
  if (target === 'pan') return { kind: 'pan' };
  const m = /^fx:([^:]+):([^:]+)$/.exec(target);
  return m ? { kind: 'effect', effectId: m[1]!, param: m[2]! } : null;
}
export const effectAutomationTarget = (effectId: string, param: string): string => `fx:${effectId}:${param}`;

export const SongAutomationPointSchema = z.object({ tick, value: z.number().finite() });

export const SongAutomationLaneSchema = z.object({
  id: idString,
  target: SongAutomationTargetSchema,
  /** How the value travels to the next breakpoint. */
  curve: z.enum(['linear', 'step']).default('linear'),
  points: z.array(SongAutomationPointSchema).max(MUSIC_MAX_AUTOMATION_POINTS).default([]),
});
export type SongAutomationLane = z.infer<typeof SongAutomationLaneSchema>;

/** One mixer strip: a track's, or the master's. `volume` is linear gain, 1 = unity. */
export const SongMixerChannelSchema = z.object({
  volume: z.number().min(0).max(2).default(0.8),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
});
export type SongMixerChannel = z.infer<typeof SongMixerChannelSchema>;

/** The effects a track's chain can hold (Theme F). Parameters and ranges live in the editor. */
export const MUSIC_EFFECT_TYPES = ['reverb', 'delay', 'eq3', 'compressor', 'chorus', 'distortion', 'filter'] as const;
export const SongEffectTypeSchema = z.enum(MUSIC_EFFECT_TYPES);
export type SongEffectType = z.infer<typeof SongEffectTypeSchema>;

/** One effect in a track's chain, in signal order. A parameter left out takes the effect's default. */
export const SongEffectSchema = z.object({
  id: idString,
  type: SongEffectTypeSchema,
  bypass: z.boolean().default(false),
  params: z.record(z.string().min(1).max(32), z.number().finite()).default({}),
});
export type SongEffect = z.infer<typeof SongEffectSchema>;

export const SongTrackSchema = z.object({
  id: idString,
  name: z.string().max(120).default(''),
  /** 0–15; 9 is the GM drum kit. */
  channel: z.number().int().min(0).max(15).default(0),
  /** General MIDI program, 0–127. */
  program: midi7.default(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#6366f1'),
  notes: z.array(SongNoteSchema).max(MUSIC_MAX_NOTES_PER_TRACK).default([]),
  controlChanges: z.array(SongControlChangeSchema).max(MUSIC_MAX_CC_PER_TRACK).default([]),
  pitchBends: z.array(SongPitchBendSchema).max(MUSIC_MAX_PITCH_BENDS_PER_TRACK).default([]),
  automation: z.array(SongAutomationLaneSchema).max(MUSIC_MAX_AUTOMATION_LANES_PER_TRACK).default([]),
  mixer: SongMixerChannelSchema.default({}),
  /** Insert effects between the instrument and the mixer strip, first to last. */
  effects: z.array(SongEffectSchema).max(MUSIC_MAX_EFFECTS_PER_TRACK).default([]),
});
export type SongTrack = z.infer<typeof SongTrackSchema>;

/** A looped note range on the arrangement (Theme G fills in the editing). */
export const SongClipSchema = z.object({
  id: idString,
  trackId: idString,
  name: z.string().max(120).default(''),
  startTick: tick,
  lengthTicks: z.number().int().min(1).max(MUSIC_MAX_TICKS),
  /** Source range inside the track's notes. */
  sourceStartTick: tick.default(0),
  loop: z.boolean().default(false),
});
export type SongClip = z.infer<typeof SongClipSchema>;

export const SongSchema = z
  .object({
    version: z.literal(1).default(1),
    name: z.string().max(120).default(''),
    ppq: z.literal(MUSIC_PPQ).default(MUSIC_PPQ),
    /** The tempo map. Sorted by tick; the first entry sits at tick 0. */
    tempos: z.array(SongTempoEventSchema).min(1).max(MUSIC_MAX_TEMPO_EVENTS).default([{ tick: 0, bpm: MUSIC_DEFAULT_BPM }]),
    timeSignatures: z
      .array(SongTimeSignatureEventSchema)
      .min(1)
      .max(MUSIC_MAX_TIME_SIGNATURES)
      .default([{ tick: 0, numerator: 4, denominator: 4 }]),
    keySignatures: z.array(SongKeySignatureEventSchema).max(MUSIC_MAX_META_EVENTS).default([]),
    meta: z.array(SongMetaEventSchema).max(MUSIC_MAX_META_EVENTS).default([]),
    tracks: z.array(SongTrackSchema).max(MUSIC_MAX_TRACKS).default([]),
    clips: z.array(SongClipSchema).max(MUSIC_MAX_CLIPS).default([]),
    mixer: z.object({ master: SongMixerChannelSchema.default({}) }).default({}),
  })
  .superRefine((song, ctx) => {
    const ids = new Set<string>();
    song.tracks.forEach((track, index) => {
      if (ids.has(track.id)) ctx.addIssue({ code: 'custom', path: ['tracks', index, 'id'], message: 'duplicate track id' });
      ids.add(track.id);
    });
    song.tracks.forEach((track, ti) => {
      const effectIds = new Set<string>();
      track.effects.forEach((fx, fi) => {
        if (effectIds.has(fx.id)) ctx.addIssue({ code: 'custom', path: ['tracks', ti, 'effects', fi, 'id'], message: 'duplicate effect id' });
        effectIds.add(fx.id);
      });
      track.automation.forEach((lane, li) => {
        const target = parseAutomationTarget(lane.target);
        if (!target || (target.kind === 'effect' && !effectIds.has(target.effectId))) {
          ctx.addIssue({ code: 'custom', path: ['tracks', ti, 'automation', li, 'target'], message: 'unknown automation target' });
        }
      });
    });
    song.clips.forEach((clip, index) => {
      if (!ids.has(clip.trackId)) ctx.addIssue({ code: 'custom', path: ['clips', index, 'trackId'], message: 'unknown track' });
    });
    if (song.tempos[0] && song.tempos[0].tick !== 0) {
      ctx.addIssue({ code: 'custom', path: ['tempos', 0, 'tick'], message: 'the tempo map starts at tick 0' });
    }
    if (song.timeSignatures[0] && song.timeSignatures[0].tick !== 0) {
      ctx.addIssue({ code: 'custom', path: ['timeSignatures', 0, 'tick'], message: 'time signatures start at tick 0' });
    }
    const sorted = (events: ReadonlyArray<{ tick: number }>) => events.every((e, i) => i === 0 || events[i - 1]!.tick <= e.tick);
    if (!sorted(song.tempos)) ctx.addIssue({ code: 'custom', path: ['tempos'], message: 'tempo events must be sorted by tick' });
    if (!sorted(song.timeSignatures)) {
      ctx.addIssue({ code: 'custom', path: ['timeSignatures'], message: 'time signatures must be sorted by tick' });
    }
    const total = song.tracks.reduce((sum, track) => sum + track.notes.length, 0);
    if (total > MUSIC_MAX_NOTES) {
      ctx.addIssue({ code: 'custom', path: ['tracks'], message: `a song holds at most ${MUSIC_MAX_NOTES} notes` });
    }
  });
export type Song = z.infer<typeof SongSchema>;
/** A song as authored, before defaults fill in. */
export type SongInput = z.input<typeof SongSchema>;

/** An empty song: 120 BPM, 4/4, no tracks. */
export const emptySong = (name = ''): Song => SongSchema.parse({ name });

/** The tick a song's last note ends at (0 for an empty one). */
export function songEndTick(song: Pick<Song, 'tracks'>): number {
  let end = 0;
  for (const track of song.tracks) for (const note of track.notes) end = Math.max(end, note.startTick + note.durationTicks);
  return end;
}

// --- wire: `mstudio:media:music-*` --------------------------------------------

const Scope = { repoId: z.string().min(1), project: MediaProjectNameSchema };

/** One song in an Audio project. */
export const MusicSongEntrySchema = z.object({
  name: SongNameSchema,
  /** The `.mid`, relative to the project folder. */
  path: z.string().min(1),
  /** Whether the editor's `.song.json` sits beside it. A bare `.mid` opens by import. */
  hasSidecar: z.boolean(),
  size: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});
export type MusicSongEntry = z.infer<typeof MusicSongEntrySchema>;

export const MusicListRequestSchema = z.object(Scope);
export const MusicListResultSchema = z.array(MusicSongEntrySchema);

export const MusicReadRequestSchema = z.object({ ...Scope, name: SongNameSchema });

export const MusicWriteRequestSchema = z.object({ ...Scope, name: SongNameSchema, song: SongSchema });
export const MusicWriteResultSchema = z.object({ size: z.number().int().nonnegative(), largeFile: z.boolean() });

/** Main opens its own native picker; the renderer never names an absolute path. */
export const MusicImportRequestSchema = z.object({ ...Scope });
export const MusicImportResultSchema = z.array(z.object({ name: SongNameSchema, song: SongSchema }));

export const MusicDeleteRequestSchema = z.object({ ...Scope, name: SongNameSchema });

export const MusicResultSchemas = {
  list: GitOpResultOf(MusicListResultSchema),
  read: GitOpResultOf(SongSchema),
  write: GitOpResultOf(MusicWriteResultSchema),
  import: GitOpResultOf(MusicImportResultSchema),
  delete: GitOpResultSchema,
} as const;
