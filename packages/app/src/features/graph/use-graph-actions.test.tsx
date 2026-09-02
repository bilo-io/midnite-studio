import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, Ref } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { ToastHost } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import type { SyncAction } from './ref-sync';
import { useGraphActions } from './use-graph-actions';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastHost>
        <DialogHost>{children}</DialogHost>
      </ToastHost>
    </QueryClientProvider>
  );
}

function installBridge(overrides: Partial<MidniteStudioBridge> & { ops?: Record<string, unknown> } = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    remotes: { list: vi.fn().mockResolvedValue([]) },
    // `useTargetedGitOp` reads this to fill in a journal entry's `headAfter`
    // after every successful op — absent, `api.status.get` throws
    // synchronously (calling `.get` on `undefined`) rather than rejecting, so
    // the mutation's own `.catch(() => null)` never gets a chance to run.
    status: {
      get: vi.fn().mockResolvedValue({
        branch: { head: 'main', oid: 'a'.repeat(40), upstream: 'origin/main', ahead: 0, behind: 0, unborn: false, detached: false },
        entries: [],
        inProgress: null,
      }),
    },
    ...overrides,
    ops: {
      blastRadius: vi.fn().mockResolvedValue({ count: 0, sample: [] }),
      ...overrides.ops,
    },
  } as unknown as Partial<MidniteStudioBridge>;
}

const localMain: Ref = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: { name: 'origin/main', ahead: 1, behind: 0, gone: false },
  isHead: true,
  worktreePath: null,
};

const remoteMain: Ref = {
  name: 'origin/main',
  fullName: 'refs/remotes/origin/main',
  kind: 'remoteBranch',
  sha: 'b'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
};

const pushAction: SyncAction = {
  kind: 'push',
  label: 'Push 1 commit to origin/main',
  disabled: false,
  remote: 'origin',
  branch: 'main',
  setUpstream: false,
  count: 1,
};

const forcePushLabel = (items: ReturnType<typeof useGraphActions>['refMenu'] extends (
  ...args: never[]
) => infer R
  ? R
  : never) => items.find((i) => 'label' in i && i.label?.startsWith('Force-push'));

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({
    selectedRepoId: null,
    selectedWorktreePath: undefined,
    allowForceWithLease: false,
  });
});

describe('force-push with lease (Phase 22 Theme F)', () => {
  it('does not offer force-push before any push has been rejected', () => {
    useUiStore.setState({ selectedRepoId: 'r1', allowForceWithLease: true });
    installBridge();

    const { result } = renderHook(() => useGraphActions(() => {}, [localMain, remoteMain]), { wrapper });
    expect(forcePushLabel(result.current.refMenu(localMain, 'main'))).toBeUndefined();
  });

  it('offers force-push once a plain push comes back non-fast-forward, only with the setting on', async () => {
    useUiStore.setState({ selectedRepoId: 'r1', allowForceWithLease: false });
    const push = vi
      .fn()
      .mockResolvedValue({ ok: false, kind: 'error', message: 'nope', code: 'non-fast-forward' });
    installBridge({ ops: { push } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useGraphActions(() => {}, [localMain, remoteMain]), { wrapper });

    await act(async () => {
      result.current.runSync(localMain, pushAction);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));

    // Rejected, but the setting is off — still not offered.
    expect(forcePushLabel(result.current.refMenu(localMain, 'main'))).toBeUndefined();

    act(() => useUiStore.setState({ allowForceWithLease: true }));
    expect(forcePushLabel(result.current.refMenu(localMain, 'main'))).toBeDefined();
  });

  it('clears the offer once a later push settles any other way', async () => {
    useUiStore.setState({ selectedRepoId: 'r1', allowForceWithLease: true });
    const push = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: 'error', message: 'nope', code: 'non-fast-forward' })
      .mockResolvedValueOnce({ ok: true });
    installBridge({ ops: { push } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useGraphActions(() => {}, [localMain, remoteMain]), { wrapper });

    await act(async () => {
      result.current.runSync(localMain, pushAction);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(forcePushLabel(result.current.refMenu(localMain, 'main'))).toBeDefined();

    await act(async () => {
      result.current.runSync(localMain, pushAction);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(forcePushLabel(result.current.refMenu(localMain, 'main'))).toBeUndefined();
  });

  it('leases against the matching remote-tracking ref\'s sha from `refs`, not a fresh read', async () => {
    useUiStore.setState({ selectedRepoId: 'r1', allowForceWithLease: true });
    const push = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: 'error', message: 'nope', code: 'non-fast-forward' })
      .mockResolvedValueOnce({ ok: true });
    installBridge({ ops: { push } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useGraphActions(() => {}, [localMain, remoteMain]), { wrapper });

    await act(async () => {
      result.current.runSync(localMain, pushAction);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));

    const item = forcePushLabel(result.current.refMenu(localMain, 'main'));
    expect(item).toBeDefined();
    if (!item || !('onSelect' in item) || !item.onSelect) throw new Error('expected onSelect');

    act(() => item.onSelect());

    const confirmButton = await screen.findByRole('button', { name: 'Force-push (with lease)' });
    expect(screen.getByText(/Force-push main to origin\/main\?/)).toBeTruthy();

    await act(async () => {
      confirmButton.click();
    });

    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(push).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceWithLease: { ref: 'refs/heads/main', expect: remoteMain.sha },
      }),
    );
  });

  it('refuses to offer force-push when the branch has no upstream to lease against', async () => {
    useUiStore.setState({ selectedRepoId: 'r1', allowForceWithLease: true });
    const push = vi
      .fn()
      .mockResolvedValue({ ok: false, kind: 'error', message: 'nope', code: 'non-fast-forward' });
    installBridge({ ops: { push } as unknown as MidniteStudioBridge['ops'] });

    const noUpstream: Ref = { ...localMain, upstream: null };
    const { result } = renderHook(() => useGraphActions(() => {}, [noUpstream]), { wrapper });

    await act(async () => {
      result.current.runSync(noUpstream, { ...pushAction, setUpstream: true });
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));

    // Rejected and the setting is on, but there is still no upstream ref to
    // read a lease sha from — nothing to offer.
    expect(forcePushLabel(result.current.refMenu(noUpstream, 'main'))).toBeUndefined();
  });
});
