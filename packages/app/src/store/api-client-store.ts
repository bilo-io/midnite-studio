import { create } from 'zustand';

import type { ApiCollectionSummary, ApiRequestDraft, ApiResponse, PostmanItem } from '@midnite/studio-shared';
import { toDraft } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';

/**
 * The API Client view's own store (Phase 66 Theme C) — request tabs, their
 * drafts, and the collections they were opened from.
 *
 * Its own store, not an arm of `workbench-store.ts` (Decision 2/11): the
 * request-tab strip lives *inside* the API Client view rather than becoming a
 * `WorkbenchTab`, because a request draft carries fields (`bodies`, `auth`, a
 * `bodyMode`) no other tab kind has any use for, and `workbench-store.ts`'s
 * `tabId()` union would have to grow an arm nothing else reads.
 *
 * **Nothing here is persisted.** A tab holds unsaved edits to a request that
 * lives in a repo-local file; restoring one across a restart, into a file
 * that may have changed underneath it, is a data-loss shape — the same
 * argument `workbench-store.ts` makes for its own tabs.
 */

export type ApiTab = {
  id: string;
  repoId: string;
  collectionId: string;
  /**
   * The folder-name path to the request inside the collection — never an
   * index. Postman items have no stable id, and an index breaks the moment a
   * sibling is inserted above.
   */
  itemPath: string[];
  draft: ApiRequestDraft;
  savedDraft: ApiRequestDraft;
};

/** What `openTab` needs to either focus an existing tab or build a new one. */
export type ApiTabRef = {
  repoId: string;
  collectionId: string;
  itemPath: string[];
  /** The request-shaped item this tab opens — `toDraft` reads its `.request`. */
  item: PostmanItem;
};

/**
 * A tab's identity, derived from what it points at — repo, collection, and
 * the path to the request inside it. Mirrors `workbench-store.ts`'s `tabId`:
 * opening the same request twice focuses the one tab rather than stacking a
 * duplicate.
 */
export const apiTabId = (ref: { repoId: string; collectionId: string; itemPath: string[] }): string =>
  `${ref.repoId}:${ref.collectionId}:${ref.itemPath.join('/')}`;

/**
 * `dirty` is **derived**, never stored — exactly as `file-preview.tsx` derives
 * it from `file-editor-store`'s `content !== savedContent`. A stored boolean
 * is a second source of truth that goes stale on an undo.
 */
export function isTabDirty(tab: ApiTab): boolean {
  return JSON.stringify(tab.draft) !== JSON.stringify(tab.savedDraft);
}

/** In-memory response history per tab, capped at 10, newest first (Theme F). */
const MAX_RESPONSE_HISTORY = 10;

/**
 * Which tab takes focus once `id` goes away — the neighbour to the left,
 * falling back to `null`. `tabs` is the list as it stood BEFORE `id` was
 * removed, same contract as `workbench-store.ts`'s `nextFocusAfterClose`.
 */
function nextFocusAfterClose(
  tabs: readonly ApiTab[],
  activeTabId: string | null,
  closingId: string,
): string | null {
  if (activeTabId !== closingId) return activeTabId;
  const index = tabs.findIndex((tab) => tab.id === closingId);
  if (index <= 0) return null;
  return tabs[index - 1]?.id ?? null;
}

// --- collection tree mutation helpers (context menu; Theme C) --------------
// Every one of these mutates the in-memory `PostmanCollection.item` tree and
// marks the collection dirty. None of them writes to disk — that is Theme
// G's explicit Save.

function getContainer(items: PostmanItem[], folderPath: readonly string[]): PostmanItem[] | null {
  if (folderPath.length === 0) return items;
  const [head, ...rest] = folderPath;
  const folder = items.find((it) => it.name === head);
  if (!folder?.item) return null;
  return getContainer(folder.item, rest);
}

/** Walks to the item at `path` and hands its own siblings array + index to `fn`. */
function withItem(
  items: PostmanItem[],
  path: readonly string[],
  fn: (item: PostmanItem, siblings: PostmanItem[], index: number) => void,
): boolean {
  if (path.length === 0) return false;
  const [head, ...rest] = path;
  const index = items.findIndex((it) => it.name === head);
  if (index === -1) return false;
  if (rest.length === 0) {
    fn(items[index]!, items, index);
    return true;
  }
  const child = items[index]!.item;
  if (!child) return false;
  return withItem(child, rest, fn);
}

/** A name that does not collide with a sibling already in `siblings`. */
function uniqueSiblingName(siblings: readonly PostmanItem[], base: string): string {
  const taken = new Set(siblings.map((it) => it.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function mutateCollection(
  collections: readonly ApiCollectionSummary[],
  collectionId: string,
  mutator: (rootItems: PostmanItem[]) => void,
): ApiCollectionSummary[] {
  return collections.map((summary) => {
    if (summary.id !== collectionId) return summary;
    // Deep-clone once here so every mutator below can push/splice/rename in
    // place — the clone is what makes this an immutable update from the
    // store's point of view despite the in-place tree edits.
    const rootItems = structuredClone(summary.collection.item);
    mutator(rootItems);
    return { ...summary, collection: { ...summary.collection, item: rootItems } };
  });
}

export type ApiClientState = {
  // --- collections (per the currently-viewed repo) --------------------------
  collections: ApiCollectionSummary[];
  collectionsRepoId: string | null;
  collectionsStatus: 'idle' | 'loading' | 'ready' | 'error';
  collectionsError: string | null;
  /** Collections with unsaved in-memory tree edits — Theme G reads this. */
  dirtyCollectionIds: ReadonlySet<string>;

  // --- request tabs ----------------------------------------------------------
  tabs: ApiTab[];
  activeTabId: string | null;
  /** Response history per tab, newest first, capped at 10. Never persisted. */
  responses: Record<string, ApiResponse[]>;
  /** tabId -> the in-flight request's id, while a send is outstanding. */
  inFlight: Record<string, string>;
  /** tabId -> the last `{ok:false}` envelope's message, cleared on retry/success. */
  lastError: Record<string, string>;

  loadCollections: (repoId: string) => Promise<void>;

  openTab: (ref: ApiTabRef) => void;
  focusTab: (id: string | null) => void;
  closeTab: (id: string) => void;
  editDraft: (id: string, patch: Partial<ApiRequestDraft>) => void;
  markSaved: (id: string) => void;
  /** Drops every tab belonging to a repo and aborts its in-flight requests. */
  closeRepoTabs: (repoId: string) => void;

  addRequest: (collectionId: string, folderPath: string[], name: string) => void;
  addFolder: (collectionId: string, folderPath: string[], name: string) => void;
  renameItem: (collectionId: string, itemPath: string[], newName: string) => void;
  duplicateItem: (collectionId: string, itemPath: string[]) => void;
  deleteItem: (collectionId: string, itemPath: string[]) => void;
  removeCollection: (collectionId: string) => Promise<void>;

  /** Sends the tab's current draft. Used by both the Send button and Retry. */
  sendRequest: (tabId: string) => Promise<void>;
  cancelRequest: (tabId: string) => void;
};

export const useApiClientStore = create<ApiClientState>()((set, get) => ({
  collections: [],
  collectionsRepoId: null,
  collectionsStatus: 'idle',
  collectionsError: null,
  dirtyCollectionIds: new Set(),

  tabs: [],
  activeTabId: null,
  responses: {},
  inFlight: {},
  lastError: {},

  loadCollections: async (repoId) => {
    const api = bridge();
    if (!api) {
      set({ collectionsStatus: 'error', collectionsError: 'No connection to the app.' });
      return;
    }
    set({ collectionsStatus: 'loading', collectionsError: null, collectionsRepoId: repoId });
    try {
      const result = await api.apiClient.listCollections({ repoId });
      if (!result.ok) {
        set({ collectionsStatus: 'error', collectionsError: result.message });
        return;
      }
      set({ collectionsStatus: 'ready', collections: result.value, collectionsRepoId: repoId });
    } catch {
      set({ collectionsStatus: 'error', collectionsError: 'Could not load API collections.' });
    }
  },

  openTab: (ref) => {
    const id = apiTabId(ref);
    set((state) => {
      // Already open — focus it. Re-toasting `toDraft(ref.item)` here would
      // blow away any unsaved edits the tab already carries.
      if (state.tabs.some((tab) => tab.id === id)) return { activeTabId: id };
      const draft = toDraft(ref.item);
      const tab: ApiTab = {
        id,
        repoId: ref.repoId,
        collectionId: ref.collectionId,
        itemPath: ref.itemPath,
        draft,
        savedDraft: structuredClone(draft),
      };
      return { tabs: [...state.tabs, tab], activeTabId: id };
    });
  },

  focusTab: (id) => set({ activeTabId: id }),

  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeTabId = nextFocusAfterClose(state.tabs, state.activeTabId, id);
      const inFlight = { ...state.inFlight };
      delete inFlight[id];
      const lastError = { ...state.lastError };
      delete lastError[id];
      return { tabs, activeTabId, inFlight, lastError };
    }),

  editDraft: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, draft: { ...tab.draft, ...patch } } : tab)),
    })),

  markSaved: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, savedDraft: structuredClone(tab.draft) } : tab)),
    })),

  closeRepoTabs: (repoId) => {
    const before = get();
    const closingTabIds = before.tabs.filter((tab) => tab.repoId === repoId).map((tab) => tab.id);
    const requestIdsToCancel = closingTabIds
      .map((id) => before.inFlight[id])
      .filter((value): value is string => Boolean(value));

    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.repoId !== repoId);
      const stillOpen = tabs.some((tab) => tab.id === state.activeTabId);
      const inFlight = { ...state.inFlight };
      const lastError = { ...state.lastError };
      for (const id of closingTabIds) {
        delete inFlight[id];
        delete lastError[id];
      }
      return { tabs, activeTabId: stillOpen ? state.activeTabId : null, inFlight, lastError };
    });

    const api = bridge();
    if (api) {
      for (const requestId of requestIdsToCancel) void api.apiClient.cancelRequest({ requestId });
    }
  },

  addRequest: (collectionId, folderPath, name) =>
    set((state) => ({
      collections: mutateCollection(state.collections, collectionId, (root) => {
        const container = getContainer(root, folderPath);
        if (!container) return;
        container.push({ name: uniqueSiblingName(container, name), request: { method: 'GET', url: '' } });
      }),
      dirtyCollectionIds: new Set(state.dirtyCollectionIds).add(collectionId),
    })),

  addFolder: (collectionId, folderPath, name) =>
    set((state) => ({
      collections: mutateCollection(state.collections, collectionId, (root) => {
        const container = getContainer(root, folderPath);
        if (!container) return;
        container.push({ name: uniqueSiblingName(container, name), item: [] });
      }),
      dirtyCollectionIds: new Set(state.dirtyCollectionIds).add(collectionId),
    })),

  renameItem: (collectionId, itemPath, newName) =>
    set((state) => ({
      collections: mutateCollection(state.collections, collectionId, (root) => {
        withItem(root, itemPath, (item, siblings) => {
          item.name = uniqueSiblingName(
            siblings.filter((sibling) => sibling !== item),
            newName,
          );
        });
      }),
      dirtyCollectionIds: new Set(state.dirtyCollectionIds).add(collectionId),
    })),

  duplicateItem: (collectionId, itemPath) =>
    set((state) => ({
      collections: mutateCollection(state.collections, collectionId, (root) => {
        withItem(root, itemPath, (item, siblings, index) => {
          const clone = structuredClone(item);
          clone.name = uniqueSiblingName(siblings, `${item.name} copy`);
          siblings.splice(index + 1, 0, clone);
        });
      }),
      dirtyCollectionIds: new Set(state.dirtyCollectionIds).add(collectionId),
    })),

  deleteItem: (collectionId, itemPath) =>
    set((state) => ({
      collections: mutateCollection(state.collections, collectionId, (root) => {
        withItem(root, itemPath, (_item, siblings, index) => {
          siblings.splice(index, 1);
        });
      }),
      dirtyCollectionIds: new Set(state.dirtyCollectionIds).add(collectionId),
    })),

  removeCollection: async (collectionId) => {
    const repoId = get().collectionsRepoId;
    const api = bridge();
    if (api && repoId) {
      const result = await api.apiClient.deleteCollection({ repoId, collectionId });
      if (!result.ok) return;
    }
    set((state) => ({
      collections: state.collections.filter((summary) => summary.id !== collectionId),
      tabs: state.tabs.filter((tab) => tab.collectionId !== collectionId),
    }));
  },

  sendRequest: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const api = bridge();
    if (!api) {
      set((state) => ({ lastError: { ...state.lastError, [tabId]: 'No connection to the app.' } }));
      return;
    }

    const requestId = `${tabId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const collection = get().collections.find((summary) => summary.id === tab.collectionId);
    const collectionVariables = collection?.collection.variable ?? [];

    set((state) => {
      const lastError = { ...state.lastError };
      delete lastError[tabId];
      return { inFlight: { ...state.inFlight, [tabId]: requestId }, lastError };
    });

    try {
      const result = await api.apiClient.sendRequest({
        repoId: tab.repoId,
        requestId,
        draft: tab.draft,
        collectionVariables,
      });
      set((state) => {
        // Superseded by a cancel or a newer send while this was in flight.
        if (state.inFlight[tabId] !== requestId) return {};
        const inFlight = { ...state.inFlight };
        delete inFlight[tabId];
        if (!result.ok) {
          return { inFlight, lastError: { ...state.lastError, [tabId]: result.message } };
        }
        const history = [result.value, ...(state.responses[tabId] ?? [])].slice(0, MAX_RESPONSE_HISTORY);
        const lastError = { ...state.lastError };
        delete lastError[tabId];
        return { inFlight, responses: { ...state.responses, [tabId]: history }, lastError };
      });
    } catch (error) {
      set((state) => {
        if (state.inFlight[tabId] !== requestId) return {};
        const inFlight = { ...state.inFlight };
        delete inFlight[tabId];
        return {
          inFlight,
          lastError: {
            ...state.lastError,
            [tabId]: error instanceof Error ? error.message : 'Request failed.',
          },
        };
      });
    }
  },

  cancelRequest: (tabId) => {
    const requestId = get().inFlight[tabId];
    if (!requestId) return;
    set((state) => {
      const inFlight = { ...state.inFlight };
      delete inFlight[tabId];
      return { inFlight };
    });
    const api = bridge();
    if (api) void api.apiClient.cancelRequest({ requestId });
  },
}));
