/**
 * Bounded FIFO for input typed before a session's pty is ready (Phase 51
 * Theme E).
 *
 * `term.onData` reads `stateRef.current`, assigned during render — so
 * between `pty.create` resolving and the next React render, the ref can
 * still read `'starting'` and every keystroke in that window used to be
 * dropped with no queue at all. This buffers it instead, flushed the moment
 * the session's pty binds.
 *
 * Bounded, not unbounded: a session that never binds must not accumulate a
 * hostage buffer. Chunks — not raw bytes — are the drop unit on overflow,
 * because `onData` delivers whole, already-decoded strings; slicing a chunk
 * mid-character to hit an exact byte count risks cutting a multi-byte UTF-8
 * sequence in half. Dropping the OLDEST chunk, not the newest: silently
 * losing the user's most recent keystroke is the failure they would
 * actually notice, where losing something typed a moment earlier reads as
 * "the terminal was still warming up."
 */
export type InputQueue = {
  /** Buffer a chunk, dropping the oldest already-buffered chunk(s) if this would exceed the cap. */
  push: (data: string) => void;
  /** Return every buffered chunk, concatenated in arrival order, and empty the queue. */
  flush: () => string;
  /** Discard everything buffered without sending it — a session that ends before binding. */
  clear: () => void;
  /** Bytes currently buffered — for tests and diagnostics, not a public API surface otherwise. */
  readonly byteLength: number;
};

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export function createInputQueue(capBytes: number): InputQueue {
  let chunks: string[] = [];
  let bytes = 0;

  return {
    push: (data: string) => {
      chunks.push(data);
      bytes += byteLength(data);
      while (bytes > capBytes && chunks.length > 0) {
        bytes -= byteLength(chunks.shift()!);
      }
    },
    flush: () => {
      const joined = chunks.join('');
      chunks = [];
      bytes = 0;
      return joined;
    },
    clear: () => {
      chunks = [];
      bytes = 0;
    },
    get byteLength() {
      return bytes;
    },
  };
}
