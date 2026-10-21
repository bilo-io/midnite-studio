import type { FfmpegStatus, MediaFileEntry, MediaProject, MediaTab } from '@midnite/studio-shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type {
  ExportToolbarProps,
  MediaAccordionProps,
  MediaExporter,
  MediaLayoutProps,
  MediaMutations,
  MediaOpenKind,
  MediaOpenRequest,
  MediaPane,
  MediaPaneTogglesProps,
  MediaProjectsAccordionProps,
  MediaTooltipProps,
} from './media-kit-types';

/**
 * The media kit port (Phase 113 Theme Q) — the shell plumbing a media tab
 * composes: the three-pane layout, the projects explorer, the export toolbar
 * and the data hooks over the repo-scoped media store.
 *
 * A tab feature (`media-docs`, `media-images`, Theme S's map/terrain/…) may not
 * import `media-core`, which implements all of this — features never import one
 * another. So the frame declares the shape, media-core's `MediaShell` installs
 * its implementation around the tabs it renders, and a tab reads it with
 * {@link useMediaKit}. Every member is a stable function or component, so a
 * hook taken from the kit obeys the rules of hooks like a direct import would.
 */
export type MediaQueryKeys = {
  tab: (repoId: string, tab: MediaTab) => readonly unknown[];
  projects: (repoId: string, tab: MediaTab) => readonly unknown[];
  files: (repoId: string, tab: MediaTab, project: string) => readonly unknown[];
  file: (repoId: string, tab: MediaTab, project: string, path: string) => readonly unknown[];
};

export type MediaKit = {
  MediaLayout: ComponentType<MediaLayoutProps>;
  /** The floating pane toggles a tab draws itself when it passes `floatingToggles` to the layout. */
  MediaPaneToggles: ComponentType<MediaPaneTogglesProps>;
  MediaProjectsAccordion: ComponentType<MediaProjectsAccordionProps>;
  /** The "Open a repo" state a repo-scoped tab shows with no repository selected. */
  NoRepoMediaState: ComponentType<{ tab: MediaTab }>;
  ExportToolbar: ComponentType<ExportToolbarProps>;
  /** The app's collapsible explorer sections (Studio persists which are collapsed). */
  Accordion: ComponentType<MediaAccordionProps>;
  /** The app's tooltip, for a tab's own controls (the strip and the export toolbar use the same one). */
  Tooltip: ComponentType<MediaTooltipProps>;
  /** React Query keys — `tab(...)` prefixes the rest, so invalidating it refreshes the tab. */
  keys: MediaQueryKeys;
  useMediaProjects: (repoId: string | null, tab: MediaTab) => UseQueryResult<MediaProject[]>;
  useMediaFiles: (repoId: string | null, tab: MediaTab, project: string | null) => UseQueryResult<MediaFileEntry[]>;
  useMediaFileText: (
    repoId: string | null,
    tab: MediaTab,
    project: string | null,
    path: string | null,
  ) => UseQueryResult<string>;
  useMediaMutations: (repoId: string | null, tab: MediaTab) => MediaMutations;
  useMediaExport: () => MediaExporter;
  /** Whether ffmpeg is installed (the export and transcode controls need it). */
  useFfmpegStatus: () => UseQueryResult<FfmpegStatus>;
  revealMedia: (repoId: string, tab: MediaTab, project: string, path?: string) => void;
  /** Reopens a collapsed side pane and focuses into it (Images' "+" tile). A hook returning the opener. */
  useOpenMediaPane: () => (tab: MediaTab, pane: MediaPane, options?: { focus?: boolean }) => void;
  /** The pending "show this" request addressed to `media` in `repoId`, else null. */
  useMediaOpenFor: (media: MediaOpenKind, repoId: string | null) => MediaOpenRequest | null;
  /** Drops the pending request once a tab has acted on it. */
  clearMediaOpenRequest: () => void;
  /** The repository media is scoped to (Studio: the selected repo; Creator: its own media root). */
  useMediaRepoId: () => string | null;
  /** Settings ▸ Media's export folder, the save dialogs' starting directory. */
  useMediaExportDir: () => string | null;
};

const MediaKitContext = createContext<MediaKit | null>(null);

export function MediaKitProvider({ kit, children }: { kit: MediaKit; children: ReactNode }) {
  return <MediaKitContext.Provider value={kit}>{children}</MediaKitContext.Provider>;
}

/** The installed kit. Throws outside a media shell — a tab rendered alone would have no store to read. */
export function useMediaKit(): MediaKit {
  const kit = useContext(MediaKitContext);
  if (!kit) throw new Error('A media tab must be rendered inside a media shell (<MediaKitProvider>)');
  return kit;
}
