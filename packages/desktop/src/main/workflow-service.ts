import {
  EVENT_CHANNELS,
  MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW,
  WORKFLOW_NODE_TIMEOUT_MS,
  failure,
  ok,
  type GitOpResult,
  type Workflow,
  type WorkflowGateDecidedBy,
  type WorkflowGateDecision,
  type WorkflowNode,
  type WorkflowRun,
} from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { pollGateApprovals, type WaitingLinkedGate } from './workflow/gate-forge-service';
import {
  cancelWorkflowRun,
  decideWorkflowGate,
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
/**
 * Fired, fire-and-forget, at the end of `saveWorkflow`/`deleteWorkflow` (Phase
 * 97 Theme H) — `trigger-scheduler.ts`'s own `reconcile` is wired here from
 * `main/index.ts`'s boot, so editing a workflow's schedule (or disabling it,
 * or deleting it) re-arms its timer immediately rather than only on the next
 * app restart. A no-op by default so every existing test/call site that never
 * configures one keeps working unchanged.
 */
let onWorkflowsChangedThunk: () => void = () => undefined;

export function onWorkflowsChanged(listener: () => void): void {
  onWorkflowsChangedThunk = listener;
}

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

/**
 * Theme I's settings page — the same `updateSetChannel` shape: a bare
 * in-memory value, set on change, never synced on boot. `runHistoryCap`
 * starts applying on this process's very next `saveRun`/`runsStore.save`;
 * it does not retroactively trim what is already on disk.
 */
let defaultTimeoutMs = WORKFLOW_NODE_TIMEOUT_MS;
let runHistoryCap = MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW;

export function setWorkflowDefaults(next: { defaultTimeoutMs: number; runHistoryCap: number }): void {
  defaultTimeoutMs = next.defaultTimeoutMs;
  runHistoryCap = next.runHistoryCap;
}

/** Read live by `createWorkflowRunsStore`'s own trim, so a change applies to the very next save. */
export function getWorkflowRunHistoryCap(): number {
  return runHistoryCap;
}

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
  onWorkflowsChangedThunk = () => undefined;
}

function emitChanged(run: WorkflowRun): void {
  const win = getWindowThunk();
  // A send to a destroyed window throws, and main going down because a run
  // finished after the window closed would be an absurd way to lose the app.
  if (win && !win.isDestroyed()) {
    win.webContents.send(EVENT_CHANNELS.workflowRunChanged, { workflowId: run.workflowId, run });
  }
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
        // `'waiting'` (Phase 97 Theme D) joins `'running'`/`'pending'` here —
        // a gate left waiting has no in-memory waiter across a restart
        // (`gate-waiters.ts` is process-local state), so it can never be
        // decided; Theme G's real resume replaces this whole crude sweep.
        node.status === 'running' || node.status === 'pending' || node.status === 'waiting'
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
  onWorkflowsChangedThunk();
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

  if (await isWorkflowRunning(id)) {
    return failure('This workflow is still running. Cancel the run before deleting it.');
  }

  workflows = workflows.filter((workflow) => workflow.id !== id);
  // The runs go with it: history pointing at a workflow that no longer exists
  // renders as a row with no name and no way to re-run it.
  runs = runs.filter((run) => run.workflowId !== id);
  await workflowsStore.save(workflows);
  await runsStore.save(runs);
  onWorkflowsChangedThunk();
  return ok();
}

/**
 * Does this workflow already have a live run? (Phase 97 Theme H's
 * skip-while-running rule — `trigger-scheduler.ts` checks this before ever
 * calling `runWorkflow`.) The same in-flight check `deleteWorkflow` already
 * needed inline, factored out so both callers agree on what "still running"
 * means.
 */
export async function isWorkflowRunning(workflowId: string): Promise<boolean> {
  await ensureRunsLoaded();
  return runs.some((run) => run.workflowId === workflowId && isRunning(run.id));
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
  runs = trimRunsPerWorkflow(next, runHistoryCap);
  await runsStore.save(runs);
}

function engineDeps(triggerPayload?: unknown): EngineDeps {
  return { saveRun, getRun, emitChanged, defaultTimeoutMs, triggerPayload };
}

/**
 * `triggerPayload` (Phase 97 Theme H) is what a `trigger` node's own output
 * becomes for this one run — unset for the ordinary manual Run button, the
 * PR's own facts for a `forge-pr` fire (`trigger-scheduler.ts`'s only caller
 * of this with a payload). Every other caller of `runWorkflow` — the IPC
 * handler, MCP, the scheduler's own `schedule` tick — passes none.
 */
export async function runWorkflow(
  workflowId: string,
  triggerPayload?: unknown,
): Promise<GitOpResult<WorkflowRun>> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return failure('That workflow no longer exists.');
  await ensureRunsLoaded();
  return startWorkflowRun(workflow, engineDeps(triggerPayload));
}

export async function cancelRun(runId: string): Promise<GitOpResult> {
  await ensureRunsLoaded();
  return cancelWorkflowRun(runId, engineDeps());
}

/**
 * Every currently-waiting gate, across every workflow (Phase 97 Theme D) —
 * `workflow_gates_list` (MCP) and the notification bell's own subscription
 * both read this shape. Unlike `waitingLinkedGates` below, this does NOT
 * filter to `linkedRef`-carrying gates: every waiting gate is a legitimate
 * MCP/bell candidate, whether or not it also happens to have a PR/issue tied
 * to it.
 */
export type WaitingGate = {
  runId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  label: string;
  title: string;
  instructions: string;
  startedAt: number | undefined;
};

export async function listWaitingGates(): Promise<WaitingGate[]> {
  await ensureRunsLoaded();
  await ensureWorkflowsLoaded();
  const gates: WaitingGate[] = [];
  for (const run of runs) {
    if (run.status !== 'running') continue;
    const workflow = workflows.find((w) => w.id === run.workflowId);
    for (const nodeRun of run.nodes) {
      if (nodeRun.status !== 'waiting') continue;
      const node = workflow?.nodes.find((n) => n.id === nodeRun.nodeId);
      const config = node?.kind === 'gate' ? node.config : undefined;
      gates.push({
        runId: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        nodeId: nodeRun.nodeId,
        label: nodeRun.label,
        title: config?.title ?? '',
        instructions: config?.instructions ?? '',
        startedAt: nodeRun.startedAt,
      });
    }
  }
  return gates;
}

/** Phase 97 Theme D — the one function every decide channel (the IPC handler above, the MCP tool, `gate-forge-service.ts`'s PR-comment poll) funnels through. */
export async function decideGate(
  runId: string,
  nodeId: string,
  decision: WorkflowGateDecision,
  note: string | undefined,
  decidedBy: WorkflowGateDecidedBy,
): Promise<GitOpResult> {
  await ensureRunsLoaded();
  return decideWorkflowGate(runId, nodeId, decision, note, decidedBy, engineDeps());
}

// --- gate PR-comment approval polling (Phase 97 Theme D) ---------------------

/** Every currently-waiting gate that also carries a `linkedRef` — built from this module's own in-memory `runs`/`workflows`, which is exactly why `gate-forge-service.ts` never imports either directly (see that file's own doc comment on the import-cycle it avoids). */
function waitingLinkedGates(): WaitingLinkedGate[] {
  const gates: WaitingLinkedGate[] = [];
  for (const run of runs) {
    if (run.status !== 'running') continue;
    const workflow = workflows.find((w) => w.id === run.workflowId);
    if (!workflow) continue;
    for (const nodeRun of run.nodes) {
      if (nodeRun.status !== 'waiting') continue;
      const node = workflow.nodes.find((n): n is WorkflowNode & { kind: 'gate' } => n.id === nodeRun.nodeId && n.kind === 'gate');
      if (!node?.config.linkedRef) continue;
      gates.push({ runId: run.id, workflowId: run.workflowId, nodeId: nodeRun.nodeId, node });
    }
  }
  return gates;
}

/** One poll tick — a no-op (zero forge calls) whenever nothing is both `waiting` and `linkedRef`-carrying. Called on an interval by `main/index.ts`; exported bare so a test can drive it directly without a timer. */
export async function pollWorkflowGateApprovals(): Promise<void> {
  await ensureRunsLoaded();
  await ensureWorkflowsLoaded();
  const gates = waitingLinkedGates();
  if (gates.length === 0) return;
  await pollGateApprovals(gates, async (runId, nodeId, decision, note) => {
    await decideGate(runId, nodeId, decision, note, 'pr-comment');
  });
}
