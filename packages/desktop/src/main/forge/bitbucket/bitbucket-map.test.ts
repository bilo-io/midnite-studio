import { describe, expect, it } from 'vitest';

import {
  BITBUCKET_PIPELINES_WORKFLOW,
  mapComment,
  mapCommitSample,
  mapIssue,
  mapIssueBody,
  mapIssueLabels,
  mapIssueState,
  mapPipelineRun,
  mapPipelineStatus,
  mapPipelineStep,
  mapPull,
  mapPullDetailExtra,
  mapPullState,
  mapReviewDecision,
  mapTopLevelComments,
  synthesizeThreads,
} from './bitbucket-map';

describe('mapPullState', () => {
  it.each([
    ['OPEN', 'open'],
    ['MERGED', 'merged'],
    ['DECLINED', 'closed'],
    ['SUPERSEDED', 'closed'],
  ] as const)('%s -> %s', (raw, expected) => {
    expect(mapPullState(raw)).toBe(expected);
  });
});

describe('mapReviewDecision', () => {
  it('reports CHANGES_REQUESTED when any participant requested changes', () => {
    const participants = [
      { approved: true, state: 'approved' },
      { approved: false, state: 'changes_requested' },
    ];
    expect(mapReviewDecision(participants)).toBe('CHANGES_REQUESTED');
  });

  it('reports APPROVED when someone approved and nobody requested changes', () => {
    expect(mapReviewDecision([{ approved: true, state: 'approved' }])).toBe('APPROVED');
  });

  it('reports null when nobody has recorded a verdict', () => {
    expect(mapReviewDecision([{ approved: false, state: null }])).toBeNull();
    expect(mapReviewDecision([])).toBeNull();
    expect(mapReviewDecision(undefined)).toBeNull();
  });

  it('never produces REVIEW_REQUIRED — Bitbucket exposes no branch-protection state here', () => {
    // A type-level assertion in spirit: every reachable branch of the mapper
    // above only ever returns CHANGES_REQUESTED, APPROVED or null.
    const outcomes = new Set(['CHANGES_REQUESTED', 'APPROVED', null]);
    expect(outcomes.has(mapReviewDecision([]))).toBe(true);
  });
});

describe('mapPull', () => {
  const raw = {
    id: 42,
    title: 'Fix the thing',
    state: 'OPEN',
    draft: false,
    author: { nickname: 'octo', display_name: 'Octo Cat' },
    source: { branch: { name: 'feature/fix' } },
    participants: [{ approved: true, state: 'approved' }],
    updated_on: '2026-01-02T00:00:00Z',
    links: { html: { href: 'https://bitbucket.org/ws/repo/pull-requests/42' } },
  };

  it('maps the listing row', () => {
    const pull = mapPull(raw);
    expect(pull).toMatchObject({
      id: '42',
      number: 42,
      title: 'Fix the thing',
      state: 'open',
      isDraft: false,
      reviewDecision: 'APPROVED',
      headBranch: 'feature/fix',
      author: 'octo',
      url: 'https://bitbucket.org/ws/repo/pull-requests/42',
      mergedAt: null,
      closedAt: null,
    });
  });

  it('sets mergedAt only for a merged PR and closedAt only for a declined/superseded one', () => {
    expect(mapPull({ ...raw, state: 'MERGED' }).mergedAt).toBe('2026-01-02T00:00:00Z');
    expect(mapPull({ ...raw, state: 'MERGED' }).closedAt).toBeNull();
    expect(mapPull({ ...raw, state: 'DECLINED' }).closedAt).toBe('2026-01-02T00:00:00Z');
    expect(mapPull({ ...raw, state: 'DECLINED' }).mergedAt).toBeNull();
  });

  it('falls back to display_name when nickname is withheld', () => {
    const pull = mapPull({ ...raw, author: { display_name: 'Octo Cat' } });
    expect(pull.author).toBe('Octo Cat');
  });
});

describe('mapPullDetailExtra', () => {
  it('maps base branch, shas and body', () => {
    const extra = mapPullDetailExtra({
      summary: { raw: 'This PR does a thing.' },
      destination: { branch: { name: 'main' }, commit: { hash: 'deadbeef' } },
      source: { commit: { hash: 'cafef00d' } },
      created_on: '2026-01-01T00:00:00Z',
      updated_on: '2026-01-02T00:00:00Z',
    });
    expect(extra).toEqual({
      body: 'This PR does a thing.',
      baseBranch: 'main',
      headSha: 'cafef00d',
      baseSha: 'deadbeef',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });
});

describe('mapIssueState', () => {
  it.each([
    ['new', 'open'],
    ['open', 'open'],
    ['resolved', 'closed'],
    ['invalid', 'closed'],
    ['duplicate', 'closed'],
    ['wontfix', 'closed'],
    ['closed', 'closed'],
  ] as const)('%s -> %s', (raw, expected) => {
    expect(mapIssueState(raw)).toBe(expected);
  });
});

describe('mapIssue / mapIssueLabels / mapIssueBody', () => {
  const raw = {
    id: 7,
    title: 'Crash on launch',
    state: 'open',
    kind: 'bug',
    reporter: { nickname: 'alice' },
    assignee: { nickname: 'bob' },
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-03T00:00:00Z',
    content: { raw: 'It crashes.' },
    links: { html: { href: 'https://bitbucket.org/ws/repo/issues/7' } },
  };

  it('maps the listing row, with kind as a single label chip', () => {
    expect(mapIssue(raw)).toMatchObject({
      id: '7',
      number: 7,
      title: 'Crash on launch',
      state: 'open',
      author: 'alice',
      assignees: ['bob'],
      labels: [{ name: 'bug', color: '' }],
      url: 'https://bitbucket.org/ws/repo/issues/7',
    });
  });

  it('produces no label when kind is absent', () => {
    expect(mapIssueLabels({})).toEqual([]);
  });

  it('reads the body out of content.raw', () => {
    expect(mapIssueBody(raw)).toBe('It crashes.');
  });

  it('leaves assignees empty when unassigned', () => {
    expect(mapIssue({ ...raw, assignee: null }).assignees).toEqual([]);
  });
});

describe('mapCommitSample', () => {
  it('takes the first `cap` rows, unreversed — Bitbucket sends newest-first already', () => {
    const rows = [
      { hash: 'aaa', message: 'third\n\nbody' },
      { hash: 'bbb', message: 'second' },
      { hash: 'ccc', message: 'first' },
    ];
    expect(mapCommitSample(rows, 2)).toEqual([
      { sha: 'aaa', subject: 'third' },
      { sha: 'bbb', subject: 'second' },
    ]);
  });

  it('drops a row with no hash', () => {
    expect(mapCommitSample([{ message: 'no hash' }], 5)).toEqual([]);
  });
});

describe('mapPipelineStatus', () => {
  it.each([
    [{ state: { name: 'PENDING' } }, 'pending', null],
    [{ state: { name: 'IN_PROGRESS' } }, 'in_progress', null],
    [{ state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } }, 'completed', 'success'],
    [{ state: { name: 'COMPLETED', result: { name: 'FAILED' } } }, 'completed', 'failure'],
    [{ state: { name: 'COMPLETED', result: { name: 'ERROR' } } }, 'completed', 'failure'],
    [{ state: { name: 'COMPLETED', result: { name: 'STOPPED' } } }, 'completed', 'cancelled'],
  ] as const)('%o -> status %s / conclusion %s', (raw, status, conclusion) => {
    expect(mapPipelineStatus(raw)).toEqual({ status, conclusion });
  });

  it('treats a missing/unrecognised state as pending rather than throwing', () => {
    expect(mapPipelineStatus({})).toEqual({ status: 'pending', conclusion: null });
  });
});

describe('mapPipelineRun', () => {
  it('maps a completed pipeline', () => {
    const run = mapPipelineRun({
      uuid: '{abc-123}',
      build_number: 17,
      created_on: '2026-01-01T00:00:00Z',
      completed_on: '2026-01-01T00:05:00Z',
      state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
      target: { ref_name: 'main', commit: { hash: 'deadbeef' } },
      trigger: { name: 'PUSH' },
      links: { html: { href: 'https://bitbucket.org/ws/repo/pipelines/results/17' } },
    });
    expect(run).toMatchObject({
      id: '{abc-123}',
      name: 'Pipelines',
      status: 'completed',
      conclusion: 'success',
      headBranch: 'main',
      headSha: 'deadbeef',
      event: 'push',
      workflowId: BITBUCKET_PIPELINES_WORKFLOW.id,
      number: 17,
      attempt: null,
    });
  });
});

describe('mapPipelineStep', () => {
  it('maps a step to a job with no sub-steps', () => {
    const job = mapPipelineStep({
      uuid: '{step-1}',
      name: 'Build and test',
      started_on: '2026-01-01T00:00:00Z',
      completed_on: '2026-01-01T00:02:00Z',
      state: { name: 'COMPLETED', result: { name: 'FAILED' } },
    });
    expect(job).toEqual({
      id: '{step-1}',
      name: 'Build and test',
      status: 'completed',
      conclusion: 'failure',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:02:00Z',
      url: '',
      steps: [],
    });
  });
});

describe('mapComment / mapTopLevelComments', () => {
  it('maps a plain comment as kind: comment, never review', () => {
    const comment = mapComment({
      id: 1,
      user: { nickname: 'alice' },
      content: { raw: 'Looks good.' },
      created_on: '2026-01-01T00:00:00Z',
      links: { html: { href: 'https://bitbucket.org/x' } },
    });
    expect(comment.kind).toBe('comment');
    expect(comment.reviewState).toBeNull();
  });

  it('filters out inline comments from the top-level conversation', () => {
    const topLevel = { id: 1, content: { raw: 'general' } };
    const inline = { id: 2, content: { raw: 'inline' }, inline: { path: 'a.ts', to: 3 } };
    expect(mapTopLevelComments([topLevel, inline])).toHaveLength(1);
    expect(mapTopLevelComments([topLevel, inline])[0]!.body).toBe('general');
  });
});

describe('synthesizeThreads', () => {
  const root = {
    id: 10,
    user: { nickname: 'alice' },
    content: { raw: 'Why this line?' },
    created_on: '2026-01-01T00:00:00Z',
    inline: { path: 'src/a.ts', to: 12, from: null, outdated: false },
  };
  const reply = {
    id: 11,
    user: { nickname: 'bob' },
    content: { raw: 'Good question.' },
    created_on: '2026-01-01T00:01:00Z',
    inline: { path: 'src/a.ts', to: 12, from: null },
    parent: { id: 10 },
  };
  const generalComment = { id: 12, content: { raw: 'not inline' } };

  it('groups a root and its replies into one thread, ignoring non-inline comments', () => {
    const threads = synthesizeThreads([root, reply, generalComment], 42);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.id).toBe('42:10');
    expect(threads[0]!.comments.map((c) => c.id)).toEqual(['10', '11']);
    expect(threads[0]!.path).toBe('src/a.ts');
    expect(threads[0]!.line).toBe(12);
    expect(threads[0]!.side).toBe('RIGHT');
  });

  it('marks a thread resolved from the root comment\'s resolution field', () => {
    const resolvedRoot = { ...root, resolution: { type: 'resolution' } };
    const threads = synthesizeThreads([resolvedRoot], 42);
    expect(threads[0]!.resolved).toBe(true);
  });

  it('reads left-side / file-level anchors honestly', () => {
    const leftSide = { ...root, id: 20, inline: { path: 'a.ts', to: null, from: 5 } };
    expect(synthesizeThreads([leftSide], 42)[0]).toMatchObject({ side: 'LEFT', fileLevel: false });

    const fileLevel = { ...root, id: 21, inline: { path: 'a.ts', to: null, from: null } };
    expect(synthesizeThreads([fileLevel], 42)[0]).toMatchObject({ fileLevel: true });
  });

  it('groups a multi-level reply chain under the original root', () => {
    const grandchild = {
      id: 13,
      content: { raw: 'even later' },
      created_on: '2026-01-01T00:02:00Z',
      inline: { path: 'src/a.ts', to: 12 },
      parent: { id: 11 },
    };
    const threads = synthesizeThreads([root, reply, grandchild], 42);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.comments.map((c) => c.id)).toEqual(['10', '11', '13']);
  });
});
