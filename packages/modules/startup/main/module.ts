import { defineFeatureMain, type IpcContextElectron } from '@midnite/studio-runtime';

/** The electron pieces Startup's main needs, injected so registration is testable under bare vitest. */
export type StartupElectron = IpcContextElectron;

/** What the host hands the Startup module. */
export type StartupMainServices = { electron: StartupElectron };

/**
 * The Startup module's main half, on the feature seam so a host mounts it through `mountModuleMains`.
 * Theme A declares no channel; Theme B adds `CHANNELS.startup` and the workspace store behind it.
 */
export const startupModuleMain = defineFeatureMain<StartupMainServices>({
  feature: 'startup',
  channels: [],
  register() {
    // No channel yet.
  },
});
