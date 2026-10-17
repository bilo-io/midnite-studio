// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapRuntime, type MapRuntimeDeps } from './map-runtime';

let userData: string;
beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'map-runtime-'));
});
afterEach(() => rm(userData, { recursive: true, force: true }));

/** Deps that touch nothing outside the temp dir: no network, no worker, no decoder. */
const deps = (over: Partial<MapRuntimeDeps> = {}): MapRuntimeDeps => ({
  readText: async () => ({ ok: false, kind: 'error', message: 'none' }),
  writeText: async () => ({ ok: true, value: undefined }),
  rootFor: async () => null,
  userData,
  fetch: async () => {
    throw new Error('the network must not be reached');
  },
  userAgent: 'Test/1',
  readKey: async () => null,
  nativeDecode: async () => null,
  spawnCaptureWorker: () => {
    throw new Error('no worker in a unit test');
  },
  onChanged: () => undefined,
  emitProgress: () => undefined,
  ...over,
});

describe('createMapRuntime', () => {
  it('reports a keyed source unavailable without a key, and never carries the key', async () => {
    const withKey = createMapRuntime(deps({ readKey: async () => 'sekret' }));
    const none = createMapRuntime(deps());
    const keyed = (await withKey.sources()).filter((s) => s.available);
    const bare = (await none.sources()).filter((s) => s.available);
    expect(keyed.length).toBeGreaterThan(bare.length);
    expect(JSON.stringify(await withKey.sources())).not.toContain('sekret');
  });

  it('reads the cache lazily under userData, and persists a cap change', async () => {
    const runtime = createMapRuntime(deps());
    const status = await runtime.cache({ op: 'status' });
    expect(status).toMatchObject({ ok: true });
    const capped = await runtime.cache({ op: 'set-cap', capMB: 512 });
    expect(capped).toMatchObject({ ok: true, value: { capMB: 512 } });
    expect(JSON.parse(await readFile(join(userData, 'map-settings.json'), 'utf8'))).toMatchObject({ cacheCapMB: 512 });
  });

  it('installs the tile scheme through the handler it is given, and ends the worker on dispose without spawning one', () => {
    const handle = vi.fn();
    const runtime = createMapRuntime(deps());
    runtime.installProtocol(handle);
    expect(handle).toHaveBeenCalledWith('mstudio-tile', expect.any(Function));
    expect(() => runtime.dispose()).not.toThrow();
  });
});
