import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The terminal feature (Phase 123 Theme E) — placed in the frame, so every
 * suite app composes it.
 *
 * No view and no settings page of its own: it is a panel the app shell docks,
 * and Settings ▸ Terminal stays Studio's until the settings view moves (Theme L).
 * The channels are the ones the panel calls; their handlers are still
 * registered by Studio's desktop (`terminal-service`, `pty-service`), which
 * is the main-half extraction this theme leaves open.
 *
 * Imports `@midnite/studio-shared` and nothing else.
 */
export const terminalManifest = defineFeatureManifest({
  feature: 'terminal',
  owner: 'frame',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.ptyCreate,
    CHANNELS.ptyResize,
    CHANNELS.ptyKill,
    CHANNELS.ptySnapshot,
    CHANNELS.ptySubscribe,
    CHANNELS.ptyUnsubscribe,
    CHANNELS.terminalList,
    CHANNELS.terminalSave,
    CHANNELS.terminalForget,
    CHANNELS.terminalReorder,
  ],
  /** One-way: a keystroke has no answer worth awaiting. */
  sends: [CHANNELS.ptyInput],
  events: [
    EVENT_CHANNELS.ptyData,
    EVENT_CHANNELS.ptyExit,
    EVENT_CHANNELS.ptyAgentChanged,
    EVENT_CHANNELS.ptyCommandChanged,
    EVENT_CHANNELS.ptyActivity,
  ],
  mcpTools: [],
});

export type TerminalManifest = typeof terminalManifest;
