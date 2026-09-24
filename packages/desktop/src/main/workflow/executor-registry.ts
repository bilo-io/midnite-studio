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
  /**
   * `timedOut` is what makes the node's recorded status `timeout` rather than
   * `failed`. It matters because the executor is the only party that can abort
   * the work — the engine's own deadline can stop *waiting*, but it cannot
   * close a socket — so an executor that honours `context.timeoutMs` has to be
   * able to say which kind of failure it produced. Without this the six-value
   * status enum would collapse to five in practice.
   */
  | { ok: false; error: string; timedOut?: boolean };

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
  /**
   * The run this node belongs to (Phase 95 Theme J) — `agent`/`script`
   * executors need both to stamp `TerminalSession.workflowRunRef`, which
   * `node.id` alone cannot supply (the run knows its own id and its
   * workflow's; the node schema knows neither). Every other executor ignores
   * these two fields entirely.
   */
  workflowId: string;
  runId: string;
  /**
   * Record this node's `TerminalSession` id onto the run (Phase 95 Theme J),
   * as soon as `agent`/`script` know it — not only once the node settles.
   * Without this, the terminal accordion group and the canvas node's live
   * glow would have no `sessionId` to bind to until the node was already
   * done, which is exactly the window they most need it. A no-op for every
   * other executor.
   */
  reportSessionId: (sessionId: string) => Promise<void>;
};

/**
 * **Executors never throw.** A rejection out of one is a bug in the executor,
 * not a node failure — the engine treats it as such rather than quietly
 * recording it as the user's mistake. Everything a user can get wrong comes
 * back as `{ ok: false, error }`.
 */
export type NodeExecutor = (node: WorkflowNode, context: ExecutorContext) => Promise<NodeOutcome>;

export type ExecutorRegistry = Record<WorkflowNode['kind'], NodeExecutor>;
