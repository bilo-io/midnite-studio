/**
 * The seam between the `musicgen` provider and whatever actually runs the
 * model. Production is `music-broker.ts` talking to a utility process; tests
 * hand in a fake, so no weights are ever downloaded under vitest.
 */
export type MusicRender = { samples: Float32Array; sampleRate: number };

export type MusicRenderRequest = {
  /** The caption MusicGen is conditioned on. */
  prompt: string;
  /** Seconds of audio to render; at most `AUDIO_LOCAL_SEGMENT_S`. */
  seconds: number;
};

export interface MusicEngine {
  render: (
    req: MusicRenderRequest,
    opts: { signal: AbortSignal; onProgress: (fraction: number) => void },
  ) => Promise<MusicRender>;
}
