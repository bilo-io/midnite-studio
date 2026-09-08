import { describe, expect, it } from 'vitest';

import {
  COMPANION_FILLER_SPACING_MS,
  COMPANION_TTS_CHUNK_CHARS,
  COMPANION_WHISTLE_MELODIES,
  DEFAULT_STT_PROVIDER_ID,
  MELODY_REST,
  STT_PROVIDER_IDS,
  SttProviderIdSchema,
  chunkForSpeech,
  melodyDurationSeconds,
  melodyFrequencies,
  midiToFrequency,
  nextFillerDelayMs,
} from './companion';

/**
 * Phase 79 Themes F and G's own half of `companion.ts`.
 *
 * A separate file from `companion.test.ts` on purpose: three agents build the
 * eight themes of this phase in parallel, and one shared test file is the
 * cheapest possible merge conflict. The module under test is the same one.
 */

describe('chunkForSpeech', () => {
  it('leaves anything already short enough as one utterance', () => {
    expect(chunkForSpeech('Here we are.')).toEqual(['Here we are.']);
  });

  it('normalises the newlines summariseDigest hands it', () => {
    expect(chunkForSpeech('Two commits landed.\n\nNothing is open.')).toEqual([
      'Two commits landed. Nothing is open.',
    ]);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkForSpeech('')).toEqual([]);
    expect(chunkForSpeech('   \n  ')).toEqual([]);
  });

  it('never exceeds the limit — the whole point of the Chromium workaround', () => {
    const long = Array.from({ length: 60 }, (_, index) => `Sentence number ${index}.`).join(' ');
    const chunks = chunkForSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(COMPANION_TTS_CHUNK_CHARS);
  });

  it('loses no words', () => {
    const long = Array.from({ length: 40 }, (_, index) => `Line ${index} of the read back.`).join(
      ' ',
    );
    expect(chunkForSpeech(long).join(' ')).toBe(long);
  });

  it('packs short sentences together rather than one chunk each', () => {
    expect(chunkForSpeech('One. Two. Three.', 50)).toEqual(['One. Two. Three.']);
  });

  it('breaks a single over-long sentence on its clause boundaries', () => {
    const clauses = `${'a'.repeat(30)}, ${'b'.repeat(30)}, ${'c'.repeat(30)}`;
    const chunks = chunkForSpeech(clauses, 40);
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(40);
  });

  it('slices a single token longer than the limit rather than dropping it', () => {
    const token = 'x'.repeat(45);
    expect(chunkForSpeech(token, 20)).toEqual(['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(5)]);
  });

  it('treats a nonsense limit as one character rather than looping', () => {
    expect(chunkForSpeech('ab', 0)).toEqual(['a', 'b']);
  });
});

describe('the STT provider seam', () => {
  it('reserves deepgram in the union with openai-whisper shipping first', () => {
    expect(STT_PROVIDER_IDS).toEqual(['openai-whisper', 'deepgram']);
    expect(DEFAULT_STT_PROVIDER_ID).toBe('openai-whisper');
  });

  it('rejects an unknown provider id at the boundary', () => {
    expect(SttProviderIdSchema.safeParse('whisper.cpp').success).toBe(false);
  });
});

describe('nextFillerDelayMs', () => {
  it('spans exactly the phase doc window at the extremes', () => {
    expect(nextFillerDelayMs(() => 0)).toBe(COMPANION_FILLER_SPACING_MS.min);
    expect(nextFillerDelayMs(() => 1)).toBe(COMPANION_FILLER_SPACING_MS.max);
    expect(nextFillerDelayMs(() => 0.5)).toBe(32_500);
  });

  it('clamps an rng that misbehaves rather than scheduling a negative timer', () => {
    expect(nextFillerDelayMs(() => -5)).toBe(COMPANION_FILLER_SPACING_MS.min);
    expect(nextFillerDelayMs(() => 5)).toBe(COMPANION_FILLER_SPACING_MS.max);
  });
});

describe('midiToFrequency', () => {
  /** The golden set: concert A, the C either side of it, and the whistle's own range. */
  it('matches equal temperament against known pitches', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.625565, 5);
    expect(midiToFrequency(72)).toBeCloseTo(523.251131, 5);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
    expect(midiToFrequency(84)).toBeCloseTo(1046.502261, 5);
  });

  it('is exactly an octave per twelve semitones', () => {
    expect(midiToFrequency(84) / midiToFrequency(72)).toBeCloseTo(2, 10);
  });

  it('reads a rest, and anything unusable, as silence', () => {
    expect(midiToFrequency(MELODY_REST)).toBe(0);
    expect(midiToFrequency(Number.NaN)).toBe(0);
  });
});

describe('COMPANION_WHISTLE_MELODIES', () => {
  it('ships five melodies of eight to twelve notes', () => {
    expect(COMPANION_WHISTLE_MELODIES).toHaveLength(5);
    for (const melody of COMPANION_WHISTLE_MELODIES) {
      expect(melody.notes.length).toBeGreaterThanOrEqual(8);
      expect(melody.notes.length).toBeLessThanOrEqual(12);
    }
  });

  it('keeps every pitch inside a range a whistle can actually reach', () => {
    for (const melody of COMPANION_WHISTLE_MELODIES) {
      for (const [midi] of melody.notes) {
        if (midi === MELODY_REST) continue;
        expect(midi).toBeGreaterThanOrEqual(72);
        expect(midi).toBeLessThanOrEqual(88);
      }
    }
  });

  it('gives every note a positive length and every melody a tempo', () => {
    for (const melody of COMPANION_WHISTLE_MELODIES) {
      expect(melody.bpm).toBeGreaterThan(0);
      for (const [, beats] of melody.notes) expect(beats).toBeGreaterThan(0);
    }
  });

  it('finishes inside one filler gap, so a whistle never overlaps the next', () => {
    for (const melody of COMPANION_WHISTLE_MELODIES) {
      const seconds = melodyDurationSeconds(melody);
      expect(seconds).toBeGreaterThan(2);
      expect(seconds * 1000).toBeLessThan(COMPANION_FILLER_SPACING_MS.min);
    }
  });

  it('encodes rests as 0 Hz so whistle.ts needs no per-note branch', () => {
    const shrug = COMPANION_WHISTLE_MELODIES[2];
    expect(shrug?.name).toBe('shrug');
    expect(melodyFrequencies(shrug!)).toContain(0);
  });

  it('has unique names, so a melody can be picked by one', () => {
    const names = COMPANION_WHISTLE_MELODIES.map((melody) => melody.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
