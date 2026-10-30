import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { METRICS_IDLE_INTERVAL_MS } from '@midnite/studio-shared';

import { useMonitorPrefsStore } from './monitor-prefs-store';

describe('monitor prefs store', () => {
  beforeEach(() => {
    useMonitorPrefsStore.setState({ hiddenMetrics: [], metricsIdleIntervalMs: METRICS_IDLE_INTERVAL_MS });
    // the reset above persisted the defaults under our own key; a migration only runs when there is none
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('toggles a metric in and out of the hidden set', () => {
    const { toggleMetric } = useMonitorPrefsStore.getState();
    toggleMetric('gpu');
    expect(useMonitorPrefsStore.getState().hiddenMetrics).toEqual(['gpu']);
    toggleMetric('gpu');
    expect(useMonitorPrefsStore.getState().hiddenMetrics).toEqual([]);
  });

  it('migrates the two fields out of the pre-Theme-K ui-store blob, once', async () => {
    localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { hiddenMetrics: ['gpu', 'bogus'], metricsIdleIntervalMs: 12_000 }, version: 37 }),
    );
    await useMonitorPrefsStore.persist.rehydrate();
    expect(useMonitorPrefsStore.getState().hiddenMetrics).toEqual(['gpu']);
    expect(useMonitorPrefsStore.getState().metricsIdleIntervalMs).toBe(12_000);
    // copied under our own key, so it survives ui-store's next save dropping them
    expect(JSON.parse(localStorage.getItem('midnite.monitor-prefs') ?? '{}').state.hiddenMetrics).toEqual(['gpu']);
  });

  it('ignores an out-of-range legacy cadence', async () => {
    localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { hiddenMetrics: [], metricsIdleIntervalMs: 0 }, version: 37 }),
    );
    await useMonitorPrefsStore.persist.rehydrate();
    expect(useMonitorPrefsStore.getState().metricsIdleIntervalMs).toBe(METRICS_IDLE_INTERVAL_MS);
  });
});
