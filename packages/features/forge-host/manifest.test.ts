import { describe, expect, it } from 'vitest';

import { featurePackagePlacement } from '@midnite/studio-shared';

import { forgeHostManifest } from './manifest';

describe('forge-host manifest', () => {
  it('is placed with the coder app until the git app exists, and contributes no view yet', () => {
    expect(featurePackagePlacement('forge-host')).toBe(forgeHostManifest.owner);
    expect(forgeHostManifest.views).toEqual([]);
  });
});
