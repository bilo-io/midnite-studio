import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode, type RefObject } from 'react';

import type { GraphSelection } from '@midnite/studio-frame';
import type {
  AgentDefinition,
  CompanionMicMode,
  CompanionProfile,
  CompanionSttEngine,
  CompanionVoiceSelection,
  PageWindowRole,
  ResourceRef,
  ResourceRelatedKind,
  CommandId,
  CompanionAccess,
  SettingsPageId,
  SttProviderId,
  ViewId,
  VoiceConversationTrigger,
  WebAppId,
} from '@midnite/studio-shared';

import type { LevelBars } from './audio/waveform';
import type { ResourceSource } from './reveal/resolve';
import type { RevealerTable } from './reveal/types';

/**
 * The companion's host port (Phase 123 Theme F) — everything the companion needs from the app that
 * composes it, one typed member per cross-feature reach.
 *
 * The companion moved out of `packages/app` whole (voice, digest, ask, the zen stage, the reveal
 * engine), and with it every import it had into the app's stores, components and sibling features.
 * A feature never imports another feature or the app, so each reach became a member here:
 *
 * - **`ui`** — Studio's `useUiStore` (the persisted preferences and navigation the companion reads
 *   and writes), typed by {@link CompanionUiState}, the slice it actually touches.
 * - **Studio views** — `revealers` (one per resource kind: commit, PR, chat, session, board…) and
 *   `sources` (the lists the resolver asks), plus the live follow-up reads. Each lives with the
 *   feature whose store it reads (`packages/app/src/compose/companion/`), so the companion holds a
 *   table, not eleven imports.
 * - **Navigation reaches** — the pop-out game, the embedded browser, the file editor's unsaved
 *   guard, the issue modal, the terminal (`startAgent`, the session store) and the lock-screen
 *   widgets the zen stage draws.
 * - **Chrome** — the AI composer, thread frame and the small kit pieces Studio draws.
 *
 * Studio's adapter (`packages/app/src/compose/companion-host.tsx`) fills everything. A thinner app
 * uses {@link defaultCompanionHost}: every reveal answers "unavailable", no source lists anything,
 * the terminal is empty, and the preferences live in a local store.
 *
 * Read lazily — {@link getCompanionHost} is called when a function runs, never at module load, so
 * importing the feature (as the app's `ai-thread` does) installs nothing and needs no provider.
 */

/** A zustand-shaped store handle: a hook with `getState` / `setState` / `subscribe` on it. */
export type CompanionStore<S> = {
  <T>(selector: (state: S) => T): T;
  getState(): S;
  getInitialState(): S;
  setState(partial: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
};

/** The slice of the app's UI store the companion reads and writes. */
export type CompanionUiState = {
  activeView: ViewId;
  settingsPage: SettingsPageId;
  selectedRepoId: string | null;
  graphSelection: GraphSelection;
  quickAccessOpen: boolean;
  browserOpen: boolean;
  /** Which pages are popped out into their own window. */
  detachedPages: readonly PageWindowRole[];
  detachedWebApps: readonly WebAppId[];
  terminalDetached: boolean;
  reposDetached: boolean;
  fabDetached: boolean;
  companionDetached: boolean;
  browserDetached: boolean;
  screensaverLocked: boolean;
  primaryAgent: string;
  primaryModelByAgent: Record<string, string | null>;
  agentSkills: Record<string, string>;
  projectBoardByRepo: Record<string, string>;
  /** The forge accounts the thread's user avatar reads, and which is active. */
  forgeAccounts: ReadonlyArray<{ id: string; login?: string; displayName?: string; avatarUrl?: string }>;
  forgeActiveAccountId: string | null;

  companionEnabled: boolean;
  companionPanelOpen: boolean;
  companionHandsFree: boolean;
  companionSpeakAloud: boolean;
  companionVolume: number;
  companionMicMode: CompanionMicMode;
  companionSttEngine: CompanionSttEngine;
  companionSttProvider: SttProviderId | null;
  companionMusicOffer: boolean;
  companionNames: string[];
  companionHonorifics: string[];
  companionPersonality: string;
  companionAboutUser: string;
  companionVoices: CompanionVoiceSelection;
  companionProfiles: CompanionProfile[];
  companionActiveProfile: string | null;
  voiceConversation: boolean;
  voiceConversationTrigger: VoiceConversationTrigger;

  setActiveView: (view: ViewId) => void;
  setSettingsPage: (page: SettingsPageId) => void;
  selectRepo: (repoId: string | null) => void;
  setQuickAccessOpen: (open: boolean) => void;
  setBrowserOpen: (open: boolean) => void;
  setReposOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  setCompanionPanelOpen: (open: boolean) => void;
  toggleCompanionPanel: () => void;
  setPrimaryAgentAndModel: (agentId: string, modelId?: string | null) => void;
  setProjectBoard: (repoId: string, projectId: string) => void;
};

/** The slice of the terminal store the companion's hand-off reads. */
export type CompanionTerminalState = {
  sessions: ReadonlyArray<{ id: string; agentId?: string | null; surface?: string }>;
  /** Session id → pty id. */
  ptyIds: Record<string, string | undefined>;
  /** Session id → the agent id running live in it. */
  liveAgentId: Record<string, string | undefined>;
  activity: Record<string, 'thinking' | 'waiting' | 'idle' | undefined>;
  exitCodes: Record<string, number | undefined>;
};

export type CompanionStartAgentInput = {
  repoId: string;
  cwd: string;
  title: string;
  prompt?: string;
  agentId: string;
  command: string;
  autoSend?: boolean;
};

export type CompanionSkillHandoffOptions = {
  skillId: string;
  repoId?: string;
  cwd?: string;
  body?: string;
  autoSend: boolean;
};

export type CompanionSkillHandoffContext = {
  skills: Record<string, string | undefined>;
  primaryAgentId: string;
  agents: readonly AgentDefinition[];
};

export type CompanionToastRequest = {
  message: string;
  danger?: boolean;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
};

/** The mic handle the app's composer draws (`useComposerMic`'s result). */
export type CompanionComposerMic = {
  available: boolean;
  reason: string;
  held: boolean;
  pressStart: () => void;
  conversation?: boolean;
  listening?: boolean;
  armed?: boolean;
  toggleConversation?: () => void;
  toggleListening?: () => void;
  autoSendSeq?: number;
  dictationSeq?: number;
};

export type CompanionAiComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  dimmed?: boolean;
  mic?: CompanionComposerMic;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  above?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  sendTooltip?: string;
  testIdPrefix?: string;
  className?: string;
};

export type CompanionDismissableOptions = {
  open: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  trigger?: RefObject<HTMLElement | null>;
  escape?: boolean;
  tab?: 'none' | 'close' | string;
  onDismiss: () => void;
};

export type CompanionTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

export type CompanionUserAvatarProps = {
  login?: string | undefined;
  name: string;
  src?: string | null | undefined;
  size?: number;
  withTooltip?: boolean;
};

/** What the zen stage draws from the lock screen (the screensaver feature's widgets and live counts). */
export type CompanionScreensaverKit = {
  SysmonWidget: ComponentType;
  FintechWidget: ComponentType;
  /** The four pill counts the zen stage shows. */
  usePillCounts: () => Record<CompanionPillKey, number>;
  applyPillDestination: (
    key: CompanionPillKey,
    actions: {
      setActiveView: (view: ViewId) => void;
      setReposOpen: (open: boolean) => void;
      setTerminalOpen: (open: boolean) => void;
    },
  ) => void;
};

export type CompanionPillKey = 'repos' | 'agents' | 'myPrs' | 'teamPrs';

/** The live selection reads a follow-up ("this chat", "its PR") resolves against. */
export type CompanionFollowUpReads = {
  selection: () => ResourceRef | null;
  siblings: (ref: ResourceRef) => Promise<readonly ResourceRef[] | null>;
  related: (from: ResourceRef, to: ResourceRelatedKind) => Promise<ResourceRef | null>;
};

export type CompanionHost = {
  ui: CompanionStore<CompanionUiState>;

  // --- Studio views the companion reveals and resolves ---------------------------------------
  /** One revealer per resource kind; a kind the app lacks answers "unavailable". */
  revealers: Partial<RevealerTable>;
  /** The lists the resolver asks ("the PR about caching"). */
  sources: readonly ResourceSource[];
  followUp: CompanionFollowUpReads;

  /** The app's own vocabulary: what each view and settings page is called, and which commands the companion may run. */
  catalog: {
    viewLabels: Readonly<Record<ViewId, string>>;
    viewKeywords: Readonly<Record<ViewId, string>>;
    settingsPages: ReadonlyArray<{ id: SettingsPageId; label: string; group: string }>;
    commandAccess: Readonly<Record<CommandId, CompanionAccess>>;
  };

  // --- navigation reaches --------------------------------------------------------------------
  /** Whether the pop-out game window is open. */
  gamePopped: () => boolean;
  /** Open a URL in the embedded browser's own tab. */
  openBrowserUrl: (url: string) => void;
  /** The file editor holds a pending navigation behind an unsaved-changes prompt. */
  hasUnsavedFileNav: () => boolean;
  openIssue: (target: { repoId: string; number: number }) => void;
  /** The human name each pop-out page wears. */
  pageRoleTitle: Readonly<Record<PageWindowRole, string>>;
  /** How many menus or dialogs are open right now. */
  overlayDepth: () => number;
  showToast: (request: CompanionToastRequest) => string | null;
  dismissToast: (id: string) => void;
  /** The agent CLIs' install probe (`useAgentProbeStore.getState().status`). */
  agentProbeStatus: () => Array<{ id: string; installed: boolean; resolvedPath: string | null; version?: string | null | undefined }>;

  terminal: {
    store: CompanionStore<CompanionTerminalState>;
    startAgent: (input: CompanionStartAgentInput) => { id: string } | null;
    skillHandoff: (options: CompanionSkillHandoffOptions, context: CompanionSkillHandoffContext) => { id: string } | null;
  };
  screensaver: CompanionScreensaverKit;

  // --- chrome --------------------------------------------------------------------------------
  components: {
    AiComposer: ComponentType<CompanionAiComposerProps>;
    LevelMeterBars: ComponentType<{ bars: LevelBars; label: string; testId: string }>;
    AiThreadFrame: ComponentType<{ loading: boolean; className?: string; testId?: string; children: ReactNode }>;
    ThinkingIndicator: ComponentType<{ className?: string }>;
    Tooltip: ComponentType<CompanionTooltipProps>;
    UserAvatar: ComponentType<CompanionUserAvatarProps>;
    ExternalLink: ComponentType<{ href?: string | undefined; children?: ReactNode; className?: string }>;
    /** Hosts the confirm / prompt dialogs for a panel rendered outside the app's own tree. */
    DialogHost: ComponentType<{ children: ReactNode }>;
  };
  hooks: {
    useComposerMic: (options?: { onTranscript?: (text: string) => void; onInterrupt?: () => void }) => CompanionComposerMic;
    useDismissable: (options: CompanionDismissableOptions) => unknown;
  };
};

let installed: CompanionHost | null = null;

/** Install the host (idempotent; the provider calls it, and so can a test or a non-React boot). */
export function installCompanionHost(host: CompanionHost): void {
  if (installed === host) return;
  installed = host;
  for (const listener of installListeners) listener(host);
}

const installListeners = new Set<(host: CompanionHost) => void>();

/**
 * Run `listener` against the host now (if one is installed) and again whenever a different one is
 * installed. For module-level wiring that must follow the host's stores — a module cannot subscribe at
 * import time, because the host is installed by whoever composes the companion, after imports resolve.
 */
export function onCompanionHostInstalled(listener: (host: CompanionHost) => void): void {
  installListeners.add(listener);
  if (installed) listener(installed);
}

/** The installed host, or null before one is. For module-level wiring that may run first. */
export function tryGetCompanionHost(): CompanionHost | null {
  return installed;
}

/** The installed host. Throws a pointed error when nothing composed the companion yet. */
export function getCompanionHost(): CompanionHost {
  if (!installed) {
    throw new Error('The companion has no host: mount <CompanionHostProvider> or call installCompanionHost() first.');
  }
  return installed;
}

/** Test seam. */
export function resetCompanionHostForTests(): void {
  installed = null;
}

const CompanionHostContext = createContext<CompanionHost | null>(null);

/** Installs the host for the module-level readers and provides it to components. */
export function CompanionHostProvider({ host, children }: { host: CompanionHost; children: ReactNode }) {
  installCompanionHost(host);
  return <CompanionHostContext.Provider value={host}>{children}</CompanionHostContext.Provider>;
}

export function useCompanionHost(): CompanionHost {
  return useContext(CompanionHostContext) ?? getCompanionHost();
}
