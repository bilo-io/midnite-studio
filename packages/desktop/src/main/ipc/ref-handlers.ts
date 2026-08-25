import {
  abort,
  checkout,
  cherryPick,
  continueOp,
  countOrphanedCommits,
  createBranch,
  createTag,
  deleteBranch,
  merge,
  rebase,
  renameBranch,
  reset,
} from '@midnite-git/git-engine';
import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite-git/shared';

import { resolveWorkdir } from '../repo-registry';
import { handle, handleOp } from './handle';

/** Checkout, branch/tag management, reset, and the blast-radius query. */
export function registerRefHandlers(): void {
  const inWorkdir = <T extends { repoId: string; worktreePath?: string }>(
    run: (cwd: string, req: T) => Promise<GitOpResult>,
  ) => {
    return async (req: T): Promise<GitOpResult> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is no longer open.');
      return run(cwd, req);
    };
  };

  handleOp(
    CHANNELS.opCheckout,
    schemas.CheckoutRequest,
    inWorkdir((cwd, req) => checkout(cwd, { target: req.target, detach: req.detach })),
  );

  handleOp(
    CHANNELS.opBranchCreate,
    schemas.BranchCreateRequest,
    inWorkdir((cwd, req) =>
      createBranch(cwd, { name: req.name, startPoint: req.startPoint, checkout: req.checkout }),
    ),
  );

  handleOp(
    CHANNELS.opBranchDelete,
    schemas.BranchDeleteRequest,
    inWorkdir((cwd, req) => deleteBranch(cwd, { name: req.name, force: req.force })),
  );

  handleOp(
    CHANNELS.opBranchRename,
    schemas.BranchRenameRequest,
    inWorkdir((cwd, req) => renameBranch(cwd, req.from, req.to)),
  );

  handleOp(
    CHANNELS.opTagCreate,
    schemas.TagCreateRequest,
    inWorkdir((cwd, req) =>
      createTag(cwd, {
        name: req.name,
        target: req.target,
        ...(req.message === undefined ? {} : { message: req.message }),
      }),
    ),
  );

  handleOp(
    CHANNELS.opReset,
    schemas.ResetRequest,
    inWorkdir((cwd, req) => reset(cwd, req.target, req.mode)),
  );

  handleOp(
    CHANNELS.opMerge,
    schemas.MergeRequest,
    inWorkdir((cwd, req) => merge(cwd, { source: req.source, noFastForward: req.noFastForward })),
  );

  handleOp(
    CHANNELS.opRebase,
    schemas.RebaseRequest,
    inWorkdir((cwd, req) => rebase(cwd, { onto: req.onto })),
  );

  handleOp(
    CHANNELS.opCherryPick,
    schemas.CherryPickRequest,
    inWorkdir((cwd, req) => cherryPick(cwd, req.shas)),
  );

  handleOp(
    CHANNELS.opAbort,
    schemas.AbortRequest,
    inWorkdir((cwd, req) => abort(cwd, req.op)),
  );

  handleOp(
    CHANNELS.opContinue,
    schemas.ContinueRequest,
    inWorkdir((cwd, req) => continueOp(cwd, req.op)),
  );

  /**
   * How much history a destructive op is about to orphan.
   *
   * Answers zero for an unknown repo rather than failing: the dialog would
   * otherwise show an error where it should show a number, and the user cannot
   * act on either.
   */
  handle(
    CHANNELS.opBlastRadius,
    schemas.BlastRadiusRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return { count: 0, sample: [] };
      return countOrphanedCommits(cwd, {
        from: req.from,
        ...(req.to === undefined ? {} : { to: req.to }),
        ...(req.movingRef === undefined ? {} : { movingRef: req.movingRef }),
      });
    },
    () => ({ count: 0, sample: [] }),
  );
}
