import { AGY_IMAGE_DISABLED_REASON } from '@midnite/studio-shared';

import { ImageProviderError, type ImageProvider } from './types';

/**
 * Antigravity CLI — listed, disabled (Phase 99 Theme C spike). `agy -p`
 * (print mode) returns text/json/stream-json on stdout and has no flag or
 * documented tool for writing an image to a path, so there is nothing to
 * adapt yet. Kept as a real adapter so the seam, the picker and the tests all
 * see the full provider list; re-enable by implementing `generate` and
 * dropping `disabledReason` from the shared catalogue.
 */
export const agyImageProvider: ImageProvider = {
  id: 'agy',
  generate: async () => {
    throw new ImageProviderError(AGY_IMAGE_DISABLED_REASON);
  },
};
