import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '@midnite/studio-shared';

import { healthManifest } from './manifest';

describe('health manifest', () => {
  it('names a real module id', () => {
    expect(healthManifest.module).toBe('health');
    expect(MODULE_IDS).toContain(healthManifest.module);
  });
});
