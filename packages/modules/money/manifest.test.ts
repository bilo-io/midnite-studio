import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { moneyManifest } from './manifest';

describe('money manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(moneyManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.money).toContain(moneyManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of moneyManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = moneyManifest.features.flatMap((f) => [...((FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? [])]);
    // `views: []` infers `never[]`; widen it so the comparison typechecks.
    expect((moneyManifest.views as readonly { id: string }[]).map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
