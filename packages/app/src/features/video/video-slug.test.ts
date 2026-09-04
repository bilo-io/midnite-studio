import { describe, expect, it } from 'vitest';

import { slugifyProjectTitle } from './video-slug';

describe('slugifyProjectTitle', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyProjectTitle('COP31 Showreel')).toBe('cop31-showreel');
  });

  it('collapses runs of non-alphanumeric characters into one hyphen', () => {
    expect(slugifyProjectTitle("Client's  Notes -- v2!")).toBe('client-s-notes-v2');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugifyProjectTitle('  -- Hello -- ')).toBe('hello');
  });

  it('returns an empty string for a title with no alphanumeric characters', () => {
    expect(slugifyProjectTitle('!!!')).toBe('');
  });
});
