import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * The `trigger` node (Phase 97 Theme H) — the graph's own start. It has no
 * in-port (`portsForNode` in `shared/src/workflow.ts`), so it is always
 * eligible to run first, and it never actually does anything: its whole job
 * is to hand whatever fired this run (`context.triggerPayload` —
 * `trigger-scheduler.ts`'s PR facts for a `forge-pr` trigger, or nothing for
 * a manual Run / a bare schedule tick) onward as its own `out` output, so
 * downstream nodes can `{{triggerNodeId.number}}` etc. against it exactly
 * like any other node's recorded output.
 *
 * Always succeeds — there is nothing here that can fail. Settles on the
 * default `'out'` port, same as every other plain-success kind (Theme B's
 * `settledPortFor`).
 */
export const triggerExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'trigger') return { ok: false, error: 'Not a trigger node.' };
  return { ok: true, output: context.triggerPayload ?? null };
};
