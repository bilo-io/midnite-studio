// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { MindHostApp, MIND_PANES } from './host-app';
import { MIND_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = {
    notes: { list: vi.fn().mockResolvedValue({ notes: [] }), save: vi.fn(), delete: vi.fn(), reorder: vi.fn() },
    capture: {
      list: vi.fn().mockResolvedValue({ items: [] }),
      onChanged: () => () => undefined,
    },
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/mind.log' }),
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
