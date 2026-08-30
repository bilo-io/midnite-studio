import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createFrameDecoder,
  encodeControl,
  PROTOCOL,
  type Frame,
} from './protocol';
import { createBrokerServer, type IPtyLike, type SpawnPtyFn } from './server';

function createFakePty(pid = 1000): {
  pty: IPtyLike;
  emitData: (data: string) => void;
  emitExit: (exitCode: number, signal?: number) => void;
} {
  let dataListener: ((data: string) => void) | null = null;
  let exitListener: ((e: { exitCode: number; signal?: number }) => void) | null = null;

  const pty: IPtyLike = {
    pid,
    onData: (l) => {
      dataListener = l;
      return { dispose: () => {} };
    },
    onExit: (l) => {
      exitListener = l;
      return { dispose: () => {} };
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => {
      exitListener?.({ exitCode: 0 });
    }),
  };

  return {
    pty,
    emitData: (d) => dataListener?.(d),
    emitExit: (code, sig) => exitListener?.({ exitCode: code, signal: sig }),
  };
}

async function connectAndSend(
  socketPath: string,
  framesToSend: Buffer[],
): Promise<{ frames: Frame[]; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder();
    const frames: Frame[] = [];

    socket.on('connect', () => {
      for (const f of framesToSend) socket.write(f);
    });

    socket.on('data', (chunk) => {
      try {
        frames.push(...decoder.push(chunk));
      } catch (e) {
        reject(e);
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    // Give a short delay to collect replies
    setTimeout(() => {
      resolve({ frames, socket });
    }, 50);
  });
}

describe('broker server', () => {
  it('rejects hello with protocol mismatch and closes the socket', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'b.sock');

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
    });

    // Wait for server to listen
    await new Promise((r) => setTimeout(r, 20));

    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder();
    const frames: Frame[] = [];
    let closed = false;

    socket.on('data', (chunk) => {
      frames.push(...decoder.push(chunk));
    });

    socket.on('close', () => {
      closed = true;
    });

    socket.write(
      encodeControl({
        t: 'hello',
        id: 1,
        protocol: 99,
        appVersion: '0.1.0',
        pid: process.pid,
      }),
    );

    await new Promise((r) => setTimeout(r, 60));

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      type: 0x00,
      message: {
        t: 'reply',
        id: 1,
        ok: false,
        code: 'protocol',
        message: expect.stringContaining('Protocol mismatch'),
      },
    });
    expect(closed).toBe(true);

    await broker.close();
  });

  it('unlinks pre-existing dead socket file and listens cleanly', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'dead.sock');
    writeFileSync(socketPath, 'dead');

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
    });

    await new Promise((r) => setTimeout(r, 20));

    const { frames, socket } = await connectAndSend(socketPath, [
      encodeControl({
        t: 'hello',
        id: 1,
        protocol: PROTOCOL,
        appVersion: '0.12.0',
        pid: process.pid,
      }),
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      type: 0x00,
      message: {
        t: 'reply',
        id: 1,
        ok: true,
        protocol: PROTOCOL,
        pid: process.pid,
        appVersion: '0.12.0',
      },
    });

    socket.destroy();
    await broker.close();
  });

  it('sets socket and pidfile permissions to 0600', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'perms.sock');

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
    });

    await new Promise((r) => setTimeout(r, 30));

    const socketStat = statSync(socketPath);
    expect(socketStat.mode & 0o777).toBe(0o600);

    const pidStat = statSync(broker.pidPath);
    expect(pidStat.mode & 0o777).toBe(0o600);

    await broker.close();
  });

  it('resolves closed promise when idle after last session is killed and no clients connected', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'idle.sock');

    const fake = createFakePty(5555);
    const spawnPty: SpawnPtyFn = () => fake.pty;

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      spawnPty,
      idleGraceMs: 50, // Short idle timeout for test
    });

    await new Promise((r) => setTimeout(r, 20));

    const { socket } = await connectAndSend(socketPath, [
      encodeControl({
        t: 'hello',
        id: 1,
        protocol: PROTOCOL,
        appVersion: '0.12.0',
        pid: process.pid,
      }),
      encodeControl({
        t: 'create',
        id: 2,
        sessionId: 'sess-1',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
        env: {},
      }),
    ]);

    await new Promise((r) => setTimeout(r, 20));
    expect(broker.sessionCount()).toBe(1);

    // Disconnect client
    socket.destroy();

    // Kill the session
    fake.emitExit(0);
    expect(broker.sessionCount()).toBe(0);

    // Should resolve closed promise after idleGraceMs
    await expect(broker.closed).resolves.toBeUndefined();
  });

  it('emits exit exactly once and no data frames after kill', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'kill.sock');

    const fake = createFakePty(7777);
    const spawnPty: SpawnPtyFn = () => fake.pty;

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      spawnPty,
    });

    await new Promise((r) => setTimeout(r, 20));

    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder();
    const frames: Frame[] = [];

    socket.on('data', (chunk) => {
      frames.push(...decoder.push(chunk));
    });

    socket.write(
      encodeControl({
        t: 'hello',
        id: 1,
        protocol: PROTOCOL,
        appVersion: '0.12.0',
        pid: process.pid,
      }),
    );

    socket.write(
      encodeControl({
        t: 'create',
        id: 2,
        sessionId: 'sess-2',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
        env: {},
      }),
    );

    await new Promise((r) => setTimeout(r, 30));

    const createReply = frames.find(
      (f): f is Extract<Frame, { type: 0x00 }> =>
        f.type === 0x00 && f.message.t === 'reply' && f.message.id === 2,
    );
    expect(createReply).toBeDefined();
    const ptyId = (createReply?.message as { ptyId: string }).ptyId;

    // Send data
    fake.emitData('hello world\n');
    await new Promise((r) => setTimeout(r, 20));

    // Now send kill
    socket.write(encodeControl({ t: 'kill', id: 3, ptyId }));
    await new Promise((r) => setTimeout(r, 30));

    // Try to emit more data after kill
    fake.emitData('ghost data\n');
    await new Promise((r) => setTimeout(r, 20));

    const exitFrames = frames.filter((f) => f.type === 0x00 && f.message.t === 'exit');
    expect(exitFrames).toHaveLength(1);

    const ghostDataFrames = frames.filter(
      (f) => f.type === 0x01 && new TextDecoder().decode(f.data).includes('ghost data'),
    );
    expect(ghostDataFrames).toHaveLength(0);

    socket.destroy();
    await broker.close();
  });
});
