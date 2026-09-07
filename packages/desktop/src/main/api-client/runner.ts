import {
  toDraft,
  ApiRunCollectionRequest as ApiRunCollectionRequestSchema,
  type ApiResponse,
  type ApiRunEvent,
  type ApiRunItemResult,
  type ApiRunItemStatus,
  type ApiRunSummary,
  type ApiRunTarget,
  type AssertionResult,
  type KeyValueRow,
  type PostmanCollection,
  type PostmanEnvironment,
  type PostmanEnvironmentValue,
  type PostmanItem,
  type PostmanVariable,
  type ScriptContext,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { readCollection, saveCollection } from './collection-io';
import { readEnvironment, saveEnvironment } from './environment-io';
import { runScriptInUtilityProcess } from './script-runner-broker';
import { sendApiRequest } from './send';
import { resolveWorkdir } from '../repo-registry';

/** The wire shape of one `apiRunCollection` call, inferred from the shared
 *  schema rather than duplicated — mirrors `send.ts`'s own `ApiSendRequest`,
 *  which documents why the `Api*` group's request schemas carry no sibling
 *  `z.infer` export of their own. */
export type ApiRunCollectionRequest = z.infer<typeof ApiRunCollectionRequestSchema>;

/**
 * Phase 70 Theme C — the collection runner.
 *
 * A flat, depth-first walk of a collection's (or one folder's) item tree, in
 * file order, calling Phase 66's `sendApiRequest` then Theme B's `runScript`
 * per request. Four properties make this more than a `for` loop over
 * `sendApiRequest`:
 *
 * 1. **It streams.** `runCollection` never resolves until the whole walk is
 *    done (or aborted) — the caller (`api-client-handlers.ts`) is what turns
 *    each `emit(...)` call into an `apiRunProgress` push and the final
 *    `ApiRunSummary` into `apiRunDone`, exactly as `query-service.ts` turns
 *    `startQuery`'s callbacks into `dbQueryBatch`/`dbQueryDone`.
 * 2. **A transport failure does not stop the walk** — `sendApiRequest`'s own
 *    throw is caught per item, recorded as `status: 'error'` with zero
 *    assertions, and the loop moves on to the next item. A run that stopped
 *    on the first unreachable host would be useless against a
 *    partly-deployed environment, which is exactly when you run one.
 * 3. **Abort leaves the remainder `skipped`, not silently absent.** `signal`
 *    is the same `AbortSignal` `sendApiRequest` is called with, so aborting
 *    it cancels whichever request is in flight; the loop then checks
 *    `signal.aborted` before dequeuing the next item and, once true, marks
 *    every item that never started `skipped` rather than leaving them out of
 *    the result list.
 * 4. **`pm.environment.set`/`pm.collectionVariables.set` thread forward.**
 *    Exactly as the single-request flow (`api-client-handlers.ts`'s own
 *    `apiRunScript` handler) commits a script's mutations to disk through
 *    Theme A's `saveEnvironment`/`saveCollection` immediately after the run
 *    that produced them, this walk does the same after every item's script —
 *    which is what makes the *next* item's `sendApiRequest` (reading the
 *    environment fresh off disk) and this walk's own next script context
 *    (rebuilt from the same fresh read, and from an in-memory
 *    `collectionVariables` array refreshed the same way) see the mutation.
 *    {@link applyEnvironmentMutations}/{@link applyCollectionVariableMutations}
 *    are the exact functions the single-request handler already used for
 *    this — moved here, and imported back into that handler, rather than
 *    kept as a second copy.
 *
 * **The consent gate is checked once for the whole run, before any of this
 * runs** — by the caller, not here (`runCollection` itself never touches
 * `collection-trust.ts`). A run triggered a script exactly as a single send's
 * automatic Tests-script run does, and Decision 2 draws no distinction
 * between the two: an untrusted collection's scripts do not run just because
 * a run rather than a single send asked for them. See
 * `api-client-handlers.ts`'s `apiRunCollection` handler and its own
 * `collectionHasScripts` check.
 */

const DEFAULT_SCRIPT_TIMEOUT_MS = 5_000;

/** One request-shaped leaf, in file order, with the folder-name path that
 *  addresses it — the same shape `collection-tree.tsx`'s own walk builds. */
type RunLeaf = { item: PostmanItem; itemPath: string[] };

/** Depth-first, in file (array) order — a folder's own items before its next
 *  sibling, exactly as `collection-tree.tsx` renders them and exactly the
 *  order `runner.test.ts`'s nested-folder fixture asserts. */
function flattenRequests(items: readonly PostmanItem[], path: string[] = []): RunLeaf[] {
  const out: RunLeaf[] = [];
  for (const item of items) {
    const itemPath = [...path, item.name];
    if (item.request) {
      out.push({ item, itemPath });
    } else if (item.item) {
      out.push(...flattenRequests(item.item, itemPath));
    }
  }
  return out;
}

/** The folder named by `path` (a chain of folder names, root-first), or
 *  `null` if any segment does not resolve to a folder-shaped item — a
 *  target renamed or deleted since the picker last saw it, treated as an
 *  empty run rather than a crash. */
function findFolder(items: readonly PostmanItem[], path: readonly string[]): PostmanItem[] | null {
  if (path.length === 0) return [...items];
  const [head, ...rest] = path;
  const match = items.find((item) => item.name === head && Array.isArray(item.item));
  if (!match?.item) return null;
  return findFolder(match.item, rest);
}

/** The leaves a `target` names, in file order. `null`/`[]` alike (a missing
 *  collection, a folder that no longer exists) resolve to an empty run —
 *  `total: 0`, nothing to skip, no assertion this itself has to make. */
function resolveLeaves(collection: PostmanCollection, target: ApiRunTarget): RunLeaf[] {
  const roots = target.kind === 'collection' ? collection.item : findFolder(collection.item, target.path);
  return roots ? flattenRequests(roots) : [];
}

/** Whether any leaf `target` would walk carries a non-empty Tests script —
 *  the one fact the consent gate needs before a run starts, and the only
 *  reason a caller (`api-client-handlers.ts`) needs to read+flatten the
 *  collection independently of `runCollection`'s own walk. */
export async function collectionHasScripts(
  repoRoot: string,
  collectionId: string,
  target: ApiRunTarget,
): Promise<boolean> {
  const result = await readCollection(repoRoot, collectionId);
  if (!result.ok) return false;
  return resolveLeaves(result.value, target).some((leaf) => toDraft(leaf.item).testScript.trim().length > 0);
}

/** `PostmanVariable[]` → the flat map a script's `pm.collectionVariables` and
 *  `pm.variables` want — the same reduction `send.ts`'s own (private)
 *  `collectVariables` makes, kept as its own small copy here for the
 *  identical reason `api-client-handlers.ts`'s own copy already is: it is a
 *  five-line pure function, not worth exporting from `send.ts` for one
 *  extra caller. */
function toVariableRecord(variables: readonly PostmanVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.value === undefined) continue;
    out[variable.key] = typeof variable.value === 'string' ? variable.value : String(variable.value);
  }
  return out;
}

/** `PostmanEnvironmentValue[]` → `ScriptContext.environment` — disabled rows
 *  excluded outright, mirroring `send.ts`'s `collectEnvironmentVariables`. */
function toEnvironmentRecord(values: readonly PostmanEnvironmentValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of values) {
    if (row.enabled === false) continue;
    if (row.value === undefined) continue;
    out[row.key] = row.value;
  }
  return out;
}

/** A draft's enabled, non-empty header rows as the flat map `ScriptContext`'s
 *  `pm.request.headers` reads — the request as it was *sent*, `{{var}}`
 *  tokens included unresolved (mirrors `ScriptRequestInfoSchema`'s own
 *  header comment: this is the draft, never the interpolated wire request,
 *  so a script's `console.log(pm.request)` cannot leak a resolved secret). */
function draftHeaderRecord(headers: readonly KeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of headers) {
    if (!row.enabled || row.key === '') continue;
    out[row.key] = row.value;
  }
  return out;
}

/**
 * Fold a script's `pm.environment.set` calls into the environment file,
 * through Theme A's own `saveEnvironment` — moved here from
 * `api-client-handlers.ts` so the collection runner's own walk (below) can
 * call the identical function a single script run's IPC handler calls,
 * rather than a second copy of this logic drifting from the first.
 *
 * `confirmed: true` unconditionally: this is an automatic side effect of a
 * script run, with no confirm dialog to show it to, and it is safe for the
 * same reason a fresh secret row can never appear here — `mutated` is a flat
 * `Record<string,string>`, which can update an *existing* row's value (a
 * `type:'secret'` row included, if the script legitimately reads and
 * rewrites one) but can never introduce a brand-new `type:'secret'` row: a
 * mutation carries no `type` at all, so an unmatched key always lands as
 * `type:'default'`. A repository ever reaching a secret-valued row in the
 * first place already went through the blast-radius confirm once, on the
 * save that created it — this call cannot be the first time.
 */
export async function applyEnvironmentMutations(
  repoRoot: string,
  environmentId: string,
  mutated: Readonly<Record<string, string>>,
): Promise<void> {
  const current = await readEnvironment(repoRoot, environmentId);
  if (!current.ok) return; // best-effort — a stale/deleted environment must not fail the script run itself
  const byKey = new Map(current.value.values.map((row) => [row.key, row] as const));
  for (const [key, value] of Object.entries(mutated)) {
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, value } : { key, value, type: 'default', enabled: true });
  }
  const updated: PostmanEnvironment = { ...current.value, values: Array.from(byKey.values()) };
  await saveEnvironment(repoRoot, environmentId, updated, true);
}

/** The collection-variable equivalent of {@link applyEnvironmentMutations} —
 *  folds `pm.collectionVariables.set` into the collection's own
 *  `variable[]`, through Theme A's `saveCollection`. Collection variables
 *  carry no secret split at all (Theme A's own scope), so there is no
 *  confirm gate to reason about here in the first place. */
export async function applyCollectionVariableMutations(
  repoRoot: string,
  collectionId: string,
  mutated: Readonly<Record<string, string>>,
): Promise<void> {
  const current = await readCollection(repoRoot, collectionId);
  if (!current.ok) return;
  const variables = Array.isArray(current.value.variable) ? current.value.variable : [];
  const byKey = new Map(variables.map((variable) => [variable.key, variable] as const));
  for (const [key, value] of Object.entries(mutated)) {
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, value } : { key, value });
  }
  const updated = { ...current.value, variable: Array.from(byKey.values()) };
  await saveCollection(repoRoot, collectionId, updated);
}

/** One item's status, from what its send and (if any) its script produced.
 *  A transport failure never reaches the script stage at all — `error`
 *  covers both that and a script that itself threw. */
function statusFor(errorMessage: string | null, assertions: readonly AssertionResult[]): ApiRunItemStatus {
  if (errorMessage !== null) return 'error';
  if (assertions.some((assertion) => !assertion.passed)) return 'failed';
  return 'passed';
}

/**
 * Run one item: `sendApiRequest`, then — if the item carries a non-empty
 * Tests script — Theme B's `runScript` against the settled response,
 * folding any mutation back to disk before returning. Never throws: a
 * transport failure and a script's own `error` both land in the returned
 * `ApiRunItemResult`, per Property 2.
 */
async function runOne(
  repoRoot: string,
  req: ApiRunCollectionRequest,
  leaf: RunLeaf,
  collectionVariables: readonly PostmanVariable[],
  signal: AbortSignal,
): Promise<{ result: ApiRunItemResult; collectionVariables: PostmanVariable[] }> {
  const draft = toDraft(leaf.item);
  const startedAt = performance.now();

  let response: ApiResponse | null = null;
  let errorMessage: string | null = null;
  try {
    response = await sendApiRequest(
      {
        repoId: req.repoId,
        requestId: `${req.runId}:${leaf.itemPath.join('/')}`,
        draft,
        collectionVariables: [...collectionVariables],
        environmentId: req.environmentId,
        ...(req.timeoutMs ? { timeoutMs: req.timeoutMs } : {}),
        collectionId: req.collectionId,
        itemPath: leaf.itemPath,
      },
      signal,
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  let assertions: AssertionResult[] = [];
  let nextCollectionVariables: PostmanVariable[] = [...collectionVariables];

  if (response && draft.testScript.trim().length > 0) {
    let environment: Record<string, string> = {};
    if (req.environmentId !== null) {
      const loaded = await readEnvironment(repoRoot, req.environmentId);
      if (loaded.ok) environment = toEnvironmentRecord(loaded.value.values);
    }

    const context: ScriptContext = {
      environment,
      collectionVariables: toVariableRecord(collectionVariables),
      request: { method: draft.method, url: draft.url, headers: draftHeaderRecord(draft.headers) },
      response: {
        code: response.status,
        status: response.statusText,
        headers: response.headers,
        body: response.body,
        bodyIsJson: response.bodyIsJson,
      },
    };

    const run = await runScriptInUtilityProcess(
      draft.testScript,
      context,
      req.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
    );
    assertions = run.results;
    if (run.error) errorMessage = run.error;

    // Property 4 — commit both mutation maps to disk *before* the next item
    // is sent, so its own `sendApiRequest` (environment) and this walk's
    // own in-memory `collectionVariables` (below) both see them.
    if (req.environmentId !== null && Object.keys(run.mutations.environment).length > 0) {
      await applyEnvironmentMutations(repoRoot, req.environmentId, run.mutations.environment);
    }
    if (Object.keys(run.mutations.collectionVariables).length > 0) {
      await applyCollectionVariableMutations(repoRoot, req.collectionId, run.mutations.collectionVariables);
      const updated = await readCollection(repoRoot, req.collectionId);
      if (updated.ok) nextCollectionVariables = updated.value.variable ?? [];
    }
  }

  return {
    result: {
      itemPath: leaf.itemPath,
      name: leaf.item.name,
      method: draft.method,
      status: statusFor(errorMessage, assertions),
      durationMs: performance.now() - startedAt,
      response,
      assertions,
      error: errorMessage,
    },
    collectionVariables: nextCollectionVariables,
  };
}

function emptySummary(runId: string): ApiRunSummary {
  return { runId, total: 0, completed: 0, skipped: 0, passed: 0, failed: 0, durationMs: 0, aborted: false };
}

/**
 * Run a collection (or one folder inside it), emitting one `ApiRunEvent` per
 * item as it settles and resolving the final `ApiRunSummary` once the walk
 * is done or aborted. See this file's header for the four properties that
 * make this more than a `for` loop.
 */
export async function runCollection(
  req: ApiRunCollectionRequest,
  emit: (event: ApiRunEvent) => void,
  signal: AbortSignal,
): Promise<ApiRunSummary> {
  const startedAt = performance.now();

  const repoRoot = await resolveWorkdir(req.repoId);
  if (!repoRoot) return emptySummary(req.runId);

  const collectionResult = await readCollection(repoRoot, req.collectionId);
  if (!collectionResult.ok) return emptySummary(req.runId);

  const leaves = resolveLeaves(collectionResult.value, req.target);
  const total = leaves.length;

  let collectionVariables: PostmanVariable[] = collectionResult.value.variable ?? [];
  let completed = 0;
  let passed = 0;
  let failed = 0;
  let aborted = false;

  for (let index = 0; index < total; index += 1) {
    // Property 3 — stop before the next item is dequeued; whatever is left
    // after this loop exits is emitted as `skipped` below.
    if (signal.aborted) {
      aborted = true;
      break;
    }

    const leaf = leaves[index]!;
    const outcome = await runOne(repoRoot, req, leaf, collectionVariables, signal);
    collectionVariables = outcome.collectionVariables;
    completed += 1;
    if (outcome.result.status === 'passed') passed += 1;
    else if (outcome.result.status === 'failed' || outcome.result.status === 'error') failed += 1;

    emit({ runId: req.runId, index, total, item: outcome.result });
  }

  for (let index = completed; index < total; index += 1) {
    const leaf = leaves[index]!;
    emit({
      runId: req.runId,
      index,
      total,
      item: {
        itemPath: leaf.itemPath,
        name: leaf.item.name,
        method: leaf.item.request?.method ?? 'GET',
        status: 'skipped',
        durationMs: 0,
        response: null,
        assertions: [],
        error: null,
      },
    });
  }

  return {
    runId: req.runId,
    total,
    completed,
    skipped: total - completed,
    passed,
    failed,
    durationMs: performance.now() - startedAt,
    aborted,
  };
}
