import {
  createContext,
  useContext,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';

import type { ConnectionState, IconComponent } from '@midnite/studio-frame';
import type {
  AgentDefinition,
  CompanionState,
  ContributorStat,
  CustomLoop,
  FabTab,
  KnownSkill,
  LoopModel,
  LoopRunOptions,
  LoopSchedule,
  RepoDescriptor,
  SessionActivity,
  SuiteAppId,
  TerminalSession,
} from '@midnite/studio-shared';

/**
 * The loops feature's host port (Phase 123 Theme G) — everything the FAB, the
 * quick-access menu and the Loops panel need from the app that composes them,
 * beyond the frame.
 *
 * The loops package imports neither the terminal feature nor the companion
 * one (a feature may not import a feature). Where a loop reaches them it does
 * so through a slot here: `renderTerminal` draws a session's xterm,
 * `renderCompanionLauncher` the FAB's companion button, `startAgent` spawns
 * the session a Start press runs in, and `useTerminal` is a narrow read of the
 * terminal store (the phase and activity of the session a loop owns).
 *
 * Studio's adapter is `packages/app/src/compose/loops-host.tsx`; any other app
 * takes {@link createDefaultLoopsHost} (`default-host.tsx`).
 *
 * Members named `use…` are hooks — call them at the top of a component.
 */

/** The slice of the app's UI store the loops read and write. Studio's `ui-store` satisfies it as is. */
export type LoopsState = {
  fabPanelOpen: boolean;
  setFabPanelOpen: (open: boolean) => void;
  activeFabTab: FabTab;
  openFabTab: (tab: FabTab) => void;
  /** loop id -> the terminal session it owns. */
  fabSessions: Record<string, string>;
  setFabSession: (tab: FabTab, sessionId: string | undefined) => void;
  /** loop id -> the session it left behind on its last Start (closed by the tab strip). */
  fabPrevSessions: Record<string, string>;
  setFabPrevSession: (tab: FabTab, sessionId: string | undefined) => void;
  selectedRepoId: string | null;
  selectedWorktreePath: string | null;
  /** The midnite-menu registry's prompt templates, by command id. */
  agentSkills: Record<string, string | undefined>;
  loopModifierDefaults: Record<string, Record<string, boolean>>;
  loopModifierChecks: Record<string, Record<string, boolean>>;
  setLoopModifierCheck: (loopId: string, modifierId: string, on: boolean) => void;
  loopChoices: Record<string, Record<string, string>>;
  setLoopChoice: (loopId: string, choiceId: string, optionId: string) => void;
  loopAgents: Record<string, string>;
  setLoopAgent: (loopId: string, agentId: string) => void;
  loopModels: Record<string, LoopModel>;
  setLoopModel: (loopId: string, model: LoopModel) => void;
  loopSchedules: Record<string, LoopSchedule>;
  setLoopSchedule: (loopId: string, schedule: LoopSchedule) => void;
  loopExtras: Record<string, string>;
  setLoopExtras: (loopId: string, text: string) => void;
  loopEnabled: Record<string, boolean>;
  loopModifierSkills: Record<string, Record<string, string>>;
  setLoopModifierSkill: (loopId: string, modifierId: string, skill: string) => void;
  loopRunOptions: Record<string, LoopRunOptions>;
  setLoopRunOptions: (loopId: string, patch: LoopRunOptions) => void;
  customLoops: CustomLoop[];
  customLoopEditing: string | null;
  setCustomLoopEditing: (loopId: string | null) => void;
  customLoopFresh: string | null;
  startCustomLoopFrom: (loopId: string, sourceLoopId: string | null) => void;
  updateCustomLoop: (loopId: string, edit: (loop: CustomLoop) => CustomLoop) => void;
  deleteCustomLoop: (loopId: string) => void;
  /** Only `loopFormHeight` is the loops'; the rest of the app's layout is its own. */
  layout: { loopFormHeight: number };
  setLayout: (key: 'loopFormHeight', value: number) => void;
};

/** The narrow read of the terminal store a loop needs. Studio's `useTerminalStore` satisfies it as is. */
export type LoopsTerminalState = {
  sessions: readonly TerminalSession[];
  states: Record<string, ConnectionState>;
  activity: Record<string, SessionActivity>;
  ptyIds: Record<string, string>;
  closeSession: (sessionId: string) => unknown;
  sleepSession: (sessionId: string) => unknown;
};

export type LoopsTerminalProps = {
  sessionId: string;
  /** The loop's tab is the visible one — an xterm behind it stays unfitted. */
  active: boolean;
  /** Bumped when the panel's own reveal settles, so the xterm refits once. */
  fitSignal: number;
  layoutClassName?: string;
};

/** What a Start press asks the terminal to run. */
export type StartAgentInput = {
  repoId: string;
  cwd: string;
  title: string;
  prompt: string;
  agentId: string;
  command: string;
  extraArgs?: readonly string[];
  surface: 'fab';
  autoSend?: boolean;
};

export type LoopsSelectOption = {
  id: string;
  label: string;
  display?: string;
  icon?: IconComponent;
  iconColor?: string;
  hint?: string;
  isDisabled?: boolean;
  disabledReason?: string;
};

export type LoopsIconSelectProps = {
  ariaLabel: string;
  options: readonly LoopsSelectOption[];
  value: string;
  onChange: (id: string) => void;
  isSearchable?: boolean;
  isClearable?: boolean;
  isDisabled?: boolean;
  menuInPortal?: boolean;
  placeholder?: string;
};

export type LoopsMultiIconSelectProps = {
  ariaLabel: string;
  options: readonly LoopsSelectOption[];
  values: readonly string[];
  onChange: (ids: string[]) => void;
  isSearchable?: boolean;
  isDisabled?: boolean;
  menuInPortal?: boolean;
  placeholder?: string;
};

export type LoopsTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: React.ReactElement<Record<string, unknown>>;
};

/** The "Extra instructions" box: a textarea with Send and a push-to-talk mic inside it. */
export type LoopsExtrasComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  sendAriaLabel?: string;
  sendTooltip?: string;
  enterToSend?: boolean;
  testIdPrefix?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
};

export type LoopsTriggerSource =
  | RefObject<Element | null>
  | Element
  | null
  | undefined
  | (() => Element | null | undefined);

export type LoopsDismissOptions = {
  open: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  trigger?: LoopsTriggerSource;
  onDismiss: () => void;
};

export type LoopsCompanionLook = { label: string; icon: IconComponent };

/** The companion, as the quick-access menu sees it. Absent from the host: the C and R rows and the strip are hidden. */
export type LoopsCompanionPort = {
  useStatus: () => { enabled: boolean; state: CompanionState; lastText: string | null };
  open: () => void;
  repeat: () => void;
  Glyph: IconComponent;
  look: Record<CompanionState, LoopsCompanionLook>;
};

/** Setup, as the quick-access menu sees it. Absent from the host: the S row is hidden. */
export type SetupPort = {
  useIncomplete: () => boolean;
  resume: () => void;
  open: () => void;
};

export type LoopsHost = {
  appId: SuiteAppId;

  /** The loops' slice of the app's UI store. */
  useLoopsState: <T>(selector: (state: LoopsState) => T) => T;
  loopsState: () => LoopsState;

  /** The narrow terminal-store read. */
  useTerminal: <T>(selector: (state: LoopsTerminalState) => T) => T;
  terminalState: () => LoopsTerminalState;
  /** Resolves with the new session's id. */
  startAgent: (input: StartAgentInput) => Promise<string>;
  renderTerminal: (props: LoopsTerminalProps) => ReactNode;

  renderCompanionLauncher: () => ReactNode;
  companion?: LoopsCompanionPort;
  /** Absent: the N row is hidden. */
  openNotes?: () => void;
  setupStore?: SetupPort;

  /** The roster and the repositories. */
  useAgents: () => { agents: readonly AgentDefinition[] };
  useRepos: () => { data: readonly RepoDescriptor[] | undefined };
  useKnownSkills: (repoId: string | null, enabled: boolean) => { data: readonly KnownSkill[] | undefined };
  useContributors: (repoId: string | null, enabled: boolean) => { data: readonly ContributorStat[] | undefined };

  /** Chrome the app owns. */
  Tooltip: ComponentType<LoopsTooltipProps>;
  IconSelect: ComponentType<LoopsIconSelectProps>;
  MultiIconSelect: ComponentType<LoopsMultiIconSelectProps>;
  ExtrasComposer: ComponentType<LoopsExtrasComposerProps>;
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
  /** Escape, an outside press, focus leaving, Tab and window blur — the app's one dismissal rule set. */
  useDismissable: (options: LoopsDismissOptions) => void;
};

const LoopsHostContext = createContext<LoopsHost | null>(null);

let activeHost: LoopsHost | null = null;

/**
 * Installs the host every component without a provider above it falls back to.
 *
 * Several loops hooks run outside any tree the app could wrap in a provider —
 * the app root's attention hook, the lock screen's "a loop is running" check,
 * Settings' loop rows — so the app installs its host once, at module load,
 * and those read it from here. A {@link LoopsHostProvider} still wins for its
 * subtree, which is how a test swaps one slot.
 */
export function setActiveLoopsHost(host: LoopsHost | null): void {
  activeHost = host;
}

export function LoopsHostProvider({ host, children }: { host: LoopsHost; children: ReactNode }) {
  return <LoopsHostContext.Provider value={host}>{children}</LoopsHostContext.Provider>;
}

/** The host for plain (non-hook) code: the one installed with {@link setActiveLoopsHost}. */
export function getLoopsHost(): LoopsHost {
  if (!activeHost) throw new Error('No LoopsHost installed: call setActiveLoopsHost() or render inside <LoopsHostProvider>.');
  return activeHost;
}

export function useLoopsHost(): LoopsHost {
  const fromContext = useContext(LoopsHostContext);
  if (fromContext) return fromContext;
  return getLoopsHost();
}
