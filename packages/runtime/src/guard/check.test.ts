import { describe, expect, it } from 'vitest';

import { createGuardFinding, type GuardCheck } from './check';

describe('GuardCheck contract (Phase 122 Theme A)', () => {
  const dummyCheck: GuardCheck = {
    id: 'guard-ports',
    title: 'Listening ports check',
    category: 'network',
    needs: ['ports'],
    run: (inputs) => {
      const ports = inputs.ports as { open: number[] } | undefined;
      if (ports?.open.includes(8080)) {
        return [
          createGuardFinding({
            check: dummyCheck,
            subject: '8080',
            severity: 'medium',
            title: 'Insecure port 8080 open',
            detail: 'A non-standard port 8080 is listening on all interfaces.',
          }),
        ];
      }
      return [];
    },
  };

  it('creates finding with source "guard" and stable fingerprint <checkId>:<subject>', () => {
    const finding = createGuardFinding({
      check: dummyCheck,
      subject: 'port-8080',
      severity: 'medium',
      title: 'Port 8080 open',
      detail: 'Details here',
    });

    expect(finding.source).toBe('guard');
    expect(finding.fingerprint).toBe('guard-ports:port-8080');
    expect(finding.category).toBe('network');
    expect(finding.severity).toBe('medium');
    expect(finding.status).toBe('open');
    expect(finding.count).toBe(1);
    expect(finding.firstSeen).toBeGreaterThan(0);
    expect(finding.lastSeen).toBe(finding.firstSeen);
  });

  it('runs pure function over inputs without side-effects', async () => {
    const findingsClean = await dummyCheck.run({ ports: { open: [22, 443] } });
    expect(findingsClean).toHaveLength(0);

    const findingsDetected = await dummyCheck.run({ ports: { open: [8080] } });
    expect(findingsDetected).toHaveLength(1);
    expect(findingsDetected[0]!.fingerprint).toBe('guard-ports:8080');
    expect(findingsDetected[0]!.source).toBe('guard');
  });
});
