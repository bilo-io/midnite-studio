import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFindingsLedger, type FindingsLedger } from '../security/findings-ledger';
import { createGuardFinding, type GuardCheck } from './check';
import { runGuardSweep } from './runner';
import { createGuardSweepsStore, type GuardSweepsStore } from './sweeps-store';

describe('Guard Sweep Runner (Phase 122 Theme A)', () => {
  let testDir: string;
  let ledger: FindingsLedger;
  let sweepsStore: GuardSweepsStore;
  let clockTime: number;

  beforeEach(() => {
    testDir = join(tmpdir(), `guard-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    clockTime = 1_700_000_000_000;
    ledger = createFindingsLedger({
      userData: testDir,
      now: () => clockTime,
    });
    sweepsStore = createGuardSweepsStore(testDir);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Cleaned up
    }
  });

  const checkPorts: GuardCheck = {
    id: 'guard-ports',
    title: 'Open ports check',
    category: 'network',
    needs: ['ports'],
    run: (inputs) => {
      const ports = inputs.ports as { open: number[] } | undefined;
      if (ports?.open.includes(8080)) {
        return [
          createGuardFinding({
            check: checkPorts,
            subject: '8080',
            severity: 'high',
            title: 'Port 8080 open',
            detail: 'Insecure listening port',
          }),
        ];
      }
      return [];
    },
  };

  const checkOsv: GuardCheck = {
    id: 'guard-cve-osv',
    title: 'OSV CVE audit',
    category: 'vulnerability',
    needs: ['osv'],
    run: () => [
      createGuardFinding({
        check: checkOsv,
        subject: 'CVE-2026-9999',
        severity: 'critical',
        title: 'Critical remote exploit in dependency',
        detail: 'Immediate update required',
      }),
    ],
  };

  it('runs a fixture sweep with two checks and one skipped input', async () => {
    const result = await runGuardSweep({
      userData: testDir,
      checks: [checkPorts, checkOsv],
      ledger,
      sweepsStore,
      context: {
        switches: {
          'privacy.feed.osv': false, // skip OSV feed
        },
        resolvers: {
          ports: () => ({ open: [8080] }),
          osv: () => ({ vulns: [] }),
        },
      },
      now: () => clockTime,
    });

    expect(result.record.checksRun).toEqual(['guard-ports']);
    expect(result.record.inputsSkipped).toEqual({ osv: 'privacy.feed.osv' });
    expect(result.record.counts).toEqual({
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.fingerprint).toBe('guard-ports:8080');

    // Sweep record is persisted
    const allSweeps = await sweepsStore.list();
    expect(allSweeps).toHaveLength(1);
    expect(allSweeps[0]!.id).toBe(result.record.id);

    // Finding is recorded in ledger
    const ledgerFindings = await ledger.list({ source: 'guard' });
    expect(ledgerFindings).toHaveLength(1);
    expect(ledgerFindings[0]!.fingerprint).toBe('guard-ports:8080');
  });

  it('deduplicates findings across two sweeps, bumping count and lastSeen', async () => {
    // Sweep 1 at T=0
    clockTime = 1_700_000_000_000;
    await runGuardSweep({
      userData: testDir,
      checks: [checkPorts],
      ledger,
      sweepsStore,
      context: {
        resolvers: { ports: () => ({ open: [8080] }) },
      },
      now: () => clockTime,
    });

    let findings = await ledger.list({ source: 'guard' });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.count).toBe(1);
    expect(findings[0]!.firstSeen).toBe(1_700_000_000_000);
    expect(findings[0]!.lastSeen).toBe(1_700_000_000_000);

    // Sweep 2 at T=60s
    clockTime = 1_700_000_060_000;
    await runGuardSweep({
      userData: testDir,
      checks: [checkPorts],
      ledger,
      sweepsStore,
      context: {
        resolvers: { ports: () => ({ open: [8080] }) },
      },
      now: () => clockTime,
    });

    findings = await ledger.list({ source: 'guard' });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.count).toBe(2);
    expect(findings[0]!.firstSeen).toBe(1_700_000_000_000);
    expect(findings[0]!.lastSeen).toBe(1_700_000_060_000);
  });

  it('resolves previously open findings when no longer seen (resolvedBy: "sweep")', async () => {
    // Sweep 1: port 8080 is open
    clockTime = 1_700_000_000_000;
    await runGuardSweep({
      userData: testDir,
      checks: [checkPorts],
      ledger,
      sweepsStore,
      context: {
        resolvers: { ports: () => ({ open: [8080] }) },
      },
      now: () => clockTime,
    });

    let openFindings = await ledger.list({ status: 'open', source: 'guard' });
    expect(openFindings).toHaveLength(1);
    expect(openFindings[0]!.status).toBe('open');

    // Sweep 2: port 8080 is now closed
    clockTime = 1_700_000_060_000;
    await runGuardSweep({
      userData: testDir,
      checks: [checkPorts],
      ledger,
      sweepsStore,
      context: {
        resolvers: { ports: () => ({ open: [22] }) },
      },
      now: () => clockTime,
    });

    // It should now be resolved with resolvedBy: 'sweep'
    openFindings = await ledger.list({ status: 'open', source: 'guard' });
    expect(openFindings).toHaveLength(0);

    const resolvedFindings = await ledger.list({ status: 'resolved', source: 'guard' });
    expect(resolvedFindings).toHaveLength(1);
    expect(resolvedFindings[0]!.resolvedBy).toBe('sweep');
    expect(resolvedFindings[0]!.fingerprint).toBe('guard-ports:8080');
  });

  it('does NOT resolve findings belonging to a check that was skipped', async () => {
    // Sweep 1: OSV runs and finds a CVE
    await runGuardSweep({
      userData: testDir,
      checks: [checkOsv],
      ledger,
      sweepsStore,
      context: { resolvers: { osv: () => ({}) } },
      now: () => clockTime,
    });

    let openFindings = await ledger.list({ status: 'open', source: 'guard' });
    expect(openFindings).toHaveLength(1);

    // Sweep 2: OSV input is skipped
    await runGuardSweep({
      userData: testDir,
      checks: [checkOsv],
      ledger,
      sweepsStore,
      context: {
        switches: { 'privacy.feed.osv': false },
      },
      now: () => clockTime,
    });

    // Because checkOsv was skipped, the finding should REMAIN open
    openFindings = await ledger.list({ status: 'open', source: 'guard' });
    expect(openFindings).toHaveLength(1);
  });

  it('skips a check whose input has no resolver and records the skipped input', async () => {
    const result = await runGuardSweep({ userData: testDir, checks: [checkOsv], ledger, sweepsStore, now: () => clockTime });
    expect(result.record.checksRun).toEqual([]);
    expect(result.record.inputsSkipped).toEqual({ osv: 'no-resolver' });
    expect(result.findings).toEqual([]);
  });
});
