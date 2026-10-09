import { describe, expect, it, vi } from 'vitest';

import type { MusicEngine } from './engine';
import { createMusicgenProvider } from './provider';

const prompt = { title: '', style: ['lofi', 'piano'], lyrics: '', instrumental: true, durationS: 50, count: 2 };

function fakeEngine() {
  const calls: { prompt: string; seconds: number }[] = [];
  const engine: MusicEngine = {
    render: async (req, opts) => {
      calls.push(req);
      opts.onProgress(0.5);
      return { samples: new Float32Array(Math.round(req.seconds * 100)).fill(0.5), sampleRate: 100 };
    },
  };
  return { engine, calls };
}

describe('musicgen provider', () => {
  it('renders every section of every variant and lands one wav per variant', async () => {
    const { engine, calls } = fakeEngine();
    const audio: unknown[] = [];
    const progress = vi.fn();
    const out = await createMusicgenProvider(engine).generate(prompt, {
      signal: new AbortController().signal,
      sources: [],
      readFile: async () => Buffer.alloc(0),
      onAudio: (a) => audio.push(a),
      onProgress: progress,
    });

    expect(calls).toHaveLength(4); // 2 variants x 2 sections for 50 s
    expect(calls.every((c) => c.prompt === 'lofi, piano' && c.seconds <= 30)).toBe(true);
    expect(out).toHaveLength(2);
    expect(audio).toHaveLength(2);
    expect(out[0]).toMatchObject({ ext: 'wav' });
    expect(out[0]!.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    const fractions = progress.mock.calls.map(([p]) => p.fraction as number);
    expect(fractions.at(-1)).toBe(1);
    expect(Math.max(...fractions.slice(0, -1))).toBeLessThan(1);
    expect(progress.mock.calls[0]![0].stage).toBe('Rendering variant 1/2, section 1/2');
  });

  it('uses per-section captions from the prompt', async () => {
    const { engine, calls } = fakeEngine();
    await createMusicgenProvider(engine).generate(
      { ...prompt, count: 1, sections: ['soft intro', 'full band'] },
      { signal: new AbortController().signal, sources: [], readFile: async () => Buffer.alloc(0) },
    );
    expect(calls.map((c) => c.prompt)).toEqual(['soft intro', 'full band']);
  });

  it('stops with "cancelled" when the signal aborts between sections', async () => {
    const controller = new AbortController();
    const engine: MusicEngine = {
      render: async (req) => {
        controller.abort();
        return { samples: new Float32Array(10), sampleRate: 100 + req.seconds * 0 };
      },
    };
    await expect(
      createMusicgenProvider(engine).generate(prompt, { signal: controller.signal, sources: [], readFile: async () => Buffer.alloc(0) }),
    ).rejects.toThrow('cancelled');
  });
});
