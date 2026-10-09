import { MUSIC_MAX_BPM, MUSIC_MIN_BPM, MUSIC_PPQ, type Song } from '@midnite/studio-shared';

/**
 * The prompts behind the music agent engines (Phase 101 Theme H). A refining agent holds the `music_*`
 * tools and writes bar by bar, looking at piano-roll previews between passes; a single-pass engine
 * (Ollama, or Antigravity before Midnite is registered in its MCP config) writes the whole song as one
 * JSON object, which is validated against `SongSchema` and sent back for repair when it does not fit.
 */

const TICKS = `Time is in ticks, ${MUSIC_PPQ} per quarter note: a quarter note lasts ${MUSIC_PPQ}, an eighth ${MUSIC_PPQ / 2}, a sixteenth ${MUSIC_PPQ / 4}; a 4/4 bar is ${MUSIC_PPQ * 4} ticks and bar n starts at tick (n-1)*${MUSIC_PPQ * 4}. Pitches are MIDI note numbers (60 = middle C, 36 = a low C, 72 = the C above middle C); velocity is 1-127. General MIDI programs are 0-127 (0 piano, 33 fingered bass, 25 acoustic guitar, 40 violin, 48 strings, 80 square lead); channel 9 is the drum kit, where the pitch picks the drum (36 kick, 38 snare, 42 closed hat, 46 open hat, 49 crash).`;

export function buildMusicIterativePrompt(input: {
  prompt: string;
  target: { repoPath: string; project: string; name: string };
  maxPasses: number;
  /** The song already has notes: start from it rather than from nothing. */
  editing: boolean;
}): string {
  const target = JSON.stringify(input.target);
  return [
    'You are composing and editing a song in Midnite Studio with the music_* tools. You have no other tools: do not look for files, do not write code, do not reply with JSON.',
    '',
    `Every tool call takes this target: ${target}`,
    '',
    `Request: ${input.prompt.trim()}`,
    '',
    TICKS,
    '',
    'Work in this loop — plan, then write, then listen with your eyes:',
    input.editing
      ? '1. Call music_get_info and music_get_tracks to see what is already there; keep what the request does not ask you to change.'
      : '1. Call music_get_info once to see the empty song, then plan: tempo, key, the bar count, which instruments and what each plays.',
    `2. Set the tempo with music_set_tempo (${MUSIC_MIN_BPM}-${MUSIC_MAX_BPM} BPM) and make a track per instrument with music_add_track (a General MIDI program, and channel 9 for drums).`,
    '3. Write the music with music_add_notes, a few bars at a time per track (at most 2000 notes a call). A call that returns "ok": false changed nothing — read its errors and retry. Use music_remove_notes to take notes out of a tick range before rewriting it. music_add_cc (7 volume, 10 pan, 1 modulation, 64 sustain) and music_add_pitchbends add expression.',
    `4. Call music_render_preview for a bar range to SEE the piano roll (you have ${input.maxPasses} previews in total). Look for empty bars, notes piled on one pitch, clashes between tracks, a melody that never moves, drums off the beat — then fix the biggest problem with music_remove_notes and music_add_notes.`,
    '5. Repeat 3 and 4, then finish by calling music_save. A song that was never saved is lost.',
    '',
    'Write real music: a steady groove, a bass line that follows the chords, a melody with a shape (rise and fall, repeated and varied motifs), and an ending. Vary velocity. Keep every note inside the song (start + duration within 2000 bars) and never stack more than a handful of notes at the same tick on one track.',
    '',
    'When it is saved, reply with one short sentence describing what you wrote.',
  ].join('\n');
}

const EXAMPLE = {
  name: 'Sunrise',
  tempos: [{ tick: 0, bpm: 100 }],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  tracks: [
    {
      id: 'bass',
      name: 'Bass',
      channel: 0,
      program: 33,
      color: '#6366f1',
      notes: [
        { pitch: 36, startTick: 0, durationTicks: 960, velocity: 100 },
        { pitch: 43, startTick: 960, durationTicks: 960, velocity: 92 },
      ],
    },
    {
      id: 'drums',
      name: 'Drums',
      channel: 9,
      program: 0,
      color: '#f59e0b',
      notes: [
        { pitch: 36, startTick: 0, durationTicks: 120, velocity: 110 },
        { pitch: 42, startTick: 240, durationTicks: 120, velocity: 70 },
      ],
    },
  ],
};

export const SONG_JSON_RULES = `You compose songs as JSON. Reply with ONE JSON object and nothing else — no prose, no markdown fence.

${TICKS}

Shape: { "name", "tempos": [{ "tick": 0, "bpm" }], "timeSignatures": [{ "tick": 0, "numerator", "denominator" }], "tracks": [{ "id" (unique), "name", "channel" 0-15, "program" 0-127, "color" "#rrggbb", "notes": [{ "pitch", "startTick", "durationTicks", "velocity" }], "controlChanges": [{ "tick", "controller", "value" }], "pitchBends": [{ "tick", "value" }] }] }.

Rules:
- Start with tempos at tick 0 and a 4/4 time signature at tick 0 unless the request says otherwise.
- Write 2 to 6 tracks (for example drums on channel 9, a bass line, chords, a melody), 8 to 32 bars, with a beginning, a middle and an end.
- Every note needs a pitch (0-127), a startTick, durationTicks of at least 1 and a velocity of 1-127. Keep the notes of a track in time order.
- Use only the fields above.`;

export function buildSongPrompt(input: { prompt: string; existing?: Song | undefined }): string {
  const existing =
    input.existing && input.existing.tracks.length > 0
      ? ['', 'The song as it is now (change it as the request asks, and reply with the whole song):', JSON.stringify(input.existing).slice(0, 12_000)]
      : [];
  return [SONG_JSON_RULES, '', 'Example of the shape — a bass and a drum track:', JSON.stringify(EXAMPLE), ...existing, '', `Request: ${input.prompt.trim()}`, '', 'JSON:'].join('\n');
}

export function buildSongRepairPrompt(input: { previousReply: string; error: string }): string {
  return [
    SONG_JSON_RULES,
    '',
    'Your previous reply could not be used:',
    input.error,
    '',
    'Previous reply:',
    input.previousReply.slice(0, 6000),
    '',
    'Reply again with the corrected JSON object only.',
  ].join('\n');
}

/** The first `{ … }` in a reply, so a stray fence or a sentence before it does not sink the whole answer. */
export function extractJsonObject(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const body = (fenced?.[1] ?? reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The reply holds no JSON object.');
  return JSON.parse(body.slice(start, end + 1));
}
