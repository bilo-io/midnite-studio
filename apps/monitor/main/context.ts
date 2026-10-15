import { monitorMain, type MetricsService } from '@midnite/studio-feature-monitor/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import type { CrashLog } from './crash-log';

/** The electron pieces Monitor's main needs, injected so registration is testable under bare vitest. */
export type MonitorElectron = IpcContextElectron & {
  /** Handed the sampler so main can pause it as the window blurs or hides. */
  onMetricsService(service: MetricsService): void;
  log: CrashLog;
};

/**
 * Registers every channel Monitor's renderer can call: the monitor feature's (metrics, system
 * health), plus the two read-side crash-log channels the feature leaves to its composer — the log
 * sink is the composer's, not the feature's.
 */
export function registerMonitorHandlers(el: MonitorElectron): void {
  monitorMain.register(createIpcContext(el), {
    onMetricsService: el.onMetricsService,
    warn: (issue) => el.log.write('warn', issue),
  });
  el.ipcMain.handle(CHANNELS.reportLogPath, () => ({ path: el.log.path }));
  el.ipcMain.handle(CHANNELS.reportBundle, () => ({ text: el.log.bundle() }));
}
