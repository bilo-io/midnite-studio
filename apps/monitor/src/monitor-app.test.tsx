// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { monitorManifest } from '@midnite/studio-feature-monitor/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { MonitorApp } from './monitor-app';
import { MONITOR_APP } from './monitor-manifest';

beforeEach(() => {
  window.midniteStudio = {
    metrics: { start: vi.fn(), stop: vi.fn(), onSample: () => () => undefined },
    systemHealth: vi.fn().mockResolvedValue({
      git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
      shell: '/bin/zsh',
      sshAgent: { running: true, keys: 2 },
      cli: { installed: false, path: null, target: null, managed: false, version: null },
    }),
    systemHealthStartSshAgent: vi.fn(),
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/monitor.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot' }),
    },
  } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Monitor composition', () => {
  it('is the owner the placement map names for the monitor feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.monitor)[0]).toBe(MONITOR_APP.id);
    expect(MONITOR_APP.features).toEqual([monitorManifest.feature]);
  });

  it('opens on a view the monitor feature registers', () => {
    expect([...FEATURE_VIEWS.monitor]).toContain(MONITOR_APP.home);
  });

  it("wears the launcher catalog's accent", () => {
    expect(MONITOR_APP.accent).toBe('#ef4444');
  });
});

describe('Monitor home view', () => {
  it('renders the monitor view framed as Monitor, with every section', async () => {
    render(<MonitorApp />);
    expect(screen.getByText('Midnite Monitor')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'System health' })).toBeDefined());
    for (const name of ['Usage', 'Disk and battery', 'Crash log']) {
      expect(screen.getByRole('heading', { name })).toBeDefined();
    }
    await waitFor(() => expect(screen.getByText(/2 keys loaded/)).toBeDefined());
  });
});
