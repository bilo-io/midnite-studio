import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { encodeControl, PROTOCOL } from '../broker/protocol';
import { createBrokerServer, type BrokerServer, type IPtyLike } from '../broker/server';
import { brokerSocketName, createBrokerClient, fingerprintFile } from './broker-client';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `check` until it holds, for a suite that runs in parallel on a loaded machine. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function createFakePty(pid: number): {
  pty: IPtyLike;
  emitData: (data: string) => void;
} {
  let dataListener: ((data: string) => void) | null = null;
  let exitListener: ((e: { exitCode: number; signal?: number }) => void) | null = null;
  const pty: IPtyLike = {
    pid,
    onData: (l) => {
      dataListener = l;
      return {};
    },
    onExit: (l) => {
      exitListener = l;
      return {};
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => exitListener?.({ exitCode: 0 })),
  };
  return { pty, emitData: (d) => dataListener?.(d) };
}

/** A fake detached child: the "spawned" broker is really started in-process by `start`. */
function fakeSpawner(start: () => void) {
  return vi.fn((): ChildProcess => {
    start();
    const ee = new EventEmitter() as EventEmitter & { unref: () => void };
    ee.unref = () => {};
    return ee as unknown as ChildProcess;
  });
}

/** Seed one live session into a broker the way a previous app instance would have. */
async function seedSession(socketPath: string, sessionId: string): Promise<void> {
  const raw = net.connect(socketPath);
  await new Promise<void>((resolve) => raw.once('connect', () => resolve()));
  raw.write(encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.0.0', pid: process.pid }));
  raw.write(encodeControl({ t: 'create', id: 2, sessionId, cwd: '/tmp', cols: 80, rows: 24, env: {} }));
  await tick(40);
  raw.destroy();
}

describe('broker socket name', () => {
  it('carries the version, the build fingerprint and the dev marker', () => {
    expect(brokerSocketName('0.1.0', 'abcdef12', true)).toBe('0.1.0-abcdef12.sock');
    expect(brokerSocketName('0.1.0', 'abcdef12', false)).toBe('0.1.0-abcdef12-dev.sock');
  });

  it('fingerprints a missing script as unknown rather than throwing', () => {
    expect(fingerprintFile('/nonexistent/broker.js')).toBe('unknown');
    expect(fingerprintFile(__filename)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('broker client', () => {
  it('connects to an existing broker server and performs handshake', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
      buildId: 'b1',
    });

    await tick(30);

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
    });

    await client.init();

    expect(client.getStatus()).toEqual({ mode: 'broker' });
    expect(client.isAlive()).toBe(true);

    await client.disconnect();
    await broker.close();
  });

  it('a multi-megabyte paste sent as many writePty calls arrives byte-complete and in order (Phase 51 Theme F)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));
    const fake = createFakePty(1);
    const received: string[] = [];
    fake.pty.write = vi.fn((data: string) => {
      received.push(data);
    });

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
      buildId: 'b1',
      spawnPty: () => fake.pty,
    });
    await tick(30);

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
    });
    await client.init();

    const created = await client.createPty({ sessionId: 'paste-sess', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(created.ok).toBe(true);
    const ptyId = (created as { ptyId: string }).ptyId;

    // A paste delivered as many small `writePty` calls, the way the renderer
    // hands off `term.onData` one chunk at a time.
    const original = Array.from({ length: 20_000 }, (_, i) => `line ${i}\n`).join('');
    const pieces = original.match(/.{1,64}/gs) ?? [];
    for (const piece of pieces) client.writePty(ptyId, piece);

    await waitFor(() => received.join('').length >= original.length, 5000);

    expect(received.join('')).toBe(original);

    await client.disconnect();
    await broker.close();
  });

  it('falls back to inproc mode when broker cannot be spawned or reached', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));

    const mockSpawn = vi.fn(() => {
      const ee = new EventEmitter();
      return ee as unknown as ChildProcess;
    });

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
      spawnBrokerProcess: mockSpawn,
      spawnMaxAttempts: 1,
      spawnConnectTimeoutMs: 100,
    });

    await client.init();

    expect(client.getStatus()).toEqual({
      mode: 'inproc',
      reason: expect.stringContaining('failed to spawn'),
    });
    expect(mockSpawn).toHaveBeenCalled();
  });

  it('falls back to inproc immediately when MSTUDIO_PTY_INPROC=1 is set', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    process.env['MSTUDIO_PTY_INPROC'] = '1';

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
    });

    await client.init();

    expect(client.getStatus()).toEqual({
      mode: 'inproc',
      reason: 'MSTUDIO_PTY_INPROC=1',
    });

    delete process.env['MSTUDIO_PTY_INPROC'];
  });

  it('passes its build id to the broker it spawns', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));

    let spawned: BrokerServer | null = null;
    const spawner = vi.fn((_script: string, args: string[]): ChildProcess => {
      expect(args).toContain('--build-id');
      expect(args[args.indexOf('--build-id') + 1]).toBe('b1');
      spawned = createBrokerServer({ socketPath, userDataDir: tmp, buildId: 'b1' });
      const ee = new EventEmitter() as EventEmitter & { unref: () => void };
      ee.unref = () => {};
      return ee as unknown as ChildProcess;
    });

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
      spawnBrokerProcess: spawner,
      spawnMaxAttempts: 1,
      spawnConnectTimeoutMs: 1000,
    });
    await client.init();

    expect(client.getStatus()).toEqual({ mode: 'broker' });
    expect(spawner).toHaveBeenCalledTimes(1);

    await client.disconnect();
    await spawned!.close();
  });

  it('adopts a previous build\'s broker as legacy: lists, routes to, and retires it', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const brokerDir = join(tmp, 'broker');

    // A broker left behind by an older build, holding one live shell.
    const legacyPath = join(brokerDir, brokerSocketName('0.12.0', 'old', false));
    const legacyFake = createFakePty(4242);
    const legacyBroker = createBrokerServer({
      socketPath: legacyPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
      buildId: 'old',
      spawnPty: () => legacyFake.pty,
    });
    await tick(30);
    await seedSession(legacyPath, 'legacy-sess');
    expect(legacyBroker.sessionCount()).toBe(1);

    // An even older one with nothing left in it.
    const emptyPath = join(brokerDir, brokerSocketName('0.11.0', 'oldr', false));
    const emptyBroker = createBrokerServer({ socketPath: emptyPath, userDataDir: tmp, buildId: 'oldr' });

    // This build's own broker.
    const primaryPath = join(brokerDir, brokerSocketName('0.12.0', 'new', false));
    const primaryFake = createFakePty(1);
    const primaryBroker = createBrokerServer({
      socketPath: primaryPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
      buildId: 'new',
      spawnPty: () => primaryFake.pty,
    });
    await tick(30);

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'new',
    });
    await client.init();
    expect(client.getStatus()).toEqual({ mode: 'broker' });

    // The empty legacy broker is asked to leave; the one with a session stays.
    await expect(emptyBroker.closed).resolves.toBeUndefined();
    expect(legacyBroker.clientCount()).toBe(1);

    // Its session is listed alongside the primary's (none yet), tagged so
    // main can mark it `asleep` (`pty-service.ts`'s `livePtyFor`) instead of
    // offering a live pane over a process the current build no longer owns.
    const sessions = await client.listSessions();
    expect(sessions.map((s) => s.sessionId)).toEqual(['legacy-sess']);
    expect(sessions[0]!.legacy).toBe(true);
    const legacyPtyId = sessions[0]!.ptyId;

    // Input is routed to the broker that owns the pty, not the primary.
    client.writePty(legacyPtyId, 'ls\n');
    await tick(30);
    expect(legacyFake.pty.write).toHaveBeenCalledWith('ls\n');
    expect(await client.resizePty(legacyPtyId, 100, 40)).toBe(true);
    expect(legacyFake.pty.resize).toHaveBeenCalledWith(100, 40);

    // And its output reaches this client.
    const seen: string[] = [];
    client.onData((id, bytes) => {
      if (id === legacyPtyId) seen.push(new TextDecoder().decode(bytes));
    });
    legacyFake.emitData('hello from the past');
    await tick(50);
    expect(seen).toEqual(['hello from the past']);

    // A new pty goes to the primary, and both are listed.
    const created = await client.createPty({ sessionId: 'new-sess', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(created.ok).toBe(true);
    expect(primaryBroker.sessionCount()).toBe(1);
    expect(legacyBroker.sessionCount()).toBe(1);
    const both = await client.listSessions();
    expect(both.map((s) => s.sessionId).sort()).toEqual(['legacy-sess', 'new-sess']);
    // The primary's own fresh session is never `legacy`, even while a legacy
    // peer's session is still reachable alongside it.
    expect(both.find((s) => s.sessionId === 'new-sess')?.legacy).toBe(false);
    expect(both.find((s) => s.sessionId === 'legacy-sess')?.legacy).toBe(true);

    // Killing the legacy pty is routed to its owner; once it is empty the
    // legacy broker is shut down rather than kept alive by our connection.
    const exits: string[] = [];
    client.onExit((id) => exits.push(id));
    expect(await client.killPty(legacyPtyId)).toBe(true);
    await expect(legacyBroker.closed).resolves.toBeUndefined();
    expect(exits).toEqual([legacyPtyId]);
    expect(client.isAlive()).toBe(true);

    await client.disconnect();
    await primaryBroker.close();
  });

  it('respawns when the primary turns stale mid-life and keeps the old ptys reachable', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));

    let reason: string | null = null;
    const oldFake = createFakePty(10);
    const oldBroker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      buildId: 'b1',
      isStale: () => reason,
      spawnPty: () => oldFake.pty,
    });
    await tick(30);

    const newFake = createFakePty(20);
    let newBroker: BrokerServer | null = null;
    const spawner = fakeSpawner(() => {
      newBroker = createBrokerServer({ socketPath, userDataDir: tmp, buildId: 'b1', spawnPty: () => newFake.pty });
    });

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
      spawnBrokerProcess: spawner,
      spawnMaxAttempts: 1,
      spawnConnectTimeoutMs: 1000,
    });
    await client.init();

    const first = await client.createPty({ sessionId: 'a', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(first.ok).toBe(true);
    expect(spawner).not.toHaveBeenCalled();

    // The bundle is replaced under the running broker.
    reason = 'spawn-helper is gone from disk';

    const second = await client.createPty({ sessionId: 'b', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(second.ok).toBe(true);
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(oldBroker.sessionCount()).toBe(1);
    expect(newBroker!.sessionCount()).toBe(1);

    // The old pty is still served by the old broker.
    client.writePty((first as { ptyId: string }).ptyId, 'still here\n');
    await tick(30);
    expect(oldFake.pty.write).toHaveBeenCalledWith('still here\n');
    expect(newFake.pty.write).not.toHaveBeenCalled();

    // Both show up in one listing.
    expect((await client.listSessions()).map((s) => s.sessionId).sort()).toEqual(['a', 'b']);

    await client.disconnect();
    await oldBroker.close();
    await newBroker!.close();
  });

  it('declines a broker that is already stale at connect time and starts a fresh one', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));

    const staleFake = createFakePty(10);
    const staleBroker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      buildId: 'b1',
      isStale: () => 'spawn-helper is gone from disk',
      spawnPty: () => staleFake.pty,
    });
    await tick(30);

    let fresh: BrokerServer | null = null;
    const spawner = fakeSpawner(() => {
      fresh = createBrokerServer({ socketPath, userDataDir: tmp, buildId: 'b1', spawnPty: () => createFakePty(2).pty });
    });

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
      spawnBrokerProcess: spawner,
      spawnMaxAttempts: 1,
      spawnConnectTimeoutMs: 1000,
    });
    await client.init();

    expect(client.getStatus()).toEqual({ mode: 'broker' });
    expect(spawner).toHaveBeenCalledTimes(1);

    const created = await client.createPty({ sessionId: 's', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(created.ok).toBe(true);
    expect(fresh!.sessionCount()).toBe(1);
    expect(staleBroker.sessionCount()).toBe(0);
    // Nothing to serve, so the stale one was told to go.
    await expect(staleBroker.closed).resolves.toBeUndefined();

    await client.disconnect();
    await fresh!.close();
  });

  it('tells the user to restart when a stale broker cannot be replaced', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msb-'));
    const socketPath = join(tmp, 'broker', brokerSocketName('0.12.0', 'b1', false));

    let reason: string | null = null;
    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      buildId: 'b1',
      isStale: () => reason,
      spawnPty: () => createFakePty(1).pty,
    });
    await tick(30);

    // A spawner that never brings a broker up.
    const spawner = fakeSpawner(() => {});
    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
      buildId: 'b1',
      spawnBrokerProcess: spawner,
      spawnMaxAttempts: 1,
      spawnConnectTimeoutMs: 100,
    });
    await client.init();

    reason = 'spawn-helper is gone from disk';
    const result = await client.createPty({ sessionId: 's', cwd: '/tmp', cols: 80, rows: 24, env: {} });
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/previous build of Midnite Studio.*Restart Midnite Studio to start a fresh one\.$/),
    });
    expect(spawner).toHaveBeenCalledTimes(1);

    await client.disconnect();
    await broker.close();
  });
});
