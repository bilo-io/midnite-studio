import {
  commit,
  discardPaths,
  fetch,
  getStatus,
  pull,
  push,
  readCommitFileDiff,
  readFileDiff,
  stagePaths,
  unstagePaths,
} from '@midnite/git-engine';
import {
  CHANNELS,
  DIFF_DEFAULT_CONTEXT,
  failure,
  schemas,
  type FileDiff,
  type GitOpResult,
} from '@midnite/git-shared';

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
      if (!cwd) return emptyDiff(req.path, req.context);
      return readFileDiff(cwd, req.path, req.staged, {
        context: req.context,
        ...(req.oldPath === undefined ? {} : { oldPath: req.oldPath }),
      });
    },
    () => emptyDiff('', DIFF_DEFAULT_CONTEXT),
  );

  handle(
    CHANNELS.commitFileDiff,
    schemas.CommitFileDiffRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return emptyDiff(req.path, req.context);
      return readCommitFileDiff(cwd, req.sha, req.path, {
        context: req.context,
        ...(req.oldPath === undefined ? {} : { oldPath: req.oldPath }),
      });
    },
    () => emptyDiff('', DIFF_DEFAULT_CONTEXT),
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

/**
 * What a diff handler returns when there is nothing to diff — a closed repo, or
 * a payload that failed validation. A well-formed empty `FileDiff` rather than a
 * null, so the renderer has one shape to handle and `describeEmptyDiff` can
 * speak for it.
 */
function emptyDiff(path: string, context: number): FileDiff {
  return {
    path,
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    hunks: [],
    insertions: 0,
    deletions: 0,
    contextLines: context,
    truncated: false,
    droppedLines: 0,
  };
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
