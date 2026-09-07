import {
  CHANNELS,
  apiFailure,
  apiOk,
  schemas,
  type ApiCollectionSummary,
  type ApiEnvironmentSummary,
  type ApiHistoryEntry,
  type ApiOpResult,
  type ApiResponse,
  type PostmanCollection,
  type PostmanEnvironment,
  type SaveEnvironmentOutcome,
} from '@midnite/studio-shared';
import { dialog, type BrowserWindow } from 'electron';

import {
  deleteCollection,
  exportCollection,
  importCollection,
  listCollections,
  readCollection,
  saveCollection,
} from '../api-client/collection-io';
import {
  deleteEnvironment,
  listEnvironments,
  readEnvironment,
  saveEnvironment,
} from '../api-client/environment-io';
import { clearHistory, listHistory } from '../api-client/history';
import { cancelRequest, sendApiRequest } from '../api-client/send';
import { describeFsError } from '../fs-scope-write';
import { resolveWorkdir } from '../repo-registry';
import { handle, handleBare } from './handle';

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

export function registerApiClientHandlers(getWindow: () => BrowserWindow | null): void {
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
        const win = getWindow();
        const options = {
          title: 'Import Collection',
          filters: [{ name: 'Postman collection', extensions: ['json'] }],
          properties: ['openFile' as const],
        };
        const picked = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);

        const sourcePath = picked.canceled ? null : (picked.filePaths[0] ?? null);
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
      exportCollectionViaDialog(getWindow, req.repoId, req.collectionId),
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
      const win = getWindow();
      const options = { title: 'Choose File', properties: ['openFile' as const] };
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      return apiOk<string | null>(picked.canceled ? null : (picked.filePaths[0] ?? null));
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
}

/** The Export… context-menu action's save dialog. Private: `apiExportCollection`
 *  above is the only caller, and the renderer never sees a path. */
async function exportCollectionViaDialog(
  getWindow: () => BrowserWindow | null,
  repoId: string,
  collectionId: string,
): Promise<ApiOpResult> {
  return withRepoRoot(repoId, async (root) => {
    const win = getWindow();
    const options = { title: 'Export Collection', defaultPath: collectionId };
    const picked = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return apiOk();
    return exportCollection(root, collectionId, picked.filePath);
  });
}
