import { useEffect, useRef } from 'react';

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
export function useGraphStream(repoId: string | null, limit = DEFAULT_LOG_LIMIT): void {
  const requestSeq = useRef(0);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const offBatch = api.log.onBatch(({ requestId, rows }) => {
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
    void api.log.start({ repoId, requestId, limit });

    return () => {
      void api.log.cancel({ requestId });
    };
  }, [repoId, limit]);
}
