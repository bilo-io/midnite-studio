import { CHANNELS } from '@midnite/studio-shared';

import { computeTrashSummary, emptyTrash } from '../trash-service';
import { handleBare } from './handle';

/**
 * The Trash's IPC surface (Phase 74 Themes B, C) — its own handler file, not
 * folded into `optimizer-handlers.ts`, for the same separation-of-trust
 * reason the registry stays out of the detector list: the two operations
 * should never become easy to confuse at a call site.
 *
 * Both channels are payload-free, so both use `handleBare` — there is no
 * schema to validate and therefore no `onInvalid` arm.
 */
export function registerTrashHandlers(): void {
  // One summary walk at a time: a second `optimizerTrashSummary` call aborts
  // whichever is still running, mirroring `optimizer-handlers.ts`'s own
  // `currentScan` pattern.
  let currentSummary: AbortController | null = null;

  handleBare(CHANNELS.optimizerTrashSummary, async () => {
    currentSummary?.abort();
    const controller = new AbortController();
    currentSummary = controller;

    try {
      const value = await computeTrashSummary({ signal: controller.signal });
      return { ok: true as const, value };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (currentSummary === controller) currentSummary = null;
    }
  });

  handleBare(CHANNELS.optimizerTrashEmpty, async () => {
    try {
      return await emptyTrash();
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
