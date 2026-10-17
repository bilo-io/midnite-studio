import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext, type ComponentType, type CSSProperties, type ReactNode, type RefObject } from 'react';

import type {
  AgentCommandId,
  AgentRunHandoff,
  AiPlanBlueprint,
  ForgeCapability,
  ForgeIssue,
  ForgeIssueCommentsResult,
  ForgeIssueCreateResult,
  ForgeIssueDetailResult,
  ForgeIssueRef,
  ForgeIssuesResult,
  ForgeKind,
  ForgeLinkKind,
  ForgeLinkWriteResult,
  ForgeProjectCreateResult,
  ForgeProjectField,
  ForgeProjectFieldValue,
  ForgeProjectFieldsResult,
  ForgeProjectItem,
  ForgeProjectReadKind,
  ForgeProjectsResult,
  ForgeProjectWriteResult,
  ForgeSubscriptionKind,
  ForgeWriteResult,
  GitOpResult,
  Remote,
  RepoSkill,
  SessionActivity,
  TerminalSession,
} from '@midnite/studio-shared';
import type { ActivityGlowBadge, ConnectionState, FrameDialogs } from '@midnite/studio-frame';

import type { ProjectViewState } from './state';

/**
 * The Tasks feature's host port (Phase 113 Theme O) — everything the Tasks
 * view reaches beyond the frame and `shared`, supplied by the app that
 * composes it.
 *
 * - **`useUi`/`getUi`** — the slice of the app's ui store Tasks reads and
 *   writes (which board a repo shows, each board's view state, the card skill
 *   memory, the review-actions switch). Studio passes `useUiStore` itself, so
 *   nothing it persists moves; an app without Studio's store passes its own.
 * - **`data`** — the forge's issue and board hooks. They live in the forge
 *   feature; a feature may not import another, so the composer hands them in.
 * - **Chrome** — the avatar, links, modal, menus, toasts and dismiss stack the
 *   views draw with, each declared with only the props this feature passes.
 * - **Optional members** are what only an app with terminals and an agent
 *   roster has: a card's live session, its embedded terminal, Play, the
 *   composer, Auto-mate, drag-to-skill, Plan with AI, the app-wide issue
 *   modal. An app that leaves one out loses that control, never the view —
 *   and nothing is ever started in its place.
 */

export type TasksProjectsMode = 'table' | 'board' | 'graph';

/** The ui-store slice Tasks reads — a structural subset of Studio's `UiState`. */
export type TasksUiState = {
  forgeWritesEnabled: boolean;
  projectBoardByRepo: Record<string, string>;
  setProjectBoard: (repoId: string, projectId: string) => void;
  projectsMode: Record<string, TasksProjectsMode>;
  setProjectsMode: (repoId: string, mode: TasksProjectsMode) => void;
  projectViewByProject: Record<string, ProjectViewState>;
  setProjectView: (projectId: string, patch: Partial<ProjectViewState>) => void;
  blockedByFieldName: string;
  columnSkillByProject: Record<string, Record<string, string>>;
  primaryAgent: string;
  agentSkills: Record<AgentCommandId, string>;
  cardSkillByTask: Record<string, string>;
  setCardSkill: (taskKey: string, skill: string | undefined) => void;
};

/** A board's items, walked to the forge feature's page ceiling (`ForgeProjectItemsPage` there). */
export type TasksProjectItemsPage = {
  cli: ForgeProjectsResult['cli'];
  items: ForgeProjectItem[];
  truncated: boolean;
  error: string | null;
  kind: ForgeProjectReadKind;
};

type Mutation<TResult, TInput> = UseMutationResult<TResult, Error, TInput, unknown>;

/** The forge reads and writes Tasks makes — the forge feature's hooks, handed in by the composer. */
export type TasksData = {
  useRemotes: (repoId: string | null) => UseQueryResult<Remote[]>;
  /** The open repo's forge kind and what that forge can do. */
  useForgeCapability: (repoId: string | null) => { kind: ForgeKind | null; capability: ForgeCapability | undefined };
  /** Main's forge poller, invalidating the matching reads. */
  useForgeSubscription: (repoId: string | null, kind: ForgeSubscriptionKind, enabled?: boolean) => void;
  useForgeIssues: (
    repoId: string | null,
    enabled: boolean,
    limit?: number,
    state?: 'open' | 'closed' | 'all',
  ) => UseQueryResult<ForgeIssuesResult>;
  useForgeIssueDetail: (repoId: string | null, number: number | null, enabled?: boolean) => UseQueryResult<ForgeIssueDetailResult>;
  useForgeIssueComments: (repoId: string | null, number: number | null, enabled: boolean) => UseQueryResult<ForgeIssueCommentsResult>;
  useForgeProjects: (repoId: string | null, enabled: boolean) => UseQueryResult<ForgeProjectsResult>;
  useForgeProjectFields: (projectId: string | null, enabled: boolean) => UseQueryResult<ForgeProjectFieldsResult>;
  useForgeProjectItems: (projectId: string | null, enabled: boolean) => UseQueryResult<TasksProjectItemsPage>;
  useSetProjectItemField: (
    projectId: string | null,
  ) => Mutation<ForgeProjectWriteResult, { itemId: string; fieldId: string; value: ForgeProjectFieldValue }>;
  useClearProjectItemField: (projectId: string | null) => Mutation<ForgeProjectWriteResult, { itemId: string; fieldId: string }>;
  useAddProjectItem: () => Mutation<ForgeProjectWriteResult, { projectId: string; contentId: string }>;
  useCommentIssue: (repoId: string | null, number: number | null) => Mutation<ForgeWriteResult, { body: string }>;
  useSetIssueState: (repoId: string | null, number: number | null) => Mutation<ForgeWriteResult, { state: 'open' | 'closed' }>;
  useCreateIssue: (
    repoId: string | null,
  ) => Mutation<ForgeIssueCreateResult, { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string }>;
  useEditIssue: (
    repoId: string | null,
    number: number | null,
  ) => Mutation<ForgeWriteResult, { title?: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string | null }>;
  useDeleteIssue: (repoId: string | null) => Mutation<ForgeWriteResult, { number: number }>;
  useCreateProject: (repoId: string | null) => Mutation<ForgeProjectCreateResult, { title: string }>;
  useEditProject: (repoId: string | null) => Mutation<ForgeProjectWriteResult, { projectId: string; title?: string; closed?: boolean }>;
  useDeleteProject: (repoId: string | null) => Mutation<ForgeProjectWriteResult, { projectId: string }>;
  useLinkIssues: () => Mutation<
    ForgeLinkWriteResult,
    { repoId: string; kind: ForgeLinkKind; number: number; targetNumber: number; targetRepo?: string }
  >;
  /** The open repo's own agent skills, for the card skill picker's suggestions. Absent: the built-in catalogue only. */
  useRepoSkills?: (repoId: string | null, agentId: string) => UseQueryResult<readonly RepoSkill[]>;
};

export type TasksUserAvatarProps = {
  login?: string | null | undefined;
  size?: number;
  /** A second tooltip line ("Assignee", "Author"). */
  detail?: string;
  className?: string;
};

export type TasksExternalLinkProps = { href?: string | undefined; children?: ReactNode; className?: string };

export type TasksForgeRefLinkProps = { url: string; number: number; repoId?: string };

export type TasksMultiSelectOption = { value: string; label: string; keywords?: string; icon?: ReactNode; meta?: ReactNode };

export type TasksMultiSelectMenuProps = {
  options: readonly TasksMultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  label: string;
  summarise: (count: number) => string;
};

export type TasksModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
  children: ReactNode;
};

/** A text field with the app's AI "improve" wand; absent, a plain field stands in. */
export type TasksWandFieldProps = {
  fieldName: string;
  value: string;
  onChange: (value: string) => void;
  repoName: string;
  repoPath?: string | null;
  otherFields?: Record<string, string>;
  agentId?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  inputProps?: { 'aria-label'?: string; id?: string };
};

export type TasksDismissableOptions = {
  open: boolean;
  onDismiss: () => boolean | void;
  surfaceRef: RefObject<HTMLElement | null>;
  trigger?: RefObject<Element | null>;
  layer?: 'menu';
  occludes?: boolean;
};

export type TasksToastRequest = {
  message: string;
  danger?: boolean;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
};

export type TasksToastApi = { show: (request: TasksToastRequest) => string; dismiss: (id: string) => void };

export type TasksCascadeReveal = { active: boolean; styleFor: (index: number) => CSSProperties };

/** A forge issue's state, drawn the way the forge feature draws it everywhere else. */
export type TasksIssueStatusPillProps = { issue: ForgeIssue };

/** What Tasks reads off the app's terminal store — a structural subset of Studio's. */
export type TasksTerminalState = {
  sessions: TerminalSession[];
  states: Record<string, ConnectionState>;
  activity: Record<string, SessionActivity>;
  liveAgentId: Record<string, string | null>;
  /** Learn about restored and re-attached sessions; resolves at once the second time. */
  hydrate: () => Promise<void>;
  /** A card's session whose card left the board goes back to the main surface. */
  rehomeSession: (id: string) => void;
};

export type TasksCardPlayInput = {
  item: ForgeProjectItem | undefined;
  repoId: string | null | undefined;
  worktreePath: string | null | undefined;
  taskRef: { projectId: string; itemId: string };
  /** The live session already bound to this card, if any. */
  sessionId: string | undefined;
};

export type TasksCardPlay = {
  onPlay: (event: { clientX: number; clientY: number; stopPropagation: () => void }) => void;
};

export type TasksCardComposerProps = {
  projectId: string;
  repoId: string;
  worktreePath: string;
  item: ForgeProjectItem;
  blockers?: readonly ForgeIssueRef[];
  taskContent?: ReactNode;
};

export type TasksAutomateInput = {
  projectId: string;
  repoId: string | null;
  worktreePath: string | undefined;
  allItems: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  groupField: ForgeProjectField | null;
  blockedByFieldName: string;
  columnSkillOverrides: Readonly<Record<string, string>> | undefined;
};

/**
 * The app's terminals and agent launch — Studio's alone. Absent, a card shows
 * no live session, no Play, no Stop, no composer and no Auto-mate, and a drop
 * into a column with a mapped skill only moves the card.
 */
export type TasksTerminalPort = {
  /** A hook over the app's terminal store. */
  useTerminal: <T>(selector: (state: TasksTerminalState) => T) => T;
  getTerminal: () => TasksTerminalState;
  /** Show a session in the app's terminal panel; false when it cannot be shown. */
  revealSession: (sessionId: string) => boolean;
  /** Close a session, confirming first when it is still doing something. */
  closeSessionWithConfirm: (dialogs: FrameDialogs, session: TerminalSession) => void;
  /** Start an agent on a card's own terminal session — drag-to-skill's launch. Returns the session id. */
  startCardAgent: (input: {
    repoId: string;
    cwd: string;
    title: string;
    prompt: string;
    agentId: string;
    command: string;
    projectId: string;
    itemId: string;
    autoSend: boolean;
  }) => { id: string };
  ActivityIndicator: ComponentType<{ activity: SessionActivity | undefined }>;
  /** A card's embedded xterm. */
  CardTerminal: ComponentType<{ sessionId: string; visible: boolean; activity: SessionActivity | undefined }>;
  /** The card detail's agent composer (Start, Launch and run behind its own confirm). */
  CardComposer: ComponentType<TasksCardComposerProps>;
  /** A card's Play button — Phase 92's skill-per-card launch. A hook. */
  useCardPlay: (input: TasksCardPlayInput) => TasksCardPlay;
  /** Auto-mate's effects for one board. A hook. */
  useAutomate: (input: TasksAutomateInput) => void;
  AutomateToggle: ComponentType<{ projectId: string }>;
};

export type TasksHost = {
  /** A hook over the ui slice. Studio passes `useUiStore`. */
  useUi: <T>(selector: (state: TasksUiState) => T) => T;
  getUi: () => TasksUiState;
  data: TasksData;
  /** The repository (and checkout) the app has selected. A hook. */
  useActiveRepo: () => { repoId: string | null; worktreePath?: string };
  UserAvatar: ComponentType<TasksUserAvatarProps>;
  ExternalLink: ComponentType<TasksExternalLinkProps>;
  ForgeRefLink: ComponentType<TasksForgeRefLinkProps>;
  MultiSelectMenu: ComponentType<TasksMultiSelectMenuProps>;
  Modal: ComponentType<TasksModalProps>;
  IssueStatusPill: ComponentType<TasksIssueStatusPillProps>;
  ActivityBadgeStack: ComponentType<{ badges: readonly ActivityGlowBadge[]; className?: string }>;
  /** Register a dismissable surface (Escape, outside click). A hook. */
  useDismissable: (options: TasksDismissableOptions) => void;
  /** The list entrance cascade. A hook. */
  useCascadeReveal: (input: { revealKey: string | number }) => TasksCascadeReveal;
  /** Toasts with an inline action (drag-to-skill's Undo). A hook. */
  useToasts: () => TasksToastApi;
  /** Copy text to the clipboard; resolves whether it worked. */
  copyText: (text: string) => Promise<boolean>;
  WandField?: ComponentType<TasksWandFieldProps>;
  /** Present a markdown body as a deck — the slides feature's button. */
  PresentButton?: ComponentType<{ source: { content: string; label: string }; className?: string }>;
  /** Claim (or release, with `null`) the markdown the palette's Present command would show. */
  setActiveMarkdown?: (source: { content: string; label: string } | null) => void;
  /** Open an issue in the app's issue modal. Absent: an issue keeps its plain external link. */
  openIssue?: (target: { repoId: string; number: number; seed?: ForgeIssue }) => void;
  /** The repo id the app has registered for a forge `host/owner/repo`, if any. */
  lookupRepoIdByForge?: (host: string, owner: string, repo: string) => string | null;
  /** Run a command in the app's terminal (Reload's `gh auth refresh`). Absent: Reload only refetches. */
  runCommand?: (command: string, title: string) => void;
  /** Plan with AI: a headless agent drafts a board. Absent: the bar is not offered. */
  usePlanBlueprint?: () => Mutation<
    GitOpResult<{ blueprint: AiPlanBlueprint }>,
    {
      agentId?: string;
      repoPath?: string | null;
      repoName: string;
      prompt: string;
      existing?: AiPlanBlueprint;
      originIssue?: { number: number; title: string };
    }
  >;
  terminal?: TasksTerminalPort;
  /**
   * For an app with no terminal (Coder): hand a card's run to an app that can start an agent
   * (Phase 113 Theme O). Ignored when `terminal` is present — that app runs the card itself.
   * Absent: a card offers no Play at all.
   */
  cardHandoff?: TasksCardHandoff;
};

/**
 * The agent-run hand-off, as Tasks sees it. The feature builds the run — `{ issueUrl, skill }`, the
 * card's URL and the skill its picker shows, validated by `agentRunFor` — and the app decides where
 * it goes, how the outcome reads and whether it may be sent at all.
 */
export type TasksCardHandoff = {
  /** Whether a run may be sent now — a hook. `reason` titles the disabled button while it may not. */
  useGate: () => { open: boolean; reason: string };
  /** Send it. Never throws; the app reports the outcome itself. */
  send: (run: AgentRunHandoff) => void;
};

const TasksHostContext = createContext<TasksHost | null>(null);

export function TasksHostProvider({ host, children }: { host: TasksHost; children: ReactNode }) {
  return <TasksHostContext.Provider value={host}>{children}</TasksHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the Tasks view would not render. */
export function useTasksHost(): TasksHost {
  const host = useContext(TasksHostContext);
  if (!host) throw new Error('The tasks feature must be rendered inside <TasksHostProvider>');
  return host;
}

/** The installed host, or null — for the issue pills' link, which renders outside Tasks too. */
export function useOptionalTasksHost(): TasksHost | null {
  return useContext(TasksHostContext);
}
