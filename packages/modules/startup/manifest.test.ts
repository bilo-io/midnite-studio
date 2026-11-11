import { describe, expect, it } from 'vitest';
import { APP_MODULES, MODULE_IDS } from '@midnite/studio-shared';

import { startupManifest } from './manifest';

describe('startup manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(startupManifest.module);
  });

  it('is listed by its host, first', () => {
    expect(APP_MODULES.startup[0]).toBe(startupManifest.module);
  });

  it('composes no feature package: its code lives in the module', () => {
    expect(startupManifest.features).toEqual([]);
    expect(startupManifest.views).toEqual([]);
  });
});
