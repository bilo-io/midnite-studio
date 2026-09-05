import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { join } from 'node:path';

import {
  isMcpToolId,
  MCP_MAX_REQUEST_BYTES,
  MCP_MAX_RESPONSE_BYTES,
  type McpRequest,
  type McpResponse,
} from '@midnite/studio-shared';

import { createFrameDecoder, encodeJsonFrame } from '../../broker/protocol';
import { defaultLogger, type Logger } from '../log';
import { isSocketPathTooLong, mcpSocketName } from '../socket-name';
import { recordMcpCall } from './audit';
import { dispatchMcpCall } from './dispatch';

/**
 * The Unix-socket server behind Midnite Studio's MCP tools (Phase 57 Theme
 * B). Cribs the pty broker's transport trick verbatim
 * (`packages/desktop/src/broker/server.ts`): a build-fingerprinted socket
 * under `userData`, `0o600` permissions, and the same length-prefixed frame
 * decoder — with a request cap sized for a model rather than for pty output.
 *
 * Dispatches directly to the services behind `ipcMain` (via `dispatch.ts`),
 * never through `ipcMain` itself: `handle.ts`'s seam expects a renderer
 * `event.sender` to resolve a window against, and an MCP call has no window
 * (Decision 2).
 */

export type McpServerHandle = {
  socketPath: string;
  close: () => Promise<void>;
};

export type StartMcpServerOptions = {
  userDataDir: string;
  appVersion: string;
  buildId: string;
  isPackaged: boolean;
  log?: Logger;
};

export type StartMcpServerResult = { ok: true; handle: McpServerHandle } | { ok: false; message: string };

/** The 9th simultaneous connection is accepted, answered `refused`, and destroyed. */
export const MCP_MAX_CONNECTIONS = 8;

function tooManyConnectionsResponse(): McpResponse {
  return { id: '', ok: false, kind: 'refused', message: 'too many concurrent MCP connections' };
}

/** Every `MCP_TOOLS` input is `McpRepoTarget` or extends it — this is the one field the audit ring is allowed to keep. */
function auditRepoPath(input: unknown): string {
  if (input && typeof input === 'object' && 'repoPath' in input) {
    const value = (input as { repoPath?: unknown }).repoPath;
    if (typeof value === 'string') return value;
  }
  return '';
}

export async function startMcpServer(opts: StartMcpServerOptions): Promise<StartMcpServerResult> {
  const { userDataDir, appVersion, buildId, isPackaged } = opts;
  const log = opts.log ?? defaultLogger;

  const socketDir = join(userDataDir, 'mcp');
  const socketPath = join(socketDir, mcpSocketName(appVersion, buildId, isPackaged));

  // Refused outright, never silently not-listening — a Settings page (Theme
  // F) renders this as "path too long for a Unix socket".
  if (isSocketPathTooLong(socketPath)) {
    return { ok: false, message: 'path too long for a Unix socket' };
  }

  mkdirSync(socketDir, { mode: 0o700, recursive: true });
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // Best-effort: a stale socket from a crashed previous run.
    }
  }

  const connections = new Set<net.Socket>();

  async function handleRequest(socket: net.Socket, raw: Partial<McpRequest>): Promise<void> {
    const id = typeof raw.id === 'string' ? raw.id : '';
    const tool = typeof raw.tool === 'string' ? raw.tool : '';

    const startedAt = Date.now();
    const result = await dispatchMcpCall(tool, raw.input);
    const ms = Date.now() - startedAt;

    /*
      Theme E's audit ring, plus one `[mcp]` line through the one log seam —
      only for a recognised tool id, since an unknown-tool call never reached
      a handler and has nothing a caller would recognise as "an audit entry"
      for. `repoPath` is whatever the caller passed as that field and nothing
      deeper: every tool's input is `McpRepoTarget` (or extends it), so this
      never picks up a diff's file path or a branch name — the guardrail
      the phase doc states ("no payload bodies, no full paths beyond the
      repo root") made enforceable by construction rather than by convention.
    */
    if (isMcpToolId(tool)) {
      const repoPath = auditRepoPath(raw.input);
      recordMcpCall({ at: Date.now(), tool, repoPath, ok: result.ok, ms });
      log(`[mcp] ${tool} ${result.ok ? 'ok' : 'err'} ${ms}ms ${repoPath || '-'}`);
    }

    const response: McpResponse = result.ok
      ? { id, ok: true, value: result.value }
      : { id, ok: false, kind: result.kind, message: result.message };

    const byteLength = Buffer.byteLength(JSON.stringify(response), 'utf8');
    // A handler whose serialised result exceeds the cap is refused with the
    // byte count in the message rather than silently truncated.
    const final: McpResponse =
      byteLength > MCP_MAX_RESPONSE_BYTES
        ? { id, ok: false, kind: 'refused', message: `response too large (${byteLength} bytes)` }
        : response;

    try {
      if (!socket.destroyed) socket.write(encodeJsonFrame(final));
    } catch (err) {
      log(`[mcp] failed to write response for "${tool}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const server = net.createServer((socket) => {
    if (connections.size >= MCP_MAX_CONNECTIONS) {
      try {
        socket.write(encodeJsonFrame(tooManyConnectionsResponse()));
      } catch {
        // Ignore — the connection is being destroyed regardless.
      }
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
        /*
          The decoder's own throw (protocol.ts) covers both an oversized frame
          and a malformed one; either way the connection MUST survive — an
          agent that overshoots once must not lose its whole session over it
          (Theme B's own rule). The decoder has already reset its internal
          buffer before throwing, so the next `data` event starts clean.
        */
        const message = err instanceof Error ? err.message : String(err);
        const oversize = /exceeds maximum/.test(message);
        try {
          socket.write(
            encodeJsonFrame({
              id: '',
              ok: false,
              kind: oversize ? 'refused' : 'error',
              message: oversize ? 'request too large' : message,
            } satisfies McpResponse),
          );
        } catch {
          // Ignore — nothing more can be done for this write.
        }
        return;
      }

      for (const frame of frames) {
        if (frame.type !== 0x00) continue;
        // `createFrameDecoder` types this as the broker's own `ControlMessage`
        // — a lie for this server's purposes; what actually arrives is
        // whatever JSON the shim sent, so it is re-read as the (unvalidated,
        // hence `Partial`) MCP request shape it really is.
        const request = frame.message as unknown as Partial<McpRequest>;
        void handleRequest(socket, request);
      }
    });

    socket.on('close', () => {
      connections.delete(socket);
    });
    socket.on('error', (err) => {
      log(`[mcp] socket error: ${err.message}`);
      connections.delete(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
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
  });

  let closed = false;

  return {
    ok: true,
    handle: {
      socketPath,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        for (const socket of connections) socket.destroy();
        connections.clear();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        try {
          if (existsSync(socketPath)) unlinkSync(socketPath);
        } catch {
          // Ignore — nothing left to clean up if this fails.
        }
      },
    },
  };
}
