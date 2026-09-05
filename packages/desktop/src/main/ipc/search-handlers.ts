import type { BrowserWindow } from 'electron';

import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { getRepo } from '../repo-registry';
import { cancelSearch, readBlame, startCommitSearch, startGrep } from '../search-service';
import { handleFromSender, handleOp, handleOpFromSender } from './handle';

/**
 * Register search and blame IPC handlers.
 */
export function registerSearchHandlers(getWindow: () => BrowserWindow | null): void {
  /*
    Resolved from the sender, not `getWindow()` — hits come back over the
    `search:batch` EVENT channel, so the window that asked has to be the window
    that is sent them. See `repo-handlers.ts`'s `logStart` for the failure this
    is the same shape as: a detached page's stream silently painting main.
  */
  handleOpFromSender(CHANNELS.searchStart, schemas.SearchStartRequest, async (req, win) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    if (!win) return failure('Window is no longer active.');

    if (req.mode === 'commits') {
      return startCommitSearch(win, {
        requestId: req.requestId,
        repoPath: entry.path,
        cap: req.cap,
        query: req.query,
      });
    }

    return startGrep(win, {
      requestId: req.requestId,
      repoPath: entry.path,
      cap: req.cap,
      query: {
        pattern: req.query.pattern,
        rev: req.query.rev,
        paths: req.query.paths,
        ignoreCase: req.query.ignoreCase,
        regexp: req.query.regexp,
        wordMatch: req.query.wordMatch,
        contextLines: req.query.contextLines,
      },
    });
  });

  handleFromSender(
    CHANNELS.searchCancel,
    schemas.SearchCancelRequest,
    ({ requestId }, win) => {
      if (win) cancelSearch(win, requestId);
    },
    () => undefined,
  );

  handleOp(CHANNELS.blameRead, schemas.BlameReadRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    const worktree = req.worktreePath ?? entry.path;
    return readBlame(worktree, {
      relPath: req.relPath,
      rev: req.rev,
      followRenames: req.followRenames,
    });
  });
}
