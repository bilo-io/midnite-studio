import { BrowserWindow, dialog } from 'electron';

import { addWorktree, readCommitDetail, removeWorktree } from '@midnite/git-engine';
import { CHANNELS, failure, schemas } from '@midnite/git-shared';

import { cancelLog, startLog } from '../log-service';
import {
  closeRepo,
  getRepo,
  listRepos,
  openRepo,
  refsFor,
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
    ({ requestId }) => cancelLog(requestId),
    () => undefined,
  );

  handle(
    CHANNELS.commitDetail,
    schemas.CommitDetailRequest,
    async ({ repoId, sha }) => {
      const entry = getRepo(repoId);
      if (!entry) return { sha, body: '', stat: '', files: [] };
      return readCommitDetail(entry.path, sha);
    },
    () => ({ sha: '', body: '', stat: '', files: [] }),
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
}
