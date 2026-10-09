import { describe, expect, it } from 'vitest';

import { SPEECH_MAX_CHARS, simplifyForSpeech } from './simplify-for-speech';

describe('simplifyForSpeech', () => {
  it('drops markdown syntax', () => {
    expect(simplifyForSpeech('## Title\n**Bold** and [a link](https://x.io) with `code`')).toBe(
      'Title. Bold and a link with code.',
    );
  });
  it('mentions code blocks instead of reading them', () => {
    const out = simplifyForSpeech('Here you go:\n```ts\nconst a = 1;\n```');
    expect(out).not.toContain('const');
    expect(out).toContain('left the code on screen');
  });
  it('summarises long lists', () => {
    const out = simplifyForSpeech('- one\n- two\n- three\n- four\n- five');
    expect(out).toBe('one, two, three, and 2 more.');
  });
  it('mentions tables and drops bare urls', () => {
    const out = simplifyForSpeech('| a | b |\n|---|---|\n| 1 | 2 |\nSee https://example.com/x');
    expect(out).toContain('table on screen');
    expect(out).toContain('a link');
    expect(out).not.toContain('example.com');
  });
  it('caps at a sentence boundary', () => {
    const out = simplifyForSpeech(Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`).join(' '));
    expect(out.length).toBeLessThanOrEqual(SPEECH_MAX_CHARS);
    expect(out.endsWith('.')).toBe(true);
  });
  it('returns empty for empty input', () => {
    expect(simplifyForSpeech('  \n ')).toBe('');
  });
});
