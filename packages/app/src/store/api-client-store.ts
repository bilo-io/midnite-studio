import { create } from 'zustand';

import type {
  ApiCollectionSummary,
  ApiEnvironmentSummary,
  ApiHistoryEntry,
  ApiRequestDraft,
  ApiResponse,
  ApiRunDoneEvent,
  ApiRunEvent,
  ApiRunItemResult,
  ApiRunSummary,
  ApiRunTarget,
  PostmanEnvironment,
  PostmanItem,
  SaveEnvironmentOutcome,
  ScriptRun,
} from '@midnite/studio-shared';
import { toDraft } from '@midnite/studio-shared';

import { parseQueryString, splitUrl } from '../features/api-client/query-string';
import { bridge } from '../services/bridge';
import { useUiStore } from './ui-store';

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
 * A tab's Tests-script run state (Phase 70 Theme B) — never persisted, same
 * as `responses`/`inFlight`: it describes what happened to *this* tab's most
 * recent send, not something a reload should restore.
 *
 * `needs-consent` and `declined` are both terminal until the user acts again
 * — `test-results-panel.tsx` renders the consent bar for the former and a
 * one-line "won't run" notice for the latter, never a stale result list from
 * a run that never actually happened.
 */
export type ScriptTabState =
  | { status: 'idle' }
  | { status: 'needs-consent' }
  | { status: 'declined' }
  | { status: 'ran'; run: ScriptRun }
  | { status: 'error'; message: string };

/**
 * One collection's run state (Phase 70 Theme C), keyed by `collectionId` in
 * `runs` below — mirrors `ScriptTabState`'s own shape one level up: a
 * `needs-consent`/`declined` pair for the trust gate (checked once for the
 * whole run, never per request), `running` while events are still arriving,
 * and a terminal `done` carrying the full `ApiRunSummary`. Never persisted —
 * a run is in-memory only (the phase doc's own note on why: a run's
 * responses would multiply the redaction surface by the size of a
 * collection).
 */
export type ApiRunState =
  | { status: 'idle' }
  | { status: 'needs-consent' }
  | { status: 'declined' }
  | { status: 'running'; runId: string; total: number; items: ApiRunItemResult[] }
  | { status: 'done'; runId: string; summary: ApiRunSummary; items: ApiRunItemResult[] }
  | { status: 'error'; message: string };

/** `draft.headers`' enabled, non-empty-key rows as the flat map
 *  `ApiRunScriptRequest.request.headers` wants — `pm.request` reflects the
 *  draft exactly as the renderer holds it (`{{var}}` unresolved), never the
 *  interpolated wire request `send.ts` actually sent (see `script-runner.ts`'s
 *  own header for why: the resolved request can carry a secret). */
function draftHeaderRecord(draft: ApiRequestDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of draft.headers) {
    if (!row.enabled || row.key === '') continue;
    out[row.key] = row.value;
  }
  return out;
}

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

  // --- environments (Phase 70 Theme A) ----------------------------------------
  environments: ApiEnvironmentSummary[];
  environmentsRepoId: string | null;
  environmentsStatus: 'idle' | 'loading' | 'ready' | 'error';
  environmentsError: string | null;

  // --- request tabs ----------------------------------------------------------
  tabs: ApiTab[];
  activeTabId: string | null;
  /** Response history per tab, newest first, capped at 10. Never persisted. */
  responses: Record<string, ApiResponse[]>;
  /** tabId -> the in-flight request's id, while a send is outstanding. */
  inFlight: Record<string, string>;
  /** tabId -> the last `{ok:false}` envelope's message, cleared on retry/success. */
  lastError: Record<string, string>;

  // --- pm.* test scripts (Phase 70 Theme B) -----------------------------------
  /** tabId -> the last run of that tab's Tests script (or the consent
   *  decision blocking one). Never persisted — see `ScriptTabState`. */
  scriptRuns: Record<string, ScriptTabState>;

  // --- the collection runner (Phase 70 Theme C) -------------------------------
  /** collectionId -> that collection's current (or last) run. Never
   *  persisted — see `ApiRunState`. */
  runs: Record<string, ApiRunState>;

  // --- persisted request history (Phase 70 Theme D) --------------------------
  // Metadata only — no headers, no bodies (`main/api-client/history.ts`'s own
  // whole design). Recording happens as a side effect of every `sendRequest`
  // on the main side; this slice only ever reads or clears what accumulated.
  history: ApiHistoryEntry[];
  historyRepoId: string | null;
  historyStatus: 'idle' | 'loading' | 'ready' | 'error';
  historyError: string | null;
  loadHistory: (repoId: string) => Promise<void>;
  clearHistory: (repoId: string) => Promise<void>;

  loadCollections: (repoId: string) => Promise<void>;

  loadEnvironments: (repoId: string) => Promise<void>;
  /**
   * Saves an existing (`environmentId` non-null) or brand-new environment.
   * Returns the outcome as-is (`{status:'saved'}` or
   * `{status:'needs-confirm', secretCount, gitignorePath}`) so the editor
   * decides whether to raise the blast-radius confirm and resend with
   * `confirmed: true` — this action never shows a dialog itself, since a
   * store has no UI to raise one in. `environments` is refreshed from disk
   * on `'saved'` — the base file's shape changed (a secret's value blanked),
   * which only a re-read reflects correctly.
   */
  saveEnvironment: (
    repoId: string,
    environmentId: string | null,
    environment: PostmanEnvironment,
    confirmed?: boolean,
  ) => Promise<{ ok: true; value: SaveEnvironmentOutcome } | { ok: false; message: string }>;
  removeEnvironment: (repoId: string, environmentId: string) => Promise<void>;

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
  /**
   * Renames the collection itself (`info.name`), not an item in its `item[]`
   * tree — `renameItem` cannot reach it. Unlike a folder/request rename,
   * which only marks the collection dirty for Theme G's explicit Save, this
   * persists immediately via `apiClient.saveCollection` (Phase 66 Themes E/G,
   * PR #227): a collection's own name is metadata about the file, not
   * content of the tree a Save button is deferring, and it sits beside
   * `removeCollection` — the other collection-level action that is real I/O
   * rather than an in-memory tree edit.
   */
  renameCollection: (collectionId: string, newName: string) => Promise<void>;

  /** Sends the tab's current draft. Used by both the Send button and Retry.
   *  Runs the tab's Tests script afterward (Theme B) when it resolved
   *  successfully and the draft's `testScript` is non-empty — never from
   *  inside the send itself; Theme C's runner needs to call send without
   *  scripts and scripts without send. */
  sendRequest: (tabId: string) => Promise<void>;
  cancelRequest: (tabId: string) => void;

  /**
   * Runs the tab's `testScript` against its most recent response.
   * `runAnyway: true` is *Run once* on the consent bar — it runs this one
   * call without persisting a trust decision; every other caller (the
   * automatic post-send run, a manual re-run) omits it, so an untrusted
   * collection answers `needs-consent` instead of running.
   */
  runTestScript: (tabId: string, runAnyway?: boolean) => Promise<void>;
  /** Persists a script-trust decision for `tab.collectionId`, then — only
   *  for `trusted: true` (*Always for this collection*) — re-runs the
   *  tab's Tests script, now that it will not bounce off `needs-consent`
   *  again. `trusted: false` (*Never*) only persists the decision. */
  setScriptTrust: (tabId: string, trusted: boolean) => Promise<void>;

  /**
   * Opens the native file picker for the Body tab's `binary` mode and a
   * `form-data` file row (Theme D). A thin bridge wrapper, not a mutation —
   * unlike `renameCollection`/`removeCollection` this touches no store
   * state itself; both callers apply the picked path to whichever field it
   * belongs to (`draft.binaryPath`, or one `FormDataRow`'s `value`)
   * themselves, since only the caller knows which one that is. Resolves
   * `null` on a cancelled dialog or a missing bridge, same as a cancel.
   */
  pickBinaryFile: () => Promise<string | null>;

  /**
   * Starts a collection run — the environment picker's current selection
   * for `repoId` (Theme A's own `activeEnvironmentByRepo`), a fresh `runId`,
   * and `target` (the whole collection or one folder). Resolves immediately:
   * `{status:'started'}` moves `runs[collectionId]` to `running` with an
   * empty item list that `applyRunProgress` fills in as events arrive;
   * `{status:'needs-consent'}` is the trust gate, checked once for the
   * whole run rather than per request. `runAnyway: true` is *Run once* on
   * the runner's own consent bar.
   */
  startRun: (repoId: string, collectionId: string, target: ApiRunTarget, runAnyway?: boolean) => Promise<void>;
  /** Aborts the in-flight request and stops before the next is dequeued —
   *  a no-op if `collectionId` has no run currently `running`. */
  stopRun: (collectionId: string) => void;
  /** One request's just-settled result, off `apiClient.onRunProgress` — a
   *  no-op for an event whose `runId` names no `running` entry (a run this
   *  window superseded or already finished). */
  applyRunProgress: (event: ApiRunEvent) => void;
  /** The run's terminal summary, off `apiClient.onRunDone`. */
  applyRunDone: (event: ApiRunDoneEvent) => void;
};

export const useApiClientStore = create<ApiClientState>()((set, get) => ({
  collections: [],
  collectionsRepoId: null,
  collectionsStatus: 'idle',
  collectionsError: null,
  dirtyCollectionIds: new Set(),

  environments: [],
  environmentsRepoId: null,
  environmentsStatus: 'idle',
  environmentsError: null,

  tabs: [],
  activeTabId: null,
  responses: {},
  inFlight: {},
  lastError: {},
  scriptRuns: {},
  runs: {},

  history: [],
  historyRepoId: null,
  historyStatus: 'idle',
  historyError: null,

  loadHistory: async (repoId) => {
    const api = bridge();
    if (!api) {
      set({ historyStatus: 'error', historyError: 'No connection to the app.' });
      return;
    }
    set({ historyStatus: 'loading', historyError: null, historyRepoId: repoId });
    try {
      const result = await api.apiClient.listHistory({ repoId });
      if (!result.ok) {
        set({ historyStatus: 'error', historyError: result.message });
        return;
      }
      set({ historyStatus: 'ready', history: result.value, historyRepoId: repoId });
    } catch {
      set({ historyStatus: 'error', historyError: 'Could not load the request history.' });
    }
  },

  clearHistory: async (repoId) => {
    const api = bridge();
    if (!api) return;
    const result = await api.apiClient.clearHistory({ repoId });
    if (!result.ok) return;
    if (get().historyRepoId === repoId) set({ history: [] });
  },

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

  loadEnvironments: async (repoId) => {
    const api = bridge();
    if (!api) {
      set({ environmentsStatus: 'error', environmentsError: 'No connection to the app.' });
      return;
    }
    set({ environmentsStatus: 'loading', environmentsError: null, environmentsRepoId: repoId });
    try {
      const result = await api.apiClient.listEnvironments({ repoId });
      if (!result.ok) {
        set({ environmentsStatus: 'error', environmentsError: result.message });
        return;
      }
      set({ environmentsStatus: 'ready', environments: result.value, environmentsRepoId: repoId });
    } catch {
      set({ environmentsStatus: 'error', environmentsError: 'Could not load API environments.' });
    }
  },

  saveEnvironment: async (repoId, environmentId, environment, confirmed = false) => {
    const api = bridge();
    if (!api) return { ok: false, message: 'No connection to the app.' };
    try {
      const result = await api.apiClient.saveEnvironment({ repoId, environmentId, environment, confirmed });
      if (!result.ok) return { ok: false, message: result.message };
      // A `needs-confirm` outcome wrote nothing — nothing to refresh yet;
      // the editor resends with `confirmed: true` once the user accepts.
      if (result.value.status === 'saved' && get().environmentsRepoId === repoId) {
        await get().loadEnvironments(repoId);
      }
      return { ok: true, value: result.value };
    } catch {
      return { ok: false, message: 'Could not save the environment.' };
    }
  },

  removeEnvironment: async (repoId, environmentId) => {
    const api = bridge();
    if (!api) return;
    const result = await api.apiClient.deleteEnvironment({ repoId, environmentId });
    if (!result.ok) return;
    set((state) => ({
      environments: state.environments.filter((summary) => summary.id !== environmentId),
    }));
  },

  openTab: (ref) => {
    const id = apiTabId(ref);
    set((state) => {
      // Already open — focus it. Re-toasting `toDraft(ref.item)` here would
      // blow away any unsaved edits the tab already carries.
      if (state.tabs.some((tab) => tab.id === id)) return { activeTabId: id };
      const draft = toDraft(ref.item);
      // `toDraft` (Theme A) always seeds `params: []` — it has no Params tab
      // to populate yet. Theme D's does, and the URL↔params sync rule makes
      // the URL authoritative, so a request opened with `?a=1` already in
      // its URL shows that row from the very first render rather than only
      // after the URL field is blurred once.
      draft.params = parseQueryString(splitUrl(draft.url).query);
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
      const scriptRuns = { ...state.scriptRuns };
      delete scriptRuns[id];
      return { tabs, activeTabId, inFlight, lastError, scriptRuns };
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
      const scriptRuns = { ...state.scriptRuns };
      for (const id of closingTabIds) {
        delete inFlight[id];
        delete lastError[id];
        delete scriptRuns[id];
      }
      return { tabs, activeTabId: stillOpen ? state.activeTabId : null, inFlight, lastError, scriptRuns };
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

  renameCollection: async (collectionId, newName) => {
    const repoId = get().collectionsRepoId;
    const summary = get().collections.find((s) => s.id === collectionId);
    if (!summary) return;
    const collection = { ...summary.collection, info: { ...summary.collection.info, name: newName } };
    const api = bridge();
    if (api && repoId) {
      const result = await api.apiClient.saveCollection({ repoId, collectionId, collection });
      if (!result.ok) return;
    }
    set((state) => ({
      collections: state.collections.map((s) => (s.id === collectionId ? { ...s, collection } : s)),
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
    // Read fresh from ui-store rather than threaded in as a parameter: the
    // quick-switcher (Phase 70 Theme A) lives in a different store, and every
    // caller of this action — the Send button, Retry — reaches it exactly
    // this way rather than each having to know where the selection lives.
    const environmentId = useUiStore.getState().activeEnvironmentByRepo[tab.repoId] ?? null;

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
        environmentId,
        collectionId: tab.collectionId,
        itemPath: tab.itemPath,
      });
      set((state) => {
        // Superseded by a cancel or a newer send while this was in flight.
        if (state.inFlight[tabId] !== requestId) return {};
        const inFlight = { ...state.inFlight };
        delete inFlight[tabId];
        if (!result.ok) {
          return { inFlight, lastError: { ...state.lastError, [tabId]: result.message } };
        }
        const responseHistory = [result.value, ...(state.responses[tabId] ?? [])].slice(
          0,
          MAX_RESPONSE_HISTORY,
        );
        const lastError = { ...state.lastError };
        delete lastError[tabId];
        return { inFlight, responses: { ...state.responses, [tabId]: responseHistory }, lastError };
      });
      // A settled response (2xx through 5xx alike) recorded a row on the main
      // side (`send.ts`) — refresh this repo's history list to reflect it,
      // same as `saveEnvironment` refreshing `environments` after a write it
      // did not make from this slice's own state. Skipped on a failed send:
      // `send.ts` only records a *settled* response, never a transport throw.
      if (result.ok && get().historyRepoId === tab.repoId) {
        void get().loadHistory(tab.repoId);
      }
      // Theme B: the Tests script runs from here, after send has settled —
      // never from inside `sendApiRequest` itself (Theme C's runner needs to
      // call send without scripts and scripts without send). Only for a
      // settled response and a non-empty script; a failed/aborted send has
      // no `pm.response` to hand it.
      if (result.ok && tab.draft.testScript.trim().length > 0) {
        void get().runTestScript(tabId);
      }
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

  runTestScript: async (tabId, runAnyway = false) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const api = bridge();
    if (!api) {
      set((state) => ({
        scriptRuns: { ...state.scriptRuns, [tabId]: { status: 'error', message: 'No connection to the app.' } },
      }));
      return;
    }

    const lastResponse = get().responses[tabId]?.[0] ?? null;
    const environmentId = useUiStore.getState().activeEnvironmentByRepo[tab.repoId] ?? null;
    const collection = get().collections.find((summary) => summary.id === tab.collectionId);
    const collectionVariables = collection?.collection.variable ?? [];

    try {
      const result = await api.apiClient.runScript({
        repoId: tab.repoId,
        collectionId: tab.collectionId,
        source: tab.draft.testScript,
        environmentId,
        collectionVariables,
        request: { method: tab.draft.method, url: tab.draft.url, headers: draftHeaderRecord(tab.draft) },
        response: lastResponse
          ? {
              status: lastResponse.status,
              statusText: lastResponse.statusText,
              headers: lastResponse.headers,
              body: lastResponse.body,
              bodyIsJson: lastResponse.bodyIsJson,
            }
          : null,
        runAnyway,
      });

      if (!result.ok) {
        set((state) => ({
          scriptRuns: { ...state.scriptRuns, [tabId]: { status: 'error', message: result.message } },
        }));
        return;
      }

      const outcome = result.value;
      set((state) => ({
        scriptRuns: {
          ...state.scriptRuns,
          [tabId]: outcome.status === 'ran' ? { status: 'ran', run: outcome.run } : { status: 'needs-consent' },
        },
      }));

      // A save-side environment mutation changed the file on disk (Theme B's
      // handler applies `pm.environment.set` through `saveEnvironment`) —
      // refresh the same way `saveEnvironment`'s own store action does.
      if (outcome.status === 'ran' && Object.keys(outcome.run.mutations.environment).length > 0) {
        if (get().environmentsRepoId === tab.repoId) void get().loadEnvironments(tab.repoId);
      }
    } catch {
      set((state) => ({
        scriptRuns: { ...state.scriptRuns, [tabId]: { status: 'error', message: 'Could not run the script.' } },
      }));
    }
  },

  setScriptTrust: async (tabId, trusted) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const api = bridge();
    if (!api) return;
    const result = await api.apiClient.setScriptTrust({
      repoId: tab.repoId,
      collectionId: tab.collectionId,
      trusted,
    });
    if (!result.ok) return;
    if (trusted) {
      // *Always for this collection* — the decision is saved; re-run now
      // that it will not bounce off `needs-consent` again.
      void get().runTestScript(tabId);
    } else {
      // *Never* — nothing runs; the panel shows a one-line notice instead
      // of leaving the consent bar up for a decision already made.
      set((state) => ({ scriptRuns: { ...state.scriptRuns, [tabId]: { status: 'declined' } } }));
    }
  },

  pickBinaryFile: async () => {
    const api = bridge();
    if (!api) return null;
    const result = await api.apiClient.pickBinaryFile();
    return result.ok ? result.value : null;
  },

  startRun: async (repoId, collectionId, target, runAnyway = false) => {
    const api = bridge();
    if (!api) return;
    const environmentId = useUiStore.getState().activeEnvironmentByRepo[repoId] ?? null;
    // Mirrors `sendRequest`'s own `requestId` shape one line above — no
    // `crypto.randomUUID()` precedent in this file, and a run has the exact
    // same "must be unique, never read back apart from correlation" need.
    const runId = `${collectionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const result = await api.apiClient.runCollection({
      runId,
      repoId,
      collectionId,
      environmentId,
      target,
      runAnyway,
    });

    if (!result.ok) {
      set((state) => ({ runs: { ...state.runs, [collectionId]: { status: 'error', message: result.message } } }));
      return;
    }

    set((state) => ({
      runs: {
        ...state.runs,
        [collectionId]:
          result.value.status === 'needs-consent'
            ? { status: 'needs-consent' }
            : { status: 'running', runId, total: 0, items: [] },
      },
    }));
  },

  stopRun: (collectionId) => {
    const run = get().runs[collectionId];
    if (!run || run.status !== 'running') return;
    const api = bridge();
    if (!api) return;
    void api.apiClient.cancelRun({ runId: run.runId });
  },

  applyRunProgress: (event) => {
    set((state) => {
      const entry = Object.entries(state.runs).find(
        ([, run]) => run.status === 'running' && run.runId === event.runId,
      );
      if (!entry) return {}; // superseded or already finished — a late/stray event, ignored
      const [collectionId, run] = entry;
      if (run.status !== 'running') return {};
      const items = [...run.items];
      items[event.index] = event.item;
      return {
        runs: { ...state.runs, [collectionId]: { status: 'running', runId: run.runId, total: event.total, items } },
      };
    });
  },

  applyRunDone: (event) => {
    set((state) => {
      const entry = Object.entries(state.runs).find(
        ([, run]) => run.status === 'running' && run.runId === event.runId,
      );
      if (!entry) return {};
      const [collectionId, run] = entry;
      if (run.status !== 'running') return {};
      return {
        runs: {
          ...state.runs,
          [collectionId]: { status: 'done', runId: run.runId, summary: event.summary, items: run.items },
        },
      };
    });
  },
}));
