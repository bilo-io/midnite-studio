import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CouncilRun } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createCouncilsRunsStore, MAX_STORED_RUNS, parseStoredRuns } from './councils-runs-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-council-runs-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

function makeRun(id: string): CouncilRun {
  return {
    id,
    councilId: 'c1',
    prompt: 'topic',
    format: 'brainstorm',
    status: 'completed',
    synthProvider: 'agy',
    members: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('createCouncilsRunsStore', () => {
  it('round-trips runs through save/load', async () => {
    const dir = await tempDir();
    const store = createCouncilsRunsStore(dir);
    await store.save([makeRun('r1'), makeRun('r2')]);
    expect(await store.load()).toEqual([makeRun('r1'), makeRun('r2')]);
  });

  it('caps stored runs at MAX_STORED_RUNS, dropping the oldest first', async () => {
    const dir = await tempDir();
    const store = createCouncilsRunsStore(dir);
    const runs = Array.from({ length: MAX_STORED_RUNS + 5 }, (_, i) => makeRun(`r${i}`));
    await store.save(runs);

    const loaded = await store.load();
    expect(loaded).toHaveLength(MAX_STORED_RUNS);
    expect(loaded[0]?.id).toBe(`r${5}`);
    expect(loaded[loaded.length - 1]?.id).toBe(`r${MAX_STORED_RUNS + 4}`);
  });
});

describe('parseStoredRuns', () => {
  it('drops a malformed entry individually', () => {
    expect(parseStoredRuns({ version: 1, runs: [makeRun('r1'), { id: 'bad' }] })).toEqual([makeRun('r1')]);
  });

  it('rejects a non-object value', () => {
    expect(parseStoredRuns(null)).toEqual([]);
  });
});
