/**
 * The companion feature's renderer half (Phase 123 Theme F) — the orb, panel, thread, launcher, voice
 * and zen stage, the reveal engine, and the `CompanionHost` port they reach the app through.
 *
 * Every member the app or a sibling surface imports is named here, so a deep import into this folder
 * is never needed. Nothing here installs anything on import: the host is read when a function runs.
 */
export {
  CompanionHostProvider,
  getCompanionHost,
  installCompanionHost,
  resetCompanionHostForTests,
  useCompanionHost,
  type CompanionAiComposerProps,
  type CompanionComposerMic,
  type CompanionDismissableOptions,
  type CompanionFollowUpReads,
  type CompanionHost,
  type CompanionPillKey,
  type CompanionScreensaverKit,
  type CompanionSkillHandoffContext,
  type CompanionSkillHandoffOptions,
  type CompanionStartAgentInput,
  type CompanionStore,
  type CompanionTerminalState,
  type CompanionToastRequest,
  type CompanionTooltipProps,
  type CompanionUiState,
  type CompanionUserAvatarProps,
} from './host';
export { createDefaultCompanionHost, type DefaultCompanionHostOptions } from './default-host';

export { CompanionPanel, CompanionPanelSlot } from './companion-panel';
export { setCommandRuntime } from './command-runtime';
export { McpSettingConfirmHost } from './mcp-setting-confirm';
export { useCompanionUiRequests } from './ui-requests';
export { useCompanionHandoffWatch, useCompanionSpeakerWiring } from './register-flow-ports';
export { useCompanionEnabledSync } from './use-companion-enabled';
export { COMPANION_LOOK, CompanionGlyph, fabCompanionState } from './companion-look';
export { useCompanionStore } from './companion-store';
export { CompanionOrb } from './companion-orb';
export { CompanionLauncher } from './companion-launcher';
export { companionPorts, resetCompanionPorts, setCompanionPorts } from './companion-ports';
export {
  applyCompanionSetting,
  applyCompanionSettings,
  lastCompanionSettingChange,
  resetCompanionSettingUndoForTest,
  undoLastCompanionSetting,
} from './settings-apply';
export {
  deleteCompanionProfile,
  previewSaveCompanionProfile,
  renameCompanionProfile,
  saveCompanionProfile,
  switchCompanionProfile,
  type CompanionProfileResult,
} from './profiles';
export { setCompanionVolume } from './audio/context';
export { useMicLevelBars, type LevelBars } from './audio/waveform';
export { companionTtsSpeaker, type CompanionSpeaker } from './speaker';
export { refreshMicAvailability, setNextTranscriptSink } from './voice-ports';
export {
  __setConversationDepsForTest,
  conversationArmed,
  conversationOwner,
  startConversation,
  stopConversation,
  subscribeConversation,
  type ConversationOwner,
} from './conversation';
export { handleCompanionRelayAction, liveNavigationState, resolveNavigation } from './navigate';

// The reveal engine and the shapes Studio's revealers and sources are written against.
export { revealResource, revealSay } from './reveal/reveal';
export { useRevealHistory, REVEAL_HISTORY_LIMIT } from './reveal/reveal-history';
export type {
  RevealCaller,
  RevealContext,
  RevealFailure,
  RevealOptions,
  RevealOutcome,
  Revealer,
  RevealerTable,
  FamilyRevealers,
} from './reveal/types';
export type { ResourceMatch, ResourceSource } from './reveal/resolve';
export { unavailableRevealer } from './reveal/revealers/stub';
