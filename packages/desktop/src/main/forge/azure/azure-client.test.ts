import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetAzureStateCacheForTests,
  azGet,
  azPost,
  azWorkItemPatch,
  azureCliStatus,
  repositoryIdFor,
  stateCategoriesFor,
} from './azure-client';

function forge(overrides: Partial<Forge> = {}): Forge {
  return { host: 'dev.azure.com', owner: 'contoso/platform', repo: 'infra', kind: 'azure', ...overrides };
}

function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'azure:dev.azure.com:me@contoso.com',
    kind: 'azure',
    host: 'dev.azure.com',
    login: 'me@contoso.com',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('azure-pat') }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('azureCliStatus', () => {
  it('is not-authenticated with no account', async () => {
    const status = await azureCliStatus(null);
    expect(status.reason).toBe('not-authenticated');
  });

  it('is ready once an account with a resolvable token is present', async () => {
    const status = await azureCliStatus(account());
    expect(status.reason).toBe('ready');
  });

  it('is not-authenticated for a delegated account', async () => {
    const status = await azureCliStatus(account({ delegated: 'gh' }));
    expect(status.reason).toBe('not-authenticated');
  });
});

describe('azGet / azPost', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends Basic auth with an empty username and hits the org/project route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await azGet(forge(), account(), 'git/repositories/infra/pullrequests');
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain('https://dev.azure.com/contoso/platform/_apis/git/repositories/infra/pullrequests');
    expect(url.searchParams.get('api-version')).toBe('7.1');
    const auth = (init.headers as Record<string, string>)['Authorization'];
    expect(auth).toBe(`Basic ${Buffer.from(':azure-pat', 'utf8').toString('base64')}`);
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await azPost(forge(), account(), 'wit/wiql', { query: 'SELECT [System.Id] FROM WorkItems' });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('reports not-authenticated with no account, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await azGet(forge(), null, 'wit/wiql');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cli.reason).toBe('not-authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('azWorkItemPatch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends application/json-patch+json, not the default content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await azWorkItemPatch(forge(), account(), 'wit/workitems/1', [
      { op: 'add', path: '/fields/System.State', value: 'Closed' },
    ]);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    expect(JSON.parse(init.body as string)).toEqual([
      { op: 'add', path: '/fields/System.State', value: 'Closed' },
    ]);
  });
});

describe('stateCategoriesFor', () => {
  beforeEach(() => __resetAzureStateCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('maps state name to category', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        value: [
          { name: 'New', category: 'Proposed' },
          { name: 'Active', category: 'InProgress' },
          { name: 'Closed', category: 'Completed' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const map = await stateCategoriesFor(forge(), account(), 'Bug');
    expect(map?.get('Closed')).toBe('Completed');
    expect(map?.get('Active')).toBe('InProgress');
  });

  it('caches across calls for the same type — one network call, not two', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { value: [{ name: 'New', category: 'Proposed' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await stateCategoriesFor(forge(), account(), 'Bug');
    await stateCategoriesFor(forge(), account(), 'Bug');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('repositoryIdFor', () => {
  beforeEach(() => __resetAzureStateCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('resolves and caches the repository GUID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'guid-123', name: 'infra' }));
    vi.stubGlobal('fetch', fetchMock);

    const id1 = await repositoryIdFor(forge(), account());
    const id2 = await repositoryIdFor(forge(), account());
    expect(id1).toBe('guid-123');
    expect(id2).toBe('guid-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
