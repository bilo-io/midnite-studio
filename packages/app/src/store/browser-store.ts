import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BrowserNavError, BrowserShortcutTile } from '@midnite/studio-shared';

import { PREVIEW_DEPLOY_HOSTS } from '../features/browser/preview-deploy';
import { WALLPAPER_STORAGE_KEY, WALLPAPER_THEMES, type WallpaperTheme } from '../features/browser/wallpaper';

import { adoptRenamedPersistKey } from './persist-rename';

export type { BrowserShortcutTile } from '@midnite/studio-shared';

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

/**
 * The responsive width the pane renders a tab at (Phase 71 Theme C).
 *
 * Per tab, not global: one tab checking a mobile layout should not narrow the
 * others. Phase 32 shipped this as component-local `useState`, so it reset
 * every time the pane closed — which for a control whose whole use is
 * "keep looking at this page narrow" is the one thing it must not do.
 *
 * The values are the widths themselves, as strings, because that is what the
 * `<select>` and the style both want. `'full'` means no constraint at all.
 */
export type BrowserViewportPreset = 'full' | '390' | '834' | '1280';

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
   * Responsive width preset — see {@link BrowserViewportPreset}. Absent on a
   * tab created before this existed (and on every tab restored from a
   * pre-Phase-71 persisted blob), which reads as `'full'`.
   */
  viewportPreset?: BrowserViewportPreset;
  /**
   * The view's process crashed or stopped answering (Theme A). Kept as tab
   * state rather than swallowed, so the pane can offer a reload instead of
   * showing a blank rectangle; cleared the moment the tab navigates again.
   */
  crashed?: boolean;
  /**
   * A blocked or failed navigation (Theme G) — `null`/absent once a
   * navigation is actually in flight (`did-start-loading`, i.e. a `loading:
   * true` event) or has succeeded. Rendered as `error-page.tsx`'s styled,
   * in-DOM surface rather than Chromium's own unstyled one.
   */
  navError?: BrowserNavError | null;
  /**
   * `'sleeping'` once main has discarded this tab's `WebContentsView` for
   * sitting hidden past `Settings ▸ Browser`'s idle threshold (Phase 84
   * Theme F); absent (not `'live'`) means live — the tab strip's own moon
   * glyph reads the absence, matching every other optional field here.
   * Cleared the moment a real navigation starts again (`loading: true`),
   * the same rule `navError` uses for "a previous failure is no longer
   * current".
   */
  state?: 'sleeping';
  /** Opts this tab out of the idle discard sweep — the tab strip's "Keep awake". */
  keepAwake?: boolean;
};

export type BrowserTabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
};

type ClosedTab = BrowserTab & { closedAtIndex: number };

const MAX_CLOSED = 20;
const MAX_RECENTS = 8;

/**
 * The new-tab page's own six, seeded on first run (Theme F). Used to live as
 * a private `new-tab-page.tsx` constant carrying real `IconComponent`
 * references; moved here — and onto `iconKey` — because it is persisted,
 * editable state now and `packages/shared` cannot hold a component.
 */
const DEFAULT_TILES: BrowserShortcutTile[] = [
  { id: 'google', label: 'Google', url: 'https://google.com', iconKey: 'google', brandColor: '#4285F4', bgColor: 'rgba(66, 133, 244, 0.15)' },
  { id: 'youtube', label: 'YouTube', url: 'https://youtube.com', iconKey: 'youtube', brandColor: '#FF0000', bgColor: 'rgba(255, 0, 0, 0.15)' },
  { id: 'figma', label: 'Figma', url: 'https://figma.com', iconKey: 'figma', brandColor: '#F24E1E', bgColor: 'rgba(242, 78, 30, 0.15)' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai', iconKey: 'claude', brandColor: '#D97706', bgColor: 'rgba(217, 119, 6, 0.15)' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com', iconKey: 'gemini', brandColor: '#8E75FF', bgColor: 'rgba(142, 117, 255, 0.15)' },
  { id: 'notebook', label: 'Notebook', url: 'https://notebooklm.google.com', iconKey: 'notebook', brandColor: '#34A853', bgColor: 'rgba(52, 168, 83, 0.15)' },
];

/** The step one `browser.zoomIn`/`zoomOut` command press moves the factor by (Theme G). */
export const ZOOM_STEP = 0.1;

/** Clamps to the same `0.25..5` range `BrowserZoomRequest` enforces at the IPC boundary. */
export function clampZoomFactor(factor: number): number {
  return Math.round(Math.min(5, Math.max(0.25, factor)) * 100) / 100;
}

/** `null` for an unparseable URL — callers treat that as "not an origin worth remembering". */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The last {@link MAX_RECENTS} distinct origins, most-recent-first.
 *
 * A pure function over the list rather than a `Set`, because order (recency)
 * is exactly what a `Set` throws away: re-visiting an existing origin must
 * promote it to the front, not leave it at its old position.
 */
export function pushRecentOrigin(recents: readonly string[], url: string): string[] {
  const origin = originOf(url);
  if (origin === null) return [...recents];
  return [origin, ...recents.filter((existing) => existing !== origin)].slice(0, MAX_RECENTS);
}

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
  /**
   * The preview-deploy matcher's host allowlist (Phase 71 Theme D), seeded
   * with {@link PREVIEW_DEPLOY_HOSTS} and editable from the Browser settings
   * page. A setting, not a constant, because a self-hosted preview domain is
   * the common case in a private repo — this one included — and a constant
   * would make that a code change.
   */
  previewDeployHosts: string[];

  /**
   * The last {@link MAX_RECENTS} distinct origins a tab has navigated to,
   * most-recent-first (Theme F). Origins, not URLs — a strip of eight
   * `github.com/...` paths is not a shortcut list — and pushed from
   * {@link BrowserState.updateTabState} itself so every navigation path
   * (a real `navigated` event, or the new-tab page's own optimistic
   * pre-navigate patch) feeds it through one place.
   */
  recents: string[];
  /**
   * The new-tab page's editable shortcut row (Theme F), seeded from
   * {@link DEFAULT_TILES} on first run. Persisted because the whole point is
   * that a user's edits survive a restart.
   */
  tiles: BrowserShortcutTile[];
  /**
   * The new-tab page's wallpaper theme (Theme F). Used to live in raw
   * `localStorage` under `wallpaper.ts`'s `WALLPAPER_STORAGE_KEY`, outside
   * zustand `persist` entirely — invisible to `broadcast-sync.ts` and to the
   * settings-diff surface Phase 63 built. `version: 2`'s `migrate` arm below
   * carries a legacy value forward once.
   */
  wallpaperTheme: WallpaperTheme;

  /**
   * A tab's zoom is an ABSOLUTE factor, persisted PER ORIGIN rather than per
   * tab (Theme G): re-opening a site returns to the factor it was left at,
   * where per-tab persistence would lose it the moment the tab that set it
   * closes. Main is never the source of truth for it — `browser-service.ts`
   * only ever applies whatever factor this store sends over `browser.zoom`.
   */
  zoomByOrigin: Record<string, number>;
  /**
   * Whether the find bar is open for the active tab (Theme G). Ephemeral —
   * not persisted, and not keyed per tab: only the active tab's find bar can
   * ever be open, so lifting this out of `browser-pane.tsx`'s own
   * `useState` is what lets `Mod+f` (a command, resolved outside that
   * component) toggle it.
   */
  findOpen: boolean;
  /**
   * The active tab's last `found-in-page` result (Theme G) — `null` before
   * the first search and once the find bar closes. Ephemeral, and not keyed
   * per tab for the same reason `findOpen` is not: only one find session can
   * be live at a time.
   */
  findResult: { matches: number; activeMatchOrdinal: number } | null;

  /** Opens a blank tab when `url` is omitted — including "zero tabs open" (Theme C's own rule). */
  openTab: (url?: string, originRepoId?: string) => string;
  /**
   * A `window.open`/`target="_blank"` from an existing tab (Theme B hands
   * these back rather than letting the engine spawn a window) — also how a
   * plain in-page link click with Mod+click or a middle click arrives here.
   * The new tab lands beside its opener and inherits its group, the way
   * every browser treats a link opened from a grouped tab. `foreground`
   * (default `true`) mirrors Electron's disposition: a background tab
   * (middle-click, Mod+click) must not steal focus from whatever tab the
   * user is already on, so it is inserted without becoming `activeTabId`.
   */
  openTabFrom: (openerId: string, url: string, foreground?: boolean) => string;
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
  /** The pane's width picker (Phase 71 Theme C) — per tab, and persisted with it. */
  setViewportPreset: (tabId: string, preset: BrowserViewportPreset) => void;
  /** Replaces the whole preview-deploy allowlist — the Browser settings page's editor. */
  setPreviewDeployHosts: (hosts: string[]) => void;

  /** Empties `recents` — exposed from the Browser settings page and the strip's own context menu. */
  clearRecents: () => void;
  /** Appends a new tile (no `iconKey`, so it renders the generic-globe fallback) and returns its id. */
  addTile: (tile: Omit<BrowserShortcutTile, 'id'>) => string;
  removeTile: (id: string) => void;
  renameTile: (id: string, label: string) => void;
  /** The full new order, not a from/to pair — same contract `SortableList.onReorder` uses. */
  reorderTiles: (ids: string[]) => void;
  setWallpaperTheme: (theme: WallpaperTheme) => void;

  /** Sets (or clears, at `1`) one origin's zoom factor — keyed by origin, never by tab. */
  setZoomForOrigin: (origin: string, factor: number) => void;
  toggleFind: () => void;
  /** Closing clears `findResult` too — a stale match count must not survive to the next search. */
  closeFind: () => void;
  setFindResult: (result: { matches: number; activeMatchOrdinal: number } | null) => void;
};

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.browser', 'midnite-studio.browser');

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      tabs: [],
      groups: [],
      activeTabId: null,
      recentlyClosed: [],
      previewDeployHosts: [...PREVIEW_DEPLOY_HOSTS],
      recents: [],
      tiles: [...DEFAULT_TILES],
      wallpaperTheme: 'nature',
      zoomByOrigin: {},
      findOpen: false,
      findResult: null,

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

      openTabFrom: (openerId, url, foreground = true) => {
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
          // A background tab (Mod+click / middle-click) is inserted but must
          // not steal focus — `activeTabId` only changes in the foreground case.
          return foreground ? { tabs, activeTabId: tab.id } : { tabs };
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
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
          // Every path that gives a tab a real destination — a live
          // `navigated` push and the new-tab page's own pre-navigate patch
          // alike — runs through here, so this is the one place recents need
          // to be recorded rather than duplicated at each call site.
          recents: patch.url !== undefined ? pushRecentOrigin(state.recents, patch.url) : state.recents,
        })),

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

      setViewportPreset: (tabId, viewportPreset) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, viewportPreset } : tab)),
        })),

      setPreviewDeployHosts: (hosts) => set({ previewDeployHosts: hosts }),

      clearRecents: () => set({ recents: [] }),

      addTile: (tile) => {
        const id = newId();
        set((state) => ({ tiles: [...state.tiles, { ...tile, id }] }));
        return id;
      },

      removeTile: (id) => set((state) => ({ tiles: state.tiles.filter((tile) => tile.id !== id) })),

      renameTile: (id, label) =>
        set((state) => ({
          tiles: state.tiles.map((tile) => (tile.id === id ? { ...tile, label } : tile)),
        })),

      reorderTiles: (ids) =>
        set((state) => {
          const byId = new Map(state.tiles.map((tile) => [tile.id, tile]));
          const tiles = ids
            .map((id) => byId.get(id))
            .filter((tile): tile is BrowserShortcutTile => tile !== undefined);
          return tiles.length === state.tiles.length ? { tiles } : state;
        }),

      setWallpaperTheme: (theme) => set({ wallpaperTheme: theme }),

      setZoomForOrigin: (origin, factor) =>
        set((state) => ({ zoomByOrigin: { ...state.zoomByOrigin, [origin]: factor } })),

      toggleFind: () =>
        set((state) => {
          const findOpen = !state.findOpen;
          return { findOpen, findResult: findOpen ? state.findResult : null };
        }),

      closeFind: () => set({ findOpen: false, findResult: null }),

      setFindResult: (result) => set({ findResult: result }),

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
      name: 'midnite-studio.browser',
      version: 2,
      /**
       * v1 → v2: `wallpaperTheme` moves out of raw `localStorage` and into
       * this store (Theme F). Reads `wallpaper.ts`'s legacy
       * `WALLPAPER_STORAGE_KEY` once, folds it into state, and deletes it —
       * a v1 payload with no legacy key (or an unparseable one) migrates to
       * the `'nature'` default, same as a fresh install.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as {
          activeTabId?: string | null;
          groups?: BrowserTabGroup[];
          previewDeployHosts?: string[];
          tabs?: BrowserTab[];
          recents?: string[];
          tiles?: BrowserShortcutTile[];
          wallpaperTheme?: WallpaperTheme;
          zoomByOrigin?: Record<string, number>;
        };
        let wallpaperTheme = state.wallpaperTheme ?? 'nature';
        if (version < 2) {
          try {
            const legacy = localStorage.getItem(WALLPAPER_STORAGE_KEY);
            if (legacy && WALLPAPER_THEMES.some((t) => t.id === legacy)) {
              wallpaperTheme = legacy as WallpaperTheme;
            }
            localStorage.removeItem(WALLPAPER_STORAGE_KEY);
          } catch {
            // Private mode or a disabled-storage policy — the default stands.
          }
        }
        return {
          activeTabId: state.activeTabId ?? null,
          groups: state.groups ?? [],
          previewDeployHosts: state.previewDeployHosts ?? [...PREVIEW_DEPLOY_HOSTS],
          tabs: state.tabs ?? [],
          recents: state.recents ?? [],
          tiles: state.tiles ?? [...DEFAULT_TILES],
          wallpaperTheme,
          zoomByOrigin: state.zoomByOrigin ?? {},
        };
      },
      partialize: (state) => ({
        activeTabId: state.activeTabId,
        groups: state.groups,
        previewDeployHosts: state.previewDeployHosts,
        recents: state.recents,
        tiles: state.tiles,
        wallpaperTheme: state.wallpaperTheme,
        zoomByOrigin: state.zoomByOrigin,
        // Runtime-only fields reset to their idle defaults — a restored tab
        // is an inactive record until the user activates it (see the
        // module doc above).
        tabs: state.tabs.map((tab) => ({
          ...tab,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          crashed: false,
          navError: null,
          // No `WebContentsView` exists for a restored tab until it is
          // activated (see the module doc above) — it is neither live nor
          // sleeping, so `state` itself is absent rather than persisting
          // whatever it last read. `keepAwake` is a real preference and
          // stays.
          state: undefined,
        })),
      }),
    },
  ),
);
