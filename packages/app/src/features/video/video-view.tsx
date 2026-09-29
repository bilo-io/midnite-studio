import { MEDIA_TAB_EXPORT_FORMATS } from '@midnite/studio-shared';
import { useState } from 'react';

import { ExportToolbar } from '../media/export-toolbar';
import { MediaLayout } from '../media/media-layout';
import { VideoProjectDetail } from './video-project-detail';
import { VideoProjectList } from './video-project-list';
import { VideoStudioPane } from './video-studio-pane';

/**
 * Media ▸ Video (Phase 99 Theme A; Video Studio since Phase 44).
 *
 * Phase 44's three panes — projects left, the studio centre, project detail
 * right — now render through `MediaLayout`'s explorer/content/detail slots,
 * so Video shares the Media frame's per-tab widths and double-click collapse.
 * Theme D moves this folder to `features/media/video/`, adds root
 * resolution, the assets/iterations trees and codec export; the export
 * button is here but has nothing selectable until then.
 *
 * The three states still live in the panes: `VideoProjectList` owns the scan
 * of the video root and its error → empty → skeleton → content ladder, and
 * both `VideoStudioPane` and `VideoProjectDetail` answer "no project
 * selected" with `EmptyState`.
 */
export function VideoView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <MediaLayout
      tab="video"
      toolbar={<ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.video} hasSelection={false} onExport={() => {}} />}
      explorer={<VideoProjectList selectedId={selectedId} onSelect={setSelectedId} />}
      content={<VideoStudioPane projectId={selectedId} />}
      detail={<VideoProjectDetail projectId={selectedId} />}
      explorerLabel="Resize video project list"
      detailLabel="Resize video project detail"
    />
  );
}
