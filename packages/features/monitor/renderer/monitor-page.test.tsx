// vitest/jsdom: DOM text and roles over a mock bridge — no real layout needed.
import { useMetricsStore } from '@midnite/studio-frame';
import type { MetricSample, SystemHealth } from '@midnite/studio-shared';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { healthRows } from './system-health-section';
import { MonitorPage } from './monitor-page';

const health: SystemHealth = {
  git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
  shell: '/bin/zsh',
  sshAgent: { running: false, keys: 0 },
  cli: { installed: false, path: null, target: null, managed: false, version: null },
  ollamaDaemon: { reachable: false, version: null, host: 'http://127.0.0.1:11434' },
};

const sample = (t: number): MetricSample => ({
  t,
  cpu: 40,
  memory: 60,
  gpu: 10,
  disk: 70,
  battery: { hasBattery: true, percent: 80, isCharging: true, devices: [] },
});

beforeEach(() => {
  useMetricsStore.getState().reset();
  window.midniteStudio = {
    metrics: { start: vi.fn(), stop: vi.fn(), onSample: () => () => undefined },
    systemHealth: vi.fn().mockResolvedValue(health),
    systemHealthStartSshAgent: vi.fn().mockResolvedValue({ ok: true }),
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/monitor.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot line' }),
    },
  } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('MonitorPage', () => {
  it('waits for a sample, then draws usage, disk and battery', () => {
    render(<MonitorPage />);
    expect(screen.getByText('Waiting for the first sample…')).toBeTruthy();
    act(() => useMetricsStore.getState().push(sample(Date.now())));
    expect(screen.queryByText('Waiting for the first sample…')).toBeNull();
    expect(screen.getByRole('meter', { name: 'Disk capacity used' }).getAttribute('aria-valuenow')).toBe('70');
    expect(screen.getByText(/80% · charging/)).toBeTruthy();
  });

  it('renders every section from the bridge', async () => {
    render(<MonitorPage />);
    for (const name of ['Usage', 'Disk and battery', 'System health', 'Crash log']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    await waitFor(() => expect(screen.getByText(/git version 2.45.0/)).toBeTruthy());
    expect(screen.getByText(/not reachable/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('/tmp/monitor.log')).toBeTruthy());
    expect(screen.getByLabelText('Recent log records').textContent).toBe('boot line');
  });

  it('says so when the bridge has no system health', async () => {
    window.midniteStudio = { metrics: { start: vi.fn(), stop: vi.fn(), onSample: () => () => undefined } } as never;
    render(<MonitorPage />);
    expect(await screen.findByText('System health is not available here.')).toBeTruthy();
    expect(screen.getByText('No log file this session.')).toBeTruthy();
  });
});

describe('healthRows', () => {
  it('flags a missing binary and a stopped agent', () => {
    const rows = healthRows(health);
    expect(rows.find((r) => r.label === 'git')).toMatchObject({ ok: true });
    expect(rows.find((r) => r.label === 'node')).toMatchObject({ ok: false, detail: 'not found' });
    expect(rows.find((r) => r.label === 'SSH agent')).toMatchObject({ ok: false });
  });
});
