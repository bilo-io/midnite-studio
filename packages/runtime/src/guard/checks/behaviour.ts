import type { AgentAuditRecord, SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const BEHAVIOUR_CHECK_ID = 'behaviour';

/** The trail slice the `auditTrail` input carries: the sweep window plus the 30 days before it, as the baseline. */
export interface AuditTrailInput {
  records: AgentAuditRecord[];
  /** The sweep window is `[windowStart, now]`; everything earlier is baseline. */
  windowStart: number;
  now: number;
}

/** What the check reads from a Vanguard finding. */
export interface VanguardFindingRef {
  fingerprint: string;
  category: string;
  title: string;
  firstSeen: number;
  severity: string;
}

/** A baseline needs at least this many sessions before "unusual hours" means anything. */
export const MIN_BASELINE_SESSIONS = 10;
/** An hour holding at most this share of baseline sessions is "outside the usual hours". */
export const UNUSUAL_HOUR_SHARE = 0.05;
/** Approvals denied in one session before it is worth a finding. */
export const DENIED_APPROVALS_LIMIT = 3;
/** A finding landing this long after a session's last record still counts as during it. */
export const SESSION_GRACE_MS = 5 * 60 * 1000;

interface SessionSpan {
  sessionId: string;
  start: number;
  end: number;
}

function sessionSpans(records: readonly AgentAuditRecord[]): SessionSpan[] {
  const spans = new Map<string, SessionSpan>();
  for (const r of records) {
    if (!r.sessionId) continue;
    const s = spans.get(r.sessionId);
    if (s) {
      s.start = Math.min(s.start, r.at);
      s.end = Math.max(s.end, r.at);
    } else spans.set(r.sessionId, { sessionId: r.sessionId, start: r.at, end: r.at });
  }
  return [...spans.values()];
}

const hourOf = (t: number): number => new Date(t).getHours();
const stamp = (t: number): string => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Theme F, suspicious behaviour over the window, correlating Phase 121's audit trail with Phase 120's findings:
 * a session that started in an hour the last 30 days almost never saw (`low`), a Vanguard persistence or network
 * finding whose first sighting falls inside a session (`high`, naming both fingerprints), a limit-trip record
 * (`medium`) and a session with more than {@link DENIED_APPROVALS_LIMIT} denied approvals (`medium`). The
 * lockfile-change-without-a-PR rule is its own check (`lockfile-changes.ts`). A quiet week yields nothing.
 */
export const behaviourCheck: GuardCheck = {
  id: BEHAVIOUR_CHECK_ID,
  title: 'Agent behaviour over the sweep window',
  category: 'agent',
  needs: ['auditTrail', 'vanguardFindings'],
  optional: ['vanguardFindings'],
  run(raw): SecurityFinding[] {
    const inputs = raw as { auditTrail?: AuditTrailInput; vanguardFindings?: VanguardFindingRef[] };
    const trail = inputs.auditTrail;
    if (!trail || !Array.isArray(trail.records)) return [];
    const inWindow = trail.records.filter((r) => r.at >= trail.windowStart && r.at <= trail.now);
    const baseline = trail.records.filter((r) => r.at < trail.windowStart);
    const findings: SecurityFinding[] = [];

    // Unusual hours, learned from the baseline's session start hours.
    const baselineSessions = sessionSpans(baseline);
    if (baselineSessions.length >= MIN_BASELINE_SESSIONS) {
      const perHour = new Array<number>(24).fill(0);
      for (const s of baselineSessions) perHour[hourOf(s.start)]!++;
      for (const s of sessionSpans(inWindow)) {
        if (perHour[hourOf(s.start)]! / baselineSessions.length > UNUSUAL_HOUR_SHARE) continue;
        findings.push(
          createGuardFinding({
            check: behaviourCheck,
            subject: `odd-hours:${s.sessionId}`,
            severity: 'low',
            title: 'An agent session ran outside your usual hours',
            detail: `Session ${s.sessionId} started ${stamp(s.start)}, an hour that held ${perHour[hourOf(s.start)]} of ${baselineSessions.length} sessions in the last 30 days.`,
            sessionId: s.sessionId,
            firstSeen: s.start,
          }),
        );
      }
    }

    // A Vanguard persistence or network finding that first appeared during a session.
    const spans = sessionSpans(inWindow);
    for (const f of inputs.vanguardFindings ?? []) {
      if (f.category !== 'persistence' && f.category !== 'network') continue;
      const span = spans.find((s) => f.firstSeen >= s.start && f.firstSeen <= s.end + SESSION_GRACE_MS);
      if (!span) continue;
      findings.push(
        createGuardFinding({
          check: behaviourCheck,
          subject: `during-session:${span.sessionId}:${f.fingerprint}`,
          severity: 'high',
          title: `${f.title} appeared while an agent session was running`,
          detail: `Vanguard finding ${f.fingerprint} (${f.category}) was first seen ${stamp(f.firstSeen)}, inside session ${span.sessionId} (${stamp(span.start)} to ${stamp(span.end)}). Check what that session ran.`,
          sessionId: span.sessionId,
          firstSeen: f.firstSeen,
        }),
      );
    }

    const denied = new Map<string, number>();
    for (const r of inWindow) {
      if (r.kind === 'limit-trip') {
        findings.push(
          createGuardFinding({
            check: behaviourCheck,
            subject: `limit-trip:${r.sessionId ?? 'none'}:${r.limit}`,
            severity: 'medium',
            title: `An agent run tripped the ${r.limit} limit`,
            detail: `${r.limit} reached ${r.observed} against a threshold of ${r.threshold} at ${stamp(r.at)}.`,
            ...(r.sessionId ? { sessionId: r.sessionId } : {}),
            firstSeen: r.at,
          }),
        );
      } else if (r.kind === 'approval' && r.decision === 'denied' && r.sessionId) {
        denied.set(r.sessionId, (denied.get(r.sessionId) ?? 0) + 1);
      }
    }
    for (const [sessionId, n] of denied) {
      if (n <= DENIED_APPROVALS_LIMIT) continue;
      findings.push(
        createGuardFinding({
          check: behaviourCheck,
          subject: `denied-approvals:${sessionId}`,
          severity: 'medium',
          title: `${n} approvals were denied in one agent session`,
          detail: `Session ${sessionId} asked for tool approvals ${n} times and was refused each time; an agent pushing against the policy is worth reading.`,
          sessionId,
        }),
      );
    }
    return findings;
  },
};
