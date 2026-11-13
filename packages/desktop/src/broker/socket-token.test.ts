// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { socketTokenPath } from '@midnite/studio-runtime/security/socket-token';
import { describe, expect, it } from 'vitest';

import { createFrameDecoder, encodeControl, PROTOCOL, type Frame } from './protocol';
import { createBrokerServer } from './server';

/** Phase 115 Theme E: a broker with a token file drops any connection whose first message is not a matching hello. */

const TOKEN = 'a'.repeat(64);

async function start(withToken: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'mstudio-broker-tok-'));
  const socketPath = join(dir, 'b.sock');
  if (withToken) writeFileSync(socketTokenPath(socketPath), TOKEN, { mode: 0o600 });
  const broker = createBrokerServer({ socketPath, userDataDir: dir });
  await new Promise((r) => setTimeout(r, 30));
  return { broker, socketPath, dir };
}

async function talk(socketPath: string, messages: Parameters<typeof encodeControl>[0][]): Promise<{ frames: Frame[]; closed: boolean }> {
  const socket = net.connect(socketPath);
  const decoder = createFrameDecoder();
  const frames: Frame[] = [];
  let closed = false;
  socket.on('data', (chunk) => frames.push(...decoder.push(chunk)));
  socket.on('close', () => (closed = true));
  socket.on('error', () => undefined);
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  for (const m of messages) socket.write(encodeControl(m));
  await new Promise((r) => setTimeout(r, 150));
  socket.destroy();
  return { frames, closed };
}

const hello = (token?: string) =>
  ({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.1.0', pid: process.pid, role: 'host', ...(token ? { token } : {}) }) as const;

describe('broker socket token', () => {
  it('drops a hello that carries no token, without a reply', async () => {
    const { broker, socketPath } = await start(true);
    const out = await talk(socketPath, [hello()]);
    expect(out).toEqual({ frames: [], closed: true });
    await broker.close();
  });

  it('drops a non-hello first message even with the token field present', async () => {
    const { broker, socketPath } = await start(true);
    const out = await talk(socketPath, [{ t: 'list', id: 1 }]);
    expect(out).toEqual({ frames: [], closed: true });
    await broker.close();
  });

  it('drops a wrong token', async () => {
    const { broker, socketPath } = await start(true);
    const out = await talk(socketPath, [hello('b'.repeat(64))]);
    expect(out).toEqual({ frames: [], closed: true });
    await broker.close();
  });

  it('answers a hello with the right token and then serves requests', async () => {
    const { broker, socketPath } = await start(true);
    const out = await talk(socketPath, [hello(TOKEN), { t: 'list', id: 2 }]);
    expect(out.closed).toBe(false);
    expect(out.frames.length).toBeGreaterThanOrEqual(2);
    await broker.close();
  });

  it('checks nothing when there is no token file (a legacy launch)', async () => {
    const { broker, socketPath } = await start(false);
    const out = await talk(socketPath, [hello()]);
    expect(out.closed).toBe(false);
    expect(out.frames).toHaveLength(1);
    await broker.close();
  });

  it('copies the token to the retired socket path so legacy-peer probing still authenticates', async () => {
    const { broker, socketPath } = await start(true);
    const out = await talk(socketPath, [hello(TOKEN), { t: 'retire', id: 2 }]);
    const reply = out.frames.find((f) => f.type === 0x00 && (f as unknown as { message: { id?: number } }).message.id === 2);
    const retired = (reply as unknown as { message?: { socketPath?: string } } | undefined)?.message?.socketPath;
    expect(typeof retired).toBe('string');
    expect(existsSync(socketTokenPath(retired as string))).toBe(true);
    expect(readFileSync(socketTokenPath(retired as string), 'utf8')).toBe(TOKEN);
    await broker.close();
  });

  it('removes its token file on close', async () => {
    const { broker, socketPath } = await start(true);
    await broker.close();
    expect(existsSync(socketTokenPath(socketPath))).toBe(false);
  });
});
