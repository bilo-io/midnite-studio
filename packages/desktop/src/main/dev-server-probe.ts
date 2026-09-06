import { connect } from 'node:net';

/**
 * "Is anything listening on this loopback port?" — the one thing dev-server
 * detection needs main for (Phase 71 Theme C).
 *
 * A renderer cannot open a TCP socket, and the obvious alternative — a `fetch`
 * against `http://127.0.0.1:<port>` from the renderer — is both slower (it
 * waits for a response, not a handshake) and reachable by any page-side
 * redirect. A bare connect-and-drop answers the only question being asked.
 *
 * Two constraints keep this from being a port scanner, and both are
 * deliberate: the host is hard-coded here, and the port range is bound in
 * `BrowserDevServerProbeRequest`'s schema rather than checked in the handler.
 *
 * It answers a question. Nothing in this phase navigates on the answer —
 * detection is a hint, offered as a tile and a palette row the user chooses.
 */

/** Loopback, hard-coded. Not a parameter, so no caller can widen it. */
const LOOPBACK_HOST = '127.0.0.1';

/**
 * How long a connection gets before it counts as "nothing there".
 *
 * A dev server on the same machine either completes a TCP handshake in low
 * single-digit milliseconds or is not running. The deadline exists for the
 * third case — a port held by something that accepts nothing and never
 * refuses, where the OS would otherwise leave the connect pending for a
 * platform-dependent minute or more.
 */
export const DEV_SERVER_PROBE_TIMEOUT_MS = 250;

/** The slice of `net.connect` this module uses — the seam a test substitutes. */
export type ProbeSocket = {
  once: (event: string, listener: () => void) => unknown;
  destroy: () => unknown;
};
export type ProbeConnect = (port: number, host: string) => ProbeSocket;

export function probeLoopbackPort(
  port: number,
  options: { connect?: ProbeConnect; timeoutMs?: number } = {},
): Promise<boolean> {
  const open = options.connect ?? (connect as unknown as ProbeConnect);
  const timeoutMs = options.timeoutMs ?? DEV_SERVER_PROBE_TIMEOUT_MS;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    /*
      Explicitly `undefined` rather than a bare declaration, and `let` rather
      than `const`: the socket construction below can throw, and its `catch`
      calls `done` — which reads `timer` — before the timer is ever set. A
      `const` declared after `done` would make that path a TDZ ReferenceError.
    */
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    let socket: ProbeSocket | undefined;

    /*
      Every exit runs through here: a refused connection, an accepted one and
      a hung one all end with the socket destroyed and the promise resolved
      exactly once. `resolve(false)` rather than a rejection throughout — "no
      dev server on 3000" is the ordinary answer to this question, not an
      error, and a probe that threw would make a caller's `Promise.all` over
      five candidate ports fail on the first closed one.
    */
    const done = (listening: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // A socket that failed to construct has nothing to tear down.
      }
      resolve(listening);
    };

    try {
      socket = open(port, LOOPBACK_HOST);
    } catch {
      done(false);
      return;
    }

    timer = setTimeout(() => done(false), timeoutMs);
    // Never hold the process open for a probe — this can be in flight when the
    // window closes, and main should not wait 250 ms to quit because of it.
    (timer as unknown as { unref?: () => void }).unref?.();

    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
