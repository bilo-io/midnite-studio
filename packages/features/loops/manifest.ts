import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The loops feature (Phase 123 Theme G) — the FAB, the quick-access menu and
 * the Loops panel. Placed in the frame, so every suite app composes it.
 *
 * No view and no settings page of its own: it is a panel and a launcher the
 * app shell docks. It reaches the terminal and the companion only through the
 * `LoopsHost` slots, so its own channels are the run ledger's.
 *
 * Imports `@midnite/studio-shared` and nothing else.
 */
export const loopsManifest = defineFeatureManifest({
  feature: 'loops',
  owner: 'frame',
  views: [],
  settingsPages: [],
  ipc: [CHANNELS.loopRunsList, CHANNELS.loopRunsStart, CHANNELS.loopRunsStop],
  sends: [],
  events: [EVENT_CHANNELS.loopRunsChanged],
  mcpTools: [],
});

export type LoopsManifest = typeof loopsManifest;
