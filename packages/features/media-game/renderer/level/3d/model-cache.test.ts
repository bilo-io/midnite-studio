// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { ModelCache } from './model-cache';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ModelCache (Phase 136 Theme F)', () => {
  it('loads a model once, on first request, and shares it', async () => {
    const load = vi.fn(async (name: string) => ({ name }));
    const onChange = vi.fn();
    const cache = new ModelCache({ load, dispose: vi.fn(), onChange, now: () => 0 });
    expect(cache.request('house')).toBeNull();
    expect(cache.request('house')).toBeNull();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    const a = cache.request('house');
    expect(a).toEqual({ name: 'house' });
    expect(cache.request('house')).toBe(a);
    expect(cache.loaded).toBe(1);
  });

  it('disposes a model nobody asked for during the grace period, and keeps one in use', async () => {
    let t = 0;
    const dispose = vi.fn();
    const cache = new ModelCache({ load: async (n: string) => n, dispose, now: () => t, disposeAfterMs: 30_000 });
    cache.request('a');
    cache.request('b');
    await flush();
    cache.request('a');
    cache.request('b');
    t = 20_000;
    cache.request('a');
    t = 40_000;
    expect(cache.sweep()).toEqual(['b']);
    expect(dispose).toHaveBeenCalledWith('b');
    expect(cache.loaded).toBe(1);
    // Asking again reloads it.
    expect(cache.request('b')).toBeNull();
  });

  it('a failed load stays failed (the objects draw as boxes) and is not retried', async () => {
    const load = vi.fn(async () => {
      throw new Error('bad glb');
    });
    const cache = new ModelCache({ load, dispose: vi.fn(), now: () => 0 });
    cache.request('x');
    await flush();
    expect(cache.failed('x')).toBe(true);
    expect(cache.request('x')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('close disposes what is loaded and drops a load that lands afterwards', async () => {
    let finish: (v: string) => void = () => undefined;
    const dispose = vi.fn();
    const cache = new ModelCache({ load: (n: string) => (n === 'slow' ? new Promise<string>((r) => (finish = r)) : Promise.resolve(n)), dispose, now: () => 0 });
    cache.request('fast');
    cache.request('slow');
    await flush();
    cache.close();
    expect(dispose).toHaveBeenCalledWith('fast');
    finish('slow');
    await flush();
    expect(dispose).toHaveBeenCalledWith('slow');
  });
});
