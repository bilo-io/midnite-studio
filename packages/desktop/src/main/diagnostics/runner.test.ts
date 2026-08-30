import type { DiagnosticsCommand } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { runDiagnostics, type SpawnFn, type SpawnedProcess } from './runner';

const command: DiagnosticsCommand = {
  command: '/repo/node_modules/.bin/eslint',
  args: ['.', '--format', 'json'],
  parser: 'eslint',
  ecosystem: 'javascript',
};

/**
 * A child process that talks back on command.
 *
 * The point of injecting the spawn function: the deadline, the kill and every
 * reason code are exercised here without a linter, a repository or a real
 * process anywhere.
 */
function fakeChild() {
  const handlers: {
    stdout: ((c: string) => void)[];
    stderr: ((c: string) => void)[];
    error: ((e: NodeJS.ErrnoException) => void)[];
    close: ((c: number | null) => void)[];
  } = { stdout: [], stderr: [], error: [], close: [] };
  const kill = vi.fn();

  const process: SpawnedProcess = {
    onStdout: (h) => handlers.stdout.push(h),
    onStderr: (h) => handlers.stderr.push(h),
    onError: (h) => handlers.error.push(h),
    onClose: (h) => handlers.close.push(h),
    kill,
  };

  return {
    process,
    kill,
    stdout: (chunk: string) => handlers.stdout.forEach((h) => h(chunk)),
    stderr: (chunk: string) => handlers.stderr.forEach((h) => h(chunk)),
    emitError: (error: NodeJS.ErrnoException) => handlers.error.forEach((h) => h(error)),
    close: (code: number | null = 0) => handlers.close.forEach((h) => h(code)),
  };
}

const report = JSON.stringify([
  { filePath: '/repo/a.ts', messages: [{ ruleId: 'r', severity: 2, message: 'boom', line: 1, column: 1 }] },
]);

describe('runDiagnostics', () => {
  it('spawns the command in the checkout, with its args as a vector', async () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);

    const promise = runDiagnostics(command, '/repo', { spawn });
    child.stdout(report);
    child.close(1);
    await promise;

    // An argument array, never a shell string — there is no shell to quote for.
    expect(spawn).toHaveBeenCalledWith(command.command, command.args, '/repo');
  });

  it('treats a non-zero exit as success when the report parsed', async () => {
    // eslint exits 1 whenever it found a single error, which is the NORMAL
    // case here. Reading the exit code would make a repo with problems report
    // nothing at all.
    const child = fakeChild();
    const promise = runDiagnostics(command, '/repo', { spawn: () => child.process });
    child.stdout(report);
    child.close(1);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.ok && result.errorCount).toBe(1);
  });

  it('stamps ranAt and a non-negative duration', async () => {
    const child = fakeChild();
    let clock = 1_000;
    const promise = runDiagnostics(command, '/repo', {
      spawn: () => child.process,
      now: () => (clock += 500),
    });
    child.stdout(report);
    child.close(0);

    const result = await promise;
    expect(result.ok && result.durationMs).toBeGreaterThan(0);
    expect(result.ok && result.ranAt).toBeGreaterThan(0);
  });

  it('kills the child and reports timed-out at the deadline', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const promise = runDiagnostics(command, '/repo', { spawn: () => child.process, timeoutMs: 50 });
      vi.advanceTimersByTime(51);

      const result = await promise;
      expect(result).toMatchObject({ ok: false, reason: 'timed-out' });
      // SIGKILL, not a polite signal: a wedged linter is precisely the process
      // that ignores one.
      expect(child.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a late close after the deadline has already settled it', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const promise = runDiagnostics(command, '/repo', { spawn: () => child.process, timeoutMs: 50 });
      vi.advanceTimersByTime(51);
      child.stdout(report);
      child.close(0);

      expect(await promise).toMatchObject({ reason: 'timed-out' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports not-installed when the binary has gone', async () => {
    const child = fakeChild();
    const promise = runDiagnostics(command, '/repo', { spawn: () => child.process });
    child.emitError(Object.assign(new Error('nope'), { code: 'ENOENT' }));

    const result = await promise;
    expect(result).toMatchObject({ ok: false, reason: 'not-installed' });
    expect(result.ok === false && result.hint).toContain('no longer on disk');
  });

  it('reports not-installed when spawn throws synchronously', async () => {
    // An invalid cwd throws rather than emitting 'error'; both paths have to
    // reach the same reason code.
    const result = await runDiagnostics(command, '/repo', {
      spawn: () => {
        throw Object.assign(new Error('bad cwd'), { code: 'ENOENT' });
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'not-installed' });
  });

  it('reports parse-failed when the tool printed something else', async () => {
    const child = fakeChild();
    const promise = runDiagnostics(command, '/repo', { spawn: () => child.process });
    child.stdout('Oops, not JSON');
    child.close(2);

    expect(await promise).toMatchObject({ ok: false, reason: 'parse-failed' });
  });

  it('prefers stderr for the hint, as one line', async () => {
    const child = fakeChild();
    const promise = runDiagnostics(command, '/repo', { spawn: () => child.process });
    child.stderr('Cannot find module "eslint-plugin-x"\n  at Object.<anonymous>\n  at Module._compile');
    child.close(2);

    const result = await promise;
    expect(result.ok === false && result.hint).toBe('Cannot find module "eslint-plugin-x"');
  });

  it('never rejects, whatever the child does', async () => {
    const child = fakeChild();
    const promise = runDiagnostics(command, '/repo', { spawn: () => child.process });
    child.close(null);
    await expect(promise).resolves.toMatchObject({ ok: false });
  });
});
