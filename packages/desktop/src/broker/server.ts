import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import * as net from 'node:net';
import { dirname, join } from 'node:path';

import { SCROLLBACK_BYTES } from '@midnite/studio-shared';

import {
  createFrameDecoder,
  encodeControl,
  encodeData,
  PROTOCOL,
  type ControlMessage,
} from './protocol';

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
    socketPath,
    userDataDir,
    appVersion = '0.0.0',
    spawnPty,
    log = () => {},
    idleGraceMs = 10 * 60 * 1000,
  } = options;

  const pidPath = options.pidPath ?? `${socketPath}.pid`;
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

  function broadcastControl(msg: ControlMessage): void {
    const buf = encodeControl(msg);
    for (const client of clients) {
      if (!client.destroyed && client.writable) {
        client.write(buf);
      }
    }
  }

  function broadcastData(ptyId: string, data: Uint8Array): void {
    const buf = encodeData(ptyId, data);
    for (const client of clients) {
      if (!client.destroyed && client.writable) {
        client.write(buf);
      }
    }
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
    void flushAllScrollback();
  }, 15_000);
  flushTimer.unref?.();

  const server = net.createServer((socket) => {
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
  });

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
            appendScrollback(sessionId, bytes);

            if (session.pendingInput) {
              const input = session.pendingInput;
              session.pendingInput = null;
              try {
                pty.write(input);
              } catch {
                // Ignore
              }
            }

            broadcastData(id, bytes);
          });

          pty.onExit(({ exitCode, signal }) => {
            if (hasSentExit) return;
            hasSentExit = true;
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
          socket.write(
            encodeControl({
              t: 'reply',
              id: msg.id,
              ok: false,
              code: 'spawn-failed',
              message: err instanceof Error ? err.message : String(err),
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
        void flushAllScrollback().then(() => {
          socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
        });
        break;
      }

      case 'detach': {
        socket.write(encodeControl({ t: 'reply', id: msg.id, ok: true }));
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

  server.listen(socketPath, () => {
    try {
      chmodSync(socketPath, 0o600);
      writeFileSync(pidPath, `${process.pid}\n`, { mode: 0o600 });
      log(`[broker] listening on ${socketPath} (pid ${process.pid})`);
    } catch (err) {
      log(`[broker] error configuring socket permissions: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return {
    socketPath,
    pidPath,
    server,
    closed,
    close: closeServer,
    sessionCount: () => sessions.size,
    clientCount: () => clients.size,
  };
}
