// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navConfigProblems } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { VanguardHostApp, VANGUARD_PANES } from './host-app';
import { VANGUARD_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = {
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
  } as unknown as typeof window.midniteStudio;
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
