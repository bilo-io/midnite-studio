import { randomUUID } from 'node:crypto';
import * as net from 'node:net';

import { MCP_MAX_RESPONSE_BYTES, type McpRequest, type McpResponse } from '@midnite/studio-shared';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';

/**
 * One MCP call over a run's private socket (Phase 113 Theme S slice 3): dial, send one frame, read one
 * frame, hang up — the same exchange Studio's stdio shim makes (`desktop/src/mcp-shim/client.ts`), minus
 * the global-socket discovery: a run's shim is handed its one socket and can reach nothing else.
 *
 * Never throws. A missing socket, a dead one, a malformed answer or a timeout all resolve to an `error`
 * response, so the agent sees a tool error rather than a hung call.
 */
export const RUN_SOCKET_GONE_MESSAGE = 'This run has ended: its private MCP server is gone.';

export function callMcpSocket(req: { socketPath: string; tool: string; input: unknown; timeoutMs: number }): Promise<McpResponse> {
  const id = randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect(req.socketPath);
    const finish = (response: McpResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(response);
    };
    const gone = (): void => finish({ id, ok: false, kind: 'error', message: RUN_SOCKET_GONE_MESSAGE });
    const timer = setTimeout(() => finish({ id, ok: false, kind: 'error', message: `"${req.tool}" did not answer in time.` }), req.timeoutMs);
    timer.unref?.();

    const decoder = createFrameDecoder(MCP_MAX_RESPONSE_BYTES);
    socket.once('error', gone);
    socket.once('close', gone);
    socket.once('connect', () => {
      const request: McpRequest = { id, tool: req.tool, input: req.input ?? {} };
      try {
        socket.write(encodeJsonFrame(request));
      } catch {
        gone();
      }
    });
    socket.on('data', (chunk) => {
      try {
        for (const frame of decoder.push(chunk)) {
          if (frame.type === 0x00) return finish(frame.message as unknown as McpResponse);
        }
      } catch {
        finish({ id, ok: false, kind: 'error', message: 'Malformed response from the run’s MCP server.' });
      }
    });
  });
}
