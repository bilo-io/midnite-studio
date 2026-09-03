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
  it('covers every op isUndoableOpKind calls undoable in principle', () => {
    expect([...WIRED_UNDO_OPS].sort()).toEqual(
      [
        'branch-create',
        'branch-delete',
        'branch-rename',
        'checkout',
        'commit',
        'reset',
        'stash-drop',
        'stash-push',
      ].sort(),
    );
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
    const outcome = await result.current(baseEntry({ op: 'merge' }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.kind !== 'error') throw new Error('expected an error');
    expect(outcome.message).toMatch(/not wired up/);
  });

  it('undoes a commit with a mixed reset to the sha before it', async () => {
    const reset = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { reset } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({ op: 'commit', headBefore: 'c'.repeat(40), refBefore: 'HEAD' }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(reset).toHaveBeenCalledWith({ repoId: 'r1', target: 'c'.repeat(40), mode: 'mixed' });
    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries[0]?.op).toBe('reset');
  });

  it('undoes a reset with a mixed reset to the prior HEAD', async () => {
    const reset = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { reset } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    await result.current(baseEntry({ op: 'reset', headBefore: 'd'.repeat(40) }));

    expect(reset).toHaveBeenCalledWith({ repoId: 'r1', target: 'd'.repeat(40), mode: 'mixed' });
  });

  it('undoes a checkout by detaching at the sha HEAD used to be at', async () => {
    const checkout = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { checkout } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    await result.current(baseEntry({ op: 'checkout', headBefore: 'e'.repeat(40) }));

    expect(checkout).toHaveBeenCalledWith({ repoId: 'r1', target: 'e'.repeat(40), detach: true });
  });

  it('undoes a branch-create by deleting the branch it named, with no headBefore to step off', async () => {
    const branchDelete = vi.fn().mockResolvedValue({ ok: true });
    const checkout = vi.fn();
    installBridge({ ops: { branchDelete, checkout } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({ op: 'branch-create', headBefore: null, refBefore: 'refs/heads/feature/y' }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(checkout).not.toHaveBeenCalled();
    expect(branchDelete).toHaveBeenCalledWith({ repoId: 'r1', name: 'feature/y', force: true });
    const entries = useOpsJournalStore.getState().entriesByRepo.r1 ?? [];
    expect(entries[0]?.op).toBe('branch-delete');
  });

  /**
   * Every `branch-create` call site checks the new branch out immediately, so
   * undoing it usually means deleting the branch HEAD is currently on — which
   * git refuses no matter how forceful the delete is. The undo has to step
   * off it first.
   */
  it('undoes a checked-out branch-create by stepping off it before deleting', async () => {
    const checkout = vi.fn().mockResolvedValue({ ok: true });
    const branchDelete = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { checkout, branchDelete } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({ op: 'branch-create', headBefore: 'f'.repeat(40), refBefore: 'refs/heads/feature/y' }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(checkout).toHaveBeenCalledWith({ repoId: 'r1', target: 'f'.repeat(40), detach: true });
    expect(branchDelete).toHaveBeenCalledWith({ repoId: 'r1', name: 'feature/y', force: true });
  });

  it('stops at a failed step-off and never attempts the delete', async () => {
    const checkout = vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'dirty tree' });
    const branchDelete = vi.fn();
    installBridge({ ops: { checkout, branchDelete } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({ op: 'branch-create', headBefore: 'f'.repeat(40), refBefore: 'refs/heads/feature/y' }),
    );

    expect(outcome).toEqual({ ok: false, kind: 'error', message: 'dirty tree' });
    expect(branchDelete).not.toHaveBeenCalled();
  });

  it('undoes a branch-rename by renaming back from the captured new name to the old one', async () => {
    const branchRename = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ ops: { branchRename } as unknown as MidniteStudioBridge['ops'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({
        op: 'branch-rename',
        headBefore: null,
        refBefore: 'refs/heads/old-name',
        headAfter: 'new-name',
      }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(branchRename).toHaveBeenCalledWith({ repoId: 'r1', from: 'new-name', to: 'old-name' });
  });

  it('undoes a stash-push by popping the newest stash', async () => {
    const pop = vi.fn().mockResolvedValue({ ok: true });
    installBridge({ stash: { pop } as unknown as MidniteStudioBridge['stash'] });

    const { result } = renderHook(() => useUndoJournalEntry(), { wrapper });
    const outcome = await result.current(
      baseEntry({ op: 'stash-push', headBefore: null, refBefore: null }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(pop).toHaveBeenCalledWith({ repoId: 'r1', selector: 'stash@{0}' });
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
