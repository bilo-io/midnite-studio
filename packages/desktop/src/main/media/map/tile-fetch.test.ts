import { describe, expect, it } from 'vitest';

import { createTileFetcher, MAX_PER_HOST } from './tile-fetch';

const bytes = new Uint8Array([1, 2, 3]);
const okResponse = () => new Response(bytes, { status: 200 });
const base = { cache: null, userAgent: 'test', sleep: async () => undefined, random: () => 0.5 };

describe('createTileFetcher', () => {
  it('keeps at most 6 requests in flight per host', async () => {
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const fetcher = createTileFetcher({
      ...base,
      fetch: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => releases.push(resolve));
        inFlight--;
        return okResponse();
      },
    });
    const all = Array.from({ length: 7 }, (_, i) => fetcher.fetch(`s/1/0/${i}.png`, `https://h.test/${i}`));
    await new Promise((r) => setTimeout(r, 5));
    expect(inFlight).toBe(MAX_PER_HOST);
    while (releases.length) {
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 1));
    }
    const results = await Promise.all(all);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('retries 503 twice then succeeds', async () => {
    let calls = 0;
    const fetcher = createTileFetcher({ ...base, fetch: async () => (++calls < 3 ? new Response(null, { status: 503 }) : okResponse()) });
    expect((await fetcher.fetch('s/1/0/0.png', 'https://h.test/a')).ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('does not retry 404 and remembers it', async () => {
    let calls = 0;
    const fetcher = createTileFetcher({ ...base, fetch: async () => (calls++, new Response(null, { status: 404 })) });
    expect(await fetcher.fetch('s/1/0/0.png', 'https://h.test/a')).toMatchObject({ ok: false, status: 404 });
    await fetcher.fetch('s/1/0/0.png', 'https://h.test/a');
    expect(calls).toBe(1);
  });

  it('resolves aborted when aborted mid-retry', async () => {
    const controller = new AbortController();
    const fetcher = createTileFetcher({
      ...base,
      fetch: async () => new Response(null, { status: 503 }),
      sleep: () => new Promise(() => undefined),
    });
    const pending = fetcher.fetch('s/1/0/0.png', 'https://h.test/a', { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, status: 'aborted' });
  });

  it('shares one upstream fetch between concurrent gets of one tile', async () => {
    let calls = 0;
    const fetcher = createTileFetcher({ ...base, fetch: async () => (calls++, okResponse()) });
    await Promise.all([fetcher.fetch('s/1/0/0.png', 'https://h.test/a'), fetcher.fetch('s/1/0/0.png', 'https://h.test/a')]);
    expect(calls).toBe(1);
  });
});
