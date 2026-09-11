import { useEffect } from 'react';

import { bridge } from './bridge';
import { useUiStore } from '../store/ui-store';

/**
 * Tell main which repo THIS window is showing (Phase 84 Theme D.1) — on
 * mount and on every change to `selectedRepoId`, so `listWindows()` can
 * answer honestly instead of the `repoId: null` every `WindowDescriptor`
 * carried before this.
 *
 * Mounted in every window, main and popouts alike (`app.tsx` and
 * `DetachedShell`), the same shape as `useWatchInvalidation` — each window
 * reports for itself, never for another. Today `selectedRepoId` is one of
 * `broadcast-sync.ts`'s synced `ui` fields, so every open window happens to
 * report the same value; this hook reports whatever THIS window's own
 * `ui-store` instance actually holds regardless, which is what stays correct
 * the day a window's repo selection is allowed to diverge from the others'.
 */
export function useReportWindowRepo(): void {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);

  useEffect(() => {
    bridge()?.window.reportRepo({ repoId: selectedRepoId });
  }, [selectedRepoId]);
}
