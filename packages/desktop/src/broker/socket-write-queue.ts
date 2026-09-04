import type * as net from 'node:net';

/**
 * Backpressure for a `net.Socket`, on the *input* direction (Phase 51 Theme F).
 *
 * `socket.write()`'s own return value was ignored everywhere it was called —
 * `broker-client.ts`'s `writePty` and `server.ts`'s `broadcastControl` alike —
 * so a socket whose kernel buffer filled (a burst of pty input, or a client
 * slow to read its own control replies) just kept accumulating writes inside
 * Node's own unbounded internal buffer with nothing watching how large that
 * got. This makes the queue explicit, and bounded: `false` from `write()`
 * means "queue, don't call write() again until 'drain'", and a queue that
 * keeps growing past `capBytes` — the socket's other end has stopped reading
 * entirely, not just fallen behind — drops the *oldest* queued chunk and
 * reports it, rather than growing forever.
 *
 * The broker's own 16ms output coalescer (`queuePtyOutput`/`flushPtyOutput`
 * in `server.ts`) is a different thing entirely — pty *output*, batched
 * before it is ever written — and is untouched by this.
 */
export type QueuedSocketWriter = {
  /** Queue if backpressured or already queuing, else write immediately. */
  write: (buf: Uint8Array) => void;
  /** Stop watching this socket and drop whatever is still queued. */
  dispose: () => void;
};

export type SocketWriteQueueOptions = {
  /** Total queued bytes above which the oldest queued chunk is dropped. */
  capBytes: number;
  /** Called with the size of a chunk dropped for being over `capBytes`. */
  onOverflow: (droppedBytes: number) => void;
};

export function createQueuedSocketWriter(
  socket: net.Socket,
  { capBytes, onOverflow }: SocketWriteQueueOptions,
): QueuedSocketWriter {
  const queue: Uint8Array[] = [];
  let queuedBytes = 0;
  /** Set once a `write()` call has returned `false`, cleared on `'drain'`. */
  let draining = false;

  function enqueue(buf: Uint8Array): void {
    queue.push(buf);
    queuedBytes += buf.length;
    while (queuedBytes > capBytes && queue.length > 0) {
      const dropped = queue.shift();
      if (dropped === undefined) break;
      queuedBytes -= dropped.length;
      onOverflow(dropped.length);
    }
  }

  /** Drain the queue in order, stopping the moment the socket asks to wait again. */
  function flush(): void {
    while (queue.length > 0) {
      const next = queue[0];
      if (next === undefined) break;
      let ok: boolean;
      try {
        ok = socket.write(next);
      } catch {
        // Socket gone — `dispose()` (from the caller's own close/error
        // handler) clears what's left; nothing more to flush here.
        return;
      }
      queue.shift();
      queuedBytes -= next.length;
      if (!ok) {
        draining = true;
        return;
      }
    }
  }

  const onDrain = (): void => {
    draining = false;
    flush();
  };
  socket.on('drain', onDrain);

  return {
    write(buf) {
      if (draining || queue.length > 0) {
        enqueue(buf);
        return;
      }
      let ok: boolean;
      try {
        ok = socket.write(buf);
      } catch {
        // Socket already gone; nothing to queue for a target that can never drain.
        return;
      }
      if (!ok) draining = true;
    },
    dispose() {
      socket.off('drain', onDrain);
      queue.length = 0;
      queuedBytes = 0;
    },
  };
}
