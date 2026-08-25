import { LaneLayoutSession, readCommitDetail, streamLog, type LogStream } from '@midnite/git-engine';
import { EVENT_CHANNELS, type GraphRow } from '@midnite/git-shared';
import type { BrowserWindow } from 'electron';

/**
 * Streams a repository's history to the renderer as laid-out graph rows.
 *
 * Everything expensive happens here rather than in the renderer: git's output
 * is parsed and lane-laid-out in the main process, and the renderer receives
 * `GraphRow`s it only has to draw. A 50k-commit log is tens of megabytes of
 * text; parsing that on the render thread would freeze the window for seconds,
 * and shipping raw commits across IPC would just move the cost.
 *
 * Batches rather than one payload, for the same reason: the first screenful
 * renders while git is still walking history.
 */

/** Rows per batch. Small enough to paint early, large enough not to flood IPC. */
const BATCH_SIZE = 500;

type ActiveStream = {
  requestId: string;
  stream: LogStream;
  session: LaneLayoutSession;
};

/** At most one stream per window — a second `start` supersedes the first. */
let active: ActiveStream | null = null;

export type LogStartOptions = {
  requestId: string;
  repoPath: string;
  limit: number;
  /** Refs to walk; empty means every ref (`--all`). */
  revisions?: readonly string[];
};

/**
 * Turn a request's ref filter into the engine's log options.
 *
 * `--all` and an explicit revision list are alternatives, not additions: git
 * walks the union, so passing both reaches every ref and silently ignores the
 * filter. Empty means unfiltered, which is `--all`.
 *
 * Filtering here rather than in the renderer is what keeps the lanes honest —
 * the layout engine assigns lanes from the commits it is given, so dropping
 * rows afterwards would leave edges running into empty space.
 */
export function logOptionsFor(options: LogStartOptions): {
  all: boolean;
  limit: number;
  revisions: readonly string[];
} {
  const revisions = options.revisions ?? [];
  return { all: revisions.length === 0, limit: options.limit, revisions };
}

/**
 * Begin (or restart) the log stream.
 *
 * Starting a new stream cancels any previous one. `requestId` rides on every
 * batch so the renderer can discard rows from a stream it no longer wants:
 * cancellation is asynchronous — git has already written bytes into the pipe —
 * so in-flight batches from the old repo WILL arrive after the switch, and
 * without the id they would append to the new repo's graph.
 */
export function startLog(win: BrowserWindow, options: LogStartOptions): void {
  cancelLog();

  const session = new LaneLayoutSession();
  let total = 0;

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const stream = streamLog(
    options.repoPath,
    logOptionsFor(options),
    (commits) => {
      // Layout is incremental: the session carries lane state across batches, so
      // a branch opened in batch 1 is still the same lane in batch 40.
      const rows: GraphRow[] = session.push(commits);
      total += rows.length;
      send(EVENT_CHANNELS.logBatch, { requestId: options.requestId, rows });
    },
    BATCH_SIZE,
  );

  active = { requestId: options.requestId, stream, session };

  void stream.done.then((result) => {
    // A stream superseded while finishing must not announce completion — the
    // renderer would take that as "the new stream is done" and stop its spinner.
    if (active?.requestId !== options.requestId) return;
    active = null;

    send(EVENT_CHANNELS.logDone, {
      requestId: options.requestId,
      total,
      truncated: total >= options.limit,
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  });
}

/** Kill the in-flight stream, if any. Safe to call when there isn't one. */
export function cancelLog(requestId?: string): void {
  if (!active) return;
  if (requestId !== undefined && active.requestId !== requestId) return;
  active.stream.cancel();
  active = null;
}

export { readCommitDetail };
