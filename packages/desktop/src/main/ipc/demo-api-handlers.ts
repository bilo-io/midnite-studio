import { CHANNELS, failure, ok } from '@midnite/studio-shared';

import { demoApiStatus, startDemoApi, stopDemoApi } from '../demo-api/server';
import { handleBare } from './handle';

/**
 * The workflow demo API's three channels (Phase 43 Theme D).
 *
 * All payload-free: there is nothing for the renderer to configure. The port
 * especially is main's — the server binds `listen(0)` and reports back, so a
 * fixed port cannot collide with whatever else the developer is running.
 *
 * `start` is wrapped in the result envelope rather than allowed to reject: a
 * bind that fails is something the header renders, and an exception crossing
 * `ipcRenderer.invoke` arrives as an opaque string with the real cause gone.
 */
export function registerDemoApiHandlers(): void {
  handleBare(CHANNELS.demoApiStart, async () => {
    try {
      return ok(await startDemoApi());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(`The demo API could not start: ${message}`);
    }
  });

  handleBare(CHANNELS.demoApiStop, async () => {
    await stopDemoApi();
    return ok();
  });

  handleBare(CHANNELS.demoApiStatus, () => demoApiStatus());
}
