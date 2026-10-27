import type {
  InstallCandidate,
  PackageCheckFinding,
  SkillAuditFinding,
} from '@midnite/studio-shared';

import type { AgentAudit } from './agent-audit';
import type { FindingsLedger } from './findings-ledger';
import { parseInstallCommand, parseLockfileDiff } from './install-detector';
import {
  checkPackageCandidate,
  type PackageCheckOptions,
  type PackageMetadata,
} from './package-checker';
import { auditSkillDirectory, type SkillAuditOptions } from './skills-audit';

export interface InstallCheckerOptions {
  audit?: AgentAudit;
  findingsLedger?: FindingsLedger;
  topPackages?: readonly string[];
  fetchMetadata?: (candidate: InstallCandidate) => Promise<PackageMetadata | null>;
  now?: () => number;
}

export interface InstallChecker {
  /**
   * Check an install command from terminal input or agent tool execution.
   */
  checkCommand(commandLine: string, sessionId?: string): Promise<PackageCheckFinding[]>;

  /**
   * Check newly added packages from a lockfile diff after a turn.
   */
  checkLockfileDiff(filename: string, diffText: string, sessionId?: string): Promise<PackageCheckFinding[]>;

  /**
   * Audit a skill directory (SKILL.md, scripts, and binaries).
   */
  checkSkill(skillDir: string, options?: SkillAuditOptions): Promise<SkillAuditFinding[]>;
}

export function createInstallChecker(options: InstallCheckerOptions = {}): InstallChecker {
  const now = options.now ?? (() => Date.now());

  async function evaluateCandidates(candidates: InstallCandidate[], sessionId?: string): Promise<PackageCheckFinding[]> {
    if (candidates.length === 0) return [];

    const allFindings: PackageCheckFinding[] = [];

    for (const candidate of candidates) {
      const metadata: PackageMetadata = options.fetchMetadata
        ? (await options.fetchMetadata(candidate).catch(() => null)) ?? {}
        : {};

      const checkOpts: PackageCheckOptions = {
        topPackages: options.topPackages,
        now: now(),
      };

      const findings = checkPackageCandidate(candidate, metadata, checkOpts);
      allFindings.push(...findings);

      // Record in agent audit trail
      if (options.audit) {
        const hasBlock = findings.some((f) => f.severity === 'critical');
        const hasWarn = findings.some((f) => f.severity === 'high' || f.severity === 'medium');
        const verdict = hasBlock ? ('block' as const) : hasWarn ? ('warn' as const) : ('ok' as const);

        const pkgLabel = `${candidate.name}${candidate.version ? `@${candidate.version}` : ''}`;
        try {
          options.audit.record({
            kind: 'install',
            manager: candidate.ecosystem,
            packages: [pkgLabel],
            verdict,
            findings: findings.length > 0 ? findings.map((f) => f.message) : undefined,
            sessionId,
          });
        } catch {
          // Ignore audit write error
        }
      }

      // Record in findings ledger if critical or high
      if (options.findingsLedger) {
        for (const finding of findings) {
          if (finding.severity === 'critical' || finding.severity === 'high') {
            await options.findingsLedger.record({
              source: 'agents',
              severity: finding.severity,
              category: 'supply-chain',
              title: `Suspicious package installation: ${candidate.name}`,
              detail: finding.message,
              fingerprint: `install:${candidate.ecosystem}:${candidate.name}:${finding.kind}`,
              evidence: [
                { kind: 'command', command: candidate.command ?? candidate.lockfile ?? candidate.name },
              ],
              remediation: [
                { id: 'mute' },
                { id: 'report-issue', title: `Suspicious package: ${candidate.name}` },
              ],
            }).catch(() => undefined);
          }
        }
      }
    }

    return allFindings;
  }

  return {
    async checkCommand(commandLine: string, sessionId?: string): Promise<PackageCheckFinding[]> {
      const candidates = parseInstallCommand(commandLine);
      return evaluateCandidates(candidates, sessionId);
    },

    async checkLockfileDiff(filename: string, diffText: string, sessionId?: string): Promise<PackageCheckFinding[]> {
      const candidates = parseLockfileDiff(filename, diffText);
      return evaluateCandidates(candidates, sessionId);
    },

    async checkSkill(skillDir: string, skillOpts?: SkillAuditOptions): Promise<SkillAuditFinding[]> {
      return auditSkillDirectory(skillDir, skillOpts);
    },
  };
}
