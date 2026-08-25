import {
  commit,
  discardPaths,
  fetch,
  getStatus,
  pull,
  push,
  readFileDiff,
  stagePaths,
  unstagePaths,
} from '@midnite-git/git-engine';
import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite-git/shared';

import { resolveWorkdir } from '../repo-registry';
import { handle, handleOp } from './handle';

/**
 * Status, staging, committing and sync.
 *
 * Every handler resolves its working directory through `resolveWorkdir`, which
 * validates the `worktreePath` the renderer sent against the repo's actual
 * worktrees. Worktrees have independent indexes and HEADs — staging in one must
 * not stage in another — and the path arrives from the renderer, so honouring
 * it unchecked would run git *writes* in an arbitrary directory.
 */
export function registerStatusHandlers(): void {
  handle(
    CHANNELS.statusGet,
    schemas.StatusGetRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      return cwd ? getStatus(cwd) : EMPTY_STATUS;
    },
    () => EMPTY_STATUS,
  );

  handle(
    CHANNELS.fileDiff,
    schemas.FileDiffRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return { path: req.path, patch: '' };
      return { path: req.path, patch: await readFileDiff(cwd, req.path, req.staged) };
    },
    () => ({ path: '', patch: '' }),
  );

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
    CHANNELS.opStage,
    schemas.StageRequest,
    inWorkdir((cwd, req) => stagePaths(cwd, req.paths)),
  );
  handleOp(
    CHANNELS.opUnstage,
    schemas.UnstageRequest,
    inWorkdir((cwd, req) => unstagePaths(cwd, req.paths)),
  );
  handleOp(
    CHANNELS.opDiscard,
    schemas.DiscardRequest,
    inWorkdir((cwd, req) => discardPaths(cwd, req.paths)),
  );
  handleOp(
    CHANNELS.opCommit,
    schemas.CommitRequest,
    inWorkdir((cwd, req) =>
      commit(cwd, { message: req.message, amend: req.amend, all: req.all }),
    ),
  );
  handleOp(
    CHANNELS.opFetch,
    schemas.FetchRequest,
    inWorkdir((cwd, req) => fetch(cwd, { remote: req.remote, prune: req.prune })),
  );
  handleOp(
    CHANNELS.opPull,
    schemas.PullRequest,
    inWorkdir((cwd, req) =>
      pull(cwd, {
        ...(req.remote === undefined ? {} : { remote: req.remote }),
        ...(req.branch === undefined ? {} : { branch: req.branch }),
        rebase: req.rebase,
      }),
    ),
  );
  handleOp(
    CHANNELS.opPush,
    schemas.PushRequest,
    inWorkdir((cwd, req) =>
      push(cwd, {
        ...(req.remote === undefined ? {} : { remote: req.remote }),
        ...(req.branch === undefined ? {} : { branch: req.branch }),
        setUpstream: req.setUpstream,
        tags: req.tags,
      }),
    ),
  );
}

const EMPTY_STATUS = {
  branch: {
    head: null,
    oid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    unborn: false,
    detached: false,
  },
  entries: [],
  inProgress: null,
} as const;
