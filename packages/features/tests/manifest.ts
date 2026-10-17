import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The tests feature — Coder's Tests view (Phase 113 Theme O).
 *
 * The main half is test discovery, per-suite trust and the runner, moved out of
 * `packages/desktop/src/main/ipc/tests-handlers.ts` and `main/testing/`. Every
 * channel takes a `repoId` and a `suiteId`, never a path or a command: main
 * resolves the checkout from the composer's `workdir` port and re-discovers the
 * suite before trusting or running it, so a renderer cannot name a command.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const testsManifest = defineFeatureManifest({
  feature: 'tests',
  owner: 'coder',
  views: [
    {
      id: 'tests',
      global: false,
      rail: { group: 'workspace', label: 'Tests', description: 'Discover test suites by package and run them' },
    },
  ],
  settingsPages: [],
  ipc: [CHANNELS.testsDiscover, CHANNELS.testsTrustStatus, CHANNELS.testsTrust, CHANNELS.testsUntrust, CHANNELS.testsRun],
  /** One-way (`send`) channels. */
  sends: [CHANNELS.testsCancel],
  events: [EVENT_CHANNELS.testsOutput, EVENT_CHANNELS.testsResult],
  mcpTools: [],
});

export type TestsManifest = typeof testsManifest;
