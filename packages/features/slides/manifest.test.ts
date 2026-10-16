import { FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { slidesManifest } from './manifest';

/** The template's contract: manifest and placement agree, and there is nothing on the wire. */
describe('slides manifest', () => {
  it('is placed with Creator', () => {
    expect(placementOwners(FEATURE_PLACEMENT[slidesManifest.feature])[0]).toBe(slidesManifest.owner);
    expect(slidesManifest.owner).toBe('creator');
  });

  it('is a modal, not a view, with no channel — a deck is a viewer over text it is handed', () => {
    expect(slidesManifest.views).toEqual([]);
    expect(slidesManifest.ipc).toEqual([]);
    expect(slidesManifest.events).toEqual([]);
  });
});
