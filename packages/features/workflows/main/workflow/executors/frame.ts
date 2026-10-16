import type { NodeExecutor, NodeOutcome } from '../executor-registry';

/**
 * A `frame` (Phase 97 Theme I) is canvas furniture — it groups other nodes
 * under a shared contract/context/policy, the same way `note` groups nothing
 * but a label — and has nothing to run itself.
 *
 * It gets an explicit no-op entry rather than a `default` arm in the registry,
 * so the exhaustive `Record<WorkflowNode['kind'], NodeExecutor>` keeps working
 * as the vocabulary grows — the same reason `note` has one.
 *
 * `validateWorkflow` refuses to connect a frame at all, so this never
 * actually runs on a valid graph.
 */
export const frameExecutor: NodeExecutor = async () => ({ ok: true, output: null }) satisfies NodeOutcome;
