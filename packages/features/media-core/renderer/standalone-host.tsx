import type { MediaTab } from '@midnite/studio-shared';
import { useStore } from 'zustand';

import { createPersistedStore, type MediaPane } from '@midnite/studio-frame';

import type { MediaHost } from './host';
import { StandaloneAccordion, StandaloneMenu, StandaloneTooltip } from './standalone-chrome';

/** What a standalone media app persists: the tab it was on, pane widths and collapse state. */
export type StandaloneMediaState = {
  tab: MediaTab;
  widths: Partial<Record<`${MediaTab}:${MediaPane}`, number>>;
  collapsed: Partial<Record<`${MediaTab}:${MediaPane}`, boolean>>;
};

type Store = StandaloneMediaState & {
  setTab: (tab: MediaTab) => void;
  setWidth: (key: `${MediaTab}:${MediaPane}`, value: number) => void;
  setCollapsed: (key: `${MediaTab}:${MediaPane}`, value: boolean) => void;
};

/** Studio's Docs-pane defaults (`DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`), so a pane opens at a familiar width. */
const PANE = {
  explorer: { initial: 240, min: 180, max: 480 },
  detail: { initial: 340, min: 260, max: 640 },
} as const satisfies Record<MediaPane, { initial: number; min: number; max: number }>;

/**
 * A complete {@link MediaHost} for an app that is not Studio (Phase 113
 * Theme Q) — Creator's, and every media-core test's. Media is scoped to one
 * fixed `repoId` (the app's own media root, registered as a repository by its
 * main process). State persists under `key` in `storage` (localStorage by
 * default, nothing when `storage` is `undefined`), through the frame's
 * `createPersistedStore`, so a blocked storage never breaks the shell.
 */
export function createStandaloneMediaHost(options: {
  repoId: string | null;
  key?: string;
  storage?: Storage;
  initialTab?: MediaTab;
  exportDir?: string | null;
  noRepoBody?: MediaHost['noRepoBody'];
}): MediaHost {
  const defaults: StandaloneMediaState = { tab: options.initialTab ?? 'doc', widths: {}, collapsed: {} };
  const store = createPersistedStore<Store, StandaloneMediaState>({
    key: options.key ?? 'midnite-media.ui',
    defaults,
    pick: ({ tab, widths, collapsed }) => ({ tab, widths, collapsed }),
    state: (set, initial) => ({
      ...initial,
      setTab: (tab) => set({ tab }),
      setWidth: (key, value) => set((s) => ({ widths: { ...s.widths, [key]: value } })),
      setCollapsed: (key, value) => set((s) => ({ collapsed: { ...s.collapsed, [key]: value } })),
    }),
    ...('storage' in options ? { storage: options.storage } : {}),
  });

  function useActiveTab(): readonly [MediaTab, (tab: MediaTab) => void] {
    const tab = useStore(store, (s) => s.tab);
    return [tab, store.getState().setTab] as const;
  }
  function usePaneSize(tab: MediaTab, pane: MediaPane) {
    const key = `${tab}:${pane}` as const;
    const size = useStore(store, (s) => s.widths[key]) ?? PANE[pane].initial;
    return { size, setSize: (value: number) => store.getState().setWidth(key, value), ...PANE[pane] };
  }

  return {
    useActiveTab,
    useRepoId: () => options.repoId,
    useExportDir: () => options.exportDir ?? null,
    usePaneSize,
    usePaneCollapsed: (tab, pane) => useStore(store, (s) => s.collapsed[`${tab}:${pane}`] === true),
    setPaneCollapsed: (tab, pane, collapsed) => store.getState().setCollapsed(`${tab}:${pane}`, collapsed),
    Tooltip: StandaloneTooltip,
    ContextMenu: StandaloneMenu,
    Accordion: StandaloneAccordion,
    ...(options.noRepoBody ? { noRepoBody: options.noRepoBody } : {}),
  };
}
