// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameDecoder, encodeControl, PROTOCOL, type ControlMessage, type ControlReply } from './protocol';
import { createBrokerServer, type BrokerServer, type IPtyLike } from './server';

/**
 * The broker's guest rule, held by the SERVER (Phase 113 Theme O): a hand-rolled client speaking the
 * raw protocol — not the runtime's guest client, which also declines to ask — cannot kill a session it
 * did not create, retire, shut down or forget. Real server, fake ptys, sockets in a temp dir.
 */

type Raw = { request: (msg: ControlMessage) => Promise<Record<string, unknown>>; close: () => void };

function fakePty(pid: number): IPtyLike {
  let onExit: ((e: { exitCode: number }) => void) | null = null;
  return {
    pid,
    onData: () => ({}),
    onExit: (l) => ((onExit = l), {}),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => onExit?.({ exitCode: 0 })),
  };
}

const servers: BrokerServer[] = [];
const sockets: net.Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  for (const s of servers.splice(0)) await s.close();
});

async function broker(): Promise<{ server: BrokerServer; socketPath: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mbgr-'));
  const socketPath = join(dir, 'b.sock');
  let pid = 100;
  const server = createBrokerServer({ socketPath, userDataDir: dir, spawnPty: () => fakePty(pid++) });
  servers.push(server);
  await new Promise<void>((resolve) => (server.server.listening ? resolve() : server.server.once('listening', resolve)));
  return { server, socketPath };
}

async function raw(socketPath: string): Promise<Raw> {
  const socket = net.connect(socketPath);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => (socket.once('connect', resolve), socket.once('error', reject)));
  const decoder = createFrameDecoder();
  const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
  socket.on('data', (chunk) => {
    for (const f of decoder.push(chunk)) {
      if (f.type === 0x00 && f.message.t === 'reply' && f.message.id !== undefined) {
        waiting.get(f.message.id)?.(f.message as ControlReply & Record<string, unknown>);
      }
    }
  });
  let seq = 1;
  return {
    request: (msg) =>
      new Promise((resolve) => {
        const id = seq++;
        waiting.set(id, resolve);
        socket.write(encodeControl({ ...msg, id } as ControlMessage));
      }),
    close: () => socket.destroy(),
  };
}

const hello = (extra: { role?: 'host' | 'guest'; appId?: string } = {}): ControlMessage => ({
  t: 'hello',
  protocol: PROTOCOL,
  appVersion: '0.0.0',
  pid: process.pid,
  ...extra,
});
const create = (sessionId: string): ControlMessage => ({ t: 'create', sessionId, cwd: tmpdir(), cols: 80, rows: 24, env: { SECRET_TOKEN: 's3cret' } });
const forbidden = { ok: false, code: 'forbidden' };

/** Studio's side: a host connection holding one session. */
async function studioSession(socketPath: string): Promise<{ host: Raw; ptyId: string }> {
  const host = await raw(socketPath);
  await host.request(hello({ role: 'host', appId: 'studio' }));
  const reply = await host.request(create('studio-sess'));
  return { host, ptyId: reply['ptyId'] as string };
}

describe('broker server — the guest rule', () => {
  it('holds a connection that never says hello to guest-with-no-app: no create, kill, retire, shutdown or forget', async () => {
    const { server, socketPath } = await broker();
    const { ptyId } = await studioSession(socketPath);
    const anon = await raw(socketPath);
    expect(await anon.request(create('x'))).toMatchObject(forbidden);
    expect(await anon.request({ t: 'kill', ptyId })).toMatchObject(forbidden);
    expect(await anon.request({ t: 'forget', sessionIds: ['studio-sess'] })).toMatchObject(forbidden);
    expect(await anon.request({ t: 'retire' })).toMatchObject(forbidden);
    expect(await anon.request({ t: 'shutdown' })).toMatchObject(forbidden);
    // What a guest may always do still works.
    expect(await anon.request({ t: 'list' })).toMatchObject({ ok: true });
    expect(await anon.request({ t: 'resize', ptyId, cols: 90, rows: 30 })).toMatchObject({ ok: true });
    expect(server.sessionCount()).toBe(1);
    expect(server.server.listening).toBe(true);
  });

  it('lets a guest create a session stamped with its app id and kill only that; never another app’s', async () => {
    const { server, socketPath } = await broker();
    const { ptyId: studioPty } = await studioSession(socketPath);
    const agents = await raw(socketPath);
    await agents.request(hello({ role: 'guest', appId: 'agents' }));
    const made = await agents.request(create('agents-sess'));
    expect(made).toMatchObject({ ok: true });
    const agentsPty = made['ptyId'] as string;

    const listed = (await agents.request({ t: 'list' }))['sessions'] as Record<string, unknown>[];
    expect(listed.map((s) => [s['sessionId'], s['owner']])).toEqual([['studio-sess', 'studio'], ['agents-sess', 'agents']]);
    // The env a session was started with never comes back out.
    expect(JSON.stringify(listed)).not.toContain('s3cret');

    const coder = await raw(socketPath);
    await coder.request(hello({ role: 'guest', appId: 'coder' }));
    expect(await coder.request({ t: 'kill', ptyId: agentsPty })).toMatchObject(forbidden);
    expect(await agents.request({ t: 'kill', ptyId: studioPty })).toMatchObject(forbidden);
    expect(server.sessionCount()).toBe(2);

    expect(await agents.request({ t: 'kill', ptyId: agentsPty })).toMatchObject({ ok: true });
    expect(server.sessionCount()).toBe(1);
  });

  it('keeps a guest a guest: a second hello as the host is refused, and the rule still holds after it', async () => {
    const { server, socketPath } = await broker();
    const { ptyId } = await studioSession(socketPath);
    const guest = await raw(socketPath);
    expect(await guest.request(hello({ role: 'guest', appId: 'agents' }))).toMatchObject({ ok: true });
    expect(await guest.request(hello({ role: 'host', appId: 'studio' }))).toMatchObject(forbidden);
    expect(await guest.request({ t: 'kill', ptyId })).toMatchObject(forbidden);
    expect(server.sessionCount()).toBe(1);
  });

  it('refuses a guest create whose app id is not one (it would own nothing)', async () => {
    const { server, socketPath } = await broker();
    const guest = await raw(socketPath);
    await guest.request(hello({ role: 'guest', appId: '../studio' }));
    expect(await guest.request(create('x'))).toMatchObject(forbidden);
    expect(server.sessionCount()).toBe(0);
  });

  it('owner is the app, not the socket: the app may still kill its session after reconnecting', async () => {
    const { server, socketPath } = await broker();
    const first = await raw(socketPath);
    await first.request(hello({ role: 'guest', appId: 'agents' }));
    const ptyId = (await first.request(create('agents-sess')))['ptyId'] as string;
    first.close();
    const again = await raw(socketPath);
    await again.request(hello({ role: 'guest', appId: 'agents' }));
    expect(await again.request({ t: 'kill', ptyId })).toMatchObject({ ok: true });
    expect(server.sessionCount()).toBe(0);
  });
});
