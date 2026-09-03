import { resolveConflictWholeFile } from '@midnite/studio-git-engine';
import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import { resolveWorkdir } from '../repo-registry';
import { handleOp } from './handle';

/**
 * Conflict resolution (Phase 47). Theme B's whole-file case only — thin,
 * delegates straight to the git-engine function, no logic of its own, same
 * shape as every other write-path handler in this app.
 */
export function registerConflictHandlers(): void {
  handleOp(
    CHANNELS.opConflictResolveWholeFile,
    schemas.ConflictResolveWholeFileRequest,
    async (req): Promise<GitOpResult> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is no longer open.');
      return resolveConflictWholeFile(cwd, req.path, req.side);
    },
  );
}
