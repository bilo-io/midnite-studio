import type { TestSuite } from '@midnite/git-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnFn, SpawnedProcess } from '../process-runner';
import { runTestSuite } from './runner';

const suite: TestSuite = {
  id: 'app::test',
  package: 'packages/app',
  packageName: '@midnite/git-app',
  name: 'test',
  kind: 'unit',
  source: 'package.json',
  sourceFile: 'packages/app/package.json',
  displayCommand: 'pnpm run test',
  run: { command: 'pnpm', args: ['run', 'test'], cwd: '/repo/packages/app' },
};

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
    stdout: (c: string) => handlers.stdout.forEach((h) => h(c)),
    close: (code: number | null = 0) => handlers.close.forEach((h) => h(code)),
  };
}

describe('runTestSuite', () => {
  it('spawns the suite\'s own argument vector in its own cwd', async () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    const promise = runTestSuite(suite, { spawn });
    child.close(0);
    await promise;
    expect(spawn).toHaveBeenCalledWith('pnpm', ['run', 'test'], '/repo/packages/app');
  });

  it('parses a structured vitest report and marks structured: true', async () => {
    const child = fakeChild();
    const promise = runTestSuite(suite, { spawn: () => child.process });
    child.stdout(JSON.stringify({ numTotalTests: 1, numPassedTests: 1, testResults: [] }));
    child.close(0);
    const result = await promise;
    expect(result).toMatchObject({ ok: true, structured: true, passed: 1, failed: 0, exitCode: 0 });
  });

  it('falls back to exit code plus raw output for an unrecognised runner', async () => {
    const child = fakeChild();
    const promise = runTestSuite(suite, { spawn: () => child.process });
    child.stdout('ok 1 - some tap output\n');
    child.close(1);
    const result = await promise;
    expect(result).toMatchObject({
      ok: true,
      structured: false,
      passed: 0,
      failed: 0,
      exitCode: 1,
    });
    expect(result.ok && result.output).toContain('ok 1 - some tap output');
  });

  it('streams every chunk to onChunk as it arrives, for the live output pane', async () => {
    const child = fakeChild();
    const chunks: string[] = [];
    const promise = runTestSuite(suite, { spawn: () => child.process, onChunk: (c) => chunks.push(c) });
    child.stdout('a');
    child.stdout('b');
    child.close(0);
    await promise;
    expect(chunks).toEqual(['a', 'b']);
  });

  it('never rejects on a wedged process — reports timed-out', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const promise = runTestSuite(suite, { spawn: () => child.process, timeoutMs: 10 });
      vi.advanceTimersByTime(11);
      await expect(promise).resolves.toMatchObject({ ok: false, reason: 'timed-out' });
    } finally {
      vi.useRealTimers();
    }
  });
});
