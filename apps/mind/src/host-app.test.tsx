// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems, seedMonitorSample, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { MindHostApp, MIND_PANES } from './host-app';
import { MIND_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    notes: { list: vi.fn().mockResolvedValue({ notes: [] }), save: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
    capture: {
      status: vi.fn().mockResolvedValue({
        permission: 'granted',
        settings: { shortcut: null, clipboardHistory: false, hideWindows: true },
        shortcut: { accelerator: null, state: 'off' },
        canRecord: true,
        destinations: ['clipboard', 'finder'],
      }),
      list: vi.fn().mockResolvedValue({ captures: [] }),
      clipboard: { list: vi.fn().mockResolvedValue({ enabled: false, entries: [] }) },
      regionPending: vi.fn().mockResolvedValue({ frame: null }),
      sources: vi.fn().mockResolvedValue({ ok: true, value: { sources: [] } }),
      onChanged: () => () => undefined,
    },
    knowledge: {
      getGraph: vi.fn().mockResolvedValue({ ok: false, kind: 'absent' }),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn().mockResolvedValue({ exists: false }),
      onLayoutProgress: () => () => undefined,
    },
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/mind.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot' }),
      ghStatus: vi.fn().mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' }),
      onOpen: () => () => undefined,
    },
  }) as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Mind host nav', () => {
  it('has one group per module in APP_MODULES.mind, in order, and a sound config', () => {
    expect(MIND_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.mind]);
    expect(navConfigProblems(MIND_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of MIND_HOST_NAV.groups ?? []) {
      expect(MIND_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(MIND_HOST_NAV, view.id)).toBe(group.id);
    }
  });

  it('lands a module link on that module\'s first view', () => {
    expect(firstViewOfModule(MIND_HOST_NAV, 'mind')).toBe('notes');
    expect(firstViewOfModule(MIND_HOST_NAV, 'capture')).toBe('capture');
  });
});

describe('Mind host', () => {
  it('lists Notes, Knowledge and Capture in the rail and opens on Notes', async () => {
    render(<MindHostApp />);
    const rail = screen.getByRole('navigation', { name: 'Views' });
    for (const label of ['Notes', 'Knowledge', 'Capture']) expect(within(rail).getByRole('link', { name: label })).toBeDefined();
    await waitFor(() => expect(screen.getByText(/your notebook is empty/i)).toBeDefined());
  });

  it('routes a rail click to Capture, and Settings keeps the knowledge graph page', async () => {
    render(<MindHostApp />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'Capture' }));
    await waitFor(() => expect(screen.getByRole('main', { name: 'Capture' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByTestId('suite-settings');
    fireEvent.click(within(settings).getAllByText('Knowledge graph')[0]!);
    expect(await screen.findByTestId('knowledge-style-picker')).toBeDefined();
  });
});

describe('Midnite Mind shell', () => {
  it('wears the suite shell: name, logo, Settings with the Monitor page, and the status bar with the monitor segment', async () => {
    render(<MindHostApp />);
    expect(screen.getAllByText('Midnite Mind').length).toBeGreaterThan(0);
    expect(screen.getByAltText('Midnite Mind')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
    act(() => seedMonitorSample());
    expect(await screen.findByTestId('monitor-cluster')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = screen.getByTestId('suite-settings');
    expect(within(settings).getAllByText('Appearance').length).toBeGreaterThan(0);
    expect(within(settings).getAllByText('Monitor').length).toBeGreaterThan(0);
    // The terminal, companion and FAB are gated off until a suite app has a pty host.
    expect(document.querySelector('[data-shell-panel]')).toBeNull();
  });
});
