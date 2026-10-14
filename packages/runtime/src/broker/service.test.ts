import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBrokerService } from './service';
import { brokerSocketName, fingerprintFile } from './socket-name';

/**
 * The broker service's identity: every process composed with the same
 * options computes the same socket, which is what puts two apps on one
 * broker. The attach-and-share behaviour itself is proven against the real
 * server in desktop's `broker-two-apps.test.ts` (the server lives there,
 * beside node-pty).
 */
describe('createBrokerService', () => {
  const scriptIn = (dir: string, body: string): string => {
    const path = join(dir, 'broker.js');
    writeFileSync(path, body);
    return path;
  };

  it('names the socket by version and broker-script fingerprint, under <dataDir>/broker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-broker-'));
    const brokerScriptPath = scriptIn(dir, 'v1');
    const service = createBrokerService({ dataDir: dir, appVersion: '1.2.3', isPackaged: true, brokerScriptPath });

    expect(service.buildId).toBe(fingerprintFile(brokerScriptPath));
    expect(service.socketPath).toBe(join(dir, 'broker', brokerSocketName('1.2.3', service.buildId, true)));
  });

  it('gives two processes composed from the same runtime the same socket', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-broker-'));
    const brokerScriptPath = scriptIn(dir, 'v1');
    const options = { dataDir: dir, appVersion: '1.2.3', isPackaged: false, brokerScriptPath };
    expect(createBrokerService(options).socketPath).toBe(createBrokerService(options).socketPath);
  });

  it('moves to a new socket when the runtime’s broker script changes — the old broker becomes a legacy peer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-broker-'));
    const brokerScriptPath = scriptIn(dir, 'v1');
    const before = createBrokerService({ dataDir: dir, appVersion: '1.2.3', isPackaged: false, brokerScriptPath });
    scriptIn(dir, 'v2');
    const after = createBrokerService({ dataDir: dir, appVersion: '1.2.3', isPackaged: false, brokerScriptPath });

    expect(after.socketPath).not.toBe(before.socketPath);
    // Same directory, so the new build's `probeLegacyBrokers` finds the old socket.
    expect(join(after.socketPath, '..')).toBe(join(before.socketPath, '..'));
  });

  it('tags another app’s log lines with its id and leaves Studio’s as they were', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-broker-'));
    const lines: string[] = [];
    const service = createBrokerService({
      dataDir: dir,
      appVersion: '1.2.3',
      isPackaged: false,
      brokerScriptPath: scriptIn(dir, 'v1'),
      buildId: 'b1',
      spawnMaxAttempts: 0,
      log: (line) => lines.push(line),
    });
    const prior = process.env['MSTUDIO_PTY_INPROC'];
    process.env['MSTUDIO_PTY_INPROC'] = '0';
    try {
      await service.attach('studio').init();
      await service.attach('coder').init();
    } finally {
      if (prior === undefined) delete process.env['MSTUDIO_PTY_INPROC'];
      else process.env['MSTUDIO_PTY_INPROC'] = prior;
    }
    expect(lines).toContain('[broker] failed to start broker after 0 attempts');
    expect(lines).toContain('[broker:coder] failed to start broker after 0 attempts');
  });
});
