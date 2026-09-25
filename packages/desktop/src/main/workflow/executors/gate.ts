import type { WorkflowNode } from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { registerGateWaiter, resolveGateWaiter } from '../gate-waiters';

export type GateExecutorDeps = {
  /**
   * Post the `linkedRef` PR/issue comment, fire-and-forget — a posting
   * failure (no forge account, the API is down) must never block the gate
   * from waiting on its other three channels, so this returns nothing and is
   * never awaited by the executor itself. `undefined` (the default) is a
   * no-op, which is exactly right for a gate with no `linkedRef`. Takes the
   * whole node (not just its id) — everything `gate-forge-service.ts` needs
   * (`config.title`/`instructions`/`linkedRef`) is already right here, so
   * posting never has to look the workflow back up through
   * `workflow-service.ts`, which is what would turn this into an import
   * cycle (`workflow-engine.ts` → `executors/index.ts` → this file →
   * `workflow-service.ts` → `workflow-engine.ts`).
   */
  postApprovalComment?: (input: { runId: string; workflowId: string; node: WorkflowNode }) => void;
};

/**
 * The `gate` node (Phase 97 Theme D) — the one executor that does not
 * "finish" on its own. It patches its own status to `waiting`
 * (`context.reportWaiting`), then waits on whichever of the four decide
 * channels reaches it first: the run panel/MCP (`registerGateWaiter`'s
 * promise, resolved by `decideWorkflowGate` in `workflow-engine.ts`), its own
 * `config.timeoutMs` (a plain `setTimeout`, exactly `delay.ts`'s own
 * un-injected-clock convention — a gate's timeout is measured in minutes to
 * hours, not milliseconds, so a fake clock buys nothing a short real value in
 * a test cannot already give), or a cancel (a `context.signal.cancelled()`
 * poll, verbatim `delay.ts`'s own cancel-races-the-timer pattern).
 *
 * **Settles `succeeded`, never `failed`, on either decision** — `approved`/
 * `rejected` are its own out-ports (Theme B's `settledPort` convention, the
 * same one `condition`'s `true`/`false` uses): a reject is an ordinary
 * branch, not an error. A cancel is the one path that settles `{ok:false}` —
 * the same `{error:'Cancelled.'}` shape every other in-flight executor
 * already answers with on cancel (see `delay.ts`), which is what lets
 * `finalizeRun`'s existing cancelled-run bookkeeping treat a cancelled gate
 * exactly like a cancelled http/agent/script node, with no special case.
 */
export function createGateExecutor(deps: GateExecutorDeps = {}): NodeExecutor {
  return (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'gate') return Promise.resolve({ ok: false, error: 'Not a gate node.' });
    const config = node.config;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (outcome: NodeOutcome) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        if (timer) clearTimeout(timer);
        resolve(outcome);
      };

      void context.reportWaiting();

      void registerGateWaiter(context.runId, node.id).then((result) => {
        settle({
          ok: true,
          output: { decision: result.decision, note: result.note ?? null, decidedBy: result.decidedBy },
          port: result.decision,
        });
      });

      const timer =
        config.timeoutMs !== undefined
          ? setTimeout(() => {
              resolveGateWaiter(context.runId, node.id, {
                decision: 'rejected',
                note: 'Timed out.',
                decidedBy: 'timeout',
              });
            }, config.timeoutMs)
          : undefined;
      timer?.unref?.();

      const poll = setInterval(() => {
        if (context.signal.cancelled()) {
          // Consumed by the settle above before this can also resolve — a
          // waiter is resolved exactly once (`resolveGateWaiter`'s own map
          // delete), so whichever of "cancel" and "a real decision landed in
          // the same tick" got there first is the one that counts, same as
          // `settleNode`'s own idempotence guard one layer up.
          resolveGateWaiter(context.runId, node.id, { decision: 'rejected', note: 'Cancelled.', decidedBy: 'cancelled' });
          settle({ ok: false, error: 'Cancelled.' });
        }
      }, 50);
      poll.unref?.();

      if (config.linkedRef) {
        deps.postApprovalComment?.({ runId: context.runId, workflowId: context.workflowId, node });
      }
    });
  };
}

export const gateExecutor = createGateExecutor();
