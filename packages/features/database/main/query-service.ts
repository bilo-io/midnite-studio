import type { DbDriver } from '@midnite/studio-db-engine';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The query producer — mirrors `log-service.ts` batch for batch: a guarded `emit` closure, batches
 * of `BATCH_SIZE` (500), a terminal `dbQueryDone` carrying `truncated`, a `finished` flag against
 * post-cancel sends, and registry release in a `.finally`, not `.then` — `log-service.ts`'s own
 * comment documents the leak that caused.
 *
 * A hard row cap (`MAX_QUERY_ROWS`) plays the role `LogStartRequest.limit` plays for the commit
 * graph: the renderer asks for no such limit today (no results grid exists yet to render "load
 * more"), so this is main's own fail-safe against an unbounded `SELECT *` rather than a
 * caller-supplied value.
 *
 * Since Phase 113 Theme O it holds no window: `emit` is the composer's (a no-op once the window is
 * gone) and the in-flight streams are tracked through the {@link QueryStreams} port.
 */
export const MAX_QUERY_ROWS = 50_000;

/** Rows per `dbQueryBatch` event. */
export const BATCH_SIZE = 500;

/**
 * Where in-flight query streams are tracked, so a new run can supersede an old one and a cancel can
 * find its run. Studio backs it with its per-window stream registry (shared with the commit log and
 * the search); an app with one window uses {@link createQueryStreams}.
 */
export type QueryStreams = {
  /** Track a running query. A new query **supersedes** every earlier one: they are cancelled first. */
  register(stream: { requestId: string; cancel(): void }): void;
  /** Cancel (and forget) one run. Unknown ids are a no-op — a cancel racing a finish is normal. */
  cancel(requestId: string): void;
  /** Forget a finished run. */
  release(requestId: string): void;
  /** Cancel every run — window teardown. */
  cancelAll(): void;
};

/** A plain in-memory {@link QueryStreams} for an app with a single window. */
export function createQueryStreams(): QueryStreams & { size(): number } {
  const streams = new Map<string, { requestId: string; cancel(): void }>();
  const cancelAll = (): void => {
    for (const [id, stream] of [...streams]) {
      streams.delete(id);
      stream.cancel();
    }
  };
  return {
    register(stream) {
      // Supersede: a new run replaces the previous ones, matching the commit log's registry policy.
      cancelAll();
      streams.set(stream.requestId, stream);
    },
    cancel(requestId) {
      const stream = streams.get(requestId);
      if (!stream) return;
      streams.delete(requestId);
      stream.cancel();
    },
    release(requestId) {
      streams.delete(requestId);
    },
    cancelAll,
    size: () => streams.size,
  };
}

export type QueryStartOptions = {
  requestId: string;
  sql: string;
  /** Positional bind parameters for a parameterised statement (Phase 61 Theme H). */
  params?: unknown[];
};

export type QueryPorts = {
  emit: (channel: string, payload: unknown) => void;
  streams: QueryStreams;
};

export function startQuery({ emit: send, streams }: QueryPorts, driver: DbDriver, options: QueryStartOptions): void {
  const controller = new AbortController();
  let finished = false;
  let truncated = false;
  let total = 0;
  const startedAt = Date.now();

  streams.register({
    requestId: options.requestId,
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
      { batchSize: BATCH_SIZE, signal: controller.signal, ...(options.params ? { params: options.params } : {}) },
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
    .finally(() => streams.release(options.requestId));
}

/** Kill the in-flight query stream for one tab, or every query stream when no id is given. */
export function cancelQuery(streams: QueryStreams, requestId?: string): void {
  if (requestId !== undefined) {
    streams.cancel(requestId);
  } else {
    streams.cancelAll();
  }
}
