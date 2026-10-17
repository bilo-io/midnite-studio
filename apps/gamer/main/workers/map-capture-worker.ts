import {
  createCaptureDispatcher,
  type CaptureWorkerIn,
  type CaptureWorkerOut,
} from '@midnite/studio-feature-media-map/map-capture-worker';

/**
 * `utilityProcess` entry point the Maps feature's capture broker forks: stitching a 1 024-tile mosaic,
 * resampling a 4097² grid and encoding the outputs are seconds of synchronous work, so they run here and
 * never on main's event loop. A cancel (or quitting) kills this process. The same loop as Studio's
 * `map-capture-worker/index.ts`.
 */
const dispatch = createCaptureDispatcher((message: CaptureWorkerOut) => process.parentPort.postMessage(message));
process.parentPort.on('message', (event) => dispatch(event.data as CaptureWorkerIn));
