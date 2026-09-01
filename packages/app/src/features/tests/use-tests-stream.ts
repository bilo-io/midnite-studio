import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useTestsStore } from './tests-store';

/**
 * Subscribe once, at the app root — the `useWatchInvalidation` reasoning: a
 * run keeps going whether or not the Tests view is on screen (switching to
 * Graph mid-suite must not silently drop the rest of its output), and the
 * store is keyed by repo, not by which view mounted the subscription.
 */
export function useTestsStream(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const unsubOutput = api.tests.onOutput(({ runId, chunk }) => {
      // runIndex resolves which repo this run id belongs to in O(1); the event
      // itself carries only what main actually knows at that point.
      const repoId = useTestsStore.getState().runIndex[runId];
      if (repoId === undefined) return;
      useTestsStore.getState().appendOutput(repoId, runId, chunk);
    });

    const unsubResult = api.tests.onResult(({ runId, suiteId, result }) => {
      const repoId = useTestsStore.getState().runIndex[runId];
      if (repoId === undefined) return;
      useTestsStore.getState().finishRun(repoId, suiteId, runId, result);
    });

    return () => {
      unsubOutput();
      unsubResult();
    };
  }, []);
}
