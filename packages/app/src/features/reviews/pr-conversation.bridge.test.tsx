import { cleanup, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { PrDetail } from './pr-detail';

/**
 * The Conversation tab's review threads, assembled through the real bridge
 * (vitest/jsdom — no browser capability needed): `PrDetail` fetches the
 * threads for this tab, nests the one whose `reviewId` matches under the
 * review, shows the diff-hunk excerpt, and Resolve conversation reaches the
 * bridge's `resolveThread` write.
 */

configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

const data: MockFixtures = {
  ...fixtures,
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': { headSha: 'a'.repeat(40), baseBranch: 'main', changedFiles: 1 } },
    pullComments: {
      '42': [
        {
          id: '9001',
          kind: 'review',
          author: 'ana',
          body: '',
          createdAt: '2026-08-26T09:00:00Z',
          url: '',
          reviewState: 'CHANGES_REQUESTED',
        },
      ],
    },
    pullThreads: {
      '42': [
        {
          id: 'PRRT_one',
          path: 'src/app.tsx',
          line: 3,
          originalLine: 3,
          startLine: null,
          side: 'RIGHT',
          resolved: false,
          outdated: false,
          fileLevel: false,
          comments: [
            {
              id: 'PRRC_one',
              databaseId: '1234',
              author: 'ana',
              body: 'Guard clause please.',
              createdAt: '2026-08-26T09:00:00Z',
              url: '',
              diffHunk: '@@ -1,3 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;',
              reviewId: '9001',
            },
          ],
        },
      ],
    },
  },
} as MockFixtures;

describe('PrDetail Conversation tab review threads', () => {
  it('nests the thread under its review, with the excerpt, and resolves it', async () => {
    renderView(
      <ToastHost>
        <PrDetail repoId="repo-1" number={42} />
      </ToastHost>,
      { fixtures: data },
    );
    await screen.findByRole('region', { name: 'Pull request #42' });
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));

    const card = await screen.findByTestId('conversation-thread');
    expect(within(card).getByText('Guard clause please.')).toBeTruthy();
    expect(within(card).getByTestId('hunk-excerpt').textContent).toContain('const b = 3;');
    expect(screen.queryByText('No message.')).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: /Resolve conversation/ }));
    await waitFor(() => {
      const writes = (window as unknown as { __mstudioWrites?: { channel: string }[] }).__mstudioWrites;
      expect(writes?.some((w) => w.channel.includes('resolve'))).toBe(true);
    });
  });
});
