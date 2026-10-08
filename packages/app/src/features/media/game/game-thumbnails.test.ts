import { allStarterIds } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { thumbnailCoverage, thumbnailFor } from './game-thumbnails';

describe('game starter thumbnails', () => {
  it('resolves every starter to a thumbnail url or an explicit null fallback', () => {
    const coverage = thumbnailCoverage();
    expect(coverage.map((c) => c.id)).toEqual(allStarterIds());
    for (const { id, url } of coverage) {
      expect(url === null || (typeof url === 'string' && url.length > 0), id).toBe(true);
    }
  });

  it('has a thumbnail for every perspective base', () => {
    for (const id of ['platformer', 'top-down', 'isometric', 'raycaster', 'first-person', 'third-person']) {
      expect(thumbnailFor(id), id).not.toBeNull();
    }
  });

  it('has no orphan thumbnail files for ids that are not starters', () => {
    const ids = new Set(allStarterIds());
    const withThumb = thumbnailCoverage().filter((c) => c.url !== null);
    expect(withThumb.length).toBe(15);
    expect(withThumb.every((c) => ids.has(c.id))).toBe(true);
  });

  it('returns null for an unknown id', () => {
    expect(thumbnailFor('nope@nowhere')).toBeNull();
  });
});
