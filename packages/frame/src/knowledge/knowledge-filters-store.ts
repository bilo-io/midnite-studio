import { create } from 'zustand';

import type { KnowledgeHost } from './knowledge-host';
import { defaultFilterState, type KnowledgeFilterState } from './knowledge-filters';

/**
 * Theme E's filter/search/selection state — per-repo, in-memory only,
 * following `files-store.ts`'s shape (`ensureScope` resets on a checkout
 * change, no `persist` middleware). Per the phase doc: "Filter state is
 * per-repo and survives a view switch, but is not persisted across restarts
 * this phase." Surviving a view switch is free — this is an ordinary module-
 * level zustand store, so it outlives `KnowledgeView` unmounting; "per-repo"
 * is `ensureScope(repoId)`; "not persisted" is simply never wiring `persist`.
 *
 * The collapse set and the fly-to request joined the per-repo half; the
 * list/tree mode of the community list is a UI preference, so it survives a
 * repo switch on purpose.
 *
 * `rendererVariant` (Phase 89 Theme A) follows `communityListMode`'s exact
 * shape below — a field, a setter, left out of `ensureScope`'s reset — but
 * unlike `communityListMode` it also needs to survive an app restart
 * (Decision 1), which this store's own `create()` has no `persist`
 * middleware for. The host (`knowledge-host.tsx`) is the actual persisted
 * source of truth — Studio's `ui-store.ts`; this store's copy is seeded from
 * it when the host binds (`bindKnowledgeSettings`) and its setter writes
 * through to the host on every change, so every reader in the Knowledge view
 * can keep using this store's own selectors without reaching for the host.
 */
export type CommunityListMode = 'list' | 'tree';

type KnowledgeFiltersState = {
  scopeKey: string | null;
  filters: KnowledgeFilterState;
  /** The node whose detail panel ("Explorer preview", Decision 7) is open — or a `community:` meta-node id, which opens the community panel instead. */
  selectedNodeId: string | null;
  /** Communities folded into one meta-node each (`knowledge-community-collapse.ts`). */
  collapsedCommunities: ReadonlySet<string>;
  /**
   * A node the camera should fly to, set by the tree list (and cleared by
   * the next search keystroke, so search's own focus wins again). Separate
   * from `selectedNodeId` because selecting from the canvas must NOT move
   * the camera — the user just clicked the thing they are looking at.
   */
  flyToNodeId: string | null;
  communityListMode: CommunityListMode;
  /** Which Knowledge canvas renderer is active — persisted globally via `ui-store.ts`, see the docblock above. */
  rendererVariant: string;
  /**
   * Which worker-computed layout is active (Phase 89 Theme E) — the same
   * "persisted globally via `ui-store.ts`, seeded once at module init, writes
   * through on every change" shape as `rendererVariant` immediately above,
   * and for the identical reason: a UI preference, not per-repo scope, so it
   * is deliberately outside `ensureScope`'s reset.
   */
  layoutId: string;
  /**
   * The detail budget (`knowledge-detail.ts`) — how much of a large graph the
   * canvas mounts before anything is searched for or expanded. Same persisted
   * shape and reasoning as `layoutId` directly above.
   */
  detailId: string;

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
  /** Select AND fly — the tree list's click. */
  focusNode: (nodeId: string) => void;
  toggleCollapsedCommunity: (communityName: string) => void;
  setCommunityCollapsed: (communityName: string, collapsed: boolean) => void;
  collapseAllCommunities: (communityNames: readonly string[]) => void;
  expandAllCommunities: () => void;
  setCommunityListMode: (mode: CommunityListMode) => void;
  setRendererVariant: (variant: string) => void;
  setLayoutId: (layoutId: string) => void;
  setDetailId: (detailId: string) => void;
};

export const DEFAULT_KNOWLEDGE_VARIANT = 'atlas';
export const DEFAULT_KNOWLEDGE_LAYOUT = 'force-atlas2';
export const DEFAULT_KNOWLEDGE_DETAIL = 'core';

/** The host currently bound (Phase 113 Theme M): where a preference change is persisted to. */
let boundHost: KnowledgeHost | null = null;

function writeSetting(patch: Parameters<KnowledgeHost['setSettings']>[0]): void {
  boundHost?.setSettings(patch);
}

/**
 * Seeds the store's three persisted preferences from the host and routes every later change back
 * to it. Idempotent per host: `KnowledgeHostProvider` calls it on every render, and only a new
 * host re-seeds. Called during the provider's render, before any child reads the store.
 */
export function bindKnowledgeSettings(host: KnowledgeHost): void {
  if (boundHost === host) return;
  boundHost = host;
  const settings = host.getSettings();
  useKnowledgeFiltersStore.setState({
    rendererVariant: settings.rendererVariant || DEFAULT_KNOWLEDGE_VARIANT,
    layoutId: settings.layoutId || DEFAULT_KNOWLEDGE_LAYOUT,
    detailId: settings.detailId || DEFAULT_KNOWLEDGE_DETAIL,
  });
}

export const useKnowledgeFiltersStore = create<KnowledgeFiltersState>()((set, get) => ({
  scopeKey: null,
  filters: defaultFilterState(),
  selectedNodeId: null,
  collapsedCommunities: new Set(),
  flyToNodeId: null,
  communityListMode: 'list',
  // Defaults until `bindKnowledgeSettings` seeds them from the host's persisted values.
  rendererVariant: DEFAULT_KNOWLEDGE_VARIANT,
  layoutId: DEFAULT_KNOWLEDGE_LAYOUT,
  detailId: DEFAULT_KNOWLEDGE_DETAIL,

  ensureScope: (scopeKey) => {
    if (get().scopeKey === scopeKey) return;
    set({
      scopeKey,
      filters: defaultFilterState(),
      selectedNodeId: null,
      collapsedCommunities: new Set(),
      flyToNodeId: null,
    });
  },

  setQuery: (query) => set((state) => ({ filters: { ...state.filters, query }, flyToNodeId: null })),

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

  focusNode: (nodeId) => set({ selectedNodeId: nodeId, flyToNodeId: nodeId }),

  toggleCollapsedCommunity: (communityName) =>
    set((state) => {
      const collapsedCommunities = new Set(state.collapsedCommunities);
      if (collapsedCommunities.has(communityName)) collapsedCommunities.delete(communityName);
      else collapsedCommunities.add(communityName);
      return { collapsedCommunities };
    }),

  setCommunityCollapsed: (communityName, collapsed) =>
    set((state) => {
      if (state.collapsedCommunities.has(communityName) === collapsed) return {};
      const collapsedCommunities = new Set(state.collapsedCommunities);
      if (collapsed) collapsedCommunities.add(communityName);
      else collapsedCommunities.delete(communityName);
      return { collapsedCommunities };
    }),

  collapseAllCommunities: (communityNames) =>
    set({ collapsedCommunities: new Set(communityNames) }),

  expandAllCommunities: () => set({ collapsedCommunities: new Set() }),

  setCommunityListMode: (mode) => set({ communityListMode: mode }),

  setRendererVariant: (variant) => {
    set({ rendererVariant: variant });
    writeSetting({ rendererVariant: variant });
  },

  setLayoutId: (layoutId) => {
    set({ layoutId });
    writeSetting({ layoutId });
  },

  setDetailId: (detailId) => {
    set({ detailId });
    writeSetting({ detailId });
  },
}));
