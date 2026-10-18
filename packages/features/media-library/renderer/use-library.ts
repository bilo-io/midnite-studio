import {
  DEFAULT_LIBRARY_LAN_SETTINGS,
  type GitOpResult,
  type LibraryFfmpegStatus,
  type LibraryItem,
  type LibraryLanSettingsPatch,
  type LibraryLanStatus,
  type LibraryPlaylist,
  type LibraryRoot,
  type LibraryScanProgress,
  type LibraryScanSummary,
  type LibrarySettings,
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
  playlists: ['media-library', 'playlists'] as const,
  lan: ['media-library', 'lan'] as const,
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
      else if (reason === 'playlists')
        void client.invalidateQueries({ queryKey: LIBRARY_KEYS.playlists });
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

export function useLibraryPlaylists() {
  return useQuery<LibraryPlaylist[]>({
    queryKey: LIBRARY_KEYS.playlists,
    queryFn: async () => (await bridge()?.media.library.playlists.list())?.playlists ?? [],
  });
}

export function usePlaylistMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: LIBRARY_KEYS.playlists });
  const playlists = () => bridge()?.media.library.playlists;

  const create = useMutation({
    mutationFn: async (req: { name: string; itemIds?: string[] }) =>
      (await playlists()?.create(req)) ?? noBridge<{ playlist: LibraryPlaylist }>(),
    onSuccess: (result) => {
      reportFailure(result);
      refresh();
    },
  });
  const rename = useMutation({
    mutationFn: async (req: { playlistId: string; name: string }) =>
      (await playlists()?.rename(req)) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });
  const setItems = useMutation({
    mutationFn: async (req: { playlistId: string; itemIds: string[] }) =>
      (await playlists()?.setItems(req)) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (playlistId: string) =>
      (await playlists()?.delete({ playlistId })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });
  return { create, rename, setItems, remove };
}

/** What the panel shows before main answers, or in a build with no bridge. */
export const LAN_STATUS_UNAVAILABLE: LibraryLanStatus = {
  available: false,
  running: false,
  url: null,
  settings: { ...DEFAULT_LIBRARY_LAN_SETTINGS },
  interfaces: [],
  clients: [],
  transcodes: 0,
  ffmpeg: { found: false, path: null, source: null },
};

/** How often the panel refreshes the connected devices while the server runs. */
export const LAN_STATUS_POLL_MS = 3_000;

/** Share on your network: polled only while the server runs (and the panel is mounted). */
export function useLibraryLanStatus() {
  return useQuery<LibraryLanStatus>({
    queryKey: LIBRARY_KEYS.lan,
    queryFn: async () => (await bridge()?.media.library.lan.status()) ?? LAN_STATUS_UNAVAILABLE,
    refetchInterval: (query) => (query.state.data?.running ? LAN_STATUS_POLL_MS : false),
  });
}

export function useLibraryLanMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: LIBRARY_KEYS.lan });
  const lan = () => bridge()?.media.library.lan;

  const start = useMutation({
    mutationFn: async (address?: string) =>
      (await lan()?.start(address === undefined ? {} : { address })) ??
      noBridge<LibraryLanStatus>(),
    onSuccess: (result) => {
      reportFailure(result);
      refresh();
    },
  });
  const stop = useMutation({
    mutationFn: async () => (await lan()?.stop()) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });
  const regenerate = useMutation({
    mutationFn: async () => (await lan()?.regenerateToken()) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok)
        useToastStore.getState().addToast({
          message: 'New link made — every link shared before it has stopped working.',
          status: 'success',
        });
      refresh();
    },
  });
  const setSettings = useMutation({
    mutationFn: async (patch: LibraryLanSettingsPatch) =>
      (await lan()?.setSettings(patch)) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      refresh();
    },
  });
  const detectFfmpeg = useMutation({
    mutationFn: async () => (await lan()?.detectFfmpeg()) ?? null,
    onSuccess: () => refresh(),
  });
  const chooseFfmpeg = useMutation({
    mutationFn: async () => (await lan()?.chooseFfmpeg()) ?? noBridge<LibraryFfmpegStatus>(),
    onSuccess: (result) => {
      reportFailure<LibraryFfmpegStatus>(result);
      refresh();
    },
  });
  return { start, stop, regenerate, setSettings, detectFfmpeg, chooseFfmpeg };
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
