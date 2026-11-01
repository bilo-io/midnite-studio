import {
  SFX_CHANNELS,
  SFX_DOWNSAMPLING,
  SFX_LATENT_CHANNELS,
  SFX_LATENT_LENGTH,
  SFX_SAMPLE_RATE,
  SFX_TOKEN_LENGTH,
  type SfxGenerateStage,
} from '@midnite/studio-shared';

import { applyGuidance, createGaussian, pingPongSchedule, samplePingPong } from './sampler';

/**
 * One Stable Audio Open Small take, end to end, over three injected graphs (`ort-inference.ts` binds them to
 * `onnxruntime-node`; the tests bind fakes):
 *
 *   prompt ─▶ T5 tokens ─▶ cond (T5 + seconds) ─▶ dit × steps (ping-pong) ─▶ dec ─▶ trim, normalise, fade
 *
 * The DiT always runs over the full 256-frame latent (the model was trained that way, and `seconds_total`
 * conditioning is what makes it place the sound in the first N seconds); only the frames the clip needs, plus
 * a little margin for the decoder's receptive field, are decoded.
 */
export type SfxTokens = { ids: BigInt64Array; mask: BigInt64Array };

export type SfxInference = {
  /** `cond.onnx`: tokens + seconds → cross-attention conditioning `[1, 65, 768]` and global `[1, 768]`. */
  encode: (tokens: SfxTokens, seconds: number) => Promise<{ cross: Float32Array; global: Float32Array }>;
  /** `dit.onnx`: one velocity prediction over `[1, 64, 256]`. */
  velocity: (x: Float32Array, t: number, cross: Float32Array, global: Float32Array) => Promise<Float32Array>;
  /** `dec.onnx`: `[1, 64, frames]` latent → `[1, 2, frames · 2048]` planar stereo. */
  decode: (latent: Float32Array, frames: number) => Promise<Float32Array>;
};

export type SfxTake = { prompt: string; negativePrompt: string; seconds: number; steps: number; cfgScale: number; seed: number };

export type SfxPipelineHooks = {
  onStage?: (stage: SfxGenerateStage, fraction?: number) => void;
  isCancelled?: () => boolean;
};

/** Extra latent frames decoded past the clip's end, so the cut is not inside the decoder's edge. */
export const DECODE_MARGIN_FRAMES = 4;

/**
 * Token ids (with the closing `</s>` the T5 tokenizer appends) padded with 0 or truncated to 64, keeping
 * `</s>` last — what `T5Conditioner` does with `truncation=True, padding="max_length"`.
 */
export function padTokens(ids: readonly number[], length: number = SFX_TOKEN_LENGTH, eos = 1): SfxTokens {
  const kept = ids.length > length ? [...ids.slice(0, length - 1), eos] : [...ids];
  const out = new BigInt64Array(length);
  const mask = new BigInt64Array(length);
  kept.forEach((id, i) => {
    out[i] = BigInt(id);
    mask[i] = 1n;
  });
  return { ids: out, mask };
}

/** Latent frames to decode for `seconds` of audio (clip + margin, capped at the full latent). */
export function framesFor(seconds: number): number {
  return Math.min(SFX_LATENT_LENGTH, Math.ceil((seconds * SFX_SAMPLE_RATE) / SFX_DOWNSAMPLING) + DECODE_MARGIN_FRAMES);
}

/** The first `frames` columns of a `[64, 256]` latent, as `[64, frames]`. */
export function sliceLatent(latent: Float32Array, frames: number): Float32Array {
  if (frames === SFX_LATENT_LENGTH) return latent;
  const out = new Float32Array(SFX_LATENT_CHANNELS * frames);
  for (let c = 0; c < SFX_LATENT_CHANNELS; c += 1) {
    out.set(latent.subarray(c * SFX_LATENT_LENGTH, c * SFX_LATENT_LENGTH + frames), c * frames);
  }
  return out;
}

/**
 * Planar stereo → the clip: trimmed to `seconds`, peak-normalised to `ceiling` (the model's raw output level
 * varies a lot between prompts), with 5 ms fades so the cut does not click. Silence is left silent.
 */
export function finishSfx(planar: Float32Array, seconds: number, ceiling = 0.95): Float32Array[] {
  const total = planar.length / SFX_CHANNELS;
  const n = Math.min(total, Math.round(seconds * SFX_SAMPLE_RATE));
  const channels = Array.from({ length: SFX_CHANNELS }, (_, c) => Float32Array.from(planar.subarray(c * total, c * total + n)));
  let peak = 0;
  for (const ch of channels) for (const v of ch) if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 1e-6 ? ceiling / peak : 1;
  const fade = Math.min(Math.round(SFX_SAMPLE_RATE * 0.005), Math.floor(n / 2));
  for (const ch of channels) {
    for (let i = 0; i < n; i += 1) {
      let g = gain;
      if (i < fade) g *= i / fade;
      const tail = n - 1 - i;
      if (tail < fade) g *= tail / fade;
      const v = ch[i]!;
      ch[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v * g)) : 0;
    }
  }
  return channels;
}

/** Root-mean-square over every channel — what the e2e check and the sidecar use to tell a take from silence. */
export function rms(channels: readonly Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const ch of channels) {
    for (const v of ch) sum += v * v;
    count += ch.length;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

export async function runSfxPipeline(
  inference: SfxInference,
  tokenize: (text: string) => SfxTokens | Promise<SfxTokens>,
  take: SfxTake,
  hooks: SfxPipelineHooks = {},
): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const cancelled = () => {
    if (hooks.isCancelled?.()) throw new Error('cancelled');
  };
  hooks.onStage?.('encoding');
  const cond = await inference.encode(await tokenize(take.prompt), take.seconds);
  const guided = take.cfgScale > 1;
  // stable-audio-tools' unconditional branch: an all-zero cross-attention input, or the negative prompt's
  // conditioning when one is given. The global (seconds) embedding is the same for both.
  const uncondCross = guided
    ? take.negativePrompt.trim()
      ? (await inference.encode(await tokenize(take.negativePrompt), take.seconds)).cross
      : new Float32Array(cond.cross.length)
    : null;
  cancelled();

  const size = SFX_LATENT_CHANNELS * SFX_LATENT_LENGTH;
  const gaussian = createGaussian(take.seed);
  const initial = gaussian(new Float32Array(size));
  hooks.onStage?.('sampling', 0);
  const latent = await samplePingPong({
    initial,
    schedule: pingPongSchedule(take.steps),
    noise: gaussian,
    isCancelled: hooks.isCancelled,
    onStep: (done, total) => hooks.onStage?.('sampling', done / total),
    velocity: async (x, t) => {
      const v = await inference.velocity(x, t, cond.cross, cond.global);
      if (!uncondCross) return v;
      const u = await inference.velocity(x, t, uncondCross, cond.global);
      return applyGuidance(v, u, take.cfgScale);
    },
  });
  cancelled();

  hooks.onStage?.('decoding');
  const frames = framesFor(take.seconds);
  const planar = await inference.decode(sliceLatent(latent, frames), frames);
  return { channels: finishSfx(planar, take.seconds), sampleRate: SFX_SAMPLE_RATE };
}

/** 16-bit PCM WAV, interleaved from planar channels. */
export function encodeStereoWav(channels: readonly Float32Array[], sampleRate: number): Buffer {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * count * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(count, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * count * 2, 28);
  buf.writeUInt16LE(count * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const v = Math.max(-1, Math.min(1, channels[c]![i]!));
      buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), offset);
      offset += 2;
    }
  }
  return buf;
}
