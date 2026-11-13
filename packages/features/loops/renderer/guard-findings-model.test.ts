import type { SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { categoriesOf, DEFAULT_GUARD_FILTER, filterGuardFindings, groupBySeverity, isNewSinceLastSweep } from './guard-findings-model';

const f = (over: Partial<SecurityFinding>): SecurityFinding => ({
  id: over.fingerprint ?? 'x', fingerprint: 'fp', source: 'guard', severity: 'low', category: 'config', title: 't', detail: 'd',
  evidence: [], remediation: [], firstSeen: 1, lastSeen: 1, count: 1, status: 'open', ...over,
});

describe('guard findings model', () => {
  const ledger = [
    f({ fingerprint: 'a', severity: 'low', lastSeen: 5 }),
    f({ fingerprint: 'b', severity: 'critical', category: 'vulnerability', count: 3 }),
    f({ fingerprint: 'c', severity: 'low', lastSeen: 9 }),
    f({ fingerprint: 'd', severity: 'high', status: 'resolved' }),
    f({ fingerprint: 'e', severity: 'high', source: 'vanguard' }),
  ];

  it('groups open guard findings by severity, worst first, newest sighting first', () => {
    const groups = groupBySeverity(filterGuardFindings(ledger, DEFAULT_GUARD_FILTER));
    expect(groups.map((g) => [g.severity, g.findings.map((x) => x.fingerprint)])).toEqual([
      ['critical', ['b']],
      ['low', ['c', 'a']],
    ]);
  });

  it('filters by category and status', () => {
    expect(filterGuardFindings(ledger, { category: 'vulnerability', status: 'open' }).map((x) => x.fingerprint)).toEqual(['b']);
    expect(filterGuardFindings(ledger, { category: 'all', status: 'all' }).map((x) => x.fingerprint)).toEqual(['a', 'b', 'c', 'd']);
    expect(categoriesOf(ledger)).toEqual(['config', 'vulnerability']);
  });

  it('marks as new only an open finding seen once', () => {
    expect(ledger.map(isNewSinceLastSweep)).toEqual([true, false, true, false, true]);
  });
});
