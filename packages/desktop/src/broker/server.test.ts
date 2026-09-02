import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/** Poll `check` until it holds, for a suite that runs in parallel on a loaded machine. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
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

    /*
      Awaited rather than slept past. This was `setTimeout(60)`, which is a bet
      that the reply and the close both land inside 60ms — and it stops being a
      safe bet the moment another spec file in the same run is also opening unix
      sockets (Phase 36 Theme G added one). Waiting for the event the assertion is
      about removes the race instead of widening it.
    */
    const closePromise = new Promise<void>((resolve, reject) => {
      // Cleared on success: a 5s timer left armed keeps the worker's event loop
      // alive past the test that created it.
      const bail = setTimeout(() => reject(new Error('socket was never closed')), 5_000);
      socket.on('close', () => {
        closed = true;
        clearTimeout(bail);
        resolve();
      });
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

    await closePromise;

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
        buildId: 'unknown',
        stale: false,
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

  it('echoes its build id and a stale flag in the hello reply', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'hello-build.sock');

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      buildId: 'deadbeef',
      isStale: () => 'spawn-helper is gone from disk',
    });
    await new Promise((r) => setTimeout(r, 20));

    const { frames, socket } = await connectAndSend(socketPath, [
      encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.12.0', pid: process.pid }),
    ]);

    expect(frames[0]).toMatchObject({
      type: 0x00,
      message: { t: 'reply', id: 1, ok: true, buildId: 'deadbeef', stale: true },
    });

    socket.destroy();
    await broker.close();
  });

  it('refuses to create a pty once stale, with a stale-broker code rather than spawn-failed', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'stale-create.sock');

    let reason: string | null = null;
    const spawnPty = vi.fn<SpawnPtyFn>(() => createFakePty(1).pty);
    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      spawnPty,
      isStale: () => reason,
    });
    await new Promise((r) => setTimeout(r, 20));

    const create = (id: number) =>
      encodeControl({ t: 'create', id, sessionId: `s-${id}`, cwd: '/tmp', cols: 80, rows: 24, env: {} });
    const hello = encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.12.0', pid: process.pid });

    // Healthy: the spawn goes through.
    const healthy = await connectAndSend(socketPath, [hello, create(2)]);
    expect(healthy.frames[1]).toMatchObject({ message: { id: 2, ok: true } });
    expect(spawnPty).toHaveBeenCalledTimes(1);
    healthy.socket.destroy();

    // The bundle moved under this process: refuse BEFORE trying to spawn.
    reason = 'spawn-helper is gone from disk';
    const stale = await connectAndSend(socketPath, [hello, create(3)]);
    expect(stale.frames[1]).toMatchObject({
      message: {
        id: 3,
        ok: false,
        code: 'stale-broker',
        message: expect.stringMatching(/previous build of Midnite Studio.*spawn-helper is gone from disk\./),
      },
    });
    expect(spawnPty).toHaveBeenCalledTimes(1);
    // The session it already has is untouched.
    expect(broker.sessionCount()).toBe(1);
    stale.socket.destroy();

    await broker.close();
  });

  it('reports a spawn that fails while stale as stale-broker, not as the raw error', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'stale-after.sock');

    // Stale only from the second call: the pre-spawn check passes, the spawn
    // then throws node-pty's errno-less message, and the post-failure check
    // explains it.
    let calls = 0;
    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      spawnPty: () => {
        throw new Error('posix_spawnp failed.');
      },
      isStale: () => (calls++ === 0 ? null : 'spawn-helper is gone from disk'),
    });
    await new Promise((r) => setTimeout(r, 20));

    const { frames, socket } = await connectAndSend(socketPath, [
      encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.12.0', pid: process.pid }),
      encodeControl({ t: 'create', id: 2, sessionId: 's', cwd: '/tmp', cols: 80, rows: 24, env: {} }),
    ]);

    expect(frames[1]).toMatchObject({
      message: { id: 2, ok: false, code: 'stale-broker', message: expect.stringContaining('gone from disk') },
    });

    socket.destroy();
    await broker.close();
  });

  it('retires to a -retired-<pid> path, freeing the original for a successor while keeping its sessions', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-test-'));
    const socketPath = join(tmp, 'shared.sock');

    const fake = createFakePty(11);
    const old = createBrokerServer({ socketPath, userDataDir: tmp, spawnPty: () => fake.pty });
    await new Promise((r) => setTimeout(r, 20));

    const hello = encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.12.0', pid: process.pid });
    const { frames, socket } = await connectAndSend(socketPath, [
      hello,
      encodeControl({ t: 'create', id: 2, sessionId: 's', cwd: '/tmp', cols: 80, rows: 24, env: {} }),
      encodeControl({ t: 'retire', id: 3 }),
    ]);
    const retiredPath = join(tmp, `shared-retired-${process.pid}.sock`);
    expect(frames[2]).toMatchObject({ message: { id: 3, ok: true, socketPath: retiredPath } });

    // The original path is free, the retired one is served, and the session lives on.
    await waitFor(() => existsSync(retiredPath) && existsSync(`${retiredPath}.pid`));
    expect(existsSync(socketPath)).toBe(false);
    expect(readFileSync(`${retiredPath}.pid`, 'utf8').trim()).toBe(String(process.pid));
    expect(old.sessionCount()).toBe(1);
    expect(old.socketPath).toBe(retiredPath);

    // The connection that asked is still live: input still reaches the pty.
    const ptyId = (frames[1] as { message: { ptyId: string } }).message.ptyId;
    socket.write(encodeControl({ t: 'resize', id: 4, ptyId, cols: 10, rows: 5 }));
    await waitFor(() => (fake.pty.resize as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(fake.pty.resize).toHaveBeenCalledWith(10, 5);

    // A successor binds the original path; new connections reach the retired one at its new path.
    const fresh = createBrokerServer({ socketPath, userDataDir: tmp });
    await waitFor(() => existsSync(socketPath));
    const viaRetired = await connectAndSend(retiredPath, [encodeControl({ t: 'list', id: 5 })]);
    expect(viaRetired.frames[0]).toMatchObject({ message: { id: 5, ok: true, sessions: [expect.objectContaining({ sessionId: 's' })] } });
    viaRetired.socket.destroy();
    socket.destroy();

    // Closing the retired broker takes only its own files with it.
    await old.close();
    expect(existsSync(retiredPath)).toBe(false);
    expect(existsSync(socketPath)).toBe(true);

    await fresh.close();
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
