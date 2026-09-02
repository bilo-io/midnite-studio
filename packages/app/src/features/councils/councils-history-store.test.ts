import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { councilIdOf, isSameCouncilEntry, useCouncilsHistory, type CouncilEntry } from './councils-history-store';

function resetStore(): void {
  const { result } = renderHook(() => useCouncilsHistory());
  act(() => result.current.reset());
}

describe('isSameCouncilEntry', () => {
  it('list entries are always the same', () => {
    expect(isSameCouncilEntry({ kind: 'list' }, { kind: 'list' })).toBe(true);
  });

  it('council entries compare by id', () => {
    expect(isSameCouncilEntry({ kind: 'council', id: 'c1' }, { kind: 'council', id: 'c1' })).toBe(true);
    expect(isSameCouncilEntry({ kind: 'council', id: 'c1' }, { kind: 'council', id: 'c2' })).toBe(false);
  });

  it('run entries compare by id, not councilId', () => {
    const a: CouncilEntry = { kind: 'run', id: 'r1', councilId: 'c1' };
    const b: CouncilEntry = { kind: 'run', id: 'r1', councilId: 'c2' };
    expect(isSameCouncilEntry(a, b)).toBe(true);
  });

  it('different kinds are never the same', () => {
    expect(isSameCouncilEntry({ kind: 'list' }, { kind: 'council', id: 'c1' })).toBe(false);
  });
});

describe('councilIdOf', () => {
  it('is null for the list entry', () => {
    expect(councilIdOf({ kind: 'list' })).toBeNull();
  });

  it('is the entry id for a council entry', () => {
    expect(councilIdOf({ kind: 'council', id: 'c1' })).toBe('c1');
  });

  it('is councilId, not id, for a run entry', () => {
    expect(councilIdOf({ kind: 'run', id: 'r1', councilId: 'c1' })).toBe('c1');
  });
});

describe('useCouncilsHistory — module-level survival (Theme E)', () => {
  beforeEach(resetStore);

  it('starts at the list entry', () => {
    const { result } = renderHook(() => useCouncilsHistory());
    expect(result.current.current).toEqual({ kind: 'list' });
  });

  it('survives unmounting and remounting the consuming component', () => {
    const first = renderHook(() => useCouncilsHistory());
    act(() => first.result.current.push({ kind: 'council', id: 'c1' }));
    first.unmount();

    // A brand new hook instance, as a fresh CouncilsView mount would create —
    // the whole point of the module-level store over a local useState.
    const second = renderHook(() => useCouncilsHistory());
    expect(second.result.current.current).toEqual({ kind: 'council', id: 'c1' });
    expect(second.result.current.canGoBack).toBe(true);
  });

  it('back/forward work across the store the same as the local hook', () => {
    const { result } = renderHook(() => useCouncilsHistory());
    act(() => result.current.push({ kind: 'council', id: 'c1' }));
    act(() => result.current.push({ kind: 'run', id: 'r1', councilId: 'c1' }));

    act(() => result.current.back());
    expect(result.current.current).toEqual({ kind: 'council', id: 'c1' });

    act(() => result.current.forward());
    expect(result.current.current).toEqual({ kind: 'run', id: 'r1', councilId: 'c1' });
  });
});
