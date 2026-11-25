import { describe, expect, it } from 'vitest';

import { DEFAULT_ASSET_LIBRARY_ROOT, GameLibraryListingSchema, GameLibraryReadRequestSchema } from './game-asset-library';

const asset = { path: 'a.glb', category: 'models', source: 's', bytes: 5, sha256: 'x', name: 'a', kind: 'model' };
const collection = { id: 'gtact', title: 'GTACT', origin: 'catalog', totalBytes: 5, warning: null, assets: [asset] };

describe('game asset library schemas', () => {
  it('round-trips a listing', () => {
    const listing = { root: '/lib', exists: true, collections: [collection] };
    expect(GameLibraryListingSchema.parse(listing)).toEqual(listing);
  });

  it('rejects an unknown kind and an empty read path', () => {
    const bad = { root: '/', exists: true, collections: [{ ...collection, assets: [{ ...asset, kind: 'weird' }] }] };
    expect(GameLibraryListingSchema.safeParse(bad).success).toBe(false);
    expect(GameLibraryReadRequestSchema.safeParse({ collection: 'c', path: '' }).success).toBe(false);
    expect(DEFAULT_ASSET_LIBRARY_ROOT).toBe('~/GameDev/midnite-assets');
  });
});
