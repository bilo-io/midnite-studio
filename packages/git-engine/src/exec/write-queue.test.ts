import { describe, expect, it } from 'vitest';

import { WriteQueue } from './write-queue';

/** Reaches the private tail map — the thing under test is that it stays empty. */
function chainCount(queue: WriteQueue): number {
  return (queue as unknown as { chains: Map<string, unknown> }).chains.size;
}

describe('WriteQueue', () => {
  it('evicts a repo key from the chain map once its writes settle', async () => {
    const queue = new WriteQueue();

    await queue.run('repo-a', () => Promise.resolve('ok'));

    expect(chainCount(queue)).toBe(0);
  });

  it('evicts after a rejected task too, without breaking later writes for the same key', async () => {
    const queue = new WriteQueue();

    await expect(queue.run('repo-a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(chainCount(queue)).toBe(0);

    await expect(queue.run('repo-a', () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(chainCount(queue)).toBe(0);
  });

  it('does not grow without bound across many repos opened and closed over a session', async () => {
    const queue = new WriteQueue();

    for (let i = 0; i < 50; i += 1) {
      await queue.run(`repo-${i}`, () => Promise.resolve(i));
    }

    expect(chainCount(queue)).toBe(0);
  });

  it('keeps a later write queued while an earlier one for the same key is still in flight', async () => {
    const queue = new WriteQueue();
    let resolveFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const first = queue.run('repo-a', () => firstGate);

    const second = queue.run('repo-a', () => Promise.resolve('second'));
    expect(chainCount(queue)).toBe(1);

    resolveFirst?.();
    await first;
    expect(await second).toBe('second');
    expect(chainCount(queue)).toBe(0);
  });
});
