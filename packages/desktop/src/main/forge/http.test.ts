import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyHttpAuth, describeHttpFailure, requestJson, requestText } from './http';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('applyHttpAuth', () => {
  it('sets no header for none', () => {
    const headers: Record<string, string> = {};
    applyHttpAuth(headers, { kind: 'none' });
    expect(headers).toEqual({});
  });

  it('sets a bearer header', () => {
    const headers: Record<string, string> = {};
    applyHttpAuth(headers, { kind: 'bearer', token: 'abc' });
    expect(headers['authorization']).toBe('Bearer abc');
  });

  it('base64s a basic credential', () => {
    const headers: Record<string, string> = {};
    applyHttpAuth(headers, { kind: 'basic', username: '', password: 'pat' });
    expect(headers['authorization']).toBe(`Basic ${Buffer.from(':pat').toString('base64')}`);
  });

  it('sets a named header verbatim — GitLab PRIVATE-TOKEN shape', () => {
    const headers: Record<string, string> = {};
    applyHttpAuth(headers, { kind: 'header', name: 'PRIVATE-TOKEN', value: 'glpat-x' });
    expect(headers['PRIVATE-TOKEN']).toBe('glpat-x');
  });
});

describe('describeHttpFailure', () => {
  it('reads a plain message field', () => {
    expect(describeHttpFailure(404, JSON.stringify({ message: '404 Project Not Found' }))).toBe(
      '404 Project Not Found',
    );
  });

  it('joins an array message', () => {
    expect(describeHttpFailure(422, JSON.stringify({ message: ['title is missing', 'body too long'] }))).toBe(
      'title is missing; body too long',
    );
  });

  it('flattens a field-keyed validation object', () => {
    const body = JSON.stringify({ message: { title: ["can't be blank"] } });
    expect(describeHttpFailure(422, body)).toBe("title can't be blank");
  });

  it('falls back to the status when the body is not JSON', () => {
    expect(describeHttpFailure(502, '<html>Bad Gateway</html>')).toBe('Request failed with status 502.');
  });
});

describe('requestJson / requestText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns parsed JSON for a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJson<{ id: number }>('https://gitlab.com/api/v4/', 'user', {
      kind: 'header',
      name: 'PRIVATE-TOKEN',
      value: 't',
    });
    expect(result).toEqual({ ok: true, status: 200, data: { id: 1 }, headers: expect.any(Object) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('https://gitlab.com/api/v4/user');
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('t');
  });

  it('maps a non-2xx response to a described error, never throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: '401 Unauthorized' })));
    const result = await requestJson('https://gitlab.com/api/v4/', 'user', { kind: 'none' });
    expect(result).toEqual({ ok: false, status: 401, error: '401 Unauthorized' });
  });

  it('builds query params onto the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);
    await requestJson('https://gitlab.com/api/v4/', 'projects/1/issues', { kind: 'none' }, {
      query: { state: 'opened', per_page: 20, ignored: undefined },
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get('state')).toBe('opened');
    expect(url.searchParams.get('per_page')).toBe('20');
    expect(url.searchParams.has('ignored')).toBe(false);
  });

  it('retries once after Retry-After on a 429, then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = requestJson('https://gitlab.com/api/v4/', 'user', { kind: 'none' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true }, headers: expect.any(Object) });
  });

  it('does not retry a second time — a repeated 429 is a failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('busy', { status: 429, headers: { 'retry-after': '0' } }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = requestJson('https://gitlab.com/api/v4/', 'user', { kind: 'none' });
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('returns raw text for requestText, unparsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('line one\nline two\n', { status: 200 })));
    const result = await requestText('https://gitlab.com/api/v4/', 'projects/1/jobs/2/trace', { kind: 'none' });
    expect(result).toEqual({ ok: true, status: 200, data: 'line one\nline two\n', headers: expect.any(Object) });
  });

  it('reports a transport failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND gitlab.invalid')),
    );
    const result = await requestJson('https://gitlab.invalid/api/v4/', 'user', { kind: 'none' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ENOTFOUND');
  });
});
