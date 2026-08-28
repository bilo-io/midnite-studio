import { describe, expect, it } from 'vitest';

import { joinRelPath, parentOf, validateEntryName } from './use-file-actions';

describe('validateEntryName', () => {
  it('accepts an ordinary name with no siblings', () => {
    expect(validateEntryName('readme.md', [])).toBeNull();
  });

  it('refuses an empty name', () => {
    expect(validateEntryName('', [])).not.toBeNull();
  });

  it('refuses a name containing a path separator', () => {
    expect(validateEntryName('a/b', [])).not.toBeNull();
  });

  it.each(['.', '..', '.git'])('refuses the reserved name %s', (name) => {
    expect(validateEntryName(name, [])).not.toBeNull();
  });

  it('refuses a collision with an existing sibling', () => {
    expect(validateEntryName('index.ts', ['index.ts', 'app.ts'])).not.toBeNull();
  });

  it('allows a name that only collides with itself once excluded by the caller', () => {
    // TreeRow filters the entry's own current name out of siblingNames before
    // validating a rename, so re-committing the unchanged name never errors.
    const siblings = ['app.ts', 'index.ts'].filter((name) => name !== 'index.ts');
    expect(validateEntryName('index.ts', siblings)).toBeNull();
  });
});

describe('joinRelPath', () => {
  it('joins under a non-root parent', () => {
    expect(joinRelPath('src/features', 'file-tree.tsx')).toBe('src/features/file-tree.tsx');
  });

  it('does not prefix a slash at the root', () => {
    expect(joinRelPath('', 'README.md')).toBe('README.md');
  });
});

describe('parentOf', () => {
  it('returns the root for a top-level path', () => {
    expect(parentOf('README.md')).toBe('');
  });

  it('returns everything before the last segment', () => {
    expect(parentOf('src/features/file-tree.tsx')).toBe('src/features');
  });
});
