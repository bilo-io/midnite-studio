import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The optimizer feature — Cleaner's one feature, and the pilot for every
 * feature package after it (Phase 113 Theme C; Theme H composes it into
 * `apps/cleaner`).
 *
 * This file is the template's centre: pure data both halves read. The
 * renderer half (`renderer/index.ts`) supplies a component for every view and
 * settings page named here; the main half (`main/index.ts`) registers every
 * channel in `ipc`. `manifest.test.ts` holds all three to the same list, and
 * to the shared registrations (`FEATURE_VIEWS.optimizer`,
 * `FEATURE_SETTINGS_PAGES.optimizer`) the wire contract is built from.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const optimizerManifest = defineFeatureManifest({
  feature: 'optimizer',
  owner: 'cleaner',
  views: [
    {
      id: 'optimizer',
      // Global (Phase 59): it inspects the machine, not one checkout, so it
      // renders with no repository selected.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Optimizer',
        description: 'Scan memory, GPU and storage use and reclaim space',
      },
    },
  ],
  // `trashSafety` first: Studio's settings order interleaves it well ahead of
  // `optimizer` (`STUDIO_SETTINGS_PAGE_ORDER`), and a feature lists its pages
  // in the order its composer takes them.
  settingsPages: ['trashSafety', 'optimizer'],
  ipc: [
    CHANNELS.optimizerScan,
    CHANNELS.optimizerClean,
    CHANNELS.optimizerGpu,
    CHANNELS.optimizerProcesses,
    CHANNELS.optimizerSystemCatalogue,
    CHANNELS.optimizerSystemScan,
    CHANNELS.optimizerSystemClean,
    CHANNELS.optimizerSystemReclaim,
    CHANNELS.optimizerKill,
    // `optimizerTrashSummary`/`optimizerTrashEmpty` are deliberately absent:
    // they stay registered by desktop's `trash-handlers.ts` over
    // `trash-service.ts`, whose separation of trust from this feature's
    // handlers is its own documented decision. They move with Theme H.
  ],
  events: [EVENT_CHANNELS.optimizerScanProgress, EVENT_CHANNELS.optimizerSystemScanProgress],
  mcpTools: [],
});

export type OptimizerManifest = typeof optimizerManifest;
