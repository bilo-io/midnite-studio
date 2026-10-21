import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createBrokerService, type BrokerService } from '@midnite/studio-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrokerServer, type BrokerServer, type IPtyLike } from '../broker/server';

/**
 * Phase 113 Theme D item 5: "broker attach from two apps".
 *
 * Two apps attach to the runtime's broker service — here two clients in one
 * test process, which is the same thing at the socket: each `attach` opens
 * its own connection, exactly as two app processes would. The broker is the
 * real server (desktop's, the one that loads node-pty in production) with a
 * fake pty, on a socket in a temp dir — never the user's own broker.
 */

/** Poll `check` until it holds, for a suite that runs in parallel on a loaded machine. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function createFakePty(pid: number): { pty: IPtyLike; written: string[]; emitData: (data: string) => void } {
  let dataListener: ((data: string) => void) | null = null;
  let exitListener: ((e: { exitCode: number; signal?: number }) => void) | null = null;
  const written: string[] = [];
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
    write: (data: string) => {
      written.push(data);
    },
    resize: vi.fn(),
    kill: vi.fn(() => exitListener?.({ exitCode: 0 })),
  };
  return { pty, written, emitData: (d) => dataListener?.(d) };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

/** A runtime broker service on a temp data dir, with a broker script on disk to fingerprint. */
function runtimeBrokerIn(dir: string, spawnBrokerProcess?: () => ChildProcess): BrokerService {
  const brokerScriptPath = join(dir, 'broker.js');
  writeFileSync(brokerScriptPath, '// stand-in for the bundled broker\n');
  return createBrokerService({
    dataDir: dir,
    appVersion: '0.20.0',
    isPackaged: false,
    brokerScriptPath,
    ...(spawnBrokerProcess ? { spawnBrokerProcess } : {}),
  });
}

function startServer(service: BrokerService, dir: string, pty: IPtyLike): BrokerServer {
  const server = createBrokerServer({
    socketPath: service.socketPath,
    userDataDir: dir,
    appVersion: '0.20.0',
    buildId: service.buildId,
    spawnPty: () => pty,
  });
  cleanups.push(() => server.close());
  return server;
}

describe('runtime broker — two apps, one broker', () => {
  it('a session created by one app is listed by, writable from and streams to the other', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'msb-two-apps-'));
    const service = runtimeBrokerIn(dir);
    const fake = createFakePty(4242);
    const server = startServer(service, dir, fake.pty);
    await waitFor(() => server.server.listening);

    const studio = service.attach('studio');
    const coder = service.attach('coder');
    cleanups.push(() => studio.disconnect(), () => coder.disconnect());
    await studio.init();
    await coder.init();
    expect(studio.getStatus()).toEqual({ mode: 'broker' });
    expect(coder.getStatus()).toEqual({ mode: 'broker' });
    await waitFor(() => server.clientCount() === 2);

    const created = await studio.createPty({ sessionId: 'shared-sess', cwd: dir, cols: 80, rows: 24, env: {} });
    expect(created).toMatchObject({ ok: true, pid: 4242 });
    const { ptyId } = created as { ptyId: string };

    // Listed by the other app, as a live (not legacy) session of the current broker.
    const listed = await coder.listSessions();
    expect(listed).toEqual([
      expect.objectContaining({ ptyId, sessionId: 'shared-sess', pid: 4242, legacy: false }),
    ]);

    // Attachable from the other app: its input reaches the pty…
    coder.writePty(ptyId, 'echo hi\r');
    await waitFor(() => fake.written.join('') === 'echo hi\r');
    expect(await coder.resizePty(ptyId, 120, 40)).toBe(true);

    // …and the pty's output reaches both apps.
    const seenByStudio: string[] = [];
    const seenByCoder: string[] = [];
    const decoder = new TextDecoder();
    studio.onData((id, bytes) => id === ptyId && seenByStudio.push(decoder.decode(bytes)));
    coder.onData((id, bytes) => id === ptyId && seenByCoder.push(decoder.decode(bytes)));
    fake.emitData('hi\r\n');
    await waitFor(() => seenByStudio.join('') === 'hi\r\n' && seenByCoder.join('') === 'hi\r\n');

    // One app leaving does not take the session with it.
    await studio.disconnect();
    expect((await coder.listSessions()).map((s) => s.sessionId)).toEqual(['shared-sess']);
    expect(server.sessionCount()).toBe(1);
  });

  it('the first app to attach spawns the broker; the second finds it rather than spawning another', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'msb-two-apps-'));
    const fake = createFakePty(7);
    let service: BrokerService | null = null;
    const spawn = vi.fn((): ChildProcess => {
      // The "detached" broker is really started in-process, on the socket the client asked for.
      startServer(service!, dir, fake.pty);
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = () => {};
      return child as unknown as ChildProcess;
    });
    service = runtimeBrokerIn(dir, spawn);

    const agents = service.attach('agents');
    const coder = service.attach('coder');
    await agents.init();
    await coder.init();
    // After init, so cleanup (which runs in reverse) detaches both before the spawned server closes.
    cleanups.push(() => agents.disconnect(), () => coder.disconnect());

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(agents.getStatus()).toEqual({ mode: 'broker' });
    expect(coder.getStatus()).toEqual({ mode: 'broker' });

    const created = await coder.createPty({ sessionId: 'from-coder', cwd: dir, cols: 80, rows: 24, env: {} });
    expect(created.ok).toBe(true);
    expect((await agents.listSessions()).map((s) => s.sessionId)).toEqual(['from-coder']);
  });
});
