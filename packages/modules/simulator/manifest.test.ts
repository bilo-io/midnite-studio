import { describe, expect, it } from 'vitest';
import { APP_MODULES, MODULE_IDS } from '@midnite/studio-shared';

import { simulatorManifest } from './manifest';

describe('simulator manifest', () => {
  it('names a real module id that the Science host mounts', () => {
    expect(simulatorManifest.module).toBe('simulator');
    expect(MODULE_IDS).toContain(simulatorManifest.module);
    expect(APP_MODULES.science).toContain('simulator');
  });
});
