import type { BrowserWindow } from 'electron';

import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { getRepo } from '../repo-registry';
import { cancelSearch, readBlame, startCommitSearch, startGrep } from '../search-service';
import { handle, handleOp } from './handle';

/**
 * Register search and blame IPC handlers.
 */
export function registerSearchHandlers(getWindow: () => BrowserWindow | null): void {
  handleOp(CHANNELS.searchStart, schemas.SearchStartRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    const win = getWindow();
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

  handle(
    CHANNELS.searchCancel,
    schemas.SearchCancelRequest,
    ({ requestId }) => {
      const win = getWindow();
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
