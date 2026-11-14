// vitest/node: no browser capability needed — holds the toggle table against the composition and the manifests.
import { describe, expect, it } from 'vitest';

import {
  ALWAYS_ON_FEATURE_PACKAGES,
  FEATURE_PACKAGE_FOLDERS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_VIEWS,
  FEATURE_TOGGLE_IDS,
  featureToggle,
  type FeatureManifest,
} from '@midnite/studio-shared';

import { STUDIO_FEATURES } from './composition';

const manifestModules = import.meta.glob('../../../packages/features/*/manifest.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** Each package's manifest, by package name (the folder). */
const MANIFESTS = new Map<string, FeatureManifest>(
  Object.entries(manifestModules).flatMap(([path, mod]) => {
    const name = /features\/([^/]+)\/manifest\.ts$/.exec(path)?.[1];
    const manifest = Object.values(mod).find(
      (value): value is FeatureManifest => typeof value === 'object' && value !== null && 'views' in value && 'ipc' in value,
    );
    return name && manifest ? [[name, manifest] as const] : [];
  }),
);

describe('feature toggles cover the composition', () => {
  it('every composed package is covered by exactly one toggle or listed always-on, with nothing extra', () => {
    const covered = FEATURE_TOGGLE_IDS.flatMap((id) => featureToggle(id).packages);
    const alwaysOn = Object.keys(ALWAYS_ON_FEATURE_PACKAGES);
    const claimed = [...covered, ...alwaysOn];
    // A new package fails here until it gets toggle metadata in `shared/src/feature-toggles.ts` or an always-on reason.
    expect([...claimed].sort()).toEqual([...STUDIO_FEATURES].sort());
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("each toggle's views are exactly what its packages' manifests and folders register", () => {
    expect(MANIFESTS.size).toBe(STUDIO_FEATURES.length);
    for (const id of FEATURE_TOGGLE_IDS) {
      const spec = featureToggle(id);
      const expected = new Set<string>();
      for (const pkg of spec.packages) {
        for (const view of MANIFESTS.get(pkg)?.views ?? []) expected.add(view.id);
        // A view drawn by the app (Books, Media) is registered by its placement folder rather than a manifest.
        const split = (FEATURE_PACKAGE_SPLITS as Record<string, { folder: string }>)[pkg];
        const folders = split ? [split.folder] : ((FEATURE_PACKAGE_FOLDERS as Record<string, readonly string[]>)[pkg] ?? [pkg]);
        for (const folder of folders) for (const view of (FEATURE_VIEWS as Record<string, readonly string[]>)[folder] ?? []) expected.add(view);
      }
      expect([...spec.views].sort(), id).toEqual([...expected].sort());
    }
  });

  it('no always-on package contributes a view', () => {
    for (const pkg of Object.keys(ALWAYS_ON_FEATURE_PACKAGES)) expect(MANIFESTS.get(pkg)?.views ?? []).toEqual([]);
  });
});
