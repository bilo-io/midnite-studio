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
 *
 * Built for a StrictMode remount originally, this is also the whole
 * mechanism behind Phase 84 Theme E's rehydrate: a session disposed by
 * `session-mount-policy.ts` while hidden keeps producing bytes into main's
 * scrollback ring the entire time (nothing about disposing the REACT
 * component touches the pty or its subscription there), so a revealed
 * session's remount replays that ring exactly the way a StrictMode remount
 * always has — see `replayLiveHandoff` below, which is the actual mount-time
 * sequencing `terminal-view.tsx` runs this gate through.
 */
export type ReplayGate = {
  hold: (bytes: Uint8Array) => void;
  release: (write: (bytes: Uint8Array) => void) => void;
  readonly open: boolean;
};

export function createReplayGate(): ReplayGate {
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

/**
 * Routes one live pty chunk through a gate: held while the gate is closed
 * (a snapshot fetch is in flight), written straight through once it's open.
 *
 * Extracted out of `terminal-view.tsx`'s own `write` callback so the ordering
 * invariant it depends on — a chunk that arrives before the gate opens is
 * never lost and never written ahead of the snapshot it followed — has a
 * direct test (`replay-gate.test.ts`) against the exact function the
 * component calls, not a parallel reimplementation of its shape.
 */
export function gateLiveWrite(
  gate: Pick<ReplayGate, 'open' | 'hold'> | null,
  bytes: Uint8Array,
  writeToTerm: (bytes: Uint8Array) => void,
): void {
  if (gate && !gate.open) {
    gate.hold(bytes);
    return;
  }
  writeToTerm(bytes);
}

/**
 * The whole rehydrate hand-off (Phase 84 Theme E.3): fetch the current
 * scrollback snapshot, write it, THEN release whatever live chunks arrived
 * while that fetch was in flight — never the other order. Releasing first
 * would let a live chunk race ahead of the snapshot bytes it causally
 * followed; fetching without a gate at all would drop, or duplicate, any
 * chunk broadcast in the gap between subscribing to `pty:data` and the
 * snapshot response landing.
 *
 * Returns the gate the caller wires its OWN live-write path (`gateLiveWrite`
 * above) through — this function only owns getting it open again, not
 * routing individual chunks, since `terminal-view.tsx` already has its own
 * `write` callback doing that against a ref this gate is assigned into
 * before the fetch even starts.
 *
 * `isCancelled` reads a ref the caller flips in its own cleanup — a session
 * whose xterm was already disposed (StrictMode's dev-only double-invoke, or
 * a fresh `session-mount-policy.ts` eviction before this fetch resolves)
 * must never write into it.
 */
export function replayLiveHandoff(
  fetchSnapshot: () => Promise<Uint8Array>,
  onSnapshot: (bytes: Uint8Array) => void,
  write: (bytes: Uint8Array) => void,
  isCancelled: () => boolean,
): ReplayGate {
  const gate = createReplayGate();
  void fetchSnapshot().then((bytes) => {
    if (isCancelled()) return;
    onSnapshot(bytes);
    gate.release(write);
  });
  return gate;
}
