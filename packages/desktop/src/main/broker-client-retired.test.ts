import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { encodeControl, PROTOCOL } from '../broker/protocol';
import { createBrokerServer, type IPtyLike } from '../broker/server';
import { brokerSocketName, createBrokerClient } from './broker-client';

/**
 * Short /tmp dirs: a Unix socket path is capped at 104 bytes and the OS temp dir alone is ~50.
 *
 * Retired brokers (2026-11-14): two `-retired-<pid>` brokers of one build held six agent sessions while the
 * current build ran its own primary. These pin that a client adopts both, lists their sessions as legacy,
 * shuts each down once its last session is ended, and sweeps the pid/token files dead brokers left behind.
 */

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakePty(pid: number): IPtyLike {
  let onExit: ((e: { exitCode: number }) => void) | null = null;
  return {
    pid,
    onData: () => ({}),
    onExit: (l) => {
      onExit = l;
      return {};
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => onExit?.({ exitCode: 0 })),
  };
}

async function seedSession(socketPath: string, sessionId: string): Promise<void> {
  const raw = net.connect(socketPath);
  await new Promise<void>((resolve) => raw.once('connect', () => resolve()));
  raw.write(encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.0.6', pid: process.pid, role: 'host' }));
  raw.write(encodeControl({ t: 'create', id: 2, sessionId, cwd: '/tmp', cols: 80, rows: 24, env: {} }));
  await tick(40);
  raw.destroy();
}

/** A pid no process holds — far above any macOS or Linux pid_max. */
const DEAD_PID = 2_147_483_000;

describe('broker client and retired peers', () => {
  it('adopts every -retired- broker, lists their sessions as legacy, and shuts each down when emptied', async () => {
    const tmp = mkdtempSync('/tmp/msr-');
    const brokerDir = join(tmp, 'broker');
    const base = brokerSocketName('0.0.6', 'old', false).replace(/\.sock$/, '');

    const retiredA = join(brokerDir, `${base}-retired-1.sock`);
    const retiredB = join(brokerDir, `${base}-retired-2.sock`);
    const a = createBrokerServer({ socketPath: retiredA, userDataDir: tmp, spawnPty: () => fakePty(1), ownershipCheckMs: 0 });
    const b = createBrokerServer({ socketPath: retiredB, userDataDir: tmp, spawnPty: () => fakePty(2), ownershipCheckMs: 0 });
    const primaryPath = join(brokerDir, brokerSocketName('0.0.6', 'new', false));
    const primary = createBrokerServer({ socketPath: primaryPath, userDataDir: tmp, spawnPty: () => fakePty(3), ownershipCheckMs: 0 });
    await tick(30);
    await seedSession(retiredA, 'agent-1');
    await seedSession(retiredA, 'agent-2');
    await seedSession(retiredB, 'agent-3');

    const client = createBrokerClient({ userDataDir: tmp, appVersion: '0.0.6', isPackaged: false, buildId: 'new' });
    await client.init();

    const listed = await client.listSessions();
    expect(listed.map((s) => s.sessionId).sort()).toEqual(['agent-1', 'agent-2', 'agent-3']);
    expect(listed.every((s) => s.legacy)).toBe(true);
    expect(listed.every((s) => s.cwd === '/tmp')).toBe(true);

    // Ending a retired peer's last session shuts that peer down; the other stays until its own ends.
    const ptyOf = (id: string) => listed.find((s) => s.sessionId === id)!.ptyId;
    expect(await client.killPty(ptyOf('agent-3'))).toBe(true);
    await expect(b.closed).resolves.toBeUndefined();
    expect(a.sessionCount()).toBe(2);

    expect(await client.killPty(ptyOf('agent-1'))).toBe(true);
    await tick(30);
    expect(a.sessionCount()).toBe(1);
    expect(await client.killPty(ptyOf('agent-2'))).toBe(true);
    await expect(a.closed).resolves.toBeUndefined();
    expect(client.isAlive()).toBe(true);

    await client.disconnect();
    await primary.close();
  });

  it('sweeps the pid and token files of dead brokers and keeps those of live ones', async () => {
    const tmp = mkdtempSync('/tmp/mss-');
    const brokerDir = join(tmp, 'broker');
    mkdirSync(brokerDir, { recursive: true });
    const primaryPath = join(brokerDir, brokerSocketName('0.0.6', 'new', false));
    const primary = createBrokerServer({ socketPath: primaryPath, userDataDir: tmp, spawnPty: () => fakePty(3), ownershipCheckMs: 0 });
    await tick(30);

    const old = Date.now() / 1000 - 3600;
    const leftover = (name: string, body: string) => {
      const path = join(brokerDir, name);
      writeFileSync(path, body);
      utimesSync(path, old, old);
      return path;
    };
    const deadPid = leftover('0.0.4-aaaa.sock.pid', `${DEAD_PID}\n`);
    const deadToken = leftover('0.0.4-aaaa.sock.token', 'x');
    const deadRetiredToken = leftover(`0.0.5-bbbb-retired-${DEAD_PID}.sock.token`, 'x');
    const livePid = leftover('0.0.5-cccc.sock.pid', `${process.pid}\n`);
    const liveToken = leftover('0.0.5-cccc.sock.token', 'x');
    const liveRetiredToken = leftover(`0.0.5-dddd-retired-${process.pid}.sock.token`, 'x');

    const client = createBrokerClient({ userDataDir: tmp, appVersion: '0.0.6', isPackaged: false, buildId: 'new' });
    await client.init();

    expect([deadPid, deadToken, deadRetiredToken].map(existsSync)).toEqual([false, false, false]);
    expect([livePid, liveToken, liveRetiredToken].map(existsSync)).toEqual([true, true, true]);
    // The primary's own files are untouched.
    expect(existsSync(primaryPath)).toBe(true);
    expect(existsSync(`${primaryPath}.pid`)).toBe(true);

    await client.disconnect();
    await primary.close();
  });
});
