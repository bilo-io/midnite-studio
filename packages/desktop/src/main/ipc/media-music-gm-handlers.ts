import { app } from 'electron';

import { createGmSampleCache, type GmSampleCache } from '@midnite/studio-feature-media-audio/main';

/**
 * General MIDI instrument samples (Phase 101 Theme D): the cache lives under `userData`. The three
 * channels over it (status, ensure, load) are the Audio feature's, registered by
 * `registerMediaAudioHandlers`; this module only builds the cache, lazily, because `app.getPath`
 * is not ready when the module loads.
 */
let cache: GmSampleCache | null = null;
export const gmCache = (): GmSampleCache => (cache ??= createGmSampleCache({ directory: app.getPath('userData') }));
