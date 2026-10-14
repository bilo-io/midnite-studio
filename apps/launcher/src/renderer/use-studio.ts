import { useCallback, useEffect, useState } from 'react';

import type { InstallProgress, LauncherResult, StudioStatus } from '../common/bridge';
import { installState, type AppInstallState } from '../common/status';
import { getBridge } from './bridge';

export type StudioController = {
  status: StudioStatus | null;
  state: AppInstallState;
  progress: InstallProgress | null;
  installing: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  install: () => Promise<LauncherResult>;
  uninstall: () => Promise<LauncherResult>;
};

/**
 * Studio's install state, which every tile reflects today. Re-checked on
 * focus, so installing or deleting Studio behind the launcher's back shows up
 * the moment you come back to it.
 */
export function useStudio(): StudioController {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await getBridge().studio.status());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = getBridge().studio.onProgress(setProgress);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const install = useCallback(async () => {
    setInstalling(true);
    setProgress({ phase: 'download', received: 0, total: null });
    try {
      return await getBridge().studio.install();
    } finally {
      setInstalling(false);
      setProgress(null);
      await refresh();
    }
  }, [refresh]);

  const uninstall = useCallback(async () => {
    const result = await getBridge().studio.uninstall();
    await refresh();
    return result;
  }, [refresh]);

  return { status, state: installState(status), progress, installing, refreshing, refresh, install, uninstall };
}

/** "Downloading 42%", "Verifying…" — the primary button's label while an install runs. */
export function progressLabel(progress: InstallProgress | null): string {
  if (progress === null) return 'Installing…';
  switch (progress.phase) {
    case 'download':
      return progress.total
        ? `Downloading ${Math.floor((progress.received / progress.total) * 100)}%`
        : `Downloading ${(progress.received / 1024 / 1024).toFixed(0)} MB`;
    case 'verify':
      return 'Verifying…';
    case 'install':
      return 'Installing…';
    case 'done':
      return 'Installed';
    case 'error':
      return 'Install failed';
  }
}

/** 0–1 for the button's fill, or `null` when there is no total to measure against. */
export function progressFraction(progress: InstallProgress | null): number | null {
  if (progress === null) return null;
  if (progress.phase === 'verify' || progress.phase === 'install' || progress.phase === 'done') return 1;
  return progress.total ? Math.min(1, progress.received / progress.total) : null;
}
