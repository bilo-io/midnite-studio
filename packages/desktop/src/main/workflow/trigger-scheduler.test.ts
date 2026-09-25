import { describe, expect, it, vi } from 'vitest';
import type {
  ForgePull,
  ForgeSubscriptionKind,
  GitOpResult,
  Workflow,
  WorkflowNode,
  WorkflowRun,
} from '@midnite/studio-shared';

import { TriggerScheduler, matchesBranchFilter, type TriggerSchedulerDeps } from './trigger-scheduler';

function triggerNode(config: Extract<WorkflowNode, { kind: 'trigger' }>['config']): WorkflowNode {
  return { id: 't', label: 'Start', x: 0, y: 0, kind: 'trigger', config };
}

function workflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: 'w1',
    name: 'Nightly',
    nodes: [triggerNode({ on: 'manual' })],
    edges: [],
    createdAt: 1,
    updatedAt: 2,
    ...over,
  };
}

function pull(over: Partial<ForgePull> = {}): ForgePull {
  return {
    id: 'gql1',
    number: 1,
    title: 'Add feature',
    state: 'open',
    isDraft: false,
    reviewDecision: null,
    checks: null,
    headBranch: 'feature/x',
    author: 'octocat',
    url: 'https://github.com/o/r/pull/1',
    mergedAt: null,
    closedAt: null,
    ...over,
  };
}

function makeDeps(overrides: Partial<TriggerSchedulerDeps> = {}) {
  const timers = new Map<string, () => void>();
  let seq = 0;
  let now = 0;
  const runWorkflowCalls: Array<{ workflowId: string; payload: unknown }> = [];
  const forgeChangeListeners: Array<(repoId: string, kind: ForgeSubscriptionKind) => void> = [];
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];
  let isRunning = false;

  const deps: TriggerSchedulerDeps = {
    now: () => now,
    setTimeout: (fn) => {
      const handle = `t${seq++}`;
      timers.set(handle, fn);
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as string);
    },
    isWorkflowRunning: async () => isRunning,
    runWorkflow: async (workflowId, triggerPayload): Promise<GitOpResult<WorkflowRun>> => {
      runWorkflowCalls.push({ workflowId, payload: triggerPayload });
      return { ok: true, value: {} as WorkflowRun };
    },
    subscribeForgePulls: (repoId) => subscribed.push(repoId),
    unsubscribeForgePulls: (repoId) => unsubscribed.push(repoId),
    onForgeChanged: (listener) => {
      forgeChangeListeners.push(listener);
      return () => {
        const i = forgeChangeListeners.indexOf(listener);
        if (i !== -1) forgeChangeListeners.splice(i, 1);
      };
    },
    fetchOpenPulls: async () => [],
    log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    ...overrides,
  };

  return {
    deps,
    timers,
    setNow: (ms: number) => {
      now = ms;
    },
    setRunning: (v: boolean) => {
      isRunning = v;
    },
    runWorkflowCalls,
    fireAllForgeChanges: (repoId: string, kind: ForgeSubscriptionKind) => {
      for (const listener of [...forgeChangeListeners]) listener(repoId, kind);
    },
    // Real `setTimeout` is one-shot — it clears itself once fired, unlike a
    // repeating interval — so the fake must too, or a re-arm inside the
    // fired callback looks like two live timers instead of one.
    fireTimer: (handle: string) => {
      const fn = timers.get(handle);
      timers.delete(handle);
      return fn?.();
    },
    firstTimerHandle: () => [...timers.keys()][0],
    subscribed,
    unsubscribed,
  };
}

describe('matchesBranchFilter', () => {
  it('matches everything when unset', () => {
    expect(matchesBranchFilter('anything', undefined)).toBe(true);
  });

  it('supports a `*`-glob', () => {
    expect(matchesBranchFilter('release/1.2', 'release/*')).toBe(true);
    expect(matchesBranchFilter('release', 'release/*')).toBe(false);
    expect(matchesBranchFilter('feature/x', 'release/*')).toBe(false);
  });

  it('is an exact match with no wildcard', () => {
    expect(matchesBranchFilter('main', 'main')).toBe(true);
    expect(matchesBranchFilter('main-2', 'main')).toBe(false);
  });
});

describe('TriggerScheduler — schedule', () => {
  it('arms one timer to the next due tick for an enabled schedule trigger', () => {
    const { deps, timers } = makeDeps();
    const scheduler = new TriggerScheduler(deps);
    const wf = workflow({ nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] });

    scheduler.reconcile([wf]);
    expect(scheduler.scheduleCountForTests()).toBe(1);
    expect(timers.size).toBe(1);
  });

  it('never arms a disabled workflow, a manual trigger, or a workflow with no trigger', () => {
    const { deps, timers } = makeDeps();
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([
      workflow({ id: 'a', enabled: false, nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] }),
      workflow({ id: 'b', nodes: [triggerNode({ on: 'manual' })] }),
      workflow({ id: 'c', nodes: [] }),
    ]);

    expect(scheduler.scheduleCountForTests()).toBe(0);
    expect(timers.size).toBe(0);
  });

  it('fires exactly once per due tick, re-arms for the next one, and never replays a missed tick', async () => {
    const { deps, fireTimer, firstTimerHandle, runWorkflowCalls, timers } = makeDeps();
    deps.now = () => new Date(2024, 0, 1, 8, 59, 0).getTime();
    const scheduler = new TriggerScheduler(deps);
    const wf = workflow({ nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] });

    scheduler.reconcile([wf]);
    expect(timers.size).toBe(1);

    const handle = firstTimerHandle()!;
    await fireTimer(handle);
    expect(runWorkflowCalls).toEqual([{ workflowId: 'w1', payload: undefined }]);
    // Re-armed to the NEXT day's tick — a second timer now exists, computed
    // fresh from `now`, never a queued replay of the one that just fired.
    expect(timers.size).toBe(1);
    expect(firstTimerHandle()).not.toBe(handle);
  });

  it('skips a fire while the workflow already has a live run, and records the skip', async () => {
    const { deps, fireTimer, firstTimerHandle, runWorkflowCalls, setRunning } = makeDeps();
    setRunning(true);
    const scheduler = new TriggerScheduler(deps);
    const wf = workflow({ nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] });

    scheduler.reconcile([wf]);
    await fireTimer(firstTimerHandle()!);

    expect(runWorkflowCalls).toEqual([]);
    expect(scheduler.lastTriggerSkip('w1')).toMatchObject({ reason: 'already-running' });
  });

  it('re-reconciling with an unchanged cron leaves the existing timer alone', () => {
    const { deps, timers } = makeDeps();
    const scheduler = new TriggerScheduler(deps);
    const wf = workflow({ nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] });

    scheduler.reconcile([wf]);
    const before = [...timers.keys()][0];
    scheduler.reconcile([wf]);
    expect([...timers.keys()][0]).toBe(before);
  });

  it('stops the timer once the trigger is removed or the workflow is disabled', () => {
    const { deps, timers } = makeDeps();
    const scheduler = new TriggerScheduler(deps);
    const wf = workflow({ nodes: [triggerNode({ on: 'schedule', cron: '0 9 * * *' })] });

    scheduler.reconcile([wf]);
    expect(timers.size).toBe(1);

    scheduler.reconcile([{ ...wf, enabled: false }]);
    expect(timers.size).toBe(0);
    expect(scheduler.scheduleCountForTests()).toBe(0);
  });
});

describe('TriggerScheduler — forge-pr', () => {
  function forgeWorkflow(over: Partial<Extract<WorkflowNode, { kind: 'trigger' }>['config']> = {}): Workflow {
    return workflow({
      nodes: [
        triggerNode({
          on: 'forge-pr',
          repoId: 'repo-1',
          events: ['opened', 'updated'],
          ...over,
        } as Extract<WorkflowNode, { kind: 'trigger' }>['config']),
      ],
    });
  }

  it('subscribes on reconcile and seeds a snapshot without firing anything', async () => {
    const fetchOpenPulls = vi.fn(async () => [pull()]);
    const { deps, subscribed, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow()]);
    await Promise.resolve();
    await Promise.resolve();

    expect(subscribed).toEqual(['repo-1']);
    expect(fetchOpenPulls).toHaveBeenCalledTimes(1); // the seed read
    expect(runWorkflowCalls).toEqual([]); // never fires for a PR already open at subscribe time
  });

  it('fires exactly once when a forge projection change surfaces a genuinely new PR ("opened")', async () => {
    let pulls = [pull()];
    const fetchOpenPulls = vi.fn(async () => pulls);
    const { deps, fireAllForgeChanges, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow()]);
    await Promise.resolve();
    await Promise.resolve();

    pulls = [pull(), pull({ number: 2, title: 'Second PR', headBranch: 'feature/y' })];
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runWorkflowCalls).toHaveLength(1);
    expect(runWorkflowCalls[0]!.payload).toEqual({
      number: 2,
      title: 'Second PR',
      headRef: 'feature/y',
      url: pull().url,
      author: pull().author,
    });

    // A second, identical notification with no real change fires nothing more.
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runWorkflowCalls).toHaveLength(1);
  });

  it('fires "updated" once when an already-seen PR changes, filtered by the trigger\'s own events', async () => {
    let pulls = [pull()];
    const fetchOpenPulls = vi.fn(async () => pulls);
    const { deps, fireAllForgeChanges, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow({ events: ['updated'] } as never)]);
    await Promise.resolve();
    await Promise.resolve();

    pulls = [pull({ title: 'Add feature (retitled)' })];
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runWorkflowCalls).toHaveLength(1);
    expect((runWorkflowCalls[0]!.payload as { title: string }).title).toBe('Add feature (retitled)');
  });

  it('never fires for an event not in the trigger\'s own `events` list', async () => {
    let pulls = [pull()];
    const fetchOpenPulls = vi.fn(async () => pulls);
    const { deps, fireAllForgeChanges, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    // Only 'opened' — an 'updated' change to the seeded PR must not fire.
    scheduler.reconcile([forgeWorkflow({ events: ['opened'] } as never)]);
    await Promise.resolve();
    await Promise.resolve();

    pulls = [pull({ title: 'Retitled' })];
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runWorkflowCalls).toEqual([]);
  });

  it('respects branchFilter', async () => {
    let pulls = [pull()];
    const fetchOpenPulls = vi.fn(async () => pulls);
    const { deps, fireAllForgeChanges, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow({ branchFilter: 'release/*' } as never)]);
    await Promise.resolve();
    await Promise.resolve();

    pulls = [pull(), pull({ number: 2, headBranch: 'chore/y' })];
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runWorkflowCalls).toEqual([]); // neither branch matches release/*

    pulls = [pull(), pull({ number: 2, headBranch: 'chore/y' }), pull({ number: 3, headBranch: 'release/1.0' })];
    fireAllForgeChanges('repo-1', 'pulls');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runWorkflowCalls).toHaveLength(1);
    expect((runWorkflowCalls[0]!.payload as { number: number }).number).toBe(3);
  });

  it('ignores a change notification for a repoId/kind it is not watching', async () => {
    const fetchOpenPulls = vi.fn(async () => [pull()]);
    const { deps, fireAllForgeChanges, runWorkflowCalls } = makeDeps({ fetchOpenPulls });
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow()]);
    await Promise.resolve();
    await Promise.resolve();

    fireAllForgeChanges('repo-1', 'runs'); // wrong kind
    fireAllForgeChanges('repo-9', 'pulls'); // wrong repo
    await Promise.resolve();
    await Promise.resolve();
    expect(runWorkflowCalls).toEqual([]);
  });

  it('unsubscribes when the trigger is removed', async () => {
    const { deps, subscribed, unsubscribed } = makeDeps();
    const scheduler = new TriggerScheduler(deps);

    scheduler.reconcile([forgeWorkflow()]);
    await Promise.resolve();
    expect(subscribed).toEqual(['repo-1']);

    scheduler.reconcile([]);
    expect(unsubscribed).toEqual(['repo-1']);
    expect(scheduler.forgeWatchRepoCountForTests()).toBe(0);
  });
});
