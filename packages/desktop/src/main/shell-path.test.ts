import { describe, expect, it } from 'vitest';

import { mergePath, parseShellPathOutput } from './shell-path';

/**
 * Only the pure halves are unit-tested; `resolveLoginShellPath` spawns the
 * user's real login shell, whose profile is different on every machine.
 */
describe('parseShellPathOutput', () => {
  it('extracts the PATH between the markers', () => {
    expect(parseShellPathOutput('__MGIT_PATH_START__/opt/homebrew/bin:/usr/bin__MGIT_PATH_END__')).toBe(
      '/opt/homebrew/bin:/usr/bin',
    );
  });

  it('ignores profile noise around the markers', () => {
    // The shell runs `-lic`, so banners, motd and nvm chatter land on stdout
    // alongside the answer. That is exactly why the markers exist.
    const output = [
      'Last login: Mon Aug 25',
      'nvm: using node 22',
      '__MGIT_PATH_START__/usr/local/bin__MGIT_PATH_END__',
      '',
    ].join('\n');

    expect(parseShellPathOutput(output)).toBe('/usr/local/bin');
  });

  it('takes the last occurrence when a profile echoes the command line', () => {
    const output =
      'printf __MGIT_PATH_START__${PATH}__MGIT_PATH_END__\n__MGIT_PATH_START__/real/path__MGIT_PATH_END__';
    expect(parseShellPathOutput(output)).toBe('/real/path');
  });

  it('returns null when the markers are missing or the value is empty', () => {
    expect(parseShellPathOutput('some broken profile output')).toBeNull();
    expect(parseShellPathOutput('__MGIT_PATH_START__   __MGIT_PATH_END__')).toBeNull();
    expect(parseShellPathOutput('__MGIT_PATH_START__/no/end/marker')).toBeNull();
  });
});

describe('mergePath', () => {
  it('puts the login-shell PATH first, keeping the user ordering', () => {
    // Order matters: a user who put ~/bin ahead of /usr/bin means it.
    expect(mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin')).toBe(
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
  });

  it('never drops a directory the process already had', () => {
    expect(mergePath('/electron/only', '/shell/path')).toBe('/shell/path:/electron/only');
  });

  it('does not duplicate shared entries', () => {
    expect(mergePath('/usr/bin', '/usr/bin')).toBe('/usr/bin');
  });

  it('tolerates an unset current PATH', () => {
    expect(mergePath(undefined, '/shell/path')).toBe('/shell/path');
  });
});
