import { describe, expect, it, vi } from 'vitest';

import { createModelThumbs, THUMB_CACHE_MAX, type ThumbRenderer } from './model-thumbs';

const okModel = (name: string) => ({ ok: true as const, value: { name, bytes: 3, data: btoa('abc') } });

function setup(over: { load?: (name: string) => Promise<ReturnType<typeof okModel> | { ok: false; kind: 'error'; message: string }> } = {}) {
  let running = 0;
  let overlap = false;
  const rendered: number[] = [];
  const stub: ThumbRenderer = {
    async render(glb) {
      running++;
      if (running > 1) overlap = true;
      await new Promise((r) => setTimeout(r, 0));
      running--;
      rendered.push(glb.byteLength);
      return `data:image/png;base64,${rendered.length}`;
    },
    dispose: vi.fn(),
  };
  const load = vi.fn(over.load ?? (async (name: string) => okModel(name)));
  const renderer = vi.fn(() => stub);
  const thumbs = createModelThumbs({ load, renderer });
  return { thumbs, load, renderer, stub, rendered, overlapped: () => overlap };
}

describe('createModelThumbs (Phase 139 Theme B)', () => {
  it('loads once for two gets of the same name and sha (B1)', async () => {
    const { thumbs, load, renderer } = setup();
    const [a, b] = await Promise.all([thumbs.get('house', 's1'), thumbs.get('house', 's1')]);
    expect(a).toBe(b);
    expect(await thumbs.get('house', 's1')).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the sha changes (B2)', async () => {
    const { thumbs, load } = setup();
    const first = await thumbs.get('house', 's1');
    const second = await thumbs.get('house', 's2');
    expect(second).not.toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used on the 201st distinct thumbnail (B3)', async () => {
    const { thumbs, load } = setup();
    for (let i = 0; i <= THUMB_CACHE_MAX; i++) await thumbs.get(`m${i}`, 's');
    expect(load).toHaveBeenCalledTimes(THUMB_CACHE_MAX + 1);
    await thumbs.get('m1', 's');
    expect(load).toHaveBeenCalledTimes(THUMB_CACHE_MAX + 1);
    await thumbs.get('m0', 's');
    expect(load).toHaveBeenCalledTimes(THUMB_CACHE_MAX + 2);
  }, 30000);

  it('renders serially (B4)', async () => {
    const { thumbs, rendered, overlapped } = setup();
    await Promise.all(['a', 'b', 'c', 'd'].map((n) => thumbs.get(n, 's')));
    expect(rendered).toHaveLength(4);
    expect(overlapped()).toBe(false);
  });

  it('answers null for a failed load once and does not retry it', async () => {
    const { thumbs, load } = setup({ load: async () => ({ ok: false, kind: 'error', message: 'nope' }) });
    expect(await thumbs.get('bad', 's')).toBeNull();
    expect(await thumbs.get('bad', 's')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('answers null when the renderer throws, and clear() disposes the renderer', async () => {
    const { thumbs, stub } = setup();
    vi.spyOn(stub, 'render').mockRejectedValueOnce(new Error('gl'));
    expect(await thumbs.get('x', 's')).toBeNull();
    thumbs.clear();
    expect(stub.dispose).toHaveBeenCalledTimes(1);
  });
});
