// vitest/jsdom: DOM roles and store transitions — no real browser needed.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { METRICS_IDLE_INTERVAL_MS } from '@midnite/studio-shared';

import { useMonitorPrefsStore } from '../prefs/monitor-prefs-store';
import { suiteAppSettingsPages } from '../shell/suite-app-shell';
import { SuiteMonitorPage } from './suite-monitor-page';

beforeEach(() => useMonitorPrefsStore.setState({ hiddenMetrics: [], metricsIdleIntervalMs: METRICS_IDLE_INTERVAL_MS }));
afterEach(cleanup);

describe('SuiteMonitorPage', () => {
  it('turns a metric off and on through the monitor prefs store', () => {
    render(<SuiteMonitorPage />);
    const cpu = screen.getByRole('switch', { name: 'CPU' });
    fireEvent.click(cpu);
    expect(useMonitorPrefsStore.getState().hiddenMetrics).toContain('cpu');
    fireEvent.click(cpu);
    expect(useMonitorPrefsStore.getState().hiddenMetrics).not.toContain('cpu');
  });

  it('sets the idle refresh interval', () => {
    render(<SuiteMonitorPage />);
    fireEvent.click(screen.getByRole('radio', { name: '30 seconds' }));
    expect(useMonitorPrefsStore.getState().metricsIdleIntervalMs).toBe(30000);
  });
});

describe('suiteAppSettingsPages', () => {
  const ids = (panels?: Parameters<typeof suiteAppSettingsPages>[0]) => suiteAppSettingsPages(panels).map((p) => p.id);

  it('lists Appearance and the chord table for an app with no monitor segment', () => {
    expect(ids()).toEqual(['appearance', 'chords']);
    expect(ids({ terminal: false })).toEqual(['appearance', 'chords']);
  });

  it('adds Monitor, between them, once the bar has a monitor segment', () => {
    expect(ids({ monitor: () => null })).toEqual(['appearance', 'monitor', 'chords']);
  });

  it('keeps every suite page suite-scoped', () => {
    expect(suiteAppSettingsPages({ monitor: () => null }).every((p) => p.scope === 'suite')).toBe(true);
  });
});
