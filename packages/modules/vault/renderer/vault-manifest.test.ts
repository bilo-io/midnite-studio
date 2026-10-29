// vitest/jsdom: the manifest is pure data — no browser capability needed.
import { navConfigProblems } from '@midnite/studio-frame';
import { isCommandId } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { VAULT_APP } from './vault-manifest';

describe('VAULT_APP.nav (Phase 123 Theme B)', () => {
  it('lists at least one view, every command a real CommandId', () => {
    expect(VAULT_APP.nav.views.length).toBeGreaterThanOrEqual(1);
    for (const view of VAULT_APP.nav.views) {
      if (view.command !== undefined) expect(isCommandId(view.command)).toBe(true);
    }
    expect(navConfigProblems(VAULT_APP.nav)).toEqual([]);
  });
});
