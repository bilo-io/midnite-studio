import { afterEach, describe, expect, it, vi } from 'vitest';

import { bucketInRange, FOLIAGE_DRAW_DISTANCE_M, groupFoliageByChunk, loadLayers } from './terrain-layers-data';

afterEach(() => vi.unstubAllGlobals());

describe('groupFoliageByChunk', () => {
  const file = {
    version: 1 as const,
    assets: ['pine', 'grass-clump'],
    instances: [
      [0, -400, 1, -400, 0, 1],
      [0, -390, 1, -395, 0.5, 1.1],
      [1, -400, 1, -400, 0, 1],
      [0, 400, 2, 400, 0, 1],
      // On the far edge: clamps into the last chunk rather than a ninth column.
      [0, 512, 3, 512, 0, 1],
    ] as [number, number, number, number, number, number][],
  };

  it('buckets by asset and chunk, packing [x, y, z, yaw, scale]', () => {
    const buckets = groupFoliageByChunk(file, 1024, 8);
    const key = (b: { asset: number; cx: number; cz: number }) => `${b.asset}:${b.cx}:${b.cz}`;
    expect(buckets.map(key).sort()).toEqual(['0:0:0', '0:7:7', '1:0:0'].sort());
    const pines = buckets.find((b) => key(b) === '0:0:0')!;
    expect(pines.instances).toEqual([-400, 1, -400, 0, 1, -390, 1, -395, 0.5, 1.1]);
    expect(pines.centre).toEqual([-448, -448]);
    expect(buckets.find((b) => key(b) === '0:7:7')!.instances.length).toBe(10);
  });

  it('every instance lands in exactly one bucket', () => {
    const buckets = groupFoliageByChunk(file, 1024, 8);
    expect(buckets.reduce((n, b) => n + b.instances.length / 5, 0)).toBe(file.instances.length);
  });
});

describe('bucketInRange', () => {
  const bucket = { asset: 0, cx: 0, cz: 0, centre: [0, 0] as [number, number], instances: [] };
  it('draws a chunk whose nearest edge is within the draw distance', () => {
    expect(bucketInRange(bucket, 128, FOLIAGE_DRAW_DISTANCE_M + 50, 0)).toBe(true);
    expect(bucketInRange(bucket, 128, FOLIAGE_DRAW_DISTANCE_M + 200, 0)).toBe(false);
  });
});

describe('loadLayers', () => {
  it('a missing file is no layer, not an error', async () => {
    const roads = { version: 1, nodes: [], edges: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('roads.json') ? new Response(JSON.stringify(roads)) : new Response('not found', { status: 404 }),
      ),
    );
    const data = await loadLayers('mstudio-file://repo/x/build', 'v1');
    expect(data.roads).toEqual(roads);
    expect(data.buildings).toBeNull();
    expect(data.foliage).toBeNull();
  });

  it('a malformed file is dropped rather than thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 1, instances: 'nope' }))));
    const data = await loadLayers('base', 'v1');
    expect(data).toEqual({ roads: null, buildings: null, foliage: null });
  });
});
