import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GmProgress } from '@midnite/studio-shared';

import { createGmSampleCache, parseSampleSet } from './gm-sample-cache';

const script = `if (typeof(MIDI) === 'undefined') var MIDI = {};
MIDI.Soundfont.acoustic_grand_piano = {
"A0": "data:audio/mp3;base64,QUJD",
"Db3": "data:audio/mp3;base64,REVG"
}`;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gm-cache-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const okFetch = () => vi.fn(async () => new Response(script, { status: 200 }));

describe('parseSampleSet', () => {
  it('reads note names and base64 payloads', () => {
    expect(parseSampleSet(script)).toEqual({ A0: 'QUJD', Db3: 'REVG' });
  });
});

describe('gm sample cache', () => {
  it('downloads once, caches, and reports progress', async () => {
    const fetchMock = okFetch();
    const cache = createGmSampleCache({ directory: dir, fetch: fetchMock as unknown as typeof fetch, baseUrl: 'https://x.test/set' });
    expect((await cache.status()).cached).toEqual([]);
    const events: GmProgress[] = [];
    expect(await cache.ensure(0, (e) => events.push(e))).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://x.test/set/acoustic_grand_piano-mp3.js');
    expect(events[0]).toMatchObject({ program: 0, phase: 'download' });
    expect(events.at(-1)).toMatchObject({ program: 0, phase: 'ready', fraction: 1 });
    expect((await cache.status()).cached).toEqual([0]);
    await cache.ensure(0, () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const loaded = await cache.load(0);
    expect(loaded?.notes).toEqual({ A0: 'QUJD', Db3: 'REVG' });
  });

  it('shares one download between concurrent callers', async () => {
    const fetchMock = okFetch();
    const cache = createGmSampleCache({ directory: dir, fetch: fetchMock as unknown as typeof fetch });
    await Promise.all([cache.ensure(0, () => undefined), cache.ensure(0, () => undefined)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails soft offline and leaves nothing cached', async () => {
    const offline = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const cache = createGmSampleCache({ directory: dir, fetch: offline as unknown as typeof fetch });
    const events: GmProgress[] = [];
    const result = await cache.ensure(5, (e) => events.push(e));
    expect(result.ok).toBe(false);
    expect(events.at(-1)?.phase).toBe('failed');
    expect(await cache.load(5)).toBeNull();
    expect((await cache.status()).cached).toEqual([]);
  });

  it('rejects an HTTP error and an unknown program', async () => {
    const notFound = vi.fn(async () => new Response('no', { status: 404 }));
    const cache = createGmSampleCache({ directory: dir, fetch: notFound as unknown as typeof fetch });
    expect((await cache.ensure(1, () => undefined)).ok).toBe(false);
    expect((await cache.ensure(200, () => undefined)).ok).toBe(false);
  });
});
