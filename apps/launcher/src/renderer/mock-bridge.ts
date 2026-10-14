import type { InstallProgress, LauncherBridge, StudioStatus } from '../common/bridge';

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
    apps: { open: ok },
    links: { open: ok },
  };
}
