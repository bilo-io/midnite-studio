import { defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The forge-host feature (Phase 119): Midnite Git's engine. Theme A lands the mirror and backup half
 * (`main/`); the supervisor, the views and the channels arrive with Themes B and C, which is why this
 * contributes nothing to the rail yet. Imports `@midnite/studio-shared` and nothing else.
 */
export const forgeHostManifest = defineFeatureManifest({
  feature: 'forge',
  owner: 'coder',
  views: [],
  settingsPages: [],
  ipc: [],
  events: [],
  mcpTools: [],
});

export type ForgeHostManifest = typeof forgeHostManifest;
