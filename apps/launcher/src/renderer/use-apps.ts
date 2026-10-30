import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppsStatus, InstallProgress, LauncherResult } from '../common/bridge';
import type { AppId, BundleAppId, LauncherApp } from '../common/catalog';
import { replacedBundles, type ReplacedBundle } from '../common/migration';
import { deriveAppState, type AppState } from '../common/status';
import { getBridge } from './bridge';
import { useStudio, type StudioController } from './use-studio';

/** Everything a tile, row or sheet needs to draw one app. */
export type AppView = AppState & {
  installing: boolean;
  progress: InstallProgress | null;
  /** Why no version is known (offline feed), for the version line. */
  feedError: string | null;
  /** Retired apps still installed as their own bundle that this app replaces (Phase 124 Theme G.3). */
  replaces: ReplacedBundle[];
};

export type AppsController = {
  studio: StudioController;
  status: AppsStatus | null;
  viewOf: (app: LauncherApp) => AppView;
  install: (app: LauncherApp) => Promise<LauncherResult>;
  uninstall: (app: LauncherApp) => Promise<LauncherResult>;
  /** Moves a retired app's old bundle to the Trash, once its host is installed. */
  removeReplaced: (id: BundleAppId) => Promise<LauncherResult>;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * Per-app tile state. Studio's tile reads Studio's install; every other tile reads the launcher's
 * installed-bundle record against the catalog (`common/status.ts#deriveAppState`) and falls back
 * to Studio only for an app nothing has published a bundle for yet.
 */
export function useApps(): AppsController {
  const studio = useStudio();
  const [status, setStatus] = useState<AppsStatus | null>(null);
  const [busy, setBusy] = useState<Partial<Record<AppId, InstallProgress | null>>>({});
  const [refreshingApps, setRefreshingApps] = useState(false);

  const refreshApps = useCallback(async () => {
    setRefreshingApps(true);
    try {
      setStatus(await getBridge().apps.status());
    } finally {
      setRefreshingApps(false);
    }
  }, []);

  useEffect(() => {
    void refreshApps();
    const unsub = getBridge().apps.onProgress(({ id, progress }) => setBusy((b) => (id in b ? { ...b, [id]: progress } : b)));
    const onFocus = () => void refreshApps();
    window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshApps]);

  const { refresh: refreshStudio } = studio;
  const refresh = useCallback(async () => {
    await Promise.all([refreshStudio(), refreshApps()]);
  }, [refreshStudio, refreshApps]);

  const viewOf = useCallback(
    (app: LauncherApp): AppView => {
      const derived = deriveAppState(app.id, studio.status, status);
      const bundleBusy = app.id in busy;
      const hostedByStudio = derived.source === 'studio';
      return {
        ...derived,
        // Studio-hosted tiles share Studio's own install progress; a bundle shows its own.
        installing: app.id === 'studio' || hostedByStudio ? studio.installing : bundleBusy,
        progress: app.id === 'studio' || hostedByStudio ? studio.progress : (busy[app.id] ?? null),
        feedError: studio.status?.feedError ?? null,
        replaces: replacedBundles(app.id, status),
      };
    },
    [studio.status, studio.installing, studio.progress, status, busy],
  );

  const install = useCallback(
    async (app: LauncherApp): Promise<LauncherResult> => {
      if (app.comingSoon) return { ok: false, message: `Midnite ${app.name} is coming soon.` };
      if (app.id === 'studio' || deriveAppState(app.id, studio.status, status).source === 'studio') return studio.install();
      setBusy((b) => ({ ...b, [app.id]: { phase: 'download', received: 0, total: null } }));
      try {
        return await getBridge().apps.install(app.id);
      } finally {
        setBusy(({ [app.id]: _done, ...rest }) => rest);
        await refreshApps();
      }
    },
    [studio, status, refreshApps],
  );

  const uninstall = useCallback(
    async (app: LauncherApp): Promise<LauncherResult> => {
      if (app.id === 'studio') return studio.uninstall();
      const result = await getBridge().apps.uninstall(app.id);
      await refreshApps();
      return result;
    },
    [studio, refreshApps],
  );

  const removeReplaced = useCallback(
    async (id: BundleAppId): Promise<LauncherResult> => {
      const result = await getBridge().apps.uninstall(id);
      await refreshApps();
      return result;
    },
    [refreshApps],
  );

  return useMemo(
    () => ({ studio, status, viewOf, install, uninstall, removeReplaced, refreshing: studio.refreshing || refreshingApps, refresh }),
    [studio, status, viewOf, install, uninstall, removeReplaced, refreshingApps, refresh],
  );
}
