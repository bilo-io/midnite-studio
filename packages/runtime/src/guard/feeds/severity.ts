import type { SecurityFindingSeverity } from '@midnite/studio-shared';

const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 } as const;
const AC = { L: 0.77, H: 0.44 } as const;
const UI = { N: 0.85, R: 0.62 } as const;
const CIA = { H: 0.56, L: 0.22, N: 0 } as const;

const roundUp = (n: number): number => {
  const i = Math.round(n * 100000);
  return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10;
};

/** CVSS v3.0/v3.1 base score from a vector string, or null for anything else (v4, malformed). */
export function cvss3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m = Object.fromEntries(vector.split('/').slice(1).map((p) => p.split(':') as [string, string]));
  const scope = m.S;
  const av = AV[m.AV as keyof typeof AV];
  const ac = AC[m.AC as keyof typeof AC];
  const ui = UI[m.UI as keyof typeof UI];
  const c = CIA[m.C as keyof typeof CIA];
  const i = CIA[m.I as keyof typeof CIA];
  const a = CIA[m.A as keyof typeof CIA];
  if ([av, ac, ui, c, i, a].some((x) => x === undefined) || (scope !== 'U' && scope !== 'C')) return null;
  const pr = ({ N: 0.85, L: scope === 'U' ? 0.62 : 0.68, H: scope === 'U' ? 0.27 : 0.5 } as Record<string, number>)[m.PR ?? ''];
  if (pr === undefined) return null;
  const iss = 1 - (1 - c!) * (1 - i!) * (1 - a!);
  const impact = scope === 'U' ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  if (impact <= 0) return 0;
  const exploit = 8.22 * av! * ac! * pr * ui!;
  return roundUp(Math.min(scope === 'U' ? impact + exploit : 1.08 * (impact + exploit), 10));
}

export function severityFromScore(score: number): SecurityFindingSeverity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return score > 0 ? 'low' : 'info';
}

export interface AdvisorySeverityInput {
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string };
}

/** CVSS v3 vector when present, else `database_specific.severity`, else `medium` (Phase 122 Theme B). */
export function advisorySeverity(advisory: AdvisorySeverityInput): SecurityFindingSeverity {
  for (const s of advisory.severity ?? []) {
    const score = s.score ? cvss3BaseScore(s.score) : null;
    if (score !== null) return severityFromScore(score);
  }
  switch (advisory.database_specific?.severity?.toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MODERATE':
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'medium';
  }
}

/** Dotted-numeric compare, enough to order fix versions (pre-release tags sort below the release). */
export function compareVersions(a: string, b: string): number {
  const [ap, apre] = a.split('-', 2) as [string, string | undefined];
  const [bp, bpre] = b.split('-', 2) as [string, string | undefined];
  const as = ap.split('.').map((x) => parseInt(x, 10) || 0);
  const bs = bp.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const d = (as[i] ?? 0) - (bs[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (apre && !bpre) return -1;
  if (!apre && bpre) return 1;
  return 0;
}

const major = (v: string): number => parseInt(v.split('.')[0] ?? '0', 10) || 0;

/** The fix to take: the lowest fixed version above `current` within its major, else the lowest overall (a major bump). */
export function pickFixVersion(current: string, fixed: readonly string[]): { to: string; sameMajor: boolean } | null {
  const above = fixed.filter((f) => compareVersions(f, current) > 0).sort(compareVersions);
  if (above.length === 0) return null;
  const same = above.find((f) => major(f) === major(current));
  return same ? { to: same, sameMajor: true } : { to: above[0]!, sameMajor: false };
}
