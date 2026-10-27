import { describe, expect, it } from 'vitest';

import { osvKey, type GuardOsvAdvisory } from '../feeds/osv';
import type { LockedPackage } from '../lockfiles/types';
import { createLockfileCvesCheck, parseSuppressions } from './lockfile-cves';

const NOW = Date.parse('2026-10-27T00:00:00Z');
const pkg: LockedPackage = { ecosystem: 'npm', name: 'lodash', version: '4.17.20', direct: true, path: '/r/pnpm-lock.yaml' };
const adv = (over: Partial<GuardOsvAdvisory> = {}): GuardOsvAdvisory => ({
  id: 'GHSA-aaaa',
  aliases: ['CVE-2021-1'],
  summary: 'Prototype pollution',
  database_specific: { severity: 'HIGH' },
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ fixed: '4.17.21' }] }] }],
  ...over,
});
const run = (inputs: Record<string, unknown>) => createLockfileCvesCheck(() => NOW).run({ lockfiles: [pkg], osv: { [osvKey(pkg)]: [adv()] }, ...inputs }) as ReturnType<typeof Array.prototype.concat>;

describe('lockfile-cves check (Phase 122 Theme B)', () => {
  it('raises one finding per advisory with the fix as update-package', () => {
    const [f] = run({});
    expect(f.fingerprint).toBe('lockfile-cves:GHSA-aaaa:npm:lodash@4.17.20:/r/pnpm-lock.yaml');
    expect(f.severity).toBe('high');
    expect(f.source).toBe('guard');
    expect(f.remediation).toEqual([{ id: 'update-package', name: 'lodash', from: '4.17.20', to: '4.17.21' }]);
  });

  it('uses pin-package when the fix is only on a newer major, and no action when there is none', () => {
    const major = adv({ affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ fixed: '5.0.0' }] }] }] });
    expect(run({ osv: { [osvKey(pkg)]: [major] } })[0].remediation[0]).toMatchObject({ id: 'pin-package', to: '5.0.0' });
    expect(run({ osv: { [osvKey(pkg)]: [adv({ affected: [] })] } })[0].remediation).toEqual([]);
  });

  it('a KEV alias raises to critical and says so', () => {
    const [f] = run({ kev: { 'CVE-2021-1': { cveID: 'CVE-2021-1', dueDate: '2021-12-01', knownRansomwareCampaignUse: 'Known' } } });
    expect(f.severity).toBe('critical');
    expect(f.detail).toContain('KEV');
    expect(f.detail).toContain('ransomware');
  });

  it('an unexpired suppression yields info; an expired one does not', () => {
    expect(run({ suppressions: [{ advisory: 'GHSA-aaaa', package: 'lodash', expires: '2026-12-31' }] })[0].severity).toBe('info');
    expect(run({ suppressions: [{ advisory: 'CVE-2021-1', expires: '2026-01-01' }] })[0].severity).toBe('high');
    expect(run({ suppressions: [{ advisory: 'GHSA-aaaa', package: 'other' }] })[0].severity).toBe('high');
  });

  it('tolerates empty and malformed inputs', () => {
    expect(createLockfileCvesCheck().run({})).toEqual([]);
    expect(createLockfileCvesCheck().run({ lockfiles: [pkg], osv: [], kev: [], suppressions: 'x' })).toEqual([]);
    expect(parseSuppressions([{ advisory: 'A', expires: '2030-01-01' }, { nope: 1 }, 'x'])).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('collapses a GHSA and its alias into one finding, and ignores GIT-range SHAs', () => {
    const git = adv({ id: 'CVE-2021-1', aliases: [], affected: [{ ranges: [{ type: 'GIT', events: [{ fixed: '3f2a9c0' }] }] }] });
    const out = run({ osv: { [osvKey(pkg)]: [adv({ affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ fixed: '4.17.21' }] }] }] }), git] } });
    expect(out).toHaveLength(1);
    expect(out[0].remediation[0]).toMatchObject({ to: '4.17.21' });
  });

  it('an unparseable expiry does not suppress', () => {
    expect(run({ suppressions: [{ advisory: 'GHSA-aaaa', expires: 'someday' }] })[0].severity).toBe('high');
  });
});
