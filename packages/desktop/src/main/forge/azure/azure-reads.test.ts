import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAzureStateCacheForTests } from './azure-client';
import { issueComments, issueDetail, listIssues, listPulls, listRuns, pullThreads } from './azure-reads';

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

describe('listRuns', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => __resetAzureStateCacheForTests());

  it('reports not-authenticated with no account, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await listRuns(forge, null, { limit: 20 });
    expect(result.cli.reason).toBe('not-authenticated');
    expect(result.runs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the repository GUID, then maps builds into ForgeRun rows', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL) => {
      const href = url.toString();
      if (href.includes('git/repositories/infra')) return Promise.resolve(jsonResponse(200, { id: 'repo-guid' }));
      return Promise.resolve(
        jsonResponse(200, {
          value: [
            {
              id: 42,
              buildNumber: '42',
              status: 'completed',
              result: 'succeeded',
              sourceBranch: 'refs/heads/main',
              sourceVersion: 'abc123',
              queueTime: '2026-01-01T00:00:00Z',
              reason: 'individualCI',
              definition: { id: 7, name: 'CI' },
              _links: { web: { href: 'https://dev.azure.com/contoso/platform/_build/results?buildId=42' } },
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listRuns(forge, account(), { limit: 20 });
    expect(result.error).toBeNull();
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      id: '42',
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      headBranch: 'main',
      headSha: 'abc123',
      number: 42,
      workflowId: '7',
    });
  });
});

describe('listPulls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps pull requests, honestly reading the numeric review vote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          value: [
            {
              pullRequestId: 5,
              title: 'Add feature',
              status: 'active',
              isDraft: false,
              sourceRefName: 'refs/heads/feature',
              createdBy: { uniqueName: 'dev@contoso.com', displayName: 'Dev' },
              reviewers: [{ vote: 10, isRequired: true }],
            },
          ],
        }),
      ),
    );
    const result = await listPulls(forge, account(), { limit: 20, state: 'open' });
    expect(result.error).toBeNull();
    expect(result.pulls).toHaveLength(1);
    expect(result.pulls[0]).toMatchObject({
      id: '5',
      number: 5,
      title: 'Add feature',
      state: 'open',
      isDraft: false,
      reviewDecision: 'APPROVED',
      headBranch: 'feature',
      author: 'dev@contoso.com',
      url: 'https://dev.azure.com/contoso/platform/_git/infra/pullrequest/5',
    });
  });

  it('maps a -10 reviewer vote onto CHANGES_REQUESTED, and -5 does not', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          value: [
            { pullRequestId: 1, title: 'A', status: 'active', sourceRefName: 'refs/heads/a', reviewers: [{ vote: -10, isRequired: false }] },
            { pullRequestId: 2, title: 'B', status: 'active', sourceRefName: 'refs/heads/b', reviewers: [{ vote: -5, isRequired: false }] },
          ],
        }),
      ),
    );
    const result = await listPulls(forge, account(), { limit: 20, state: 'open' });
    expect(result.pulls[0]?.reviewDecision).toBe('CHANGES_REQUESTED');
    expect(result.pulls[1]?.reviewDecision).not.toBe('CHANGES_REQUESTED');
  });
});

describe('pullThreads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes the PR number into the thread id, and reads resolution off status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          value: [
            {
              id: 99,
              status: 'fixed',
              threadContext: { filePath: '/src/a.ts', rightFileStart: { line: 12 } },
              comments: [{ id: 1, content: 'Please fix', author: { uniqueName: 'r@contoso.com' }, publishedDate: '2026-01-01T00:00:00Z' }],
            },
            {
              id: 100,
              // No threadContext — top-level conversation, not an inline thread.
              comments: [{ id: 2, content: 'LGTM', author: { uniqueName: 'r@contoso.com' }, publishedDate: '2026-01-01T00:00:00Z' }],
            },
          ],
        }),
      ),
    );

    const result = await pullThreads(forge, account(), 7);
    expect(result.error).toBeNull();
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]).toMatchObject({
      id: '7:99',
      path: 'src/a.ts',
      line: 12,
      resolved: true,
    });
  });
});

describe('listIssues (work items)', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => __resetAzureStateCacheForTests());

  it('queries via WIQL, hydrates, and maps the state category — not the state name', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL, init?: RequestInit) => {
      const href = url.toString();
      if (href.includes('wit/wiql')) {
        return Promise.resolve(jsonResponse(200, { workItems: [{ id: 3 }] }));
      }
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
      if (href.includes('wit/workitems')) {
        return Promise.resolve(
          jsonResponse(200, {
            value: [
              {
                id: 3,
                fields: {
                  'System.Id': 3,
                  'System.Title': 'Fix crash',
                  'System.State': 'Closed',
                  'System.WorkItemType': 'Bug',
                  'System.Tags': 'urgent; regression',
                  'System.ChangedDate': '2026-01-02T00:00:00Z',
                },
              },
            ],
          }),
        );
      }
      void init;
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listIssues(forge, account(), { limit: 20, state: 'closed' });
    expect(result.error).toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      id: '3',
      number: 3,
      title: 'Fix crash',
      // "Closed" is a Completed-category state — mapped via category, not name.
      state: 'closed',
      url: 'https://dev.azure.com/contoso/platform/_workitems/edit/3',
    });
    // The work item's own type is carried as the first label — "say in the
    // UI these are work items", the phase doc's own instruction.
    expect(result.issues[0]?.labels[0]).toEqual({ name: 'Bug', color: '' });
    expect(result.issues[0]?.labels.map((l) => l.name)).toContain('urgent');
  });

  it('filters out work items whose mapped state does not match, after fetching', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL) => {
      const href = url.toString();
      if (href.includes('wit/wiql')) return Promise.resolve(jsonResponse(200, { workItems: [{ id: 1 }] }));
      if (href.includes('wit/workitemtypes/')) {
        return Promise.resolve(jsonResponse(200, { value: [{ name: 'Active', category: 'InProgress' }] }));
      }
      if (href.includes('wit/workitems')) {
        return Promise.resolve(
          jsonResponse(200, {
            value: [{ id: 1, fields: { 'System.Id': 1, 'System.Title': 'Open task', 'System.State': 'Active', 'System.WorkItemType': 'Task' } }],
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listIssues(forge, account(), { limit: 20, state: 'closed' });
    expect(result.issues).toHaveLength(0);
  });
});

describe('issueDetail', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => __resetAzureStateCacheForTests());

  it('strips HTML from System.Description into plain text', async () => {
    const fetchMock = vi.fn().mockImplementation((url: URL) => {
      const href = url.toString();
      if (href.includes('wit/workitemtypes/')) {
        return Promise.resolve(jsonResponse(200, { value: [{ name: 'New', category: 'Proposed' }] }));
      }
      return Promise.resolve(
        jsonResponse(200, {
          id: 9,
          fields: {
            'System.Id': 9,
            'System.Title': 'Investigate',
            'System.State': 'New',
            'System.WorkItemType': 'Bug',
            'System.Description': '<div>Steps:<br/>1. Click<br/>2. Crash</div>',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await issueDetail(forge, account(), 9);
    expect(result.error).toBeNull();
    expect(result.issue?.body).toContain('Steps:');
    expect(result.issue?.body).not.toContain('<div>');
  });
});

describe('issueComments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps work item comments, and requests the preview API version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { comments: [{ id: 1, text: 'Looks good', createdBy: { uniqueName: 'r@contoso.com' }, createdDate: '2026-01-01T00:00:00Z' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await issueComments(forge, account(), 3);
    expect(result.error).toBeNull();
    expect(result.comments).toEqual([
      { id: '1', kind: 'comment', author: 'r@contoso.com', body: 'Looks good', createdAt: '2026-01-01T00:00:00Z', url: expect.stringContaining('#comment-1'), reviewState: null },
    ]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get('api-version')).toBe('7.1-preview.3');
  });
});
