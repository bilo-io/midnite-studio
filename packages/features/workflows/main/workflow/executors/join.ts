import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * A `join` (Phase 97 Theme B) never actually runs through here.
 *
 * Unlike every other kind, a join has no I/O of its own — it is pure
 * aggregation over ancestor outputs that have *already* settled by the time
 * any of its ports could be evaluated, so `workflow-engine.ts` settles it
 * directly inside the same per-edge readiness pass that decides whether its
 * ports are taken or dead (`joinPortStates`/`applyJoinSettlement`), rather
 * than racing it against the per-node timeout the way a real executor's work
 * has to be.
 *
 * This entry exists only so `ExecutorRegistry`'s exhaustive
 * `Record<WorkflowNodeKind, NodeExecutor>` keeps compiling — the same reason
 * `note` has one. If the driver ever *does* reach it (a bug, not a normal
 * path), it fails loudly rather than quietly succeeding on nothing.
 */
export const joinExecutor: NodeExecutor = async (): Promise<NodeOutcome> => ({
  ok: false,
  error: 'A join settles inline in the engine and should never reach its executor.',
});
