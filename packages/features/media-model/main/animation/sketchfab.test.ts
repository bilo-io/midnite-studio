// @vitest-environment node
// vitest (node): the Sketchfab client over an injected fetch — search, download chain, error statuses, cancel, oversize and where the token goes.
import { describe, expect, it, vi } from 'vitest';

import { createSketchfabClient, licenceFromSketchfab, SketchfabError } from './sketchfab';

/** A made-up token: the tests assert on where it travels, never on a real one. */
const TOKEN = 'test-token-0000';
const UID = 'a'.repeat(32);
const UID2 = 'b'.repeat(32);

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const model = (uid: string, slug: string, label: string, extra: Record<string, unknown> = {}) => ({
  uid,
  name: `Walk ${uid.slice(0, 2)}`,
  license: { slug, label },
  user: { displayName: 'Ada' },
  viewerUrl: `https://sketchfab.com/3d-models/walk-${uid}`,
  thumbnails: { images: [{ url: 'https://media.sketchfab.com/big.jpeg', width: 1920 }, { url: 'https://media.sketchfab.com/small.jpeg', width: 256 }, { url: 'http://insecure.example/x.jpeg', width: 300 }] },
  animationCount: 2,
  faceCount: 1000,
  isDownloadable: true,
  ...extra,
});

type Call = { url: string; headers: Record<string, string>; redirect?: string };
const harness = (respond: (url: string, call: Call) => Response | Promise<Response>, deps: Partial<Parameters<typeof createSketchfabClient>[0]> = {}) => {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), headers: { ...(init?.headers as Record<string, string>) }, redirect: init?.redirect };
    calls.push(call);
    return respond(call.url, call);
  });
  const client = createSketchfabClient({ readToken: async () => TOKEN, fetch: fetchMock as unknown as typeof fetch, ...deps });
  return { client, calls };
};

describe('licenceFromSketchfab', () => {
  it('maps slugs and labels to the library ids, and refuses terms the library does not take', () => {
    expect(licenceFromSketchfab({ slug: 'by-sa' })).toBe('cc-by-sa');
    expect(licenceFromSketchfab({ label: 'CC0 Public Domain' })).toBe('cc0');
    expect(licenceFromSketchfab({ label: 'CC Attribution' })).toBe('cc-by');
    expect(licenceFromSketchfab({ slug: 'by-nd', label: 'CC Attribution-NoDerivs' })).toBeNull();
    expect(licenceFromSketchfab({ slug: 'st', label: 'Standard' })).toBeNull();
    expect(licenceFromSketchfab(null)).toBeNull();
  });
});

describe('search', () => {
  it('asks the API for animated, downloadable models in the ticked licence and parses the page', async () => {
    const { client, calls } = harness(() => json({ results: [model(UID, 'by', 'CC Attribution')], cursors: { next: '24' } }));
    const page = await client.search({ q: ' walk ', licences: ['cc-by'] });
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.sketchfab.com/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: 'models', animated: 'true', downloadable: 'true', license: 'by', q: 'walk' });
    expect(page.results).toEqual([
      {
        uid: UID,
        name: `Walk ${UID.slice(0, 2)}`,
        author: 'Ada',
        licence: 'cc-by',
        thumbnailUrl: 'https://media.sketchfab.com/small.jpeg',
        viewUrl: `https://sketchfab.com/3d-models/walk-${UID}`,
        animationCount: 2,
        faceCount: 1000,
      },
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('asks once per ticked licence, merges, and pages each licence by its own cursor', async () => {
    const { client, calls } = harness((url) => {
      const u = new URL(url);
      const slug = u.searchParams.get('license');
      if (slug === 'by') return json({ results: [model(UID, 'by', 'CC Attribution')], cursors: { next: '12' } });
      return json({ results: [model(UID2, 'cc0', 'CC0 Public Domain')], cursors: { next: null } });
    });
    const first = await client.search({ q: 'walk', licences: ['cc0', 'cc-by'] });
    expect(first.results.map((r) => r.licence).sort()).toEqual(['cc-by', 'cc0']);
    expect(calls).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await client.search({ q: 'walk', licences: ['cc0', 'cc-by'], cursor: first.nextCursor! });
    // Only the licence that still had pages is asked again, from its cursor.
    expect(calls).toHaveLength(3);
    expect(new URL(calls[2]!.url).searchParams.get('license')).toBe('by');
    expect(new URL(calls[2]!.url).searchParams.get('cursor')).toBe('12');
    expect(second.results).toHaveLength(1);
  });

  it('drops a result whose licence is not the one asked for, one marked not downloadable, and a malformed one', async () => {
    const { client } = harness(() =>
      json({ results: [model(UID, 'by-nd', 'CC Attribution-NoDerivs'), model(UID2, 'by', 'CC Attribution', { isDownloadable: false }), { nope: true }, model('c'.repeat(32), 'by', 'CC Attribution')], cursors: {} }),
    );
    const page = await client.search({ q: '', licences: ['cc-by'] });
    expect(page.results.map((r) => r.uid)).toEqual(['c'.repeat(32)]);
    expect(page.nextCursor).toBeNull();
  });

  it('with no token says so and never issues a request', async () => {
    const { client, calls } = harness(() => json({}), { readToken: async () => null });
    await expect(client.search({ q: 'x', licences: ['cc0'] })).rejects.toMatchObject({ kind: 'no-token' });
    expect(calls).toHaveLength(0);
    expect(await client.hasToken()).toBe(false);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'bad-response'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const { client } = harness(() => new Response('{}', { status, headers: { 'retry-after': '7' } }));
    await expect(client.search({ q: 'x', licences: ['cc0'] })).rejects.toMatchObject({ kind });
  });

  it('names the wait on a 429 and rejects an unreadable body', async () => {
    const limited = harness(() => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }));
    await expect(limited.client.search({ q: 'x', licences: ['cc0'] })).rejects.toThrow(/7s/);
    const junk = harness(() => new Response('<html>', { status: 200 }));
    await expect(junk.client.search({ q: 'x', licences: ['cc0'] })).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('turns a dropped connection and a timeout into user-facing errors', async () => {
    const down = harness(() => {
      throw new TypeError('fetch failed');
    });
    await expect(down.client.search({ q: 'x', licences: ['cc0'] })).rejects.toMatchObject({ kind: 'network' });
    // A real fetch rejects when its signal aborts; model that so the timeout path runs.
    const abortable = createSketchfabClient({
      readToken: async () => TOKEN,
      timeoutMs: 5,
      fetch: ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch,
    });
    await expect(abortable.search({ q: 'x', licences: ['cc0'] })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('token handling', () => {
  it('sends the token only on https://api.sketchfab.com requests and never on the signed file fetch', async () => {
    const { client, calls } = harness((url) => {
      if (url.endsWith(`/v3/models/${UID}`)) return json(model(UID, 'by', 'CC Attribution'));
      if (url.endsWith('/download')) return json({ glb: { url: 'https://sketchfab-prod-media.s3.amazonaws.com/x.glb?sig=1', size: 4 } });
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    });
    await client.download(UID);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['api.sketchfab.com', 'api.sketchfab.com', 'sketchfab-prod-media.s3.amazonaws.com']);
    expect(calls[0]!.headers.Authorization).toBe(`Token ${TOKEN}`);
    expect(calls[1]!.headers.Authorization).toBe(`Token ${TOKEN}`);
    expect(calls[2]!.headers).not.toHaveProperty('Authorization');
    // Redirects are an error, so a header can never follow one to another host.
    expect(calls.every((c) => c.redirect === 'error')).toBe(true);
    expect(calls.every((c) => c.url.startsWith('https://'))).toBe(true);
  });

  it('does not put the token in an error message', async () => {
    const { client } = harness(() => new Response('{}', { status: 401 }));
    const error = await client.search({ q: 'x', licences: ['cc0'] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SketchfabError);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });
});

describe('download', () => {
  const chain = (file: Response | (() => Response), glb: Record<string, unknown> | null = { url: 'https://s3.amazonaws.com/x.glb', size: 4 }, licence = model(UID, 'by-sa', 'CC Attribution-ShareAlike')) =>
    harness((url) => {
      if (url.endsWith(`/v3/models/${UID}`)) return json(licence);
      if (url.endsWith('/download')) return json(glb ? { glb } : {});
      return typeof file === 'function' ? file() : file;
    });

  it('reads the model, takes the GLB link and returns the bytes with the model\'s name, author and licence', async () => {
    const { client } = chain(new Response(new Uint8Array([1, 2, 3, 4])));
    const got = await client.download(UID);
    expect(got).toMatchObject({ uid: UID, author: 'Ada', licence: 'cc-by-sa', viewUrl: `https://sketchfab.com/3d-models/walk-${UID}` });
    expect([...got.bytes]).toEqual([1, 2, 3, 4]);
  });

  it('refuses a model under terms the library does not take, before asking for a download link', async () => {
    const { client, calls } = chain(new Response(''), undefined, model(UID, 'by-nd', 'CC Attribution-NoDerivs'));
    await expect(client.download(UID)).rejects.toMatchObject({ kind: 'unsupported' });
    expect(calls).toHaveLength(1);
  });

  it('403 on the download link means not downloadable', async () => {
    const { client } = harness((url) => (url.endsWith('/download') ? new Response('{}', { status: 403 }) : json(model(UID, 'by', 'CC Attribution'))));
    await expect(client.download(UID)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('refuses a model with no GLB, and a link off https or off Sketchfab\'s storage', async () => {
    await expect(chain(new Response(''), null).client.download(UID)).rejects.toMatchObject({ kind: 'unsupported' });
    await expect(chain(new Response(''), { url: 'http://s3.amazonaws.com/x.glb' }).client.download(UID)).rejects.toMatchObject({ kind: 'bad-response' });
    await expect(chain(new Response(''), { url: 'https://evil.example/x.glb' }).client.download(UID)).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('refuses an oversize file by its declared size, and by the bytes actually read', async () => {
    const small = createSketchfabClient({
      readToken: async () => TOKEN,
      maxBytes: 10,
      fetch: (async (u: string) => (String(u).endsWith(`/v3/models/${UID}`) ? json(model(UID, 'by', 'CC Attribution')) : json({ glb: { url: 'https://s3.amazonaws.com/x.glb', size: 999 } }))) as unknown as typeof fetch,
    });
    await expect(small.download(UID)).rejects.toMatchObject({ kind: 'oversize' });
    const liar = createSketchfabClient({
      readToken: async () => TOKEN,
      maxBytes: 10,
      fetch: (async (u: string) => {
        if (String(u).endsWith(`/v3/models/${UID}`)) return json(model(UID, 'by', 'CC Attribution'));
        if (String(u).endsWith('/download')) return json({ glb: { url: 'https://s3.amazonaws.com/x.glb', size: 5 } });
        return new Response(new Uint8Array(64));
      }) as unknown as typeof fetch,
    });
    await expect(liar.download(UID)).rejects.toMatchObject({ kind: 'oversize' });
  });

  it('cancels: an aborted signal rejects as cancelled and issues no request', async () => {
    const { client, calls } = chain(new Response(new Uint8Array(4)));
    const controller = new AbortController();
    controller.abort();
    await expect(client.download(UID, controller.signal)).rejects.toMatchObject({ kind: 'cancelled' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed id without a request', async () => {
    const { client, calls } = chain(new Response(''));
    await expect(client.download('../etc')).rejects.toMatchObject({ kind: 'bad-response' });
    expect(calls).toHaveLength(0);
  });
});
