// Layer: vitest — a zustand store, no DOM/canvas involved.
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_KNOWLEDGE_VARIANT, useUiStore } from '../../store/ui-store';
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
      collapsedCommunities: new Set(),
      flyToNodeId: null,
      communityListMode: 'list',
      rendererVariant: DEFAULT_KNOWLEDGE_VARIANT,
    });
    useUiStore.setState({ rendererVariant: DEFAULT_KNOWLEDGE_VARIANT });
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

  it('resets the collapse set and fly-to on a scope change, but keeps the list mode (a UI preference)', () => {
    const store = useKnowledgeFiltersStore.getState();
    store.ensureScope('repo:1');
    store.toggleCollapsedCommunity('core');
    store.focusNode('n1');
    store.setCommunityListMode('tree');

    store.ensureScope('repo:2');

    const state = useKnowledgeFiltersStore.getState();
    expect(state.collapsedCommunities.size).toBe(0);
    expect(state.flyToNodeId).toBeNull();
    expect(state.selectedNodeId).toBeNull();
    expect(state.communityListMode).toBe('tree');
  });

  it('toggleCollapsedCommunity flips one name; setCommunityCollapsed is idempotent', () => {
    const store = useKnowledgeFiltersStore.getState();
    store.toggleCollapsedCommunity('core');
    expect(useKnowledgeFiltersStore.getState().collapsedCommunities.has('core')).toBe(true);
    store.toggleCollapsedCommunity('core');
    expect(useKnowledgeFiltersStore.getState().collapsedCommunities.has('core')).toBe(false);

    store.setCommunityCollapsed('graph', true);
    const once = useKnowledgeFiltersStore.getState().collapsedCommunities;
    store.setCommunityCollapsed('graph', true);
    // No new Set allocated when nothing changed — the canvas effect keys on identity.
    expect(useKnowledgeFiltersStore.getState().collapsedCommunities).toBe(once);
    store.setCommunityCollapsed('graph', false);
    expect(useKnowledgeFiltersStore.getState().collapsedCommunities.has('graph')).toBe(false);
  });

  it('collapseAll / expandAll replace the whole set', () => {
    const store = useKnowledgeFiltersStore.getState();
    store.collapseAllCommunities(['a', 'b']);
    expect([...useKnowledgeFiltersStore.getState().collapsedCommunities].sort()).toEqual(['a', 'b']);
    store.expandAllCommunities();
    expect(useKnowledgeFiltersStore.getState().collapsedCommunities.size).toBe(0);
  });

  it('focusNode selects AND requests a fly; selectNode alone never moves the camera', () => {
    const store = useKnowledgeFiltersStore.getState();
    store.focusNode('n1');
    expect(useKnowledgeFiltersStore.getState()).toMatchObject({ selectedNodeId: 'n1', flyToNodeId: 'n1' });
    store.selectNode('n2');
    expect(useKnowledgeFiltersStore.getState()).toMatchObject({ selectedNodeId: 'n2', flyToNodeId: 'n1' });
  });

  it('a search keystroke clears the fly-to so search’s own focus wins again', () => {
    const store = useKnowledgeFiltersStore.getState();
    store.focusNode('n1');
    store.setQuery('use');
    expect(useKnowledgeFiltersStore.getState().flyToNodeId).toBeNull();
  });

  it('rendererVariant is not reset by ensureScope — a UI preference, not repo-scoped state', () => {
    useKnowledgeFiltersStore.getState().ensureScope('repo:1');
    useKnowledgeFiltersStore.getState().setRendererVariant('force-graph');
    useKnowledgeFiltersStore.getState().ensureScope('repo:2');
    expect(useKnowledgeFiltersStore.getState().rendererVariant).toBe('force-graph');
  });

  it('setRendererVariant writes through to ui-store.ts, the actual persisted source', () => {
    useKnowledgeFiltersStore.getState().setRendererVariant('cytoscape');
    expect(useKnowledgeFiltersStore.getState().rendererVariant).toBe('cytoscape');
    expect(useUiStore.getState().rendererVariant).toBe('cytoscape');
  });
});
