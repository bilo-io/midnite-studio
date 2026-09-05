import { randomUUID } from 'node:crypto';
import * as net from 'node:net';

import { MCP_MAX_RESPONSE_BYTES, type McpRequest, type McpResponse } from '@midnite/studio-shared';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { resolveMcpSocketPath } from './socket-resolve';
import { resolveUserDataDir } from './user-data-dir';

export const MCP_NOT_RUNNING_MESSAGE =
  'Midnite Studio is not running, or its MCP server is off (Settings ▸ MCP).';

/** The shim dials the socket per call rather than holding one connection open, so a relaunch of the app restores service without restarting the shim (Phase 57 Theme C). */
const CALL_TIMEOUT_MS = 2000;

export type CallMcpToolOptions = {
  /**
   * Skip the real resolution (`resolveUserDataDir` + `resolveMcpSocketPath`)
   * and dial this path instead — the test seam. `null` simulates "no server
   * found" without needing a real (empty) `userData` directory on disk.
   */
  socketPath?: string | null;
};

/**
 * Call one MCP tool over the socket, reconnecting fresh every time.
 *
 * Never throws: a missing socket, a dead one, or one that never answers
 * within {@link CALL_TIMEOUT_MS} all resolve to the same clean
 * `MCP_NOT_RUNNING_MESSAGE` error response rather than hanging the client
 * that called `tools/call`.
 */
export async function callMcpTool(
  tool: string,
  input: unknown,
  options: CallMcpToolOptions = {},
): Promise<McpResponse> {
  const id = randomUUID();
  const socketPath =
    options.socketPath !== undefined ? options.socketPath : resolveMcpSocketPath(resolveUserDataDir());
  if (!socketPath) {
    return { id, ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE };
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (response: McpResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(response);
    };

    const timer = setTimeout(() => finish({ id, ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE }), CALL_TIMEOUT_MS);
    timer.unref?.();

    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder(MCP_MAX_RESPONSE_BYTES);

    socket.once('error', () => finish({ id, ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE }));

    socket.once('connect', () => {
      const request: McpRequest = { id, tool, input: input ?? {} };
      try {
        socket.write(encodeJsonFrame(request));
      } catch {
        finish({ id, ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE });
      }
    });

    socket.on('data', (chunk) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          if (frame.type === 0x00) {
            finish(frame.message as unknown as McpResponse);
            return;
          }
        }
      } catch {
        finish({ id, ok: false, kind: 'error', message: 'Malformed response from Midnite Studio.' });
      }
    });
  });
}
