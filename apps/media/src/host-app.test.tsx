// vitest/jsdom: the host's rail composition and view router — nothing here needs a real browser.
import { describe, expect, it } from 'vitest';

import { moduleOfView, navConfigProblems } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { MEDIA_PANES } from './host-app';
import { MEDIA_HOST_NAV } from './host-nav';

describe('Media host nav', () => {
  it('has one group per module in APP_MODULES.media, in order, and a sound config', () => {
    expect(MEDIA_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.media]);
    expect(navConfigProblems(MEDIA_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of MEDIA_HOST_NAV.groups ?? []) {
      expect(MEDIA_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(MEDIA_HOST_NAV, view.id)).toBe(group.id);
    }
  });
});
