import { app } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { createGmSampleCache } from '../media/music/gm-sample-cache';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare } from './handle';

/**
 * General MIDI instrument samples (Phase 101 Theme D): which programs are cached, download one on
 * first use, and read a cached one back for the renderer's `Tone.Sampler`.
 */
let cache: ReturnType<typeof createGmSampleCache> | null = null;
const gmCache = () => (cache ??= createGmSampleCache({ directory: app.getPath('userData') }));

export function registerMediaMusicGmHandlers(): void {
  handleBare(CHANNELS.mediaGmStatus, () => gmCache().status());
  handle(
    CHANNELS.mediaGmEnsure,
    schemas.MediaGmEnsureRequest,
    async ({ program }) => {
      const result = await gmCache().ensure(program, (event) =>
        broadcastToAllWindows(EVENT_CHANNELS.mediaGmProgress, event),
      );
      return result.ok ? ok() : failure(result.error);
    },
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaGmLoad,
    schemas.MediaGmLoadRequest,
    async ({ program }) => {
      const loaded = await gmCache().load(program);
      return loaded ? ok(loaded) : failure('Instrument not downloaded');
    },
    (issue) => failure(issue),
  );
}
