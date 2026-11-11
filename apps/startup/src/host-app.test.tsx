// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { STARTUP_PANES, StartupHostApp } from './host-app';
import { STARTUP_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/startup.log' }),
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

describe('Startup host nav', () => {
  it('has one group per module in APP_MODULES.startup, in order, and a sound config', () => {
    expect(STARTUP_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.startup]);
    expect(navConfigProblems(STARTUP_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of STARTUP_HOST_NAV.groups ?? []) {
      expect(STARTUP_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(STARTUP_HOST_NAV, view.id)).toBe(group.id);
    }
  });

  it("lands a module link on that module's first view", () => {
    expect(firstViewOfModule(STARTUP_HOST_NAV, 'startup')).toBe('startup.overview');
  });
});

describe('Startup host', () => {
  it('lists the five views in the rail and opens on Overview', async () => {
    render(<StartupHostApp />);
    await waitFor(() => expect(screen.getByRole('main', { name: 'Overview' })).toBeTruthy());
    const nav = screen.getByRole('navigation');
    for (const label of ['Overview', 'Roadmap', 'Runway', 'Invoices', 'Vendors']) {
      expect(within(nav).getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('switches view from the rail', async () => {
    render(<StartupHostApp />);
    const nav = screen.getByRole('navigation');
    fireEvent.click(within(nav).getAllByText('Roadmap')[0]!);
    await waitFor(() => expect(screen.getByRole('main', { name: 'Roadmap' })).toBeTruthy());
  });
});
