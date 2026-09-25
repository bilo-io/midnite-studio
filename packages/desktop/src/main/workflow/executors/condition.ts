import type { WorkflowConditionConfig, WorkflowConditionOp } from '@midnite/studio-shared';

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

/**
 * Exported so every other consumer of a condition-shaped comparison — Theme
 * F's `router` expression mode, Theme E's `verify` json-path check — never
 * re-implements this switch and can never quietly disagree about what
 * `'gte'` means.
 */
export function evaluateConditionOp(left: string, op: WorkflowConditionOp, right: string): boolean {
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

/**
 * Interpolate-then-compare, shared by `conditionExecutor` below and Theme F's
 * `router` (expression mode) — the one place a condition-shaped `{left, op,
 * right}` is actually evaluated against a run's upstream outputs, so the two
 * can never quietly diverge on what "holds" means.
 */
export function evaluateWorkflowCondition(
  config: Pick<WorkflowConditionConfig, 'left' | 'op' | 'right'>,
  upstream: Record<string, unknown>,
): { ok: true; passed: boolean; left: string; right: string } | { ok: false; error: string } {
  const { left, op, right } = config;

  const leftValue = interpolate(left, upstream);
  if (!leftValue.ok) return { ok: false, error: leftValue.error };

  let rightValue = '';
  if (op !== 'empty') {
    if (right === undefined) return { ok: false, error: `"${op}" needs a right-hand value.` };
    const resolved = interpolate(right, upstream);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    rightValue = resolved.value;
  }

  return { ok: true, passed: evaluateConditionOp(leftValue.value, op, rightValue), left: leftValue.value, right: rightValue };
}

export const conditionExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'condition') return { ok: false, error: 'Not a condition node.' };

  const result = evaluateWorkflowCondition(node.config, context.upstream);
  if (!result.ok) return result;

  return {
    ok: true,
    output: { passed: result.passed, left: result.left, op: node.config.op, right: result.right },
    port: result.passed ? 'true' : 'false',
  };
};
