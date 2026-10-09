import { describe, expect, it } from 'vitest';

import { ALL_NAV_ITEMS } from './app';

describe('rail nav order', () => {
  it('places Chats directly above Sessions, and Knowledge directly under Sessions', () => {
    const views = ALL_NAV_ITEMS.map((item) => item.view);
    const chats = views.indexOf('chats');
    expect(chats).toBeGreaterThanOrEqual(0);
    expect(views.indexOf('sessions')).toBe(chats + 1);
    expect(views.indexOf('knowledge')).toBe(chats + 2);
  });

  it('keeps the five ungrouped rows before the Workspace section: Notes, Chats, Sessions, Knowledge', () => {
    expect(ALL_NAV_ITEMS.slice(0, 5).map((item) => item.view)).toEqual([
      'dashboard',
      'notes',
      'chats',
      'sessions',
      'knowledge',
    ]);
  });
});
