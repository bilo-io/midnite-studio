/**
 * `sherpa-onnx-node` ships no types of its own (Phase 80 Theme C).
 *
 * Only the surface `tts.ts` actually calls is declared — the package's real
 * API is much larger (STT, VAD, speaker diarization, …), none of which this
 * app uses. Kept intentionally narrow rather than a wholesale re-declaration
 * of the upstream JSDoc, the same call `virtual-modules.d.ts` makes for its
 * one virtual module.
 */
declare module 'sherpa-onnx-node' {
  export type OfflineTtsVitsModelConfig = {
    model: string;
    tokens: string;
    dataDir?: string;
    lexicon?: string;
    noiseScale?: number;
    noiseScaleW?: number;
    lengthScale?: number;
  };

  export type OfflineTtsConfig = {
    model: {
      vits: OfflineTtsVitsModelConfig;
      numThreads?: number;
      debug?: boolean | number;
      provider?: string;
    };
    maxNumSentences?: number;
    silenceScale?: number;
  };

  export type GeneratedAudio = {
    samples: Float32Array;
    sampleRate: number;
  };

  export type TtsRequest = {
    text: string;
    sid: number;
    speed: number;
  };

  export class OfflineTts {
    constructor(config: OfflineTtsConfig);
    readonly numSpeakers: number;
    readonly sampleRate: number;
    generate(request: TtsRequest): GeneratedAudio;
  }
}
