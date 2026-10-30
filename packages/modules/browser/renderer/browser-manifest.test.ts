// vitest/jsdom: the manifest is pure data — no browser capability needed.
import { navConfigProblems } from '@midnite/studio-frame';
import { describe, expect, it } from 'vitest';

import { BROWSER_APP } from './browser-manifest';

describe('BROWSER_APP.nav (Phase 123 Theme H)', () => {
  it('lists its home view and is a valid nav', () => {
    expect(BROWSER_APP.nav.views.map((v) => v.id)).toContain(BROWSER_APP.home);
    expect(navConfigProblems(BROWSER_APP.nav)).toEqual([]);
  });
});
