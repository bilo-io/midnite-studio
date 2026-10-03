import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { AUDIO_LOCAL_MODEL_BYTES, AUDIO_LOCAL_MODEL_ID, type AudioEngineState } from '@midnite/studio-shared';

import { MUSICGEN_FRAMES_PER_SECOND } from './prompt';

/**
 * MusicGen-small on `@huggingface/transformers` — the code that runs inside
 * the music worker's utility process, never in main (ONNX inference pins its
 * thread for the length of a render) and never in the renderer. Mirrors
 * `companion/tts.ts`: the module is loaded lazily so a missing native
 * `onnxruntime-node` degrades to "unavailable" instead of crashing boot, and
 * weights are cached under `userData`, not inside the (read-only) app bundle.
 *
 * Weights: `Xenova/musicgen-small`, an ONNX export of Meta's MusicGen-small
 * (CC-BY-NC-4.0). q8 text encoder + q8 decoder + fp32 EnCodec decode is the
 * combination the model card documents: ~660 MB on disk, ~2-3 GB resident
 * while rendering, and about real time on an Apple Silicon CPU (measured: 5 s
 * of audio in 4.4 s).
 */
type TransformersModule = typeof import('@huggingface/transformers');

export const MODEL_DTYPE = { text_encoder: 'q8', decoder_model_merged: 'q8', encodec_decode: 'fp32' } as const;

/** The files that must be present for a load to work offline. */
export const REQUIRED_MODEL_FILES = [
  'onnx/text_encoder_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
  'onnx/encodec_decode.onnx',
  'tokenizer.json',
  'config.json',
] as const;

export type RuntimeStatus = { state: AudioEngineState; reason?: string };
export type InstallProgress = { phase: 'download' | 'load' | 'ready' | 'failed'; fraction: number; message?: string };

export type MusicRuntimeDeps = {
  loadModule: () => Promise<TransformersModule>;
  /** `userData`; weights land in `<directory>/audio-models/`. */
  directory: string;
  exists?: (path: string) => boolean;
};

type Loaded = {
  tokenizer: (text: string) => Record<string, unknown>;
  model: {
    generate: (options: Record<string, unknown>) => Promise<{ data: Float32Array | ArrayLike<number> }>;
    config: { audio_encoder: { sampling_rate: number } };
  };
};

class Cancelled extends Error {}

export function modelCacheDir(directory: string): string {
  return join(directory, 'audio-models');
}

/** Folds transformers.js's per-file progress events into one 0..1 fraction. */
export function createProgressAggregator() {
  const files = new Map<string, { loaded: number; total: number }>();
  return (event: unknown): number => {
    const e = event as { status?: string; file?: string; loaded?: number; total?: number };
    if (e.status === 'progress' && e.file && typeof e.loaded === 'number' && typeof e.total === 'number') {
      files.set(e.file, { loaded: e.loaded, total: e.total });
    } else if (e.status === 'done' && e.file) {
      const prev = files.get(e.file);
      if (prev) files.set(e.file, { loaded: prev.total, total: prev.total });
    }
    let loaded = 0;
    for (const f of files.values()) loaded += f.loaded;
    // The table only knows files it has seen start; the model's size is known up front.
    return Math.min(0.99, loaded / AUDIO_LOCAL_MODEL_BYTES);
  };
}

export function createMusicRuntime(deps: MusicRuntimeDeps) {
  const exists = deps.exists ?? existsSync;
  let loaded: Promise<Loaded> | null = null;
  let failure: string | null = null;
  let installing: Promise<void> | null = null;

  const onDisk = () =>
    REQUIRED_MODEL_FILES.every((f) => exists(join(modelCacheDir(deps.directory), AUDIO_LOCAL_MODEL_ID, f)));

  function status(): RuntimeStatus {
    if (failure) return { state: 'unavailable', reason: failure };
    if (installing) return { state: 'downloading' };
    return { state: onDisk() ? 'ready' : 'missing' };
  }

  async function load(onProgress: (p: InstallProgress) => void): Promise<Loaded> {
    if (loaded) return loaded;
    const attempt = (async (): Promise<Loaded> => {
      const t = await deps.loadModule();
      t.env.cacheDir = modelCacheDir(deps.directory);
      const fold = createProgressAggregator();
      const tokenizer = (await t.AutoTokenizer.from_pretrained(AUDIO_LOCAL_MODEL_ID)) as unknown as Loaded['tokenizer'];
      const model = (await t.MusicgenForConditionalGeneration.from_pretrained(AUDIO_LOCAL_MODEL_ID, {
        dtype: MODEL_DTYPE,
        device: 'cpu',
        progress_callback: (e: unknown) => onProgress({ phase: 'download', fraction: fold(e) }),
      })) as unknown as Loaded['model'];
      return { tokenizer, model };
    })();
    loaded = attempt;
    // A failed attempt (offline, flaky mirror) is transient: the next call tries again.
    attempt.catch(() => {
      if (loaded === attempt) loaded = null;
    });
    return attempt;
  }

  /** Download (if needed) and load the model. Concurrent callers share one attempt. */
  function install(onProgress: (p: InstallProgress) => void): Promise<void> {
    if (installing) return installing;
    const run = (async () => {
      try {
        onProgress({ phase: onDisk() ? 'load' : 'download', fraction: 0 });
        await load(onProgress);
        onProgress({ phase: 'ready', fraction: 1 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A missing native module never recovers in-process; a network failure does.
        if (/onnxruntime|Cannot find module|dlopen/i.test(message)) failure = message;
        onProgress({ phase: 'failed', fraction: 0, message });
        throw error;
      }
    })();
    installing = run;
    const clear = () => {
      if (installing === run) installing = null;
    };
    run.then(clear, clear);
    return run;
  }

  /** Render `seconds` of audio for `prompt`. Throws `Error('cancelled')` when `isCancelled()` turns true. */
  async function render(
    req: { prompt: string; seconds: number },
    opts: { isCancelled: () => boolean; onProgress: (fraction: number) => void; onInstall?: (p: InstallProgress) => void },
  ): Promise<{ samples: Float32Array; sampleRate: number }> {
    const { tokenizer, model } = await load(opts.onInstall ?? (() => undefined));
    const expected = Math.max(1, Math.round(req.seconds * MUSICGEN_FRAMES_PER_SECOND));
    let steps = 0;
    const streamer = {
      put() {
        if (opts.isCancelled()) throw new Cancelled('cancelled');
        steps += 1;
        if (steps % 10 === 0) opts.onProgress(Math.min(0.99, steps / expected));
      },
      end() {},
    };
    try {
      const audio = await model.generate({
        ...tokenizer(req.prompt),
        max_new_tokens: expected,
        do_sample: true,
        guidance_scale: 3,
        streamer,
      });
      opts.onProgress(1);
      return { samples: Float32Array.from(audio.data as ArrayLike<number>), sampleRate: model.config.audio_encoder.sampling_rate };
    } catch (error) {
      if (error instanceof Cancelled || opts.isCancelled()) throw new Error('cancelled');
      throw error;
    }
  }

  return { status, install, render };
}

export type MusicRuntime = ReturnType<typeof createMusicRuntime>;
