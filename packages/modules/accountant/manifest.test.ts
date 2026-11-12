import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, MODULE_IDS } from '@midnite/studio-shared';

import { accountantManifest } from './manifest';

describe('accountant manifest', () => {
  it('names a real module id, and Money lists it', () => {
    expect(MODULE_IDS).toContain(accountantManifest.module);
    expect(APP_MODULES.money).toContain(accountantManifest.module);
  });

  it('composes exactly the ledger feature, which is placed', () => {
    expect(accountantManifest.features).toEqual(['ledger']);
    expect(Object.keys(FEATURE_PLACEMENT)).toContain('ledger');
  });

  it('carries the glyph the launcher tile uses', () => {
    expect(accountantManifest.glyph).toBe('PiCalculatorFill');
  });
});
