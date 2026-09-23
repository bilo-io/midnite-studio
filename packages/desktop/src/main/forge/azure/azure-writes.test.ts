import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAzureStateCacheForTests } from './azure-client';
import {
  commentPull,
  createIssue,
  deleteIssue,
  editIssue,
  linkIssues,
  mergePull,
  reviewPull,
  setIssueState,
  setThreadResolved,
  unlinkIssues,
} from './azure-writes';

const forge: Forge = { host: 'dev.azure.com', owner: 'contoso/platform', repo: 'infra', kind: 'azure' };
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

describe('commentPull', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts a new active thread', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await commentPull(forge, account(), 5, 'hello');
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ comments: [{ content: 'hello', commentType: 'text' }], status: 'active' });
  });
});

describe('setThreadResolved', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('decodes the {prNumber}:{threadId} id and PATCHes the right route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 99 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await setThreadResolved(forge, account(), { threadId: '7:99', resolved: true });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain('pullrequests/7/threads/99');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'fixed' });
  });

  it('rejects a malformed thread id without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await setThreadResolved(forge, account(), { threadId: 'not-an-id', resolved: true });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reviewPull', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('votes 10 for APPROVE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await reviewPull(forge, account(), 5, 'APPROVE', '');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain('reviewers/@me');
    expect(JSON.parse(init.body as string)).toEqual({ vote: 10 });
  });

  it('votes -10 for REQUEST_CHANGES — the only true Azure reject', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await reviewPull(forge, account(), 5, 'REQUEST_CHANGES', '');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ vote: -10 });
  });

  it('falls through COMMENT to a plain thread comment, no vote', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await reviewPull(forge, account(), 5, 'COMMENT', 'just a note');
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.href).not.toContain('reviewers');
    expect(url.href).toContain('threads');
  });
});

describe('mergePull', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the PR for lastMergeSourceCommit before completing it', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { status: 'completed' }));
      return Promise.resolve(jsonResponse(200, { lastMergeSourceCommit: { commitId: 'abc123' } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await mergePull(forge, account(), 5, 'squash');
    expect(result.ok).toBe(true);
    const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ status: 'completed', lastMergeSourceCommit: { commitId: 'abc123' }, completionOptions: { squashMerge: true } });
  });

  it('reports rebase as unsupported without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await mergePull(forge, account(), 5, 'rebase');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('setIssueState', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => __resetAzureStateCacheForTests());

  it('picks the Completed-category state and sends a JSON Patch PATCH', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      const href = url.toString();
      if (href.includes('wit/workitemtypes/')) {
        return Promise.resolve(
          jsonResponse(200, {
            value: [
              { name: 'New', category: 'Proposed' },
              { name: 'Closed', category: 'Completed' },
            ],
          }),
        );
      }
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { id: 3 }));
      return Promise.resolve(jsonResponse(200, { fields: { 'System.WorkItemType': 'Bug', 'System.State': 'New' } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await setIssueState(forge, account(), 3, 'closed');
    expect(result.ok).toBe(true);
    const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect((patchCall![1] as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual([
      { op: 'add', path: '/fields/System.State', value: 'Closed' },
    ]);
  });
});

/** Phase 95 Theme D — issue CRUD and the body-fallback dependency link. */
describe('azure issue CRUD and links (Phase 95 Theme D)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const workItemFields = (over: Record<string, unknown> = {}) => ({
    'System.Id': 5,
    'System.WorkItemType': 'Issue',
    'System.State': 'New',
    'System.Title': 'A new issue',
    'System.CreatedBy': { uniqueName: 'me@contoso.com' },
    'System.ChangedDate': '2026-01-01T00:00:00Z',
    'System.CreatedDate': '2026-01-01T00:00:00Z',
    'System.Description': 'Body.',
    'System.Tags': '',
    'System.IterationPath': 'infra',
    ...over,
  });

  it('createIssue POSTs a JSON-Patch document to wit/workitems/$Issue, then reads it back', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      const href = url.toString();
      if (init?.method === 'POST' && href.includes('wit/workitems/$Issue')) {
        return Promise.resolve(jsonResponse(200, { id: 5, fields: workItemFields() }));
      }
      // The read-back through issueDetail.
      return Promise.resolve(jsonResponse(200, { id: 5, fields: workItemFields() }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createIssue(forge, account(), { title: 'A new issue', body: 'Body.' });

    const createCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
    expect((createCall![1] as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json-patch+json',
    });
    const ops = JSON.parse((createCall![1] as RequestInit).body as string);
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'add', path: '/fields/System.Title', value: 'A new issue' },
        { op: 'add', path: '/fields/System.Description', value: 'Body.' },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issue.number).toBe(5);
  });

  it('editIssue PATCHes only the given fields, every op an upsert-safe "add"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    await editIssue(forge, account(), 5, { title: 'Renamed' });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual([{ op: 'add', path: '/fields/System.Title', value: 'Renamed' }]);
  });

  it('editIssue is a no-op — no network call — with no field given', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await editIssue(forge, account(), 5, {});
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deleteIssue sends DELETE to the work item route — a soft delete, not ?destroy=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteIssue(forge, account(), 5);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toContain('wit/workitems/5');
    expect(url.href).not.toContain('destroy');
    expect(init.method).toBe('DELETE');
    expect(result.ok).toBe(true);
  });

  it('linkIssues reads the description, appends the Blocked by line, and PATCHes it back', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { id: 5 }));
      return Promise.resolve(jsonResponse(200, { id: 5, fields: workItemFields() }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkIssues(forge, account(), { kind: 'blockedBy', number: 5, targetNumber: 12 });

    const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual([
      { op: 'add', path: '/fields/System.Description', value: 'Body.\n\nBlocked by #12' },
    ]);
    expect(result).toMatchObject({ ok: true, via: 'body' });
  });

  it('linkIssues reports subIssue as an honest unsupported write, with no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await linkIssues(forge, account(), { kind: 'subIssue', number: 5, targetNumber: 12 });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unlinkIssues removes exactly the Blocked by line it added', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { id: 5 }));
      return Promise.resolve(
        jsonResponse(200, { id: 5, fields: workItemFields({ 'System.Description': 'Body.\n\nBlocked by #12' }) }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await unlinkIssues(forge, account(), { kind: 'blockedBy', number: 5, targetNumber: 12 });

    const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual([
      { op: 'add', path: '/fields/System.Description', value: 'Body.' },
    ]);
    expect(result).toMatchObject({ ok: true, via: 'body' });
  });
});
