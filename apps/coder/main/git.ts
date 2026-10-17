import {
  getStatus,
  LaneLayoutSession,
  listRefs,
  readCommitDetail,
  readCommitFileDiff,
  readCommitStats,
  streamLog,
} from '@midnite/studio-git-engine';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import {
  CHANNELS,
  DIFF_DEFAULT_CONTEXT,
  EVENT_CHANNELS,
  schemas,
  type FileDiff,
  type GraphRow,
  type StatusResult,
} from '@midnite/studio-shared';

/**
 * Coder's git channels (Phase 113 Theme O) — READ-ONLY, over the frame's graph and diff.
 *
 * Exactly what `@midnite/studio-frame/graph` and `/diff` ask of main: the log stream with its lanes laid
 * out here (git-engine's `LaneLayoutSession`, so the renderer receives finished `GraphRow` batches),
 * refs, `git status` for HEAD's lane and the working-copy row, one commit's detail, a commit file's diff
 * and per-commit diff stats. No write channel exists — no checkout, commit, push or reset — so nothing
 * here needs the write queue; the graph composed over this has no `GitHost.useActions`.
 *
 * Every path comes from Coder's own repository list (`pathOf`), never from the renderer: a request's
 * `worktreePath` is ignored, because Coder does not list worktrees and an unvalidated path would let a
 * renderer point git at any directory.
 */
export const CODER_GIT_CHANNELS = [
  CHANNELS.repoRefs,
  CHANNELS.logStart,
  CHANNELS.logCancel,
  CHANNELS.statusGet,
  CHANNELS.commitDetail,
  CHANNELS.commitFileDiff,
  CHANNELS.commitStats,
] as const;

export type CoderGitServices = {
  /** A repository's checkout, from Coder's own list; null for an id it does not hold. */
  pathOf: (repoId: string) => string | null;
};

/** One batch per this many commits, as Studio's log stream sends. */
const BATCH_SIZE = 500;

const EMPTY_STATUS: StatusResult = {
  branch: { head: null, oid: null, upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
  entries: [],
  inProgress: null,
};

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

export function registerCoderGit(ctx: FeatureMainContext, { pathOf }: CoderGitServices): void {
  const { ipc } = ctx;

  ipc.handle(CHANNELS.repoRefs, schemas.RepoRefsRequest, async ({ repoId }) => {
    const path = pathOf(repoId);
    return path === null ? [] : listRefs(path);
  }, () => []);

  ipc.handle(CHANNELS.statusGet, schemas.StatusGetRequest, async ({ repoId }) => {
    const path = pathOf(repoId);
    return path === null ? EMPTY_STATUS : getStatus(path);
  }, () => EMPTY_STATUS);

  ipc.handle(CHANNELS.commitDetail, schemas.CommitDetailRequest, async ({ repoId, sha }) => {
    const path = pathOf(repoId);
    return path === null ? null : readCommitDetail(path, sha);
  }, () => null);

  ipc.handle(CHANNELS.commitFileDiff, schemas.CommitFileDiffRequest, async (req) => {
    const path = pathOf(req.repoId);
    if (path === null) return emptyDiff(req.path, req.context);
    return readCommitFileDiff(path, req.sha, req.path, {
      context: req.context,
      ...(req.oldPath === undefined ? {} : { oldPath: req.oldPath }),
    });
  }, () => emptyDiff('', DIFF_DEFAULT_CONTEXT));

  ipc.handle(CHANNELS.commitStats, schemas.CommitStatsRequest, async ({ repoId, shas }) => {
    const path = pathOf(repoId);
    return { stats: path === null ? {} : await readCommitStats(path, shas) };
  }, () => ({ stats: {} }));

  // The log stream: one at a time (a new request supersedes the last, as in Studio), rows over events.
  let active: { requestId: string; cancel: () => void } | null = null;

  ipc.handle(CHANNELS.logStart, schemas.LogStartRequest, (req) => {
    active?.cancel();
    active = null;
    const path = pathOf(req.repoId);
    if (path === null) {
      ctx.emit(EVENT_CHANNELS.logDone, { requestId: req.requestId, total: 0, truncated: false, error: 'That repository is no longer open.' });
      return;
    }
    const session = new LaneLayoutSession();
    let total = 0;
    let finished = false;
    const revisions = req.revisions;
    const stream = streamLog(
      path,
      { all: revisions.length === 0, limit: req.limit, revisions },
      (commits) => {
        if (finished) return;
        const rows: GraphRow[] = session.push(commits);
        total += rows.length;
        ctx.emit(EVENT_CHANNELS.logBatch, { requestId: req.requestId, rows });
      },
      BATCH_SIZE,
    );
    const mine = {
      requestId: req.requestId,
      cancel: () => {
        finished = true;
        stream.cancel();
      },
    };
    active = mine;
    void stream.done
      .then((result) => {
        if (finished) return;
        finished = true;
        ctx.emit(EVENT_CHANNELS.logDone, {
          requestId: req.requestId,
          total,
          truncated: total >= req.limit,
          ...(result.error === undefined ? {} : { error: result.error }),
        });
      })
      .finally(() => {
        if (active === mine) active = null;
      });
  }, () => undefined);

  ipc.handle(CHANNELS.logCancel, schemas.LogCancelRequest, ({ requestId }) => {
    if (active?.requestId === requestId) {
      active.cancel();
      active = null;
    }
  }, () => undefined);
}
