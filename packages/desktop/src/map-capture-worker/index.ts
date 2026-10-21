import {
  createCaptureDispatcher,
  type CaptureWorkerIn,
  type CaptureWorkerOut,
} from '@midnite/studio-feature-media-map/map-capture-worker';

/**
 * `utilityProcess` entry point `capture-broker.ts` forks (Phase 108 Themes D–E): stitching a 1 024-tile
 * mosaic, resampling a 4097² grid and encoding the outputs are seconds of synchronous work, so they
 * run here and never on main's event loop. A cancel kills this process.
 */
const dispatch = createCaptureDispatcher((message: CaptureWorkerOut) => process.parentPort.postMessage(message));
process.parentPort.on('message', (event) => dispatch(event.data as CaptureWorkerIn));
