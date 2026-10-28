import { randomUUID } from 'node:crypto';

import {
  SecurityFindingSchema,
  type EvidenceItem,
  type RemediationAction,
  type SecurityFinding,
  type SecurityFindingCategory,
  type SecurityFindingSeverity,
} from '@midnite/studio-shared';

import type { GuardInputKey } from './inputs';

/**
 * The check contract for the Guard recurring sweep (Phase 122 Theme A).
 *
 * Every check is a pure function over named inputs resolved once per sweep by
 * `guard/inputs.ts`, so a check never fetches and every check is a fixture test.
 * Findings use Phase 120 A's `SecurityFindingSchema` with `source: 'guard'` and
 * a fingerprint stable across sweeps (`<checkId>:<subject>`).
 */
export interface GuardCheck {
  id: string;
  title: string;
  category: SecurityFindingCategory;
  needs: readonly GuardInputKey[];
  run(inputs: Record<string, unknown>): SecurityFinding[] | Promise<SecurityFinding[]>;
}

export interface CreateGuardFindingParams {
  check: Pick<GuardCheck, 'id' | 'category'>;
  subject: string;
  severity: SecurityFindingSeverity;
  title: string;
  detail: string;
  evidence?: EvidenceItem[];
  remediation?: RemediationAction[];
  repoId?: string;
  sessionId?: string;
  firstSeen?: number;
  lastSeen?: number;
  count?: number;
}

/**
 * Creates a valid SecurityFinding with `source: 'guard'` and stable fingerprint
 * `${check.id}:${subject}` per Phase 122 Theme A.
 */
export function createGuardFinding(params: CreateGuardFindingParams): SecurityFinding {
  const now = Date.now();
  const firstSeen = params.firstSeen ?? now;
  const lastSeen = params.lastSeen ?? firstSeen;
  const fingerprint = `${params.check.id}:${params.subject}`;

  const finding: SecurityFinding = {
    id: randomUUID(),
    fingerprint,
    source: 'guard',
    severity: params.severity,
    category: params.check.category,
    title: params.title,
    detail: params.detail,
    evidence: params.evidence ?? [],
    remediation: params.remediation ?? [],
    firstSeen,
    lastSeen,
    count: params.count ?? 1,
    status: 'open',
    ...(params.repoId ? { repoId: params.repoId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
  };

  return SecurityFindingSchema.parse(finding);
}
