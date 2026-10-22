import { DEFAULT_VANGUARD_SETTINGS, type SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { BUNDLE_SENSOR_ID, INTEGRITY_SENSOR_ID } from './integrity-sensor';
import { createSensorHost } from './sensor-host';
import { builtinSensors, resolveByFingerprint, type ResolvableLedger } from './sensors';

describe('builtinSensors', () => {
  it('ships the integrity sensor always and the bundle check when the app says where it runs from', () => {
    expect(builtinSensors({}).map((s) => s.id)).toEqual([INTEGRITY_SENSOR_ID]);
    expect(builtinSensors({ execPath: '/A/M.app/Contents/MacOS/M', packaged: true }).map((s) => s.id)).toEqual([
      INTEGRITY_SENSOR_ID,
      BUNDLE_SENSOR_ID,
    ]);
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
    for (const sensor of builtinSensors({ execPath: '/A/M.app/Contents/MacOS/M' })) host.register(sensor);
    const rows = host.status().sensors;
    expect(rows.map((r) => [r.id, r.state, r.enabled])).toEqual([
      [INTEGRITY_SENSOR_ID, 'disabled', true],
      [BUNDLE_SENSOR_ID, 'disabled', true],
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
