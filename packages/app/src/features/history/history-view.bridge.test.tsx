import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { HistoryView } from './history-view';

/**
 * Migrated from `e2e/history.spec.ts` (Phase 82 Theme C wave 5) — both tabs'
 * shell, the Reflog tab's newest-first old→new sha rendering, the ref
 * selector's refetch, the action filter's client-side narrowing, and the
 * Checkout button's real op call. 5 of the original 5 tests moved here — no
 * straggler needed a real browser.
 *
 * `HistoryView` has no internal `React.lazy` boundary of its own (only the
 * outer `view-registry.tsx` lazy-loads the *view*, bypassed by mounting the
 * component directly) — the same non-issue prior waves found repeatedly — so
 * no warm-up `beforeAll` is needed. The e2e file's own rail-navigation dance
 * (`goToHistory`'s keyboard-activation workaround) existed only to *reach*
 * this view through the rail; mounting it directly makes that moot.
 */

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

const headReflog = [
  {
    selector: 'HEAD@{1700000100}',
    fullSelector: 'HEAD@{1700000100}',
    sha: SHA_B,
    oldSha: SHA_A,
    subject: 'checkout: moving from feature to main',
    action: 'checkout',
    at: 1700000100,
    author: 'Ada Lovelace',
  },
  {
    selector: 'HEAD@{1700000000}',
    fullSelector: 'HEAD@{1700000000}',
    sha: SHA_A,
    oldSha: null,
    subject: 'commit: first',
    action: 'commit',
    at: 1700000000,
    author: 'Ada Lovelace',
  },
];

const featureReflog = [
  {
    selector: 'feature@{1700000200}',
    fullSelector: 'refs/heads/feature@{1700000200}',
    sha: SHA_C,
    oldSha: SHA_A,
    subject: 'commit: on feature',
    action: 'commit',
    at: 1700000200,
    author: 'Ada Lovelace',
  },
];

const withReflog: MockFixtures = {
  ...fixtures,
  refs: [
    { name: 'main', fullName: 'refs/heads/main', kind: 'localBranch', sha: SHA_B, upstream: null, isHead: true, worktreePath: null },
    { name: 'feature', fullName: 'refs/heads/feature', kind: 'localBranch', sha: SHA_C, upstream: null, isHead: false, worktreePath: null },
  ],
  reflog: headReflog,
  reflogByRef: { 'refs/heads/feature': featureReflog },
};

function open(data: MockFixtures = fixtures) {
  renderView(
    <ToastHost>
      <HistoryView />
    </ToastHost>,
    { fixtures: data, uiState: { selectedRepoId: 'repo-1' } },
  );
}

async function openOnReflog(data: MockFixtures = withReflog) {
  open(data);
  fireEvent.click(screen.getByRole('tab', { name: 'Reflog' }));
  await screen.findByRole('list', { name: 'Reflog' });
}

afterEach(cleanup);

describe('HistoryView, assembled through the real bridge', () => {
  it('renders both tabs, Journal first, with its empty state', () => {
    open();

    const tablist = screen.getByRole('tablist', { name: 'History' });
    expect(within(tablist).getByRole('tab', { name: 'Journal' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(within(tablist).getByRole('tab', { name: 'Reflog' })).toBeTruthy();

    expect(
      screen.getByText(
        'Nothing recorded yet — every write this app makes to this repository will show up here.',
      ),
    ).toBeTruthy();
  });

  it('the Reflog tab lists HEAD by default, newest first, with the old→new sha pair', async () => {
    await openOnReflog();

    const list = screen.getByRole('list', { name: 'Reflog' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('checkout: moving from feature to main');
    expect(rows[0]?.textContent).toContain(`${SHA_A.slice(0, 7)} → ${SHA_B.slice(0, 7)}`);
    expect(rows[1]?.textContent).toContain('commit: first');
    // The oldest entry has no known predecessor — no "→" pair, just its own sha.
    expect(rows[1]?.textContent).not.toContain('→');

    expect(screen.getByText(/prunes unreachable reflog entries after 30 days/)).toBeTruthy();
  });

  it('switching the ref selector re-requests rather than re-filtering one fixed list', async () => {
    await openOnReflog();

    const panel = screen.getByRole('tabpanel', { name: 'Reflog' });
    expect(within(panel).getByRole('list', { name: 'Reflog' }).textContent).toContain(
      'checkout: moving',
    );

    fireEvent.change(within(panel).getByLabelText('Ref', { exact: true }), {
      target: { value: 'refs/heads/feature' },
    });

    const list = await screen.findByRole('list', { name: 'Reflog' });
    await within(list).findByText(/commit: on feature/);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).not.toContain('checkout: moving');
  });

  it('the action filter narrows the list client-side, without refetching', async () => {
    await openOnReflog();

    const panel = screen.getByRole('tabpanel', { name: 'Reflog' });
    fireEvent.change(within(panel).getByLabelText('Action', { exact: true }), {
      target: { value: 'checkout' },
    });

    const list = screen.getByRole('list', { name: 'Reflog' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('checkout: moving');
    expect(list.textContent).not.toContain('commit: first');
  });

  it('checking out an entry runs a detached checkout to that sha', async () => {
    await openOnReflog();

    const row = screen.getAllByRole('listitem').find((item) => item.textContent?.includes('commit: first'))!;
    fireEvent.click(within(row).getByRole('button', { name: 'Checkout' }));

    await waitFor(() => {
      const ops = (
        window as unknown as {
          __mstudioOps: { op: string; args: { target: string; detach: boolean } }[];
        }
      ).__mstudioOps;
      expect(ops).toContainEqual(
        expect.objectContaining({
          op: 'checkout',
          args: expect.objectContaining({ target: SHA_A, detach: true }),
        }),
      );
    });
  });
});
