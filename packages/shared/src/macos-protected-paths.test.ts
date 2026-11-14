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
    '/Users/u/Library/Containers/com.x/Data',
    '/Users/u/Library/Group Containers/group.x',
    '/Users/u/Library/Mobile Documents/com~apple~CloudDocs/a',
    '/Users/u/Library/Calendars/x',
    '/Users/u/Library/Application Support/AddressBook/Sources',
    '/Users/u/Library/Application Support/com.apple.TCC/TCC.db',
    '/Users/u/Pictures/Photo Booth Library/x',
  ])('is true for %s', (p) => expect(isProtectedPath(p, home)).toBe(true));

  it.each([
    '/Users/u/Dev/x',
    '/Users/u/.claude/x',
    '/Users/u/Library/LaunchAgents/x',
    '/Users/u/Library/Application Support/Code/x',
    '/Users/u/Library/ContainersOld/x',
    '/Users/u',
    '/Users/u/DocumentsOld/x',
    '/Users/other/Documents/x',
  ])('is false for %s', (p) => expect(isProtectedPath(p, home)).toBe(false));

  it('lists the library paths absolutely', () => {
    expect(protectedLibraryPaths('/Users/u/')).toContain('/Users/u/Music/Music');
  });
});
