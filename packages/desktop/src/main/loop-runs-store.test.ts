import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoopRunRecord } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createLoopRunsStore,
  MAX_STORED_LOOP_RUNS,
  parseStoredLoopRuns,
} from './loop-runs-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-loop-runs-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

function makeRun(id: string): LoopRunRecord {
  return {
    id,
    loopId: 'automate',
    sessionId: `s-${id}`,
    startedAt: 1,
    composedPrompt: '/loop /midnite-exec',
    checkedModifierIds: [],
    status: 'exited',
    endedAt: 2,
    exitCode: 0,
  };
}

describe('createLoopRunsStore', () => {
  it('round-trips runs through save/load', async () => {
    const store = createLoopRunsStore(await tempDir());
    await store.save([makeRun('r1'), makeRun('r2')]);
    expect(await store.load()).toEqual([makeRun('r1'), makeRun('r2')]);
  });

  it('returns an empty list when the file does not exist yet', async () => {
    expect(await createLoopRunsStore(await tempDir()).load()).toEqual([]);
  });

  it('caps stored runs at MAX_STORED_LOOP_RUNS, dropping the oldest first', async () => {
    const store = createLoopRunsStore(await tempDir());
    await store.save(Array.from({ length: MAX_STORED_LOOP_RUNS + 5 }, (_, i) => makeRun(`r${i}`)));

    const loaded = await store.load();
    expect(loaded).toHaveLength(MAX_STORED_LOOP_RUNS);
    expect(loaded[0]?.id).toBe('r5');
    expect(loaded[loaded.length - 1]?.id).toBe(`r${MAX_STORED_LOOP_RUNS + 4}`);
  });

  it('survives an unparseable file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'loop-runs.json'), '{ not json', 'utf8');
    expect(await createLoopRunsStore(dir).load()).toEqual([]);
  });
});

describe('parseStoredLoopRuns', () => {
  it('drops one malformed entry rather than the whole file', () => {
    expect(parseStoredLoopRuns({ version: 1, runs: [makeRun('r1'), { id: 'bad' }] })).toEqual([
      makeRun('r1'),
    ]);
  });

  it('returns an empty list for a shape it does not recognise', () => {
    expect(parseStoredLoopRuns(null)).toEqual([]);
    expect(parseStoredLoopRuns({})).toEqual([]);
    expect(parseStoredLoopRuns({ version: 1, runs: 'nope' })).toEqual([]);
  });

  it('keeps a still-running record — finalising it belongs to the ledger, not the store', () => {
    const running: LoopRunRecord = {
      id: 'r1',
      loopId: 'medic',
      sessionId: 's1',
      startedAt: 1,
      composedPrompt: '/loop /pr-review',
      checkedModifierIds: ['auto-approve'],
      status: 'running',
    };
    expect(parseStoredLoopRuns({ version: 1, runs: [running] })).toEqual([running]);
  });
});
