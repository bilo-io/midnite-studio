import type { SecurityFinding, SecurityFindingCategory, SecurityFindingSeverity } from '@midnite/studio-shared';

/** Severity order, worst first: the order the Guard tab groups by. */
export const SEVERITY_ORDER: readonly SecurityFindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface GuardFindingFilter {
  category: SecurityFindingCategory | 'all';
  /** `open` hides resolved and muted; `all` shows everything the ledger holds. */
  status: 'open' | 'all';
}

export const DEFAULT_GUARD_FILTER: GuardFindingFilter = { category: 'all', status: 'open' };

/**
 * New since the last sweep: the ledger dedupes by fingerprint and bumps `count` on every sweep that sees the
 * finding again, so an open finding with a count of one first appeared in the newest sweep.
 */
export const isNewSinceLastSweep = (finding: Pick<SecurityFinding, 'count' | 'status'>): boolean => finding.count === 1 && finding.status === 'open';

export function filterGuardFindings(findings: readonly SecurityFinding[], filter: GuardFindingFilter): SecurityFinding[] {
  return findings.filter(
    (f) => f.source === 'guard' && (filter.category === 'all' || f.category === filter.category) && (filter.status === 'all' || f.status === 'open' || f.status === 'acknowledged'),
  );
}

export interface SeverityGroup {
  severity: SecurityFindingSeverity;
  findings: SecurityFinding[];
}

/** Findings grouped by severity (worst first, empty groups left out), each group newest sighting first. */
export function groupBySeverity(findings: readonly SecurityFinding[]): SeverityGroup[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((f) => f.severity === severity).sort((a, b) => b.lastSeen - a.lastSeen),
  })).filter((g) => g.findings.length > 0);
}

/** The categories present, for the filter's options. */
export const categoriesOf = (findings: readonly SecurityFinding[]): SecurityFindingCategory[] =>
  [...new Set(findings.map((f) => f.category))].sort();
