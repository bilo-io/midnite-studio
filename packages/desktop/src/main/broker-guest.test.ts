import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createBrokerService,
  createSharedBroker,
  GUEST_CANNOT_CREATE,
  writeRuntimeHostRecord,
  type BrokerService,
} from '@midnite/studio-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrokerServer, type BrokerServer, type IPtyLike } from '../broker/server';

/**
 * V5's terminal clause, across two apps' *builds*: Studio (the runtime host) runs its broker under its
 * own data directory with a build-fingerprinted name another app cannot compute, and records it in the
 * runtime host record. A guest (Monitor, Coder) reads the record and attaches — never spawning,
 * retiring or shutting down anything. The broker is desktop's real server with a fake pty, on sockets
 * in temp dirs; never the user's own broker.
 */

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function fakePty(pid: number): { pty: IPtyLike; written: string[]; emit: (data: string) => void } {
  let onData: ((data: string) => void) | null = null;
  let onExit: ((e: { exitCode: number }) => void) | null = null;
  const written: string[] = [];
  const pty: IPtyLike = {
    pid,
    onData: (l) => ((onData = l), {}),
    onExit: (l) => ((onExit = l), {}),
    write: (data: string) => void written.push(data),
    resize: vi.fn(),
    kill: vi.fn(() => onExit?.({ exitCode: 0 })),
  };
  return { pty, written, emit: (d) => onData?.(d) };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

/** Studio's side: its broker identity under its own data dir, the real server, and the record it writes. */
async function studioHost(studioData: string, runtimeDir: string, pty: IPtyLike) {
  const brokerScriptPath = join(studioData, 'broker.js');
  writeFileSync(brokerScriptPath, '// stand-in for Studio’s bundled broker\n');
  const service: BrokerService = createBrokerService({ dataDir: studioData, appVersion: '0.30.0', isPackaged: false, brokerScriptPath });
  const server = startServer(service.socketPath, studioData, service.buildId, pty);
  await waitFor(() => server.server.listening);
  writeRuntimeHostRecord(runtimeDir, {
    version: 1,
    host: 'studio',
    pid: process.pid,
    writtenAt: Date.now(),
    broker: { socketPath: service.socketPath, directory: join(studioData, 'broker') },
  });
  const studio = service.attach('studio');
  await studio.init();
  cleanups.push(() => studio.disconnect());
  return { service, server, studio };
}

function startServer(socketPath: string, dir: string, buildId: string, pty: IPtyLike): BrokerServer {
  const server = createBrokerServer({ socketPath, userDataDir: dir, appVersion: '0.30.0', buildId, spawnPty: () => pty });
  cleanups.push(() => server.close());
  return server;
}

const temp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

function guestOf(runtimeDir: string, appId: 'monitor' | 'coder') {
  const shared = createSharedBroker({ runtimeDirectory: runtimeDir, appId });
  cleanups.push(() => shared.dispose());
  return shared;
}

describe('shared broker — a terminal Studio opened, reached from another app', () => {
  it('lists, streams, writes to, resizes and snapshots the host’s session; creating and killing stay the host’s', async () => {
    const studioData = temp('mbg-s-');
    const runtimeDir = temp('mbg-r-');
    const fake = fakePty(5150);
    const { server, studio } = await studioHost(studioData, runtimeDir, fake.pty);
    const created = await studio.createPty({ sessionId: 'studio-sess', cwd: studioData, cols: 80, rows: 24, env: {} });
    expect(created.ok).toBe(true);
    const { ptyId } = created as { ptyId: string };

    const monitor = guestOf(runtimeDir, 'monitor');
    const listed = await monitor.listSessions();
    expect(listed.status).toEqual({ mode: 'broker' });
    expect(listed.sessions).toEqual([expect.objectContaining({ ptyId, sessionId: 'studio-sess', pid: 5150, cwd: studioData, legacy: false })]);

    const guest = (await monitor.client())!;
    const seen: string[] = [];
    guest.onData((id, bytes) => id === ptyId && seen.push(new TextDecoder().decode(bytes)));
    fake.emit('build ok\r\n');
    await waitFor(() => seen.join('') === 'build ok\r\n');
    guest.writePty(ptyId, 'ls\r');
    await waitFor(() => fake.written.join('') === 'ls\r');
    expect(await guest.resizePty(ptyId, 100, 30)).toBe(true);
    expect(new TextDecoder().decode(await guest.snapshot('studio-sess'))).toContain('build ok');

    expect(await guest.createPty({ sessionId: 'x', cwd: studioData, cols: 80, rows: 24, env: {} })).toEqual({ ok: false, message: GUEST_CANNOT_CREATE });
    expect(await guest.killPty(ptyId)).toBe(false);
    expect(server.sessionCount()).toBe(1);
  });

  it('never shuts down an empty broker or unlinks a dead socket it finds — that is the host’s call', async () => {
    const studioData = temp('mbg-s-');
    const runtimeDir = temp('mbg-r-');
    const { server } = await studioHost(studioData, runtimeDir, fakePty(1).pty);
    // An older build's broker beside it, with no sessions — a host client would shut this one down.
    const legacy = startServer(join(studioData, 'broker', '0.29.0-old-dev.sock'), studioData, 'old', fakePty(2).pty);
    await waitFor(() => legacy.server.listening);
    const dead = join(studioData, 'broker', '0.28.0-dead-dev.sock');
    writeFileSync(dead, '');

    const coder = guestOf(runtimeDir, 'coder');
    expect((await coder.listSessions()).sessions).toEqual([]);
    await new Promise((r) => setTimeout(r, 100));
    expect(server.server.listening).toBe(true);
    expect(legacy.server.listening).toBe(true);
    expect(existsSync(dead)).toBe(true);
  });

  it('reports no broker until a host records one, then finds it', async () => {
    const runtimeDir = temp('mbg-r-');
    const monitor = guestOf(runtimeDir, 'monitor');
    expect(await monitor.listSessions()).toEqual({ sessions: [], status: { mode: 'inproc', reason: 'no shared terminal broker is running' } });

    const studioData = temp('mbg-s-');
    const { studio } = await studioHost(studioData, runtimeDir, fakePty(3).pty);
    // Detach the guest before the host's server closes (cleanups run in reverse).
    cleanups.push(() => monitor.dispose());
    await studio.createPty({ sessionId: 'late', cwd: studioData, cols: 80, rows: 24, env: {} });
    expect((await monitor.listSessions()).sessions.map((s) => s.sessionId)).toEqual(['late']);
  });
});
