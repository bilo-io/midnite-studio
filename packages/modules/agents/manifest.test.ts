import { describe, expect, it } from 'vitest';
import { APP_MODULES, FEATURE_PLACEMENT, FEATURE_VIEWS, MODULE_IDS } from '@midnite/studio-shared';

import { agentsManifest } from './manifest';

describe('agents manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(agentsManifest.module);
  });

  it('is listed by its host', () => {
    expect(APP_MODULES.agents).toContain(agentsManifest.module);
  });

  it('composes placed features and contributes exactly their registered views', () => {
    for (const feature of agentsManifest.features) expect(Object.keys(FEATURE_PLACEMENT)).toContain(feature);
    const registered = agentsManifest.features.flatMap((f) => [...(FEATURE_VIEWS as Record<string, readonly string[]>)[f] ?? []]);
    expect((agentsManifest.views as readonly { id: string }[]).map((v) => v.id).sort()).toEqual(registered.sort());
  });
});
