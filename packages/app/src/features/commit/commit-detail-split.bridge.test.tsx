import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COMMIT_SHA as SHA, fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { CommitDetail } from './commit-detail';

/**
 * The inspector's `split` layout — what the git graph expands under a commit
 * row. Same state and parts as the stacked inspector
 * (`commit-detail.bridge.test.tsx`); what differs is that the diff owns the
 * whole right column, and that it shows every file, one file, or a
 * Cmd/Ctrl-click multi-selection.
 */

const open = () =>
  renderView(<CommitDetail repoId="repo-1" sha={SHA} layout="split" />, {
    fixtures,
    uiState: { selectedRepoId: 'repo-1', commitFileView: 'list' },
  });

const fileList = () => screen.getByTestId('commit-files');
const diffPane = () => screen.getByTestId('commit-diff-pane');

afterEach(cleanup);

describe('CommitDetail, split layout', () => {
  it('puts the details and the file list left, and every file on the right until one is picked', async () => {
    open();
    await screen.findByTestId('commit-identities');
    expect(within(fileList()).getByRole('button', { name: 'pnpm-lock.yaml' })).toBeTruthy();
    // Nothing picked: the right column is the all-changes accordion, collapsed.
    expect(within(diffPane()).getByRole('button', { name: 'Expand all files' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View all changes at once' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('one file is its diff; Cmd-click grows it into an open accordion of just the picks', async () => {
    open();
    await screen.findByTestId('commit-identities');

    fireEvent.click(within(fileList()).getByRole('button', { name: 'packages/desktop/src/main/window.ts' }));
    await waitFor(() => expect(within(diffPane()).getAllByTestId('diff-view')).toHaveLength(1));
    expect(within(diffPane()).queryByRole('button', { name: 'Expand all files' })).toBeNull();

    fireEvent.click(within(fileList()).getByRole('button', { name: '.github/workflows/ci.yml' }), {
      metaKey: true,
    });
    await waitFor(() => expect(within(diffPane()).getAllByTestId('diff-view')).toHaveLength(2));
    expect(within(diffPane()).getByText('2 files')).toBeTruthy();

    // "View all" drops the picks and goes back to every file.
    fireEvent.click(screen.getByRole('button', { name: 'View all changes at once' }));
    await waitFor(() => expect(within(diffPane()).queryAllByTestId('diff-view')).toHaveLength(0));
    expect(within(diffPane()).getByText('5 files')).toBeTruthy();
  });

  it('Cmd-click on a picked file takes it back out', async () => {
    open();
    await screen.findByTestId('commit-identities');
    const list = fileList();
    fireEvent.click(within(list).getByRole('button', { name: 'packages/desktop/src/main/window.ts' }));
    fireEvent.click(within(list).getByRole('button', { name: '.github/workflows/ci.yml' }), { metaKey: true });
    fireEvent.click(within(list).getByRole('button', { name: '.github/workflows/ci.yml' }), { metaKey: true });
    await waitFor(() => expect(within(diffPane()).getAllByTestId('diff-view')).toHaveLength(1));
    expect(
      within(list).getByRole('button', { name: '.github/workflows/ci.yml' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('has one close button, last in the diff viewer header, and none in the left panel', async () => {
    const onClose = vi.fn();
    renderView(<CommitDetail repoId="repo-1" sha={SHA} layout="split" onClose={onClose} />, {
      fixtures,
      uiState: { selectedRepoId: 'repo-1', commitFileView: 'list' },
    });
    await screen.findByTestId('commit-identities');
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    const header = screen.getByTestId('diff-viewer-header');
    expect(header.lastElementChild).toBe(closes[0]);
    expect(within(screen.getByTestId('commit-left-panel')).queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(closes[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bolds the total line counts and fills the column height', async () => {
    open();
    await screen.findByTestId('commit-identities');
    const totals = screen.getAllByTestId('change-totals')[0]!;
    expect(totals.querySelector('.font-bold')).not.toBeNull();
    expect(screen.getByTestId('commit-left-panel').className).toContain('h-full');
  });

  it('paints the divider with a gradient between the two lane colours', async () => {
    renderView(
      <CommitDetail
        repoId="repo-1"
        sha={SHA}
        layout="split"
        dividerGradient={{ from: 'rgb(1, 2, 3)', to: 'rgb(4, 5, 6)' }}
      />,
      { fixtures, uiState: { selectedRepoId: 'repo-1', commitFileView: 'list' } },
    );
    await screen.findByTestId('commit-identities');
    const rule = document.querySelector('[data-resize-gradient]') as HTMLElement;
    expect(rule.style.backgroundImage).toContain('linear-gradient(to bottom, rgb(1, 2, 3), rgb(4, 5, 6))');
  });
});
