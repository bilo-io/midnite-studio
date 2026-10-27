// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { monitorManifest } from '@midnite/studio-feature-monitor/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { MonitorApp } from './monitor-app';
import { MONITOR_APP } from './monitor-manifest';

let onReportOpen: (() => void) | null = null;
const report = {
  onOpen: vi.fn((handler: () => void) => {
    onReportOpen = handler;
    return () => undefined;
  }),
  bundle: vi.fn(async () => ({ text: '' })),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
};

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
      ghStatus: report.ghStatus,
      onOpen: report.onOpen,
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

  it('lists Studio’s live session from the shared broker and hands it to Studio as a midnite://open link', async () => {
    const open = vi.fn().mockResolvedValue({ ok: true });
    const session = { id: 's1', kind: 'shell', title: 'widgets', cwd: '/w', repoId: 'r1', createdAt: Date.now() };
    Object.assign(window.midniteStudio!, {
      terminal: {
        list: vi.fn().mockResolvedValue({
          sessions: [{ session, scrollback: new Uint8Array(0), live: { ptyId: 'p1', pid: 7, cols: 80, rows: 24 } }],
          broker: { mode: 'broker' },
        }),
      },
      handoff: { open },
    });
    render(<MonitorApp />);
    const button = await screen.findByRole('button', { name: 'Open in Studio' });
    button.click();
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const { link } = open.mock.calls[0]![0] as { link: string };
    expect(link.startsWith('midnite://open?app=studio&ref=')).toBe(true);
  });

  it('says so when the hand-off cannot leave the app', async () => {
    const session = { id: 's1', kind: 'shell', title: 'widgets', cwd: '/w', repoId: 'r1', createdAt: Date.now() };
    Object.assign(window.midniteStudio!, {
      terminal: {
        list: vi.fn().mockResolvedValue({
          sessions: [{ session, scrollback: new Uint8Array(0), live: { ptyId: 'p1', pid: 7, cols: 80, rows: 24 } }],
        }),
      },
      handoff: { open: vi.fn().mockResolvedValue({ ok: false }) },
    });
    render(<MonitorApp />);
    (await screen.findByRole('button', { name: 'Open in Studio' })).click();
    expect(await screen.findByRole('status')).toBeDefined();
  });
});

describe('Monitor Report an Issue', () => {
  it('mounts the dialog for midnite-monitor: the Help menu event opens it', async () => {
    render(<MonitorApp />);
    await waitFor(() => expect(onReportOpen).not.toBeNull());
    expect(screen.queryByText('Report an issue')).toBeNull();
    act(() => onReportOpen?.());
    expect(await screen.findByText('Report an issue')).toBeDefined();
  });
});
