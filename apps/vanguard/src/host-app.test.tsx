// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navConfigProblems, seedMonitorSample, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { VanguardHostApp, VANGUARD_PANES } from './host-app';
import { VANGUARD_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    vanguard: {
      findings: { list: vi.fn().mockResolvedValue({ findings: [] }), onChanged: () => () => undefined },
      sensors: vi.fn().mockResolvedValue({ sensors: [], active: true }),
      viewOpened: vi.fn().mockResolvedValue({ sensors: [], active: true }),
      onChanged: () => () => undefined,
    },
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/vanguard.log' }),
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

describe('Vanguard host nav', () => {
  it('has one group per module in APP_MODULES.vanguard, in order, and a sound config', () => {
    expect(VANGUARD_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.vanguard]);
    expect(navConfigProblems(VANGUARD_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group', () => {
    for (const group of VANGUARD_HOST_NAV.groups ?? []) expect(VANGUARD_PANES[group.id]).toBeTypeOf('function');
  });
});

describe('Vanguard host', () => {
  it('lists the views of every module in the rail and opens on Vanguard', async () => {
    render(<VanguardHostApp />);
    const rail = screen.getByRole('navigation', { name: 'Views' });
    for (const label of ['Findings', 'Sensors', 'Network', 'Vault', 'Cleaner', 'Monitor']) {
      expect(within(rail).getByRole('link', { name: label })).toBeDefined();
    }
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vanguard' })).toBeDefined());
  });

  it("routes a rail click to that module's view", async () => {
    render(<VanguardHostApp />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'Monitor' }));
    await waitFor(() => expect(screen.getByRole('main', { name: 'Monitor' })).toBeDefined());
  });
});

describe('Midnite Vanguard shell', () => {
  it('wears the suite shell: name, logo, Settings with the Monitor page, and the status bar with the monitor segment', async () => {
    render(<VanguardHostApp />);
    expect(screen.getAllByText('Midnite Vanguard').length).toBeGreaterThan(0);
    expect(screen.getByAltText('Midnite Vanguard')).toBeDefined();
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

  it('opens Monitor in place from the status bar flyout, since Vanguard hosts it', async () => {
    render(<VanguardHostApp />);
    act(() => seedMonitorSample());
    fireEvent.click(await screen.findByTestId('monitor-cluster'));
    fireEvent.click(await screen.findByRole('button', { name: /Open Monitor/ }));
    await waitFor(() => expect(screen.getByRole('main', { name: 'Monitor' })).toBeDefined());
  });
});
