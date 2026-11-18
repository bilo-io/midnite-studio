import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  addCommentMutation,
  branchesQuery,
  createIssueMutation,
  describeGraphqlFailure,
  historyQuery,
  issueDetailQuery,
  mutationResult,
  parseBranches,
  parseHistory,
  parseIssueDetail,
  parseIssues,
  parsePullDetail,
  parsePulls,
  parsePullsPage,
  parseRepoList,
  parseReviewCommentCounts,
  parseReviewThreads,
  pullDetailQuery,
  pullsQuery,
  repoListQuery,
  replyToThreadMutation,
  reviewCommentCountsQuery,
  scopeErrorKind,
  setIssueStateMutation,
  setProjectFieldMutation,
  submitReviewMutation,
} from './index';

const history = JSON.parse(readFileSync(new URL('./__fixtures__/history.json', import.meta.url), 'utf8'));

describe('errors', () => {
  it('reads the first non-empty GraphQL message and caps it', () => {
    expect(describeGraphqlFailure({ errors: [{ message: '' }, { message: 'Boom' }] })).toBe('Boom');
    expect(describeGraphqlFailure({ errors: [{ message: 'x'.repeat(400) }] })).toHaveLength(301);
    expect(describeGraphqlFailure({}, 'fallback')).toBe('fallback');
  });

  it('classifies a scope refusal', () => {
    expect(scopeErrorKind('{"type":"INSUFFICIENT_SCOPES"}')).toBe('insufficient-scope');
    expect(scopeErrorKind('boom')).toBe('error');
  });

  it('turns a response body into a mutation result', () => {
    expect(mutationResult({ data: { x: {} } })).toEqual({ ok: true });
    expect(mutationResult({ data: null, errors: [{ message: 'denied' }] })).toEqual({
      ok: false,
      kind: 'error',
      message: 'denied',
    });
    expect(mutationResult(null).ok).toBe(false);
  });
});

describe('history', () => {
  it('passes values as variables', () => {
    expect(historyQuery('o', 'n', 'refs/heads/main', 30, null).variables).toEqual({
      owner: 'o',
      name: 'n',
      ref: 'refs/heads/main',
      first: 30,
      after: null,
    });
  });

  it('maps commits, trailers and the cursor', () => {
    const page = parseHistory(history);
    expect(page.hasNextPage).toBe(true);
    expect(page.endCursor).toBe('abc 1');
    expect(page.commits).toHaveLength(2);
    expect(page.commits[0]).toMatchObject({
      sha: 'a1',
      parents: ['b2', 'c3'],
      authorName: 'Bilo',
      subject: 'feat: add thing',
      refs: [],
      coAuthors: ['Ada <ada@example.com>'],
      sessionTrailers: ['sess-9'],
      authorDate: 1_795_039_200,
      committerDate: 1_795_039_500,
    });
    expect(page.commits[1]).toMatchObject({ sha: 'b2', authorDate: 0, authorName: '', parents: [] });
  });

  it('degrades to an empty page for a missing ref', () => {
    expect(parseHistory({ repository: { ref: null } })).toEqual({ commits: [], endCursor: null, hasNextPage: false });
    expect(parseHistory(undefined).commits).toEqual([]);
  });
});

const pullNode = (over: Record<string, unknown> = {}) => ({
  id: 'PR_1',
  number: 7,
  title: 'Add',
  state: 'OPEN',
  isDraft: true,
  reviewDecision: 'APPROVED',
  headRefName: 'feat',
  url: 'https://github.com/o/n/pull/7',
  mergedAt: null,
  closedAt: null,
  author: { login: 'bilo' },
  comments: { totalCount: 3 },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
  ...over,
});

describe('pulls', () => {
  it('builds a search for mine and review-requested, and a repository query for all', () => {
    expect(pullsQuery('o', 'n', 'mine', 20).variables['q']).toBe('is:pr is:open author:@me repo:o/n');
    expect(pullsQuery('o', 'n', 'review-requested', 20).variables['q']).toBe(
      'is:pr is:open review-requested:@me repo:o/n',
    );
    expect(pullsQuery('o', 'n', 'review-requested', 20).query).toContain('search(');
    expect(pullsQuery('o', 'n', 'all', 20).query).toContain('pullRequests(states:OPEN');
  });

  it('parses repository.pullRequests and search the same way', () => {
    const rows = [pullNode(), pullNode({ number: 8, state: 'MERGED', commits: { nodes: [] }, reviewDecision: null }), {}];
    const viaRepo = parsePullsPage({
      repository: { pullRequests: { pageInfo: { hasNextPage: true, endCursor: 'c' }, nodes: rows } },
    });
    const viaSearch = parsePulls({ search: { nodes: rows } });
    expect(viaRepo.hasNextPage).toBe(true);
    expect(viaRepo.endCursor).toBe('c');
    expect(viaRepo.pulls).toEqual(viaSearch);
    expect(viaSearch).toHaveLength(2);
    expect(viaSearch[0]).toMatchObject({
      number: 7,
      isDraft: true,
      checks: 'failing',
      reviewDecision: 'APPROVED',
      commentCount: 3,
      author: 'bilo',
    });
    expect(viaSearch[1]).toMatchObject({ state: 'merged', checks: null, reviewDecision: null });
  });

  it('parses a detail', () => {
    const detail = parsePullDetail({
      repository: {
        pullRequest: pullNode({
          body: 'hello',
          headRefOid: 'h',
          baseRefOid: 'b',
          baseRefName: 'main',
          additions: 5,
          deletions: 2,
          changedFiles: 1,
          mergeable: 'MERGEABLE',
          allCommits: { totalCount: 9, nodes: [{ commit: { oid: 'x', messageHeadline: 'fix' } }] },
          reviewRequests: {
            nodes: [{ requestedReviewer: { login: 'ada' } }, { requestedReviewer: { name: 'core-team' } }, {}],
          },
        }),
      },
    });
    expect(detail).toMatchObject({
      body: 'hello',
      headSha: 'h',
      baseBranch: 'main',
      additions: 5,
      commitCount: 9,
      commits: [{ sha: 'x', subject: 'fix' }],
      reviewRequests: ['ada', 'core-team'],
      pull: { number: 7 },
    });
    expect(parsePullDetail({ repository: { pullRequest: null } })).toBeNull();
    expect(pullDetailQuery('o', 'n', 7).variables).toEqual({ owner: 'o', name: 'n', number: 7 });
  });
});

describe('issues', () => {
  const issue = {
    id: 'I_1',
    number: 4,
    title: 'Bug',
    state: 'CLOSED',
    url: 'u',
    createdAt: 'c',
    updatedAt: 'up',
    author: { login: 'bilo' },
    labels: { nodes: [{ name: 'bug', color: 'f00' }, { color: 'x' }] },
    assignees: { nodes: [{ login: 'ada' }] },
    milestone: { title: 'v1' },
    body: 'text',
  };

  it('parses a page and a detail', () => {
    const page = parseIssues({
      repository: { issues: { pageInfo: { hasNextPage: false, endCursor: 'z' }, nodes: [issue, { state: 'WEIRD' }] } },
    });
    expect(page.issues).toHaveLength(1);
    expect(page.issues[0]).toMatchObject({
      state: 'closed',
      labels: [{ name: 'bug', color: 'f00' }],
      assignees: ['ada'],
      milestone: { title: 'v1' },
    });
    expect(page.endCursor).toBe('z');
    expect(parseIssueDetail({ repository: { issue } })?.body).toBe('text');
    expect(parseIssueDetail({ repository: { issue: null } })).toBeNull();
    expect(issueDetailQuery('o', 'n', 4).variables['number']).toBe(4);
  });
});

describe('repos and branches', () => {
  it('merges viewer and org repos, de-duplicates and sorts by push time', () => {
    const repo = (owner: string, name: string, pushedAt: string, isPrivate = false) => ({
      name,
      owner: { login: owner },
      pushedAt,
      isPrivate,
      defaultBranchRef: { name: 'main' },
    });
    const list = parseRepoList({
      viewer: {
        repositories: { nodes: [repo('me', 'a', '2026-01-01T00:00:00Z'), repo('me', 'b', '2026-03-01T00:00:00Z', true)] },
        organizations: {
          nodes: [{ repositories: { nodes: [repo('org', 'c', '2026-02-01T00:00:00Z'), repo('me', 'a', '2026-01-01T00:00:00Z')] } }],
        },
      },
    });
    expect(list.map((r) => `${r.owner}/${r.name}`)).toEqual(['me/b', 'org/c', 'me/a']);
    expect(list[0]).toEqual({ owner: 'me', name: 'b', defaultBranch: 'main', pushedAt: '2026-03-01T00:00:00Z', isPrivate: true });
    expect(repoListQuery(50).variables).toEqual({ first: 50, after: null });
  });

  it('lists branch names', () => {
    expect(parseBranches({ repository: { refs: { nodes: [{ name: 'main' }, { name: 'dev' }, {}] } } })).toEqual(['main', 'dev']);
    expect(branchesQuery('o', 'n', 100).variables['first']).toBe(100);
  });
});

describe('mutations', () => {
  it('build requests with variables only', () => {
    expect(submitReviewMutation('P', 'APPROVE', 'ok').variables).toEqual({
      input: { pullRequestId: 'P', event: 'APPROVE', body: 'ok' },
    });
    expect(addCommentMutation('S', 'b').variables).toEqual({ input: { subjectId: 'S', body: 'b' } });
    expect(replyToThreadMutation('T', 'b').variables).toEqual({ input: { pullRequestReviewThreadId: 'T', body: 'b' } });
    expect(setProjectFieldMutation('P', 'I', 'F', 'O').variables).toEqual({
      input: { projectId: 'P', itemId: 'I', fieldId: 'F', value: { singleSelectOptionId: 'O' } },
    });
    expect(setIssueStateMutation('X', 'CLOSED').query).toContain('closeIssue');
    expect(setIssueStateMutation('X', 'OPEN').query).toContain('reopenIssue');
    expect(createIssueMutation('R', 't', 'b').variables).toEqual({ input: { repositoryId: 'R', title: 't', body: 'b' } });
  });
});

describe('review parsers take data', () => {
  it('counts comments per aliased PR', () => {
    expect(reviewCommentCountsQuery([3])).toContain('p3:pullRequest(number:3)');
    const counts = parseReviewCommentCounts({
      repository: { p3: { reviewThreads: { nodes: [{ comments: { totalCount: 2 } }, { comments: { totalCount: 1 } }] } }, p9: null },
    });
    expect(counts.get(3)).toBe(3);
    expect(counts.has(9)).toBe(false);
  });

  it('drops a thread with no comments', () => {
    expect(
      parseReviewThreads({
        repository: { pullRequest: { reviewThreads: { nodes: [{ id: 't', path: 'a.ts', comments: { nodes: [] } }] } } },
      }),
    ).toEqual([]);
  });
});
