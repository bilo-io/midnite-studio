import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  issueComments,
  listIssues,
  listPulls,
  listRuns,
  pullComments,
  pullDetail,
  pullThreads,
} from './gitlab-read';

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

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('listRuns', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports not-authenticated with no token, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await listRuns(forge, null, { limit: 20 });
    expect(result.cli.reason).toBe('not-authenticated');
    expect(result.runs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a pipeline list into ForgeRun rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          {
            id: 1,
            iid: 5,
            status: 'success',
            ref: 'main',
            sha: 'abc123',
            source: 'push',
            created_at: '2026-01-01T00:00:00Z',
            web_url: 'https://gitlab.com/group/project/-/pipelines/1',
          },
        ]),
      ),
    );
    const result = await listRuns(forge, account(), { limit: 20 });
    expect(result.error).toBeNull();
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      id: '1',
      status: 'completed',
      conclusion: 'success',
      headBranch: 'main',
      number: 5,
    });
  });
});

describe('listPulls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps merge requests, reading checks off the embedded pipeline for free', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          {
            id: 10,
            iid: 3,
            title: 'Add feature',
            state: 'opened',
            draft: false,
            author: { username: 'alice' },
            source_branch: 'feature',
            web_url: 'https://gitlab.com/group/project/-/merge_requests/3',
            merged_at: null,
            closed_at: null,
            pipeline: { status: 'failed' },
          },
        ]),
      ),
    );
    const result = await listPulls(forge, account(), { limit: 20, state: 'open' });
    expect(result.pulls[0]).toMatchObject({
      number: 3,
      title: 'Add feature',
      state: 'open',
      author: 'alice',
      checks: 'failing',
      reviewDecision: null,
    });
  });
});

describe('listIssues', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports disabled, not error, on a 404 — issues turned off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { message: '404 Project Not Found' })));
    const result = await listIssues(forge, account(), { limit: 20, state: 'open' });
    expect(result.disabled).toBe(true);
    expect(result.error).toBeNull();
    expect(result.issues).toEqual([]);
  });

  it('maps issue rows, including label colour and milestone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          {
            id: 1,
            iid: 7,
            title: 'Bug',
            state: 'opened',
            author: { username: 'bob' },
            labels: [{ name: 'bug', color: '#ff0000' }],
            assignees: [{ username: 'carol' }],
            updated_at: '2026-01-02T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            web_url: 'https://gitlab.com/group/project/-/issues/7',
            milestone: { title: 'v1' },
          },
        ]),
      ),
    );
    const result = await listIssues(forge, account(), { limit: 20, state: 'open' });
    expect(result.issues[0]).toMatchObject({
      number: 7,
      title: 'Bug',
      state: 'open',
      author: 'bob',
      labels: [{ name: 'bug', color: 'ff0000' }],
      assignees: ['carol'],
      milestone: { title: 'v1' },
    });
  });
});

describe('issueComments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('excludes system notes from the conversation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          { id: 1, body: 'changed the description', system: true, created_at: '2026-01-01T00:00:00Z' },
          { id: 2, body: 'A real comment', system: false, author: { username: 'dave' }, created_at: '2026-01-01T00:01:00Z' },
        ]),
      ),
    );
    const result = await issueComments(forge, account(), 7);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toMatchObject({ author: 'dave', body: 'A real comment', kind: 'comment' });
  });
});

describe('pullComments / pullThreads', () => {
  afterEach(() => vi.unstubAllGlobals());

  const discussions = [
    {
      id: 'disc-1',
      individual_note: true,
      notes: [{ id: 100, body: 'General comment', author: { username: 'eve' }, created_at: '2026-01-01T00:00:00Z' }],
    },
    {
      id: 'disc-2',
      individual_note: false,
      notes: [
        {
          id: 200,
          body: 'Line comment',
          author: { username: 'frank' },
          created_at: '2026-01-01T00:02:00Z',
          resolved: false,
          resolvable: true,
          position: { position_type: 'text', new_path: 'src/a.ts', new_line: 42, old_line: null },
        },
      ],
    },
  ];

  it('routes plain discussions into comments and diff-anchored ones into threads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, discussions)));
    const comments = await pullComments(forge, account(), 3);
    expect(comments.comments).toHaveLength(1);
    expect(comments.comments[0]).toMatchObject({ author: 'eve', body: 'General comment' });
  });

  it('builds a thread id that encodes the merge request number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, discussions)));
    const threads = await pullThreads(forge, account(), 3);
    expect(threads.threads).toHaveLength(1);
    expect(threads.threads[0]?.id).toBe('3:disc-2');
    expect(threads.threads[0]?.path).toBe('src/a.ts');
    expect(threads.threads[0]?.line).toBe(42);
    expect(threads.threads[0]?.comments[0]?.databaseId).toBe('disc-2');
  });
});

describe('pullDetail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('computes reviewDecision from the approvals endpoint — the one call listPulls does not pay', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 10,
          iid: 3,
          title: 'Add feature',
          state: 'opened',
          author: { username: 'alice' },
          source_branch: 'feature',
          web_url: 'https://gitlab.com/group/project/-/merge_requests/3',
          target_branch: 'main',
          description: 'body',
          merge_status: 'can_be_merged',
          diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: 'head' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, [])) // diffs
      .mockResolvedValueOnce(jsonResponse(200, [])) // commits
      .mockResolvedValueOnce(jsonResponse(200, { approved: false, approvals_required: 2 })); // approvals
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullDetail(forge, account(), 3);
    expect(result.detail?.pull.reviewDecision).toBe('REVIEW_REQUIRED');
    expect(result.detail?.mergeable).toBe('MERGEABLE');
    expect(result.detail?.baseSha).toBe('base');
  });
});
