import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commentPull,
  markReady,
  mergePull,
  reviewPull,
  setIssueState,
  setThreadResolved,
} from './gitlab-write';

const forge: Forge = { host: 'gitlab.com', owner: 'group', repo: 'project', kind: 'gitlab' };
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

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('glpat-token') }));

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('gitlab writes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('commentPull posts a note', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await commentPull(forge, account(), 3, 'hi');
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toContain('/merge_requests/3/notes');
    expect(init.method).toBe('POST');
  });

  it('setIssueState closes with state_event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    await setIssueState(forge, account(), 7, 'closed');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ state_event: 'close' });
  });

  it('reviewPull APPROVE calls the approve endpoint and posts a note when body is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201)) // approve
      .mockResolvedValueOnce(jsonResponse(201)); // note
    vi.stubGlobal('fetch', fetchMock);
    const result = await reviewPull(forge, account(), 3, 'APPROVE', 'looks good');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [approveUrl] = fetchMock.mock.calls[0] as [URL];
    expect(approveUrl.pathname).toContain('/merge_requests/3/approve');
  });

  it('reviewPull REQUEST_CHANGES unapproves — GitLab has no such verdict of its own', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201));
    vi.stubGlobal('fetch', fetchMock);
    await reviewPull(forge, account(), 3, 'REQUEST_CHANGES', '');
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toContain('/merge_requests/3/unapprove');
  });

  it('reviewPull COMMENT posts a plain note', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201));
    vi.stubGlobal('fetch', fetchMock);
    await reviewPull(forge, account(), 3, 'COMMENT', 'just a note');
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toContain('/merge_requests/3/notes');
  });

  it('mergePull squash sets squash: true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    await mergePull(forge, account(), 3, 'squash');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ squash: true });
  });

  it('markReady strips a Draft: title prefix', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { title: 'Draft: Add feature' }))
      .mockResolvedValueOnce(jsonResponse(200, { title: 'Add feature' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await markReady(forge, account(), 3);
    expect(result.ok).toBe(true);
    const [, putInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(putInit.body as string)).toEqual({ title: 'Add feature' });
  });

  it('markReady is a no-op when the title has no draft prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { title: 'Add feature' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await markReady(forge, account(), 3);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('setThreadResolved decodes the mrNumber:discussionId id and PUTs the right path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    const result = await setThreadResolved(forge, account(), { threadId: '3:disc-2', resolved: true });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toContain('/merge_requests/3/discussions/disc-2');
    expect(JSON.parse(init.body as string)).toEqual({ resolved: true });
  });

  it('setThreadResolved refuses a malformed thread id without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await setThreadResolved(forge, account(), { threadId: 'not-a-real-id', resolved: true });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('every write reports not-authenticated with no token, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await commentPull(forge, null, 3, 'hi');
    expect(result.ok).toBe(false);
    expect(result.cli.reason).toBe('not-authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
