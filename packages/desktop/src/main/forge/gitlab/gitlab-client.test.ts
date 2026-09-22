import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gitlabCliStatus, glGet, glPost, glPut, nextPageCursor, projectId } from './gitlab-client';

function forge(overrides: Partial<Forge> = {}): Forge {
  return { host: 'gitlab.com', owner: 'group/subgroup', repo: 'project', kind: 'gitlab', ...overrides };
}

function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'gitlab:gitlab.com:me',
    kind: 'gitlab',
    host: 'gitlab.com',
    login: 'me',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

describe('projectId', () => {
  it('URL-encodes owner/repo, slashes included — a subgroup path stays whole', () => {
    expect(projectId(forge())).toBe(encodeURIComponent('group/subgroup/project'));
    expect(decodeURIComponent(projectId(forge()))).toBe('group/subgroup/project');
  });
});

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('glpat-token') }));

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('gitlabCliStatus', () => {
  it('is not-authenticated with no account, and gives an actionable hint', async () => {
    const status = await gitlabCliStatus(null);
    expect(status.reason).toBe('not-authenticated');
    expect(status.binPath).toBeNull();
    expect(status.hint.length).toBeGreaterThan(0);
  });

  it('is ready once an account with a resolvable token is present', async () => {
    const status = await gitlabCliStatus(account());
    expect(status.reason).toBe('ready');
  });

  it('is not-authenticated for a delegated account — it holds no token of its own', async () => {
    const status = await gitlabCliStatus(account({ delegated: 'gh' }));
    expect(status.reason).toBe('not-authenticated');
  });
});

describe('glGet / glPost / glPut', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends PRIVATE-TOKEN and hits the right v4 path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await glGet(forge(), account(), `projects/${projectId(forge())}/issues`, { state: 'opened' });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain('https://gitlab.com/api/v4/projects/');
    expect(url.searchParams.get('state')).toBe('opened');
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-token');
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await glPost(forge(), account(), 'projects/1/merge_requests/2/notes', { body: 'hi' });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ body: 'hi' }));
  });

  it('PUTs a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await glPut(forge(), account(), 'projects/1/issues/2', { state_event: 'close' });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('PUT');
  });

  it('reports not-authenticated with no account, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await glGet(forge(), null, 'user');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cli.reason).toBe('not-authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
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
