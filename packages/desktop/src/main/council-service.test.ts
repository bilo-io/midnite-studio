import { beforeEach, describe, expect, it } from 'vitest';

import type { CouncilRun } from '@midnite/studio-shared';

import { configureCouncils, listRunsForCouncil, resetCouncilsForTest, saveRun } from './council-service';
import { MAX_STORED_RUNS, type CouncilsRunsStore } from './councils-runs-store';
import { nullCouncilsStore } from './councils-store';

/** A store over an array, mirroring `loop-runs.test.ts`'s `fakeStore`. */
function fakeRunsStore(seed: CouncilRun[] = []): CouncilsRunsStore & { saved: CouncilRun[][] } {
  const saved: CouncilRun[][] = [];
  return {
    saved,
    load: async () => seed,
    save: async (runs) => {
      saved.push([...runs]);
    },
  };
}

const run = (over: Partial<CouncilRun> = {}): CouncilRun => ({
  id: 'r1',
  councilId: 'c1',
  prompt: 'test prompt',
  format: 'brainstorm',
  status: 'completed',
  synthProvider: 'agy',
  members: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  resetCouncilsForTest();
});

describe('the in-memory run ledger is capped, not just the disk copy (Phase 45 Theme D)', () => {
  it('never holds more than MAX_STORED_RUNS records, even mid-session with no reload', async () => {
    configureCouncils(nullCouncilsStore, fakeRunsStore());

    for (let i = 0; i < MAX_STORED_RUNS + 10; i += 1) {
      await saveRun(run({ id: `r-${i}`, councilId: 'c1' }));
    }

    const runs = await listRunsForCouncil('c1');
    expect(runs).toHaveLength(MAX_STORED_RUNS);
    // Oldest dropped, not newest — the most recently saved run always survives.
    expect(runs.at(-1)?.id).toBe(`r-${MAX_STORED_RUNS + 9}`);
  });

  it('an update to an existing run never counts as growth', async () => {
    const store = fakeRunsStore();
    configureCouncils(nullCouncilsStore, store);

    await saveRun(run({ id: 'r1', status: 'running' }));
    await saveRun(run({ id: 'r1', status: 'completed' }));

    const runs = await listRunsForCouncil('c1');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('completed');
  });
});
