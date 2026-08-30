import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DiagnosticsCommandSchema,
  commandFingerprint,
  type DiagnosticsCommand,
  type DiagnosticsTrustStatus,
} from '@midnite/studio-shared';

/**
 * Which repositories may run their own tooling, and what they are allowed to run.
 *
 * Keyed by repoId like `repos.json`, and persisted for the same reason: a trust
 * decision the user made once should not be asked again next launch. This is
 * the **first per-repo persisted config in the app** — every setting before it
 * has been global — so the shape is deliberately a map from repoId to a record,
 * rather than a list with a repoId field, and there is room in each record for
 * settings that are not about trust.
 *
 * The userData directory is **injected** rather than read from
 * `app.getPath('userData')` here, so this module carries no `electron` import
 * and the whole store is testable against a temp dir — the same split
 * `repo-store.ts` makes.
 *
 * A grant stores the command's fingerprint, not a boolean. `trusted` alone
 * would mean editing the configured command silently inherits the old
 * approval; the fingerprint makes an edit revoke it, which is the only reading
 * consistent with a prompt that named the command.
 */

export type TrustRecord = {
  /** What would run. `null` once detection has been offered but nothing chosen. */
  command: DiagnosticsCommand | null;
  /** Fingerprint of the command the user approved, or `null` for no grant. */
  grant: string | null;
  /** Epoch ms of that approval. */
  trustedAt: number | null;
};

export type TrustStore = {
  status: (repoId: string) => Promise<DiagnosticsTrustStatus>;
  /** The command to actually run, or `null` when there is no live grant. */
  trustedCommand: (repoId: string) => Promise<DiagnosticsCommand | null>;
  trust: (repoId: string, command: DiagnosticsCommand, now: number) => Promise<DiagnosticsTrustStatus>;
  untrust: (repoId: string) => Promise<DiagnosticsTrustStatus>;
};

type StoredState = { version: 1; repos: Record<string, TrustRecord> };

const FILE_NAME = 'trust.json';

const EMPTY_STATUS: DiagnosticsTrustStatus = { state: 'no-command', command: null, trustedAt: null };

/** Derive the four-arm state from a record. The one place the rule lives. */
export function statusFor(record: TrustRecord | undefined): DiagnosticsTrustStatus {
  if (!record || record.command === null) return EMPTY_STATUS;
  const fingerprint = commandFingerprint(record.command);
  if (record.grant === null) {
    return { state: 'untrusted', command: record.command, trustedAt: null };
  }
  if (record.grant !== fingerprint) {
    // Configured one thing, approved another. Not the same as never having
    // been asked, and the UI says so in different words.
    return { state: 'command-changed', command: record.command, trustedAt: record.trustedAt };
  }
  return { state: 'trusted', command: record.command, trustedAt: record.trustedAt };
}

export function createTrustStore(directory: string): TrustStore {
  const file = join(directory, FILE_NAME);
  let cache: Record<string, TrustRecord> | null = null;

  const load = async (): Promise<Record<string, TrustRecord>> => {
    if (cache) return cache;
    try {
      cache = parseTrustState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing (nothing trusted yet) or corrupt. Starting empty is the safe
      // direction for this particular file: the cost is re-approving, and the
      // alternative — guessing at a half-readable grant — is executing
      // something nobody approved.
      cache = {};
    }
    return cache;
  };

  const save = async (repos: Record<string, TrustRecord>): Promise<void> => {
    const state: StoredState = { version: 1, repos };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down. The grant holds for
      // this session and is asked for again next launch — which errs toward
      // prompting too often rather than executing without a record.
    }
  };

  return {
    status: async (repoId) => statusFor((await load())[repoId]),

    trustedCommand: async (repoId) => {
      const status = statusFor((await load())[repoId]);
      return status.state === 'trusted' ? status.command : null;
    },

    trust: async (repoId, command, now) => {
      const repos = await load();
      repos[repoId] = { command, grant: commandFingerprint(command), trustedAt: now };
      await save(repos);
      return statusFor(repos[repoId]);
    },

    untrust: async (repoId) => {
      const repos = await load();
      const existing = repos[repoId];
      // The command survives revocation so re-enabling is one click rather than
      // a second trip through detection. Only the grant is destroyed.
      repos[repoId] = { command: existing?.command ?? null, grant: null, trustedAt: null };
      await save(repos);
      return statusFor(repos[repoId]);
    },
  };
}

/**
 * Validate a parsed `trust.json`.
 *
 * Total, and strict about the command: a record whose command does not parse is
 * dropped entirely rather than kept with a `null` command, because the thing
 * that failed to validate is the thing we would otherwise execute. Unlike
 * `repo-store.ts` this reaches for the real zod schema — the value is shared
 * with the renderer and ends up as an argument vector, which is exactly when a
 * hand-rolled type guard stops being good enough.
 */
export function parseTrustState(value: unknown): Record<string, TrustRecord> {
  if (typeof value !== 'object' || value === null) return {};
  const repos = (value as { repos?: unknown }).repos;
  if (typeof repos !== 'object' || repos === null) return {};

  const out: Record<string, TrustRecord> = {};
  for (const [repoId, raw] of Object.entries(repos as Record<string, unknown>)) {
    if (!repoId || typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const parsed = DiagnosticsCommandSchema.safeParse(row['command']);
    if (!parsed.success) continue;

    const grant = typeof row['grant'] === 'string' ? row['grant'] : null;
    const trustedAt =
      typeof row['trustedAt'] === 'number' && Number.isFinite(row['trustedAt'])
        ? row['trustedAt']
        : null;

    // A grant with no timestamp is incoherent enough to distrust; drop the
    // grant rather than the record, so the command survives for re-approval.
    out[repoId] =
      grant !== null && trustedAt !== null
        ? { command: parsed.data, grant, trustedAt }
        : { command: parsed.data, grant: null, trustedAt: null };
  }
  return out;
}

/** Trusts nothing and remembers nothing — the fallback before one is configured. */
export const nullTrustStore: TrustStore = {
  status: async () => EMPTY_STATUS,
  trustedCommand: async () => null,
  trust: async () => EMPTY_STATUS,
  untrust: async () => EMPTY_STATUS,
};
