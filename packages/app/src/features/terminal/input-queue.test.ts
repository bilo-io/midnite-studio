import { describe, expect, it } from 'vitest';

import { createInputQueue } from './input-queue';

describe('createInputQueue', () => {
  it('arrives in order after a bind (flush)', () => {
    const queue = createInputQueue(1024);
    queue.push('h');
    queue.push('e');
    queue.push('llo');

    expect(queue.flush()).toBe('hello');
  });

  it('is empty after a flush, and a later flush returns nothing new', () => {
    const queue = createInputQueue(1024);
    queue.push('a');
    expect(queue.flush()).toBe('a');
    expect(queue.flush()).toBe('');
    expect(queue.byteLength).toBe(0);
  });

  it('drops the oldest chunk first once the cap is exceeded', () => {
    const queue = createInputQueue(5);
    queue.push('abc'); // 3 bytes
    queue.push('de'); // +2 = 5, at the cap
    queue.push('f'); // +1 = 6, over cap: drop oldest ('abc') to fit

    expect(queue.flush()).toBe('def');
  });

  it('drops as many oldest chunks as needed for one large push', () => {
    const queue = createInputQueue(4);
    queue.push('a');
    queue.push('b');
    queue.push('cccc'); // pushes bytes to 6; both 'a' and 'b' must go to get back under 4

    expect(queue.flush()).toBe('cccc');
  });

  it('never trims mid-chunk — a chunk is kept whole or dropped whole', () => {
    const queue = createInputQueue(3);
    queue.push('ab'); // 2 bytes, under cap
    queue.push('cd'); // +2 = 4, over cap by 1 — 'ab' drops entirely, not just its last byte

    expect(queue.flush()).toBe('cd');
  });

  it('a session that ends without binding discards the queue rather than leaking it', () => {
    const queue = createInputQueue(1024);
    queue.push('typed before the pty ever bound');

    queue.clear();

    expect(queue.flush()).toBe('');
    expect(queue.byteLength).toBe(0);
  });

  it('reports its current buffered byte length, counting multi-byte characters correctly', () => {
    const queue = createInputQueue(1024);
    queue.push('é'); // 2 bytes in UTF-8, not 1
    expect(queue.byteLength).toBe(2);
  });
});
