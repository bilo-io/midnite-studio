import { DEFAULT_VANGUARD_SETTINGS, type SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { BUNDLE_SENSOR_ID, INTEGRITY_SENSOR_ID } from './integrity-sensor';
import { createConnectionStore, NETWORK_SENSOR_ID } from './network-sensor';
import { createSensorHost } from './sensor-host';
import { builtinSensors, resolveByFingerprint, type ResolvableLedger } from './sensors';

/** Theme D's sensors, registered after C's. */
const D_IDS = ['persistence', 'processes', 'apple-signals', 'terminal-paste'];

describe('builtinSensors', () => {
  it('ships the integrity sensor always and the bundle check when the app says where it runs from', () => {
    expect(builtinSensors({}).map((s) => s.id)).toEqual([INTEGRITY_SENSOR_ID, ...D_IDS]);
    expect(
      builtinSensors({ execPath: '/A/M.app/Contents/MacOS/M', packaged: true }).map((s) => s.id),
    ).toEqual([INTEGRITY_SENSOR_ID, BUNDLE_SENSOR_ID, ...D_IDS]);
  });

  it('ships the network sensor only when the composer supplies its inputs, and shares the snapshot it is given', () => {
    expect(builtinSensors({}).some((s) => s.id === NETWORK_SENSOR_ID)).toBe(false);
    const connections = createConnectionStore();
    const sensors = builtinSensors({ network: { suite: { pid: 1 } }, connections });
    expect(sensors.map((s) => s.id)).toEqual([INTEGRITY_SENSOR_ID, NETWORK_SENSOR_ID, ...D_IDS]);
    expect(sensors[1]!.schedule).toEqual({ kind: 'interval', ms: 10_000 });
  });

  it('registers with the sensor host and shows on the Sensors tab', () => {
    const host = createSensorHost({
      userData: '/u',
      runProcess: async () => ({ ok: false, reason: 'failed', hint: 'none' }),
      record: async () => ({}) as SecurityFinding,
      settings: () => DEFAULT_VANGUARD_SETTINGS,
      autostart: 'always',
      onChanged: () => undefined,
    });
    for (const sensor of builtinSensors({ execPath: '/A/M.app/Contents/MacOS/M' }))
      host.register(sensor);
    const rows = host.status().sensors;
    expect(rows.map((r) => [r.id, r.state, r.enabled])).toEqual([
      [INTEGRITY_SENSOR_ID, 'disabled', true],
      [BUNDLE_SENSOR_ID, 'disabled', true],
      ...D_IDS.map((id) => [id, 'disabled', true]),
    ]);
    expect(rows[0]!.description).toMatch(/outside a git commit/);
  });
});

describe('resolveByFingerprint', () => {
  it('resolves every open finding carrying the fingerprint, and only those', async () => {
    const set: Array<[string, string]> = [];
    const ledger: ResolvableLedger = {
      list: async () =>
        [
          { id: 'a', fingerprint: 'integrity:r:worktree:.mcp.json' },
          { id: 'b', fingerprint: 'other' },
        ] as SecurityFinding[],
      setStatus: async (id, status) => {
        set.push([id, status]);
        return null;
      },
    };
    await resolveByFingerprint(ledger)('integrity:r:worktree:.mcp.json');
    expect(set).toEqual([['a', 'resolved']]);
  });
});
