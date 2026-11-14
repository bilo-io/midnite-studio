import { describe, expect, it } from 'vitest';

import { isProtectedPath, protectedLibraryPaths } from './macos-protected-paths';

const home = '/Users/u';

describe('isProtectedPath', () => {
  it.each([
    '/Users/u/Documents/x',
    '/Users/u/Documents',
    '/Users/u/Downloads/a.dmg',
    '/Users/u/Pictures/Photos Library.photoslibrary/originals/1.jpg',
    '/Users/u/Music/Music/Media/a.m4a',
    '/Users/u/Library/Mail/V10',
  ])('is true for %s', (p) => expect(isProtectedPath(p, home)).toBe(true));

  it.each([
    '/Users/u/Dev/x',
    '/Users/u/.claude/x',
    '/Users/u/Library/LaunchAgents/x',
    '/Users/u',
    '/Users/u/DocumentsOld/x',
    '/Users/other/Documents/x',
  ])('is false for %s', (p) => expect(isProtectedPath(p, home)).toBe(false));

  it('lists the library paths absolutely', () => {
    expect(protectedLibraryPaths('/Users/u/')).toContain('/Users/u/Music/Music');
  });
});
