import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { Spinner } from '../../../components/skeleton';
import type { MapCanvasProps } from './map-canvas';

/**
 * MapLibre and its stylesheet are their own chunk, fetched the first time the Maps tab opens — the entry
 * chunk is unchanged (the same shape as `terrain-viewer-lazy`).
 */
const MapCanvas = lazy(() => import('./map-canvas'));

class MapBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'The map failed to load.' };
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

export function LazyMapCanvas(props: MapCanvasProps) {
  return (
    <MapBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner /> Loading map…
          </div>
        }
      >
        <MapCanvas {...props} />
      </Suspense>
    </MapBoundary>
  );
}
