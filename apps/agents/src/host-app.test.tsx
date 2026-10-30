// vitest/jsdom: the host's rail composition and view router — nothing here needs a real browser.
import { describe, expect, it } from 'vitest';

import { moduleOfView, navConfigProblems } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { AGENTS_PANES } from './host-app';
import { AGENTS_HOST_NAV } from './host-nav';

describe('Agents host nav', () => {
  it('has one group per module in APP_MODULES.agents, in order, and a sound config', () => {
    expect(AGENTS_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.agents]);
    expect(navConfigProblems(AGENTS_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of AGENTS_HOST_NAV.groups ?? []) {
      expect(AGENTS_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(AGENTS_HOST_NAV, view.id)).toBe(group.id);
    }
  });
});
