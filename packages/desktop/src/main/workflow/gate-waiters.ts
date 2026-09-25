import type { WorkflowGateDecidedBy, WorkflowGateDecision } from '@midnite/studio-shared';

/**
 * The in-memory bridge between a `gate` node's own executor — sitting inside
 * `workflow-engine.ts`'s ordinary async-executor path, awaiting a decision
 * that may be minutes or days away — and the four surfaces that can decide it
 * (Phase 97 Theme D): the run panel (`workflowGateDecide` IPC), the MCP tool
 * (`workflow_gate_decide`), a PR/issue comment
 * (`gate-forge-service.ts`'s poll), and the gate's own `config.timeoutMs`
 * (a plain `setTimeout` inside `executors/gate.ts`).
 *
 * Deliberately module-level state, not part of `WorkflowRun` — a "waiter" is
 * a live `Promise` resolver, which cannot be persisted or replayed; it exists
 * only for the life of this process. A run left `waiting` across an app
 * restart has no waiter to resolve it (`workflow-service.ts`'s `loadRuns`
 * already force-cancels any run left `running`/`pending`/`waiting` on boot,
 * for exactly this reason, until Theme G's real resume replaces that sweep).
 */

export type GateDecisionResult = {
  decision: WorkflowGateDecision;
  note?: string;
  decidedBy: WorkflowGateDecidedBy;
};

type Waiter = { resolve: (result: GateDecisionResult) => void };

const waiters = new Map<string, Waiter>();

function key(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

/** Called once by `executors/gate.ts` when it starts waiting. The returned promise resolves exactly once, from whichever channel decides first. */
export function registerGateWaiter(runId: string, nodeId: string): Promise<GateDecisionResult> {
  return new Promise((resolve) => {
    waiters.set(key(runId, nodeId), { resolve });
  });
}

/**
 * Resolve a waiting gate. Returns `false` — a normal, expected outcome, never
 * logged as an error — when there is no such waiter: the gate already
 * decided (a second comment, a race between two channels), the run was
 * cancelled, or `nodeId`/`runId` never named a real waiting gate at all.
 * Every caller (the IPC handler, the MCP tool, the comment poller) treats
 * `false` as "nothing to do" rather than a failure of its own.
 */
export function resolveGateWaiter(runId: string, nodeId: string, result: GateDecisionResult): boolean {
  const k = key(runId, nodeId);
  const waiter = waiters.get(k);
  if (!waiter) return false;
  waiters.delete(k);
  waiter.resolve(result);
  return true;
}

export function isGateWaiting(runId: string, nodeId: string): boolean {
  return waiters.has(key(runId, nodeId));
}

/** Test-only: module state otherwise survives across a suite's test cases. */
export function resetGateWaitersForTests(): void {
  waiters.clear();
}
