import { describe, expect, it } from 'vitest';

import { parseGitVersion, releaseNotesUrl } from './git-version';

describe('parseGitVersion', () => {
  it('reads the version out of a macOS vendor line', () => {
    // The exact string this machine's `git --version` produces, and the one in
    // the screenshot that prompted the change.
    expect(parseGitVersion('git version 2.39.5 (Apple Git-154)')).toEqual({
      number: '2.39.5',
      label: 'v2.39.5',
      releaseNotesUrl: 'https://github.com/git/git/blob/master/Documentation/RelNotes/2.39.5.txt',
    });
  });

  it('reads a bare source-build line', () => {
    expect(parseGitVersion('git version 2.43.0')?.label).toBe('v2.43.0');
  });

  it('stops at the upstream number on a Windows vendor line', () => {
    // `2.45.2.windows.1` — `.windows` is not a numeric component, so the match
    // ends at `2.45.2`, which is the release that actually has upstream notes.
    expect(parseGitVersion('git version 2.45.2.windows.1')?.number).toBe('2.45.2');
  });

  it('handles a two-component version', () => {
    expect(parseGitVersion('git version 2.39')?.label).toBe('v2.39');
  });

  it('returns null rather than guessing when there is no number', () => {
    expect(parseGitVersion('git version unknown')).toBeNull();
  });

  it('returns null for null, undefined and empty input', () => {
    expect(parseGitVersion(null)).toBeNull();
    expect(parseGitVersion(undefined)).toBeNull();
    expect(parseGitVersion('')).toBeNull();
  });
});

describe('releaseNotesUrl', () => {
  it('pins to master, not to a v<version> tag', () => {
    // A vendor build can report a version never tagged upstream; RelNotes files
    // are never removed from the tree, so `master` always resolves.
    expect(releaseNotesUrl('2.39.5')).toContain('/blob/master/');
    expect(releaseNotesUrl('2.39.5')).not.toContain('/v2.39.5/');
  });
});
