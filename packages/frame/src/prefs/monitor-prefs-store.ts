import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

import {
  METRICS_IDLE_INTERVAL_MS,
  METRIC_IDS,
  type MetricId,
  type MonitorPrefs,
} from '@midnite/studio-shared';

import { registerSuitePrefsStore, suitePrefsStorage } from './suite-prefs-storage';

/**
 * The monitor segment's two preferences (Phase 123 Theme K), on the suite-prefs file's `monitor`
 * group so the status bar of every app reads the same readouts and cadence.
 *
 * Both used to live in Studio's `ui-store`; {@link legacyUiFallback} reads them out of that blob
 * once, until the file holds the group.
 */
export type MonitorPrefsState = {
  /** Stored as the hidden set so a metric added in a later release shows by default. */
  hiddenMetrics: MetricId[];
  /** Sampling cadence with the flyout closed. Opening it always escalates. */
  metricsIdleIntervalMs: number;
  toggleMetric: (id: MetricId) => void;
  setMetricsIdleInterval: (ms: number) => void;
};

const LEGACY_UI_KEY = 'midnite-studio.ui';

/** Own localStorage key first, then the pre-Theme-K `ui-store` blob; never throws. */
function legacyUiFallback(): PersistStorage<MonitorPrefs> | undefined {
  const own = createJSONStorage<MonitorPrefs>(() => localStorage);
  if (!own) return undefined;
  return {
    getItem: (name) => {
      try {
        const stored = own.getItem(name) as StorageValue<MonitorPrefs> | null;
        if (stored) return stored;
        const raw = localStorage.getItem(LEGACY_UI_KEY);
        if (!raw) return null;
        const old = (JSON.parse(raw) as { state?: Partial<MonitorPrefs> }).state;
        if (!old || (old.hiddenMetrics === undefined && old.metricsIdleIntervalMs === undefined)) return null;
        const migrated: StorageValue<MonitorPrefs> = {
          state: {
            hiddenMetrics: Array.isArray(old.hiddenMetrics)
              ? old.hiddenMetrics.filter((id): id is MetricId => (METRIC_IDS as readonly string[]).includes(id))
              : [],
            metricsIdleIntervalMs:
              Number.isInteger(old.metricsIdleIntervalMs) && (old.metricsIdleIntervalMs as number) > 0
                ? (old.metricsIdleIntervalMs as number)
                : METRICS_IDLE_INTERVAL_MS,
          },
          version: 1,
        };
        // Keep the migrated value under our own key: `ui-store` stops writing these two, and the
        // next time it saves, its blob no longer carries them.
        own.setItem(name, migrated);
        return migrated;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => own.setItem(name, value),
    removeItem: (name) => own.removeItem(name),
  };
}

export const useMonitorPrefsStore = create<MonitorPrefsState>()(
  persist(
    (set) => ({
      hiddenMetrics: [],
      metricsIdleIntervalMs: METRICS_IDLE_INTERVAL_MS,
      toggleMetric: (id) =>
        set((state) => ({
          hiddenMetrics: state.hiddenMetrics.includes(id)
            ? state.hiddenMetrics.filter((entry) => entry !== id)
            : [...state.hiddenMetrics, id],
        })),
      setMetricsIdleInterval: (metricsIdleIntervalMs) => set({ metricsIdleIntervalMs }),
    }),
    {
      name: 'midnite.monitor-prefs',
      version: 1,
      storage: suitePrefsStorage<MonitorPrefs>('monitor', 1, legacyUiFallback()),
      partialize: (s): MonitorPrefs => ({
        hiddenMetrics: s.hiddenMetrics,
        metricsIdleIntervalMs: s.metricsIdleIntervalMs,
      }),
    },
  ),
);

registerSuitePrefsStore('monitor', useMonitorPrefsStore);
