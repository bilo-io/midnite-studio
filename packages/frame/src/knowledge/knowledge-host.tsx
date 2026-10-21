import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import { bindKnowledgeSettings } from './knowledge-filters-store';

/**
 * The Knowledge view's host port (Phase 113 Theme M).
 *
 * Knowledge is frame-owned: the view, its sigma canvas and its hooks live in `packages/frame`, and
 * everything they used to read from Studio's own stores comes through this one port instead. The
 * composing app implements it once and installs it at its root:
 *
 *   <KnowledgeHostProvider host={studioKnowledgeHost}>...</KnowledgeHostProvider>
 *
 * Studio implements it from `ui-store`, `appearance-store` and `use-status`
 * (`packages/app/src/compose/knowledge-host.tsx`); Midnite Mind from its own notebook
 * (`apps/mind/src/compose/knowledge-host.tsx`). A member is added only for something the view really
 * reads, so the port stays a list, never a service locator.
 */

/** The persisted preferences and panel widths the Knowledge view reads and writes. */
export type KnowledgeSettings = {
  /** The canvas renderer id (`atlas`, `cytoscape`...). A plain string: an unknown one falls back on read. */
  rendererVariant: string;
  /** Which worker-computed layout the canvas asks for. */
  layoutId: string;
  /** How much of a large graph the canvas mounts up front. */
  detailId: string;
  /** The filter sidebar's width in px. */
  filtersWidth: number;
  /** The node / community detail panel's width in px. */
  detailWidth: number;
};

/** What the graph is of: an id the main half keys its caches on, and the folder its sources live under. */
export type KnowledgeCorpus = {
  /** `null` while nothing is selected - the view renders its empty state. */
  repoId: string | null;
  worktreePath?: string;
};

/** The props of the click-toggled panel the variant pills' overflow menu opens (Studio's `Popover`). */
export type KnowledgePopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  panelClassName?: string;
  triggerClassName?: string;
};

/** What a node's detail panel shows for the node's source: Studio previews the file, Mind shows the note. */
export type KnowledgeSourcePreviewProps = {
  repoId: string;
  worktreePath: string | null;
  sourceFile: string;
  /** 1-based, or `null` when the node has no line. */
  targetLine: number | null;
};

export type KnowledgeHost = {
  /** Whether this window has focus - gates the canvas's animation while blurred. A hook. */
  useFocus: () => boolean;
  /** Which corpus the view shows. A hook. */
  useCorpus: () => KnowledgeCorpus;
  /** The persisted settings, reactive. A hook. */
  useSettings: () => KnowledgeSettings;
  /** The same settings as a plain read - seeds the filters store before the first render. */
  getSettings: () => KnowledgeSettings;
  /** Persist one or more settings. */
  setSettings: (patch: Partial<KnowledgeSettings>) => void;
  /** Whether motion is reduced right now (the app's own preference, else the system's). Not a hook: the canvas reads it imperatively. */
  prefersReducedMotion: () => boolean;
  /** Where the filter and detail panels may be dragged to. */
  panelBounds: {
    filtersWidth: { min: number; max: number; initial: number };
    detailWidth: { min: number; max: number; initial: number };
  };
  /**
   * What the view shows when the corpus has no graph. Omitted, it shows the "graphify this repo"
   * instructions - right for a repository, wrong for a notebook that builds its own graph.
   */
  Absent?: ComponentType;
  Popover: ComponentType<KnowledgePopoverProps>;
  SourcePreview: ComponentType<KnowledgeSourcePreviewProps>;
};

const KnowledgeHostContext = createContext<KnowledgeHost | null>(null);

export function KnowledgeHostProvider({ host, children }: { host: KnowledgeHost; children: ReactNode }) {
  // Seeds the filters store from the host before any child reads it - the store is module-level, so
  // this is idempotent per host and never re-runs on a re-render.
  bindKnowledgeSettings(host);
  return <KnowledgeHostContext.Provider value={host}>{children}</KnowledgeHostContext.Provider>;
}

/** The installed host. Throws without a provider: a Knowledge view outside a composed app is a wiring bug. */
export function useKnowledgeHost(): KnowledgeHost {
  const host = useContext(KnowledgeHostContext);
  if (!host) throw new Error('useKnowledgeHost must be used inside <KnowledgeHostProvider>');
  return host;
}
