// vitest/jsdom: GitHubDataSource against a stubbed fetch and Theme D's history fixture (Phase 146 E2).
import { describe, expect, it, vi } from 'vitest';
import { historyFixture } from '../../../../packages/forge-github-core/src/__fixtures__/history';
import { GitHubDataSource, restFileToDiff } from './github-source';
import { nextLink } from './http';

const TOKEN = 'ghp_FAKE_TEST_TOKEN';
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

function source(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(fetchImpl);
  return { fetch, ds: new GitHubDataSource({ fetch, getToken: () => TOKEN }) };
}
const repo = { owner: 'bilo-io', name: 'midnite-studio' };

describe('GitHubDataSource GraphQL reads', () => {
  it('history posts the Theme D query and maps the page', async () => {
    const { ds, fetch } = source(async () => json({ data: historyFixture }));
    const result = await ds.history(repo, 'main');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.map((c) => c.sha)).toEqual(['a1', 'b2']);
    expect(result.value.nextCursor).toBe('abc 1');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/graphql');
    const sent = JSON.parse(String(init?.body));
    expect(sent.variables).toMatchObject({ owner: 'bilo-io', name: 'midnite-studio', ref: 'main', after: null });
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    // The token is only ever in the header.
    expect(String(init?.body)).not.toContain(TOKEN);
  });

  it('viewer, repos and branches page by cursor', async () => {
    const { ds } = source(async (_u, init) => {
      const q = JSON.parse(String(init?.body)).query as string;
      if (q.startsWith('{viewer')) return json({ data: { viewer: { login: 'octo', name: null, avatarUrl: 'x' } } });
      if (q.includes('viewer{repositories') || q.includes('viewer{')) {
        return json({
          data: {
            viewer: {
              repositories: {
                pageInfo: { hasNextPage: true, endCursor: 'r1' },
                nodes: [{ name: 'a', owner: { login: 'octo' }, defaultBranchRef: { name: 'main' }, pushedAt: '2026-01-01T00:00:00Z', isPrivate: false }],
              },
              organizations: { nodes: [] },
            },
          },
        });
      }
      return json({ data: { repository: { refs: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ name: 'main' }] } } } });
    });
    expect(await ds.viewer()).toEqual({ ok: true, value: { login: 'octo', name: null, avatarUrl: 'x' } });
    const repos = await ds.listRepos();
    expect(repos.ok && repos.value.nextCursor).toBe('r1');
    const branches = await ds.listBranches(repo);
    expect(branches).toEqual({ ok: true, value: { items: ['main'], nextCursor: null } });
  });

  it('a missing issue is an error result, not a throw', async () => {
    const { ds } = source(async () => json({ data: { repository: { issue: null } } }));
    expect(await ds.issue(repo, 9)).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('GitHubDataSource failures', () => {
  it('401 is auth', async () => {
    const { ds } = source(async () => json({ message: 'Bad credentials' }, { status: 401 }));
    expect(await ds.viewer()).toMatchObject({ ok: false, kind: 'auth' });
  });
  it('a scope refusal is scope', async () => {
    const { ds } = source(async () => json({ data: null, errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'needs read:project' }] }));
    expect(await ds.listProjects(repo)).toMatchObject({ ok: false, kind: 'scope' });
  });
  it('403 naming a scope is scope', async () => {
    const { ds } = source(async () => json({ message: 'Resource not accessible by personal access token' }, { status: 403 }));
    expect(await ds.history(repo, 'main')).toMatchObject({ ok: false, kind: 'scope' });
  });
  it('a TypeError from fetch is network', async () => {
    const { ds } = source(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await ds.viewer()).toMatchObject({ ok: false, kind: 'network' });
  });
  it('no token is auth without calling fetch', async () => {
    const fetch = vi.fn();
    const ds = new GitHubDataSource({ fetch, getToken: () => null });
    expect(await ds.viewer()).toMatchObject({ ok: false, kind: 'auth' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('error messages never carry the token', async () => {
    const { ds } = source(async () => json({ message: `oops ${TOKEN}` }, { status: 500 }));
    const result = await ds.viewer();
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('GitHubDataSource mutations', () => {
  it('setIssueState resolves the node id then closes', async () => {
    const calls: string[] = [];
    const { ds } = source(async (_u, init) => {
      const q = JSON.parse(String(init?.body)).query as string;
      calls.push(q.slice(0, 20));
      if (q.includes('issue(number')) {
        return json({ data: { repository: { issue: { id: 'I_1', number: 4, title: 't', state: 'OPEN', url: 'u', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', body: 'b' } } } });
      }
      return json({ data: { closeIssue: { issue: { id: 'I_1' } } } });
    });
    expect(await ds.setIssueState(repo, 4, 'CLOSED')).toEqual({ ok: true, value: null });
    expect(calls).toHaveLength(2);
  });
  it('a mutation with GraphQL errors fails with the message', async () => {
    const { ds } = source(async () => json({ data: null, errors: [{ message: 'Could not resolve' }] }));
    expect(await ds.replyToThread('T_1', 'hi')).toEqual({ ok: false, kind: 'error', message: 'Could not resolve' });
  });
});

describe('REST file patches', () => {
  it('pullFiles follows the Link header and parses patches', async () => {
    const patch = '@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
    const pages = [
      json([{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 1, changes: 2, patch }], {
        headers: { Link: '<https://api.github.com/repos/bilo-io/midnite-studio/pulls/1/files?per_page=100&page=2>; rel="next"' },
      }),
      json([{ filename: 'img.png', status: 'added', additions: 0, deletions: 0, changes: 0 }]),
    ];
    const { ds, fetch } = source(async () => pages.shift()!);
    const result = await ds.pullFiles(repo, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.value.map((f) => f.path)).toEqual(['a.ts', 'img.png']);
    expect(result.value[0]!.hunks).toHaveLength(1);
    expect(result.value[1]).toMatchObject({ binary: true, hunks: [] });
  });

  it('a file with changes but no patch is too large, not binary', () => {
    expect(restFileToDiff({ filename: 'big.json', status: 'modified', additions: 9000, deletions: 1, changes: 9001 })).toMatchObject({
      binary: false,
      truncated: true,
      hunks: [],
      insertions: 9000,
    });
  });

  it('commit rejects a non-sha before any request', async () => {
    const { ds, fetch } = source(async () => json({}));
    expect(await ds.commit(repo, '../../user')).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('commit maps the REST commit and its files', async () => {
    const { ds } = source(async () =>
      json({
        sha: 'a'.repeat(40),
        parents: [{ sha: 'b'.repeat(40) }],
        commit: { message: 'feat: x\n\nbody', author: { name: 'A', email: 'a@x', date: '2026-01-01T00:00:00Z' }, committer: { date: '2026-01-01T00:00:01Z' } },
        files: [{ filename: 'f.ts', status: 'renamed', previous_filename: 'g.ts', additions: 0, deletions: 0, changes: 0 }],
      }),
    );
    const result = await ds.commit(repo, 'a'.repeat(40));
    expect(result.ok && result.value.commit).toMatchObject({ subject: 'feat: x', parents: ['b'.repeat(40)] });
    expect(result.ok && result.value.files[0]).toMatchObject({ change: 'renamed', oldPath: 'g.ts' });
  });
});

describe('nextLink', () => {
  it('reads rel=next and ignores others', () => {
    expect(nextLink('<https://a/1>; rel="prev", <https://a/3>; rel="next"')).toBe('https://a/3');
    expect(nextLink('<https://a/1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});
