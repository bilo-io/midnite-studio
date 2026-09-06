import { bridge } from '../../services/bridge';

/**
 * Run one statement to completion, outside any query tab's own displayed
 * stream — the staleness re-`SELECT` and the edit's own `UPDATE` (Theme H)
 * both need a single "run this and tell me what happened" call, not a
 * subscription to a tab's ongoing result set.
 *
 * Reuses the exact same `dbQueryStart`/`dbQueryBatch`/`dbQueryDone` channel
 * every query tab runs through (Theme A/D's streaming contract, Decision 8) —
 * there is no separate "run one statement" IPC surface, and there does not
 * need to be one. Request ids here carry no `#`, which is what lets
 * `use-query-stream.ts`'s tab-scoped listener recognise and ignore them.
 */

type StatementResult = { rowCount: number; rows: unknown[][]; error?: string };

const pending = new Map<string, { resolve: (result: StatementResult) => void; rows: unknown[][] }>();
let statementSeq = 0;
let listenersInstalled = false;

function ensureListeners(): void {
  if (listenersInstalled) return;
  const api = bridge();
  if (!api) return;
  listenersInstalled = true;

  api.db.onQueryBatch(({ requestId, rows }) => {
    const entry = pending.get(requestId);
    if (entry) entry.rows.push(...rows);
  });
  api.db.onQueryDone(({ requestId, rowCount, error }) => {
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    entry.resolve({ rowCount, rows: entry.rows, ...(error === undefined ? {} : { error }) });
  });
}

/** Run a single statement (a re-`SELECT` staleness check, or an edit's `UPDATE`) and await its outcome. */
export function runStatement(
  connectionId: string,
  sql: string,
  params?: unknown[],
): Promise<StatementResult> {
  ensureListeners();
  const api = bridge();
  if (!api) return Promise.resolve({ rowCount: 0, rows: [], error: 'No connection to the app.' });

  statementSeq += 1;
  const requestId = `stmt${statementSeq}`;
  return new Promise((resolve) => {
    pending.set(requestId, { resolve, rows: [] });
    void api.db.queryStart({ connectionId, requestId, sql, ...(params ? { params } : {}) });
  });
}
