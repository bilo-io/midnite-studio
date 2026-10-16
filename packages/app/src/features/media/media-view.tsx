import { MediaShell } from '@midnite/studio-feature-media-core/renderer';

import { STUDIO_MEDIA_TABS } from '../../compose/media-tabs';

/**
 * Studio's Media page (Phase 99 Theme A) — since Phase 113 Theme Q it is
 * media-core's `MediaShell` over Studio's registry: all nine tabs, in the
 * order they have always had, each rendering through `MediaLayout`.
 */
export function MediaView() {
  return <MediaShell tabs={STUDIO_MEDIA_TABS} />;
}
