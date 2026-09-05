import { useState } from 'react';

import { VideoProjectDetail } from './video-project-detail';
import { VideoProjectList } from './video-project-list';
import { VideoStudioPane } from './video-studio-pane';

/**
 * Video Studio (Phase 44) — global, not per-repo, and lazy behind the same
 * Suspense boundary as the other thirteen views (`app.tsx`).
 *
 * Three panes, following the layout Phase 42 argues for: projects left, the
 * studio centre, project detail right — the centre is the point of the view
 * and must not compete for width with its own configuration, the same
 * reasoning that put the canvas at the centre of Workflows and Councils.
 *
 * The three states live in the panes rather than here, because there is no
 * fourth thing this component could show: `VideoProjectList` owns the scan of
 * the video root and runs the full error → empty → skeleton → content ladder
 * over it (`components/skeleton.tsx`), and both `VideoStudioPane` and
 * `VideoProjectDetail` answer "no project selected" with `EmptyState`. A
 * ladder here would be a second, staler copy of the list's own.
 */
export function VideoView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <VideoProjectList selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="min-h-0 flex-1">
        <VideoStudioPane projectId={selectedId} />
      </div>
      <div className="flex h-full w-80 shrink-0 flex-col border-l border-border">
        <VideoProjectDetail projectId={selectedId} />
      </div>
    </div>
  );
}
