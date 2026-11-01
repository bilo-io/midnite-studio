import type { SfxGenerateStage } from '@midnite/studio-shared';

import type { SfxTake } from './pipeline';

/** Messages the SFX broker posts to `sfx-worker`. One take per message; the service loops the variations. */
export type SfxWorkerIn = {
  type: 'generate';
  id: string;
  /** `<userData>/sfx/assets`. */
  assetsDir: string;
  take: SfxTake;
};

/** Messages the worker posts back. `channels` are structured-cloned, never base64. */
export type SfxWorkerOut =
  | { type: 'stage'; id: string; stage: SfxGenerateStage; fraction?: number }
  | { type: 'reply'; id: string; ok: true; channels: Float32Array[]; sampleRate: number }
  | { type: 'reply'; id: string; ok: false; message: string };
