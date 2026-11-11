import { defineFeatureMain } from '@midnite/studio-runtime';

import type { ShowOpenDialog } from './context';

/** What the host hands the Science module: where its files live and the native open dialog. */
export type ScienceModuleServices = { userData: string; showOpenDialog?: ShowOpenDialog };

/**
 * The Science module's main half (Phase 126 Theme A.3), on the feature seam so a host mounts it through
 * `mountModuleMains`. Theme A registers nothing; B adds the notebook channel.
 */
export const scienceModuleMain = defineFeatureMain<ScienceModuleServices>({
  feature: 'science',
  channels: [],
  register() {},
});
