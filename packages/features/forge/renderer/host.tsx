import {
  createContext,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

import type { FileDiff, ForgeKind, ForgeReviewThread, StatusCode } from '@midnite/studio-shared';

/**
 * The forge feature's host port — what Reviews and Actions need from the app
 * that composes them, beyond the frame (Phase 113 Theme O).
 *
 * Every seam is declared with only the props this feature passes, so the views
 * read as they always did while each implementation is the composing app's:
 *
 * - **Chrome over app state** — tooltips, popovers and menus count occluders
 *   and clamp to the content area; avatars come from the app's avatar cache.
 * - **The diff kit** — a pull request's Files tab draws the app's diff view,
 *   with its threads, image sources and width fallback. Coder installs a plain
 *   one until the graph and its diff move into the frame (Theme O slice 2).
 * - **App state** — the selected repository, persisted pane sizes, the forge
 *   kind of a repository's remote, whether forge writes are on, link routing.
 *
 * The **optional** members are what only Studio has: Present (the slides
 * feature, reached through this port rather than imported), the agent hand-off,
 * preview deployments in the embedded browser, "Fetch to compare" and applying
 * a suggestion to the checkout. An app that leaves one out loses that control,
 * never the view.
 */

export type ForgeTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

export type ForgeUserAvatarProps = {
  login?: string | null | undefined;
  name?: string | null | undefined;
  src?: string | null | undefined;
  size?: number;
  withTooltip?: boolean;
  /** A second tooltip line ("PR author", "Review: approved"). */
  detail?: string;
  className?: string;
};

export type ForgePopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export type ForgeMultiSelectOption = { value: string; label: string; keywords?: string; icon?: ReactNode; meta?: ReactNode };

export type ForgeMultiSelectMenuProps = {
  options: readonly ForgeMultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  label: string;
  summarise: (count: number) => string;
};

export type ForgeTreeSectionProps = {
  title: string;
  count?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  depth?: 0 | 1 | 2 | 3;
  hideWhenEmpty?: boolean;
  children: ReactNode;
};

export type ForgeExternalLinkProps = { href?: string | undefined; children?: ReactNode; className?: string };

export type ForgeRefLinkProps = { url: string; number: number; repoId?: string };

/** Where a thread sits in a diff: line → threads (the frame's `threadsForFile`). */
export type ForgeThreadsByLine = Map<number, ForgeReviewThread[]>;

/** The before/after image sources the diff kit resolves for a binary file — opaque to this feature. */
export type ForgeImageDiffSources = { readonly before: unknown; readonly after: unknown };

export type ForgeDiffViewProps = {
  diff: FileDiff | undefined;
  inline?: boolean;
  tooNarrowForSplit?: boolean;
  threads?: ForgeThreadsByLine;
  leftThreads?: ForgeThreadsByLine;
  images?: ForgeImageDiffSources | null;
  onComment?: (line: number) => void;
  renderThread?: (threads: readonly ForgeReviewThread[], line: number) => ReactNode;
  composer?: { line: number; node: ReactNode } | null;
};

export type ForgeImageTarget = { kind: 'commit'; repoId: string; sha: string; parentSha?: string; worktreePath?: string };

/** A pull request's Files tab: the diff view and the helpers that feed it. */
export type ForgeDiffKit = {
  DiffView: ComponentType<ForgeDiffViewProps>;
  DiffToolbar: ComponentType<{ diff: FileDiff; showStats?: boolean; tooNarrowForSplit?: boolean }>;
  StatusMark: ComponentType<{ code: StatusCode; conflicted: boolean }>;
  ChangeCounts: ComponentType<{ insertions: number; deletions: number }>;
  /** A hook: whether the section is too narrow for the split layout. */
  useTooNarrowForSplit: (ref: RefObject<HTMLElement | null>) => boolean;
  imageDiffSources?: (file: FileDiff, target: ForgeImageTarget) => ForgeImageDiffSources | null;
  /** A hook: whether `rev:path` is in the local object database (undefined while unknown). */
  useBaseBlobExists?: (input: { repoId: string | undefined; worktreePath?: string; rev: string | null; path: string | null }) => boolean | undefined;
  /** A hook: "Fetch to compare" — the checkout's ordinary fetch. */
  useFetchBase?: (target: { repoId: string | null; worktreePath?: string }) => { mutate: () => void; isPending: boolean };
};

/** A persisted pane size: the stored value, how to store one, and its bounds. */
export type ForgePaneSize = { size: number; setSize: (value: number) => void; initial: number; min: number; max: number };

export type ForgeLayoutKey = 'actionsListWidth' | 'reviewsListWidth' | 'actionsJobsHeight';

export type ForgeCascadeReveal = { active: boolean; styleFor: (index: number) => CSSProperties };

/** The modifier keys a link click carries — what decides in-app vs system browser. */
export type ForgeLinkEvent = { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; button: number };

export type ForgeAgentSkill = 'prReview' | 'prAudit' | 'prFeedback';

export type ForgeHost = {
  Tooltip: ComponentType<ForgeTooltipProps>;
  UserAvatar: ComponentType<ForgeUserAvatarProps>;
  Popover: ComponentType<ForgePopoverProps>;
  MultiSelectMenu: ComponentType<ForgeMultiSelectMenuProps>;
  TreeSection: ComponentType<ForgeTreeSectionProps>;
  ExternalLink: ComponentType<ForgeExternalLinkProps>;
  ForgeRefLink: ComponentType<ForgeRefLinkProps>;
  diff: ForgeDiffKit;
  /** The repository (and checkout) the app has selected. A hook. */
  useActiveRepo: () => { repoId: string | null; worktreePath?: string };
  /** The forge kind of a repository's remote, derived from what main reports. A hook. */
  useForgeKind: (repoId: string | null) => ForgeKind | null;
  /** Settings ▸ Reviews' "review actions" switch. A hook. */
  useForgeWritesEnabled: () => boolean;
  /** A persisted pane size. A hook. */
  usePaneSize: (key: ForgeLayoutKey) => ForgePaneSize;
  /** The board a repository last added a pull request to, and how to remember one. A hook. */
  useProjectBoard: () => { boardByRepo: Readonly<Record<string, string>>; setProjectBoard: (repoId: string, boardId: string) => void };
  /** Register a dismissable layer (Escape, outside click) with the app's occluder stack. A hook. */
  useDismiss: (active: boolean, onDismiss: () => void, options?: { layer?: 'dialog' | 'popover' }) => void;
  /** The list entrance cascade (reduced motion turns it off). A hook. */
  useCascadeReveal: (input: { revealKey: string | number }) => ForgeCascadeReveal;
  /** Follow a link the way the app routes links (in-app, embedded browser or system). */
  openLink: (url: string, event: ForgeLinkEvent, options?: { originRepoId?: string }) => void;
  /** Open a URL in the app's own browser. */
  openInApp: (url: string, options?: { originRepoId?: string }) => void;
  /** Show one pull request in the Reviews view (a run's "#123" chip). */
  openReview: (repoId: string, number: number) => void;
  /** Present a markdown body as a deck — the slides feature's button. */
  PresentButton?: ComponentType<{ source: { content: string; label: string }; className?: string }>;
  /** Claim (or release, with `null`) the markdown the palette's Present command would show. */
  setActiveMarkdown?: (source: { content: string; label: string } | null) => void;
  /** Hand a pull request to the configured agent as a typed-not-sent skill command. A hook. */
  useAskAgent?: () => (input: { skillId: ForgeAgentSkill; repoId: string; body: string; title: string }) => void;
  /** Preview deployments in a PR's text, for the embedded browser. */
  previewDeploys?: { useHosts: () => readonly string[]; match: (text: string, hosts: readonly string[]) => string[] };
  /**
   * Applying a review suggestion to the checkout: the query key the app reads
   * the file under, so the read is the one its watcher invalidates.
   */
  suggestions?: { fileKey: (scope: { repoId: string; worktreePath?: string | undefined }, path: string) => readonly unknown[] };
};

const ForgeHostContext = createContext<ForgeHost | null>(null);

export function ForgeHostProvider({ host, children }: { host: ForgeHost; children: ReactNode }) {
  return <ForgeHostContext.Provider value={host}>{children}</ForgeHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, Reviews and Actions would not render. */
export function useForgeHost(): ForgeHost {
  const host = useContext(ForgeHostContext);
  if (!host) throw new Error('The forge feature must be rendered inside <ForgeHostProvider>');
  return host;
}

/**
 * The installed host, or null. Only the status vocabulary reads this: a status
 * pill is drawn by surfaces far from Reviews (the graph's CI column, the status
 * bar, the issue modal) and must render plainly wherever no host is installed.
 */
export function useOptionalForgeHost(): ForgeHost | null {
  return useContext(ForgeHostContext);
}
