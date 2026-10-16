import type { MediaTab } from '@midnite/studio-shared';
import type { MediaAccordionProps, MediaPane } from '@midnite/studio-frame';
import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode, type RefObject } from 'react';

/**
 * media-core's host port (Phase 113 Theme Q) — the app state and chrome the
 * media shell reads but does not own.
 *
 * Studio keeps every one of these in its persisted `ui-store` (the active tab,
 * per-tab pane widths and collapse state, the export folder, the selected
 * repository), so nothing stored moved when the shell did; its adapter is
 * `packages/app/src/compose/media-host.tsx`. Creator keeps its own, over one
 * media root instead of a repository list.
 */

export type MediaPaneSize = {
  size: number;
  setSize: (value: number) => void;
  /** What a reset returns to. */
  initial: number;
  min: number;
  max: number;
};

export type MediaTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  /** A single focusable element. */
  children: ReactElement<Record<string, unknown>>;
};

export type MediaMenuItem = {
  label: string;
  checked?: boolean;
  checkKind?: 'radio';
  onSelect: () => void;
};

export type MediaMenuProps = {
  position: { x: number; y: number };
  items: MediaMenuItem[];
  onClose: () => void;
  /** The control that opened the menu; pressing it again closes it. */
  trigger?: RefObject<HTMLElement | null>;
};

export type MediaHost = {
  /** The active tab and its setter. A hook. */
  useActiveTab: () => readonly [MediaTab, (tab: MediaTab) => void];
  /** The repository media is scoped to, or null with none open. A hook. */
  useRepoId: () => string | null;
  /** Settings ▸ Media's export folder. A hook. */
  useExportDir: () => string | null;
  /** One side pane's persisted width. A hook. */
  usePaneSize: (tab: MediaTab, pane: MediaPane) => MediaPaneSize;
  /** Whether one side pane is collapsed. A hook. */
  usePaneCollapsed: (tab: MediaTab, pane: MediaPane) => boolean;
  /** Collapses or reopens a side pane — callable outside render. */
  setPaneCollapsed: (tab: MediaTab, pane: MediaPane, collapsed: boolean) => void;
  Tooltip: ComponentType<MediaTooltipProps>;
  ContextMenu: ComponentType<MediaMenuProps>;
  Accordion: ComponentType<MediaAccordionProps>;
  /** Shown under "Open a repo" — the empty state of a repo-scoped tab with none selected. */
  noRepoBody?: (tab: MediaTab, label: string) => string;
};

const MediaHostContext = createContext<MediaHost | null>(null);

export function MediaHostProvider({ host, children }: { host: MediaHost; children: ReactNode }) {
  return <MediaHostContext.Provider value={host}>{children}</MediaHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the shell would persist nothing. */
export function useMediaHost(): MediaHost {
  const host = useContext(MediaHostContext);
  if (!host) throw new Error('The media shell must be rendered inside <MediaHostProvider>');
  return host;
}
