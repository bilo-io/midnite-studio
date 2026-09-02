import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { OpJournalEntry } from '@midnite/studio-shared';

import { useJournalEntries, useOpsJournalStore } from './ops-journal-store';

const reset = () => useOpsJournalStore.setState({ entriesByRepo: {} });
beforeEach(reset);

const entry = (id: string, repoId: string): OpJournalEntry => ({
  id,
  repoId,
  op: 'commit',
  label: `commit ${id}`,
  at: Number(id),
  headBefore: 'a'.repeat(40),
  headAfter: 'b'.repeat(40),
  refBefore: 'HEAD',
  undoable: true,
});

describe('useOpsJournalStore', () => {
  it('keeps two repositories’ journals apart', () => {
    const store = useOpsJournalStore.getState();
    store.record(entry('1', 'r1'));
    store.record(entry('2', 'r2'));

    expect(useOpsJournalStore.getState().entriesByRepo.r1).toHaveLength(1);
    expect(useOpsJournalStore.getState().entriesByRepo.r2).toHaveLength(1);
    expect(useOpsJournalStore.getState().entriesByRepo.r1?.[0]?.id).toBe('1');
  });

  it('records newest first', () => {
    const store = useOpsJournalStore.getState();
    store.record(entry('1', 'r1'));
    store.record(entry('2', 'r1'));

    expect(useOpsJournalStore.getState().entriesByRepo.r1?.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('delegates its cap/eviction to the shared appendJournalEntry — see journal.test.ts for that logic', () => {
    const store = useOpsJournalStore.getState();
    for (let i = 0; i < 310; i++) store.record(entry(String(i), 'r1'));

    expect(useOpsJournalStore.getState().entriesByRepo.r1?.length).toBeLessThanOrEqual(300);
  });
});

describe('useJournalEntries', () => {
  it('answers empty for a repo with nothing recorded, and for null', () => {
    const { result: nope } = renderHook(() => useJournalEntries('nope'));
    expect(nope.current).toEqual([]);

    const { result: none } = renderHook(() => useJournalEntries(null));
    expect(none.current).toEqual([]);
  });

  it('reads back what was recorded for that repo, newest first', () => {
    useOpsJournalStore.getState().record(entry('1', 'r1'));
    useOpsJournalStore.getState().record(entry('2', 'r1'));

    const { result } = renderHook(() => useJournalEntries('r1'));
    expect(result.current.map((e) => e.id)).toEqual(['2', '1']);
  });
});
