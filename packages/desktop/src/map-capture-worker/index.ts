import { createCaptureRun } from '../main/media/map/capture-run';
import type { CaptureWorkerIn, CaptureWorkerOut } from '../main/media/map/capture-protocol';

/**
 * `utilityProcess` entry point `capture-broker.ts` forks (Phase 108 Theme D): stitching a 1 024-tile
 * mosaic, resampling a 4097² grid and encoding three files are seconds of synchronous work, so they
 * run here and never on main's event loop. A cancel kills this process.
 */
const post = (message: CaptureWorkerOut) => process.parentPort.postMessage(message);
let run: ReturnType<typeof createCaptureRun> | null = null;

process.parentPort.on('message', (event) => {
  const data = event.data as CaptureWorkerIn;
  if (data.type === 'begin') {
    run = createCaptureRun(data);
  } else if (data.type === 'tile') {
    run?.addTile(data.x, data.y, data.rgba, data.width, data.height);
  } else if (data.type === 'finish') {
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
});
