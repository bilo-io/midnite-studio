import { afterEach, describe, expect, it, vi } from 'vitest';

// `runProcess` is stubbed so this suite never actually spawns `brew`, `go`
// or `pnpm` — it must pass on a machine with none of them installed, and
// must not depend on what happens to be on this one's PATH. Same pattern as
// `system-cache-registry.test.ts`'s own mock.
const runProcessMock = vi.hoisted(() => vi.fn());
vi.mock('../process-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../process-runner')>();
  return { ...actual, runProcess: runProcessMock };
});

import { DEFAULT_RECLAIM_COMMANDS } from './reclaim-commands';
import { DEFAULT_SYSTEM_CACHE_ENTRIES } from './system-cache-registry';
import { runReclaimCommand } from './system-cache-service';

describe('DEFAULT_RECLAIM_COMMANDS', () => {
  it('names an entryId present in DEFAULT_SYSTEM_CACHE_ENTRIES for every command', () => {
    const knownIds = new Set(DEFAULT_SYSTEM_CACHE_ENTRIES.map((e) => e.id));
    for (const command of DEFAULT_RECLAIM_COMMANDS) {
      expect(knownIds.has(command.entryId)).toBe(true);
    }
  });

  it('never builds args by concatenation — every entry is a literal array', () => {
    for (const command of DEFAULT_RECLAIM_COMMANDS) {
      expect(Array.isArray(command.args)).toBe(true);
      for (const arg of command.args) expect(typeof arg).toBe('string');
    }
  });
});

describe('runReclaimCommand', () => {
  afterEach(() => {
    runProcessMock.mockReset();
  });

  it('refuses an unknown entryId before spawning anything', async () => {
    const result = await runReclaimCommand('not-a-real-entry');
    expect(result).toEqual({
      ok: false,
      message: '"not-a-real-entry" has no registered reclaim command.',
    });
    expect(runProcessMock).not.toHaveBeenCalled();
  });

  it("passes exactly the table's command/args to runProcess, never mutated", async () => {
    runProcessMock.mockResolvedValue({
      ok: true,
      data: 'Removed 12 files, 340MB\n',
      stderr: '',
      exitCode: 0,
      ranAt: 0,
      durationMs: 0,
    });

    await runReclaimCommand('homebrew-cache');

    expect(runProcessMock).toHaveBeenCalledTimes(1);
    const [command, args] = runProcessMock.mock.calls[0] as [string, readonly string[]];
    expect(command).toBe('brew');
    expect(args).toEqual(['cleanup', '-s']);
  });

  it('reports a non-zero exit code as a failure, carrying the first line of stderr', async () => {
    runProcessMock.mockResolvedValue({
      ok: true,
      data: '',
      stderr: 'Error: something went wrong\nmore detail\n',
      exitCode: 1,
      ranAt: 0,
      durationMs: 0,
    });

    const result = await runReclaimCommand('go-build-cache');

    expect(result).toEqual({ ok: false, message: 'Error: something went wrong' });
  });

  it('maps a not-installed outcome to {ok:false} rather than throwing', async () => {
    runProcessMock.mockResolvedValue({
      ok: false,
      reason: 'not-installed',
      hint: 'The command could not be started.',
    });

    const result = await runReclaimCommand('pnpm-store');

    expect(result).toEqual({ ok: false, message: 'pnpm is not installed or not on PATH.' });
  });

  it('slices output longer than RECLAIM_OUTPUT_CAP from the END, not the head', async () => {
    const long = 'x'.repeat(9_000) + 'TAIL-MARKER';
    runProcessMock.mockResolvedValue({
      ok: true,
      data: long,
      stderr: '',
      exitCode: 0,
      ranAt: 0,
      durationMs: 0,
    });

    const result = await runReclaimCommand('go-mod-cache');

    if (!result.ok) throw new Error('expected ok:true');
    expect(result.value.stdout.length).toBe(8_000);
    expect(result.value.stdout.endsWith('TAIL-MARKER')).toBe(true);
  });
});
