import { LaneLayoutSession, readCommitDetail, streamLog } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, perfEnabled, type GraphRow } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { defaultLogger } from './log';
import {
  BATCH_SIZE,
  cancel as cancelStream,
  cancelKind,
  register,
  release,
} from './stream-registry';

/**
 * Phase 77 Theme B: how long the lane layout takes over a whole stream, and how big the first
 * batch is on the wire, behind `MSTUDIO_PERF=1`. A closure resolved once at module load on
 * `agent-process.ts`'s `countPsRead` pattern, so with the flag unset a call site pays one no-op.
 * It is local rather than a `bootMark`: that one's name union is read by `startup-report.mjs`.
 */
type LayoutPerf = { batch(layoutMs: number, rows: readonly GraphRow[]): void; done(): void };
const NO_LAYOUT_PERF: LayoutPerf = { batch: () => {}, done: () => {} };
const newLayoutPerf: () => LayoutPerf = perfEnabled(process.env)
  ? () => {
      let layoutMs = 0;
      let rows = 0;
      let firstBatchBytes: number | null = null;
      return {
        batch(ms, batchRows) {
          layoutMs += ms;
          rows += batchRows.length;
          // The first batch only: JSON.stringify is the measurement, so it is not repeated per batch.
          firstBatchBytes ??= JSON.stringify(batchRows).length;
        },
        done() {
          defaultLogger(
            `[perf] main graph-layout rows=${rows} layoutMs=${layoutMs.toFixed(1)} firstBatchBytes=${firstBatchBytes ?? 0}`,
          );
        },
      };
    }
  : () => NO_LAYOUT_PERF;

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
  const layoutPerf = newLayoutPerf();
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
      const laidOutAt = performance.now();
      const rows: GraphRow[] = session.push(commits);
      layoutPerf.batch(performance.now() - laidOutAt, rows);
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

  void stream.done
    .then((result) => {
      if (finished) return;
      finished = true;
      layoutPerf.done();

      send(EVENT_CHANNELS.logDone, {
        requestId: options.requestId,
        total,
        truncated: total >= options.limit,
        ...(result.error === undefined ? {} : { error: result.error }),
      });
    })
    // `.finally`, not the `.then` body: a rejected `stream.done` skipped
    // `release` entirely before, leaking the registry entry until the window
    // closed. `release` itself is idempotent (a `Map.delete` on an already-
    // gone key is a no-op), so calling it here even after an explicit cancel
    // already removed the entry is harmless.
    .finally(() => release(win, options.requestId));
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
