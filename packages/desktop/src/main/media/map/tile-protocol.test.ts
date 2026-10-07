import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ protocol: { handle: vi.fn() } }));

import { MAP_SOURCES } from '@midnite/studio-shared';

import { createTileHandler, mapSourceStatuses } from './tile-protocol';
import type { TileFetcher } from './tile-fetch';

const KEY = 'sekret-key-123';

function setup(key: string | null) {
  const urls: string[] = [];
  const logs: string[] = [];
  const fetcher: TileFetcher = {
    fetch: async (_k, url) => {
      urls.push(url);
      return { ok: true, bytes: new Uint8Array([1, 2, 3]), fromCache: false };
    },
  };
  const handle = createTileHandler({ fetcher, readKey: async () => key, log: (l) => logs.push(l) });
  return { handle, urls, logs };
}

describe('mstudio-tile handler', () => {
  it('serves a keyless tile with encoding content type', async () => {
    const { handle, urls } = setup(null);
    const res = await handle('mstudio-tile://aws-terrarium/3/2/1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(urls[0]).toContain('/terrarium/3/2/1.png');
  });

  it('injects the key upstream and never leaks it', async () => {
    const { handle, urls, logs } = setup(KEY);
    const res = await handle('mstudio-tile://maptiler-satellite/3/2/1');
    expect(res.status).toBe(200);
    expect(urls[0]).toContain(KEY);
    const seen = JSON.stringify([...res.headers.entries()]) + (await res.text()) + logs.join('\n');
    expect(seen).not.toContain(KEY);
  });

  it('answers 403 with an empty body for a keyed source without a key', async () => {
    const { handle, urls } = setup(null);
    const res = await handle('mstudio-tile://maptiler-satellite/3/2/1');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(urls).toHaveLength(0);
  });

  it('answers 404 for unknown sources, bad paths and out-of-range tiles', async () => {
    const { handle } = setup(null);
    expect((await handle('mstudio-tile://nope/1/0/0')).status).toBe(404);
    expect((await handle('mstudio-tile://aws-terrarium/garbage')).status).toBe(404);
    expect((await handle('mstudio-tile://aws-terrarium/1/5/0')).status).toBe(404);
  });

  it('reports keyed sources unavailable without a key', async () => {
    const statuses = await mapSourceStatuses(async () => null);
    expect(statuses).toHaveLength(MAP_SOURCES.length);
    const keyed = statuses.find((s) => s.id === 'maptiler-satellite');
    expect(keyed).toMatchObject({ available: false });
    expect(JSON.stringify(statuses)).not.toContain(KEY);
  });
});
