import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUseSim, type SimFrame, type SimWorkerLike } from './use-sim';
import type { SimIn } from './types';

class FakeWorker implements SimWorkerLike {
  static all: FakeWorker[] = [];
  posts: SimIn[] = [];
  terminated = false;
  onmessage: SimWorkerLike['onmessage'] = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: SimIn) {
    this.posts.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  types() {
    return this.posts.map((p) => p.type);
  }
}

const useSim = createUseSim(() => new FakeWorker());
const mount = (onFrame = vi.fn()) => renderHook(() => useSim('life', { params: { w: 4 }, seed: 7, onFrame }));

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn();
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('useSim', () => {
  it('inits the worker with the kind, params and seed, and play posts play', () => {
    const { result } = mount();
    const w = FakeWorker.all[0]!;
    expect(w.posts[0]).toEqual({ type: 'init', kind: 'life', params: { w: 4 }, seed: 7 });
    act(() => result.current.play());
    expect(w.types()).toContain('play');
    expect(result.current.playing).toBe(true);
  });

  it('pauses on hidden and resumes on visible only when it was playing', () => {
    const { result } = mount();
    const w = FakeWorker.all[0]!;
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(w.types()).not.toContain('pause');
    expect(w.types()).not.toContain('play');

    act(() => result.current.play());
    act(() => setVisibility('hidden'));
    expect(w.types().at(-1)).toBe('pause');
    act(() => setVisibility('visible'));
    expect(w.types().at(-1)).toBe('play');
  });

  it('posts a frame buffer back as return after the draw callback', () => {
    const order: string[] = [];
    const onFrame = vi.fn((_frame: SimFrame) => void order.push('draw'));
    mount(onFrame);
    const w = FakeWorker.all[0]!;
    const buffer = new ArrayBuffer(16);
    const post = w.postMessage.bind(w);
    w.postMessage = (m) => {
      if (m.type === 'return') order.push('return');
      post(m);
    };
    act(() => w.onmessage?.({ data: { type: 'frame', tick: 3, length: 2, buffer, stats: {} } }));
    expect(order).toEqual(['draw', 'return']);
    expect(onFrame.mock.calls[0]![0]).toMatchObject({ tick: 3 });
    expect(w.posts.at(-1)).toEqual({ type: 'return', buffer });
  });

  it('reset re-inits and stops playback; serialise resolves with the worker state', async () => {
    const { result } = mount();
    const w = FakeWorker.all[0]!;
    act(() => result.current.play());
    act(() => result.current.reset());
    expect(w.posts.filter((p) => p.type === 'init')).toHaveLength(2);
    expect(result.current.playing).toBe(false);
    const state = result.current.serialise();
    act(() => w.onmessage?.({ data: { type: 'state', state: { a: 1 } } }));
    await expect(state).resolves.toEqual({ a: 1 });
  });
});
