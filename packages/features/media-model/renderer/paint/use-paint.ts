import type { ModelSpec } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { EditorAction } from '../editor-state';
import type { SculptIO } from '../sculpt/sculpt-controller';
import { PaintController, type PaintIO, type PaintSnapshot } from './paint-controller';

/** The sculpt IO's paint half (Phase 104 Theme G), when the bridge offers it. */
export function paintIOFrom(io: SculptIO | undefined): PaintIO | undefined {
  if (!io?.writeTexture || !io.readFile) return undefined;
  return { stem: io.stem, readMesh: io.read, readFile: io.readFile, writeTexture: io.writeTexture };
}

/** Paint mode's controller for the editor's lifetime, its snapshot as React state, kept in step with the spec. */
export function usePaint(io: PaintIO | undefined, dispatch: (action: EditorAction) => void, spec: ModelSpec): { controller: PaintController | null; snapshot: PaintSnapshot | null } {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const forward = useCallback((action: EditorAction) => dispatchRef.current(action), []);
  const controller = useMemo(() => (io ? new PaintController(io, forward) : null), [io, forward]);
  useEffect(() => () => void controller?.dispose(), [controller]);
  const subscribe = useCallback((listener: () => void) => controller?.subscribe(listener) ?? (() => undefined), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller?.getSnapshot() ?? null, () => controller?.getSnapshot() ?? null);
  useEffect(() => {
    void controller?.sync(spec);
  }, [controller, spec]);
  return { controller, snapshot };
}
