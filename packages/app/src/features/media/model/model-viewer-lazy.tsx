import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { Spinner } from '../../../components/skeleton';
import type { ModelViewerStats } from './model-viewer';

/**
 * three.js is the heaviest dependency the renderer has and only this tab uses
 * it, so the viewer is its own chunk: the entry bundle never carries it, and
 * it is fetched the first time a model is opened.
 */
const ModelViewer = lazy(() => import('./model-viewer'));

class ViewerBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'The 3D viewer failed to load.' };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Rendered below; nothing else to do.
  }
  render() {
    return this.state.error ? (
      <p role="alert" className="p-6 text-center text-xs text-destructive">
        {this.state.error}
      </p>
    ) : (
      this.props.children
    );
  }
}

export function LazyModelViewer(props: {
  url: string;
  format: 'obj' | 'fbx';
  mtlUrl?: string | null;
  onStats?: (stats: ModelViewerStats | null) => void;
}) {
  return (
    <ViewerBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner /> Loading 3D viewer…
          </div>
        }
      >
        <ModelViewer {...props} />
      </Suspense>
    </ViewerBoundary>
  );
}
