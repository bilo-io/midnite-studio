import { describe, expect, it, vi } from 'vitest';

import { firstLine, realSpawn, runProcess, type ProcessSink, type SpawnFn, type SpawnedProcess } from './process-runner';

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

const echoSink: ProcessSink<string> = {
  push: () => undefined,
  finish: () => ({ ok: true, data: 'done' }),
};

describe('runProcess', () => {
  it('spawns the command as an argument vector, never a shell string', async () => {
    const child = fakeChild();
    const spawn = vi.fn<SpawnFn>(() => child.process);
    const promise = runProcess('vitest', ['run'], '/repo', { spawn, sink: echoSink });
    child.close(0);
    await promise;
    expect(spawn).toHaveBeenCalledWith('vitest', ['run'], '/repo');
  });

  it('resolves ok with the sink\'s data and a non-negative duration', async () => {
    const child = fakeChild();
    let clock = 1_000;
    const promise = runProcess('x', [], '/repo', {
      spawn: () => child.process,
      now: () => (clock += 500),
      sink: echoSink,
    });
    child.close(0);
    const result = await promise;
    expect(result).toMatchObject({ ok: true, data: 'done' });
    expect(result.ok && result.durationMs).toBeGreaterThan(0);
  });

  it('streams chunks to onChunk as they arrive, in addition to the sink', async () => {
    const child = fakeChild();
    const chunks: string[] = [];
    const promise = runProcess('x', [], '/repo', {
      spawn: () => child.process,
      sink: echoSink,
      onChunk: (c) => chunks.push(c),
    });
    child.stdout('hello ');
    child.stderr('world');
    child.close(0);
    await promise;
    expect(chunks).toEqual(['hello ', 'world']);
  });

  it('kills and reports timed-out at the deadline', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const promise = runProcess('x', [], '/repo', {
        spawn: () => child.process,
        sink: echoSink,
        timeoutMs: 50,
      });
      vi.advanceTimersByTime(51);
      const result = await promise;
      expect(result).toMatchObject({ ok: false, reason: 'timed-out' });
      expect(child.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports not-installed on ENOENT', async () => {
    const child = fakeChild();
    const promise = runProcess('x', [], '/repo', { spawn: () => child.process, sink: echoSink });
    child.emitError(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    const result = await promise;
    expect(result).toMatchObject({ ok: false, reason: 'not-installed' });
  });

  it('prefers stderr for a parse-failed hint, falling back to the sink\'s own', async () => {
    const child = fakeChild();
    const failingSink: ProcessSink<string> = { push: () => undefined, finish: () => ({ ok: false, hint: 'sink hint' }) };

    const withStderr = runProcess('x', [], '/repo', { spawn: () => child.process, sink: failingSink });
    child.stderr('boom\nmore detail');
    child.close(1);
    expect(await withStderr).toMatchObject({ ok: false, reason: 'parse-failed', hint: 'boom' });
  });

  it('never rejects, whatever the child does', async () => {
    const child = fakeChild();
    const promise = runProcess('x', [], '/repo', { spawn: () => child.process, sink: echoSink });
    child.close(null);
    await expect(promise).resolves.toMatchObject({ ok: true });
  });
});

describe('firstLine', () => {
  it('takes the first non-blank line, capped', () => {
    expect(firstLine('\n\n  hello world  \nsecond line')).toBe('hello world');
    expect(firstLine('')).toBe('');
  });
});

describe('realSpawn kill', () => {
  it('signals the whole process group, not just the child', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const spawned = realSpawn(process.execPath, ['--version'], process.cwd());
      spawned.kill();
      expect(killSpy).toHaveBeenCalled();
      const [target, signal] = killSpy.mock.calls[0] ?? [];
      expect(signal).toBe('SIGKILL');
      expect(typeof target === 'number' && target < 0).toBe(true);
    } finally {
      killSpy.mockRestore();
    }
  });
});
