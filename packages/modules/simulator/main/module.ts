import { defineFeatureMain } from '@midnite/studio-runtime';

/** What the host hands the Simulator module: where its files live (scenarios, Theme F). */
export type SimulatorModuleServices = { userData: string };

/**
 * The Simulator module's main half (Phase 127 Theme A.3), on the feature seam so a host mounts it through
 * `mountModuleMains`. No channels yet: Theme F adds the scenario channel.
 */
export const simulatorModuleMain = defineFeatureMain<SimulatorModuleServices>({
  feature: 'simulator',
  channels: [],
  register() {
    // Theme F registers the scenario handlers.
  },
});
