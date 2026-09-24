import type { AiPlanBlueprint } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPlanConfirmSteps,
  emptyPlanConfirmContext,
  runPlanConfirm,
  type PlanConfirmMode,
  type PlanConfirmOps,
} from './plan-confirm';

const blueprint: AiPlanBlueprint = {
  project: { title: 'Ship auth', description: 'A short plan.' },
  tasks: [
    { key: 'api', title: 'Build the API', body: '', labels: [] },
    { key: 'ui', title: 'Wire up the UI', body: '', labels: ['frontend'] },
  ],
  edges: [{ from: 'ui', to: 'api', kind: 'blockedBy' }],
};

function issueOf(key: string, number: number) {
  return { number, id: `id-${key}` };
}

function fakeOps(over: Partial<PlanConfirmOps> = {}): PlanConfirmOps {
  return {
    createProject: vi.fn(async () => ({ ok: true, projectId: 'proj-1' })),
    createIssue: vi.fn(async (taskKey: string) => ({ ok: true, ...issueOf(taskKey, taskKey === 'api' ? 101 : 102) })),
    addToProject: vi.fn(async () => ({ ok: true })),
    linkBlockedBy: vi.fn(async () => ({ ok: true })),
    linkSubIssue: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe('buildPlanConfirmSteps', () => {
  it('creates a project step only when the target is "new"', () => {
    const withNew = buildPlanConfirmSteps(blueprint, { kind: 'project', target: { kind: 'new' } });
    expect(withNew.filter((s) => s.kind === 'createProject')).toHaveLength(1);

    const withExisting = buildPlanConfirmSteps(blueprint, {
      kind: 'project',
      target: { kind: 'existing', projectId: 'proj-9' },
    });
    expect(withExisting.filter((s) => s.kind === 'createProject')).toHaveLength(0);
    expect(withExisting.filter((s) => s.kind === 'addToProject')).toHaveLength(2);
  });

  it('skips every project step when the target is "none"', () => {
    const steps = buildPlanConfirmSteps(blueprint, { kind: 'project', target: { kind: 'none' } });
    expect(steps.some((s) => s.kind === 'createProject' || s.kind === 'addToProject')).toBe(false);
    // Issues and the blocked-by edge still happen.
    expect(steps.filter((s) => s.kind === 'createIssue')).toHaveLength(2);
    expect(steps.filter((s) => s.kind === 'blockedBy')).toHaveLength(1);
  });

  it('adds one subIssue step per task, and no project steps, in subIssue mode', () => {
    const steps = buildPlanConfirmSteps(blueprint, { kind: 'subIssue', originNumber: 7 });
    expect(steps.some((s) => s.kind === 'createProject' || s.kind === 'addToProject')).toBe(false);
    expect(steps.filter((s) => s.kind === 'subIssue')).toHaveLength(2);
  });

  it('orders steps: project, issues, project-adds, blocked-by edges', () => {
    const steps = buildPlanConfirmSteps(blueprint, { kind: 'project', target: { kind: 'new' } });
    const kinds = steps.map((s) => s.kind);
    expect(kinds).toEqual([
      'createProject',
      'createIssue',
      'createIssue',
      'addToProject',
      'addToProject',
      'blockedBy',
    ]);
  });
});

describe('runPlanConfirm', () => {
  it('runs every step in order and succeeds end to end', async () => {
    const ops = fakeOps();
    const mode: PlanConfirmMode = { kind: 'project', target: { kind: 'new' } };
    const steps = buildPlanConfirmSteps(blueprint, mode);

    const result = await runPlanConfirm(blueprint, mode, steps, emptyPlanConfirmContext(), ops);

    expect(result.ok).toBe(true);
    expect(result.steps.every((s) => s.status === 'done')).toBe(true);
    expect(result.context.projectId).toBe('proj-1');
    expect(result.context.issueByTaskKey.api).toEqual({ number: 101, id: 'id-api' });
    expect(ops.linkBlockedBy).toHaveBeenCalledWith(102, 101); // ui blocked by api
  });

  it('stops at the first failure, leaving later steps pending — a partial-failure report', async () => {
    const ops = fakeOps({
      createIssue: vi.fn(async (taskKey: string) =>
        taskKey === 'ui' ? { ok: false, message: 'GitHub said no.' } : { ok: true, ...issueOf(taskKey, 101) },
      ),
    });
    const mode: PlanConfirmMode = { kind: 'project', target: { kind: 'new' } };
    const steps = buildPlanConfirmSteps(blueprint, mode);

    const result = await runPlanConfirm(blueprint, mode, steps, emptyPlanConfirmContext(), ops);

    expect(result.ok).toBe(false);
    const byId = new Map(result.steps.map((s) => [s.id, s]));
    expect(byId.get('project')?.status).toBe('done');
    expect(byId.get('issue:api')?.status).toBe('done');
    expect(byId.get('issue:ui')?.status).toBe('failed');
    expect(byId.get('issue:ui')?.error).toBe('GitHub said no.');
    // Everything after the failure never ran.
    expect(byId.get('add:api')?.status).toBe('pending');
    expect(byId.get('add:ui')?.status).toBe('pending');
    expect(byId.get('blocked:ui:api')?.status).toBe('pending');
    expect(ops.addToProject).not.toHaveBeenCalled();
  });

  it('Retry-remaining skips already-done steps and only re-runs what failed', async () => {
    let uiAttempts = 0;
    const ops = fakeOps({
      createIssue: vi.fn(async (taskKey: string) => {
        if (taskKey === 'ui') {
          uiAttempts += 1;
          if (uiAttempts === 1) return { ok: false, message: 'flaky' };
          return { ok: true, ...issueOf('ui', 102) };
        }
        return { ok: true, ...issueOf('api', 101) };
      }),
    });
    const mode: PlanConfirmMode = { kind: 'project', target: { kind: 'new' } };
    const steps = buildPlanConfirmSteps(blueprint, mode);

    const first = await runPlanConfirm(blueprint, mode, steps, emptyPlanConfirmContext(), ops);
    expect(first.ok).toBe(false);
    expect(ops.createProject).toHaveBeenCalledTimes(1);
    expect(ops.createIssue).toHaveBeenCalledTimes(2); // api (done), ui (failed)

    const retry = await runPlanConfirm(blueprint, mode, first.steps, first.context, ops);
    expect(retry.ok).toBe(true);
    // The project and the "api" issue were already 'done' — never re-run.
    expect(ops.createProject).toHaveBeenCalledTimes(1);
    expect(uiAttempts).toBe(2);
    expect(retry.context.issueByTaskKey.api?.number).toBe(101);
    expect(retry.context.issueByTaskKey.ui?.number).toBe(102);
  });

  it('reports an add-to-project step as failed rather than throwing when its issue was never created', async () => {
    const ops = fakeOps({
      createIssue: vi.fn(async () => ({ ok: false, message: 'boom' })),
    });
    const mode: PlanConfirmMode = { kind: 'project', target: { kind: 'existing', projectId: 'proj-9' } };
    const steps = buildPlanConfirmSteps(blueprint, mode);

    const result = await runPlanConfirm(blueprint, mode, steps, emptyPlanConfirmContext(), ops);
    expect(result.ok).toBe(false);
    expect(result.steps.find((s) => s.id === 'issue:api')?.status).toBe('failed');
  });

  it('calls onUpdate as each step transitions, for a live progress list', async () => {
    const ops = fakeOps();
    const mode: PlanConfirmMode = { kind: 'subIssue', originNumber: 7 };
    const steps = buildPlanConfirmSteps(blueprint, mode);
    const updates: string[] = [];

    await runPlanConfirm(blueprint, mode, steps, emptyPlanConfirmContext(), ops, (nextSteps) => {
      updates.push(nextSteps.map((s) => s.status).join(','));
    });

    expect(updates.length).toBeGreaterThan(steps.length); // running + done per step
    expect(ops.linkSubIssue).toHaveBeenCalledWith(7, 101);
    expect(ops.linkSubIssue).toHaveBeenCalledWith(7, 102);
  });
});
