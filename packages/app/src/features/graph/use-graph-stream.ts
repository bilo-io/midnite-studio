import { useEffect, useRef } from 'react';

import { markOnce } from '../../lib/perf';
import { bridge } from '../../services/bridge';
import { useGraphStore } from './graph-store';

/** Initial cap. Beyond this the UI offers "load more" rather than walking forever. */
export const DEFAULT_LOG_LIMIT = 50_000;

/**
 * Drive the graph stream for the selected repository.
 *
 * The subscriptions are set up ONCE and left alone; only the start/cancel effect
 * depends on `repoId`. Re-subscribing per repo would tear listeners down and
 * rebuild them mid-stream, and any batch in flight across that gap is simply
 * lost — a hole in the middle of the graph with no error anywhere.
 */
export function useGraphStream(
  repoId: string | null,
  revisions: readonly string[] = EMPTY_REVISIONS,
  limit = DEFAULT_LOG_LIMIT,
): void {
  const requestSeq = useRef(0);
  // Bumped by the watcher when HEAD moves; re-running the effect restarts the
  // stream with a fresh requestId, so any in-flight batches from the old one
  // are discarded by the store rather than appended to the new graph.
  const restreamNonce = useGraphStore((state) => state.restreamNonce);
  const revisionKey = revisions.join('\u0000');

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const offBatch = api.log.onBatch(({ requestId, rows }) => {
      // The end of the cold-start chain worth measuring: main has spawned git,
      // parsed the log and laid out lanes, and the first rows are in the store.
      markOnce('graph-first-batch');
      useGraphStore.getState().appendBatch(requestId, rows);
    });
    const offDone = api.log.onDone(({ requestId, truncated, error }) => {
      useGraphStore.getState().finish(requestId, {
        truncated,
        ...(error === undefined ? {} : { error }),
      });
    });

    return () => {
      offBatch();
      offDone();
    };
  }, []);

  useEffect(() => {
    const api = bridge();
    if (!api || !repoId) {
      useGraphStore.getState().reset();
      return;
    }

    requestSeq.current += 1;
    const requestId = `${repoId}#${requestSeq.current}`;

    useGraphStore.getState().begin(repoId, requestId);
    // Rebuilt from the key rather than closed over the array, so the effect's
    // only revision input IS its dependency — no lint suppression, and no way
    // for the two to describe different filters.
    void api.log.start({
      repoId,
      requestId,
      limit,
      revisions: revisionKey === '' ? [] : revisionKey.split('\u0000'),
    });

    return () => {
      void api.log.cancel({ requestId });
    };
    // Keyed on the joined string, not the array: a fresh array identity every
    // render would restart the stream each time, which reads as a graph that
    // permanently reloads itself.
  }, [repoId, limit, restreamNonce, revisionKey]);
}

const EMPTY_REVISIONS: readonly string[] = [];
