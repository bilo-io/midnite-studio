import { describe, expect, it } from 'vitest';

import { createScienceUiStore } from './science-ui-store';

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('science ui store', () => {
  it('persists the last notebook id', () => {
    const storage = memory();
    createScienceUiStore(storage).getState().setLastNotebookId('nb-aaaaaaaaaaaa');
    expect(createScienceUiStore(storage).getState().lastNotebookId).toBe('nb-aaaaaaaaaaaa');
  });

  it('replaces a blob of another version with the defaults', () => {
    const storage = memory({ 'midnite-science.ui': JSON.stringify({ v: 2, lastNotebookId: 'nb-aaaaaaaaaaaa' }) });
    expect(createScienceUiStore(storage).getState()).toMatchObject({ v: 1, lastNotebookId: null });
  });
});
