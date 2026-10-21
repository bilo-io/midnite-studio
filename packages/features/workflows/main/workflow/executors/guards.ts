import type { WorkflowConditionOp } from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';
import { evaluateWorkflowCondition } from './condition';

/**
 * `assert` and `fail` — the two control-flow kinds that end a branch with an
 * error on purpose. Both lean on Phase 97's own failure plumbing rather than
 * adding any: an `ok: false` outcome settles the node `failed`, which the
 * engine then routes down a wired `error` edge (Theme B) or through the
 * node's `onFailure` policy (Theme G), exactly as for any other failure.
 */

const OP_PHRASE: Record<WorkflowConditionOp, string> = {
  eq: 'to equal',
  ne: 'not to equal',
  lt: 'to be less than',
  lte: 'to be at most',
  gt: 'to be greater than',
  gte: 'to be at least',
  contains: 'to contain',
  empty: 'to be empty',
};

/** A comparison that fails the node when it does not hold — `condition.ts`'s own evaluator, so the two never disagree on what `gte` means. */
export const assertExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'assert') return { ok: false, error: 'Not an assert node.' };
  const result = evaluateWorkflowCondition(node.config, context.upstream);
  if (!result.ok) return result;

  const output = { passed: result.passed, left: result.left, op: node.config.op, right: result.right };
  if (result.passed) return { ok: true, output };

  if (node.config.message.trim() !== '') {
    const message = interpolate(node.config.message, context.upstream);
    return { ok: false, error: message.ok ? message.value : message.error };
  }
  const phrase = OP_PHRASE[node.config.op];
  return {
    ok: false,
    error:
      node.config.op === 'empty'
        ? `Assertion failed: expected "${result.left}" ${phrase}.`
        : `Assertion failed: expected "${result.left}" ${phrase} "${result.right}".`,
  };
};

/** Always fails, with its own (interpolated) message — a branch's deliberate dead end. */
export const failExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'fail') return { ok: false, error: 'Not a fail node.' };
  if (node.config.message.trim() === '') return { ok: false, error: `Stopped at "${node.label}".` };
  const message = interpolate(node.config.message, context.upstream);
  return { ok: false, error: message.ok ? message.value : message.error };
};
