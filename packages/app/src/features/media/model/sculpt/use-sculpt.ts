import type { ModelSpec } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { bridge } from '../../../../services/bridge';
import type { EditorAction } from '../editor-state';
import { startSculptSession } from './sculpt-client';
import { SculptController, type SculptIO, type SculptSnapshot } from './sculpt-controller';

/** The bridge's mesh channel, scoped to the open design's folder (Phase 104 Theme D). */
export function useSculptIO(repoId: string, project: string | null, path: string | null): SculptIO | undefined {
  const dir = path && path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
  const stem = path ? (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') : '';
  return useMemo<SculptIO | undefined>(() => {
    if (!project || !path) return undefined;
    const api = () => {
      const mesh = bridge()?.media.model.mesh;
      if (!mesh) throw new Error('Sculpting needs the desktop app.');
      return mesh;
    };
    return {
      stem,
      read: (src) => api().read({ repoId, project, dir, src }),
      write: (req) => api().write({ repoId, project, dir, ...req }),
      readOps: (src) => api().readOps({ repoId, project, dir, src }),
    };
  }, [repoId, project, path, dir, stem]);
}

/**
 * Sculpt mode's controller for the editor's lifetime: one worker (started on first use), the snapshot
 * as React state, and the live mesh kept in step with every spec the reducer produces.
 */
export function useSculpt(io: SculptIO | undefined, dispatch: (action: EditorAction) => void, spec: ModelSpec): { controller: SculptController | null; snapshot: SculptSnapshot | null } {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const forward = useCallback((action: EditorAction) => dispatchRef.current(action), []);
  const controller = useMemo(() => (io ? new SculptController(startSculptSession, io, forward) : null), [io, forward]);
  useEffect(() => () => controller?.terminate(), [controller]);
  const subscribe = useCallback((listener: () => void) => controller?.subscribe(listener) ?? (() => undefined), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller?.getSnapshot() ?? null, () => controller?.getSnapshot() ?? null);
  useEffect(() => {
    void controller?.sync(spec);
  }, [controller, spec]);
  return { controller, snapshot };
}
