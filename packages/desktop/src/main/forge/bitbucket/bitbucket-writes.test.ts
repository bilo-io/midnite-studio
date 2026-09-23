import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIssue,
  deleteIssue,
  editIssue,
  linkIssues,
  unlinkIssues,
} from './bitbucket-writes';

/**
 * Command/body construction for Bitbucket's Theme D writes (issue CRUD, the
 * body-fallback dependency link) — no network anywhere, `fetch` mocked at the
 * global level, matching `gitlab-write.test.ts`/`azure-writes.test.ts`'s own
 * arrangement for the other two HTTP-backed adapters.
 */

const forge: Forge = { host: 'bitbucket.org', owner: 'acme', repo: 'widgets', kind: 'bitbucket' };
function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'bitbucket:bitbucket.org:me',
    kind: 'bitbucket',
    host: 'bitbucket.org',
    login: 'me',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('app-password') }));

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const issueRow = {
  id: 5,
  title: 'A new issue',
  state: 'new',
  reporter: { username: 'me' },
  assignee: null,
  content: { raw: 'Body.' },
  updated_on: '2026-01-01T00:00:00Z',
  created_on: '2026-01-01T00:00:00Z',
  links: { html: { href: 'https://bitbucket.org/acme/widgets/issues/5' } },
};

describe('bitbucket issue CRUD and links (Phase 95 Theme D)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('createIssue POSTs title/content, then reads the issue back by id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: 5 })) // create
      .mockResolvedValueOnce(jsonResponse(200, issueRow)); // read-back
    vi.stubGlobal('fetch', fetchMock);

    const result = await createIssue(forge, account(), { title: 'A new issue', body: 'Body.' });

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(createUrl.pathname).toContain('/issues');
    expect(JSON.parse(createInit.body as string)).toEqual({
      title: 'A new issue',
      content: { raw: 'Body.', markup: 'markdown' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issue.number).toBe(5);
  });

  it('createIssue only ever sends the first assignee — Bitbucket has one, not a list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: 5 }))
      .mockResolvedValueOnce(jsonResponse(200, issueRow));
    vi.stubGlobal('fetch', fetchMock);

    await createIssue(forge, account(), { title: 'A new issue', assignees: ['alice', 'bob'] });

    const [, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(createInit.body as string)).toMatchObject({ assignee: { username: 'alice' } });
  });

  it('editIssue PUTs only the given fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, issueRow));
    vi.stubGlobal('fetch', fetchMock);

    await editIssue(forge, account(), 5, { title: 'Renamed' });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toContain('/issues/5');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Renamed' });
  });

  it('editIssue is a no-op — no network call — with no field given', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await editIssue(forge, account(), 5, {});
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deleteIssue sends DELETE to the issue path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteIssue(forge, account(), 5);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toContain('/issues/5');
    expect(init.method).toBe('DELETE');
    expect(result.ok).toBe(true);
  });

  it('linkIssues reads the current content, appends the Blocked by line, and PUTs it back', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, issueRow)) // issueDetail read
      .mockResolvedValueOnce(jsonResponse(200)); // content PUT
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkIssues(forge, account(), { kind: 'blockedBy', number: 5, targetNumber: 12 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, putInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(putInit.body as string)).toEqual({
      content: { raw: 'Body.\n\nBlocked by #12', markup: 'markdown' },
    });
    expect(result).toMatchObject({ ok: true, via: 'body' });
  });

  it('linkIssues is idempotent — a second link to the same target sends no write', async () => {
    const alreadyLinked = { ...issueRow, content: { raw: 'Body.\n\nBlocked by #12' } };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, alreadyLinked));
    vi.stubGlobal('fetch', fetchMock);

    const result = await linkIssues(forge, account(), { kind: 'blockedBy', number: 5, targetNumber: 12 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const linked = { ...issueRow, content: { raw: 'Body.\n\nBlocked by #12' } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, linked))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await unlinkIssues(forge, account(), { kind: 'blockedBy', number: 5, targetNumber: 12 });

    const [, putInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(JSON.parse(putInit.body as string)).toEqual({ content: { raw: 'Body.', markup: 'markdown' } });
    expect(result).toMatchObject({ ok: true, via: 'body' });
  });
});
