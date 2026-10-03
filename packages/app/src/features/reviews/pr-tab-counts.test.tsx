// vitest/jsdom: pure counting rules plus tab-strip DOM text — no browser capability needed.
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { PrDetail } from './pr-detail';
import { checksCount, conversationCount, filesCount } from './pr-tab-counts';

afterEach(cleanup);

const thread = (n: number) => ({ comments: Array.from({ length: n }, () => ({})) }) as never;
const run = (headSha: string) => ({ headSha }) as never;

describe('pr-tab-counts', () => {
  it('conversation sums timeline entries and thread comments', () => {
    expect(conversationCount([{}, {}] as never, [thread(2), thread(1)])).toBe(5);
  });
  it('conversation is unknown until something has loaded, and hidden at zero', () => {
    expect(conversationCount(null, null)).toBeNull();
    expect(conversationCount([], [])).toBeNull();
  });
  it('checks counts only runs for the head commit', () => {
    expect(checksCount([run('a'), run('b'), run('a')], 'a')).toBe(2);
    expect(checksCount([run('a')], null)).toBeNull();
    expect(checksCount(null, 'a')).toBeNull();
  });
  it('files hides zero and unknown', () => {
    expect(filesCount(8)).toBe(8);
    expect(filesCount(0)).toBeNull();
    expect(filesCount(null)).toBeNull();
  });
});

const SHA = 'c'.repeat(40);
const data: MockFixtures = {
  ...fixtures,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:o/r.git',
      pushUrl: 'git@github.com:o/r.git',
      forge: { host: 'github.com', owner: 'o', repo: 'r', kind: 'github' },
    },
  ],
  forge: {
    cli: { reason: 'ready' },
    pulls: [
      {
        number: 7,
        title: 'T',
        state: 'open',
        isDraft: false,
        reviewDecision: null,
        checks: null,
        headBranch: 'feat/x',
        author: 'a',
        mergedAt: null,
        closedAt: null,
        url: 'https://github.com/o/r/pull/7',
      },
    ],
    pullDetail: {
      '7': { body: 'b', headSha: SHA, baseBranch: 'main', changedFiles: 8, commitCount: 4 },
    },
    pullComments: {
      '7': [
        {
          id: '1',
          kind: 'comment',
          author: 'a',
          body: 'x',
          createdAt: '2026-01-01T00:00:00Z',
          url: '',
        },
        {
          id: '2',
          kind: 'comment',
          author: 'b',
          body: 'y',
          createdAt: '2026-01-02T00:00:00Z',
          url: '',
        },
      ],
    },
    pullThreads: {
      '7': [
        {
          id: 't1',
          path: 'a.ts',
          line: 1,
          isResolved: false,
          comments: [
            { id: 'c1', author: 'a', body: 'z', createdAt: '2026-01-03T00:00:00Z', url: '' },
            { id: 'c2', author: 'b', body: 'w', createdAt: '2026-01-04T00:00:00Z', url: '' },
          ],
        },
      ],
    },
    runs: [
      { id: '1', headSha: SHA, createdAt: '2026-01-01T00:00:00Z', headBranch: 'feat/x' },
      { id: '2', headSha: SHA, createdAt: '2026-01-02T00:00:00Z', headBranch: 'feat/x' },
      { id: '3', headSha: 'd'.repeat(40), createdAt: '2026-01-03T00:00:00Z', headBranch: 'feat/x' },
    ],
  },
};

describe('PrDetail tab count pills', () => {
  it('shows a pill beside Files, Conversation and Checks once data lands', async () => {
    renderView(<PrDetail repoId="repo-1" number={7} />, { fixtures: data });
    expect((await screen.findByTestId('pr-tab-count-files')).textContent).toBe('8');
    expect((await screen.findByTestId('pr-tab-count-conversation')).textContent).toBe('4');
    expect((await screen.findByTestId('pr-tab-count-checks')).textContent).toBe('2');
    expect(screen.queryByTestId('pr-tab-count-overview')).toBeNull();
  });
});
