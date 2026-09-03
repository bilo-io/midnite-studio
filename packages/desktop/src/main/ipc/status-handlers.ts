import {
  commit,
  discardPaths,
  fetch,
  getStatus,
  listStashes,
  pull,
  push,
  readCommitFileDiff,
  readFileDiff,
  readReflog,
  readStashDetail,
  readStashFileDiff,
  readStatusCounts,
  stagePaths,
  stashApply,
  stashBranch,
  stashDrop,
  stashPop,
  stashPush,
  stashStore,
  unstagePaths,
} from '@midnite/studio-git-engine';
import {
  CHANNELS,
  DIFF_DEFAULT_CONTEXT,
  failure,
  schemas,
  type FileDiff,
  type GitOpResult,
  type ReflogEntry,
  type StashEntry,
} from '@midnite/studio-shared';

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
    CHANNELS.statusCounts,
    schemas.StatusCountsRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      return cwd ? readStatusCounts(cwd) : EMPTY_COUNTS;
    },
    () => EMPTY_COUNTS,
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
        ...(req.forceWithLease === undefined ? {} : { forceWithLease: req.forceWithLease }),
      }),
    ),
  );

  handle(
    CHANNELS.stashList,
    schemas.StashListRequest,
    async (req): Promise<StashEntry[]> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      return cwd ? listStashes(cwd) : [];
    },
    () => [],
  );

  handleOp(
    CHANNELS.opStashPush,
    schemas.StashPushRequest,
    inWorkdir((cwd, req) =>
      stashPush(cwd, {
        ...(req.message === undefined ? {} : { message: req.message }),
        keepIndex: req.keepIndex,
        includeUntracked: req.includeUntracked,
        ...(req.paths === undefined ? {} : { paths: req.paths }),
      }),
    ),
  );
  handleOp(
    CHANNELS.opStashPop,
    schemas.StashPopRequest,
    inWorkdir((cwd, req) => stashPop(cwd, req.selector)),
  );
  handleOp(
    CHANNELS.opStashApply,
    schemas.StashApplyRequest,
    inWorkdir((cwd, req) => stashApply(cwd, req.selector)),
  );

  // Not `handleOp`: a drop's success arm carries an optional `recoveredSha`,
  // which `handleOp`'s `GitOpResult`-only signature can't express. `failure()`
  // still returns a plain `GitOpResult`, which is one arm of the wider
  // `StashDropResult` union, so it's a valid `onInvalid` here.
  handle(
    CHANNELS.opStashDrop,
    schemas.StashDropRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is no longer open.');
      return stashDrop(cwd, req.selector);
    },
    (issue) => failure(issue),
  );

  handleOp(
    CHANNELS.opStashBranch,
    schemas.StashBranchRequest,
    inWorkdir((cwd, req) => stashBranch(cwd, req.name, req.selector)),
  );
  handleOp(
    CHANNELS.opStashStore,
    schemas.StashStoreRequest,
    inWorkdir((cwd, req) => stashStore(cwd, req.sha, req.message)),
  );

  handle(
    CHANNELS.stashDetail,
    schemas.StashDetailRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      return cwd ? readStashDetail(cwd, req.selector) : null;
    },
    () => null,
  );

  handle(
    CHANNELS.stashDiff,
    schemas.StashDiffRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return null;
      return readStashFileDiff(cwd, req.selector, req.part, req.path, {
        context: req.context,
        ...(req.oldPath === undefined ? {} : { oldPath: req.oldPath }),
      });
    },
    () => null,
  );

  handle(
    CHANNELS.reflogList,
    schemas.ReflogListRequest,
    async (req): Promise<ReflogEntry[]> => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      return cwd ? readReflog(cwd, { ref: req.ref, limit: req.limit }) : [];
    },
    () => [],
  );
}

/**
 * What a diff handler returns when there is nothing to diff — a closed repo, or
 * a payload that failed validation. A well-formed empty `FileDiff` rather than a
 * null, so the renderer has exactly one shape to handle.
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
    combined: false,
    truncated: false,
    droppedLines: 0,
  };
}

/** No repository, no numbers — and empty lists read as "zero", never as "loading". */
const EMPTY_COUNTS = { staged: [], unstaged: [] } as const;

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
