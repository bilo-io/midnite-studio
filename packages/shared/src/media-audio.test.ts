import { describe, expect, it } from 'vitest';

import {
  AudioPromptSchema,
  audioSidecarPath,
  isAudioPath,
  parseAudioProjectFile,
  parseAudioSidecar,
} from './media';

describe('Audio contract (Phase 99 Theme E)', () => {
  it('fills prompt defaults and bounds every field', () => {
    expect(AudioPromptSchema.parse({})).toEqual({
      title: '',
      style: [],
      lyrics: '',
      instrumental: false,
      durationS: 120,
      count: 2,
    });
    expect(AudioPromptSchema.safeParse({ count: 5 }).success).toBe(false);
    expect(AudioPromptSchema.safeParse({ durationS: 9 }).success).toBe(false);
    expect(AudioPromptSchema.safeParse({ style: [''] }).success).toBe(false);
    expect(AudioPromptSchema.parse({ title: '  Night  ' }).title).toBe('Night');
  });

  it('recognises audio paths and derives sidecars', () => {
    expect(isAudioPath('a/b/Song.FLAC')).toBe(true);
    expect(isAudioPath('project.json')).toBe(false);
    expect(isAudioPath('mp3')).toBe(false);
    expect(audioSidecarPath('dir/take.1.wav')).toBe('dir/take.1.json');
  });

  it('reads a broken project.json or sidecar as empty rather than throwing', () => {
    expect(parseAudioProjectFile('{nope')).toEqual({ version: 1, sessions: [] });
    expect(parseAudioProjectFile(null)).toEqual({ version: 1, sessions: [] });
    expect(parseAudioSidecar('{"version":2}')).toBeNull();
    expect(parseAudioSidecar('{"version":1,"file":"a.mp3","sessionId":"s","provider":"import","title":"A","createdAt":"t"}')).toMatchObject({
      file: 'a.mp3',
    });
  });
});
