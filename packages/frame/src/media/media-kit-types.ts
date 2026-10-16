import type {
  GitOpResult,
  MediaExportFormat,
  MediaExportOptions,
  MediaExportProgressEvent,
  MediaExportSource,
  MediaKind,
  MediaTab,
} from '@midnite/studio-shared';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MouseEvent, ReactNode } from 'react';

/*
  The prop and result shapes of the media kit (`media-kit.tsx`) — Phase 113
  Theme Q. media-core's components and hooks are type-checked against these
  (`mediaKit satisfies MediaKit`), so a tab feature and the shell cannot drift.
*/

/** A Media side pane: the explorer on the left, the detail (composer) on the right. */
export type MediaPane = 'explorer' | 'detail';

/** What a projects explorer has selected: a project, and a file in it (or none). */
export type MediaSelection = { project: string; path: string | null };

export type MediaLayoutProps = {
  tab: MediaTab;
  toolbar?: ReactNode;
  explorer: ReactNode;
  content: ReactNode;
  /** Omit for a two-pane tab; the right divider then disappears too. */
  detail?: ReactNode;
  /** Accessible names for the two dividers. */
  explorerLabel?: string;
  detailLabel?: string;
  /** Noun for the floating toggle buttons: "Show explorer" / "Hide composer". */
  explorerName?: string;
  detailName?: string;
  /** Models draws the toggles itself, inside its canvas, below its own editor toolbar. */
  floatingToggles?: boolean;
};

export type MediaProjectsAccordionProps = {
  repoId: string;
  tab: MediaTab;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection) => void;
  fileFilter?: (path: string) => boolean;
  /** What a row shows instead of its path (Terrain: the folder's name, not `<folder>/terrain.json`). */
  fileLabel?: (path: string) => string;
  /** A right-click on a file row. */
  onFileContextMenu?: (event: MouseEvent, project: string, path: string) => void;
  /** A tab whose projects are a fixed set (Sprites: five groups), always listed and never created or deleted. */
  fixedProjects?: ReadonlyArray<{ name: string; title: string }>;
};

export type ExportToolbarProps = {
  formats: readonly MediaExportFormat[];
  hasSelection: boolean;
  onExport: (format: MediaExportFormat) => void;
  busy?: boolean;
};

/** One collapsible section of an explorer accordion; collapse state is the app's to persist. */
export type MediaAccordionSection = {
  id: string;
  title: string;
  count?: number;
  icon?: ReactNode;
  /** Trailing header controls (e.g. a "+" IconButton); outside the toggle button. */
  actions?: ReactNode;
  children: ReactNode;
};

export type MediaAccordionProps = {
  id: string;
  sections: MediaAccordionSection[];
  /** `primary` tints section headings with the active theme's primary colour. */
  tone?: 'primary';
  /** A translucent primary-colour wash behind each header (Media ▸ Models). */
  tinted?: boolean;
};

/** The tabs a one-shot "show this" request can address (Phase 112 Theme E). */
export type MediaOpenKind = Extract<MediaKind, 'doc' | 'image' | 'video' | 'audio' | 'map' | 'game'>;

export type MediaOpenRequest = {
  repoId: string;
  media: MediaOpenKind;
  /** The project (doc/image/audio/map/video), or the game id for `game`. */
  project: string;
  /** A file within the project (a song name for audio, an iteration filename for video). */
  path?: string;
  n: number;
};

/** A media write: answers the bridge's envelope; a failure has already been toasted. */
export type MediaMutation<V> = UseMutationResult<GitOpResult<unknown> | GitOpResult, Error, V>;

/** create / rename / remove projects, and write / rename / remove files, for one tab. */
export type MediaMutations = {
  createProject: MediaMutation<string>;
  renameProject: MediaMutation<{ project: string; to: string }>;
  removeProject: MediaMutation<string>;
  writeFile: MediaMutation<{ project: string; path: string; content: string; encoding?: 'utf8' | 'base64' }>;
  renameFile: MediaMutation<{ project: string; path: string; to: string }>;
  removeFile: MediaMutation<{ project: string; path: string }>;
};

/** One ffmpeg export at a time: the save dialog opens in main, progress streams back. */
export type MediaExporter = {
  start: UseMutationResult<
    GitOpResult<{ dest: string }>,
    Error,
    { source: MediaExportSource; format: MediaExportFormat; options?: MediaExportOptions }
  >;
  progress: MediaExportProgressEvent | null;
  cancel: () => void;
};
