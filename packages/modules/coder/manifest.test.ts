import { describe, expect, it } from 'vitest';
import { APP_MODULES, MODULE_IDS } from '@midnite/studio-shared';

import { CODER_HOME, CODER_VIEWS, coderManifest } from './manifest';

describe('coder manifest', () => {
  it('names a real module id that a host mounts', () => {
    expect(MODULE_IDS).toContain(coderManifest.module);
    expect(Object.values(APP_MODULES).some((modules) => modules.includes(coderManifest.module))).toBe(true);
  });

  it('opens on a view it lists, one manifest view per tab', () => {
    expect(CODER_VIEWS).toContain(CODER_HOME);
    expect(coderManifest.views.map((v) => v.id)).toEqual([...CODER_VIEWS]);
  });
});
