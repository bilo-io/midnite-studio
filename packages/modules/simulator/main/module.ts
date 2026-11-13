import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerSimulatorOn } from './context';

/** What the host hands the Simulator module: where its files live (scenarios, Theme F). */
export type SimulatorModuleServices = { userData: string };

/**
 * The Simulator module's main half (Phase 127 Theme A.3), on the feature seam so a host mounts it through
 * `mountModuleMains`. The scenario channel (Theme F).
 */
export const simulatorModuleMain = defineFeatureMain<SimulatorModuleServices>({
  feature: 'simulator',
  channels: [CHANNELS.simulator],
  register(ctx, services) {
    registerSimulatorOn(ctx, services);
  },
});
