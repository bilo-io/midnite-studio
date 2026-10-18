import type {
  GitOpResult,
  LibraryItem,
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanSummary,
  LibrarySettings,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge, noBridge, reportFailure, useToastStore } from '@midnite/studio-frame';

/**
 * Media ▸ Library data hooks (Phase 113 Theme R). Everything runs in main — the picker, the scan, the
 * index — so these only ask for state, start writes and listen for the library's two events.
 */

export const LIBRARY_KEYS = {
  all: ['media-library'] as const,
  roots: ['media-library', 'roots'] as const,
  items: ['media-library', 'items'] as const,
  settings: ['media-library', 'settings'] as const,
};

export function useLibraryRoots() {
  return useQuery<LibraryRoot[]>({
    queryKey: LIBRARY_KEYS.roots,
    queryFn: async () => (await bridge()?.media.library.roots())?.roots ?? [],
  });
}

/** Every item, once — the tab filters by kind itself, so switching kinds costs no round trip. */
export function useLibraryItems() {
  return useQuery<LibraryItem[]>({
    queryKey: LIBRARY_KEYS.items,
    queryFn: async () => (await bridge()?.media.library.items({}))?.items ?? [],
  });
}

export function useLibrarySettings() {
  return useQuery<{ settings: LibrarySettings; onlineKeyAvailable: boolean }>({
    queryKey: LIBRARY_KEYS.settings,
    queryFn: async () =>
      (await bridge()?.media.library.settings()) ?? {
        settings: { onlineMetadata: false, onlineProvider: 'tmdb' },
        onlineKeyAvailable: false,
      },
  });
}

/**
 * Refreshes the queries when main says the library changed, and tracks a running scan. Mounted once, by
 * the tab.
 */
export function useLibraryEvents(): LibraryScanProgress | null {
  const client = useQueryClient();
  const [scan, setScan] = useState<LibraryScanProgress | null>(null);
  useEffect(() => {
    const library = bridge()?.media.library;
    if (!library) return;
    const offChanged = library.onChanged(({ reason }) => {
      if (reason === 'roots' || reason === 'scan')
        void client.invalidateQueries({ queryKey: LIBRARY_KEYS.all });
      else if (reason === 'progress')
        void client.invalidateQueries({ queryKey: LIBRARY_KEYS.items });
      else void client.invalidateQueries({ queryKey: LIBRARY_KEYS.settings });
    });
    const offProgress = library.onScanProgress((event) =>
      setScan(event.phase === 'scanning' ? event : null),
    );
    return () => {
      offChanged();
      offProgress();
    };
  }, [client]);
  return scan;
}

const summaryToast = (summary: LibraryScanSummary) => {
  const parts = [
    summary.added ? `${summary.added} added` : null,
    summary.updated ? `${summary.updated} updated` : null,
    summary.removed ? `${summary.removed} removed` : null,
  ].filter(Boolean);
  useToastStore.getState().addToast({
    message:
      parts.length > 0
        ? `Library scanned — ${parts.join(', ')}.`
        : 'Library scanned — nothing changed.',
    status: 'success',
  });
};

export function useLibraryMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: LIBRARY_KEYS.all });

  const scan = useMutation({
    mutationFn: async (rootId?: string): Promise<GitOpResult<LibraryScanSummary>> =>
      (await bridge()?.media.library.scan(rootId === undefined ? {} : { rootId })) ?? noBridge(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) summaryToast(result.value);
      refresh();
    },
  });

  const addRoot = useMutation({
    mutationFn: async () =>
      (await bridge()?.media.library.addRoot()) ?? noBridge<{ root: LibraryRoot | null }>(),
    onSuccess: (result) => {
      reportFailure(result);
      refresh();
      // A new folder is scanned straight away; a cancelled picker does nothing.
      if (result.ok && result.value.root) scan.mutate(result.value.root.id);
    },
  });

  const removeRoot = useMutation({
    mutationFn: async (rootId: string) =>
      (await bridge()?.media.library.removeRoot({ rootId })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });

  const setSettings = useMutation({
    mutationFn: async (patch: Partial<LibrarySettings>) =>
      (await bridge()?.media.library.setSettings(patch)) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      void client.invalidateQueries({ queryKey: LIBRARY_KEYS.settings });
    },
  });

  const clearProgress = useMutation({
    mutationFn: async (itemId: string) =>
      (await bridge()?.media.library.clearProgress({ itemId })) ?? noBridge<void>(),
    onSuccess: () => void client.invalidateQueries({ queryKey: LIBRARY_KEYS.items }),
  });

  return { scan, addRoot, removeRoot, setSettings, clearProgress };
}

/** How often a playing item's position is saved. */
export const PROGRESS_SAVE_INTERVAL_MS = 10_000;

/**
 * A progress saver for one item: `save(pos, dur, ended)` writes at most once per interval while playing,
 * and always when `force` is set (pause, end, unmount).
 */
export function createProgressSaver(
  itemId: string,
  write: (req: { itemId: string; positionS: number; durationS: number; ended?: boolean }) => void,
  now: () => number = Date.now,
) {
  let last = Number.NEGATIVE_INFINITY;
  let lastPosition = -1;
  return (positionS: number, durationS: number, ended: boolean, force = false) => {
    if (!Number.isFinite(positionS) || !Number.isFinite(durationS)) return;
    const t = now();
    if (!force && !ended && t - last < PROGRESS_SAVE_INTERVAL_MS) return;
    if (!ended && Math.abs(positionS - lastPosition) < 1 && !force) return;
    last = t;
    lastPosition = positionS;
    write({ itemId, positionS, durationS, ...(ended ? { ended: true } : {}) });
  };
}

export function writeProgress(req: {
  itemId: string;
  positionS: number;
  durationS: number;
  ended?: boolean;
}) {
  void bridge()?.media.library.progress(req);
}
