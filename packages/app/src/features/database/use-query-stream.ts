import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useQueryResultsStore } from '../../store/query-results-store';
import { useWorkbenchStore } from '../../store/workbench-store';

let requestSeq = 0;

/**
 * `requestId`s from a query tab's own run are `${tabId}#${seq}` — the
 * batch/done listeners below split on it to find which tab's run a stale or
 * fresh event belongs to, with no second index to keep in sync. `run-statement.ts`
 * issues its own requestIds with no `#` at all (`stmt${seq}`) for the same
 * `dbQueryBatch`/`dbQueryDone` channel, used for one-off statements outside
 * any tab's displayed stream — `null` here means "not a tab's own run", and
 * this listener leaves those alone.
 */
function tabIdFromRequestId(requestId: string): string | null {
  const index = requestId.lastIndexOf('#');
  return index === -1 ? null : requestId.slice(0, index);
}

/**
 * Start a run for one query tab. `'query'` joins `stream-registry.ts` as
 * `'supersede'` (Decision 8) — a second `runQuery` on the SAME tab replaces
 * its own in-flight run; it does not touch any other tab's.
 */
export function runQuery(tabId: string, connectionId: string, sql: string): void {
  const api = bridge();
  if (!api) return;
  requestSeq += 1;
  const requestId = `${tabId}#${requestSeq}`;
  useQueryResultsStore.getState().begin(tabId, requestId);
  useWorkbenchStore.getState().markQueryTabClean(tabId);
  void api.db.queryStart({ connectionId, requestId, sql });
}

/** Cancel a tab's in-flight run, if it has one. */
export function cancelQuery(tabId: string): void {
  const api = bridge();
  if (!api) return;
  const requestId = useQueryResultsStore.getState().runs[tabId]?.requestId;
  if (!requestId) return;
  void api.db.queryCancel({ requestId });
}

/**
 * Subscribes to `dbQueryBatch`/`dbQueryDone` ONCE, for the lifetime of the
 * Database view — not per active tab. Mirrors `use-graph-stream.ts`'s own
 * split (a stable batch listener vs. a per-request start/cancel effect) for
 * the same reason its docblock gives: re-subscribing per tab switch would
 * tear listeners down and rebuild them while a background tab's stream is
 * still in flight, and any batch arriving in that gap is lost with no error
 * anywhere. Every query tab keeps streaming while it is not the active one —
 * only its store entry, not a live subscription, is what "switching back to
 * it still shows its results" depends on.
 */
export function useQueryStreamEvents(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const offBatch = api.db.onQueryBatch(({ requestId, columns, rows }) => {
      const tabId = tabIdFromRequestId(requestId);
      if (tabId === null) return;
      useQueryResultsStore.getState().appendBatch(tabId, requestId, columns, rows);
    });
    const offDone = api.db.onQueryDone(({ requestId, rowCount, truncated, durationMs, error }) => {
      const tabId = tabIdFromRequestId(requestId);
      if (tabId === null) return;
      useQueryResultsStore.getState().finish(tabId, requestId, {
        rowCount,
        truncated,
        durationMs,
        ...(error === undefined ? {} : { error }),
      });
    });

    return () => {
      offBatch();
      offDone();
    };
  }, []);
}
