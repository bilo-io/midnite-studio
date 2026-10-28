import { randomUUID } from 'node:crypto';

import {
  type GuardSweepRecord,
  type SecurityFinding,
  type SeverityCounts,
} from '@midnite/studio-shared';

import type { FindingsLedger } from '../security/findings-ledger';
import type { GuardCheck } from './check';
import { resolveGuardInputs, staticInputSkip, type GuardInputResolverContext } from './inputs';
import { createGuardSweepsStore, type GuardSweepsStore } from './sweeps-store';

export interface GuardSweepOptions {
  userData: string;
  checks: readonly GuardCheck[];
  ledger: FindingsLedger;
  sweepsStore?: GuardSweepsStore;
  context?: GuardInputResolverContext;
  now?: () => number;
}

export interface GuardSweepResult {
  record: GuardSweepRecord;
  findings: SecurityFinding[];
}

/**
 * Runs one recurring Guard sweep (Phase 122 Theme A).
 *
 * 1. Collects needed inputs across all checks and resolves them once via `resolveGuardInputs`.
 * 2. Runs checks whose inputs were not skipped.
 * 3. Records all produced findings into the ledger (deduplicating by fingerprint, bumping count/lastSeen).
 * 4. Resolves previous open findings from checks that ran but were no longer found (`resolvedBy: 'sweep'`).
 * 5. Tallies counts by severity and writes `<userData>/security/sweeps/<id>.json`.
 * 6. Appends a `GuardSweepRecord` to `guard-sweeps.json`.
 */
export async function runGuardSweep(options: GuardSweepOptions): Promise<GuardSweepResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const sweepId = randomUUID();
  const sweepsStore = options.sweepsStore ?? createGuardSweepsStore(options.userData);

  // 1. Gather all needed inputs and resolve
  // An input no check could use (its switch is off, or nothing resolves it) is recorded as skipped, and every check
  // that needs one is dropped *before* resolving, so a feed is never fetched on behalf of a check that cannot run.
  const context = { userData: options.userData, ...options.context };
  const staticSkips: Record<string, string> = {};
  for (const key of new Set(options.checks.flatMap((c) => c.needs))) {
    const reason = staticInputSkip(key, context);
    if (reason !== null) staticSkips[key] = reason;
  }
  const runnable = options.checks.filter((c) => !c.needs.some((key) => staticSkips[key] !== undefined));
  const neededKeys = Array.from(new Set(runnable.flatMap((c) => c.needs)));
  const resolved = await resolveGuardInputs(neededKeys, context);
  const inputs = resolved.inputs;
  const skipped = { ...staticSkips, ...resolved.skipped };

  // 2. Filter checks whose needed inputs were skipped
  const checksToRun: GuardCheck[] = [];
  for (const check of options.checks) {
    const hasSkippedInput = check.needs.some((key) => Boolean(skipped[key]));
    if (!hasSkippedInput) {
      checksToRun.push(check);
    }
  }

  // 3. Run eligible checks
  const currentFindings: SecurityFinding[] = [];
  const currentFingerprints = new Set<string>();

  const failedCheckIds = new Set<string>();
  for (const check of checksToRun) {
    try {
      const produced = await check.run(inputs);
      for (const finding of produced) {
        // Enforce source: 'guard' and ensure timestamps align with sweep clock
        const firstSeen = finding.firstSeen && finding.firstSeen <= startedAt ? finding.firstSeen : startedAt;
        const lastSeen = startedAt;
        const normalized: SecurityFinding = {
          ...finding,
          source: 'guard',
          firstSeen,
          lastSeen,
        };
        currentFindings.push(normalized);
        currentFingerprints.add(normalized.fingerprint);
      }
    } catch {
      // Check failure should not crash the sweep, nor count as a clean run
      failedCheckIds.add(check.id);
    }
  }

  // 4. Record into runtime findings ledger (dedupes open findings by fingerprint)
  const recordedFindings: SecurityFinding[] = [];
  for (const finding of currentFindings) {
    const recorded = await options.ledger.record(finding);
    recordedFindings.push(recorded);
  }

  // 5. Move open findings from previous sweeps that were not re-seen to resolved
  const ranCheckIds = new Set(checksToRun.filter((c) => !failedCheckIds.has(c.id)).map((c) => c.id));
  const openFindings = await options.ledger.list({ status: 'open', source: 'guard' });

  for (const openFinding of openFindings) {
    // Fingerprint format: <checkId>:<subject>
    const colonIndex = openFinding.fingerprint.indexOf(':');
    const checkId = colonIndex !== -1 ? openFinding.fingerprint.slice(0, colonIndex) : openFinding.fingerprint;

    // Only resolve if the check that originally reported it actually ran in this sweep
    if (ranCheckIds.has(checkId) && !currentFingerprints.has(openFinding.fingerprint)) {
      await options.ledger.setStatus(openFinding.id, 'resolved', 'sweep');
    }
  }

  // 6. Compute severity counts
  const counts: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of recordedFindings) {
    if (finding.severity in counts) {
      counts[finding.severity] += 1;
    }
  }

  // 7. Save findings JSON file for this sweep
  const findingsPath = await sweepsStore.saveFindings(sweepId, recordedFindings);

  const endedAt = now();

  // 8. Create and append GuardSweepRecord
  const record: GuardSweepRecord = {
    id: sweepId,
    startedAt,
    endedAt,
    checksRun: checksToRun.map((c) => c.id),
    inputsSkipped: skipped,
    counts,
    findingsPath,
  };

  await sweepsStore.append(record);

  return { record, findings: recordedFindings };
}
