// vitest/jsdom: the host's rail composition and view router — nothing here needs a real browser.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moduleOfView, navConfigProblems, seedMonitorSample, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { GAMER_PANES, GamerHostApp } from './host-app';
import { GAMER_HOST_NAV } from './host-nav';

// The panes are each module's own and have their own tests; this one is about the shell around them.
vi.mock('@midnite/studio-module-gamer/renderer', async (importOriginal) => ({ ...(await importOriginal<object>()), GamerPane: () => <p>GamerPane stub</p> }));
vi.mock('@midnite/studio-module-creator/renderer', async (importOriginal) => ({ ...(await importOriginal<object>()), CreatorPane: () => <p>CreatorPane stub</p> }));

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    report: {
      logPath: async () => ({ path: '/tmp/app.log' }),
      bundle: async () => ({ text: 'boot' }),
      ghStatus: async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' }),
      onOpen: () => () => undefined,
    },
  }) as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Gamer host nav', () => {
  it('has one group per module in APP_MODULES.gamer, in order, and a sound config', () => {
    expect(GAMER_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.gamer]);
    expect(navConfigProblems(GAMER_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of GAMER_HOST_NAV.groups ?? []) {
      expect(GAMER_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(GAMER_HOST_NAV, view.id)).toBe(group.id);
    }
  });
});

describe('Midnite Gamer shell', () => {
  it('wears the suite shell: name, logo, Settings with the Monitor page, and the status bar with the monitor segment', async () => {
    render(<GamerHostApp />);
    expect(screen.getAllByText('Midnite Gamer').length).toBeGreaterThan(0);
    expect(screen.getByAltText('Midnite Gamer')).toBeDefined();
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
