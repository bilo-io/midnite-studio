import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import * as net from 'node:net';
import { dirname, join } from 'node:path';

import { SCROLLBACK_BYTES, perfEnabled } from '@midnite/studio-shared';

import {
  createFrameDecoder,
  encodeControl,
  encodeData,
  PROTOCOL,
  type ControlMessage,
} from './protocol';
import { staleBrokerMessage } from './staleness';

export interface IPtyLike {
  readonly pid: number;
  onData: (listener: (data: string) => void) => { dispose?: () => void };
  onExit: (listener: (e: { exitCode: number; signal?: number }) => void) => { dispose?: () => void };
  write: (data: string) => void;
  resize: (columns: number, rows: number) => void;
  kill: (signal?: string) => void;
}

export type SpawnPtyFn = (
  file: string,
  args: string[] | string,
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  },
) => IPtyLike;

export type BrokerServerOptions = {
  socketPath: string;
  pidPath?: string;
  userDataDir: string;
  appVersion?: string;
  /** Fingerprint of the build this broker was started from; echoed in `hello`. */
  buildId?: string;
  /**
   * Answers "why can this broker no longer spawn", or `null` while it can —
   * see `staleness.ts`. Consulted before every `create` and echoed as `stale`
   * in the `hello` reply so a client can decline a dead-on-arrival broker.
   */
  isStale?: () => string | null;
  spawnPty?: SpawnPtyFn;
  now?: () => number;
  log?: (message: string) => void;
  idleGraceMs?: number;
};

export type BrokerServer = {
  socketPath: string;
  pidPath: string;
  server: net.Server;
  closed: Promise<void>;
  close: () => Promise<void>;
  sessionCount: () => number;
  clientCount: () => number;
};

type Session = {
  id: string;
  sessionId: string;
  pty: IPtyLike;
  pendingInput: string | null;
  cols: number;
  rows: number;
  cwd: string;
};

const RESET_SEQUENCE = new Uint8Array([0x1b, 0x5b, 0x30, 0x6d]);

function lineStartAtOrAfter(bytes: Uint8Array, from: number): number {
  if (from === 0 || bytes[from - 1] === 0x0a) return from;
  const newline = bytes.indexOf(0x0a, from);
  return newline === -1 ? from : newline + 1;
}

export function trimScrollback(bytes: Uint8Array, limit = SCROLLBACK_BYTES): Uint8Array {
  if (bytes.length <= limit) return bytes;
  const excess = bytes.length - limit;
  const start = lineStartAtOrAfter(bytes, excess);
  const out = new Uint8Array(RESET_SEQUENCE.length + (bytes.length - start));
  out.set(RESET_SEQUENCE, 0);
  out.set(bytes.subarray(start), RESET_SEQUENCE.length);
  return out;
}

function safeId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function createBrokerServer(options: BrokerServerOptions): BrokerServer {
  const {
    userDataDir,
    appVersion = '0.0.0',
    buildId = 'unknown',
    isStale = () => null,
    spawnPty,
    log = () => {},
    idleGraceMs = 10 * 60 * 1000,
  } = options;

  // Mutable: `retire` moves this broker to a `-retired-<pid>` path.
  let socketPath = options.socketPath;
  let pidPath = options.pidPath ?? `${socketPath}.pid`;
  const scrollbackDir = join(userDataDir, 'scrollback');

  const socketDir = dirname(socketPath);
  mkdirSync(socketDir, { mode: 0o700, recursive: true });

  // Clean up stale socket/pidfile if present
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
      log(`[broker] unlinked stale socket at ${socketPath}`);
    } catch {
      // Ignored
    }
  }
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignored
    }
  }

  const sessions = new Map<string, Session>();
  const scrollbackBySession = new Map<string, Uint8Array>();
  const clients = new Set<net.Socket>();

  let idleTimer: NodeJS.Timeout | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let isClosing = false;

  let resolveClosed: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  function appendScrollback(sessionId: string, chunk: Uint8Array): void {
    const previous = scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
    const combined = new Uint8Array(previous.length + chunk.length);
    combined.set(previous, 0);
    combined.set(chunk, previous.length);

    const limit = SCROLLBACK_BYTES * 2;
    const kept = combined.length > limit ? combined.subarray(combined.length - limit) : combined;
    scrollbackBySession.set(sessionId, kept);
  }

  /**
   * Per-pty output, coalesced into one frame per {@link COALESCE_MS} — Phase 36
   * Theme G, and the gate's most emphatic result.
   *
   * This function used to be called once per pty chunk, and so did
   * `appendScrollback` above it. Under `yes` — the chattiest thing a terminal can
   * hold — that is 7 073 chunks a second, and the broker sat at **96.8% of one
   * core** to service it. Two costs, not one, and the second is the larger:
   *
   *   - one `encodeData` and one socket `write` per chunk, where a 16ms window
   *     would have carried ~113 chunks in a single frame; and
   *   - `appendScrollback` reallocating and copying the ENTIRE retained buffer on
   *     every chunk. Capped at `SCROLLBACK_BYTES * 2`, so each of those 7 073
   *     copies moves up to a couple of megabytes — which is where the 227 MB RSS
   *     and the GC pressure behind it came from.
   *
   * Coalescing fixes both at once, which is why the buffer sits in front of the
   * scrollback append as well as the broadcast: one concat and one write per
   * window instead of per chunk.
   *
   * ORDERING is the whole correctness argument. Buffered bytes must reach a
   * client before anything that logically follows them, so every path that can
   * observe or end a stream flushes first: a `snapshot` or `attach` (or a client
   * would read history 16ms stale), the periodic `flush` to disk, `pty.onExit`
   * (data must precede the exit frame), and shutdown. Per-pty rather than one
   * global buffer, because two ptys' bytes must never interleave into one frame.
   */
  const COALESCE_MS = 16;

  type Pending = { chunks: Uint8Array[]; bytes: number; timer: NodeJS.Timeout };
  const pendingOutput = new Map<string, Pending>();
  /** Which session each pty's buffered bytes belong to, for the scrollback append. */
  const sessionForPty = new Map<string, string>();

  function flushPtyOutput(ptyId: string): void {
    const pending = pendingOutput.get(ptyId);
    if (!pending) return;
    pendingOutput.delete(ptyId);
    clearTimeout(pending.timer);

    const merged = new Uint8Array(pending.bytes);
    let at = 0;
    for (const chunk of pending.chunks) {
      merged.set(chunk, at);
      at += chunk.length;
    }

    const sessionId = sessionForPty.get(ptyId);
    // One pty per session throughout, so this append cannot interleave with
    // another pty's. Were two live ptys ever to share a `sessionId`, their bytes
    // would reach this buffer in *timer* order rather than arrival order — an
    // assumption the per-chunk append did not need, so it is stated here.
    if (sessionId !== undefined) appendScrollback(sessionId, merged);
    broadcastData(ptyId, merged);
  }

  /** Flush every pty — before a snapshot, a disk flush, or shutdown. */
  function flushAllPtyOutput(): void {
    for (const ptyId of [...pendingOutput.keys()]) flushPtyOutput(ptyId);
  }

  function queuePtyOutput(ptyId: string, sessionId: string, chunk: Uint8Array): void {
    sessionForPty.set(ptyId, sessionId);
    const existing = pendingOutput.get(ptyId);
    if (existing) {
      existing.chunks.push(chunk);
      existing.bytes += chunk.length;
      return;
    }
    const timer = setTimeout(() => flushPtyOutput(ptyId), COALESCE_MS);
    // A 16ms timer must never be the thing keeping this process alive.
    timer.unref?.();
    pendingOutput.set(ptyId, { chunks: [chunk], bytes: chunk.length, timer });
  }

  function broadcastControl(msg: ControlMessage): void {
    const buf = encodeControl(msg);
    for (const client of clients) {
      if (!client.destroyed && client.writable) {
        client.write(buf);
      }
    }
  }

  /**
   * How much this function is actually doing, when asked — Phase 36 Theme G.
   *
   * `broadcastData` is one socket write per pty chunk with no coalescing, and a
   * chatty pty produces a lot of chunks. Whether that *costs* anything was
   * folklore, so the counter is here and the verdict is in the phase doc. Behind
   * `MSTUDIO_PERF=1` and a no-op otherwise: two integer increments per call when
   * the flag is set, nothing measurable when it is not, and no branch at all in
   * the hot loop.
   *
   * Reported on a timer rather than per call, because a log line per write is a
   * far bigger cost than the write it is measuring.
   */
  const perfCounters = perfEnabled(process.env)
    ? (() => {
        let chunks = 0;
        let writes = 0;
        let bytes = 0;
        const started = Date.now();
        const report = setInterval(() => {
          const secs = (Date.now() - started) / 1000;
          log(
            `[perf] broker broadcast chunks=${chunks} writes=${writes} bytes=${bytes} ` +
              `chunks/s=${(chunks / secs).toFixed(1)} writes/s=${(writes / secs).toFixed(1)}`,
          );
        }, 1000);
        report.unref?.();
        return {
          count: (clientCount: number, byteCount: number): void => {
            chunks += 1;
            writes += clientCount;
            // Bytes as they go OUT, so this is comparable with `writes` rather
            // than with `chunks`: one frame written to three clients is three
            // writes and three frames' worth of bytes on the wire.
            bytes += byteCount * clientCount;
          },
        };
      })()
    : null;

  function broadcastData(ptyId: string, data: Uint8Array): void {
    const buf = encodeData(ptyId, data);
    let written = 0;
    for (const client of clients) {
      if (!client.destroyed && client.writable) {
        client.write(buf);
        written += 1;
      }
    }
    perfCounters?.count(written, buf.length);
  }

  function checkIdle(): void {
    if (isClosing) return;
    if (clients.size === 0 && sessions.size === 0) {
      if (!idleTimer) {
        idleTimer = setTimeout(() => {
          log('[broker] idle timeout reached with 0 sessions and 0 clients, exiting');
          void closeServer();
        }, idleGraceMs);
        idleTimer.unref?.();
      }
    } else {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }
  }

  async function flushAllScrollback(): Promise<void> {
    try {
      await mkdir(scrollbackDir, { recursive: true });
      for (const [sessionId, bytes] of scrollbackBySession.entries()) {
        const file = join(scrollbackDir, `${safeId(sessionId)}.bin`);
        await writeFile(file, trimScrollback(bytes));
      }
    } catch (err) {
      log(`[broker] error flushing scrollback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Periodic flush every 15s
  flushTimer = setInterval(() => {
    // Buffered bytes first: this interval is the crash-safety net, and it can
    // only save what has actually reached the scrollback.
    flushAllPtyOutput();
    void flushAllScrollback();
  }, 15_000);
  flushTimer.unref?.();

  const onConnection = (socket: net.Socket): void => {
    clients.add(socket);
    checkIdle();

    const decoder = createFrameDecoder();

    socket.on('data', (chunk) => {
      let frames;
      try {
        frames = decoder.push(chunk);
      } catch (err) {
        log(`[broker] error decoding frame: ${err instanceof Error ? err.message : String(err)}`);
        socket.destroy();
        return;
      }

      for (const frame of frames) {
        if (frame.type === 0x00) {
          handleControlMessage(socket, frame.message);
        } else if (frame.type === 0x01) {
          // Client sending pty input
          const session = sessions.get(frame.ptyId);
          if (session) {
            try {
              session.pty.write(new TextDecoder().decode(frame.data));
            } catch {
              // PTY may have exited
            }
          }
        }
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      checkIdle();
    });

    socket.on('error', () => {
      clients.delete(socket);
      checkIdle();
    });
  };

  let server = net.createServer(onConnection);

  function listenOn(path: string): void {
    server.listen(path, () => {
      try {
        chmodSync(path, 0o600);
        writeFileSync(pidPath, `${process.pid}\n`, { mode: 0o600 });
        log(`[broker] listening on ${path} (pid ${process.pid})`);
      } catch (err) {
        log(`[broker] error configuring socket permissions: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  /**
   * Hand the socket path to a successor while keeping every session and every
   * connected client. Closing the listener is what frees the path — Node
   * unlinks a Unix socket's file when its server closes, which is also why the
   * successor must not bind until this has happened: had it bound first, this
   * close would have deleted ITS socket. Existing connections are untouched by
   * `server.close()`; only new ones need the new path.
   */
  function retire(): string {
    const retiredPath = socketPath.replace(/(\.sock)?$/, `-retired-${process.pid}.sock`);
    const old = server;
    old.close();
    try {
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch {
      // Ignored
    }
    socketPath = retiredPath;
    pidPath = `${retiredPath}.pid`;
    server = net.createServer(onConnection);
    listenOn(retiredPath);
    log(`[broker] retired to ${retiredPath}`);
    return retiredPath;
  }

  function handleControlMessage(socket: net.Socket, msg: ControlMessage): void {
    switch (msg.t) {
      case 'hello': {
        if (msg.protocol !== PROTOCOL) {
          const reply = encodeControl({
            t: 'reply',
            id: msg.id,
            ok: false,
            code: 'protocol',
            message: `Protocol mismatch: expected ${PROTOCOL}, got ${msg.protocol}`,
          });
          socket.write(reply, () => {
            socket.destroy();
          });
          return;
        }
        socket.write(
          encodeControl({
            t: 'reply',
            id: msg.id,
            ok: true,
            protocol: PROTOCOL,
            pid: process.pid,
            appVersion,
            buildId,
            stale: isStale() !== null,
          }),
        );
        break;
      }

      case 'list': {
        const list = [...sessions.values()].map((s) => ({
          ptyId: s.id,
          sessionId: s.sessionId,
          pid: s.pty.pid,
          cols: s.cols,
          rows: s.rows,
          cwd: s.cwd,
        }));
        socket.write(
          encodeControl({
            t: 'reply',
            id: msg.id,
            ok: true,
            sessions: list,
          }),
        );
        break;
      }

      case 'create': {
        if (!spawnPty) {
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              code: 'spawn-failed',
              message: 'spawnPty not provided to broker server',
            }),
          );
          return;
        }

        /*
          Checked BEFORE the spawn, not only after it fails: a stale broker's
          spawn-helper may be missing (a hard failure) or merely replaced by a
          different build's (a spawn that "works" against code this process
          never loaded). Either way the answer is the same — hand off to a
          fresh broker — and the check is one stat per new terminal.
        */
        const staleBefore = isStale();
        if (staleBefore !== null) {
          log(`[broker] refusing create: ${staleBefore}`);
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              code: 'stale-broker',
              message: staleBrokerMessage(staleBefore),
            }),
          );
          return;
        }

        const id = randomUUID();
        const { sessionId, cwd, cols, rows, env, initialInput } = msg;

        // Resolve shell
        let shellFile = process.env['SHELL'] ?? '/bin/zsh';
        let shellArgs: string[] = ['-l'];
        if (process.platform === 'win32') {
          shellFile = process.env['COMSPEC'] ?? 'cmd.exe';
          shellArgs = [];
        } else if (!existsSync(shellFile)) {
          shellFile = '/bin/sh';
        }

        try {
          const pty = spawnPty(shellFile, shellArgs, {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: {
              ...env,
              TERM_PROGRAM: 'midnite-studio',
              GIT_TERMINAL_PROMPT: '1',
            },
          });

          const session: Session = {
            id,
            sessionId,
            pty,
            pendingInput: initialInput ?? null,
            cols,
            rows,
            cwd,
          };
          sessions.set(id, session);

          let hasSentExit = false;

          pty.onData((data) => {
            if (hasSentExit) return;
            const bytes = new TextEncoder().encode(data);

            /*
              Still per chunk, and it has to be: this types the agent's command in
              as soon as the shell says something, and waiting out a 16ms window
              first would be a visible stutter on the one keystroke-shaped thing
              the broker does. It fires once and clears itself.
            */
            if (session.pendingInput) {
              const input = session.pendingInput;
              session.pendingInput = null;
              try {
                pty.write(input);
              } catch {
                // Ignore
              }
            }

            // Scrollback append and broadcast both happen on the flush, not here.
            queuePtyOutput(id, sessionId, bytes);
          });

          pty.onExit(({ exitCode, signal }) => {
            if (hasSentExit) return;
            hasSentExit = true;
            // Whatever the process printed on its way out must reach the client
            // BEFORE the exit frame, or a terminal shows an exited session with
            // its last line missing.
            flushPtyOutput(id);
            sessionForPty.delete(id);
            sessions.delete(id);
            broadcastControl({
              t: 'exit',
              ptyId: id,
              exitCode,
              signal,
            });
            checkIdle();
          });

          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: true,
              ptyId: id,
              pid: pty.pid,
            }),
          );
          checkIdle();
        } catch (err) {
          // The bundle may have been replaced between the check above and the
          // spawn; a failure that coincides with staleness is reported as such.
          const staleAfter = isStale();
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              ...(staleAfter !== null
                ? { code: 'stale-broker', message: staleBrokerMessage(staleAfter) }
                : { code: 'spawn-failed', message: err instanceof Error ? err.message : String(err) }),
            }),
          );
        }
        break;
      }

      case 'resize': {
        const session = sessions.get(msg.ptyId);
        if (session) {
          session.cols = Math.max(1, msg.cols);
          session.rows = Math.max(1, msg.rows);
          try {
            session.pty.resize(session.cols, session.rows);
          } catch {
            // Ignore
          }
          socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
        } else {
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              code: 'unknown-pty',
              message: `Unknown ptyId: ${msg.ptyId}`,
            }),
          );
        }
        break;
      }

      case 'kill': {
        const session = sessions.get(msg.ptyId);
        if (session) {
          flushPtyOutput(msg.ptyId);
          sessionForPty.delete(msg.ptyId);
          sessions.delete(msg.ptyId);
          try {
            session.pty.kill();
          } catch {
            // Ignore
          }
          socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
          checkIdle();
        } else {
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              code: 'unknown-pty',
              message: `Unknown ptyId: ${msg.ptyId}`,
            }),
          );
        }
        break;
      }

      case 'snapshot': {
        /*
          Deliberately does NOT flush the coalescing buffer, and that is the
          opposite of what an earlier draft of this did.

          `flushPtyOutput` broadcasts as well as appending, and `broadcastData`
          writes to every socket in `clients` — *including* the one that just
          asked for the snapshot. So flushing here writes a data frame carrying
          bytes X and then answers with a scrollback that also contains X. The
          renderer's replay gate (`terminal-view.tsx`) holds data frames that
          arrive while a snapshot is in flight and releases them after writing
          the snapshot, so those bytes get written twice — on every mount of a
          live, producing terminal: a panel reveal, a renderer reload rebind, a
          FAB loop tab.

          Left unflushed, the answer is up to 16 ms stale and the buffered bytes
          arrive as an ordinary data frame afterwards — which is precisely the
          case the replay gate exists to order correctly. Staleness the gate
          already handles beats duplication it cannot detect.
        */
        let bytes = scrollbackBySession.get(msg.sessionId);
        if (!bytes) {
          const file = join(scrollbackDir, `${safeId(msg.sessionId)}.bin`);
          try {
            bytes = new Uint8Array(readFileSync(file));
          } catch {
            bytes = new Uint8Array(0);
          }
        }
        const trimmed = trimScrollback(bytes);
        socket.write(
          encodeControl({
            t: 'reply',
            id: msg.id,
            ok: true,
            bytesBase64: Buffer.from(trimmed).toString('base64'),
          }),
        );
        break;
      }

      case 'flush': {
        // Same reason, one layer down: what has not been appended yet cannot be
        // written to disk, and this flush is the crash-safety net.
        flushAllPtyOutput();
        void flushAllScrollback().then(() => {
          socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
        });
        break;
      }

      case 'detach': {
        socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
        break;
      }

      case 'retire': {
        const retiredPath = retire();
        socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true, socketPath: retiredPath }));
        break;
      }

      case 'shutdown': {
        socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
        void closeServer();
        break;
      }

      default: {
        socket.write(
          encodeControl({
            t: 'reply',
            id: (msg as { id?: number }).id,
            ok: false,
            code: 'protocol',
            message: `Unknown message type`,
          }),
        );
      }
    }
  }

  async function closeServer(): Promise<void> {
    if (isClosing) return closed;
    isClosing = true;

    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    // Last chance for the coalescing window: whatever is buffered has to reach
    // the scrollback before it is written, or a clean shutdown loses up to 16ms
    // of every session's final output.
    flushAllPtyOutput();
    await flushAllScrollback();

    for (const client of clients) {
      client.destroy();
    }
    clients.clear();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    try {
      if (existsSync(socketPath)) unlinkSync(socketPath);
    } catch {
      // Ignored
    }
    try {
      if (existsSync(pidPath)) unlinkSync(pidPath);
    } catch {
      // Ignored
    }

    resolveClosed();
    return closed;
  }

  listenOn(socketPath);

  return {
    get socketPath() {
      return socketPath;
    },
    get pidPath() {
      return pidPath;
    },
    get server() {
      return server;
    },
    closed,
    close: closeServer,
    sessionCount: () => sessions.size,
    clientCount: () => clients.size,
  };
}
