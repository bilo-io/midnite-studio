// vitest/jsdom: the app's manifest against the placement map and the Creator module's own. The composition
// (shell, tabs, host ports) is tested where it lives, in `packages/modules/creator/renderer/`.
import { describe, expect, it } from 'vitest';

import { creatorManifest } from '@midnite/studio-module-creator/manifest';
import { FEATURE_PACKAGE_SPLITS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { CreatorApp } from './creator-app';
import { CREATOR_APP, CREATOR_TABS } from './creator-manifest';

describe('Creator app', () => {
  it('owns the media folder, and composes its shell plus the tab packages placed with it', () => {
    expect(placementOwners(FEATURE_PLACEMENT.media)[0]).toBe(CREATOR_APP.id);
    for (const pkg of ['media-docs', 'media-images', 'media-audio', 'media-video'] as const) {
      expect(FEATURE_PACKAGE_SPLITS[pkg].placement).toBe(CREATOR_APP.id);
    }
  });

  it("wears the launcher catalog's accent, registers its tabs in strip order and mounts the Creator module", () => {
    expect(CREATOR_APP.accent).toBe('#ec4899');
    expect(CREATOR_APP.accent).toBe(creatorManifest.accent);
    expect([...new Set(CREATOR_APP.features)]).toEqual([...creatorManifest.features]);
    expect(CREATOR_TABS.map((t) => t.id)).toEqual(['doc', 'image', 'video', 'audio']);
    expect(typeof CreatorApp).toBe('function');
  });
});
