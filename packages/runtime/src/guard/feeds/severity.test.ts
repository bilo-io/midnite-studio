import { describe, expect, it } from 'vitest';

import { advisorySeverity, compareVersions, cvss3BaseScore, pickFixVersion } from './severity';

describe('severity ladder (Phase 122 Theme B)', () => {
  it('scores known CVSS v3 vectors', () => {
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')).toBe(6.1);
    expect(cvss3BaseScore('CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N')).toBe(0);
    expect(cvss3BaseScore('CVSS:4.0/AV:N')).toBeNull();
  });

  it('prefers the vector, then database_specific, then medium', () => {
    expect(advisorySeverity({ severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }], database_specific: { severity: 'LOW' } })).toBe('critical');
    expect(advisorySeverity({ severity: [{ type: 'CVSS_V4', score: 'CVSS:4.0/AV:N' }], database_specific: { severity: 'HIGH' } })).toBe('high');
    expect(advisorySeverity({ database_specific: { severity: 'MODERATE' } })).toBe('medium');
    expect(advisorySeverity({})).toBe('medium');
  });

  it('orders versions and picks the fix', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(pickFixVersion('4.17.20', ['4.17.21', '5.0.1'])).toEqual({ to: '4.17.21', sameMajor: true });
    expect(pickFixVersion('3.0.0', ['4.0.1', '5.0.0'])).toEqual({ to: '4.0.1', sameMajor: false });
    expect(pickFixVersion('2.0.0', ['1.0.0'])).toBeNull();
  });
});
