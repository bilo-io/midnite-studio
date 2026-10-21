import {
  CHANNELS,
  EVENT_CHANNELS,
  apiFailure,
  apiOk,
  schemas,
  type ApiCollectionSummary,
  type ApiEnvironmentSummary,
  type ApiHistoryEntry,
  type ApiOpResult,
  type ApiResponse,
  type ApiRunStartOutcome,
  type PostmanCollection,
  type PostmanEnvironment,
  type PostmanEnvironmentValue,
  type PostmanVariable,
  type SaveEnvironmentOutcome,
  type ScriptContext,
  type ScriptRunOutcome,
} from '@midnite/studio-shared';
import { describeFsError, type FeatureMainContext } from '@midnite/studio-runtime';

import {
  deleteCollection,
  exportCollection,
  importCollection,
  listCollections,
  readCollection,
  saveCollection,
} from '../collection-io';
import { readScriptTrust, setScriptTrust } from '../collection-trust';
import {
  deleteEnvironment,
  listEnvironments,
  readEnvironment,
  saveEnvironment,
} from '../environment-io';
import { clearHistory, listHistory } from '../history';
import {
  applyCollectionVariableMutations,
  applyEnvironmentMutations,
  collectionHasScripts,
  runCollection,
} from '../runner';
import { cancelRequest, sendApiRequest } from '../send';
import { currentScriptRunner, resolveWorkdir } from '../services';

/**
 * The native dialogs the API client opens — the composer's, because a dialog is Electron's. The
 * renderer never sees a path: the picker opens in main and only an outcome comes back.
 */
export type ApiClientDialogs = {
  /** An "open file" dialog; resolves to the chosen path, or `null` when the user cancels. */
  pickFile(options: { title: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  /** A "save" dialog; resolves to the chosen path, or `null` when the user cancels. */
  pickSavePath(options: { title: string; defaultPath?: string }): Promise<string | null>;
};

/** A script's default bound — generous for a handful of `pm.test` blocks and
 *  short of anything a hung UI would read as the app itself being stuck. */
const DEFAULT_SCRIPT_TIMEOUT_MS = 5_000;

/** In-flight collection runs, keyed by `runId` — populated on start, removed
 *  in the run's own `.finally`. `apiCancelRun`'s only source of truth for
 *  which `AbortController` to abort (Phase 70 Theme C). */
const activeRunControllers = new Map<string, AbortController>();

/** Abort every in-flight collection run — the composer's quit hook, beside the script runner's kill. */
export function cancelAllApiRuns(): void {
  for (const controller of activeRunControllers.values()) controller.abort();
}

/** `PostmanVariable[]` → the flat map `ScriptContext.collectionVariables`
 *  wants — the same reduction `send.ts`'s own (private) `collectVariables`
 *  makes, kept as its own small copy here rather than exported from that
 *  module purely for this one caller. */
function toVariableRecord(variables: readonly PostmanVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.value === undefined) continue;
    out[variable.key] = typeof variable.value === 'string' ? variable.value : String(variable.value);
  }
  return out;
}

/** `PostmanEnvironmentValue[]` → `ScriptContext.environment` — a disabled
 *  row is excluded outright, mirroring `send.ts`'s
 *  `collectEnvironmentVariables` exactly (a script's `pm.environment.get`
 *  must see the same tier `{{var}}` interpolation resolves against, disabled
 *  rows included as "not there" rather than "empty string"). */
function toEnvironmentRecord(values: readonly PostmanEnvironmentValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of values) {
    if (row.enabled === false) continue;
    if (row.value === undefined) continue;
    out[row.key] = row.value;
  }
  return out;
}

/**
 * The API Client's IPC surface (Phase 66 Themes E and G).
 *
 * `handle` rather than `handleOp`: the envelope here is `ApiOpResult`, not
 * `GitOpResult` — an API-client op has no `conflict` arm to borrow, exactly
 * as Phase 61 found for the database client. The `onInvalid` arm converts a
 * schema failure to `apiFailure`, mirroring `database.ts`'s `dbFailure`.
 *
 * **Every handler body wraps itself in try/catch.** `handle` converts a
 * schema failure to an envelope but *not* a thrown exception, and an uncaught
 * throw rejects the `invoke` — the renderer then sees an opaque
 * "Error invoking remote method …" string with the real cause gone, instead
 * of a message it can render.
 */

/** `Error` → message, without leaking a non-Error throw as "[object Object]". */
function messageOf(err: unknown): string {
  if (err instanceof Error) return describeFsError(err);
  return String(err);
}

/**
 * Resolve `repoId` → repo root, or the one failure every collection op shares.
 * `resolveWorkdir` returns `null` for a repo the registry no longer knows,
 * which is a normal outcome (the repo was closed) and not an exception.
 */
async function withRepoRoot<T>(
  repoId: string,
  run: (repoRoot: string) => Promise<ApiOpResult<T>>,
): Promise<ApiOpResult<T>> {
  try {
    const repoRoot = await resolveWorkdir(repoId);
    if (!repoRoot) return apiFailure(`Repository ${repoId} is not open.`);
    return await run(repoRoot);
  } catch (err) {
    return apiFailure(messageOf(err));
  }
}

export function registerApiClientHandlers(ctx: FeatureMainContext, dialogs: ApiClientDialogs): void {
  const handle = ctx.ipc.handle.bind(ctx.ipc);
  const handleBare = ctx.ipc.handleBare.bind(ctx.ipc);

  handle(
    CHANNELS.apiListCollections,
    schemas.ApiListCollectionsRequest,
    (req): Promise<ApiOpResult<ApiCollectionSummary[]>> =>
      withRepoRoot(req.repoId, (root) => listCollections(root)),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiReadCollection,
    schemas.ApiReadCollectionRequest,
    (req): Promise<ApiOpResult<PostmanCollection>> =>
      withRepoRoot(req.repoId, (root) => readCollection(root, req.collectionId)),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiSaveCollection,
    schemas.ApiSaveCollectionRequest,
    (req): Promise<ApiOpResult> =>
      withRepoRoot(req.repoId, (root) =>
        saveCollection(root, req.collectionId, req.collection),
      ),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiDeleteCollection,
    schemas.ApiDeleteCollectionRequest,
    (req): Promise<ApiOpResult> =>
      withRepoRoot(req.repoId, (root) => deleteCollection(root, req.collectionId)),
    (issue) => apiFailure(issue),
  );

  /**
   * The renderer never sees a file path — the picker opens here, in main
   * (`repoPickDirectory`'s `showOpenDialog` shape, `win ? … : …` fallback
   * included). A `value` of `null` on success is a cancelled dialog, not a
   * failure, which is why the response schema is `.nullable()`.
   */
  handle(
    CHANNELS.apiImportCollection,
    schemas.ApiImportCollectionRequest,
    (req): Promise<ApiOpResult<ApiCollectionSummary | null>> =>
      withRepoRoot(req.repoId, async (root) => {
        const sourcePath = await dialogs.pickFile({
          title: 'Import Collection',
          filters: [{ name: 'Postman collection', extensions: ['json'] }],
        });
        if (!sourcePath) return apiOk<ApiCollectionSummary | null>(null);

        return importCollection(root, sourcePath);
      }),
    (issue) => apiFailure(issue),
  );

  /** The native save dialog opens here, in main; the renderer never picks a path. */
  handle(
    CHANNELS.apiExportCollection,
    schemas.ApiExportCollectionRequest,
    (req): Promise<ApiOpResult> =>
      withRepoRoot(req.repoId, async (root) => {
        const filePath = await dialogs.pickSavePath({ title: 'Export Collection', defaultPath: req.collectionId });
        if (!filePath) return apiOk();
        return exportCollection(root, req.collectionId, filePath);
      }),
    (issue) => apiFailure(issue),
  );

  /**
   * Send resolves an `ApiResponse` for any settled HTTP exchange — a 404
   * included, because an HTTP error is a normal outcome, not a transport
   * failure — and throws for anything that never got that far. This is the
   * try/catch that turns the latter into `{ok:false}`; `send.ts` deliberately
   * has none of its own.
   */
  handle(
    CHANNELS.apiSendRequest,
    schemas.ApiSendRequestRequest,
    async (req): Promise<ApiOpResult<ApiResponse>> => {
      const controller = new AbortController();
      try {
        return apiOk(await sendApiRequest(req, controller.signal));
      } catch (err) {
        return apiFailure(messageOf(err));
      }
    },
    (issue) => apiFailure(issue),
  );

  /** A cancel on an unknown id is a no-op `{ok:true}`: the race where a
   *  response lands as the user clicks Cancel is normal, and an error toast
   *  for it is noise. */
  handle(
    CHANNELS.apiCancelRequest,
    schemas.ApiCancelRequestRequest,
    (req): ApiOpResult => {
      try {
        return cancelRequest(req.requestId);
      } catch (err) {
        return apiFailure(messageOf(err));
      }
    },
    (issue) => apiFailure(issue),
  );

  /**
   * The Body tab's `binary` mode and a `form-data` file row share this one
   * picker (Theme D) — no repo scoping, unlike `apiImportCollection`: the
   * picked path is confined against the open repository only where it is
   * actually read off disk, at send time (`confineTree` in `send.ts`), so a
   * picker that ran that same check here would just duplicate it against a
   * path nothing has read yet.
   */
  handleBare(CHANNELS.apiPickBinaryFile, async (): Promise<ApiOpResult<string | null>> => {
    try {
      return apiOk<string | null>(await dialogs.pickFile({ title: 'Choose File' }));
    } catch (err) {
      return apiFailure(messageOf(err));
    }
  });

  // --- environments (Phase 70 Theme A) ----------------------------------------

  handle(
    CHANNELS.apiListEnvironments,
    schemas.ApiListEnvironmentsRequest,
    (req): Promise<ApiOpResult<ApiEnvironmentSummary[]>> =>
      withRepoRoot(req.repoId, (root) => listEnvironments(root)),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiReadEnvironment,
    schemas.ApiReadEnvironmentRequest,
    (req): Promise<ApiOpResult<PostmanEnvironment>> =>
      withRepoRoot(req.repoId, (root) => readEnvironment(root, req.environmentId)),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiSaveEnvironment,
    schemas.ApiSaveEnvironmentRequest,
    (req): Promise<ApiOpResult<SaveEnvironmentOutcome>> =>
      withRepoRoot(req.repoId, (root) =>
        saveEnvironment(root, req.environmentId, req.environment, req.confirmed),
      ),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiDeleteEnvironment,
    schemas.ApiDeleteEnvironmentRequest,
    (req): Promise<ApiOpResult> =>
      withRepoRoot(req.repoId, (root) => deleteEnvironment(root, req.environmentId)),
    (issue) => apiFailure(issue),
  );

  // --- request history (Phase 70 Theme D) -------------------------------------
  // Recording itself has no handler here — it happens inside `sendApiRequest`
  // (`send.ts`), the one place that already has the resolved URL and the
  // secret-typed environment values a row's redaction needs. These two are
  // the renderer's read/clear surface only.

  handle(
    CHANNELS.apiListHistory,
    schemas.ApiListHistoryRequest,
    (req): Promise<ApiOpResult<ApiHistoryEntry[]>> =>
      withRepoRoot(req.repoId, (root) => listHistory(root)),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiClearHistory,
    schemas.ApiClearHistoryRequest,
    (req): Promise<ApiOpResult> => withRepoRoot(req.repoId, (root) => clearHistory(root)),
    (issue) => apiFailure(issue),
  );

  // --- scripts (Phase 70 Theme B) ----------------------------------------------
  // Decision 2: **every** collection is trust-checked, however it arrived on
  // this machine — there is no self-imported/self-authored special case.
  // `runAnyway` (*Run once*) is the only thing that skips the check for a
  // single call without persisting anything.

  handle(
    CHANNELS.apiRunScript,
    schemas.ApiRunScriptRequest,
    (req): Promise<ApiOpResult<ScriptRunOutcome>> =>
      withRepoRoot(req.repoId, async (root) => {
        if (!req.runAnyway) {
          const trusted = await readScriptTrust(root, req.collectionId);
          if (trusted !== true) return apiOk<ScriptRunOutcome>({ status: 'needs-consent' });
        }

        let environment: Record<string, string> = {};
        if (req.environmentId !== null) {
          const loaded = await readEnvironment(root, req.environmentId);
          if (loaded.ok) environment = toEnvironmentRecord(loaded.value.values);
        }

        const context: ScriptContext = {
          environment,
          collectionVariables: toVariableRecord(req.collectionVariables),
          request: req.request,
          response: req.response
            ? {
                code: req.response.status,
                status: req.response.statusText,
                headers: req.response.headers,
                body: req.response.body,
                bodyIsJson: req.response.bodyIsJson,
              }
            : null,
        };

        const run = await currentScriptRunner().run(
          req.source,
          context,
          req.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
        );

        // Mutations never touch disk from inside the sandbox — this is the
        // one place either map is ever written anywhere.
        if (req.environmentId !== null && Object.keys(run.mutations.environment).length > 0) {
          await applyEnvironmentMutations(root, req.environmentId, run.mutations.environment);
        }
        if (Object.keys(run.mutations.collectionVariables).length > 0) {
          await applyCollectionVariableMutations(root, req.collectionId, run.mutations.collectionVariables);
        }

        return apiOk<ScriptRunOutcome>({ status: 'ran', run });
      }),
    (issue) => apiFailure(issue),
  );

  handle(
    CHANNELS.apiSetScriptTrust,
    schemas.ApiSetScriptTrustRequest,
    (req): Promise<ApiOpResult> =>
      withRepoRoot(req.repoId, async (root) => {
        const ok = await setScriptTrust(root, req.collectionId, req.trusted);
        return ok ? apiOk() : apiFailure('Could not save that decision.');
      }),
    (issue) => apiFailure(issue),
  );

  // --- api client collection runner (Phase 70 Theme C) ------------------------
  // `apiRunCollection` resolves immediately — `started` once the walk begins
  // streaming over `apiRunProgress`/`apiRunDone`, or `needs-consent` if the
  // target carries a script and this machine has not (yet) trusted the
  // collection, checked once for the whole run rather than per request
  // (Decision 2 draws no distinction between a run and a single send).
  // `activeRunControllers` is this handler's own cancel map, keyed by
  // `runId` — the same shape `send.ts`'s own `activeControllers` is, one
  // level up, since a run's `AbortController` is created here rather than
  // inside `runCollection` itself (which only ever receives the signal).

  handle(
    CHANNELS.apiRunCollection,
    schemas.ApiRunCollectionRequest,
    (req): Promise<ApiOpResult<ApiRunStartOutcome>> =>
      withRepoRoot(req.repoId, async (root) => {
        if (!req.runAnyway) {
          const hasScripts = await collectionHasScripts(root, req.collectionId, req.target);
          if (hasScripts) {
            const trusted = await readScriptTrust(root, req.collectionId);
            if (trusted !== true) return apiOk<ApiRunStartOutcome>({ status: 'needs-consent' });
          }
        }

        const controller = new AbortController();
        activeRunControllers.set(req.runId, controller);

        // `emit` is a no-op once the window is gone, so a run that outlives it ends quietly.
        void runCollection(
          req,
          (event) => ctx.emit(EVENT_CHANNELS.apiRunProgress, event),
          controller.signal,
        )
          .then((summary) => ctx.emit(EVENT_CHANNELS.apiRunDone, { runId: req.runId, summary }))
          .finally(() => activeRunControllers.delete(req.runId));

        return apiOk<ApiRunStartOutcome>({ status: 'started' });
      }),
    (issue) => apiFailure(issue),
  );

  /** A cancel on an unknown/already-finished `runId` is a no-op `{ok:true}`,
   *  the same race `apiCancelRequest` already treats as normal. */
  handle(
    CHANNELS.apiCancelRun,
    schemas.ApiCancelRunRequest,
    (req): ApiOpResult => {
      activeRunControllers.get(req.runId)?.abort();
      return apiOk();
    },
    (issue) => apiFailure(issue),
  );
}
