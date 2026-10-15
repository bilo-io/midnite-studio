import type { AppInstallProgress, AppsStatus, InstallProgress, InstalledBundle, LauncherBridge, StudioStatus } from '../common/bridge';

/**
 * A stand-in bridge for the renderer running outside Electron. It never
 * touches anything: Install animates a fake download, Open resolves.
 */
export function createMockBridge(mode: string | null): LauncherBridge {
  const latest = { version: '0.4.1', releasedAt: '2026-10-12T09:00:00Z', notesUrl: null };
  let status: StudioStatus = {
    installed:
      mode === 'installed'
        ? { path: '/Applications/Midnite Studio.app', version: '0.4.1' }
        : mode === 'update'
          ? { path: '/Applications/Midnite Studio.app', version: '0.3.2' }
          : null,
    latest,
    feedError: null,
    running: false,
    checkedAt: Date.now(),
  };
  // `?studio=bundles` seeds the per-app states: cleaner Installed, monitor Update (catalog newer),
  // vault published but Not installed, the rest hosted by Studio. Studio itself is installed.
  const runtimeVersion = '0.4.1';
  const bundles = mode === 'bundles';
  if (bundles) status = { ...status, installed: { path: '/Applications/Midnite Studio.app', version: '0.4.1' } };
  let installed: InstalledBundle[] = bundles
    ? [
        { id: 'cleaner', version: '0.4.1', runtimeVersion },
        { id: 'monitor', version: '0.4.0', runtimeVersion },
      ]
    : [];
  const published = bundles ? ['cleaner', 'monitor', 'vault'] : [];
  const appsStatus = (): AppsStatus => ({
    runtimeVersion,
    canManageBundles: true,
    installed,
    catalog: bundles ? { runtimeVersion, apps: published.map((id) => ({ id, version: '0.4.1' })) } : null,
  });
  const appListeners = new Set<(e: AppInstallProgress) => void>();
  const listeners = new Set<(p: InstallProgress) => void>();
  const emit = (p: InstallProgress) => listeners.forEach((l) => l(p));
  const ok = async () => ({ ok: true as const });

  return {
    launcherVersion: '0.0.1',
    platform: { os: 'darwin', arch: 'arm64' },
    studio: {
      status: async () => ({ ...status, checkedAt: Date.now() }),
      install: () =>
        new Promise((resolve) => {
          const total = 270 * 1024 * 1024;
          let received = 0;
          const tick = setInterval(() => {
            received = Math.min(total, received + total / 25);
            emit({ phase: 'download', received, total });
            if (received >= total) {
              clearInterval(tick);
              emit({ phase: 'install', received, total });
              setTimeout(() => {
                status = { ...status, installed: { path: '/Applications/Midnite Studio.app', version: latest.version } };
                emit({ phase: 'done', received, total });
                resolve({ ok: true });
              }, 400);
            }
          }, 80);
        }),
      uninstall: async () => {
        status = { ...status, installed: null };
        return { ok: true };
      },
      reveal: ok,
      onProgress: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    apps: {
      open: ok,
      status: async () => appsStatus(),
      install: async (id) => {
        if (!published.includes(id)) return { ok: false, message: `Midnite ${id} has no published build yet.` };
        const total = 40 * 1024 * 1024;
        for (let i = 1; i <= 5; i++) {
          appListeners.forEach((l) => l({ id, progress: { phase: 'download', received: (total * i) / 5, total } }));
          await new Promise((r) => setTimeout(r, 120));
        }
        installed = [...installed.filter((a) => a.id !== id), { id, version: '0.4.1', runtimeVersion }];
        return { ok: true };
      },
      uninstall: async (id) => {
        installed = installed.filter((a) => a.id !== id);
        return { ok: true };
      },
      onProgress: (listener) => {
        appListeners.add(listener);
        return () => appListeners.delete(listener);
      },
      onShow: () => () => undefined,
      takePending: async () => null,
    },
    links: { open: ok },
    theme: { set: () => undefined },
  };
}
