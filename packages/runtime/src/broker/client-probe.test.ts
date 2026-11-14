import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openBrokerClient } from './client';

let dir: string;
let sockPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'broker-probe-'));
  sockPath = join(dir, 'old-build.sock');
  writeFileSync(sockPath, '');
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function client(connectSocket: (p: string) => net.Socket) {
  return openBrokerClient({
    brokerDir: dir,
    dataDir: dir,
    appVersion: '0.0.0-test',
    isPackaged: false,
    brokerScriptPath: join(dir, 'broker.js'),
    buildId: 'new-build',
    connectSocket,
  });
}

describe('legacy broker probe', () => {
  it('leaves a socket file in place when the connect times out (a busy broker)', async () => {
    vi.useFakeTimers();
    const c = client(() => new net.Socket()); // never connects, never errors
    const run = c.rescanPeers();
    await vi.advanceTimersByTimeAsync(600);
    await run;
    expect(existsSync(sockPath)).toBe(true);
  });

  it('removes a socket file when the connect is refused (nothing listening)', async () => {
    const c = client(() => {
      const s = new net.Socket();
      process.nextTick(() => s.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })));
      return s;
    });
    await c.rescanPeers();
    expect(existsSync(sockPath)).toBe(false);
  });

  it('connects to a peer once when rescans overlap', async () => {
    vi.useFakeTimers();
    let connects = 0;
    const c = client(() => {
      connects++;
      return new net.Socket();
    });
    const a = c.rescanPeers();
    const b = c.rescanPeers();
    await vi.advanceTimersByTimeAsync(600);
    await Promise.all([a, b]);
    expect(connects).toBe(1);
  });
});
