import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * A `note` is canvas furniture — a label you leave for the next reader — and
 * has nothing to run.
 *
 * It gets an explicit no-op entry rather than a `default` arm in the registry,
 * so the exhaustive `Record<WorkflowNode['kind'], NodeExecutor>` keeps working
 * as the vocabulary grows: node #6 must fail to compile, and a `default` would
 * quietly absorb it.
 *
 * `validateWorkflow` refuses to connect a note at all, so this never actually
 * runs on a valid graph — it exists to keep the type exhaustive and to make an
 * unconnected note a harmless `succeeded` rather than a crash.
 */
export const noteExecutor: NodeExecutor = async () =>
  ({ ok: true, output: null }) satisfies NodeOutcome;
