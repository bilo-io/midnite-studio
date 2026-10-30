import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoopRunRecord } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLoopRunsFiles, MAX_STORED_LOOP_RUNS, parseStoredLoopRuns } from './loop-runs-files';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'midnite-loop-runs-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

function makeRun(id: string, startedAt = 1): LoopRunRecord {
  return {
    id,
    loopId: 'automate',
    sessionId: `s-${id}`,
    startedAt,
    composedPrompt: '/loop /midnite-create',
    checkedModifierIds: [],
    status: 'exited',
    endedAt: startedAt + 1,
    exitCode: 0,
  };
}

describe('createLoopRunsFiles', () => {
  it('round-trips an app’s own runs through save/load', async () => {
    const files = createLoopRunsFiles({ directory: await tempDir(), appId: 'studio', warn: () => {} });
    await files.save([makeRun('r1'), makeRun('r2')]);
    expect(await files.load()).toEqual([makeRun('r1'), makeRun('r2')]);
  });

  it('returns an empty list when the app has no file yet', async () => {
    const files = createLoopRunsFiles({ directory: await tempDir(), appId: 'studio', warn: () => {} });
    expect(await files.load()).toEqual([]);
    expect(await files.loadAll()).toEqual([]);
  });

  it('keeps only the newest MAX_STORED_LOOP_RUNS per file', async () => {
    const files = createLoopRunsFiles({ directory: await tempDir(), appId: 'studio', warn: () => {} });
    const runs = Array.from({ length: MAX_STORED_LOOP_RUNS + 5 }, (_, i) => makeRun(`r${i}`, i + 1));
    await files.save(runs);
    const loaded = await files.load();
    expect(loaded).toHaveLength(MAX_STORED_LOOP_RUNS);
    expect(loaded[0]?.id).toBe('r5');
  });

  it('merges two apps’ files newest first, each run tagged with its app, one writer per file', async () => {
    const directory = await tempDir();
    const studio = createLoopRunsFiles({ directory, appId: 'studio', warn: () => {} });
    const vanguard = createLoopRunsFiles({ directory, appId: 'vanguard', warn: () => {} });
    await studio.save([makeRun('a', 10), makeRun('c', 30)]);
    await vanguard.save([makeRun('b', 20)]);

    const merged = await studio.loadAll();
    expect(merged.map((run) => [run.id, run.appId])).toEqual([
      ['c', 'studio'],
      ['b', 'vanguard'],
      ['a', 'studio'],
    ]);
    // The tag is derived, never stored: each file holds only its own app's runs.
    expect(await studio.load()).toEqual([makeRun('a', 10), makeRun('c', 30)]);
    expect(await vanguard.loadAll()).toEqual(merged);
  });

  it('skips a corrupt file with exactly one warn, however often it is read', async () => {
    const directory = await tempDir();
    const warn = vi.fn();
    const studio = createLoopRunsFiles({ directory, appId: 'studio', warn });
    await studio.save([makeRun('a', 10)]);
    await writeFile(join(directory, 'vault.json'), '{ not json', 'utf8');

    expect((await studio.loadAll()).map((run) => run.id)).toEqual(['a']);
    await studio.loadAll();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('vault.json');
  });

  it('drops a bad entry rather than the file', () => {
    const good = makeRun('ok');
    expect(parseStoredLoopRuns({ version: 1, runs: [good, { nope: true }] })).toEqual([good]);
    expect(parseStoredLoopRuns(null)).toEqual([]);
    expect(parseStoredLoopRuns({ runs: 'x' })).toEqual([]);
  });

  describe('migrateFrom', () => {
    it('copies the old userData file into the app’s own, leaving the old one in place', async () => {
      const directory = join(await tempDir(), 'loop-runs');
      const legacyDir = await tempDir();
      const legacy = join(legacyDir, 'loop-runs.json');
      await writeFile(legacy, JSON.stringify({ version: 1, runs: [makeRun('old', 5)] }), 'utf8');
      const files = createLoopRunsFiles({ directory, appId: 'studio', warn: () => {} });

      expect(await files.migrateFrom(legacy)).toBe(true);
      expect(await files.load()).toEqual([makeRun('old', 5)]);
      expect(await readFile(legacy, 'utf8')).toContain('"old"');
    });

    it('does nothing once the app has a file, or when there is no old one', async () => {
      const directory = await tempDir();
      const legacyDir = await tempDir();
      const legacy = join(legacyDir, 'loop-runs.json');
      const files = createLoopRunsFiles({ directory, appId: 'studio', warn: () => {} });
      expect(await files.migrateFrom(legacy)).toBe(false);

      await files.save([makeRun('mine', 7)]);
      await writeFile(legacy, JSON.stringify({ version: 1, runs: [makeRun('old', 5)] }), 'utf8');
      expect(await files.migrateFrom(legacy)).toBe(false);
      expect(await files.load()).toEqual([makeRun('mine', 7)]);
    });
  });

  describe('watch', () => {
    it('announces another app’s write once, debounced, and ignores its own file and temp files', async () => {
      vi.useFakeTimers();
      let emit: (event: string, name: string | null) => void = () => {};
      const files = createLoopRunsFiles({
        directory: await tempDir(),
        appId: 'studio',
        warn: () => {},
        debounceMs: 50,
        watch: (_dir, listener) => {
          emit = listener;
          return { close: () => {} };
        },
      });
      const heard = vi.fn();
      files.onChanged(heard);
      files.watch();

      emit('rename', 'studio.json');
      emit('rename', '.vanguard.json.123.abcd.tmp');
      vi.advanceTimersByTime(100);
      expect(heard).not.toHaveBeenCalled();

      emit('rename', 'vanguard.json');
      emit('change', 'vanguard.json');
      vi.advanceTimersByTime(100);
      expect(heard).toHaveBeenCalledTimes(1);
      files.close();
    });
  });
});
