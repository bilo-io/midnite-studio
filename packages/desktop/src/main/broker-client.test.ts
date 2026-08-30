import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createBrokerServer } from '../broker/server';
import { createBrokerClient } from './broker-client';

describe('broker client', () => {
  it('connects to an existing broker server and performs handshake', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-client-'));
    const socketPath = join(tmp, 'broker', '0.12.0-dev.sock');

    const broker = createBrokerServer({
      socketPath,
      userDataDir: tmp,
      appVersion: '0.12.0',
    });

    await new Promise((r) => setTimeout(r, 30));

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
    });

    await client.init();

    expect(client.getStatus()).toEqual({ mode: 'broker' });
    expect(client.isAlive()).toBe(true);

    await client.disconnect();
    await broker.close();
  });

  it('falls back to inproc mode when broker cannot be spawned or reached', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-client-'));

    const mockSpawn = vi.fn(() => {
      const ee = new EventEmitter();
      return ee as unknown as ChildProcess;
    });

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
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
    const tmp = mkdtempSync(join(tmpdir(), 'mstudio-broker-client-'));
    process.env['MSTUDIO_PTY_INPROC'] = '1';

    const client = createBrokerClient({
      userDataDir: tmp,
      appVersion: '0.12.0',
      isPackaged: false,
    });

    await client.init();

    expect(client.getStatus()).toEqual({
      mode: 'inproc',
      reason: 'MSTUDIO_PTY_INPROC=1',
    });

    delete process.env['MSTUDIO_PTY_INPROC'];
  });
});
