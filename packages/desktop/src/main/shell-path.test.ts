import { afterEach, describe, expect, it } from 'vitest';

import { ensureLoginShellPathAsync, mergePath, parseShellPathOutput, resolveLoginShellPathAsync } from './shell-path';

/**
 * The pure halves are unit-tested directly. `resolveLoginShellPathAsync` spawns
 * the user's real login shell, whose profile differs on every machine — so what
 * is asserted about it here is only what holds on any machine: that it resolves
 * rather than hangs, that it never rejects, and that the merge it performs is
 * additive. Its *shape* (a promise nothing awaits at boot) is what Theme B
 * changed, and the ordering that depends on it is asserted by
 * `scripts/perf/startup-report.mjs`, not here.
 */
describe('parseShellPathOutput', () => {
  it('extracts the PATH between the markers', () => {
    expect(parseShellPathOutput('__MSTUDIO_PATH_START__/opt/homebrew/bin:/usr/bin__MSTUDIO_PATH_END__')).toBe(
      '/opt/homebrew/bin:/usr/bin',
    );
  });

  it('ignores profile noise around the markers', () => {
    // The shell runs `-lic`, so banners, motd and nvm chatter land on stdout
    // alongside the answer. That is exactly why the markers exist.
    const output = [
      'Last login: Mon Aug 25',
      'nvm: using node 22',
      '__MSTUDIO_PATH_START__/usr/local/bin__MSTUDIO_PATH_END__',
      '',
    ].join('\n');

    expect(parseShellPathOutput(output)).toBe('/usr/local/bin');
  });

  it('takes the last occurrence when a profile echoes the command line', () => {
    const output =
      'printf __MSTUDIO_PATH_START__${PATH}__MSTUDIO_PATH_END__\n__MSTUDIO_PATH_START__/real/path__MSTUDIO_PATH_END__';
    expect(parseShellPathOutput(output)).toBe('/real/path');
  });

  it('returns null when the markers are missing or the value is empty', () => {
    expect(parseShellPathOutput('some broken profile output')).toBeNull();
    expect(parseShellPathOutput('__MSTUDIO_PATH_START__   __MSTUDIO_PATH_END__')).toBeNull();
    expect(parseShellPathOutput('__MSTUDIO_PATH_START__/no/end/marker')).toBeNull();
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

describe('resolveLoginShellPathAsync', () => {
  it('resolves to a PATH string or null, never rejects', async () => {
    const resolved = await resolveLoginShellPathAsync();
    expect(resolved === null || typeof resolved === 'string').toBe(true);
    // A resolved PATH is colon-joined absolute dirs, never the empty string —
    // `parseShellPathOutput` returns null for empty rather than ''.
    if (resolved !== null) expect(resolved.length).toBeGreaterThan(0);
  });

  it('resolves rather than hanging when the shell outruns its timeout', async () => {
    /*
      1ms was assumed to be unbeatable by a process spawn — it is not. On an
      idle CI runner the login shell occasionally answers first and the call
      returns a real PATH, which made this the repo's most frequent CI flake
      (four false reds across #195, #198 and #199 alone).

      What the timeout actually guarantees is that the call SETTLES, not which
      way: the kill path returns null and the winning shell returns its PATH,
      and both are correct outcomes of a 1ms deadline. So the assertion is that
      it resolves to one of the two within a real deadline — a hang, which is
      the regression this test exists to catch, still fails it.
    */
    const resolved = await resolveLoginShellPathAsync(1);
    expect(resolved === null || typeof resolved === 'string').toBe(true);
  }, 5_000);
});

describe('ensureLoginShellPathAsync', () => {
  const before = process.env['PATH'];
  afterEach(() => {
    process.env['PATH'] = before;
  });

  it('never drops a directory the process already had', async () => {
    const sentinel = '/__mstudio_sentinel__';
    process.env['PATH'] = `${sentinel}:${before ?? ''}`;
    await ensureLoginShellPathAsync();
    // Whether the probe succeeded or failed soft, the sentinel survives: on
    // success `mergePath` appends what the resolved PATH lacks, on failure the
    // function is a no-op. Losing a dir here would break git for the session.
    expect(process.env['PATH']).toContain(sentinel);
  }, 15_000);
});
