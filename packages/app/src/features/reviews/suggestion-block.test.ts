import { describe, expect, it } from 'vitest';

import { extractSuggestion } from './suggestion-block';

describe('extractSuggestion', () => {
  it('extracts a single suggestion fence on its own', () => {
    const body = '```suggestion\nconst x = 2;\n```';
    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('extracts a suggestion fence wrapped in prose before and after', () => {
    const body = [
      'please fix the typo:',
      '',
      '```suggestion',
      'const x = 2;',
      '```',
      '',
      'thanks!',
    ].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('returns null when no suggestion fence is present', () => {
    expect(extractSuggestion('just a comment, no code at all')).toBeNull();
    expect(extractSuggestion('```ts\nconst x = 2;\n```')).toBeNull();
  });

  it('uses the first of two separate suggestion fences, not the last', () => {
    const body = [
      '```suggestion',
      'const first = 1;',
      '```',
      '',
      'and also:',
      '',
      '```suggestion',
      'const second = 2;',
      '```',
    ].join('\n');

    expect(extractSuggestion(body)).toBe('const first = 1;');
  });

  it('finds a suggestion fence nested inside a blockquote', () => {
    const body = ['> please apply:', '>', '> ```suggestion', '> const x = 2;', '> ```'].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('finds a suggestion fence nested inside a list item', () => {
    const body = ['- fix this:', '  ```suggestion', '  const x = 2;', '  ```'].join('\n');

    expect(extractSuggestion(body)).toBe('const x = 2;');
  });

  it('preserves multi-line replacement content exactly, including blank lines', () => {
    const body = '```suggestion\nline one\n\nline three\n```';
    expect(extractSuggestion(body)).toBe('line one\n\nline three');
  });

  it('treats any fence tagged `suggestion` as real, even a nonsense one', () => {
    // GitHub itself makes the same simplification — this phase does not try
    // to be stricter than the platform whose syntax it is reading.
    const body = '```suggestion\n¯\\_(ツ)_/¯\n```';
    expect(extractSuggestion(body)).toBe('¯\\_(ツ)_/¯');
  });
});
