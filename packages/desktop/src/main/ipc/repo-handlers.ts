import { BrowserWindow, dialog } from 'electron';

import { addWorktree, readCommitDetail, removeWorktree, revParse } from '@midnite/git-engine';
import { CHANNELS, failure, schemas } from '@midnite/git-shared';
import { ipcMain } from 'electron';

import { cancelLog, startLog } from '../log-service';
import {
  closeRepo,
  getRepo,
  listRepos,
  openRepo,
  refsFor,
  reorderRepos,
  worktreesFor,
} from '../repo-registry';
import { reconcileWatchers } from '../watch-service';
import { handle, handleBare, handleOp } from './handle';

/**
 * Repository IPC surface: open, list, close, and the two derived reads
 * (refs, worktrees) plus worktree add/remove.
 *
 * Reads return empty arrays for an unknown repoId rather than throwing. The
 * renderer can hold a stale id for a frame after a close — a Query refetch
 * already in flight, say — and an empty list renders as "nothing here" while an
 * exception renders as an error boundary.
 */
export function registerRepoHandlers(getWindow: () => BrowserWindow | null): void {
  /** Reconcile after any registry change, so no open repo is left unwatched. */
  const syncWatchers = async (): Promise<void> => {
    const win = getWindow();
    if (!win) return;
    await reconcileWatchers(
      win,
      (await listRepos()).map((repo) => ({ id: repo.id, path: repo.path })),
    );
  };

  handle(
    CHANNELS.repoOpen,
    schemas.RepoOpenRequest,
    async ({ path }) => {
      const result = await openRepo(path);
      await syncWatchers();
      return result;
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handleBare(CHANNELS.repoList, () => listRepos());

  handle(
    CHANNELS.repoClose,
    schemas.RepoCloseRequest,
    async ({ repoId }) => {
      await closeRepo(repoId);
      await syncWatchers();
    },
    () => undefined,
  );

  handle(
    CHANNELS.repoRefs,
    schemas.RepoRefsRequest,
    ({ repoId }) => refsFor(repoId),
    () => [],
  );

  handle(
    CHANNELS.repoWorktrees,
    schemas.RepoWorktreesRequest,
    ({ repoId }) => worktreesFor(repoId),
    () => [],
  );

  handleOp(CHANNELS.repoWorktreeAdd, schemas.WorktreeAddRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    return addWorktree(entry.path, {
      path: req.path,
      branch: req.branch,
      createBranch: req.createBranch,
      ...(req.startPoint === undefined ? {} : { startPoint: req.startPoint }),
    });
  });

  handleOp(CHANNELS.repoWorktreeRemove, schemas.WorktreeRemoveRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    return removeWorktree(entry.path, req.path, req.force);
  });

  /**
   * Start streaming the commit graph. Resolves immediately — the rows arrive as
   * `log:batch` events, and the `log:done` event ends the stream.
   */
  handle(
    CHANNELS.logStart,
    schemas.LogStartRequest,
    (req) => {
      const entry = getRepo(req.repoId);
      const win = getWindow();
      if (!entry || !win) return;
      startLog(win, {
        requestId: req.requestId,
        repoPath: entry.path,
        limit: req.limit,
        revisions: req.revisions,
      });
    },
    () => undefined,
  );

  handle(
    CHANNELS.logCancel,
    schemas.LogCancelRequest,
    ({ requestId }) => {
      const win = getWindow();
      if (win) cancelLog(win, requestId);
    },
    () => undefined,
  );


  /**
   * One commit in full, or null.
   *
   * Null rather than an empty-but-well-formed record, which is what this used to
   * answer. The two states it was conflating — "that repo is closed" and "this
   * sha names no commit" — both rendered as a commit with no message, no author
   * and no files, which reads as a bug in the inspector rather than as the
   * truthful answer it was. The pane now says which happened.
   */
  handle(
    CHANNELS.commitDetail,
    schemas.CommitDetailRequest,
    async ({ repoId, sha }) => {
      const entry = getRepo(repoId);
      if (!entry) return null;
      return readCommitDetail(entry.path, sha);
    },
    () => null,
  );

  /**
   * Resolve an abbreviated revision to a full sha.
   *
   * The caller is the linkifier: a commit message says `deadbee`, and a
   * selection that is not a full sha can never match a graph row. Answering
   * `{sha: null}` for an unknown revision is the load-bearing case — a message
   * may reference a commit that was never pushed here, or that a rebase
   * orphaned, and the inspector says so rather than selecting a sha that will
   * never load.
   */
  handle(
    CHANNELS.repoRevParse,
    schemas.RevParseRequest,
    async ({ repoId, rev }) => {
      const entry = getRepo(repoId);
      if (!entry) return { sha: null };
      return { sha: await revParse(entry.path, rev) };
    },
    () => ({ sha: null }),
  );

  /**
   * The native folder picker.
   *
   * Modal to the window rather than app-modal, and it lives here rather than in
   * the renderer because `dialog` is a main-process API — the renderer has no
   * filesystem access at all, which is the point.
   */
  handleBare(CHANNELS.repoPickDirectory, async () => {
    const win = getWindow();
    const options = {
      title: 'Open Repository',
      buttonLabel: 'Open',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  // One-way: ordering is a preference, and the next drag rewrites the whole
  // list anyway, so there is nothing worth a round trip.
  ipcMain.on(CHANNELS.repoReorder, (_event, raw: unknown) => {
    const parsed = schemas.RepoReorderRequest.safeParse(raw);
    if (parsed.success) void reorderRepos(parsed.data.repoIds);
  });

}
