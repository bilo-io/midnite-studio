// @vitest-environment node
import { SFX_LATENT_CHANNELS, SFX_LATENT_LENGTH, SFX_SAMPLE_RATE } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createSfxOrtInference, type SfxOrtModule, type SfxOrtSession } from './ort-inference';
import { pingPongSchedule } from './sampler';
import { encodeStereoWav, finishSfx, framesFor, padTokens, rms, runSfxPipeline, sliceLatent, type SfxInference } from './pipeline';

const LATENT = SFX_LATENT_CHANNELS * SFX_LATENT_LENGTH;

/** Graphs that record what they were given and return deterministic shapes. */
function fakeInference(overrides: Partial<SfxInference> = {}) {
  const calls = { encode: [] as number[], velocity: [] as Array<{ t: number; crossSum: number }>, decode: [] as number[] };
  const inference: SfxInference = {
    encode: async (tokens, seconds) => {
      calls.encode.push(seconds);
      const marker = Number(tokens.ids[0]);
      return { cross: new Float32Array(65 * 768).fill(marker), global: new Float32Array(768).fill(seconds) };
    },
    velocity: async (x, t, cross) => {
      calls.velocity.push({ t, crossSum: cross[0]! });
      return new Float32Array(x.length);
    },
    decode: async (latent, frames) => {
      calls.decode.push(frames);
      expect(latent.length).toBe(SFX_LATENT_CHANNELS * frames);
      const n = frames * 2048;
      const out = new Float32Array(2 * n);
      for (let i = 0; i < out.length; i += 1) out[i] = Math.sin(i / 10) * 3; // too loud on purpose
      return out;
    },
    ...overrides,
  };
  return { inference, calls };
}

const tokenize = (text: string) => padTokens([text.length + 100, 1]);
const take = { prompt: 'laser zap', negativePrompt: '', seconds: 2, steps: 8, cfgScale: 1, seed: 7 };

describe('padTokens', () => {
  it('pads with 0 to 64 and masks only the real tokens', () => {
    const { ids, mask } = padTokens([6124, 3, 1629, 102, 1]);
    expect(ids.length).toBe(64);
    expect(Array.from(ids.slice(0, 6))).toEqual([6124n, 3n, 1629n, 102n, 1n, 0n]);
    expect(mask.reduce((a, b) => a + b, 0n)).toBe(5n);
  });

  it('truncates a long prompt but keeps </s> last', () => {
    const { ids, mask } = padTokens(Array.from({ length: 80 }, (_, i) => i + 10));
    expect(ids[63]).toBe(1n);
    expect(ids[62]).toBe(72n);
    expect(mask.every((m) => m === 1n)).toBe(true);
  });
});

describe('latent framing', () => {
  it('decodes only the frames the clip needs, plus a margin, never past the latent', () => {
    expect(framesFor(1)).toBe(Math.ceil(SFX_SAMPLE_RATE / 2048) + 4);
    expect(framesFor(11.8)).toBe(SFX_LATENT_LENGTH);
  });

  it('slices the first columns of every channel', () => {
    const latent = Float32Array.from({ length: LATENT }, (_, i) => i);
    const cut = sliceLatent(latent, 3);
    expect(cut.length).toBe(SFX_LATENT_CHANNELS * 3);
    expect(Array.from(cut.subarray(0, 3))).toEqual([0, 1, 2]);
    expect(Array.from(cut.subarray(3, 6))).toEqual([256, 257, 258]);
    expect(sliceLatent(latent, SFX_LATENT_LENGTH)).toBe(latent);
  });
});

describe('finishSfx', () => {
  it('trims to the clip, peak-normalises to the ceiling, fades both ends and leaves silence silent', () => {
    const n = SFX_SAMPLE_RATE;
    const planar = new Float32Array(2 * n).fill(4);
    const [l, r] = finishSfx(planar, 0.5);
    expect(l!.length).toBe(SFX_SAMPLE_RATE / 2);
    expect(Math.max(...l!)).toBeCloseTo(0.95, 5);
    expect(l![0]).toBe(0);
    expect(r![r!.length - 1]).toBe(0);
    const [quiet] = finishSfx(new Float32Array(2 * n), 0.5);
    expect(rms([quiet!])).toBe(0);
  });

  it('turns NaN into silence rather than writing garbage', () => {
    const planar = new Float32Array(2 * 1000).fill(0.5);
    planar[500] = Number.NaN;
    const [l] = finishSfx(planar, 1000 / SFX_SAMPLE_RATE);
    expect(l!.every(Number.isFinite)).toBe(true);
  });
});

describe('runSfxPipeline', () => {
  it('encodes once, runs one DiT pass per step at CFG 1, decodes the trimmed latent', async () => {
    const { inference, calls } = fakeInference();
    const stages: string[] = [];
    const out = await runSfxPipeline(inference, tokenize, take, { onStage: (s) => stages.push(s) });
    expect(calls.encode).toEqual([2]);
    expect(calls.velocity.map((c) => c.t)).toEqual(Array.from(pingPongSchedule(8).subarray(0, 8)));
    expect(calls.decode).toEqual([framesFor(2)]);
    expect(out.sampleRate).toBe(SFX_SAMPLE_RATE);
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0]!.length).toBe(2 * SFX_SAMPLE_RATE);
    expect(new Set(stages)).toEqual(new Set(['encoding', 'sampling', 'decoding']));
  });

  it('with guidance, runs a second pass per step on zeroed cross-attention when there is no negative prompt', async () => {
    const { inference, calls } = fakeInference();
    await runSfxPipeline(inference, tokenize, { ...take, steps: 2, cfgScale: 3 });
    expect(calls.velocity).toHaveLength(4);
    expect(calls.velocity.map((c) => c.crossSum)).toEqual([109, 0, 109, 0]);
  });

  it('with guidance and a negative prompt, the unconditional pass reads the negative prompt', async () => {
    const { inference, calls } = fakeInference();
    await runSfxPipeline(inference, tokenize, { ...take, steps: 1, cfgScale: 2, negativePrompt: 'music' });
    expect(calls.encode).toEqual([2, 2]);
    expect(calls.velocity.map((c) => c.crossSum)).toEqual([109, 105]);
  });

  it('ignores the negative prompt at CFG 1 (the distilled default)', async () => {
    const { inference, calls } = fakeInference();
    await runSfxPipeline(inference, tokenize, { ...take, negativePrompt: 'music' });
    expect(calls.encode).toEqual([2]);
  });

  it('is reproducible per seed', async () => {
    const seen: number[][] = [];
    const record = (seed: number) =>
      runSfxPipeline(
        fakeInference({
          velocity: async (x) => {
            seen.push(Array.from(x.subarray(0, 4)));
            return new Float32Array(x.length);
          },
        }).inference,
        tokenize,
        { ...take, steps: 1, seed },
      );
    await record(5);
    await record(5);
    await record(6);
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).not.toEqual(seen[2]);
  });

  it('stops when cancelled', async () => {
    const { inference } = fakeInference();
    let n = 0;
    await expect(runSfxPipeline(inference, tokenize, take, { isCancelled: () => ++n > 3 })).rejects.toThrow('cancelled');
  });
});

describe('encodeStereoWav', () => {
  it('writes an interleaved 16-bit stereo RIFF header and samples', () => {
    const wav = encodeStereoWav([Float32Array.of(1, 0), Float32Array.of(-1, 0.5)], 44_100);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(44_100);
    expect(wav.readUInt32LE(28)).toBe(44_100 * 4);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect([wav.readInt16LE(44), wav.readInt16LE(46), wav.readInt16LE(48), wav.readInt16LE(50)]).toEqual([32767, -32768, 0, 16384]);
  });
});

describe('createSfxOrtInference', () => {
  function fakeOrt() {
    const created: Array<{ path: string; options: unknown }> = [];
    const runs: Array<{ file: string; feeds: Record<string, { type: string; dims: readonly number[] }> }> = [];
    const outputs: Record<string, Record<string, { type: string; data: Float32Array; dims: number[] }>> = {
      'cond.onnx': { cross: { type: 'float32', data: new Float32Array(65 * 768), dims: [1, 65, 768] }, global: { type: 'float32', data: new Float32Array(768), dims: [1, 768] } },
      'dit.onnx': { v: { type: 'float32', data: new Float32Array(LATENT), dims: [1, 64, 256] } },
      'dec.onnx': { audio: { type: 'float32', data: new Float32Array(2 * 2048), dims: [1, 2, 2048] } },
    };
    const ort: SfxOrtModule = {
      InferenceSession: {
        create: vi.fn(async (path: string, options?: Record<string, unknown>) => {
          created.push({ path, options });
          const file = path.split('/').pop()!;
          const session: SfxOrtSession = {
            inputNames: [],
            outputNames: Object.keys(outputs[file]!),
            run: async (feeds) => {
              runs.push({ file, feeds: feeds as never });
              return outputs[file]!;
            },
          };
          return session;
        }),
      },
      Tensor: class {
        constructor(
          public type: string,
          public data: unknown,
          public dims: readonly number[],
        ) {}
      } as unknown as SfxOrtModule['Tensor'],
    };
    return { ort, created, runs };
  }

  it('feeds each graph the names and shapes the export declares, and creates each session once with no CPU arena', async () => {
    const { ort, created, runs } = fakeOrt();
    const inference = createSfxOrtInference(ort, (f) => `/models/${f}`);
    const cond = await inference.encode(padTokens([5, 1]), 3);
    await inference.velocity(new Float32Array(LATENT), 0.5, cond.cross, cond.global);
    await inference.velocity(new Float32Array(LATENT), 0.2, cond.cross, cond.global);
    await inference.decode(new Float32Array(64), 1);
    expect(created.map((c) => c.path)).toEqual(['/models/cond.onnx', '/models/dit.onnx', '/models/dec.onnx']);
    expect(created[0]!.options).toMatchObject({ enableCpuMemArena: false });
    const shapes = runs.map((r) => [r.file, Object.fromEntries(Object.entries(r.feeds).map(([k, v]) => [k, [v.type, ...v.dims]]))]);
    expect(shapes[0]).toEqual(['cond.onnx', { input_ids: ['int64', 1, 64], attention_mask: ['int64', 1, 64], seconds_total: ['float32', 1] }]);
    expect(shapes[1]).toEqual(['dit.onnx', { x: ['float32', 1, 64, 256], t: ['float32', 1], cross: ['float32', 1, 65, 768], global: ['float32', 1, 768] }]);
    expect(shapes[3]).toEqual(['dec.onnx', { z: ['float32', 1, 64, 1] }]);
  });

  it('retries a session whose load failed', async () => {
    const { ort } = fakeOrt();
    const real = ort.InferenceSession.create;
    let first = true;
    ort.InferenceSession.create = async (path, options) => {
      if (first) {
        first = false;
        throw new Error('ENOENT');
      }
      return real(path, options);
    };
    const inference = createSfxOrtInference(ort, (f) => f);
    await expect(inference.decode(new Float32Array(64), 1)).rejects.toThrow('ENOENT');
    await expect(inference.decode(new Float32Array(64), 1)).resolves.toBeInstanceOf(Float32Array);
  });
});
