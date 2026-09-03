import {
  EVENT_CHANNELS,
  failure,
  ok,
  type GitOpResult,
  type Workflow,
  type WorkflowRun,
} from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import {
  cancelWorkflowRun,
  isRunning,
  startWorkflowRun,
  type EngineDeps,
} from './workflow/workflow-engine';
import { nullWorkflowRunsStore, trimRunsPerWorkflow, type WorkflowRunsStore } from './workflow-runs-store';
import { nullWorkflowsStore, type WorkflowsStore } from './workflows-store';

/**
 * Workflows and their run history, between the IPC handlers, the engine and the
 * two stores — the shape `council-service.ts` established: one in-memory array
 * per store, written on mutation, loaded lazily on first read.
 *
 * The `getWindow` thunk is `loop-runs.ts`'s, not councils' — councils emit no
 * events at all and get liveness by polling, which a workflow run cannot use
 * (there is no pty to subscribe to). A run's progress is a bare
 * `workflowRunChanged` ping and a re-fetch.
 */

let workflowsStore: WorkflowsStore = nullWorkflowsStore;
let runsStore: WorkflowRunsStore = nullWorkflowRunsStore;
let getWindowThunk: () => BrowserWindow | null = () => null;

let workflows: Workflow[] = [];
let runs: WorkflowRun[] = [];
/*
  The IN-FLIGHT promise, not a `loaded` boolean.

  A boolean is not re-entrant: two callers arriving before the first `await`
  both see `false`, both load, and the later assignment replaces the array
  wholesale — so a workflow saved (or a run created) between the two loads is
  dropped from memory, and the *next* save then persists that stale array over
  the real one. That is data loss, not a stale read, and workflows write far
  more often than councils do.
*/
let workflowsLoading: Promise<void> | null = null;
let runsLoading: Promise<void> | null = null;

export function configureWorkflows(
  store: WorkflowsStore,
  runStore: WorkflowRunsStore,
  getWindow: () => BrowserWindow | null,
): void {
  workflowsStore = store;
  runsStore = runStore;
  getWindowThunk = getWindow;
  workflowsLoading = null;
  runsLoading = null;
}

function emitChanged(): void {
  const win = getWindowThunk();
  // A send to a destroyed window throws, and main going down because a run
  // finished after the window closed would be an absurd way to lose the app.
  if (win && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.workflowRunChanged);
}

async function ensureWorkflowsLoaded(): Promise<void> {
  workflowsLoading ??= (async () => {
    workflows = await workflowsStore.load();
  })();
  await workflowsLoading;
}

async function ensureRunsLoaded(): Promise<void> {
  runsLoading ??= loadRuns();
  await runsLoading;
}

async function loadRuns(): Promise<void> {
  /*
    A run this file says is `running` outlived nothing: its driver died with the
    process that started it. Finalise on load rather than leaving a run that can
    never advance — the same honest posture `loop-runs.ts` takes with a session
    whose pty is gone.
  */
  const restored = await runsStore.load();
  let dangling = false;
  runs = restored.map((run) => {
    if (run.status !== 'running') return run;
    dangling = true;
    return {
      ...run,
      status: 'cancelled' as const,
      error: 'Interrupted — the app quit while this run was in flight.',
      endedAt: Date.now(),
      nodes: run.nodes.map((node) =>
        node.status === 'running' || node.status === 'pending'
          ? { ...node, status: 'skipped' as const, error: node.error ?? 'Interrupted.' }
          : node,
      ),
    };
  });
  if (dangling) await runsStore.save(runs);
}

// --- workflows ---------------------------------------------------------------

export async function listWorkflows(): Promise<Workflow[]> {
  await ensureWorkflowsLoaded();
  return workflows;
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  await ensureWorkflowsLoaded();
  return workflows.find((workflow) => workflow.id === id) ?? null;
}

/**
 * Upsert. `createdAt` is the store's to keep: the renderer mints the id (it
 * needs one to draw the node it just dropped), but a save must not be able to
 * rewrite when a workflow first existed.
 */
export async function saveWorkflow(next: Workflow): Promise<Workflow> {
  await ensureWorkflowsLoaded();
  const index = workflows.findIndex((workflow) => workflow.id === next.id);
  const existing = workflows[index];
  const saved: Workflow = {
    ...next,
    createdAt: existing?.createdAt ?? next.createdAt,
    updatedAt: Date.now(),
  };
  workflows = index === -1 ? [...workflows, saved] : workflows.map((w) => (w.id === saved.id ? saved : w));
  await workflowsStore.save(workflows);
  return saved;
}

/**
 * Delete, **refused while one of this workflow's runs is in flight**.
 *
 * The alternative — cancel it and delete anyway — silently destroys work the
 * user may not have realised was running, and the result envelope exists
 * exactly so a refusal is a normal outcome the UI renders rather than an
 * exception.
 */
export async function deleteWorkflow(id: string): Promise<GitOpResult> {
  await ensureWorkflowsLoaded();
  await ensureRunsLoaded();
  if (!workflows.some((workflow) => workflow.id === id)) return failure('That workflow no longer exists.');

  const inFlight = runs.find((run) => run.workflowId === id && isRunning(run.id));
  if (inFlight) {
    return failure('This workflow is still running. Cancel the run before deleting it.');
  }

  workflows = workflows.filter((workflow) => workflow.id !== id);
  // The runs go with it: history pointing at a workflow that no longer exists
  // renders as a row with no name and no way to re-run it.
  runs = runs.filter((run) => run.workflowId !== id);
  await workflowsStore.save(workflows);
  await runsStore.save(runs);
  return ok();
}

// --- runs --------------------------------------------------------------------

export async function listRunsForWorkflow(workflowId: string): Promise<WorkflowRun[]> {
  await ensureRunsLoaded();
  return runs.filter((run) => run.workflowId === workflowId);
}

export async function getRun(runId: string): Promise<WorkflowRun | null> {
  await ensureRunsLoaded();
  return runs.find((run) => run.id === runId) ?? null;
}

async function saveRun(run: WorkflowRun): Promise<void> {
  await ensureRunsLoaded();
  const index = runs.findIndex((existing) => existing.id === run.id);
  const next = index === -1 ? [...runs, run] : runs.map((existing) => (existing.id === run.id ? run : existing));
  // Trimmed here, at write time — not left to the store's own trim, which only
  // ever bounded the copy written to disk (Phase 45 Theme D).
  runs = trimRunsPerWorkflow(next);
  await runsStore.save(runs);
}

function engineDeps(): EngineDeps {
  return { saveRun, getRun, emitChanged };
}

export async function runWorkflow(workflowId: string): Promise<GitOpResult<WorkflowRun>> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return failure('That workflow no longer exists.');
  await ensureRunsLoaded();
  return startWorkflowRun(workflow, engineDeps());
}

export async function cancelRun(runId: string): Promise<GitOpResult> {
  await ensureRunsLoaded();
  return cancelWorkflowRun(runId, engineDeps());
}
