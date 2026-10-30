import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { browserManifest } from './manifest';

describe('browser manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(browserManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.browser).toContain(browserManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of browserManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = browserManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect((browserManifest.views as readonly { id: string }[]).map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
