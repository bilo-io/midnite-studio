import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';
import { parseStateValue } from '../workflow-state';

/**
 * The `state` node (Phase 97 Theme G): resolves `{{...}}`-interpolated
 * `config.value` and best-effort-JSON-parses it, but does **not** itself
 * read-modify-write the run's durable state — that happens in
 * `workflow-engine.ts`'s `settleNode` (`applyStateNodeWrite`,
 * `workflow-state.ts`), under the same run lock every other settle already
 * holds, which is what serializes two `state` nodes racing in parallel
 * instead of losing one write to the other. This executor's own output is
 * just the resolved `{op, key, value}` that settle step applies.
 *
 * `value` is free text that MAY contain `{{...}}` references — unlike
 * `transform`'s `pick.from`, it is never auto-wrapped in braces, matching
 * `condition`'s `left`/`right` (a plain word like `hello` is meant to pass
 * through unchanged, not be treated as a bare node-id reference).
 */
export const stateExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'state') return { ok: false, error: 'Not a state node.' };
  if (node.config.key.trim() === '') return { ok: false, error: 'This state write has no key.' };

  const resolved = interpolate(node.config.value, context.upstream);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  return {
    ok: true,
    output: { op: node.config.op, key: node.config.key, value: parseStateValue(resolved.value) },
  };
};
