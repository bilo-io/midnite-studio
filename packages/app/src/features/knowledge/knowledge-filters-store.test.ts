// Layer: vitest — a zustand store, no DOM/canvas involved.
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_RELATIONS } from './knowledge-filters';
import { useKnowledgeFiltersStore } from './knowledge-filters-store';

describe('useKnowledgeFiltersStore', () => {
  beforeEach(() => {
    useKnowledgeFiltersStore.setState({
      scopeKey: null,
      filters: {
        query: '',
        relations: DEFAULT_RELATIONS,
        minWeight: 0,
        minConfidence: 0,
        hiddenCommunities: new Set(),
      },
      selectedNodeId: null,
    });
  });

  it('resets to defaults on a scope (repo) change', () => {
    useKnowledgeFiltersStore.getState().ensureScope('repo:1');
    useKnowledgeFiltersStore.getState().setQuery('useNow');
    useKnowledgeFiltersStore.getState().selectNode('n1');

    useKnowledgeFiltersStore.getState().ensureScope('repo:2');

    const state = useKnowledgeFiltersStore.getState();
    expect(state.scopeKey).toBe('repo:2');
    expect(state.filters.query).toBe('');
    expect(state.selectedNodeId).toBeNull();
  });

  it('is a no-op for the same scope — does not clobber in-progress filtering', () => {
    useKnowledgeFiltersStore.getState().ensureScope('repo:1');
    useKnowledgeFiltersStore.getState().setQuery('useNow');

    useKnowledgeFiltersStore.getState().ensureScope('repo:1');

    expect(useKnowledgeFiltersStore.getState().filters.query).toBe('useNow');
  });

  it('toggleRelation adds then removes', () => {
    useKnowledgeFiltersStore.getState().toggleRelation('imports');
    expect(useKnowledgeFiltersStore.getState().filters.relations.has('imports')).toBe(true);
    useKnowledgeFiltersStore.getState().toggleRelation('imports');
    expect(useKnowledgeFiltersStore.getState().filters.relations.has('imports')).toBe(false);
  });

  it('toggleCommunity hides then un-hides', () => {
    useKnowledgeFiltersStore.getState().toggleCommunity('graph');
    expect(useKnowledgeFiltersStore.getState().filters.hiddenCommunities.has('graph')).toBe(true);
    useKnowledgeFiltersStore.getState().toggleCommunity('graph');
    expect(useKnowledgeFiltersStore.getState().filters.hiddenCommunities.has('graph')).toBe(false);
  });

  it('hideAllCommunities then showAllCommunities — the "full set one click away" escape hatch', () => {
    useKnowledgeFiltersStore.getState().hideAllCommunities(['a', 'b', 'c']);
    expect(useKnowledgeFiltersStore.getState().filters.hiddenCommunities.size).toBe(3);
    useKnowledgeFiltersStore.getState().showAllCommunities();
    expect(useKnowledgeFiltersStore.getState().filters.hiddenCommunities.size).toBe(0);
  });

  it('setMinWeight / setMinConfidence set independently', () => {
    useKnowledgeFiltersStore.getState().setMinWeight(0.5);
    useKnowledgeFiltersStore.getState().setMinConfidence(0.9);
    const { filters } = useKnowledgeFiltersStore.getState();
    expect(filters.minWeight).toBe(0.5);
    expect(filters.minConfidence).toBe(0.9);
  });

  it('selectNode sets and clears', () => {
    useKnowledgeFiltersStore.getState().selectNode('n1');
    expect(useKnowledgeFiltersStore.getState().selectedNodeId).toBe('n1');
    useKnowledgeFiltersStore.getState().selectNode(null);
    expect(useKnowledgeFiltersStore.getState().selectedNodeId).toBeNull();
  });
});
