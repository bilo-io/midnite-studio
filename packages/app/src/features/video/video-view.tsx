import { useState } from 'react';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
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
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const projectList = useResizable({
    size: layout.videoProjectListWidth,
    onSize: (value) => setLayout('videoProjectListWidth', value),
    initial: DEFAULT_LAYOUT.videoProjectListWidth,
    axis: 'x',
    edge: 'start',
    ...LAYOUT_BOUNDS.videoProjectListWidth,
  });

  const projectDetail = useResizable({
    size: layout.videoDetailWidth,
    onSize: (value) => setLayout('videoDetailWidth', value),
    initial: DEFAULT_LAYOUT.videoDetailWidth,
    axis: 'x',
    edge: 'end',
    ...LAYOUT_BOUNDS.videoDetailWidth,
  });

  return (
    <div className="flex h-full min-h-0">
      <div
        className="flex shrink-0 flex-col border-r border-border"
        style={{ width: projectList.current }}
      >
        <VideoProjectList selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <ResizeHandle resizable={projectList} axis="x" label="Resize video project list" />
      <div className="min-h-0 flex-1">
        <VideoStudioPane projectId={selectedId} />
      </div>
      <ResizeHandle resizable={projectDetail} axis="x" label="Resize video project detail" />
      <div
        className="flex h-full shrink-0 flex-col border-l border-border"
        style={{ width: projectDetail.current }}
      >
        <VideoProjectDetail projectId={selectedId} />
      </div>
    </div>
  );
}

