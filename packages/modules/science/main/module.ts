import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerScienceOn, type ShowOpenDialog } from './context';

/** What the host hands the Science module: where its files live and the native open dialog. */
export type ScienceModuleServices = { userData: string; showOpenDialog?: ShowOpenDialog };

/**
 * The Science module's main half (Phase 126 Theme A.3), on the feature seam so a host mounts it through
 * `mountModuleMains`. The notebook channel (Theme B).
 */
export const scienceModuleMain = defineFeatureMain<ScienceModuleServices>({
  feature: 'science',
  channels: [CHANNELS.science],
  register(ctx, services) {
    registerScienceOn(ctx, services);
  },
});
