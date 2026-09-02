import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { ToastHost } from '../../components/toast-host';
import { useOpsJournalStore } from '../../store/ops-journal-store';
import { useTargetedStashDrop } from './use-stash-actions';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

function installBridge(overrides: Partial<MidniteStudioBridge> = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = overrides;
}

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useOpsJournalStore.setState({ entriesByRepo: {} });
});

describe('useTargetedStashDrop', () => {
  it('drops the stash and journals it as undoable, capturing the recovered sha', async () => {
    const drop = vi.fn().mockResolvedValue({ ok: true, recoveredSha: 'c'.repeat(40) });
    installBridge({ stash: { drop } as unknown as MidniteStudioBridge['stash'] });

    const { result } = renderHook(() => useTargetedStashDrop({ repoId: 'r1' }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ selector: 'stash@{0}', message: 'wip' });
    });

    expect(drop).toHaveBeenCalledWith({ repoId: 'r1', selector: 'stash@{0}' });

    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.op).toBe('stash-drop');
    expect(entries[0]?.headBefore).toBe('c'.repeat(40));
    expect(entries[0]?.undoable).toBe(true);
    expect(entries[0]?.label).toBe('Dropped stash: wip');
  });

  it('marks the entry un-undoable when git gave back no recoverable sha', async () => {
    installBridge({
      stash: { drop: vi.fn().mockResolvedValue({ ok: true }) } as unknown as MidniteStudioBridge['stash'],
    });

    const { result } = renderHook(() => useTargetedStashDrop({ repoId: 'r1' }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ selector: 'stash@{0}', message: 'wip' });
    });

    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries[0]?.undoable).toBe(false);
  });

  it('does not journal a failed drop', async () => {
    installBridge({
      stash: {
        drop: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'nope' }),
      } as unknown as MidniteStudioBridge['stash'],
    });

    const { result } = renderHook(() => useTargetedStashDrop({ repoId: 'r1' }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ selector: 'stash@{0}', message: 'wip' });
    });

    await waitFor(() => {
      expect(useOpsJournalStore.getState().entriesByRepo.r1 ?? []).toHaveLength(0);
    });
  });

  it('answers with an error, not a throw, when no repository is selected', async () => {
    installBridge({});
    const { result } = renderHook(() => useTargetedStashDrop({ repoId: null }), { wrapper });

    const outcome = await act(async () =>
      result.current.mutateAsync({ selector: 'stash@{0}', message: 'wip' }),
    );

    expect(outcome).toEqual({ ok: false, kind: 'error', message: 'No repository selected.' });
  });
});
