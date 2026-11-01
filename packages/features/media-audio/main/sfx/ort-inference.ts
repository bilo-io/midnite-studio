import { readFile } from 'node:fs/promises';

import { SFX_LATENT_CHANNELS, SFX_LATENT_LENGTH, SFX_TOKEN_LENGTH } from '@midnite/studio-shared';

import { padTokens, type SfxInference, type SfxTokens } from './pipeline';

/**
 * `SfxInference` on `onnxruntime-node` — the runtime the app already ships for its voice, music and SF3D
 * engines (it arrives as `@huggingface/transformers`' own dependency), so Stable Audio adds no native module
 * and no Python. Runs only inside `sfx-worker`'s utility process.
 *
 * The ORT surface is typed structurally (`SfxOrtModule`), so this file needs no type package and the tests can
 * hand it a fake module.
 */
export type SfxOrtTensor = { type: string; data: unknown; dims: readonly number[] };
export type SfxOrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, SfxOrtTensor>>;
};
export type SfxOrtModule = {
  InferenceSession: { create: (path: string, options?: Record<string, unknown>) => Promise<SfxOrtSession> };
  Tensor: new (type: 'float32' | 'int64', data: Float32Array | BigInt64Array, dims: readonly number[]) => unknown;
};

/**
 * No CPU arena: it grows by doubling into single blocks over 2 GiB, which Electron's PartitionAlloc kills with
 * SIGTRAP (SF3D found this first, #1104). The DiT alone is 1.3 GB of fp32 weights.
 */
export const SFX_SESSION_OPTIONS = { executionProviders: ['cpu'], graphOptimizationLevel: 'all', enableCpuMemArena: false } as const;

function float32(tensor: SfxOrtTensor | undefined, what: string): Float32Array {
  if (!tensor) throw new Error(`Stable Audio's ${what} graph returned nothing.`);
  if (tensor.type !== 'float32') throw new Error(`Stable Audio's ${what} graph returned ${tensor.type}, expected float32.`);
  return tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data as ArrayLike<number>);
}

const output = (out: Record<string, SfxOrtTensor>, session: SfxOrtSession, name: string, index: number) => out[name] ?? out[session.outputNames[index]!];

/**
 * Sessions are created on first use and kept for the next take; the worker process is the unit of release
 * (a cancel, an uninstall or the idle timer kills it).
 */
export function createSfxOrtInference(ort: SfxOrtModule, path: (asset: string) => string): SfxInference {
  const sessions = new Map<string, Promise<SfxOrtSession>>();
  const session = (file: string) => {
    let s = sessions.get(file);
    if (!s) {
      s = ort.InferenceSession.create(path(file), SFX_SESSION_OPTIONS);
      // A failed load (a file removed under us) must not poison the next attempt.
      s.catch(() => sessions.delete(file));
      sessions.set(file, s);
    }
    return s;
  };
  const f32 = (data: Float32Array, dims: number[]) => new ort.Tensor('float32', data, dims);

  return {
    async encode(tokens: SfxTokens, seconds: number) {
      const s = await session('cond.onnx');
      const out = await s.run({
        input_ids: new ort.Tensor('int64', tokens.ids, [1, SFX_TOKEN_LENGTH]),
        attention_mask: new ort.Tensor('int64', tokens.mask, [1, SFX_TOKEN_LENGTH]),
        seconds_total: f32(Float32Array.of(seconds), [1]),
      });
      return { cross: float32(output(out, s, 'cross', 0), 'conditioning'), global: float32(output(out, s, 'global', 1), 'conditioning') };
    },
    async velocity(x, t, cross, global) {
      const s = await session('dit.onnx');
      const out = await s.run({
        x: f32(x, [1, SFX_LATENT_CHANNELS, SFX_LATENT_LENGTH]),
        t: f32(Float32Array.of(t), [1]),
        cross: f32(cross, [1, cross.length / 768, 768]),
        global: f32(global, [1, global.length]),
      });
      return float32(output(out, s, 'v', 0), 'diffusion');
    },
    async decode(latent, frames) {
      const s = await session('dec.onnx');
      const out = await s.run({ z: f32(latent, [1, SFX_LATENT_CHANNELS, frames]) });
      return float32(output(out, s, 'audio', 0), 'decoder');
    },
  };
}

/** The slice of transformers.js the tokenizer needs — typed structurally, loaded lazily by the worker. */
export type SfxTokenizerModule = {
  T5Tokenizer: new (tokenizerJSON: unknown, tokenizerConfig: Record<string, unknown>) => { encode: (text: string) => number[] };
};

/**
 * The port's `tokenizer.json` (google-t5/t5-base's Unigram model) through transformers.js's `T5Tokenizer`, which
 * appends `</s>` itself; `padTokens` makes it the conditioner's fixed 64.
 */
export async function loadSfxTokenizer(module: SfxTokenizerModule, file: string): Promise<(text: string) => SfxTokens> {
  const json = JSON.parse(await readFile(file, 'utf8')) as unknown;
  const tokenizer = new module.T5Tokenizer(json, { eos_token: '</s>', pad_token: '<pad>', unk_token: '<unk>', model_max_length: 512 });
  return (text) => padTokens(tokenizer.encode(text));
}
