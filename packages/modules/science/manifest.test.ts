import { describe, expect, it } from 'vitest';
import { MODULE_IDS } from '@midnite/studio-shared';

import { scienceManifest } from './manifest';

describe('science manifest', () => {
  it('names a real module id', () => {
    expect(scienceManifest.module).toBe('science');
    expect(MODULE_IDS).toContain(scienceManifest.module);
  });
});
