import type { MediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { MediaTab } from '@midnite/studio-shared';
import type { MediaPane } from '@midnite/studio-frame';

import { Accordion } from '../components/accordion/accordion';
import { ContextMenu } from '../components/context-menu';
import { Tooltip } from '../components/tooltip';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, mediaLayoutKeys, useUiStore } from '../store/ui-store';

/**
 * Studio's side of media-core's host port (Phase 113 Theme Q).
 *
 * Every piece of state the media shell reads stays where Studio has always
 * persisted it — `ui-store`'s `mediaTab`, `mediaPaneCollapsed`,
 * `mediaExportDir`, the per-tab `LayoutSizes` widths and the selected repo —
 * so moving the shell into a package changed no stored key. The chrome is
 * Studio's own tooltip, context menu and accordion.
 */
function useActiveTab(): readonly [MediaTab, (tab: MediaTab) => void] {
  const tab = useUiStore((s) => s.mediaTab);
  const setTab = useUiStore((s) => s.setMediaTab);
  return [tab, setTab] as const;
}

function usePaneSize(tab: MediaTab, pane: MediaPane) {
  const key = mediaLayoutKeys(tab)[pane];
  const size = useUiStore((s) => s.layout[key]);
  const setLayout = useUiStore((s) => s.setLayout);
  return {
    size,
    setSize: (value: number) => setLayout(key, value),
    initial: DEFAULT_LAYOUT[key],
    ...LAYOUT_BOUNDS[key],
  };
}

export const STUDIO_MEDIA_HOST = {
  useActiveTab,
  useRepoId: () => useUiStore((s) => s.selectedRepoId),
  useExportDir: () => useUiStore((s) => s.mediaExportDir),
  usePaneSize,
  usePaneCollapsed: (tab, pane) => useUiStore((s) => s.mediaPaneCollapsed[tab]?.[pane] === true),
  setPaneCollapsed: (tab, pane, collapsed) => useUiStore.getState().setMediaPaneCollapsed(tab, pane, collapsed),
  Tooltip,
  ContextMenu,
  Accordion,
} satisfies MediaHost;
