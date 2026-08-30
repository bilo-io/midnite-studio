import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import { createMetricsService, type MetricsService } from '../metrics/metrics-service';

/**
 * System-metrics IPC.
 *
 * `ipcMain.on`, not `handle`: both verbs are one-way and there is nothing to
 * report back — matching `pty.input`. The renderer re-sends `start` with a new
 * `intervalMs` whenever the flyout opens or closes, and the service treats that
 * as a re-arm rather than a second sampler.
 *
 * This module is the only one in `metrics/` that imports `electron`. The
 * probes and the sampler take their window lifecycle as `pause()`/`resume()`
 * calls, so all of them stay unit-testable under bare vitest — the same split
 * `repo-store.ts` gets by taking its directory as an argument.
 */
export function registerMetricsHandlers(getWindow: () => BrowserWindow | null): MetricsService {
  const service = createMetricsService({
    emit: (sample) => {
      const win = getWindow();
      // A destroyed window still answers `getWindow()` for a tick during
      // teardown; sending to its webContents then throws.
      if (!win || win.isDestroyed()) return;
      win.webContents.send(EVENT_CHANNELS.metricsSample, sample);
    },
  });

  ipcMain.on(CHANNELS.metricsStart, (_event, raw: unknown) => {
    const parsed = schemas.MetricsStartRequest.safeParse(raw);
    if (!parsed.success) return;
    service.start(parsed.data.intervalMs, { freshDisk: parsed.data.freshDisk ?? false });
  });

  ipcMain.on(CHANNELS.metricsStop, () => {
    service.stop();
  });

  return service;
}

/**
 * Tie sampling to whether anyone can see the footer.
 *
 * Blur and hide both stop it outright. This is the single largest saving in
 * the feature: idling in the background with the flyout closed would otherwise
 * spawn an `ioreg` every five seconds for hours, which is a measurable battery
 * cost to redraw a sparkline nobody is looking at.
 *
 * Separate from `registerMetricsHandlers` because the window does not exist
 * when the handlers are registered — `main/index.ts` creates it afterwards.
 */
export function bindMetricsToWindow(service: MetricsService, win: BrowserWindow): void {
  win.on('blur', () => service.pause());
  win.on('focus', () => service.resume());
  win.on('hide', () => service.pause());
  win.on('show', () => service.resume());
  win.on('minimize', () => service.pause());
  win.on('restore', () => service.resume());
  win.on('closed', () => service.stop());
}
