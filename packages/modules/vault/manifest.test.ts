import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { vaultManifest } from './manifest';

describe('vault manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(vaultManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.vanguard).toContain(vaultManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of vaultManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = vaultManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect(vaultManifest.views.map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
