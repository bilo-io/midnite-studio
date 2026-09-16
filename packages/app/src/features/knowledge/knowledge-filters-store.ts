import { create } from 'zustand';

import { defaultFilterState, type KnowledgeFilterState } from './knowledge-filters';

/**
 * Theme E's filter/search/selection state — per-repo, in-memory only,
 * following `files-store.ts`'s shape (`ensureScope` resets on a checkout
 * change, no `persist` middleware). Per the phase doc: "Filter state is
 * per-repo and survives a view switch, but is not persisted across restarts
 * this phase." Surviving a view switch is free — this is an ordinary module-
 * level zustand store, so it outlives `KnowledgeView` unmounting; "per-repo"
 * is `ensureScope(repoId)`; "not persisted" is simply never wiring `persist`.
 */
type KnowledgeFiltersState = {
  scopeKey: string | null;
  filters: KnowledgeFilterState;
  /** The node whose detail panel ("Explorer preview", Decision 7) is open. */
  selectedNodeId: string | null;

  ensureScope: (scopeKey: string) => void;
  setQuery: (query: string) => void;
  toggleRelation: (relation: string) => void;
  setRelations: (relations: ReadonlySet<string>) => void;
  setMinWeight: (value: number) => void;
  setMinConfidence: (value: number) => void;
  toggleCommunity: (communityName: string) => void;
  hideAllCommunities: (communityNames: readonly string[]) => void;
  showAllCommunities: () => void;
  selectNode: (nodeId: string | null) => void;
};

export const useKnowledgeFiltersStore = create<KnowledgeFiltersState>()((set, get) => ({
  scopeKey: null,
  filters: defaultFilterState(),
  selectedNodeId: null,

  ensureScope: (scopeKey) => {
    if (get().scopeKey === scopeKey) return;
    set({ scopeKey, filters: defaultFilterState(), selectedNodeId: null });
  },

  setQuery: (query) => set((state) => ({ filters: { ...state.filters, query } })),

  toggleRelation: (relation) =>
    set((state) => {
      const relations = new Set(state.filters.relations);
      if (relations.has(relation)) relations.delete(relation);
      else relations.add(relation);
      return { filters: { ...state.filters, relations } };
    }),

  setRelations: (relations) => set((state) => ({ filters: { ...state.filters, relations } })),

  setMinWeight: (value) => set((state) => ({ filters: { ...state.filters, minWeight: value } })),

  setMinConfidence: (value) =>
    set((state) => ({ filters: { ...state.filters, minConfidence: value } })),

  toggleCommunity: (communityName) =>
    set((state) => {
      const hiddenCommunities = new Set(state.filters.hiddenCommunities);
      if (hiddenCommunities.has(communityName)) hiddenCommunities.delete(communityName);
      else hiddenCommunities.add(communityName);
      return { filters: { ...state.filters, hiddenCommunities } };
    }),

  hideAllCommunities: (communityNames) =>
    set((state) => ({
      filters: { ...state.filters, hiddenCommunities: new Set(communityNames) },
    })),

  showAllCommunities: () =>
    set((state) => ({ filters: { ...state.filters, hiddenCommunities: new Set() } })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
}));
