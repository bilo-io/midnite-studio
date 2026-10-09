import { SPRITE_RENDER_NO_WINDOW, type SpriteRenderedFrame, type SpriteRenderRequestEvent } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRenderRelay, RENDER_JOB_GONE } from './render-relay';

const event = (jobId = 'job-1'): SpriteRenderRequestEvent => ({
  jobId,
  repoId: 'repo',
  model: { project: 'characters', path: 'knight/model.json' },
  frameSize: [64, 64],
  directions: ['s', 'w', 'n', 'e'],
  settings: { camera: 'side', elevationDeg: 0, azimuthDeg: 0, shading: 'lit', outline: false, supersample: 4 },
  clips: [{ name: 'walk', frames: 4, fps: 8, loop: 'loop' }],
});
const frame = (index: number, dir = 's'): SpriteRenderedFrame => ({ clip: 'walk', dir, index, png: 'AAAA' });

describe('render relay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fails the job with the literal message when no window answers within 10 s', async () => {
    const relay = createRenderRelay({ send: () => true });
    const done = relay.render(event(), { signal: new AbortController().signal, onFrame: async () => {} });
    const caught = done.catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(relay.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toBe(SPRITE_RENDER_NO_WINDOW);
    expect(SPRITE_RENDER_NO_WINDOW).toBe('Rendering from 3D needs the Midnite Studio window open.');
  });

  it('fails at once when there is no window to ask', async () => {
    const relay = createRenderRelay({ send: () => false });
    await expect(relay.render(event(), { signal: new AbortController().signal, onFrame: async () => {} })).rejects.toThrow(SPRITE_RENDER_NO_WINDOW);
  });

  it('a ready reply stops the timeout; batches append frames in order; done finishes the job', async () => {
    const seen: string[] = [];
    const relay = createRenderRelay({ send: () => true });
    let finished = false;
    const done = relay
      .render(event(), {
        signal: new AbortController().signal,
        onFrame: async (f) => {
          await Promise.resolve();
          seen.push(`${f.dir}/${f.index}`);
        },
      })
      .then(() => (finished = true));
    expect(relay.ready('job-1').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(finished).toBe(false);
    // Posted back to back: the second batch still waits for the first.
    const a = relay.frames({ jobId: 'job-1', frames: [frame(0), frame(1)], total: 4, done: false });
    const b = relay.frames({ jobId: 'job-1', frames: [frame(2), frame(3)], done: true });
    expect((await a).ok).toBe(true);
    expect((await b).ok).toBe(true);
    await done;
    expect(seen).toEqual(['s/0', 's/1', 's/2', 's/3']);
    expect(finished).toBe(true);
    expect((await relay.frames({ jobId: 'job-1', frames: [], done: true })).ok).toBe(false);
  });

  it('reports the batch totals, notes and clip counts', async () => {
    const onBatch = vi.fn();
    const relay = createRenderRelay({ send: () => true });
    const done = relay.render(event(), { signal: new AbortController().signal, onFrame: async () => {}, onBatch });
    await relay.frames({ jobId: 'job-1', frames: [], total: 8, notes: ['No matching animation: jump'], clips: [{ name: 'walk', frames: 8, fps: 10 }], done: true });
    await done;
    expect(onBatch).toHaveBeenCalledWith({ total: 8, notes: ['No matching animation: jump'], clips: [{ name: 'walk', frames: 8, fps: 10 }] });
  });

  it('a renderer error ends the job with it', async () => {
    const relay = createRenderRelay({ send: () => true });
    const done = relay.render(event(), { signal: new AbortController().signal, onFrame: async () => {} });
    await relay.frames({ jobId: 'job-1', frames: [], done: true, error: 'WebGL is unavailable.' });
    await expect(done).rejects.toThrow('WebGL is unavailable.');
  });

  it('cancel drops the job, and the next batch is refused so the renderer stops', async () => {
    const relay = createRenderRelay({ send: () => true });
    const controller = new AbortController();
    const done = relay.render(event(), { signal: controller.signal, onFrame: async () => {} });
    relay.ready('job-1');
    controller.abort();
    await expect(done).rejects.toThrow('cancelled');
    const answer = await relay.frames({ jobId: 'job-1', frames: [frame(0)], done: false });
    expect(answer).toMatchObject({ ok: false, message: RENDER_JOB_GONE });
  });
});
