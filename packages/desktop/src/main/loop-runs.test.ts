import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoopRunRecord } from '@midnite/studio-shared';

import {
  configureLoopRuns,
  listLoopRuns,
  noteSessionExit,
  startLoopRun,
  stopLoopRun,
} from './loop-runs';
import { MAX_STORED_LOOP_RUNS, type LoopRunsStore } from './loop-runs-store';

/** A store over an array, so a test can seed what "the last launch left". */
function fakeStore(seed: LoopRunRecord[] = []): LoopRunsStore & { saved: LoopRunRecord[][] } {
  const saved: LoopRunRecord[][] = [];
  return {
    saved,
    load: async () => seed,
    save: async (runs) => {
      saved.push([...runs]);
    },
  };
}

const configure = (store: LoopRunsStore) => configureLoopRuns(store, () => null);

const record = (over: Partial<LoopRunRecord> = {}): LoopRunRecord => ({
  id: 'r1',
  loopId: 'automate',
  sessionId: 's1',
  startedAt: 1,
  composedPrompt: '/loop /midnite-exec',
  checkedModifierIds: [],
  status: 'running',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('startLoopRun', () => {
  it('mints the record in main — the renderer supplies neither id nor clock', async () => {
    configure(fakeStore());
    const run = await startLoopRun({
      loopId: 'medic',
      sessionId: 's-medic',
      composedPrompt: '/loop /pr-review',
      checkedModifierIds: ['auto-approve'],
    });

    expect(run.id).toBeTruthy();
    expect(run.status).toBe('running');
    expect(run.startedAt).toBeGreaterThan(0);
    expect(await listLoopRuns()).toEqual([run]);
  });
});

describe('the in-memory ledger is capped, not just the disk copy (Phase 45 Theme D)', () => {
  it('never holds more than MAX_STORED_LOOP_RUNS records, even mid-session with no reload', async () => {
    configure(fakeStore());

    for (let i = 0; i < MAX_STORED_LOOP_RUNS + 10; i += 1) {
      await startLoopRun({
        loopId: 'automate',
        sessionId: `s-${i}`,
        composedPrompt: '/loop /midnite-exec',
        checkedModifierIds: [],
      });
    }

    const runs = await listLoopRuns();
    expect(runs).toHaveLength(MAX_STORED_LOOP_RUNS);
    // Oldest dropped, not newest — the most recent run is always the last one started.
    expect(runs.at(-1)?.sessionId).toBe(`s-${MAX_STORED_LOOP_RUNS + 9}`);
  });
});

describe('ensureLoaded', () => {
  it('finalises a run left `running` by the last launch — its pty died with the app', async () => {
    const store = fakeStore([record({ id: 'stale' })]);
    configure(store);

    const [run] = await listLoopRuns();
    expect(run?.status).toBe('stopped');
    // And the correction is written back, not just presented.
    expect(store.saved.at(-1)?.[0]?.status).toBe('stopped');
  });

  it('leaves an already-finalised run exactly as it found it', async () => {
    const finished = record({ status: 'exited', endedAt: 9, exitCode: 0 });
    const store = fakeStore([finished]);
    configure(store);

    expect(await listLoopRuns()).toEqual([finished]);
    // Nothing to correct, so nothing is rewritten.
    expect(store.saved).toHaveLength(0);
  });
});

describe('noteSessionExit', () => {
  it('finalises the run that session was hosting, carrying the exit code', async () => {
    configure(fakeStore());
    const run = await startLoopRun({
      loopId: 'watchdog',
      sessionId: 's-watchdog',
      composedPrompt: '/loop /midnite-address-issue',
      checkedModifierIds: [],
    });

    noteSessionExit('s-watchdog', 3);
    await vi.waitFor(async () => {
      const [stored] = await listLoopRuns();
      expect(stored?.status).toBe('exited');
    });

    const [stored] = await listLoopRuns();
    expect(stored?.id).toBe(run.id);
    expect(stored?.exitCode).toBe(3);
    expect(stored?.endedAt).toBeGreaterThanOrEqual(stored?.startedAt ?? 0);
  });

  it('is a no-op for an ordinary terminal — it fires for EVERY pty exit', async () => {
    configure(fakeStore());
    await startLoopRun({
      loopId: 'automate',
      sessionId: 's-loop',
      composedPrompt: '/loop /midnite-exec',
      checkedModifierIds: [],
    });

    noteSessionExit('s-some-shell', 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await listLoopRuns())[0]?.status).toBe('running');
  });
});

describe('a Stop racing the pty exit it causes', () => {
  it('finalises once, as stopped — the second arrival finds nothing running', async () => {
    configure(fakeStore());
    await startLoopRun({
      loopId: 'innovate',
      sessionId: 's-innovate',
      composedPrompt: '/loop /midnite-brainstorm',
      checkedModifierIds: [],
    });

    // Both in flight before either settles: the mutation lock is what keeps
    // the second from clobbering the first's write.
    const stopping = stopLoopRun('s-innovate');
    noteSessionExit('s-innovate', 0);
    await stopping;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const runs = await listLoopRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('stopped');
    expect(runs[0]?.exitCode).toBeUndefined();
  });

  it('stopping a session with no running record is silent', async () => {
    configure(fakeStore());
    await expect(stopLoopRun('s-nothing')).resolves.toBeUndefined();
  });
});
