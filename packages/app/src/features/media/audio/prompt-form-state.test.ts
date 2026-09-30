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
