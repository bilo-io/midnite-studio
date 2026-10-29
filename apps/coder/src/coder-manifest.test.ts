// vitest/jsdom: the manifest is pure data — no browser capability needed.
import { navConfigProblems } from '@midnite/studio-frame';
import { isCommandId } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { CODER_APP } from './coder-manifest';

describe('CODER_APP.nav (Phase 123 Theme B)', () => {
  it('lists at least one view, every command a real CommandId', () => {
    expect(CODER_APP.nav.views.length).toBeGreaterThanOrEqual(1);
    for (const view of CODER_APP.nav.views) {
      if (view.command !== undefined) expect(isCommandId(view.command)).toBe(true);
    }
    expect(navConfigProblems(CODER_APP.nav)).toEqual([]);
  });
});
