// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_LIST_TOOLS_REQUEST, MCP_MAX_REQUEST_BYTES, type McpResponse } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { readSocketToken, socketTokenPath } from '../security/socket-token';
import { startAppMcpServer } from './app-server';
import { mcpSocketName } from './socket-name';
import type { McpSocketServerHandle } from './socket-server';

let dir = '';
let handle: McpSocketServerHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function start(listTools: () => string[] = () => ['startup_runway']): Promise<McpSocketServerHandle> {
  dir = mkdtempSync(join(tmpdir(), 'mcp-app-'));
  const started = await startAppMcpServer({
    userDataDir: dir,
    appVersion: '1.0.0',
    buildId: 'b',
    isPackaged: false,
    dispatch: async (tool) => ({ ok: true, value: { handled: tool } }),
    listTools: listTools as never,
  });
  if (!started.ok) throw new Error(started.message);
  handle = started.handle;
  return started.handle;
}

function ask(socketPath: string, tool: string, auth: string | null): Promise<McpResponse | 'closed'> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    socket.on('close', () => resolve('closed'));
    socket.on('error', () => resolve('closed'));
    socket.on('data', (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        if (frame.type === 0x00) {
          socket.destroy();
          resolve(frame.message as unknown as McpResponse);
        }
      }
    });
    socket.once('connect', () => {
      if (auth !== null) socket.write(encodeJsonFrame({ auth }));
      socket.write(encodeJsonFrame({ id: '1', tool, input: {} }));
    });
  });
}

describe('startAppMcpServer (Phase 153 Theme B)', () => {
  it('binds <userData>/mcp/<mcpSocketName> and writes its token beside the socket', async () => {
    const server = await start();
    expect(server.socketPath).toBe(join(dir, 'mcp', mcpSocketName('1.0.0', 'b', false)));
    expect(existsSync(socketTokenPath(server.socketPath))).toBe(true);
  });

  it('answers the list request with listTools(), re-read each time', async () => {
    let ids = ['a'];
    const server = await start(() => ids);
    const token = readSocketToken(server.socketPath);
    const first = await ask(server.socketPath, MCP_LIST_TOOLS_REQUEST, token);
    ids = ['a', 'b'];
    const second = await ask(server.socketPath, MCP_LIST_TOOLS_REQUEST, token);
    expect(first).toMatchObject({ ok: true, value: { tools: ['a'] } });
    expect(second).toMatchObject({ ok: true, value: { tools: ['a', 'b'] } });
  });

  it('routes any other tool through dispatch', async () => {
    const server = await start();
    const reply = await ask(server.socketPath, 'startup_runway', readSocketToken(server.socketPath));
    expect(reply).toMatchObject({ ok: true, value: { handled: 'startup_runway' } });
  });

  it('drops a connection that does not present the token', async () => {
    const server = await start();
    expect(await ask(server.socketPath, MCP_LIST_TOOLS_REQUEST, null)).toBe('closed');
    expect(await ask(server.socketPath, MCP_LIST_TOOLS_REQUEST, 'wrong')).toBe('closed');
  });

  it('removes the socket and token on close', async () => {
    const server = await start();
    await server.close();
    expect(existsSync(server.socketPath)).toBe(false);
    expect(existsSync(socketTokenPath(server.socketPath))).toBe(false);
  });
});
