import type { WorkflowConditionOp } from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * The `condition` node: one comparison over interpolated values, settling on
 * its `true` or `false` out-port (Phase 97 Theme B).
 *
 * A false predicate is **not** a failure — nothing went wrong. It settles
 * `succeeded` on the `false` port, and the engine's per-edge readiness pass
 * marks anything downstream of the *other* port `skipped` — the same
 * terminal state a failed upstream produces, for the same reason: a branch
 * that legitimately did not apply must read as "did not run", not as broken.
 */

function compare(left: string, op: WorkflowConditionOp, right: string): boolean {
  switch (op) {
    case 'empty':
      return left.trim() === '';
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'contains':
      return left.includes(right);
    default: {
      // Numeric ops on non-numbers are false rather than NaN-propagating: a
      // comparison nobody can satisfy is a clearer outcome than a silent
      // `false` that also happens to be what `NaN > x` gives.
      const a = Number(left);
      const b = Number(right);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (op === 'lt') return a < b;
      if (op === 'lte') return a <= b;
      if (op === 'gt') return a > b;
      return a >= b;
    }
  }
}

export const conditionExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'condition') return { ok: false, error: 'Not a condition node.' };
  const { left, op, right } = node.config;

  const leftValue = interpolate(left, context.upstream);
  if (!leftValue.ok) return { ok: false, error: leftValue.error };

  let rightValue = '';
  if (op !== 'empty') {
    if (right === undefined) return { ok: false, error: `"${op}" needs a right-hand value.` };
    const resolved = interpolate(right, context.upstream);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    rightValue = resolved.value;
  }

  const passed = compare(leftValue.value, op, rightValue);
  return {
    ok: true,
    output: { passed, left: leftValue.value, op, right: rightValue },
    port: passed ? 'true' : 'false',
  };
};
