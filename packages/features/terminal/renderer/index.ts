/**
 * The terminal feature's renderer half (Phase 123 Theme E): the panel, the
 * session list, every session's xterm and the store behind them, reaching the
 * app that composes it only through {@link TerminalHost} (`host.tsx`).
 *
 * `sideEffects: false` keeps an app that imports only the store from pulling
 * xterm into its entry chunk.
 */
export { terminalManifest, type TerminalManifest } from '../manifest';
export {
  closeSessionWithConfirm,
} from './close-session';
export {
  collapseHome,
} from './collapse-home';
export {
  DEFAULT_TERMINAL_LIST_WIDTH,
  createDefaultTerminalHost,
  type DefaultTerminalHostOptions,
} from './default-host';
export {
  enableUnicode11,
} from './enable-unicode11';
export {
  EndedStrip,
} from './ended-banner';
export {
  createFitCoalescer,
  type FitCoalescer,
} from './fit-coalescer';
export {
  splitHeaderPath,
  type HeaderPathParts,
} from './header-path';
export {
  TerminalHostProvider,
  useTerminalHost,
  type TerminalPanelPrefs,
  type TerminalListWidth,
  type TerminalPanelActions,
  type TerminalTooltipProps,
  type TerminalPopoverProps,
  type TerminalAgentAvatarProps,
  type TerminalHost,
} from './host';
export {
  createInputQueue,
  type InputQueue,
} from './input-queue';
export {
  isXtermFocusReport,
  isXtermMouseReport,
  shouldWakeDeadPane,
} from './is-xterm-focus-report';
export {
  loadTerminalView,
  LazyTerminalView,
  type LazyTerminalViewProps,
} from './lazy-terminal-view';
export {
  NO_WORKTREE,
  PROPRIETARY_IDS,
  buildAgentSections,
  type AgentRow,
  type AgentSection,
  type BuildAgentSectionsInput,
} from './new-session-menu';
export {
  NewSessionPicker,
  type NewSessionPickerProps,
} from './new-session-picker';
export {
  parseOsc7,
} from './parse-osc7';
export {
  noteText,
  ReattachedNote,
} from './reattached-note';
export {
  createReplayGate,
  gateLiveWrite,
  replayLiveHandoff,
  type ReplayGate,
} from './replay-gate';
export {
  resolveRepoForPath,
  type ResolvedRepoPath,
} from './resolve-repo-for-path';
export {
  DEFAULT_KEEP_RECENT_SESSIONS,
  DEFAULT_SESSION_DISPOSE_AFTER_MS,
  mountedSessionIds,
  useSessionViewHistory,
  useMountedSessionIds,
  resetSessionViewHistoryForTests,
  type SessionMountPolicyInput,
} from './session-mount-policy';
export {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_LINE_HEIGHT_MAX,
  terminalFontOptions,
  type TerminalFontSettings,
  type TerminalFontOptions,
} from './terminal-font';
export {
  TerminalHeader,
  type TerminalHeaderProps,
} from './terminal-header';
export {
  findLinks,
  attachTerminalLinks,
  type LinkCell,
  type LinkLine,
  type LinkBuffer,
  type FoundLink,
} from './terminal-links';
export {
  TerminalPanel,
  agentInput,
  agentInitialInput,
  type TerminalPanelProps,
} from './terminal-panel';
export {
  terminalPanelElement,
} from './terminal-panel-element';
export {
  TerminalSessionList,
  ActivityIndicator,
} from './terminal-session-list';
export {
  useTerminalStore,
  onMainSurface,
  inMainPanel,
  isAgentRow,
  cleanAutoName,
  sessionLabel,
  agentLabelFor,
  findAnyCardSession,
  findCardSession,
  resolveSessionAgentId,
  sessionPhase,
  type NewSessionRequest,
  type ConnectionState,
  type SessionPhase,
  type SessionActivity,
} from './terminal-store';
export {
  TerminalView,
} from './terminal-view';
export {
  useAgentActivity,
} from './use-agent-activity';
export {
  useAgents,
  type AgentRoster,
} from './use-agents';
export {
  useDevicePixelRatio,
} from './use-device-pixel-ratio';
export {
  useSessionExits,
} from './use-session-exits';
export {
  useTerminalIpc,
} from './use-terminal-ipc';
export {
  MAX_WEBGL_CONTEXTS,
  useXtermBudget,
  grantedWebglKeys,
  useXtermWebglSlot,
  type XtermRenderer,
} from './xterm-budget';
export {
  YieldedToSessionsPage,
} from './yielded-to-sessions-page';
