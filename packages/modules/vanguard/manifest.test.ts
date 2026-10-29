import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { vanguardManifest } from './manifest';

describe('vanguard manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(vanguardManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.vanguard).toContain(vanguardManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of vanguardManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = vanguardManifest.features.flatMap((f) => [...((FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? [])]);
    expect(vanguardManifest.views.map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
