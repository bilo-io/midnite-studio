import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { monitorManifest } from './manifest';

describe('monitor manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(monitorManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.vanguard).toContain(monitorManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of monitorManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = monitorManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect(monitorManifest.views.map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
