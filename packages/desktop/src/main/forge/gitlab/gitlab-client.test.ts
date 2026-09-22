import type { Forge } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gitlabCliStatus, glGet, glPost, glPut, nextPageCursor, projectId } from './gitlab-client';

function forge(overrides: Partial<Forge> = {}): Forge {
  return { host: 'gitlab.com', owner: 'group/subgroup', repo: 'project', kind: 'gitlab', ...overrides };
}

describe('projectId', () => {
  it('URL-encodes owner/repo, slashes included — a subgroup path stays whole', () => {
    expect(projectId(forge())).toBe(encodeURIComponent('group/subgroup/project'));
    expect(decodeURIComponent(projectId(forge()))).toBe('group/subgroup/project');
  });
});

describe('gitlabCliStatus', () => {
  it('is not-authenticated with no token, and gives an actionable hint', () => {
    const status = gitlabCliStatus({ host: 'gitlab.com', token: '' });
    expect(status.reason).toBe('not-authenticated');
    expect(status.binPath).toBeNull();
    expect(status.hint.length).toBeGreaterThan(0);
  });

  it('is ready once a token is present', () => {
    expect(gitlabCliStatus({ host: 'gitlab.com', token: 'glpat-x' }).reason).toBe('ready');
  });
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('glGet / glPost / glPut', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends PRIVATE-TOKEN and hits the right v4 path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await glGet({ host: 'gitlab.com', token: 't' }, 'projects/1/issues', { state: 'opened' });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('https://gitlab.com/api/v4/projects/1/issues?state=opened');
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('t');
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await glPost({ host: 'gitlab.com', token: 't' }, 'projects/1/merge_requests/2/notes', { body: 'hi' });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ body: 'hi' }));
  });

  it('PUTs a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await glPut({ host: 'gitlab.com', token: 't' }, 'projects/1/issues/2', { state_event: 'close' });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('PUT');
  });
});

describe('nextPageCursor', () => {
  it('reads x-next-page when present', () => {
    expect(nextPageCursor({ 'x-next-page': '3' })).toBe('3');
  });

  it('is null when the header is empty or absent', () => {
    expect(nextPageCursor({ 'x-next-page': '' })).toBeNull();
    expect(nextPageCursor({})).toBeNull();
  });
});
