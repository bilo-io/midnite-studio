import { failure, schemas } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared';

import { ensureHookInstalled, ensureHookRemoved, hookStatus } from '../hooks/install';
import { getRepo } from '../repo-registry';
import { handle, handleOp } from './handle';

/**
 * The write-side fingerprint's IPC surface (Phase 78 Theme E).
 *
 * `status` uses `handle` directly rather than `handleOp`, because its success
 * arm carries a value (`{ installed }`) and `handleOp` is typed for the
 * `void` `GitOpResult` every other op here returns.
 */
export function registerHooksHandlers(): void {
  handle(
    CHANNELS.hooksStatus,
    schemas.HooksStatusRequest,
    async (req) => {
      const entry = getRepo(req.repoId);
      if (!entry) return failure('That repository is no longer open.');
      return hookStatus(entry.path);
    },
    (issue) => failure(issue),
  );

  handleOp(CHANNELS.hooksInstall, schemas.HooksInstallRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    return ensureHookInstalled(entry.path);
  });

  handleOp(CHANNELS.hooksUninstall, schemas.HooksUninstallRequest, async (req) => {
    const entry = getRepo(req.repoId);
    if (!entry) return failure('That repository is no longer open.');
    return ensureHookRemoved(entry.path);
  });
}
