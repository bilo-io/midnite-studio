import type { DbDriver } from '@midnite/studio-db-engine';
import { EVENT_CHANNELS } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { BATCH_SIZE, cancel as cancelStream, cancelKind, register, release } from '../stream-registry';

/**
 * The query producer — mirrors [`log-service.ts`](../log-service.ts) batch
 * for batch: a guarded `if (!win.isDestroyed()) win.webContents.send(...)`
 * closure, batches of `BATCH_SIZE` (500), a terminal `dbQueryDone` carrying
 * `truncated`, a `finished` flag against post-cancel sends, and registry
 * release in a `.finally`, not `.then` — `log-service.ts`'s own comment
 * documents the leak that caused.
 *
 * A hard row cap (`MAX_QUERY_ROWS`) plays the role `LogStartRequest.limit`
 * plays for the commit graph: the renderer asks for no such limit today (no
 * results grid exists yet to render "load more"), so this is main's own
 * fail-safe against an unbounded `SELECT *` rather than a caller-supplied
 * value.
 */
export const MAX_QUERY_ROWS = 50_000;

export type QueryStartOptions = {
  requestId: string;
  sql: string;
};

export function startQuery(win: BrowserWindow, driver: DbDriver, options: QueryStartOptions): void {
  const controller = new AbortController();
  let finished = false;
  let truncated = false;
  let total = 0;
  const startedAt = Date.now();

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  register(win, {
    requestId: options.requestId,
    kind: 'query',
    cancel: () => {
      finished = true;
      controller.abort();
    },
  });

  void driver
    .query(
      options.sql,
      (batch) => {
        if (finished) return;
        total += batch.rows.length;
        send(EVENT_CHANNELS.dbQueryBatch, {
          requestId: options.requestId,
          columns: batch.columns,
          rows: batch.rows,
        });
        if (total >= MAX_QUERY_ROWS && !controller.signal.aborted) {
          truncated = true;
          controller.abort();
        }
      },
      { batchSize: BATCH_SIZE, signal: controller.signal },
    )
    .then(() => {
      if (finished) return;
      finished = true;
      send(EVENT_CHANNELS.dbQueryDone, {
        requestId: options.requestId,
        rowCount: total,
        truncated,
        durationMs: Date.now() - startedAt,
      });
    })
    .catch((err: unknown) => {
      if (finished) return;
      finished = true;
      send(EVENT_CHANNELS.dbQueryDone, {
        requestId: options.requestId,
        rowCount: total,
        truncated,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    // `.finally`, not `.then` — see `log-service.ts`'s own comment on the
    // registry leak an explicit-cancel-then-rejected-promise path caused.
    .finally(() => release(win, options.requestId));
}

/** Kill the in-flight query stream for one tab, or every query stream in the window. */
export function cancelQuery(win: BrowserWindow, requestId?: string): void {
  if (requestId !== undefined) {
    cancelStream(win, requestId);
  } else {
    cancelKind(win, 'query');
  }
}
