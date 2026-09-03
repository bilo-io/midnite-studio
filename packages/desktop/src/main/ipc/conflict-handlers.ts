import {
  applyConflictHunk,
  parseConflictedFile,
  readFileDiff,
  resolveConflictWholeFile,
} from '@midnite/studio-git-engine';
import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import { resolveWorkdir } from '../repo-registry';
import { handle, handleOp } from './handle';

/**
 * Conflict resolution (Phase 47). Themes B (whole-file), C (hunk-level) and
 * D's read side — thin, delegates straight to the git-engine function, no
 * logic of its own, same shape as every other handler in this app.
 */
export function registerConflictHandlers(): void {
  handle(
    CHANNELS.conflictRegions,
    schemas.ConflictRegionsRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return [];
      const diff = await readFileDiff(cwd, req.path, false);
      return parseConflictedFile(diff.hunks);
    },
    () => [],
  );

  handleOp(
    CHANNELS.opConflictResolveWholeFile,
    schemas.ConflictResolveWholeFileRequest,
    async (req): Promise<GitOpResult> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is no longer open.');
      return resolveConflictWholeFile(cwd, req.path, req.side);
    },
  );

  handleOp(
    CHANNELS.opConflictApplyHunk,
    schemas.ApplyConflictHunkRequest,
    async (req): Promise<GitOpResult> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is no longer open.');
      return applyConflictHunk(cwd, req.path, req.regionIndex, req.region, req.side);
    },
  );
}
