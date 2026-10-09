import { z } from 'zod';

/**
 * General MIDI instruments for the Music editor (Phase 101 Theme D).
 *
 * The 128 GM programs, grouped by the standard 16 families, plus the channel-10 drum kit. Each
 * program maps to one pre-rendered FluidR3_GM sample set (one MP3 per note) from
 * `gleitz/midi-js-soundfonts`; main downloads a set the first time it is used and caches it under
 * `userData`, the renderer plays it through a per-track `Tone.Sampler`. Zod-only: no I/O here.
 *
 * Licence verdict (checked 2026-10-09 from primary sources, recorded in the Theme D PR):
 * - FluidR3_GM.sf2 is MIT, "Copyright (c) 2000-2002, 2008 Frank Wen" (the soundfont's own README).
 * - `gleitz/midi-js-soundfonts` redistributes the pre-rendered samples under CC BY 3.0 (its README)
 *   and its code under MIT (LICENSE.txt, Copyright 2012 Benjamin Gleitzman).
 * Both permit use and redistribution with attribution, so the sets are usable; the Editor's about
 * popover shows {@link GM_ATTRIBUTION}.
 */

/** The one place the third-party sample host is named. Mirroring into `midnite-apps` is deferred (outstanding.md). */
export const GM_SAMPLE_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';

/** The 0-based MIDI channel General MIDI reserves for percussion ("channel 10"). */
export const GM_DRUM_CHANNEL = 9;

export const GM_FAMILIES = [
  'Piano',
  'Chromatic Percussion',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Synth Lead',
  'Synth Pad',
  'Synth Effects',
  'Ethnic',
  'Percussive',
  'Sound Effects',
] as const;
export type GmFamily = (typeof GM_FAMILIES)[number];

/** Sample-set ids in program order — the folder names upstream publishes (`names.json`). */
const GM_IDS = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff',
  'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere',
  'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot',
] as const;

export type GmProgramInfo = {
  /** 0-127, the MIDI program number. */
  program: number;
  /** The upstream sample-set folder, e.g. `acoustic_grand_piano`. */
  id: string;
  /** Display name, e.g. `Acoustic Grand Piano`. */
  name: string;
  family: GmFamily;
};

const GM_SPECIAL_NAMES: Record<string, string> = {
  honkytonk_piano: 'Honky-tonk Piano',
  lead_8_bass__lead: 'Lead 8 (Bass + Lead)',
};

function gmDisplayName(id: string): string {
  const special = GM_SPECIAL_NAMES[id];
  if (special) return special;
  return id
    .split('_')
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** All 128 programs, index === program number. */
export const GM_PROGRAMS: readonly GmProgramInfo[] = GM_IDS.map((id, program) => ({
  program,
  id,
  name: gmDisplayName(id),
  family: GM_FAMILIES[Math.floor(program / 8)] as GmFamily,
}));

export function gmProgram(program: number): GmProgramInfo | undefined {
  return GM_PROGRAMS[program];
}

/** Programs grouped by family, in family order. */
export function gmProgramsByFamily(): Array<{ family: GmFamily; programs: GmProgramInfo[] }> {
  return GM_FAMILIES.map((family, index) => ({
    family,
    programs: GM_PROGRAMS.slice(index * 8, index * 8 + 8),
  }));
}

/** Where one program's sample-set script lives upstream (one request, every note inline). */
export function gmSampleSetUrl(program: number, baseUrl: string = GM_SAMPLE_BASE_URL): string | undefined {
  const info = gmProgram(program);
  return info ? `${baseUrl}/${info.id}-mp3.js` : undefined;
}

/**
 * The channel-10 drum kit: GM percussion notes 35-81. Upstream publishes no FluidR3 percussion set,
 * so the kit is synthesised in the renderer (always available, nothing to download).
 */
export type GmDrumVoice = 'kick' | 'snare' | 'hat' | 'tom' | 'cymbal' | 'perc';
export const GM_DRUM_KIT: ReadonlyArray<{ note: number; name: string; voice: GmDrumVoice }> = [
  { note: 35, name: 'Acoustic Bass Drum', voice: 'kick' },
  { note: 36, name: 'Bass Drum 1', voice: 'kick' },
  { note: 37, name: 'Side Stick', voice: 'perc' },
  { note: 38, name: 'Acoustic Snare', voice: 'snare' },
  { note: 39, name: 'Hand Clap', voice: 'snare' },
  { note: 40, name: 'Electric Snare', voice: 'snare' },
  { note: 41, name: 'Low Floor Tom', voice: 'tom' },
  { note: 42, name: 'Closed Hi-Hat', voice: 'hat' },
  { note: 43, name: 'High Floor Tom', voice: 'tom' },
  { note: 44, name: 'Pedal Hi-Hat', voice: 'hat' },
  { note: 45, name: 'Low Tom', voice: 'tom' },
  { note: 46, name: 'Open Hi-Hat', voice: 'hat' },
  { note: 47, name: 'Low-Mid Tom', voice: 'tom' },
  { note: 48, name: 'Hi-Mid Tom', voice: 'tom' },
  { note: 49, name: 'Crash Cymbal 1', voice: 'cymbal' },
  { note: 50, name: 'High Tom', voice: 'tom' },
  { note: 51, name: 'Ride Cymbal 1', voice: 'cymbal' },
  { note: 52, name: 'Chinese Cymbal', voice: 'cymbal' },
  { note: 53, name: 'Ride Bell', voice: 'cymbal' },
  { note: 54, name: 'Tambourine', voice: 'perc' },
  { note: 55, name: 'Splash Cymbal', voice: 'cymbal' },
  { note: 56, name: 'Cowbell', voice: 'perc' },
  { note: 57, name: 'Crash Cymbal 2', voice: 'cymbal' },
  { note: 59, name: 'Ride Cymbal 2', voice: 'cymbal' },
];

/** The attribution the Editor's about popover must show. */
export const GM_ATTRIBUTION = {
  soundfont: 'FluidR3_GM.sf2 — Copyright (c) 2000-2002, 2008 Frank Wen, released under the MIT licence.',
  samples:
    'Pre-rendered instrument samples from MIDI.js Soundfonts by Benjamin Gleitzman (gleitz/midi-js-soundfonts), generated from FluidR3_GM.sf2 and released under Creative Commons Attribution 3.0.',
  url: 'https://github.com/gleitz/midi-js-soundfonts',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
} as const;

// ---- IPC payloads ----------------------------------------------------------------------------

export const GmProgramSchema = z.number().int().min(0).max(127);

/** `mstudio:media:gm-status` — which programs are already on disk. */
export const GmStatusResponseSchema = z.object({
  cached: z.array(GmProgramSchema),
});
export type GmStatusResponse = z.infer<typeof GmStatusResponseSchema>;

/** `mstudio:media:gm-ensure` / `gm-load` request. */
export const GmProgramRequestSchema = z.object({ program: GmProgramSchema });
export type GmProgramRequest = z.infer<typeof GmProgramRequestSchema>;

/** `gm-load` answer: note name (`C4`, `Db3`) to a base64 MP3, ready to decode in the renderer. */
export const GmLoadResultSchema = z.object({
  program: GmProgramSchema,
  notes: z.record(z.string(), z.string()),
});
export type GmLoadResult = z.infer<typeof GmLoadResultSchema>;

/** `mstudio:media:gm-progress` event. */
export const GmProgressSchema = z.object({
  program: GmProgramSchema,
  phase: z.enum(['download', 'ready', 'failed']),
  fraction: z.number().min(0).max(1),
  message: z.string().optional(),
});
export type GmProgress = z.infer<typeof GmProgressSchema>;
