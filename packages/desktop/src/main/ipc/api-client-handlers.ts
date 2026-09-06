import {
  CHANNELS,
  apiFailure,
  apiOk,
  schemas,
  type ApiCollectionSummary,
  type ApiOpResult,
  type ApiResponse,
  type PostmanCollection,
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
import { cancelRequest, sendApiRequest } from '../api-client/send';
import { describeFsError } from '../fs-scope-write';
import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

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
}

/** Re-exported for the Export… context-menu action, which needs a save dialog. */
export async function exportCollectionViaDialog(
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
