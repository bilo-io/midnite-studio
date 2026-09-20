import { describe, expect, it } from 'vitest';

import { ALL_NAV_ITEMS } from './app';

describe('rail nav order', () => {
  it('places Sessions immediately after Knowledge in ALL_NAV_ITEMS', () => {
    const views = ALL_NAV_ITEMS.map((item) => item.view);
    const knowledgeIndex = views.indexOf('knowledge');
    const sessionsIndex = views.indexOf('sessions');
    expect(knowledgeIndex).toBeGreaterThanOrEqual(0);
    expect(sessionsIndex).toBe(knowledgeIndex + 1);
  });

  it('keeps the four ungrouped rows before the Workspace section', () => {
    expect(ALL_NAV_ITEMS.slice(0, 4).map((item) => item.view)).toEqual([
      'dashboard',
      'notes',
      'knowledge',
      'sessions',
    ]);
  });
});
