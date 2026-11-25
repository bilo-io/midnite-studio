// vitest/node: the pull overview parser (Phase 146 Theme I).
import { describe, expect, it } from 'vitest';
import { checkConclusion, parsePullOverview } from './pull-overview';

const data = {
  repository: {
    pullRequest: {
      reviewRequests: { nodes: [{ requestedReviewer: { login: 'zed' } }, { requestedReviewer: { name: 'core-team' } }] },
      latestReviews: { nodes: [{ state: 'APPROVED', author: { login: 'ada' } }, { state: 'CHANGES_REQUESTED', author: { login: 'zed' } }] },
      comments: { nodes: [{ id: 'c1', author: { login: 'ada' }, body: 'hi', createdAt: '2026-01-01T00:00:00Z' }] },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  nodes: [
                    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://x/1' },
                    { __typename: 'CheckRun', name: 'lint', status: 'IN_PROGRESS', conclusion: null, detailsUrl: null },
                    { __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE', targetUrl: 'https://x/2' },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  },
};

describe('parsePullOverview', () => {
  it('maps checks, reviewers (latest review wins over a request) and comments', () => {
    const o = parsePullOverview(data);
    expect(o.checks.map((c) => [c.name, c.conclusion])).toEqual([
      ['build', 'success'],
      ['lint', 'pending'],
      ['ci/legacy', 'failure'],
    ]);
    expect(o.reviewers).toEqual([
      { login: 'zed', state: 'CHANGES_REQUESTED' },
      { login: 'core-team', state: 'REQUESTED' },
      { login: 'ada', state: 'APPROVED' },
    ]);
    expect(o.comments).toEqual([{ id: 'c1', author: 'ada', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }]);
  });
  it('tolerates an empty payload', () => {
    expect(parsePullOverview({})).toEqual({ checks: [], reviewers: [], comments: [] });
  });
  it('classifies conclusions', () => {
    expect(checkConclusion('COMPLETED', 'SKIPPED')).toBe('skipped');
    expect(checkConclusion('COMPLETED', 'TIMED_OUT')).toBe('failure');
  });
});
