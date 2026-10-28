// Moved into the optimizer feature package (Phase 113 Theme H). Studio's binding supplies the main
// log seam; the reclaim command needs nothing from the host.
import {
  cleanSystemCaches as featureCleanSystemCaches,
  scanSystemCaches as featureScanSystemCaches,
} from '@midnite/studio-feature-optimizer/main';

import { defaultLogger } from '../log';

export { runReclaimCommand } from '@midnite/studio-feature-optimizer/main';

export const scanSystemCaches = (opts: Parameters<typeof featureScanSystemCaches>[0]) =>
  featureScanSystemCaches({ log: defaultLogger, ...opts });

export const cleanSystemCaches = (
  entryIds: readonly string[],
  trash: (path: string) => Promise<void>,
) => featureCleanSystemCaches(entryIds, trash, defaultLogger);
