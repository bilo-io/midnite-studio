import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readRuntimeHostRecord,
  runtimeHostDirectory,
  runtimeHostRecordPath,
  vaultHostSocketPath,
  writeRuntimeHostRecord,
  type RuntimeHostRecord,
} from './host-record';

const record: RuntimeHostRecord = {
  version: 1,
  host: 'studio',
  pid: 4242,
  writtenAt: 1,
  broker: { socketPath: '/x/broker/1.0.0-abcd1234.sock', directory: '/x/broker' },
};

describe('runtime host record', () => {
  it('puts the host’s sockets and record under <runtimeDir>/host', () => {
    expect(runtimeHostDirectory('/rt')).toBe('/rt/host');
    expect(vaultHostSocketPath('/rt')).toBe('/rt/host/vault.sock');
    expect(runtimeHostRecordPath('/rt')).toBe('/rt/host/host.json');
  });

  it('round-trips, user-only on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-host-'));
    expect(writeRuntimeHostRecord(dir, record)).toBe(true);
    expect(readRuntimeHostRecord(dir)).toEqual(record);
    expect(statSync(runtimeHostRecordPath(dir)).mode & 0o777).toBe(0o600);
    expect(statSync(runtimeHostDirectory(dir)).mode & 0o777).toBe(0o700);
  });

  it('reads nothing from a missing, malformed or foreign file — and never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-host-'));
    expect(readRuntimeHostRecord(dir)).toBeNull();
    mkdirSync(runtimeHostDirectory(dir), { recursive: true });
    writeFileSync(runtimeHostRecordPath(dir), '{not json');
    expect(readRuntimeHostRecord(dir)).toBeNull();
    writeFileSync(runtimeHostRecordPath(dir), JSON.stringify({ ...record, version: 2 }));
    expect(readRuntimeHostRecord(dir)).toBeNull();
  });

  it('reports a write it could not make', () => {
    const dir = mkdtempSync(join(tmpdir(), 'msr-host-'));
    writeFileSync(join(dir, 'host'), 'a file where the directory should be');
    expect(writeRuntimeHostRecord(dir, record)).toBe(false);
  });
});
