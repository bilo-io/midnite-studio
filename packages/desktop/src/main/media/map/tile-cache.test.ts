import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTileCache, safeCacheKey } from './tile-cache';

const MB = 1024 * 1024;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'map-cache-'));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('tile cache', () => {
  it('round-trips a tile', async () => {
    const cache = createTileCache({ root, capMB: 10 });
    await cache.put('s/1/0/0.png', new Uint8Array([9, 8]));
    expect([...(await cache.get('s/1/0/0.png'))!]).toEqual([9, 8]);
    expect(await cache.get('s/1/0/1.png')).toBeNull();
  });

  it('evicts least-recently read first, down to 90% of the cap', async () => {
    let t = 1000;
    const cache = createTileCache({ root, capMB: 1, now: () => (t += 10) });
    const tile = new Uint8Array(300 * 1024);
    await cache.put('s/1/0/0.png', tile);
    await cache.put('s/1/0/1.png', tile);
    await cache.put('s/1/0/2.png', tile);
    await cache.get('s/1/0/0.png'); // 0 is now the freshest
    await cache.put('s/1/0/3.png', tile); // 1200 KB > 1 MB → evict
    const status = await cache.status();
    expect(status.bytes).toBeLessThanOrEqual(0.9 * MB);
    expect(await cache.get('s/1/0/1.png')).toBeNull();
    expect(await cache.get('s/1/0/0.png')).not.toBeNull();
  });

  it('clear leaves status at zero', async () => {
    const cache = createTileCache({ root, capMB: 10 });
    await cache.put('s/1/0/0.png', new Uint8Array(10));
    await cache.clear();
    expect(await cache.status()).toMatchObject({ bytes: 0, tiles: 0 });
  });

  it('refuses unsafe keys', () => {
    expect(safeCacheKey('../x')).toBe(false);
    expect(safeCacheKey('/x')).toBe(false);
    expect(safeCacheKey('s/1/0/0.png')).toBe(true);
  });
});
