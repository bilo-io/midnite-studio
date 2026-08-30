import { describe, expect, it } from 'vitest';

import { parseOsc7 } from './parse-osc7';

const HOST = 'bilos-mac.local';

describe('parseOsc7', () => {
  it('accepts the empty host', () => {
    expect(parseOsc7('file:///Users/x/Dev/midnite-git', HOST)).toBe('/Users/x/Dev/midnite-git');
  });

  it('accepts localhost', () => {
    expect(parseOsc7('file://localhost/Users/x/Dev', HOST)).toBe('/Users/x/Dev');
  });

  it('accepts this machine, in full or by its first label', () => {
    expect(parseOsc7(`file://${HOST}/Users/x`, HOST)).toBe('/Users/x');
    expect(parseOsc7('file://bilos-mac/Users/x', HOST)).toBe('/Users/x');
    expect(parseOsc7('file://BILOS-MAC.LOCAL/Users/x', HOST)).toBe('/Users/x');
  });

  /*
    The rejection that earns the host check. A shell inside `ssh` emits OSC 7
    for a path on the REMOTE machine; taking it would have the header name a
    local repository the terminal is not in — confidently, and wrongly.
  */
  it('rejects another machine', () => {
    expect(parseOsc7('file://build-server/var/www', HOST)).toBeNull();
    expect(parseOsc7('file://build-server/Users/x/Dev/midnite-git', HOST)).toBeNull();
  });

  it('rejects a remote host when this machine has no name to compare', () => {
    expect(parseOsc7('file://build-server/var/www', null)).toBeNull();
    expect(parseOsc7('file://build-server/var/www', undefined)).toBeNull();
    // …but the hostless spellings still work without one.
    expect(parseOsc7('file:///var/www', null)).toBe('/var/www');
  });

  it('percent-decodes the path', () => {
    expect(parseOsc7('file:///Users/x/My%20Documents/a%2Bb', HOST)).toBe(
      '/Users/x/My Documents/a+b',
    );
    expect(parseOsc7('file:///Users/x/caf%C3%A9', HOST)).toBe('/Users/x/café');
  });

  it('drops a trailing slash so comparisons downstream do not have to', () => {
    expect(parseOsc7('file:///Users/x/Dev/', HOST)).toBe('/Users/x/Dev');
    // …except at the root, which IS its own trailing slash.
    expect(parseOsc7('file:///', HOST)).toBe('/');
  });

  it('rejects a payload that is not a file URI', () => {
    expect(parseOsc7('/Users/x/Dev', HOST)).toBeNull();
    expect(parseOsc7('http://example.com/x', HOST)).toBeNull();
    expect(parseOsc7('', HOST)).toBeNull();
    expect(parseOsc7('file:', HOST)).toBeNull();
  });

  it('rejects a host with no path at all', () => {
    expect(parseOsc7('file://localhost', HOST)).toBeNull();
    expect(parseOsc7('file://', HOST)).toBeNull();
  });

  /*
    `decodeURIComponent('%')` throws, and a shell writing mid-sequence can hand
    the parser a truncated escape.
  */
  it('rejects a malformed percent escape instead of throwing', () => {
    expect(() => parseOsc7('file:///Users/x/%', HOST)).not.toThrow();
    expect(parseOsc7('file:///Users/x/%', HOST)).toBeNull();
    expect(parseOsc7('file:///Users/x/%ZZ', HOST)).toBeNull();
  });

  /*
    Refused rather than resolved. `resolveRepoForPath` matches on string
    prefixes, so `/Dev/midnite-git/../other` would prefix-match `midnite-git`
    and label the header with a repository the shell has just left.
  */
  it('rejects a path with a `..` segment rather than mislabelling it', () => {
    expect(parseOsc7('file://localhost/../etc', HOST)).toBeNull();
    expect(parseOsc7('file:///Users/x/Dev/midnite-git/../other', HOST)).toBeNull();
    expect(parseOsc7('file:///Users/x/Dev/..', HOST)).toBeNull();
    // …but a directory whose NAME merely contains dots is fine.
    expect(parseOsc7('file:///Users/x/..config/a..b', HOST)).toBe('/Users/x/..config/a..b');
  });

  it('accepts a host matching this machine in full, either way round', () => {
    // `$HOST` short where `os.hostname()` is qualified, and the reverse.
    expect(parseOsc7('file://mac/Users/x', 'mac.local')).toBe('/Users/x');
    expect(parseOsc7('file://mac.local/Users/x', 'mac')).toBe('/Users/x');
  });

  /*
    The loose version of the check above — comparing first label to first label
    — accepts any host that merely shares a prefix segment.
  */
  it('rejects a host that only shares a first label', () => {
    expect(parseOsc7('file://bilos-mac.attacker.example/etc', HOST)).toBeNull();
    expect(parseOsc7('file://127.0.0.2/etc', '127.0.0.1')).toBeNull();
  });
});
