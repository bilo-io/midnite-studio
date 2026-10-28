// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_MAX_REQUEST_BYTES, type McpResponse } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { startMcpSocketServer, type McpSocketServerHandle } from './socket-server';

let dir = '';
let handle: McpSocketServerHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function ask(tool: string): Promise<McpResponse> {
  dir = mkdtempSync(join(tmpdir(), 'mcp-ss-'));
  const started = await startMcpSocketServer({
    socketPath: join(dir, 's.sock'),
    dispatch: async (name) => (name === 'boom' ? { ok: false, kind: 'error', message: 'no' } : { ok: true, value: { echoed: name } }),
  });
  if (!started.ok) throw new Error(started.message);
  handle = started.handle;
  const socket = net.connect(started.handle.socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });
  return new Promise((resolve) => {
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    socket.on('data', (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        if (frame.type === 0x00) {
          socket.destroy();
          resolve(frame.message as unknown as McpResponse);
        }
      }
    });
    socket.write(encodeJsonFrame({ id: '1', tool, input: {} }));
  });
}

describe('startMcpSocketServer provenance (Phase 121 Theme A)', () => {
  it('stamps every successful result as an untrusted mcp-result naming the tool', async () => {
    expect(await ask('repo.list')).toEqual({
      id: '1',
      ok: true,
      value: { echoed: 'repo.list' },
      provenance: { origin: 'mcp-result', ref: 'repo.list', trust: 'untrusted' },
    });
  });

  it('leaves a failure unstamped', async () => {
    expect(await ask('boom')).toEqual({ id: '1', ok: false, kind: 'error', message: 'no' });
  });
});
