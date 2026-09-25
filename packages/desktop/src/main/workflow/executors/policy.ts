import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * The `policy` node (Phase 97 Theme I) — an ordinary pass-through, exactly
 * like `transform`: its real job (deciding what a downstream agent/script/
 * http node may do) is not something IT does at run time — that is
 * `checkNodePolicy`/`governingPolicies` (`shared/src/workflow.ts`), read by
 * `workflow-engine.ts`'s `runNode` for every node this one governs, before
 * that node's own turn. This executor only settles its own `out` port with
 * its config, mirroring what every other config-carrying node's `out` output
 * looks like, so `{{policyNodeId.allow}}` resolves for anyone curious.
 */
export const policyExecutor: NodeExecutor = async (node): Promise<NodeOutcome> => {
  if (node.kind !== 'policy') return { ok: false, error: 'Not a policy node.' };
  return { ok: true, output: { allow: node.config.allow, requireApprovalFor: node.config.requireApprovalFor } };
};
