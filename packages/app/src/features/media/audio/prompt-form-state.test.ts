import { AUDIO_STYLE_TAGS_MAX } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { initialPromptForm, insertLyricSection, mergeTags, promptFormReducer, toPrompt } from './prompt-form-state';

const base = () => initialPromptForm({ provider: 'import', durationS: 120, count: 2 });

describe('prompt form', () => {
  it('commits tags on comma, de-duplicates case-insensitively and caps the count', () => {
    let s = promptFormReducer(base(), { type: 'tagDraft', value: 'lofi, Jazz,' });
    expect(s.style).toEqual(['lofi', 'Jazz']);
    expect(s.tagDraft).toBe('');
    s = promptFormReducer(s, { type: 'addTag', value: 'LOFI' });
    expect(s.style).toEqual(['lofi', 'Jazz']);
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`).join(',');
    expect(mergeTags([], many)).toHaveLength(AUDIO_STYLE_TAGS_MAX);
  });

  it('clamps the variant count to 1..4', () => {
    expect(promptFormReducer(base(), { type: 'count', value: 9 }).count).toBe(4);
    expect(promptFormReducer(base(), { type: 'count', value: 0 }).count).toBe(1);
  });

  it('drops lyrics from an instrumental prompt and includes a pending tag draft', () => {
    let s = promptFormReducer(base(), { type: 'lyrics', value: '[Verse]\nla la' });
    s = promptFormReducer(s, { type: 'instrumental', value: true });
    s = promptFormReducer(s, { type: 'tagDraft', value: 'ambient' });
    expect(toPrompt(s)).toEqual({
      prompt: { title: '', style: ['ambient'], lyrics: '', instrumental: true, durationS: 120, count: 2 },
    });
  });

  it('rejects a duration outside the schema bounds', () => {
    const s = promptFormReducer(base(), { type: 'duration', value: 5 });
    expect(toPrompt(s)).toEqual({ error: expect.stringMatching(/^durationS:/) });
  });

  it('inserts section markers on their own line', () => {
    expect(insertLyricSection('', 0, 'Verse')).toEqual({ text: '[Verse]\n', caret: 8 });
    const mid = insertLyricSection('line one', 8, 'Chorus');
    expect(mid.text).toBe('line one\n\n[Chorus]\n');
    expect(mid.caret).toBe(mid.text.length);
    expect(insertLyricSection('a\n\n', 3, 'Bridge').text).toBe('a\n\n[Bridge]\n');
  });
});

describe('prompt form — local engine', () => {
  it('clamps the duration when switching to the local provider but leaves other providers alone', () => {
    const long = promptFormReducer(base(), { type: 'duration', value: 300 });
    expect(promptFormReducer(long, { type: 'provider', value: 'musicgen' }).durationS).toBe(120);
    expect(promptFormReducer(long, { type: 'provider', value: 'import' }).durationS).toBe(300);
  });

  it('carries an expanded caption and section arc into the prompt, and a hand edit drops the arc', () => {
    let s = promptFormReducer(base(), { type: 'expanded', musicPrompt: 'dark synthwave, 100 bpm', sections: ['intro', 'peak'] });
    expect(toPrompt(s)).toMatchObject({ prompt: { musicPrompt: 'dark synthwave, 100 bpm', sections: ['intro', 'peak'] } });
    s = promptFormReducer(s, { type: 'caption', value: 'my own caption' });
    expect(s.sections).toBeUndefined();
    expect(toPrompt(s)).toMatchObject({ prompt: { musicPrompt: 'my own caption' } });
    s = promptFormReducer(s, { type: 'clearCaption' });
    expect(toPrompt(s)).toMatchObject({ prompt: { musicPrompt: undefined } });
  });

  it('treats a blank caption as no caption and resets it with the rest of the form', () => {
    let s = promptFormReducer(base(), { type: 'caption', value: '   ' });
    expect((toPrompt(s) as { prompt: { musicPrompt?: string } }).prompt.musicPrompt).toBeUndefined();
    s = promptFormReducer(promptFormReducer(s, { type: 'expanded', musicPrompt: 'x', sections: ['a'] }), { type: 'reset' });
    expect(s.musicPrompt).toBeUndefined();
    expect(s.sections).toBeUndefined();
  });
});


describe('seed (Send to Generator, Phase 101 Theme K)', () => {
  it('fills the caption, tags and duration from the song description, instrumental on', () => {
    const next = promptFormReducer(initialPromptForm({ provider: 'musicgen', durationS: 60, count: 2 }), {
      type: 'seed',
      title: 'Tune',
      style: ['relaxed', 'bright', 'C major'],
      musicPrompt: 'Instrumental, relaxed.',
      durationS: 3,
    });
    expect(next).toMatchObject({ title: 'Tune', style: ['relaxed', 'bright', 'C major'], musicPrompt: 'Instrumental, relaxed.', instrumental: true, durationS: 10 });
  });
});
