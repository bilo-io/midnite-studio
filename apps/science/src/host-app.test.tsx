// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { ScienceHostApp, SCIENCE_PANES } from './host-app';
import { SCIENCE_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/science.log' }),
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

describe('Science host nav', () => {
  it('has a sound config, one group for each mounted module, and a pane for every group', () => {
    expect(navConfigProblems(SCIENCE_HOST_NAV)).toEqual([]);
    expect(SCIENCE_HOST_NAV.groups?.map((g) => g.id)).toEqual(['science']);
    expect(APP_MODULES.science).toContain('science');
    for (const group of SCIENCE_HOST_NAV.groups ?? []) {
      expect(SCIENCE_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(SCIENCE_HOST_NAV, view.id)).toBe(group.id);
    }
  });

  it("lands a module link on that module's first view", () => {
    expect(firstViewOfModule(SCIENCE_HOST_NAV, 'science')).toBe('notebooks');
  });
});

describe('Science host', () => {
  it('lists Notebooks and Templates under the Science group and opens on the empty notebooks state', () => {
    render(<ScienceHostApp />);
    const rail = screen.getByRole('navigation', { name: 'Views' });
    for (const label of ['Notebooks', 'Templates']) expect(within(rail).getByRole('link', { name: label })).toBeDefined();
    expect(screen.getByText('No notebooks yet')).toBeDefined();
  });
});
