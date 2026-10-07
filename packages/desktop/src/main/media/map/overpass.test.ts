import { describe, expect, it, vi } from 'vitest';

import { MAP_ROADS_BUSY } from '@midnite/studio-shared';

import { createOverpassClient, OVERPASS_DEFAULT_RETRY_S, OVERPASS_URL, overpassQuery, type OverpassResponseLike } from './overpass';

const reply = (status: number, body = '{"elements":[]}', headers: Record<string, string> = {}): OverpassResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n) => headers[n.toLowerCase()] ?? null },
  arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
});
const BBOX = [18.3, -34.1, 18.5, -33.9] as const;
const signal = () => new AbortController().signal;

describe('overpass', () => {
  it('builds one query in (S,W,N,E) order with the highway filter', () => {
    const q = overpassQuery(BBOX);
    expect(q).toContain('[out:json][timeout:60];way["highway"~"^(motorway|trunk');
    expect(q).toContain('(-34.1000000,18.3000000,-33.9000000,18.5000000);(._;>;);out body;');
  });

  it('POSTs once with a User-Agent and parses the JSON', async () => {
    const fetch = vi.fn(async () => reply(200, '{"elements":[{"type":"node","id":1,"lat":0,"lon":0}]}'));
    const client = createOverpassClient({ fetch, userAgent: 'UA/1' });
    const got = await client.query(BBOX, signal());
    expect(got).toEqual({ ok: true, osm: { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(OVERPASS_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['User-Agent']).toBe('UA/1');
    expect(init.body.startsWith('data=')).toBe(true);
  });

  it('retries a 429 once after Retry-After, then gives up as busy', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => reply(429, '', { 'retry-after': '3' }));
    const client = createOverpassClient({ fetch, userAgent: 'UA', sleep });
    expect(await client.query(BBOX, signal())).toEqual({ ok: false, reason: MAP_ROADS_BUSY });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('a 504 then a 200 succeeds, waiting the default delay', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi.fn().mockResolvedValueOnce(reply(504)).mockResolvedValueOnce(reply(200));
    const client = createOverpassClient({ fetch, userAgent: 'UA', sleep });
    expect((await client.query(BBOX, signal())).ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(OVERPASS_DEFAULT_RETRY_S * 1000);
  });

  it('reports network errors, oversized and unreadable bodies, and aborts', async () => {
    const net = createOverpassClient({ fetch: async () => Promise.reject(new Error('offline')), userAgent: 'UA' });
    expect(await net.query(BBOX, signal())).toMatchObject({ ok: false, reason: expect.stringMatching(/Could not reach/) });
    const big = createOverpassClient({ fetch: async () => reply(200, '{}', { 'content-length': String(65 * 1024 * 1024) }), userAgent: 'UA' });
    expect(await big.query(BBOX, signal())).toMatchObject({ ok: false, reason: expect.stringMatching(/too large/) });
    const junk = createOverpassClient({ fetch: async () => reply(200, '<html>'), userAgent: 'UA' });
    expect(await junk.query(BBOX, signal())).toMatchObject({ ok: false, reason: expect.stringMatching(/could not be read/) });
    const ac = new AbortController();
    ac.abort();
    const aborted = createOverpassClient({ fetch: async () => reply(200), userAgent: 'UA' });
    expect(await aborted.query(BBOX, ac.signal)).toMatchObject({ ok: false, aborted: true });
  });
});
