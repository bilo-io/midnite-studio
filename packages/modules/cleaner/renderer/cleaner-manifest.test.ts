// vitest/jsdom: the manifest is pure data — no browser capability needed.
import { navConfigProblems } from '@midnite/studio-frame';
import { isCommandId } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { CLEANER_APP } from './cleaner-manifest';

describe('CLEANER_APP.nav (Phase 123 Theme B)', () => {
  it('lists at least one view, every command a real CommandId', () => {
    expect(CLEANER_APP.nav.views.length).toBeGreaterThanOrEqual(1);
    for (const view of CLEANER_APP.nav.views) {
      if (view.command !== undefined) expect(isCommandId(view.command)).toBe(true);
    }
    expect(navConfigProblems(CLEANER_APP.nav)).toEqual([]);
  });
});
