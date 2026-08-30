import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './protocol-parse';

describe('parseDeepLink', () => {
  it('parses valid open deep link', () => {
    expect(parseDeepLink('midnite-studio://open?repo=%2FUsers%2Ffoo%2Fbar')).toEqual({
      kind: 'open',
      repo: '/Users/foo/bar',
    });
  });

  it('parses valid clone deep link', () => {
    expect(parseDeepLink('midnite-studio://clone?url=https%3A%2F%2Fgithub.com%2Ffoo%2Fbar.git')).toEqual({
      kind: 'clone',
      url: 'https://github.com/foo/bar.git',
    });
  });

  it('rejects foreign schemes, relative paths, and NUL bytes', () => {
    expect(parseDeepLink('https://open?repo=/tmp')).toBeNull();
    expect(parseDeepLink('midnite-studio://open?repo=relative/path')).toBeNull();
    expect(parseDeepLink('midnite-studio://open?repo=/tmp%00foo')).toBeNull();
    expect(parseDeepLink('midnite-studio://clone?url=file%3A%2F%2Fetc%2Fpasswd')).toBeNull();
  });
});
