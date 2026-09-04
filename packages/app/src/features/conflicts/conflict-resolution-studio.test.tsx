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
  truncated?: boolean;
  ops?: Record<string, unknown>;
  councils?: unknown[];
  councilRunStart?: ReturnType<typeof vi.fn>;
  councilRunGet?: ReturnType<typeof vi.fn>;
} = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    status: {
      get: STATUS_GET,
      conflictRegions: vi
        .fn()
        .mockResolvedValue({ hunks: overrides.hunks ?? [], truncated: overrides.truncated ?? false }),
    } as unknown as MidniteStudioBridge['status'],
    ops: new Proxy(
      {},
      { get: (_t, name) => overrides.ops?.[String(name)] ?? vi.fn().mockResolvedValue({ ok: true }) },
    ) as unknown as MidniteStudioBridge['ops'],
    council: {
      list: vi.fn().mockResolvedValue({ councils: overrides.councils ?? [] }),
      run: {
        start: overrides.councilRunStart ?? vi.fn().mockResolvedValue({ ok: true, value: { id: 'run-1' } }),
        get: overrides.councilRunGet ?? vi.fn().mockResolvedValue({ run: null }),
      },
    } as unknown as MidniteStudioBridge['council'],
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

  /**
   * Phase 47 Theme F: the ours/theirs/both → button mapping, pinned at the UI
   * level. Git's own rebase-vs-merge convention flip is proven in git-engine's
   * integration tests (`conflict-flow.integration.test.ts` et al) — this
   * component has no merge/rebase awareness of its own and never should; it
   * only ever passes `side` straight through. What ONLY a UI-level test can
   * catch is a "mislabeling a button" regression — a button's own `onClick`
   * wired to the wrong side, invisible to any git-engine test since nothing
   * there renders a button at all.
   */
  it('"Accept theirs" and "Accept both" each send their own side, not "ours"', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    const applyHunk = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ hunks: TWO_REGIONS, ops: { conflictApplyHunk: applyHunk } });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });
    await screen.findAllByTestId('conflict-region');

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept theirs' })[0]!);
    await waitFor(() => expect(applyHunk).toHaveBeenCalledTimes(1));
    expect(applyHunk).toHaveBeenCalledWith(expect.objectContaining({ regionIndex: 0, side: 'theirs' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept both' })[1]!);
    await waitFor(() => expect(applyHunk).toHaveBeenCalledTimes(2));
    expect(applyHunk).toHaveBeenCalledWith(expect.objectContaining({ regionIndex: 1, side: 'both' }));
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

  it('"Accept all theirs" sends side: "theirs", not "ours" (Phase 47 Theme F)', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    const resolveWholeFile = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ hunks: TWO_REGIONS, ops: { conflictResolveWholeFile: resolveWholeFile } });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    await screen.findAllByTestId('conflict-region');
    fireEvent.click(screen.getByRole('button', { name: 'Accept all theirs' }));

    await waitFor(() => expect(resolveWholeFile).toHaveBeenCalledTimes(1));
    expect(resolveWholeFile).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'r1', path: 'f.txt', side: 'theirs' }),
    );
  });

  it('renders "all regions resolved" once the fetched file has zero conflict segments', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    installBridge({ hunks: [{ segments: [{ kind: 'context', lines: ['plain text now'] }] }] });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByText('all regions resolved')).toBeTruthy();
    expect(screen.queryByTestId('conflict-region')).toBeNull();
  });

  it('warns that some regions may be missing when the underlying diff was truncated', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    installBridge({ hunks: TWO_REGIONS, truncated: true });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    expect(
      await screen.findByText(/too large to show in full/),
    ).toBeTruthy();
  });

  it('shows no truncation warning for an ordinary file', async () => {
    useUiStore.setState({ selectedRepoId: 'r1' });
    installBridge({ hunks: TWO_REGIONS });

    render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

    await screen.findAllByTestId('conflict-region');
    expect(screen.queryByText(/too large to show in full/)).toBeNull();
  });

  describe('"Suggest a resolution" (Phase 47 Theme E)', () => {
    it('shows no council picker and no suggest button when no council exists', async () => {
      useUiStore.setState({ selectedRepoId: 'r1' });
      installBridge({ hunks: TWO_REGIONS, councils: [] });

      render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

      await screen.findAllByTestId('conflict-region');
      expect(screen.queryByLabelText('Suggestions from')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Suggest a resolution' })).toBeNull();
    });

    it('offers a council picker and a suggest button per region once a council exists', async () => {
      useUiStore.setState({ selectedRepoId: 'r1' });
      installBridge({ hunks: TWO_REGIONS, councils: [{ id: 'c1', name: 'Reviewers' }] });

      render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

      await screen.findAllByTestId('conflict-region');
      expect(await screen.findByLabelText('Suggestions from')).toBeTruthy();
      expect(screen.getByRole('option', { name: 'Reviewers' })).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Suggest a resolution' })).toHaveLength(2);
    });

    it('composes a prompt from that exact region and starts a run against the picked council', async () => {
      useUiStore.setState({ selectedRepoId: 'r1' });
      const start = vi.fn().mockResolvedValue({ ok: true, value: { id: 'run-1' } });
      installBridge({ hunks: TWO_REGIONS, councils: [{ id: 'c1', name: 'Reviewers' }], councilRunStart: start });

      render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

      await screen.findAllByTestId('conflict-region');
      fireEvent.click(screen.getAllByRole('button', { name: 'Suggest a resolution' })[0]!);

      await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      const [args] = start.mock.calls[0] as [{ councilId: string; prompt: string }];
      expect(args.councilId).toBe('c1');
      expect(args.prompt).toContain('MAIN1');
      expect(args.prompt).toContain('FEAT1');
      expect(args.prompt).toContain('shared line');
    });

    it('never routes a suggestion through anything other than the advisory panel — Accept buttons are unaffected', async () => {
      useUiStore.setState({ selectedRepoId: 'r1' });
      const applyHunk = vi.fn().mockResolvedValue({ ok: true });
      installBridge({
        hunks: TWO_REGIONS,
        councils: [{ id: 'c1', name: 'Reviewers' }],
        ops: { conflictApplyHunk: applyHunk },
      });

      render(<ConflictResolutionStudio repoId="r1" path="f.txt" onClose={vi.fn()} />, { wrapper });

      await screen.findAllByTestId('conflict-region');
      fireEvent.click(screen.getAllByRole('button', { name: 'Suggest a resolution' })[0]!);
      fireEvent.click(screen.getAllByRole('button', { name: 'Accept mine' })[0]!);

      await waitFor(() => expect(applyHunk).toHaveBeenCalledTimes(1));
      expect(applyHunk).toHaveBeenCalledWith(expect.objectContaining({ regionIndex: 0, side: 'ours' }));
    });
  });
});
