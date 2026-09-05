import { mkdtempSync, rmSync, statSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_MAX_REQUEST_BYTES, type McpRequest, type McpResponse } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../../broker/protocol';
import { resetRegistry } from '../repo-registry';
import { MCP_MAX_CONNECTIONS, startMcpServer, type McpServerHandle } from './server';

let dirs: string[] = [];
let handles: McpServerHandle[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mstudio-mcp-server-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(handles.map((h) => h.close()));
  handles = [];
  resetRegistry();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

async function boot(): Promise<McpServerHandle> {
  const result = await startMcpServer({
    userDataDir: tempDir(),
    appVersion: '0.0.0-test',
    buildId: 'test',
    isPackaged: false,
  });
  if (!result.ok) throw new Error(result.message);
  handles.push(result.handle);
  return result.handle;
}

/** One raw connection to a real socket, decoding frames as they arrive. */
function connect(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

/** Send one raw frame and wait for the first response frame back. */
function call(socket: net.Socket, request: McpRequest): Promise<McpResponse> {
  return new Promise((resolve, reject) => {
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    const onData = (chunk: Buffer): void => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          if (frame.type === 0x00) {
            socket.off('data', onData);
            resolve(frame.message as unknown as McpResponse);
            return;
          }
        }
      } catch (err) {
        reject(err);
      }
    };
    socket.on('data', onData);
    socket.write(encodeJsonFrame(request));
  });
}

describe('startMcpServer', () => {
  it('binds a socket with 0o600 permissions', async () => {
    const handle = await boot();
    const mode = statSync(handle.socketPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('answers a real tool call over the socket', async () => {
    const handle = await boot();
    const socket = await connect(handle.socketPath);
    const response = await call(socket, { id: '1', tool: 'repo.list', input: {} });
    expect(response).toEqual({ id: '1', ok: true, value: [] });
    socket.destroy();
  });

  it('answers an unknown tool id with the error arm, and keeps the socket open', async () => {
    const handle = await boot();
    const socket = await connect(handle.socketPath);
    const response = await call(socket, { id: '1', tool: 'not.a.real.tool', input: {} });
    expect(response.ok).toBe(false);
    expect(response.ok === false && response.kind).toBe('error');

    // The socket survived: a second call on the same connection still answers.
    const second = await call(socket, { id: '2', tool: 'repo.list', input: {} });
    expect(second).toEqual({ id: '2', ok: true, value: [] });
    socket.destroy();
  });

  it('refuses an oversized request and keeps the socket open', async () => {
    const handle = await boot();
    const socket = await connect(handle.socketPath);

    const oversized = encodeJsonFrame({
      id: '1',
      tool: 'repo.list',
      input: { huge: 'x'.repeat(MCP_MAX_REQUEST_BYTES + 1) },
    });
    const response = await new Promise<McpResponse>((resolve, reject) => {
      const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
      socket.once('data', (chunk) => {
        try {
          const frames = decoder.push(chunk);
          const first = frames[0];
          if (first?.type === 0x00) resolve(first.message as unknown as McpResponse);
          else reject(new Error('no frame decoded'));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      socket.write(oversized);
    });

    expect(response.ok).toBe(false);
    expect(response.ok === false && response.kind).toBe('refused');

    // Still open: an ordinary call right after still answers.
    const second = await call(socket, { id: '2', tool: 'repo.list', input: {} });
    expect(second).toEqual({ id: '2', ok: true, value: [] });
    socket.destroy();
  });

  it(`refuses the ${MCP_MAX_CONNECTIONS + 1}th simultaneous connection`, async () => {
    const handle = await boot();
    const open: net.Socket[] = [];
    try {
      for (let i = 0; i < MCP_MAX_CONNECTIONS; i++) {
        open.push(await connect(handle.socketPath));
      }

      const ninth = await connect(handle.socketPath);
      const response = await new Promise<McpResponse>((resolve, reject) => {
        const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
        ninth.once('data', (chunk) => {
          try {
            const frames = decoder.push(chunk);
            const first = frames[0];
            if (first?.type === 0x00) resolve(first.message as unknown as McpResponse);
            else reject(new Error('no frame decoded'));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
        ninth.once('error', () => {
          // A destroyed connection can also surface as a socket error on some
          // platforms before the write is observed — either is the refusal.
        });
      });
      expect(response.ok).toBe(false);
      expect(response.ok === false && response.kind).toBe('refused');
    } finally {
      for (const socket of open) socket.destroy();
    }
  });

  it('close() removes the socket file', async () => {
    const handle = await boot();
    expect(() => statSync(handle.socketPath)).not.toThrow();
    await handle.close();
    expect(() => statSync(handle.socketPath)).toThrow();
    handles = handles.filter((h) => h !== handle);
  });

  it('refuses to bind when the socket path is too long', async () => {
    const dir = tempDir();
    const nested = join(dir, 'a'.repeat(120));
    const result = await startMcpServer({
      userDataDir: nested,
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    expect(result.ok).toBe(false);
  });
});
