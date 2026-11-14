import { existsSync, mkdtempSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createFrameDecoder, encodeControl, PROTOCOL, type Frame } from './protocol';
import { createBrokerServer, type IPtyLike } from './server';

/**
 * A broker whose socket path stops naming its own socket must not live on unreachable. On 2026-11-14 the
 * broker log shows four brokers in one burst each unlinking the previous one's live socket at start; a
 * broker in that position with sessions held them where no client could ever reach them again.
 */

function fakePty(pid: number): IPtyLike {
  let onExit: ((e: { exitCode: number }) => void) | null = null;
  return {
    pid,
    onData: () => ({ dispose: () => {} }),
    onExit: (l) => {
      onExit = l;
      return { dispose: () => {} };
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => onExit?.({ exitCode: 0 })),
  };
}

async function request(socketPath: string, messages: Buffer[], replies: number): Promise<{ frames: Frame[]; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder();
    const frames: Frame[] = [];
    socket.on('connect', () => messages.forEach((m) => socket.write(m)));
    socket.on('data', (chunk) => {
      frames.push(...decoder.push(chunk).filter((f) => f.type === 0x00));
      if (frames.length >= replies) resolve({ frames, socket });
    });
    socket.on('error', reject);
  });
}

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const hello = encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.0.6', pid: process.pid, role: 'host' });

/** Bind a plain listener on `path` the way a successor broker does: unlink whatever is there, then listen. */
async function takeOver(path: string): Promise<net.Server> {
  if (existsSync(path)) unlinkSync(path);
  const thief = net.createServer();
  await new Promise<void>((r) => thief.listen(path, r));
  return thief;
}

async function brokerWithSession(): Promise<{ tmp: string; socketPath: string; broker: ReturnType<typeof createBrokerServer>; client: net.Socket }> {
  const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-own-'));
  const socketPath = join(tmp, 'b.sock');
  const broker = createBrokerServer({ socketPath, userDataDir: tmp, spawnPty: () => fakePty(77), ownershipCheckMs: 0 });
  await waitFor(() => existsSync(`${socketPath}.pid`));
  const { socket } = await request(
    socketPath,
    [hello, encodeControl({ t: 'create', id: 2, sessionId: 'kept', cwd: '/tmp', cols: 80, rows: 24, env: {} })],
    2,
  );
  return { tmp, socketPath, broker, client: socket };
}

describe('socket path ownership', () => {
  it('reports owned while the path still names its own socket', async () => {
    const { broker, client } = await brokerWithSession();
    expect(broker.checkSocketOwnership()).toBe('owned');
    client.destroy();
    await broker.close();
  });

  it('re-binds to a -retired-<pid> path when another broker takes its path, keeping sessions reachable', async () => {
    const { tmp, socketPath, broker, client } = await brokerWithSession();
    const thief = await takeOver(socketPath);
    const thiefIno = statSync(socketPath).ino;

    expect(broker.checkSocketOwnership()).toBe('rebound');

    const retired = join(tmp, `b-retired-${process.pid}.sock`);
    await waitFor(() => existsSync(retired) && existsSync(`${retired}.pid`));
    expect(broker.socketPath).toBe(retired);
    expect(readFileSync(`${retired}.pid`, 'utf8').trim()).toBe(String(process.pid));

    const { frames, socket } = await request(retired, [hello, encodeControl({ t: 'list', id: 3 })], 2);
    expect(frames[1]).toMatchObject({ message: { id: 3, ok: true, sessions: [expect.objectContaining({ sessionId: 'kept' })] } });

    // The successor's socket file is untouched — by the re-bind and by the close that follows.
    expect(statSync(socketPath).ino).toBe(thiefIno);
    socket.destroy();
    client.destroy();
    await broker.close();
    expect(existsSync(socketPath)).toBe(true);
    expect(statSync(socketPath).ino).toBe(thiefIno);
    await new Promise<void>((r) => thief.close(() => r()));
  });

  it('re-binds when its socket file is removed out from under it', async () => {
    const { tmp, socketPath, broker, client } = await brokerWithSession();
    unlinkSync(socketPath);
    expect(broker.checkSocketOwnership()).toBe('rebound');
    const retired = join(tmp, `b-retired-${process.pid}.sock`);
    await waitFor(() => existsSync(retired));
    expect(broker.checkSocketOwnership()).toBe('owned');
    client.destroy();
    await broker.close();
  });

  it('exits without touching the successor files when it has no sessions', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-own-'));
    const socketPath = join(tmp, 'b.sock');
    const broker = createBrokerServer({ socketPath, userDataDir: tmp, ownershipCheckMs: 0 });
    await waitFor(() => existsSync(`${socketPath}.pid`));
    const thief = await takeOver(socketPath);

    expect(broker.checkSocketOwnership()).toBe('exiting');
    await broker.closed;

    expect(existsSync(socketPath)).toBe(true);
    await new Promise<void>((r) => thief.close(() => r()));
  });
});
