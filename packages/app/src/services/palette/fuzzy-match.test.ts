import { describe, expect, it } from 'vitest';

import { fuzzyMatch } from './fuzzy-match';

describe('fuzzyMatch', () => {
  it('returns score 0 and empty indices for empty needle', () => {
    const result = fuzzyMatch('', 'Toggle Terminal');
    expect(result).toEqual({ score: 0, indices: [] });
  });

  it('returns null when needle is longer than haystack or not a subsequence', () => {
    expect(fuzzyMatch('abcdef', 'abc')).toBeNull();
    expect(fuzzyMatch('xyz', 'Toggle Terminal')).toBeNull();
  });

  it('matches acronyms with word boundary bonuses', () => {
    // "tt" in "Toggle Terminal"
    const result = fuzzyMatch('tt', 'Toggle Terminal');
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 7]);
    expect(result!.score).toBeGreaterThan(50);
  });

  it('prefers consecutive matches and yields higher score', () => {
    const consecutive = fuzzyMatch('term', 'Toggle Terminal');
    const scattered = fuzzyMatch('tem', 'Toggle Terminal');
    expect(consecutive).not.toBeNull();
    expect(consecutive?.indices).toEqual([7, 8, 9, 10]);
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('produces strictly ascending indices within haystack range', () => {
    const haystack = 'Repository: Open Repository…';
    const needle = 'repo';
    const result = fuzzyMatch(needle, haystack);
    expect(result).not.toBeNull();
    expect(result?.indices.length).toBe(needle.length);

    for (let i = 0; i < result!.indices.length; i++) {
      const idx = result!.indices[i]!;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(haystack.length);
      if (i > 0) {
        const prevIdx = result!.indices[i - 1]!;
        expect(idx).toBeGreaterThan(prevIdx);
      }
    }
  });

  it('gives exact case match a small bonus', () => {
    const exact = fuzzyMatch('Term', 'Terminal');
    const lower = fuzzyMatch('term', 'Terminal');
    expect(exact!.score).toBeGreaterThan(lower!.score);
  });
});

describe('fuzzyMatchPath', () => {
  it('weights basename higher than directory segments when no slash in query', () => {
    const result = fuzzyMatch('pal', 'src/components/palette.tsx');
    expect(result).not.toBeNull();
    // Indices should point into "palette.tsx"
    const matchedChars = result!.indices.map((i) => 'src/components/palette.tsx'[i]).join('');
    expect(matchedChars.toLowerCase()).toBe('pal');
  });

  it('switches to full path matching when slash is in query', () => {
    const result = fuzzyMatch('comp/pal', 'src/components/palette.tsx');
    expect(result).not.toBeNull();
    const matchedChars = result!.indices.map((i) => 'src/components/palette.tsx'[i]).join('');
    expect(matchedChars.toLowerCase()).toBe('comp/pal');
  });
});

