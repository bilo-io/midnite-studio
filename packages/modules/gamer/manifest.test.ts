import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { gamerManifest } from './manifest';

describe('gamer manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(gamerManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.gamer).toContain(gamerManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of gamerManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = gamerManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect((gamerManifest.views as readonly { id: string }[]).map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
