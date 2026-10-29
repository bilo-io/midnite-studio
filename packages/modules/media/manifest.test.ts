import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { mediaManifest } from './manifest';

describe('media manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(mediaManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.media).toContain(mediaManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of mediaManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = mediaManifest.features.flatMap((f) => [...((FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? [])]);
    expect(mediaManifest.views.map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
