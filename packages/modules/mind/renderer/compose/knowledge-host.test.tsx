// vitest/jsdom: the settings store behind Mind's Knowledge host, over an in-memory Storage.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createMindKnowledgeHost, MIND_KNOWLEDGE_SETTINGS_KEY } from './knowledge-host';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('createMindKnowledgeHost', () => {
  it('graphs the one notebook, with no worktree', () => {
    const host = createMindKnowledgeHost(memoryStorage());
    const { result } = renderHook(() => host.useCorpus());
    expect(result.current).toEqual({ repoId: 'mind' });
  });

  it('starts from the defaults and persists what is set, under its own key', () => {
    const storage = memoryStorage();
    const host = createMindKnowledgeHost(storage);
    expect(host.getSettings()).toMatchObject({ rendererVariant: 'atlas', layoutId: 'force-atlas2', detailId: 'core' });
    host.setSettings({ layoutId: 'circlepack', filtersWidth: 300 });
    expect(JSON.parse(storage.getItem(MIND_KNOWLEDGE_SETTINGS_KEY) ?? '{}')).toMatchObject({ layoutId: 'circlepack', filtersWidth: 300 });
    expect(createMindKnowledgeHost(storage).getSettings().layoutId).toBe('circlepack');
  });

  it('useSettings follows a later write', () => {
    const host = createMindKnowledgeHost(memoryStorage());
    const { result, rerender } = renderHook(() => host.useSettings());
    host.setSettings({ detailWidth: 400 });
    rerender();
    expect(result.current.detailWidth).toBe(400);
  });

  it('shows its own empty state, not graphify instructions, for a notebook with no notes', () => {
    expect(createMindKnowledgeHost(memoryStorage()).Absent).toBeDefined();
  });
});
