import type { RemediationAction, SecurityFinding, SecurityFindingSeverity } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';
import { advisorySeverity, pickFixVersion } from '../feeds/severity';
import { fixedVersions, osvKey, type GuardOsvAdvisory } from '../feeds/osv';
import type { KevEntry } from '../feeds/kev';
import type { LockedPackage } from '../lockfiles/types';

export const LOCKFILE_CVES_CHECK_ID = 'lockfile-cves';

/** One `scripts/audit-suppressions.json` entry; the sweep and CI honour the same file. */
export interface AuditSuppression {
  advisory: string;
  package?: string;
  expires?: string;
}

/** Validates the suppressions file's body; anything that is not an entry is dropped. */
export function parseSuppressions(raw: unknown): AuditSuppression[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is AuditSuppression =>
      typeof e === 'object' && e !== null && typeof (e as AuditSuppression).advisory === 'string' &&
      ((e as AuditSuppression).expires === undefined || typeof (e as AuditSuppression).expires === 'string'),
  );
}

const SEVERITY_RANK: Record<SecurityFindingSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function isSuppressed(suppressions: readonly AuditSuppression[], ids: readonly string[], name: string, now: number): boolean {
  return suppressions.some((s) => {
    if (!ids.includes(s.advisory)) return false;
    if (s.package && s.package !== name) return false;
    if (s.expires) {
      const t = Date.parse(`${s.expires}T23:59:59Z`);
      if (Number.isFinite(t) && t < now) return false; // expired suppressions stop applying
    }
    return true;
  });
}

export interface LockfileCvesInputs {
  lockfiles: LockedPackage[];
  osv: Record<string, GuardOsvAdvisory[]>;
  kev?: Record<string, KevEntry>;
  suppressions?: AuditSuppression[];
}

/**
 * Theme B: one finding per (advisory, package, lockfile). Severity is the advisory's CVSS (or its own rating),
 * raised to `critical` when any alias is in CISA's KEV, and `info` while an unexpired suppression covers it.
 * The action is `update-package` when a fix exists in the installed major, `pin-package` when only a newer major has it.
 */
export function createLockfileCvesCheck(now: () => number = () => Date.now()): GuardCheck {
  const check: GuardCheck = {
    id: LOCKFILE_CVES_CHECK_ID,
    title: 'Known vulnerabilities in lockfiles',
    category: 'vulnerability',
    needs: ['lockfiles', 'osv', 'kev', 'suppressions'],
    run(raw): SecurityFinding[] {
      const inputs = raw as Partial<LockfileCvesInputs>;
      const packages = Array.isArray(inputs.lockfiles) ? inputs.lockfiles : [];
      const osv = inputs.osv && !Array.isArray(inputs.osv) ? inputs.osv : {};
      const kev = inputs.kev && !Array.isArray(inputs.kev) ? inputs.kev : {};
      const suppressions = Array.isArray(inputs.suppressions) ? inputs.suppressions : [];
      const findings: SecurityFinding[] = [];

      for (const pkg of packages) {
        for (const adv of osv[osvKey(pkg)] ?? []) {
          const ids = [adv.id, ...(adv.aliases ?? [])];
          const kevHit = ids.map((id) => kev[id]).find((e): e is KevEntry => e !== undefined);
          let severity = advisorySeverity(adv);
          if (kevHit) severity = 'critical';
          const suppressed = isSuppressed(suppressions, ids, pkg.name, now());
          if (suppressed) severity = 'info';

          const fix = pickFixVersion(pkg.version, fixedVersions(adv, pkg.ecosystem, pkg.name));
          const remediation: RemediationAction[] = fix
            ? [
                fix.sameMajor
                  ? { id: 'update-package', name: pkg.name, from: pkg.version, to: fix.to }
                  : { id: 'pin-package', name: pkg.name, from: pkg.version, to: fix.to, description: 'The fix is only on a newer major.' },
              ]
            : [];
          const kevNote = kevHit
            ? ` In CISA's KEV catalog${kevHit.dueDate ? ` (due ${kevHit.dueDate})` : ''}${kevHit.knownRansomwareCampaignUse === 'Known' ? ', used in ransomware campaigns' : ''}.`
            : '';
          findings.push(
            createGuardFinding({
              check,
              subject: `${adv.id}:${pkg.ecosystem}:${pkg.name}@${pkg.version}:${pkg.path}`,
              severity,
              title: `${adv.id} in ${pkg.name}@${pkg.version}`,
              detail:
                `${adv.summary ?? 'Known vulnerability.'} ${pkg.direct ? 'A direct dependency.' : 'Pulled in transitively.'}` +
                `${fix ? ` Fixed in ${fix.to}.` : ' No fixed version is published.'}${kevNote}${suppressed ? ' Suppressed in audit-suppressions.json.' : ''}`,
              evidence: [{ kind: 'path', path: pkg.path }],
              remediation,
            }),
          );
        }
      }
      return findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    },
  };
  return check;
}
