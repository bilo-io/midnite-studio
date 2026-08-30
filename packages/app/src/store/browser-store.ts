import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The browser's tabs and groups (Phase 32 Theme C/D).
 *
 * App-global, not per-repo (the doc's own "Open" question, resolved
 * app-global): `originRepoId` only drives which DERIVED group a tab lands
 * in, so switching the selected repository never hides your tabs.
 *
 * Persisted, but restored as inactive records — `loading`/`canGoBack`/
 * `canGoForward` reset to their idle defaults in `partialize` below, and NO
 * `WebContentsView` is created for a restored tab until it is activated
 * (Theme A's `browserCreate` is the renderer's job to call, not this
 * store's — see `use-browser-tabs.ts`). A relaunch never pays for a
 * Chromium process nobody has asked for yet.
 */

/** What a tab shows before anything has loaded — no view is mounted for one (Theme F owns its content). */
export type BrowserTabKind = 'newtab' | 'page';

export type BrowserTab = {
  id: string;
  kind: BrowserTabKind;
  url: string;
  title: string;
  faviconUrl?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /**
   * `undefined` — no explicit choice; a derived group applies if
   * `originRepoId` is set. `null` — explicitly ungrouped, overriding the
   * derived default. A string — a real `BrowserTabGroup.id`.
   */
  groupId?: string | null;
  /** The repo this tab was opened from, if any — drives its derived group. */
  originRepoId?: string;
  /**
   * The view's process crashed or stopped answering (Theme A). Kept as tab
   * state rather than swallowed, so the pane can offer a reload instead of
   * showing a blank rectangle; cleared the moment the tab navigates again.
   */
  crashed?: boolean;
};

export type BrowserTabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
};

type ClosedTab = BrowserTab & { closedAtIndex: number };

const MAX_CLOSED = 20;

const newId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

function makeTab(url?: string): BrowserTab {
  return {
    id: newId(),
    kind: url ? 'page' : 'newtab',
    url: url ?? '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

/**
 * A tab's actual group, resolving the three-state `groupId` against the
 * manual groups that currently exist.
 *
 * `null` means "not in any group" — both the explicit-override case and the
 * plain "no group at all, nothing to derive" case collapse to the same
 * answer, since neither renders a chip.
 */
export function effectiveGroupId(tab: BrowserTab, manualGroupIds: ReadonlySet<string>): string | null {
  if (tab.groupId === null) return null;
  if (tab.groupId !== undefined) return manualGroupIds.has(tab.groupId) ? tab.groupId : null;
  return tab.originRepoId ? `repo:${tab.originRepoId}` : null;
}

/** Every derived (repo, non-persisted) group currently implied by the open tabs. */
export function derivedGroupIds(tabs: readonly BrowserTab[]): string[] {
  const ids = new Set<string>();
  for (const tab of tabs) {
    if (tab.groupId === undefined && tab.originRepoId) ids.add(`repo:${tab.originRepoId}`);
  }
  return [...ids];
}

/**
 * Which tab takes focus once `closingId` closes.
 *
 * The right neighbour, falling back to the left — unlike the workbench
 * strip's "always left", because closing several tabs left-to-right should
 * not walk the selection backward through ones already gone.
 */
export function nextActiveAfterClose(
  tabs: readonly BrowserTab[],
  activeTabId: string | null,
  closingId: string,
): string | null {
  if (activeTabId !== closingId) return activeTabId;
  const index = tabs.findIndex((tab) => tab.id === closingId);
  if (index === -1) return activeTabId;
  return tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null;
}

type BrowserState = {
  tabs: BrowserTab[];
  groups: BrowserTabGroup[];
  activeTabId: string | null;
  recentlyClosed: ClosedTab[];

  /** Opens a blank tab when `url` is omitted — including "zero tabs open" (Theme C's own rule). */
  openTab: (url?: string, originRepoId?: string) => string;
  /**
   * A `window.open`/`target="_blank"` from an existing tab (Theme B hands
   * these back rather than letting the engine spawn a window). The new tab
   * lands beside its opener and inherits its group, the way every browser
   * treats a link opened from a grouped tab.
   */
  openTabFrom: (openerId: string, url: string) => string;
  /**
   * Opens a blank tab only if the strip is empty (Theme C's "toggle with
   * zero tabs creates one"). Checked INSIDE `set` rather than by the caller:
   * React's StrictMode invokes an effect twice with the same state, and a
   * caller-side `tabs.length === 0` guard opens two tabs for one toggle.
   */
  ensureTab: () => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeToRight: (id: string) => void;
  activateTab: (id: string) => void;
  /** 1-indexed; 9 always means "the last tab", matching Mod+9's meaning regardless of count. */
  activateNth: (n: number) => void;
  cycleTab: (direction: 1 | -1) => void;
  /** The full new order, not a from/to pair — same contract `SortableList.onReorder` uses. */
  reorderTabs: (ids: string[]) => void;
  duplicateTab: (id: string) => string;
  reopenClosed: () => void;
  updateTabState: (id: string, patch: Partial<Omit<BrowserTab, 'id'>>) => void;

  createGroup: (name: string, color: string) => string;
  renameGroup: (id: string, name: string) => void;
  setGroupColor: (id: string, color: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  moveTabToGroup: (tabId: string, groupId: string | null) => void;
  /** Deletes the group, keeping its tabs — they fall back to their derived default, if any. */
  ungroupKeepTabs: (groupId: string) => void;
  /** Closes every tab in a manual OR derived group, addressed by its effective id. */
  closeTabsInGroup: (targetGroupId: string) => void;
};

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      tabs: [],
      groups: [],
      activeTabId: null,
      recentlyClosed: [],

      openTab: (url, originRepoId) => {
        const tab: BrowserTab = { ...makeTab(url), ...(originRepoId ? { originRepoId } : {}) };
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
        return tab.id;
      },

      ensureTab: () =>
        set((state) => {
          if (state.tabs.length > 0) return state;
          const tab = makeTab();
          return { tabs: [tab], activeTabId: tab.id };
        }),

      openTabFrom: (openerId, url) => {
        const state = get();
        const index = state.tabs.findIndex((tab) => tab.id === openerId);
        const opener = state.tabs[index];
        const tab: BrowserTab = {
          ...makeTab(url),
          ...(opener?.groupId !== undefined ? { groupId: opener.groupId } : {}),
          ...(opener?.originRepoId ? { originRepoId: opener.originRepoId } : {}),
        };
        set((s) => {
          const tabs = [...s.tabs];
          tabs.splice(index === -1 ? tabs.length : index + 1, 0, tab);
          return { tabs, activeTabId: tab.id };
        });
        return tab.id;
      },

      closeTab: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === id);
          if (index === -1) return state;
          const closing = state.tabs[index];
          const remaining = state.tabs.filter((tab) => tab.id !== id);
          const recentlyClosed = closing
            ? [{ ...closing, closedAtIndex: index }, ...state.recentlyClosed].slice(0, MAX_CLOSED)
            : state.recentlyClosed;

          if (remaining.length === 0) {
            const fresh = makeTab();
            return { tabs: [fresh], activeTabId: fresh.id, recentlyClosed };
          }
          return {
            tabs: remaining,
            activeTabId: nextActiveAfterClose(state.tabs, state.activeTabId, id),
            recentlyClosed,
          };
        }),

      closeOthers: (id) =>
        set((state) => {
          const kept = state.tabs.filter((tab) => tab.id === id);
          if (kept.length === 0) return state;
          return { tabs: kept, activeTabId: id };
        }),

      closeToRight: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === id);
          if (index === -1) return state;
          const tabs = state.tabs.slice(0, index + 1);
          const stillOpen = tabs.some((tab) => tab.id === state.activeTabId);
          return { tabs, activeTabId: stillOpen ? state.activeTabId : id };
        }),

      activateTab: (id) => set({ activeTabId: id }),

      activateNth: (n) =>
        set((state) => {
          if (state.tabs.length === 0) return state;
          const index = n === 9 ? state.tabs.length - 1 : Math.min(n - 1, state.tabs.length - 1);
          const tab = state.tabs[index];
          return tab ? { activeTabId: tab.id } : state;
        }),

      cycleTab: (direction) =>
        set((state) => {
          if (state.tabs.length === 0) return state;
          const from = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
          const next = (((from === -1 ? 0 : from) + direction) % state.tabs.length + state.tabs.length) %
            state.tabs.length;
          return { activeTabId: state.tabs[next]?.id ?? state.activeTabId };
        }),

      reorderTabs: (ids) =>
        set((state) => {
          const byId = new Map(state.tabs.map((tab) => [tab.id, tab]));
          const tabs = ids.map((id) => byId.get(id)).filter((tab): tab is BrowserTab => tab !== undefined);
          return tabs.length === state.tabs.length ? { tabs } : state;
        }),

      duplicateTab: (id) => {
        const state = get();
        const index = state.tabs.findIndex((tab) => tab.id === id);
        const source = state.tabs[index];
        if (!source) return '';
        const copy: BrowserTab = { ...source, id: newId() };
        set((s) => {
          const tabs = [...s.tabs];
          tabs.splice(index + 1, 0, copy);
          return { tabs, activeTabId: copy.id };
        });
        return copy.id;
      },

      reopenClosed: () =>
        set((state) => {
          const [mostRecent, ...rest] = state.recentlyClosed;
          if (!mostRecent) return state;
          const { closedAtIndex, ...tab } = mostRecent;
          const tabs = [...state.tabs];
          tabs.splice(Math.min(closedAtIndex, tabs.length), 0, tab);
          return { tabs, activeTabId: tab.id, recentlyClosed: rest };
        }),

      updateTabState: (id, patch) =>
        set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)) })),

      createGroup: (name, color) => {
        const id = newId();
        set((state) => ({ groups: [...state.groups, { id, name, color, collapsed: false }] }));
        return id;
      },

      renameGroup: (id, name) =>
        set((state) => ({ groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)) })),

      setGroupColor: (id, color) =>
        set((state) => ({ groups: state.groups.map((g) => (g.id === id ? { ...g, color } : g)) })),

      toggleGroupCollapsed: (id) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)),
        })),

      /**
       * Assigning a group also RELOCATES the tab next to that group's last
       * member: the strip renders a group as a contiguous run, so a tab
       * joining from the far end would otherwise draw the same group twice.
       * Leaving a group (`null`) moves nothing — the tab stays where the
       * user last put it.
       */
      moveTabToGroup: (tabId, groupId) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === tabId);
          const moving = state.tabs[index];
          if (!moving) return state;
          const updated = { ...moving, groupId };
          if (groupId === null) {
            const tabs = [...state.tabs];
            tabs[index] = updated;
            return { tabs };
          }
          const rest = state.tabs.filter((tab) => tab.id !== tabId);
          const manualIds = new Set(state.groups.map((g) => g.id));
          let insertAt = rest.length;
          for (let i = rest.length - 1; i >= 0; i -= 1) {
            const candidate = rest[i];
            if (candidate && effectiveGroupId(candidate, manualIds) === groupId) {
              insertAt = i + 1;
              break;
            }
          }
          const tabs = [...rest];
          tabs.splice(insertAt, 0, updated);
          return { tabs };
        }),

      ungroupKeepTabs: (groupId) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== groupId),
          tabs: state.tabs.map((tab) => (tab.groupId === groupId ? { ...tab, groupId: undefined } : tab)),
        })),

      closeTabsInGroup: (targetGroupId) =>
        set((state) => {
          const manualIds = new Set(state.groups.map((g) => g.id));
          const staying = state.tabs.filter(
            (tab) => effectiveGroupId(tab, manualIds) !== targetGroupId,
          );
          const tabs = staying.length > 0 ? staying : [makeTab()];
          const stillOpen = tabs.some((tab) => tab.id === state.activeTabId);
          return { tabs, activeTabId: stillOpen ? state.activeTabId : (tabs[0]?.id ?? null) };
        }),
    }),
    {
      name: 'midnite-git.browser',
      version: 1,
      partialize: (state) => ({
        activeTabId: state.activeTabId,
        groups: state.groups,
        // Runtime-only fields reset to their idle defaults — a restored tab
        // is an inactive record until the user activates it (see the
        // module doc above).
        tabs: state.tabs.map((tab) => ({
          ...tab,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          crashed: false,
        })),
      }),
    },
  ),
);
