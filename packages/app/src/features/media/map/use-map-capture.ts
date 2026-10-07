import type { MapCaptureProgressEvent, MapCaptureRequest, MapCaptureResult } from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../../services/bridge';

export type CaptureState =
  | { phase: 'idle' }
  | { phase: 'running'; captureId: string; stage: MapCaptureProgressEvent['stage']; fraction: number }
  | { phase: 'done'; result: MapCaptureResult }
  | { phase: 'failed'; message: string };

/**
 * Capture for Terrain (Phase 108 Theme D). `start` resolves when the run ends; progress arrives on
 * `mediaMapCaptureProgress` events matching this run's `captureId` (chosen here, so Cancel works before
 * the first event). One capture at a time — main refuses a second with `A capture is already running.`.
 */
export function useMapCapture() {
  const [state, setState] = useState<CaptureState>({ phase: 'idle' });
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    const off = bridge()?.media.map.onCaptureProgress((event) => {
      if (event.captureId !== idRef.current) return;
      setState((s) => (s.phase === 'running' ? { ...s, stage: event.stage, fraction: event.fraction } : s));
    });
    return () => off?.();
  }, []);

  const start = useCallback(async (req: Omit<MapCaptureRequest, 'captureId'>) => {
    const api = bridge()?.media.map;
    if (!api) return setState({ phase: 'failed', message: 'Capture is unavailable without the desktop bridge.' });
    const captureId = crypto.randomUUID();
    idRef.current = captureId;
    setState({ phase: 'running', captureId, stage: 'plan', fraction: 0 });
    const result = await api.capture({ ...req, captureId });
    if (idRef.current !== captureId) return;
    idRef.current = null;
    setState(result.ok ? { phase: 'done', result: result.value } : { phase: 'failed', message: result.kind === 'error' ? result.message : 'The capture hit a conflict.' });
  }, []);

  const cancel = useCallback(async () => {
    const id = idRef.current;
    if (id) await bridge()?.media.map.captureCancel({ captureId: id });
  }, []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  return { state, start, cancel, reset };
}
