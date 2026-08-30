import {
  abortRebase,
  continueRebase,
  getRebaseStatus,
  skipRebase,
  startInteractiveRebase,
} from '@midnite/git-engine';
import { CHANNELS, failure, schemas } from '@midnite/git-shared';
import { getRepo } from '../repo-registry';
import { handle, handleOp } from './handle';

export function registerRebaseHandlers(): void {
  handleOp(CHANNELS.rebaseStart, schemas.RebaseStartRequest, async ({ repoId, targetRef, plan }) => {
    const repo = await getRepo(repoId);
    if (!repo) return failure(`Repo not found: ${repoId}`);
    return startInteractiveRebase(repo.path, targetRef, plan, repo.id);
  });

  handleOp(CHANNELS.rebaseContinue, schemas.RebaseContinueRequest, async ({ repoId }) => {
    const repo = await getRepo(repoId);
    if (!repo) return failure(`Repo not found: ${repoId}`);
    return continueRebase(repo.path, repo.id);
  });

  handleOp(CHANNELS.rebaseAbort, schemas.RebaseAbortRequest, async ({ repoId }) => {
    const repo = await getRepo(repoId);
    if (!repo) return failure(`Repo not found: ${repoId}`);
    return abortRebase(repo.path, repo.id);
  });

  handleOp(CHANNELS.rebaseSkip, schemas.RebaseSkipRequest, async ({ repoId }) => {
    const repo = await getRepo(repoId);
    if (!repo) return failure(`Repo not found: ${repoId}`);
    return skipRebase(repo.path, repo.id);
  });

  handle(
    CHANNELS.rebaseStatus,
    schemas.RebaseStatusRequest,
    async ({ repoId }) => {
      const repo = await getRepo(repoId);
      if (!repo) return { inProgress: false };
      return getRebaseStatus(repo.path);
    },
    () => ({ inProgress: false }),
  );
}
