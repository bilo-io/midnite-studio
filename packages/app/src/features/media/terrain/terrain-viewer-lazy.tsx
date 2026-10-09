import type { TerrainSpec } from '@midnite/studio-shared';
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { Spinner } from '../../../components/skeleton';
import type { ShadingMode } from './terrain-shading';

/**
 * three.js is the heaviest dependency the renderer has and only the 3D tabs use it, so the viewport is
 * its own chunk, fetched the first time a built terrain is shown (the same shape as `model-viewer-lazy`).
 */
const TerrainViewer = lazy(() => import('./terrain-viewer'));

export type TerrainViewerProps = {
  repoId: string;
  project: string;
  terrain: string;
  spec: TerrainSpec;
  built: boolean;
  shading: ShadingMode;
  /** Hours, 0 to 24. */
  timeOfDay: number;
  /** p50 frame time in ms over the last 120 frames. */
  onFrameMs?: (ms: number) => void;
  align?: boolean;
  onAlignChange?: (align: boolean) => void;
  brushActive?: boolean;
  onBrushActiveChange?: (active: boolean) => void;
  onCommitSpec?: (patch: Record<string, unknown>) => void;
  onPaint?: (req: { cls: number; radiusPx: number; points: [number, number][] }) => void;
};

class ViewerBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'The 3D viewer failed to load.' };
  }
  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Rendered below; nothing else to do.
  }
  override render() {
    return this.state.error ? (
      <p role="alert" className="p-6 text-center text-xs text-destructive">
        {this.state.error}
      </p>
    ) : (
      this.props.children
    );
  }
}

export function LazyTerrainViewer(props: TerrainViewerProps) {
  return (
    <ViewerBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner /> Loading terrain…
          </div>
        }
      >
        <TerrainViewer {...props} />
      </Suspense>
    </ViewerBoundary>
  );
}
