import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, StatusResult } from '@midnite/studio-shared';

import { ToastHost } from '../components/toast-host';
import { useOpsJournalStore } from '../store/ops-journal-store';
import { keys } from './queries';
import { useTargetedGitOp } from './use-status';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

function installBridge(overrides: Partial<MidniteStudioBridge> = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    status: { get: vi.fn().mockResolvedValue(statusAt(HEAD_AFTER)) } as unknown as MidniteStudioBridge['status'],
    ...overrides,
  };
}

const HEAD_BEFORE = 'a'.repeat(40);
const HEAD_AFTER = 'b'.repeat(40);

function statusAt(oid: string): StatusResult {
  return {
    branch: { head: 'main', oid, upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
    entries: [],
    inProgress: null,
  };
}

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useOpsJournalStore.setState({ entriesByRepo: {} });
});

/**
 * `useTargetedGitOp` is the one seam every git write in the app runs
 * through (Phase 22 Theme H) — these pin its journal-recording and
 * toast-raising behaviour down directly, rather than trusting that
 * every one of the dozen call sites that use it got it right.
 */
describe('useTargetedGitOp — journal recording', () => {
  it('records a journal entry for a successful op, reading headBefore from the cached status', async () => {
    installBridge({
      ops: { commit: vi.fn().mockResolvedValue({ ok: true }) } as unknown as MidniteStudioBridge['ops'],
    });

    const client = new QueryClient();
    client.setQueryData(keys.status('r1'), statusAt(HEAD_BEFORE));

    const { result } = renderHook(
      () =>
        useTargetedGitOp({ repoId: 'r1' }, 'commit', (api, args: { message: string }, ctx) =>
          api.ops.commit({ ...ctx, message: args.message, amend: false }),
        ),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <ToastHost>{children}</ToastHost>
          </QueryClientProvider>
        ),
      },
    );

    await act(async () => {
      await result.current.mutateAsync({ message: 'wip' });
    });

    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'commit',
      label: 'Committed',
      headBefore: HEAD_BEFORE,
      headAfter: HEAD_AFTER,
      undoable: true,
    });
  });

  it('does not record anything when the op fails', async () => {
    installBridge({
      ops: {
        commit: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'nope' }),
      } as unknown as MidniteStudioBridge['ops'],
    });

    const { result } = renderHook(
      () =>
        useTargetedGitOp({ repoId: 'r1' }, 'commit', (api, args: { message: string }, ctx) =>
          api.ops.commit({ ...ctx, message: args.message, amend: false }),
        ),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ message: 'wip' });
    });

    expect(useOpsJournalStore.getState().entriesByRepo.r1 ?? []).toHaveLength(0);
  });

  it('honours a journalHint that overrides the generic HEAD-shaped capture', async () => {
    installBridge({
      ops: { branchDelete: vi.fn().mockResolvedValue({ ok: true }) } as unknown as MidniteStudioBridge['ops'],
    });

    const { result } = renderHook(
      () =>
        useTargetedGitOp(
          { repoId: 'r1' },
          'branch-delete',
          (api, args: { name: string }, ctx) => api.ops.branchDelete({ ...ctx, name: args.name, force: true }),
          (args) => ({
            label: `Deleted branch ${args.name}`,
            refBefore: `refs/heads/${args.name}`,
            headBefore: 'd'.repeat(40),
            headAfter: null,
          }),
        ),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'feature/x' });
    });

    const entry = (useOpsJournalStore.getState().entriesByRepo.r1 ?? [])[0];
    expect(entry).toMatchObject({
      op: 'branch-delete',
      label: 'Deleted branch feature/x',
      refBefore: 'refs/heads/feature/x',
      headBefore: 'd'.repeat(40),
      headAfter: null,
      undoable: true,
    });
  });
});
