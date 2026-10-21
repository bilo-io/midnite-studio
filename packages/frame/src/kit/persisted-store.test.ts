// vitest: pure store logic over an in-memory Storage.
import { describe, expect, it } from 'vitest';

import { createPersistedStore } from './persisted-store';

type S = { n: number; label: string; inc: () => void; transient: number };
const defaults = { n: 1, label: 'x' };

function memory(seed?: string): Storage {
  const m = new Map<string, string>(seed === undefined ? [] : [['k', seed]]);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
}

const make = (storage: Storage | undefined) =>
  createPersistedStore<S, typeof defaults>({
    key: 'k',
    defaults,
    storage,
    pick: (s) => ({ n: s.n, label: s.label }),
    state: (set, initial) => ({
      ...initial,
      transient: 0,
      inc: () => set((s) => ({ n: s.n + 1 })),
    }),
  });

describe('createPersistedStore', () => {
  it('uses defaults when nothing is stored', () => {
    expect(make(memory()).getState().n).toBe(1);
  });
  it('uses defaults on corrupt JSON', () => {
    expect(make(memory('{nope')).getState().label).toBe('x');
  });
  it('merges a partial blob over defaults', () => {
    const s = make(memory('{"n":7}')).getState();
    expect([s.n, s.label]).toEqual([7, 'x']);
  });
  it('writes only the picked slice through', () => {
    const storage = memory();
    const store = make(storage);
    store.getState().inc();
    expect(JSON.parse(storage.getItem('k') ?? '{}')).toEqual({ n: 2, label: 'x' });
  });
  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    } as unknown as Storage;
    const store = make(bad);
    expect(() => store.getState().inc()).not.toThrow();
    expect(store.getState().n).toBe(2);
  });
  it('works with no storage at all', () => {
    expect(make(undefined).getState().n).toBe(1);
  });
});
