import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, OpJournalEntry } from '@midnite/studio-shared';

import { ToastHost } from '../components/toast-host';
import { useOpsJournalStore } from '../store/ops-journal-store';
import { shouldToastOp, useUndoJournalEntry, WIRED_UNDO_OPS } from './use-journal';

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

const baseEntry = (over: Partial<OpJournalEntry> = {}): OpJournalEntry => ({
  id: 'e1',
  repoId: 'r1',
  op: 'stash-drop',
  label: 'Dropped stash: wip',
  at: Date.now(),
  headBefore: 'a'.repeat(40),
  headAfter: null,
  refBefore: null,
  undoable: true,
  ...over,
});

describe('WIRED_UNDO_OPS', () => {
  it('is exactly stash-drop and branch-delete — the starter subset', () => {
    expect([...WIRED_UNDO_OPS].sort()).toEqual(['branch-delete', 'stash-drop']);
  });
});

describe('shouldToastOp', () => {
  it('does not toast routine, frequent writes', () => {
    for (const op of ['fetch', 'pull', 'stage', 'unstage', 'commit', 'branch-create'] as const) {
      expect(shouldToastOp(op), `expected no toast for ${op}`).toBe(false);
    }
  });

  it('toasts the destructive-or-notable ops', () => {
    for (const op of ['reset', 'discard', 'checkout', 'branch-delete', 'stash-drop'] as const) {
      expect(shouldToastOp(op), `expected a toast for ${op}`).toBe(true);
    }
  });
});

describe('useUndoJournalEntry', () => {
  it('restores a dropped stash via stash.store, using the captured sha', async () => {
    const store = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ stash: { store } as unknown as MidniteStudioBridge['stash'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(baseEntry());

    expect(outcome).toEqual({ ok: true });
    expect(store).toHaveBeenCalledWith({ repoId: 'r1', sha: 'a'.repeat(40), message: 'Dropped stash: wip' });
  });

  it('records the restore as its own journal entry, not a rewrite of the original', async () => {
    installBridge({
      stash: { store: vi.fn().mockResolvedValue({ ok: true }) } as unknown as MidniteStudioBridge['stash'],
    });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    await result.current(baseEntry());

    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.op).toBe('stash-store');
    expect(entries[0]?.label).toMatch(/^Undo: /);
    expect(entries[0]?.undoable).toBe(false);
  });

  it('recreates a deleted branch at its prior sha, stripping refs/heads/', async () => {
    const branchCreate = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { branchCreate } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const entry = baseEntry({
      op: 'branch-delete',
      headBefore: 'b'.repeat(40),
      refBefore: 'refs/heads/feature/x',
      label: 'Deleted branch feature/x',
    });
    const outcome = await result.current(entry);

    expect(outcome).toEqual({ ok: true });
    expect(branchCreate).toHaveBeenCalledWith({
      repoId: 'r1',
      name: 'feature/x',
      startPoint: 'b'.repeat(40),
      checkout: false,
    });
  });

  it('refuses to undo an op with no wired executor', async () => {
    installBridge({});
    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(baseEntry({ op: 'commit' }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.kind !== 'error') throw new Error('expected an error');
    expect(outcome.message).toMatch(/not wired up/);
  });

  it('refuses when the anchor was never captured, rather than calling the bridge with nulls', async () => {
    const store = vi.fn();
    installBridge({ stash: { store } as unknown as MidniteStudioBridge['stash'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(baseEntry({ headBefore: null }));

    expect(outcome.ok).toBe(false);
    expect(store).not.toHaveBeenCalled();
  });

  it('reports the bridge failure rather than throwing, on a rejected restore', async () => {
    installBridge({
      stash: {
        store: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'nope' }),
      } as unknown as MidniteStudioBridge['stash'],
    });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(baseEntry());

    expect(outcome).toEqual({ ok: false, kind: 'error', message: 'nope' });
    await waitFor(() => {
      expect(useOpsJournalStore.getState().entriesByRepo.r1 ?? []).toHaveLength(0);
    });
  });
});
