import type { IntegrityBaseline, IntegrityBaselineFile } from '@midnite/studio-shared';

import type { WatchedFile } from './enumerate';

/**
 * The baseline diff (Phase 120 C) — pure, so every transition is a table test.
 *
 * Each file's baseline holds its **trusted** hash (the last state that arrived through a commit, or the
 * first one ever seen) and, while an out-of-commit change is open, a `flagged` record of the state that
 * was reported. A scan compares what is on disk against the last *observed* state (the flagged hash if
 * any, else the trusted one), so a change is reported once, not on every re-hash:
 *
 * | on disk vs last observed | committed? | outcome |
 * |---|---|---|
 * | same | — or no | nothing |
 * | same, flagged | yes | the change was committed: trust it, resolve the finding |
 * | different, back to trusted | — | reverted: clear the flag, resolve the finding |
 * | different | yes | arrived by commit (pull, checkout, commit): trust it, resolve any flag |
 * | different | no | **an out-of-commit change**: report it, flag it, keep the trusted hash |
 *
 * "Committed" means git lists nothing for the path: the file is exactly what HEAD holds (or was deleted
 * in a commit). A path git cannot vouch for — anything under the git dir, anything in the home dir — is
 * never committed, so every change to it is reported.
 */

export type IntegrityChangeKind = 'created' | 'modified' | 'deleted';

export interface IntegrityChange {
  file: WatchedFile;
  kind: IntegrityChangeKind;
  /** The last observed hash; `null` = absent. */
  before: string | null;
  /** The hash on disk now; `null` = absent. */
  after: string | null;
  fingerprint: string;
}

export interface IntegrityDiffResult {
  baseline: IntegrityBaseline;
  /** Out-of-commit changes to report. */
  changes: IntegrityChange[];
  /** Fingerprints of findings whose change has since been committed or reverted. */
  resolved: string[];
  /** True on the scope's first scan: everything was taken as the baseline and nothing reported. */
  fresh: boolean;
}

export function integrityFingerprint(scopeId: string, key: string): string {
  return `integrity:${scopeId}:${key}`;
}

const lastObserved = (file: IntegrityBaselineFile | undefined): string | null =>
  file === undefined ? null : file.flagged !== undefined ? file.flagged.hash : file.hash;

/**
 * The keys whose commit state the diff needs: every key that differs from its last observed state, plus
 * every flagged key (a flag clears when its change is committed, which changes no hash).
 */
export function integrityCandidates(
  baseline: IntegrityBaseline | null,
  observed: ReadonlyMap<string, string | null>,
): string[] {
  if (baseline === null) return [];
  const keys = new Set([...Object.keys(baseline.files), ...observed.keys()]);
  return [...keys].filter((key) => {
    const prev = baseline.files[key];
    return prev?.flagged !== undefined || (observed.get(key) ?? null) !== lastObserved(prev);
  });
}

export interface IntegrityDiffInput {
  scopeId: string;
  root: string;
  baseline: IntegrityBaseline | null;
  /** Every watched file enumerated this scan (absent `file` entries included). */
  files: readonly WatchedFile[];
  /** Hash per key for `files`; `null` = absent. */
  observed: ReadonlyMap<string, string | null>;
  /** Of the candidates, the keys whose current state is committed. */
  committed: ReadonlySet<string>;
  /**
   * The watched file for a key that is in the baseline but no longer enumerated (a deleted file under a
   * watched directory). Lets a deletion be reported with its entry.
   */
  fileFor: (key: string) => WatchedFile | undefined;
  now: number;
}

export function diffIntegrity(input: IntegrityDiffInput): IntegrityDiffResult {
  const { scopeId, baseline, observed, committed, now } = input;
  if (baseline === null) {
    const files: Record<string, IntegrityBaselineFile> = {};
    for (const [key, hash] of observed) if (hash !== null) files[key] = { hash };
    return {
      baseline: { version: 1, scopeId, root: input.root, createdAt: now, updatedAt: now, files },
      changes: [],
      resolved: [],
      fresh: true,
    };
  }

  const byKey = new Map(input.files.map((file) => [file.key, file]));
  const next: Record<string, IntegrityBaselineFile> = {};
  const changes: IntegrityChange[] = [];
  const resolved: string[] = [];
  const keys = [...new Set([...Object.keys(baseline.files), ...observed.keys()])].sort();

  for (const key of keys) {
    const prev = baseline.files[key];
    const trusted = prev?.hash ?? null;
    const last = lastObserved(prev);
    const now_ = observed.get(key) ?? null;
    const isCommitted = committed.has(key);
    let entry: IntegrityBaselineFile = { hash: trusted, ...(prev?.flagged ? { flagged: prev.flagged } : {}) };

    if (now_ === last) {
      if (prev?.flagged !== undefined && isCommitted) {
        resolved.push(prev.flagged.fingerprint);
        entry = { hash: now_ };
      }
    } else if (prev?.flagged !== undefined && now_ === trusted) {
      resolved.push(prev.flagged.fingerprint);
      entry = { hash: trusted };
    } else if (isCommitted) {
      if (prev?.flagged !== undefined) resolved.push(prev.flagged.fingerprint);
      entry = { hash: now_ };
    } else {
      const file = byKey.get(key) ?? input.fileFor(key);
      if (file !== undefined) {
        const fingerprint = integrityFingerprint(scopeId, key);
        changes.push({
          file,
          kind: last === null ? 'created' : now_ === null ? 'deleted' : 'modified',
          before: last,
          after: now_,
          fingerprint,
        });
        entry = { hash: trusted, flagged: { hash: now_, at: now, fingerprint } };
      } else {
        // A key whose entry left the watched set: forget it rather than report it.
        continue;
      }
    }

    if (entry.hash !== null || entry.flagged !== undefined) next[key] = entry;
  }

  return {
    baseline: { ...baseline, root: input.root, updatedAt: now, files: next },
    changes,
    resolved,
    fresh: false,
  };
}
