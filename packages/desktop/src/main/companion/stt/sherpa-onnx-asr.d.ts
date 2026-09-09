/**
 * `sherpa-onnx-node` ships no types of its own (Ad Hoc: the microphone must
 * work with no API key).
 *
 * A second `declare module 'sherpa-onnx-node'` block, in its own file rather
 * than added to `../sherpa-onnx-node.d.ts` — that file declares only the
 * `OfflineTts` surface `tts.ts` calls, and it is a file the TTS engine swap
 * (`feature/kokoro-tts`) may delete outright along with `tts.ts` itself once
 * it moves speech *out* onto `kokoro-js`. TypeScript merges ambient module
 * augmentations across files with no import needed on either side, so this
 * declares only the offline-ASR surface `sherpa-local.ts` calls and survives
 * that deletion independently. If both files ever collide on a member name
 * TypeScript will say so at compile time; until then there is nothing to
 * coordinate.
 *
 * Kept intentionally narrow, the same call `sherpa-onnx-node.d.ts` and
 * `virtual-modules.d.ts` both make — the package's real surface is much
 * larger (VAD, speaker diarization, keyword spotting, …), none of which this
 * app uses.
 */
declare module 'sherpa-onnx-node' {
  export type OfflineWhisperModelConfig = {
    encoder: string;
    decoder: string;
    language?: string;
    task?: string;
    tailPaddings?: number;
  };

  export type OfflineModelConfig = {
    whisper: OfflineWhisperModelConfig;
    tokens: string;
    numThreads?: number;
    provider?: string;
    debug?: boolean | number;
  };

  export type OfflineRecognizerConfig = {
    featConfig?: { sampleRate?: number; featureDim?: number };
    modelConfig: OfflineModelConfig;
  };

  export type OfflineRecognizerResult = {
    text: string;
    tokens: string[];
    timestamps: number[];
  };

  export type Waveform = { samples: Float32Array; sampleRate: number };

  export class OfflineStream {
    acceptWaveform(wave: Waveform): void;
  }

  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
    getResult(stream: OfflineStream): OfflineRecognizerResult;
  }

  /** Parses an in-memory WAV file — no disk round trip needed. */
  export function readWaveFromBinary(data: Uint8Array): Waveform;
}
