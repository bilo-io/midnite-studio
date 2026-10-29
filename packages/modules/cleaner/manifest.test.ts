import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { cleanerManifest } from './manifest';

describe('cleaner manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(cleanerManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.vanguard).toContain(cleanerManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of cleanerManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = cleanerManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect(cleanerManifest.views.map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
