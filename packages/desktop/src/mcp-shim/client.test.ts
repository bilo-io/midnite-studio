import { mkdtemp, rm } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpRequest } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { callMcpTool, MCP_NOT_RUNNING_MESSAGE } from './client';

let servers: net.Server[] = [];
let openSockets: net.Socket[] = [];
let dirs: string[] = [];

afterEach(async () => {
  // Destroy every accepted connection first: `server.close()`'s callback
  // does not fire until every open connection ends, and a test server that
  // deliberately never answers (the "never replies" case below) leaves one
  // open until something destroys it from this side.
  for (const socket of openSockets) socket.destroy();
  openSockets = [];
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  servers = [];
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function tempSocketPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-mcp-client-'));
  dirs.push(dir);
  return join(dir, 'test.sock');
}

/** `net.createServer`, tracking every accepted socket so `afterEach` can force them closed. */
function trackedServer(onConnection: (socket: net.Socket) => void): net.Server {
  return net.createServer((socket) => {
    openSockets.push(socket);
    onConnection(socket);
  });
}

describe('callMcpTool', () => {
  it('answers not-running immediately when no socket path resolves', async () => {
    const started = Date.now();
    const response = await callMcpTool('repo.list', {}, { socketPath: null });
    expect(Date.now() - started).toBeLessThan(200);
    expect(response).toMatchObject({ ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE });
  });

  it('answers not-running when the socket file does not exist', async () => {
    const socketPath = await tempSocketPath();
    const response = await callMcpTool('repo.list', {}, { socketPath });
    expect(response).toMatchObject({ ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE });
  });

  it('round-trips a real request/response over the socket', async () => {
    const socketPath = await tempSocketPath();
    const server = trackedServer((socket) => {
      const decoder = createFrameDecoder();
      socket.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          if (frame.type !== 0x00) continue;
          const request = frame.message as unknown as McpRequest;
          socket.write(encodeJsonFrame({ id: request.id, ok: true, value: ['a', 'b'] }));
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const response = await callMcpTool('repo.list', {}, { socketPath });
    expect(response.ok).toBe(true);
    expect(response.ok && response.value).toEqual(['a', 'b']);
  });

  it('answers not-running if the server never replies, within the call timeout', async () => {
    const socketPath = await tempSocketPath();
    const server = trackedServer(() => {
      // Accept the connection and say nothing back.
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const started = Date.now();
    const response = await callMcpTool('repo.list', {}, { socketPath });
    expect(Date.now() - started).toBeLessThan(2500);
    expect(response).toMatchObject({ ok: false, kind: 'error', message: MCP_NOT_RUNNING_MESSAGE });
  });
});
