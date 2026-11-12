import { CHANNELS, EVENT_CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The ledger feature (Phase 129): double-entry books on the user's disk. The engine is a feature, the place
 * is the `accountant` module (Money mounts it) and Studio shows it as one `books` view with tabs. Phase 130's
 * Startup app reuses the same service through a host port.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const ledgerManifest = defineFeatureManifest({
  feature: 'ledger',
  owner: 'money',
  views: [],
  settingsPages: [],
  ipc: [CHANNELS.ledger],
  events: [EVENT_CHANNELS.ledgerChanged],
  mcpTools: [],
});

export type LedgerManifest = typeof ledgerManifest;
