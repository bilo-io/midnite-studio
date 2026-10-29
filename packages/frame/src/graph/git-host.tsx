import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import type {
  AgentDefinition,
  ClosedSession,
  CommitCi,
  DiffLine,
  ForgeRun,
  GraphRow,
  Ref,
  StashEntry,
  StatusResult,
} from '@midnite/studio-shared';

import type { IconComponent } from '../chrome/types';
import type { ActiveAgentWorktreeSession } from './agent-session';
import type { DragPayload } from './graph-dnd';
import type { GitUiState } from './graph-ui-state';
import type { SyncAction } from './ref-sync';

/**
 * The git graph's and the diff's host port (Phase 113 Theme O).
 *
 * The graph and the diff are frame-owned: the views, rows, lanes, filters and their stores live in
 * `packages/frame`, and everything they used to read from Studio's own stores comes through this one
 * port instead. The composing app implements it once and installs it at its root:
 *
 *   <GitHostProvider host={studioGitHost}>...</GitHostProvider>
 *
 * Studio implements it from `ui-store`, its query hooks and its own chrome
 * (`packages/app/src/compose/git-host.tsx`); Midnite Coder from its own small store over a read-only
 * main (`packages/modules/coder/renderer/compose/git-host.tsx`). The required members are what a read-only graph needs;
 * every optional one is something only Studio has today — a write op, an agent, a terminal, the
 * conflict studio — and the graph leaves that control out without it. A member is added only for
 * something the views really read, so the port stays a list, never a service locator.
 */

/** A drag-bounded panel size: where it may be dragged to, and where "reset" puts it. */
export type GitPanelBounds = { min: number; max: number; initial: number };

/** The query keys the graph and diff cache under — the composer's own, so its invalidation still reaches them. */
export type GitQueryKeys = {
  diff: (repoId: string, worktreePath: string | undefined, path: string, staged: boolean, context: number) => readonly unknown[];
  commitDiff: (repoId: string, sha: string, path: string, context: number) => readonly unknown[];
  stashDiff: (repoId: string, selector: string, part: string, path: string, context: number) => readonly unknown[];
  commitStats: (repoId: string, shas: readonly string[]) => readonly unknown[];
  forgeCommitRuns: (repoId: string, shas: readonly string[]) => readonly unknown[];
};

/** What a query hook answers — the slice of react-query's result the views read. */
export type GitQuery<T> = { data: T | undefined };

/** The props of the composer's tooltip (Studio's `Tooltip`): the trigger is cloned, not wrapped. */
export type GitTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

/** One row of a {@link GitMultiSelectProps} menu. */
export type GitMultiSelectOption = { value: string; label: string; keywords?: string; icon?: ReactNode; meta?: ReactNode };

/** The search-and-check dropdown the branch and author filters wear (Studio's `MultiSelectMenu`). */
export type GitMultiSelectProps = {
  options: readonly GitMultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  label: string;
  summarise: (count: number) => string;
};

/** The composer's avatar for a git identity (Studio's `UserAvatar`). */
export type GitUserAvatarProps = {
  login?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
  withTooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'right';
  detail?: ReactNode;
};

/** Where a dismissable surface sits in the composer's Escape order (Studio's `useDismiss`). */
export type GitDismissOptions = {
  layer?: 'tooltip' | 'toast' | 'inline' | 'menu' | 'popover' | 'dialog';
  blocking?: boolean;
  occludes?: boolean;
};

/** The staggered entrance the graph's rows play on a reveal (Studio's `useCascadeReveal`). */
export type GitCascadeReveal = { active: boolean; styleFor: (index: number) => CSSProperties };

/** One token of a syntax-highlighted diff line. */
export type HighlightToken = { text: string; color: string | null };

/** A pointer position — where a context or drop menu opens. */
export type GitPoint = { clientX: number; clientY: number };

/**
 * What the graph can DO, beyond reading — every one a git write, so every one is the composer's:
 * Studio's are `features/graph/use-graph-actions.ts`, through the write queue and behind the
 * blast-radius confirm and the force-push gate. Absent, the graph is read-only: no context menus,
 * no drag-to-merge, no double-click checkout and no sync buttons on a badge.
 */
export type GitGraphActions = {
  openCommitMenu: (point: GitPoint, row: GraphRow, currentBranch: string | null) => void;
  openRefMenu: (point: GitPoint, ref: Ref, currentBranch: string | null) => void;
  openDropMenu: (point: GitPoint, source: DragPayload, target: Ref, currentBranch: string | null) => void;
  /** Double-click on a badge. Reports its own failure through the `onError` the hook was given. */
  checkout: (refName: string) => void;
  syncFor: (ref: Ref, currentBranch: string | null) => SyncAction[];
  runSync: (ref: Ref, action: SyncAction) => void;
  syncing: Record<string, SyncAction['kind']>;
};

/** The panels and chrome only the composer can draw — each optional unless the graph cannot do without it. */
export type GitHostComponents = {
  Tooltip: ComponentType<GitTooltipProps>;
  MultiSelectMenu: ComponentType<GitMultiSelectProps>;
  UserAvatar: ComponentType<GitUserAvatarProps>;
  /** A commit's details, expanded inline under its row. */
  CommitPanel: ComponentType<{ repoId: string; sha: string; onClose: () => void; dividerGradient?: { from: string; to: string } }>;
  /** The working copy's list, commit box and diff. Absent, the uncommitted-changes row shows but does not open. */
  WorkingTreePanel?: ComponentType<{ active: boolean; onClose?: () => void; dividerGradient?: { from: string; to: string } }>;
  ConflictBanner?: ComponentType<{ status: StatusResult; onError: (message: string) => void; onOpenConflict: (path: string) => void }>;
  StashInspector?: ComponentType<{ repoId: string; selector: string; onClose: () => void; onError: (message: string) => void }>;
  ConflictStudio?: ComponentType<{ repoId: string; worktreePath?: string; path: string; onClose: () => void; onError: (message: string) => void }>;
  CiRunModal?: ComponentType<{ repoId: string; sha: string; subject: string | null; ci: CommitCi; onClose: () => void }>;
  /** The live agent's avatar on a ref badge. */
  RefAgentAvatar?: ComponentType<{ session?: ActiveAgentWorktreeSession['session']; chat?: ActiveAgentWorktreeSession['chat']; agentId: string | undefined }>;
};

export type GitHost = GitHostComponents & {
  // --- state -------------------------------------------------------------------------------------
  /** A selector hook over the composer's UI store. Studio passes `useUiStore` itself. */
  useUi: <T>(selector: (state: GitUiState) => T) => T;
  /** The same store as a plain read, for handlers that act at click time. */
  getUi: () => GitUiState;
  /** Whether the graph is the view on screen (false for a kept-alive copy behind another view). A hook. */
  useGraphVisible: () => boolean;
  panelBounds: { detailWidth: GitPanelBounds; graphInlineHeight: GitPanelBounds };

  // --- data ----------------------------------------------------------------------------------------
  queryKeys: GitQueryKeys;
  /** The checkout every status read targets. A hook. */
  useActiveWorktree: () => { repoId: string | null; worktreePath?: string };
  useStatus: () => GitQuery<StatusResult>;
  useRefs: (repoId: string | null) => GitQuery<Ref[]>;
  /** Absent: no stash rows. */
  useStashes?: (repoId: string | null) => GitQuery<StashEntry[]>;
  /** Point the user at the full stash list (Studio: the sidebar's Stashes section). */
  revealStashes?: (repoId: string) => void;

  // --- chrome --------------------------------------------------------------------------------------
  useDismiss: (active: boolean, onDismiss: () => void, options?: GitDismissOptions) => void;
  /** Hide anything native painted under an open overlay (Studio's embedded browser). */
  useOccluder?: (active?: boolean) => void;
  useCascadeReveal: (options: { revealKey: string | number; steps?: number; stepMs?: number }) => GitCascadeReveal;
  useRevealCount: (visible: boolean) => number;
  /** The mark for an agent on a commit's provenance. */
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
  /** One diff line's syntax tokens, or null while unknown. Absent: diffs render as plain text. */
  useLineHighlight?: (path: string, line: DiffLine | null, dark: boolean) => HighlightToken[] | null;
  /** CI glyphs — the forge's own status mark. Absent: the CI column stays empty. */
  ci?: { runLabel: (run: ForgeRun) => string; RunGlyph: ComponentType<{ run: ForgeRun }> };

  // --- Studio-only behaviour ------------------------------------------------------------------------
  /** The graph's write actions, built per render like any hook. Absent: the graph is read-only. */
  useActions?: (onError: (message: string) => void, refs: readonly Ref[]) => GitGraphActions;
  /** The agent roster, for commit provenance. Absent: every commit reads as a person's. */
  useAgents?: () => readonly AgentDefinition[];
  useSessionHistory?: () => GitQuery<ClosedSession[]>;
  /** Live agent sessions by worktree path, for the badge glow and avatar. */
  useAgentWorktreeSessions?: () => ReadonlyMap<string, ActiveAgentWorktreeSession>;
  /** A hidden graph's row count, so a keep-alive cache can drop a huge one early. */
  onHiddenRowCount?: (rowCount: number) => void;
};

/** The host with every optional hook defaulted, so a view calls each one unconditionally. */
export type ResolvedGitHost = GitHost &
  Required<
    Pick<GitHost, 'useStashes' | 'useOccluder' | 'useAgents' | 'useSessionHistory' | 'useAgentWorktreeSessions' | 'useLineHighlight'>
  > & {
    actionsEnabled: boolean;
    useActions: NonNullable<GitHost['useActions']>;
  };

const NO_ACTIONS: GitGraphActions = {
  openCommitMenu: () => undefined,
  openRefMenu: () => undefined,
  openDropMenu: () => undefined,
  checkout: () => undefined,
  syncFor: () => [],
  runSync: () => undefined,
  syncing: {},
};
const EMPTY_QUERY: GitQuery<never[]> = { data: [] };
const NO_AGENTS: readonly AgentDefinition[] = [];
const NO_SESSIONS: ReadonlyMap<string, ActiveAgentWorktreeSession> = new Map();

export function resolveGitHost(host: GitHost): ResolvedGitHost {
  return {
    ...host,
    useStashes: host.useStashes ?? (() => EMPTY_QUERY),
    useOccluder: host.useOccluder ?? (() => undefined),
    useAgents: host.useAgents ?? (() => NO_AGENTS),
    useSessionHistory: host.useSessionHistory ?? (() => EMPTY_QUERY),
    useAgentWorktreeSessions: host.useAgentWorktreeSessions ?? (() => NO_SESSIONS),
    useLineHighlight: host.useLineHighlight ?? (() => null),
    actionsEnabled: host.useActions !== undefined,
    useActions: host.useActions ?? (() => NO_ACTIONS),
  };
}

const GitHostContext = createContext<ResolvedGitHost | null>(null);

export function GitHostProvider({ host, children }: { host: GitHost; children: ReactNode }) {
  const resolved = useMemo(() => resolveGitHost(host), [host]);
  return <GitHostContext.Provider value={resolved}>{children}</GitHostContext.Provider>;
}

/** The installed host. Throws without a provider: a graph or diff outside a composed app is a wiring bug. */
export function useGitHost(): ResolvedGitHost {
  const host = useContext(GitHostContext);
  if (!host) throw new Error('useGitHost must be used inside <GitHostProvider>');
  return host;
}
