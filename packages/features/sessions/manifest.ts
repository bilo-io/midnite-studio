import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * Sessions as a feature (Phase 113 Theme O slice 4) — the manager for every terminal and agent session,
 * live or closed: grouped by repository and by workflow run, filtered by state, provider and ending,
 * with the live session or the closed transcript beside the list. Placed with Coder
 * (`FEATURE_PLACEMENT.sessions`); Studio composes every feature.
 *
 * The renderer half is the view; what a session *is* comes through its host port, because the two apps
 * that compose it know sessions differently. Studio owns its terminals (the terminal store, the session
 * history, the panel an xterm lives in). Coder owns none: it lists the runtime host's sessions as a
 * broker guest and attaches to them — which is this feature's **main half**, the guest channels below.
 *
 * `ipc` is what that main half registers (`sessionsGuestMain`), and only that: in Studio the same channel
 * names are the terminal service's own, registered by `packages/desktop`, which owns a pty server. A guest
 * lists, snapshots, writes and resizes; it registers no `pty.create` or `pty.kill` — Coder starts nothing
 * and kills nothing it did not start.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const sessionsManifest = defineFeatureManifest({
  feature: 'sessions',
  owner: 'coder',
  views: [
    {
      id: 'sessions',
      global: true,
      rail: { group: 'pinned', label: 'Sessions', description: 'Every terminal and agent session, live and finished' },
    },
  ],
  settingsPages: [],
  ipc: [CHANNELS.terminalList, CHANNELS.ptySnapshot],
  /** One-way (`send`) channels: keystrokes and a resize into a session, and which ptys a window streams. */
  sends: [CHANNELS.ptyInput, CHANNELS.ptyResize, CHANNELS.ptySubscribe, CHANNELS.ptyUnsubscribe],
  events: [EVENT_CHANNELS.ptyData, EVENT_CHANNELS.ptyExit],
  mcpTools: [],
});

export type SessionsManifest = typeof sessionsManifest;
