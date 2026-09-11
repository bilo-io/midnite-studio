import { useEffect } from 'react';

import { bridge } from './bridge';
import { useLivenessStore } from '../store/liveness-store';

/**
 * Feeds `liveness-store.ts` off the same `watch.onEvent` broadcast Theme A's
 * `useWatchInvalidation` subscribes to — a second, independent listener
 * (`bridge().watch.onEvent` supports more than one, same as any IPC
 * subscription in this codebase), not a second watcher.
 *
 * Mounted in every window, main and popouts alike, the same shape as
 * `useWatchInvalidation` and `useReportWindowRepo`. Only events for the repo
 * THIS window is currently showing move the dot: a background repo's watcher
 * being alive says nothing about whether the window you are looking at is
 * live.
 */
export function useLivenessTracking(selectedRepoId: string | null): void {
  const recordWatchEvent = useLivenessStore((s) => s.recordWatchEvent);
  const reset = useLivenessStore((s) => s.reset);

  // A repo switch invalidates the old timestamp — it was never a claim about
  // whichever repo is selected now.
  useEffect(() => {
    reset();
  }, [selectedRepoId, reset]);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    return api.watch.onEvent((event) => {
      if (event.repoId !== selectedRepoId) return;
      recordWatchEvent(event.at);
    });
  }, [selectedRepoId, recordWatchEvent]);
}
