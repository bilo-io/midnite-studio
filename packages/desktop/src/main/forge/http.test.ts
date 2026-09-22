import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetForgeHttpBudgetForTests, forgeHttpRequest } from './http';

describe('forgeHttpRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetForgeHttpBudgetForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('builds a bearer Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.example.com/thing',
      auth: { kind: 'bearer', token: 'secret-token' },
    });
    expect(result.ok).toBe(true);
  });

  it('builds a Basic Authorization header from username and password', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      const expected = `Basic ${Buffer.from('alice:app-password', 'utf8').toString('base64')}`;
      expect((init.headers as Record<string, string>)['Authorization']).toBe(expected);
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/user',
      auth: { kind: 'basic', username: 'alice', password: 'app-password' },
    });
  });

  it('appends query parameters and drops undefined values', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const target = url as URL;
      expect(target.searchParams.get('pagelen')).toBe('20');
      expect(target.searchParams.has('cursor')).toBe(false);
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests',
      auth: { kind: 'none' },
      query: { pagelen: 20, cursor: undefined },
    });
  });

  it('treats a non-2xx as a settled result carrying the provider message', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Not found' } }), {
          status: 404,
          statusText: 'Not Found',
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/999',
      auth: { kind: 'none' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe('Not found');
    }
  });

  it('reports a transport failure with a null status', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;

    const result = await forgeHttpRequest({
      method: 'GET',
      url: 'https://unreachable.example.com/thing',
      auth: { kind: 'none' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBeNull();
  });

  it('rejects an unparseable URL without calling fetch', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await forgeHttpRequest({ method: 'GET', url: 'not a url', auth: { kind: 'none' } });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns raw text for responseType: text', async () => {
    globalThis.fetch = vi.fn(async () => new Response('line one\nline two', { status: 200 })) as unknown as
      typeof fetch;

    const result = await forgeHttpRequest<string>({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pipelines/1/steps/x/log',
      auth: { kind: 'none' },
      responseType: 'text',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('line one\nline two');
  });

  it('retries once on a 429 with a short Retry-After, then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/user',
      auth: { kind: 'none' },
    });
    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('does not retry a 429 with no Retry-After — it settles as a failure', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response('rate limited', { status: 429 });
    }) as unknown as typeof fetch;

    const result = await forgeHttpRequest({
      method: 'GET',
      url: 'https://api.bitbucket.org/2.0/user',
      auth: { kind: 'none' },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
  });
});
