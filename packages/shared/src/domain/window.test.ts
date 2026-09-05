import { describe, expect, it } from 'vitest';

import {
  PAGE_WINDOW_ROLES,
  PANEL_WINDOW_ROLES,
  WindowRoleSchema,
  isPageWindowRole,
} from './window';

describe('window roles', () => {
  it('accepts every panel and page role, and main', () => {
    for (const role of ['main', ...PANEL_WINDOW_ROLES, ...PAGE_WINDOW_ROLES]) {
      expect(WindowRoleSchema.safeParse(role).success).toBe(true);
    }
    expect(WindowRoleSchema.safeParse('settings').success).toBe(false);
  });

  /*
    The two sets have to stay disjoint: every consumer branches on
    `isPageWindowRole` to choose between "detaching MOVES this" and "detaching
    DUPLICATES this", and a role in both would get whichever branch ran first.
  */
  it('keeps panels and pages disjoint', () => {
    const overlap = PANEL_WINDOW_ROLES.filter((role) =>
      (PAGE_WINDOW_ROLES as readonly string[]).includes(role),
    );
    expect(overlap).toEqual([]);
  });

  it('classifies pages and not panels or main', () => {
    for (const role of PAGE_WINDOW_ROLES) expect(isPageWindowRole(role)).toBe(true);
    for (const role of PANEL_WINDOW_ROLES) expect(isPageWindowRole(role)).toBe(false);
    expect(isPageWindowRole('main')).toBe(false);
  });
});
