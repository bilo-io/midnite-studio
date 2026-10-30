import { resolveSuitePrefs } from '@midnite/studio-shared';

import { useMetricsStore } from '../metrics/metrics-store';

/**
 * The slice of `window.midniteStudio` a suite shell reads on its own, answering the way a suite app's
 * preload does — for an app's `*-app.test.tsx` to spread under its own namespaces (Phase 123 Theme H).
 *
 * A thin stub crashes the shell: the status bar's monitor segment subscribes to `metrics.onSample` and
 * starts the sampler, and the title bar reads `suitePrefs`. Every `on*` returns its unsubscribe and
 * every call resolves with what main sends back. Test support only — nothing in a build imports it.
 */
export function suiteShellTestBridge(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metrics: { start: () => undefined, stop: () => undefined, onSample: () => () => undefined },
    systemHealth: async () => ({ ollamaDaemon: { reachable: false, host: 'http://127.0.0.1:11434' } }),
    systemHealthStartSshAgent: async () => ({ ok: true }),
    monitorAgentUsage: async () => ({ sessions: [], agents: [] }),
    handoff: { open: async () => ({ ok: true }) },
    suitePrefs: {
      get: async () => resolveSuitePrefs({}),
      set: async () => ({ ok: true }),
      onChanged: () => () => undefined,
    },
    ...extra,
  };
}

/** One live sample, so the monitor segment has a readout to draw (it renders nothing before the first). */
export function seedMonitorSample(): void {
  useMetricsStore.getState().reset();
  useMetricsStore.getState().push({ at: Date.now(), cpu: 42, memory: 61 });
}
