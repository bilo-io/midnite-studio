import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { mindManifest } from './manifest';

describe('mind manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(mindManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.mind).toContain(mindManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of mindManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = mindManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect((mindManifest.views as readonly { id: string }[]).map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
