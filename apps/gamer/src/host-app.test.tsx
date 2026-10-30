// vitest/jsdom: the host's rail composition and view router — nothing here needs a real browser.
import { describe, expect, it } from 'vitest';

import { moduleOfView, navConfigProblems } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { GAMER_PANES } from './host-app';
import { GAMER_HOST_NAV } from './host-nav';

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
