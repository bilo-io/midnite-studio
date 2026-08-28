/**
 * Holds pty bytes that arrive while a snapshot request is in flight.
 *
 * A live session's reveal writes the current ring buffer before attaching to
 * the `pty:data` stream's ongoing writes — but the stream subscription in
 * `use-terminal-ipc.ts` is live before the snapshot answers, so a chunk can
 * arrive mid-request. Dropping it would lose output; writing it before the
 * snapshot lands would put it out of order. Held chunks are released, in
 * arrival order, once the snapshot itself has been written.
 *
 * Chosen over unsubscribing from `pty:data` for the request's duration:
 * missing an `onExit` in that window would leave the row live forever, since
 * nothing would ever re-subscribe it.
 */
export function createReplayGate(): {
  hold: (bytes: Uint8Array) => void;
  release: (write: (bytes: Uint8Array) => void) => void;
  readonly open: boolean;
} {
  let open = false;
  let held: Uint8Array[] = [];

  return {
    hold(bytes) {
      if (open) return;
      held.push(bytes);
    },
    release(write) {
      if (open) return;
      open = true;
      for (const bytes of held) write(bytes);
      held = [];
    },
    get open() {
      return open;
    },
  };
}
