import type { VideoToolchain } from '@midnite/studio-shared';
import {
  createContext,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react';

/**
 * The Video feature's host port (Phase 113 Theme Q) — what Video needs from
 * the app that composes it, beyond the frame and the media kit.
 *
 * Video is the most Studio-entangled tab: it launches commands in the
 * integrated terminal (`npm install`, the ffmpeg install), hosts the engine's
 * studio in the embedded browser, runs editorial skills through the agent
 * roster, renders its brief as markdown with the Files preview, and remembers
 * the last project and panel tab in Studio's `ui-store`. None of that may be
 * imported by a feature, so each is a seam: Studio's adapter is
 * `packages/app/src/compose/media-video-host.tsx`. Everything is optional — an
 * app that leaves a seam out gets the feature's plain version or, where there
 * is nothing sensible to show (an agent), no control at all.
 */

/** Video's right-hand panel: the AI edit thread, the brief and script, and the iteration list. */
export const VIDEO_PANEL_TABS = ['edit', 'brief', 'versions'] as const;
export type VideoPanelTab = (typeof VIDEO_PANEL_TABS)[number];

/** A command a person should watch run, in the app's terminal. */
export type VideoTerminalRequest = {
  title: string;
  command: string;
  /** Where it runs. Absent → the app's default directory, and the command is submitted. */
  cwd?: string;
};

export type VideoStudioViewProps = {
  projectId: string;
  /** The studio's localhost URL, already deep-linked to the selected composition. */
  url: string;
};

export type VideoEditThreadProps = { projectId: string; title: string; cwd: string | null };

export type VideoSkillActionsProps = {
  projectId: string;
  title: string;
  /** The project's directory, or null before the root resolved. */
  cwd: string | null;
  /** The toolchain probe's verdict on the two editorial skills; undefined while it is in flight. */
  skills: VideoToolchain['skills'] | undefined;
};

export type VideoModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
  children: ReactNode;
};

export type VideoTreeSectionProps = {
  title: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  hideWhenEmpty?: boolean;
  /** Nesting level, for indentation. */
  depth?: 0 | 1 | 2 | 3;
  children: ReactNode;
};

/** The small pieces of app chrome Video draws with. Each has a plain default in `chrome.tsx`. */
export type VideoChrome = {
  Modal: ComponentType<VideoModalProps>;
  /** Rendered markdown (the brief, the script, the changelog). */
  MarkdownPreview: ComponentType<{ content: string }>;
  TreeSection: ComponentType<VideoTreeSectionProps>;
  FileIcon: ComponentType<{ name: string }>;
  FolderIcon: ComponentType<{ name: string; open: boolean }>;
  LoadingRegion: ComponentType<{ label: string; className?: string; children: ReactNode }>;
  Skeleton: ComponentType<{ className?: string; style?: CSSProperties }>;
  /** A small busy ring; sized by `className` (`h-4 w-4`). */
  Spinner: ComponentType<{ className?: string }>;
};

export type VideoHost = {
  /** The last project opened in a repository — read once when the tab opens. Callable outside render. */
  getLastProject?: (repoId: string) => string | undefined;
  setLastProject?: (repoId: string, projectId: string) => void;
  /** Which right-panel tab is showing. A hook. Absent → held in memory, opening on Brief. */
  usePanelTab?: () => readonly [VideoPanelTab, (tab: VideoPanelTab) => void];
  /** Runs a command in the app's terminal. Absent → commands are shown to copy instead. */
  runInTerminal?: (request: VideoTerminalRequest) => void;
  /** The running studio, hosted. Absent → an iframe on the studio's URL. */
  StudioView?: ComponentType<VideoStudioViewProps>;
  /** Opens the studio's URL in the app's own browser pane. Absent → no "Open in tab". */
  openStudioInTab?: (url: string) => void;
  /** The "Edit with AI" thread. Absent → the tab is not offered. */
  EditThread?: ComponentType<VideoEditThreadProps>;
  /** The editorial-skill buttons under the brief. Absent → not offered. */
  SkillActions?: ComponentType<VideoSkillActionsProps>;
  chrome?: Partial<VideoChrome>;
};

const VideoHostContext = createContext<VideoHost | null>(null);

export function VideoHostProvider({ host, children }: { host: VideoHost; children: ReactNode }) {
  return <VideoHostContext.Provider value={host}>{children}</VideoHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, Video could not run a command or host a studio. */
export function useVideoHost(): VideoHost {
  const host = useContext(VideoHostContext);
  if (!host) throw new Error('The Video tab must be rendered inside <VideoHostProvider>');
  return host;
}

