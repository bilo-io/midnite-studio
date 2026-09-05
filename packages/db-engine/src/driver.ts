import type { ConnectionConfig, SchemaTree } from '@midnite/studio-shared';

/**
 * One batch of rows plus the column list, handed to the caller's `onBatch`.
 *
 * `rows` is **positional** (`unknown[][]`), matching `QueryResult` exactly —
 * never a plain object keyed by column name. That distinction is load-bearing
 * here, not just on the wire: `SELECT a.id, b.id FROM a JOIN b` produces two
 * columns named `id`, and every client library defaults to a row shape that
 * silently drops one of them (`pg`'s row objects, `mysql2`'s default rows).
 * Each driver asks its client for **array-mode rows** explicitly (`pg`'s
 * `rowMode: 'array'`, `mysql2`'s `rowsAsArray: true`, `mariadb`'s
 * `rowsAsArray: true`; `tedious`'s row event is positional already) so no
 * driver ever constructs the keyed object this format refuses to trust.
 *
 * `columns` rides every batch rather than a separate "columns arrived" event:
 * there is no cheaper moment to learn a result set's shape than the first row,
 * and repeating a handful of strings per batch is simpler than a second event
 * type with its own ordering guarantee to get right.
 */
export type DriverBatch = {
  columns: string[];
  rows: unknown[][];
};

/**
 * One `DbDriver` per provider (`postgres.ts`, `mysql.ts`, `mariadb.ts`,
 * `mssql.ts`), all implementing this interface identically.
 *
 * `query` takes a **batch callback** rather than returning rows — the
 * streaming contract Theme A's IPC layer declares reaches all the way down
 * here, so no driver ever materialises a whole result set in memory. Each
 * implementation uses its client's cursor/stream API, never its buffered one:
 * `pg` via `pg-cursor`, `mysql2` via `.stream()`, `tedious` via its row-event
 * callback.
 *
 * `query` resolves once the whole statement has finished (or been cancelled)
 * and reports how many rows it saw in total — `query-runner.ts` uses that to
 * decide `truncated` without asking every driver to know about a row cap.
 */
export type DbDriver = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Run one SQL statement (which may itself be several `;`-separated
   * statements), invoking `onBatch` for every `batchSize` rows.
   *
   * `signal` aborts the underlying cursor/stream when the caller cancels —
   * every driver must stop issuing batches the instant it fires, since a
   * batch delivered after cancellation is what `stream-registry.ts`'s
   * `finished` flag exists to guard against on the IPC side.
   */
  query(
    sql: string,
    onBatch: (batch: DriverBatch) => void,
    options: { batchSize: number; signal: AbortSignal },
  ): Promise<{ rowCount: number }>;
  /** Tables, views, columns, primary/foreign keys — nothing deeper (v1 scope). */
  introspect(): Promise<SchemaTree>;
};

/** A driver constructor, keyed by provider — see `driver-for.ts`. */
export type DbDriverFactory = (config: ConnectionConfig, password: string | undefined) => DbDriver;
