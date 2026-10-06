import type { RetargetSource } from './clip-panel';
import type { ConvertFn } from './mesh-panel';
import type { SdfBaker } from './sculpt/use-sdf';
import { Component, type Dispatch, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { Spinner } from '../../../components/skeleton';
import type { EditorAction, EditorState } from './editor-state';
import type { ModelViewFormat } from './model-utils';
import type { ModelViewerStats } from './model-viewer';

/**
 * three.js is the heaviest dependency the renderer has and only this tab uses
 * it, so the viewer is its own chunk: the entry bundle never carries it, and
 * it is fetched the first time a model is opened.
 */
const ModelViewer = lazy(() => import('./model-viewer'));
const ModelEditor = lazy(() => import('./model-editor'));

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

export function LazyModelViewer(props: {
  url: string;
  format: ModelViewFormat;
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

/** The editable view of a generated design — same lazy chunk story as the read-only viewer. */
export function LazyModelEditor(props: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onSave: () => void;
  saving: boolean;
  retargetSources?: readonly RetargetSource[];
  onConvert?: ConvertFn;
  sdfBaker?: SdfBaker;
}) {
  return (
    <ViewerBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner /> Loading 3D editor…
          </div>
        }
      >
        <ModelEditor {...props} />
      </Suspense>
    </ViewerBoundary>
  );
}
