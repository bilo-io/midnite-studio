import type { AiPlanBlueprint } from '@midnite/studio-shared';

/**
 * Confirm sequencing (Phase 95 Theme F) — pure, so it is unit-testable
 * without mounting anything, the same reasoning `graph-layout.ts` and
 * `board-derive.test.ts`'s decision logic already lean on. Nothing here calls
 * `bridge()` directly: `ops` is injected by the caller (`plan-blueprint-
 * sheet.tsx`, wiring real `services/queries.ts` mutations), so a test hands
 * in fakes and a real run hands in the actual IPC calls — same split
 * `improve-field.test.ts`'s `fakeSpawn` draws one layer down.
 *
 * **Nothing here touches a forge until `runPlanConfirm` is called** — the
 * phase doc's own rule ("nothing touches the forge until Confirm"). Building
 * the step list (`buildPlanConfirmSteps`) is itself side-effect-free.
 *
 * **Two targets.** `{kind:'project', target}` creates each task as a
 * top-level issue, optionally adding it to a board (`target.kind ===
 * 'new' | 'existing'`; `'none'` skips project steps entirely — every
 * non-GitHub forge Theme D shipped can create issues and blocked-by links
 * but has no board to add to at all). `{kind:'subIssue', originNumber}`
 * creates each task as a **sub-issue** of an already-open issue instead,
 * per the phase doc's third entry point — no project step at all, and one
 * extra `subIssue` link per task binding it to the origin.
 */

export type PlanConfirmTarget = { kind: 'new' } | { kind: 'existing'; projectId: string } | { kind: 'none' };

export type PlanConfirmMode =
  | { kind: 'project'; target: PlanConfirmTarget }
  | { kind: 'subIssue'; originNumber: number };

export type PlanConfirmStepBase = { id: string; label: string; status: 'pending' | 'running' | 'done' | 'failed'; error?: string };

export type PlanConfirmStep =
  | (PlanConfirmStepBase & { kind: 'createProject'; title: string })
  | (PlanConfirmStepBase & { kind: 'createIssue'; taskKey: string })
  | (PlanConfirmStepBase & { kind: 'addToProject'; taskKey: string })
  | (PlanConfirmStepBase & { kind: 'blockedBy'; from: string; to: string })
  | (PlanConfirmStepBase & { kind: 'subIssue'; taskKey: string });

/** What each successfully-created task/project leaves behind, keyed by the
 *  blueprint's own local task `key` (or `'@project'` for the board itself) —
 *  the confirm sequencer's only mutable state, passed by the caller so
 *  Retry-remaining can hand back exactly what already exists. */
export type PlanConfirmContext = {
  projectId: string | null;
  issueByTaskKey: Record<string, { number: number; id: string }>;
};

export function emptyPlanConfirmContext(): PlanConfirmContext {
  return { projectId: null, issueByTaskKey: {} };
}

/** Build the full, ordered step list for one blueprint + mode. Deterministic
 *  and side-effect-free — the sheet renders this immediately once a
 *  blueprint exists, before Confirm is ever clicked, so the person sees
 *  exactly what pressing it will do. */
export function buildPlanConfirmSteps(blueprint: AiPlanBlueprint, mode: PlanConfirmMode): PlanConfirmStep[] {
  const steps: PlanConfirmStep[] = [];

  if (mode.kind === 'project' && mode.target.kind === 'new') {
    steps.push({
      id: 'project',
      kind: 'createProject',
      title: blueprint.project.title,
      label: `Create board "${blueprint.project.title}"`,
      status: 'pending',
    });
  }

  for (const task of blueprint.tasks) {
    steps.push({
      id: `issue:${task.key}`,
      kind: 'createIssue',
      taskKey: task.key,
      label: `Create issue "${task.title}"`,
      status: 'pending',
    });
  }

  if (mode.kind === 'project' && mode.target.kind !== 'none') {
    for (const task of blueprint.tasks) {
      steps.push({
        id: `add:${task.key}`,
        kind: 'addToProject',
        taskKey: task.key,
        label: `Add "${task.title}" to the board`,
        status: 'pending',
      });
    }
  }

  for (const edge of blueprint.edges) {
    const fromTitle = blueprint.tasks.find((task) => task.key === edge.from)?.title ?? edge.from;
    const toTitle = blueprint.tasks.find((task) => task.key === edge.to)?.title ?? edge.to;
    steps.push({
      id: `blocked:${edge.from}:${edge.to}`,
      kind: 'blockedBy',
      from: edge.from,
      to: edge.to,
      label: `Mark "${fromTitle}" as blocked by "${toTitle}"`,
      status: 'pending',
    });
  }

  if (mode.kind === 'subIssue') {
    for (const task of blueprint.tasks) {
      steps.push({
        id: `sub:${task.key}`,
        kind: 'subIssue',
        taskKey: task.key,
        label: `Link "${task.title}" as a sub-issue`,
        status: 'pending',
      });
    }
  }

  return steps;
}

type OpResult = { ok: true } | { ok: false; message: string };

export type PlanConfirmOps = {
  createProject: (title: string, description: string) => Promise<{ ok: true; projectId: string } | { ok: false; message: string }>;
  createIssue: (taskKey: string) => Promise<{ ok: true; number: number; id: string } | { ok: false; message: string }>;
  addToProject: (projectId: string, contentId: string) => Promise<OpResult>;
  linkBlockedBy: (fromNumber: number, toNumber: number) => Promise<OpResult>;
  linkSubIssue: (originNumber: number, childNumber: number) => Promise<OpResult>;
};

/**
 * Run every `'pending'`/`'failed'` step in order, mutating a **copy** of
 * `steps` and `context` and calling `onUpdate` after each transition so the
 * sheet can re-render a live progress list. Stops at the first failure —
 * later steps stay `'pending'`, which is also what makes **Retry-remaining**
 * exactly "call this again with the same `steps`/`context`": every already-
 * `'done'` step is skipped outright, so nothing already created on the forge
 * is repeated or duplicated.
 */
export async function runPlanConfirm(
  blueprint: AiPlanBlueprint,
  mode: PlanConfirmMode,
  steps: readonly PlanConfirmStep[],
  context: PlanConfirmContext,
  ops: PlanConfirmOps,
  onUpdate?: (steps: PlanConfirmStep[], context: PlanConfirmContext) => void,
): Promise<{ ok: boolean; steps: PlanConfirmStep[]; context: PlanConfirmContext }> {
  const working: PlanConfirmStep[] = steps.map((step) => ({ ...step }));
  const ctx: PlanConfirmContext = {
    projectId: context.projectId,
    issueByTaskKey: { ...context.issueByTaskKey },
  };

  const publish = () => onUpdate?.(working.map((step) => ({ ...step })), { ...ctx, issueByTaskKey: { ...ctx.issueByTaskKey } });

  for (const step of working) {
    if (step.status === 'done') continue;

    step.status = 'running';
    delete step.error;
    publish();

    let result: OpResult;
    if (step.kind === 'createProject') {
      const created = await ops.createProject(step.title, blueprint.project.description);
      if (created.ok) ctx.projectId = created.projectId;
      result = created.ok ? { ok: true } : created;
    } else if (step.kind === 'createIssue') {
      const created = await ops.createIssue(step.taskKey);
      if (created.ok) ctx.issueByTaskKey[step.taskKey] = { number: created.number, id: created.id };
      result = created.ok ? { ok: true } : created;
    } else if (step.kind === 'addToProject') {
      const issue = ctx.issueByTaskKey[step.taskKey];
      const projectId = mode.kind === 'project' && mode.target.kind === 'existing' ? mode.target.projectId : ctx.projectId;
      result =
        issue && projectId
          ? await ops.addToProject(projectId, issue.id)
          : { ok: false, message: 'Nothing to add — its own issue or the board was never created.' };
    } else if (step.kind === 'blockedBy') {
      const from = ctx.issueByTaskKey[step.from];
      const to = ctx.issueByTaskKey[step.to];
      result =
        from && to
          ? await ops.linkBlockedBy(from.number, to.number)
          : { ok: false, message: 'Cannot link — one of the two issues was never created.' };
    } else {
      const child = ctx.issueByTaskKey[step.taskKey];
      result =
        child && mode.kind === 'subIssue'
          ? await ops.linkSubIssue(mode.originNumber, child.number)
          : { ok: false, message: 'Cannot link — the issue was never created.' };
    }

    if (result.ok) {
      step.status = 'done';
      publish();
    } else {
      step.status = 'failed';
      step.error = result.message;
      publish();
      return { ok: false, steps: working, context: ctx };
    }
  }

  return { ok: true, steps: working, context: ctx };
}
