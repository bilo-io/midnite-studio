import { describe, expect, it } from 'vitest';

import { CODESIGN_ADHOC, CODESIGN_DEVID, CODESIGN_UNSIGNED } from './__fixtures__/sensor-fixtures';
import { inspectExecutable, isUnsigned, parseCodesignOutput, parseSpctlAssess } from './code-signing';
import type { SensorRunProcess } from './sensor-host';

describe('code signing parsers', () => {
  it('reads a Developer ID signature with its team id', () => {
    expect(parseCodesignOutput(CODESIGN_DEVID, 0)).toMatchObject({
      signed: true,
      adhoc: false,
      teamId: 'ABCDE12345',
    });
  });
  it('reads an ad-hoc signature, with no team id', () => {
    const r = parseCodesignOutput(CODESIGN_ADHOC, 0);
    expect(r).toMatchObject({ signed: true, adhoc: true });
    expect(r.teamId).toBeUndefined();
  });
  it('reads an unsigned binary', () => {
    expect(parseCodesignOutput(CODESIGN_UNSIGNED, 1)).toEqual({ signed: false, adhoc: false });
  });
  it('spctl: exit 0 accepts, rejected or non-zero does not', () => {
    expect(parseSpctlAssess('', 0)).toBe(true);
    expect(parseSpctlAssess('/x: rejected', 3)).toBe(false);
    expect(parseSpctlAssess('rejected', 0)).toBe(false);
  });
  it('inspectExecutable combines all three probes and tolerates a probe that cannot run', async () => {
    const run: SensorRunProcess = async (cmd) => {
      if (cmd === 'codesign') return { ok: true, stdout: '', stderr: CODESIGN_UNSIGNED, exitCode: 1 };
      if (cmd === 'spctl') return { ok: true, stdout: '', stderr: 'rejected', exitCode: 3 };
      return { ok: true, stdout: '0083;65f;Safari;', stderr: '', exitCode: 0 };
    };
    const s = await inspectExecutable(run, '/tmp/x');
    expect(s).toEqual({ signed: false, adhoc: false, accepted: false, quarantined: true });
    expect(isUnsigned(s)).toBe(true);
    const failing: SensorRunProcess = async () => ({ ok: false, reason: 'not-installed', hint: 'x' });
    expect((await inspectExecutable(failing, '/tmp/x')).quarantined).toBe(false);
  });
});
