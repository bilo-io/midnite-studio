import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { createQueuedSocketWriter } from './socket-write-queue';

/**
 * A `net.Socket`-shaped stub whose `write()` return value is scriptable — a
 * queue of one-shot answers, falling back to `nextWriteOk` once it empties.
 */
function fakeSocket() {
  const emitter = new EventEmitter();
  const writes: Uint8Array[] = [];
  let nextWriteOk = true;
  const scripted: boolean[] = [];

  return {
    socket: Object.assign(emitter, {
      write: vi.fn((buf: Uint8Array) => {
        writes.push(buf);
        return scripted.length > 0 ? scripted.shift() : nextWriteOk;
      }),
    }) as unknown as import('node:net').Socket,
    writes,
    setNextWriteOk: (ok: boolean) => {
      nextWriteOk = ok;
    },
    /** Answer the next N `write()` calls with these values, in order. */
    scriptWrites: (...answers: boolean[]) => {
      scripted.push(...answers);
    },
    emitDrain: () => emitter.emit('drain'),
  };
}

const chunk = (s: string) => new TextEncoder().encode(s);
const text = (buf: Uint8Array) => new TextDecoder().decode(buf);

describe('createQueuedSocketWriter', () => {
  it('writes immediately while the socket is not backpressured', () => {
    const { socket, writes } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, { capBytes: 1024, onOverflow: vi.fn() });

    writer.write(chunk('a'));
    writer.write(chunk('b'));

    expect(writes.map(text)).toEqual(['a', 'b']);
  });

  it('a write against a saturated socket queues rather than disappearing', () => {
    const { socket, writes, setNextWriteOk } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, { capBytes: 1024, onOverflow: vi.fn() });

    setNextWriteOk(false);
    writer.write(chunk('first')); // Attempted — socket.write() is called and returns false.
    writer.write(chunk('second')); // Now queued without ever reaching socket.write().
    writer.write(chunk('third'));

    expect(writes.map(text)).toEqual(['first']);
  });

  it("'drain' releases the queue in order", () => {
    const { socket, writes, setNextWriteOk, emitDrain } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, { capBytes: 1024, onOverflow: vi.fn() });

    setNextWriteOk(false);
    writer.write(chunk('first'));
    writer.write(chunk('second'));
    writer.write(chunk('third'));
    expect(writes.map(text)).toEqual(['first']);

    setNextWriteOk(true);
    emitDrain();

    expect(writes.map(text)).toEqual(['first', 'second', 'third']);
  });

  it('a drain that itself lands on a socket filling right back up waits for the next one', () => {
    const { socket, writes, setNextWriteOk, scriptWrites, emitDrain } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, { capBytes: 1024, onOverflow: vi.fn() });

    setNextWriteOk(false);
    writer.write(chunk('first'));
    writer.write(chunk('second'));
    writer.write(chunk('third'));
    expect(writes.map(text)).toEqual(['first']);

    // `false` from `write()` means "this chunk was accepted, but wait before
    // writing more" — not "retry it". "second" and "third" both go out on
    // this flush; "third" itself returns `false`, so the queue (now empty)
    // waits for the next 'drain' before anything further is attempted.
    scriptWrites(true, false);
    emitDrain();
    expect(writes.map(text)).toEqual(['first', 'second', 'third']);

    setNextWriteOk(true);
    writer.write(chunk('fourth')); // queued, not written immediately — still draining
    expect(writes.map(text)).toEqual(['first', 'second', 'third']);

    emitDrain();
    expect(writes.map(text)).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('the bounded queue drops the oldest chunk and reports the overflow', () => {
    const { socket, setNextWriteOk } = fakeSocket();
    const onOverflow = vi.fn();
    const writer = createQueuedSocketWriter(socket, { capBytes: 10, onOverflow });

    setNextWriteOk(false);
    writer.write(chunk('12345')); // attempted, queue empty after (write() called)
    writer.write(chunk('67890')); // queued: 5 bytes
    writer.write(chunk('ABCDE')); // queued: 10 bytes — still within cap
    writer.write(chunk('FGHIJ')); // over cap (15 > 10) — drops the oldest queued chunk

    expect(onOverflow).toHaveBeenCalledWith(5);
  });

  it('a multi-megabyte paste arrives byte-complete and in order', () => {
    const { socket, writes, setNextWriteOk, emitDrain } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, {
      capBytes: 8 * 1024 * 1024,
      onOverflow: vi.fn(),
    });

    // A "paste" arriving as many small chunks, as `writePty` would deliver one
    // per IPC message rather than as a single call.
    const original = Array.from({ length: 2000 }, (_, i) => `line ${i}\n`).join('');
    const chunks = original.match(/.{1,50}/gs) ?? [];

    setNextWriteOk(false);
    for (const c of chunks) writer.write(chunk(c));

    setNextWriteOk(true);
    emitDrain();

    expect(writes.map(text).join('')).toBe(original);
  });

  it('dispose stops watching drain and clears whatever was queued', () => {
    const { socket, writes, setNextWriteOk, emitDrain } = fakeSocket();
    const writer = createQueuedSocketWriter(socket, { capBytes: 1024, onOverflow: vi.fn() });

    setNextWriteOk(false);
    writer.write(chunk('first'));
    writer.write(chunk('queued'));

    writer.dispose();
    setNextWriteOk(true);
    emitDrain();

    // Nothing further was flushed after dispose — the queued chunk is gone.
    expect(writes.map(text)).toEqual(['first']);
  });
});
