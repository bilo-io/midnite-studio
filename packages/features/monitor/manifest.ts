import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The monitor feature — Monitor's one feature (Phase 113 Theme I), copying
 * the optimizer's template (`../optimizer/manifest.ts`).
 *
 * Today the machine's readouts are scattered: a status-bar cluster and its
 * flyout, a `monitor` Settings page, and a System Health block in
 * `health`. The view gathers them in one place — timelines, disk and
 * battery, toolchain health and the crash log.
 *
 * **Settings pages stay where they are.** `FEATURE_SETTINGS_PAGES.monitor`
 * (`monitor`) and `diagnostics` (`health`) are still rendered by the app's
 * Settings view over `ui-store`, so no stored key moves; `settingsPages` is
 * therefore empty until a later slice gives the feature its own port.
 *
 * The crash-log channels (`reportBundle`/`reportLogPath`) are *not* listed:
 * the log sink is the composer's (desktop's `report-handlers.ts`, or an
 * app's own), so the composer registers them.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const monitorManifest = defineFeatureManifest({
  feature: 'monitor',
  owner: 'monitor',
  views: [
    {
      id: 'monitor',
      // Global: it reads the machine, not one checkout.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Monitor',
        description: 'CPU, memory, GPU, disk and battery, toolchain health and the crash log',
      },
    },
  ],
  settingsPages: [],
  ipc: [CHANNELS.metricsStart, CHANNELS.metricsStop, CHANNELS.systemHealth, CHANNELS.systemHealthStartSshAgent, CHANNELS.monitorAgentUsage],
  events: [EVENT_CHANNELS.metricsSample],
  mcpTools: [],
});

export type MonitorManifest = typeof monitorManifest;
