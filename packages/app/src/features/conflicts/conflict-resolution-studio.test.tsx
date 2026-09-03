import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConflictedHunk, MidniteStudioBridge } from '@midnite/studio-shared';

import { ToastHost } from '../../components/toast-host';
import { useOpsJournalStore } from '../../store/ops-journal-store';
import { useUiStore } from '../../store/ui-store';
import { ConflictResolutionStudio } from './conflict-resolution-studio';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

const STATUS_GET = vi.fn().mockResolvedValue({
  branch: { head: 'main', oid: 'a'.repeat(40), upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
  entries: [],
  inProgress: null,
});

function installBridge(overrides: {
  hunks?: ConflictedHunk[];
  ops?: Record<string, unknown>;
} = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    status: {
      get: STATUS_GET,
      conflictRegions: vi.fn().mockResolvedValue(overrides.hunks ?? []),
    } as unknown as MidniteStudioBridge['status'],
    ops: new Proxy(
      {},
      { get: (_t, name) => overrides.ops?.[String(name)] ?? vi.fn().mockResolvedValue({ ok: true }) },
    ) as unknown as MidniteStudioBridge['ops'],
  };
}

const TWO_REGIONS: ConflictedHunk[] = [
  {
    segments: [
      { kind: 'context', lines: ['shared line'] },
      { kind: 'conflict', region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null } },
      { kind: 'context', lines: ['middle'] },
      { kind: 'conflict', region: { ours: ['MAIN2'], theirs: ['FEAT2'], base: null } },
    ],
  },
];

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: undefined });
  useOpsJournalStore.setState({ entriesByRepo: {} });
});

describe('ConflictResolutionStudio', () => {
  it('renders every region with ours/theirs content and a live region count', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    installBridge({ hunks: TWO_REGIONS });

    render(
      <ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />,
      { wrapper },
    );

    expect(await screen.findByText('2 regions left')).toBeTruthy();
    expect(screen.getAllByTestId('conflict-region')).toHaveLength(2);
    expect(screen.getByText('MAIN1')).toBeTruthy();
    expect(screen.getByText('FEAT1')).toBeTruthy();
    expect(screen.getByText('shared line')).toBeTruthy();
  });

  it('accepting "ours" on one region calls conflictApplyHunk with that region\'s exact payload', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    const applyHunk = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ hunks: TWO_REGIONS, ops: { conflictApplyHunk: applyHunk } });

    render(
      <ConflictResolutionStudio repoId="r1" worktreePath="/repo" path="f.txt" onClose={vi.fn()} />,
      { wrapper },
    );

    const [firstRegion] = await screen.findAllByTestId('conflict-region');
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept mine' })[0]!);

    await waitFor(() => expect(applyHunk).toHaveBeenCalledTimes(1));
    expect(applyHunk).toHaveBeenCalledWith({
      repoId: 'r1',
      worktreePath: '/repo',
      path: 'f.txt',
      regionIndex: 0,
      region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null },
      side: 'ours',
    });
    expect(firstRegion).toBeDefined();
  });

  it('shows a stale-write message rather than a generic error when the region moved under it', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    const applyHunk = vi
      .fn()
      .mockResolvedValue({ ok: false, kind: 'error', message: 'stale', code: 'stale-write' });
    installBridge({ hunks: TWO_REGIONS, ops: { conflictApplyHunk: applyHunk } });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    await screen.findAllByTestId('conflict-region');
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept mine' })[0]!);

    expect(
      await screen.findByText('This file changed since these regions were read — refreshed below.'),
    ).toBeTruthy();
  });

  it('"Accept all mine" calls the whole-file op and closes the Studio on success', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    const resolveWholeFile = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ hunks: TWO_REGIONS, ops: { conflictResolveWholeFile: resolveWholeFile } });
    const onClose = vi.fn();

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={onClose} />, { wrapper });

    await screen.findAllByTestId('conflict-region');
    fireEvent.click(screen.getByRole('button', { name: 'Accept all mine' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(resolveWholeFile).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'r1', path: 'f.txt', side: 'ours' }),
    );
  });

  it('renders "all regions resolved" once the fetched file has zero conflict segments', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    installBridge({ hunks: [{ segments: [{ kind: 'context', lines: ['plain text now'] }] }] });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByText('all regions resolved')).toBeTruthy();
    expect(screen.queryByTestId('conflict-region')).toBeNull();
  });
});
