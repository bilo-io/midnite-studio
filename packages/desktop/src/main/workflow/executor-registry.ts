import type { WorkflowNode } from '@midnite/studio-shared';

/**
 * The one place a node kind is bound to the code that runs it.
 *
 * Typed as a `Record` over the `kind` union from `workflow.ts` rather than a
 * `Map` with a runtime `get`: adding node #6 to the union then becomes a
 * compile error here, which is the whole reason that union is closed.
 */

/**
 * What an executor answers with.
 *
 * `output` is what downstream nodes interpolate against. `skipDownstream` is
 * the `condition` node's whole job — a satisfied predicate is `ok: true` and
 * carries on; an unsatisfied one is also `ok: true` (nothing went wrong) but
 * asks the engine to mark everything downstream `skipped`.
 */
export type NodeOutcome =
  | { ok: true; output: unknown; truncated?: boolean; skipDownstream?: boolean }
  | { ok: false; error: string };

/**
 * A cancel signal, not an `AbortSignal`.
 *
 * The engine has to answer "was this cancelled?" at several points inside an
 * executor, and a plain thunk keeps the executor testable without constructing
 * a controller. Executors that make a real request build their own
 * `AbortController` from it.
 */
export type CancelSignal = { cancelled: () => boolean };

export type ExecutorContext = {
  /** Node id → that node's recorded output, for `{{...}}` resolution. */
  upstream: Record<string, unknown>;
  signal: CancelSignal;
  /** Milliseconds; the engine has already applied the node's own override. */
  timeoutMs: number;
};

/**
 * **Executors never throw.** A rejection out of one is a bug in the executor,
 * not a node failure — the engine treats it as such rather than quietly
 * recording it as the user's mistake. Everything a user can get wrong comes
 * back as `{ ok: false, error }`.
 */
export type NodeExecutor = (node: WorkflowNode, context: ExecutorContext) => Promise<NodeOutcome>;

export type ExecutorRegistry = Record<WorkflowNode['kind'], NodeExecutor>;
