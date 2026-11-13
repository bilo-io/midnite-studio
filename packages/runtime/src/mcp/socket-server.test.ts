// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_MAX_REQUEST_BYTES, type McpResponse } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
import { readSocketToken, socketTokenPath } from '../security/socket-token';
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

describe('startMcpSocketServer socket token (Phase 115 Theme E)', () => {
  async function tokened() {
    dir = mkdtempSync(join(tmpdir(), 'mcp-ss-'));
    const socketPath = join(dir, 's.sock');
    const started = await startMcpSocketServer({
      socketPath,
      requireToken: true,
      dispatch: async (name) => ({ ok: true, value: { echoed: name } }),
    });
    if (!started.ok) throw new Error(started.message);
    handle = started.handle;
    return socketPath;
  }

  /** Send `frames` in order; resolve with every response frame heard and whether the server hung up. */
  async function exchange(socketPath: string, frames: unknown[]): Promise<{ replies: McpResponse[]; closed: boolean }> {
    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    const replies: McpResponse[] = [];
    let closed = false;
    socket.on('data', (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) if (frame.type === 0x00) replies.push(frame.message as unknown as McpResponse);
    });
    socket.on('close', () => (closed = true));
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    for (const f of frames) socket.write(encodeJsonFrame(f));
    await new Promise((r) => setTimeout(r, 150));
    socket.destroy();
    return { replies, closed };
  }

  it('writes a 0600 token file beside the socket and removes it on close', async () => {
    const socketPath = await tokened();
    const token = readSocketToken(socketPath);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(statSync(socketTokenPath(socketPath)).mode & 0o777).toBe(0o600);
    await handle?.close();
    handle = null;
    expect(existsSync(socketTokenPath(socketPath))).toBe(false);
  });

  it('hangs up on a request with no auth frame, without replying', async () => {
    const socketPath = await tokened();
    const out = await exchange(socketPath, [{ id: '1', tool: 'repo.list', input: {} }]);
    expect(out).toEqual({ replies: [], closed: true });
  });

  it('hangs up on a wrong token, without replying', async () => {
    const socketPath = await tokened();
    const out = await exchange(socketPath, [{ auth: 'nope' }, { id: '1', tool: 'repo.list', input: {} }]);
    expect(out).toEqual({ replies: [], closed: true });
  });

  it('serves a connection whose first frame carries the right token', async () => {
    const socketPath = await tokened();
    const token = readSocketToken(socketPath);
    const out = await exchange(socketPath, [{ auth: token }, { id: '1', tool: 'repo.list', input: {} }]);
    expect(out.closed).toBe(false);
    expect(out.replies).toHaveLength(1);
    expect(out.replies[0]).toMatchObject({ id: '1', ok: true, value: { echoed: 'repo.list' } });
  });

  it('leaves a server without requireToken tokenless', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-ss-'));
    const socketPath = join(dir, 's.sock');
    const started = await startMcpSocketServer({ socketPath, dispatch: async () => ({ ok: true, value: 1 }) });
    if (!started.ok) throw new Error(started.message);
    handle = started.handle;
    expect(existsSync(socketTokenPath(socketPath))).toBe(false);
  });
});
