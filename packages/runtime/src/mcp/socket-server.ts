import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { dirname } from 'node:path';

import { MCP_MAX_REQUEST_BYTES, MCP_MAX_RESPONSE_BYTES, type McpRequest, type McpResponse } from '@midnite/studio-shared';

import type { DispatchResult, ScopedDispatch } from '../agent-run/host';
import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { isSocketPathTooLong } from '../broker/socket-name';

/**
 * The Unix-socket transport behind every Midnite MCP server (Phase 57 Theme B; moved here in Phase 113
 * Theme S slice 3 so Gamer's per-run server and Studio's are one implementation): `0o600` on the socket in
 * a `0o700` directory, the pty broker's length-prefixed frame decoder with a request cap sized for a model,
 * a response cap that refuses rather than truncates, and at most {@link MCP_MAX_CONNECTIONS} clients.
 *
 * It knows nothing about tools: every request goes to `dispatch`, which decides what each id answers.
 * Studio's global server (`desktop/src/main/mcp/server.ts`) passes the full registry plus its audit hook;
 * a private run passes a dispatcher that answers one feature's tools for one item and refuses the rest.
 */

export type McpSocketServerHandle = {
  socketPath: string;
  close: () => Promise<void>;
  /** Synchronous teardown for a quitting process: drop every client, stop listening, unlink the socket. */
  closeNow: () => void;
};

export type StartMcpSocketServerOptions = {
  socketPath: string;
  dispatch: ScopedDispatch;
  log?: (line: string) => void;
  /** Called after each answered request — Studio's audit ring and its `[mcp]` log line. */
  onCall?: (call: { tool: string; input: unknown; result: DispatchResult; ms: number }) => void;
};

export type StartMcpSocketServerResult = { ok: true; handle: McpSocketServerHandle } | { ok: false; message: string };

/** The 9th simultaneous connection is accepted, answered `refused`, and destroyed. */
export const MCP_MAX_CONNECTIONS = 8;

export async function startMcpSocketServer(opts: StartMcpSocketServerOptions): Promise<StartMcpSocketServerResult> {
  const { socketPath, dispatch } = opts;
  const log = opts.log ?? (() => undefined);

  // Refused outright, never silently not-listening — a Settings page renders this message.
  if (isSocketPathTooLong(socketPath)) return { ok: false, message: 'path too long for a Unix socket' };

  mkdirSync(dirname(socketPath), { mode: 0o700, recursive: true });
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // Best-effort: a stale socket from a crashed previous run.
    }
  }

  const connections = new Set<net.Socket>();
  const write = (socket: net.Socket, response: McpResponse): void => {
    try {
      if (!socket.destroyed) socket.write(encodeJsonFrame(response));
    } catch (err) {
      log(`[mcp] failed to write a response: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  async function handleRequest(socket: net.Socket, raw: Partial<McpRequest>): Promise<void> {
    const id = typeof raw.id === 'string' ? raw.id : '';
    const tool = typeof raw.tool === 'string' ? raw.tool : '';
    const startedAt = Date.now();
    const result = await dispatch(tool, raw.input);
    opts.onCall?.({ tool, input: raw.input, result, ms: Date.now() - startedAt });
    const response: McpResponse = result.ok
      ? { id, ok: true, value: result.value }
      : { id, ok: false, kind: result.kind, message: result.message };
    // A result over the cap is refused with its byte count rather than silently truncated.
    const byteLength = Buffer.byteLength(JSON.stringify(response), 'utf8');
    write(socket, byteLength > MCP_MAX_RESPONSE_BYTES ? { id, ok: false, kind: 'refused', message: `response too large (${byteLength} bytes)` } : response);
  }

  const server = net.createServer((socket) => {
    if (connections.size >= MCP_MAX_CONNECTIONS) {
      write(socket, { id: '', ok: false, kind: 'refused', message: 'too many concurrent MCP connections' });
      socket.destroy();
      return;
    }
    connections.add(socket);
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    socket.on('data', (chunk) => {
      let frames;
      try {
        frames = decoder.push(chunk);
      } catch (err) {
        // An oversized or malformed frame costs that request, never the connection: the decoder reset itself.
        const message = err instanceof Error ? err.message : String(err);
        const oversize = /exceeds maximum/.test(message);
        write(socket, { id: '', ok: false, kind: oversize ? 'refused' : 'error', message: oversize ? 'request too large' : message });
        return;
      }
      for (const frame of frames) {
        if (frame.type !== 0x00) continue;
        // The decoder types this as the broker's control message; what arrives is unvalidated MCP JSON.
        void handleRequest(socket, frame.message as unknown as Partial<McpRequest>);
      }
    });
    socket.on('close', () => connections.delete(socket));
    socket.on('error', (err) => {
      log(`[mcp] socket error: ${err.message}`);
      connections.delete(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Phase 91 Theme E: bind under a 0o177 umask (see the broker's `listenOn`); restored right
    // after, since Node binds a unix socket synchronously inside `listen`.
    const previousUmask = process.umask(0o177);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      try {
        chmodSync(socketPath, 0o600);
      } catch (err) {
        log(`[mcp] failed to set socket permissions: ${err instanceof Error ? err.message : String(err)}`);
      }
      log(`[mcp] listening on ${socketPath}`);
      resolve();
    });
    process.umask(previousUmask);
  });

  let closed = false;
  const teardown = (): Promise<void> => {
    closed = true;
    for (const socket of connections) socket.destroy();
    connections.clear();
    const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      if (existsSync(socketPath)) unlinkSync(socketPath);
    } catch {
      // Nothing left to clean up if this fails.
    }
    return stopped;
  };
  return {
    ok: true,
    handle: {
      socketPath,
      close: async () => {
        if (!closed) await teardown();
      },
      closeNow: () => {
        if (!closed) void teardown();
      },
    },
  };
}
