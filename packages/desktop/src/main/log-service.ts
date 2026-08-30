import { LaneLayoutSession, readCommitDetail, streamLog } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, type GraphRow } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import {
  BATCH_SIZE,
  cancel as cancelStream,
  cancelKind,
  register,
  release,
} from './stream-registry';

export type LogStartOptions = {
  requestId: string;
  repoPath: string;
  limit: number;
  /** Refs to walk; empty means every ref (`--all`). */
  revisions?: readonly string[];
};

/**
 * Turn a request's ref filter into the engine's log options.
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
 */
export function startLog(win: BrowserWindow, options: LogStartOptions): void {
  const session = new LaneLayoutSession();
  let total = 0;
  let finished = false;

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const stream = streamLog(
    options.repoPath,
    logOptionsFor(options),
    (commits) => {
      if (finished) return;
      const rows: GraphRow[] = session.push(commits);
      total += rows.length;
      send(EVENT_CHANNELS.logBatch, { requestId: options.requestId, rows });
    },
    BATCH_SIZE,
  );

  register(win, {
    requestId: options.requestId,
    kind: 'log',
    cancel: () => {
      finished = true;
      stream.cancel();
    },
  });

  void stream.done.then((result) => {
    if (finished) return;
    finished = true;
    release(win, options.requestId);

    send(EVENT_CHANNELS.logDone, {
      requestId: options.requestId,
      total,
      truncated: total >= options.limit,
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  });
}

/** Kill the in-flight log stream, if any. */
export function cancelLog(win: BrowserWindow, requestId?: string): void {
  if (requestId !== undefined) {
    cancelStream(win, requestId);
  } else {
    cancelKind(win, 'log');
  }
}

export { readCommitDetail };
