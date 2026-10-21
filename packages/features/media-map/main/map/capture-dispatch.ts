import { createCaptureRun, createRoadsRun, createSatelliteRun, type CaptureLayerResult } from './capture-run';
import type { CaptureStats, CaptureWorkerIn, CaptureWorkerOut } from './capture-protocol';

type Run = {
  addTile?: (x: number, y: number, rgba: Uint8Array, width: number, height: number) => void;
  finish: (onProgress: (fraction: number) => void) => Promise<CaptureLayerResult | { ok: true; stats: CaptureStats } | { ok: false; message: string }>;
};

/**
 * The worker's message loop as a plain function: `map-capture-worker` feeds it `parentPort` messages,
 * and the tests feed it an in-process broker — so the real protocol, runs and files are what is tested.
 */
export function createCaptureDispatcher(post: (message: CaptureWorkerOut) => void) {
  let run: Run | null = null;
  return (data: CaptureWorkerIn): void => {
    if (data.type === 'begin') run = createCaptureRun(data);
    else if (data.type === 'begin-satellite') run = createSatelliteRun(data);
    else if (data.type === 'begin-roads') run = createRoadsRun(data);
    else if (data.type === 'tile') run?.addTile?.(data.x, data.y, data.rgba, data.width, data.height);
    else if (data.type === 'finish') {
      const current = run;
      run = null;
      void (async () => {
        try {
          if (!current) throw new Error('No capture was started.');
          const result = await current.finish((fraction) => post({ type: 'progress', id: data.id, fraction }));
          post(result.ok ? { type: 'reply', id: data.id, ok: true, stats: result.stats } : { type: 'reply', id: data.id, ok: false, message: result.message });
        } catch (error) {
          post({ type: 'reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      })();
    }
  };
}
