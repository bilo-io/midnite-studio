/**
 * `kokoro-js` ships its own `.d.ts` (`types/kokoro.d.ts`), but only through its
 * `package.json`'s `exports` map — it has no top-level `main`/`types` field.
 * This repo's `tsconfig.base.json` sets `moduleResolution: "node"` (classic
 * resolution, which ignores `exports` entirely) everywhere, not just here, so
 * switching just this package to `"bundler"`/`"node16"` to read that map is a
 * bigger blast radius than one dependency's typings are worth. Kept
 * intentionally narrow — only the surface `tts.ts` actually calls — the same
 * call `sherpa-onnx-node.d.ts` made before this engine swap, and
 * `virtual-modules.d.ts`'s one virtual module.
 */
declare module 'kokoro-js' {
  export type KokoroGenerateOptions = {
    voice?: string;
    speed?: number;
  };

  /** Structurally `@huggingface/transformers`'s `RawAudio` — only the two fields this app reads. */
  export type KokoroRawAudio = {
    audio: Float32Array;
    sampling_rate: number;
  };

  export class KokoroTTS {
    static from_pretrained(
      modelId: string,
      options: {
        dtype: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
        device: 'wasm' | 'webgpu' | 'cpu' | null;
        progress_callback?: (progress: unknown) => void;
      },
    ): Promise<KokoroTTS>;

    generate(text: string, options?: KokoroGenerateOptions): Promise<KokoroRawAudio>;
  }
}
