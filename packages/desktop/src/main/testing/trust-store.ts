import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TestTrustStatus } from '@midnite/studio-shared';

/**
 * Which suites a repository may run — one grant per *suite*, not per repo.
 *
 * The `diagnostics/trust-store.ts` shape, widened from one record per repo to
 * a map: a repository's `package.json` can name a dozen scripts, and a fast
 * `vitest` run is not the same proposition as one that drives a real browser
 * through `playwright`. Approving `test` must say nothing about `e2e`.
 *
 * A grant stores the suite's command fingerprint, not a boolean — editing the
 * underlying script (or moon task) silently withdraws it, the same "the
 * prompt named a specific thing" rule diagnostics enforces.
 */

export type SuiteTrustRecord = { fingerprint: string; trustedAt: number };

export type TestTrustStore = {
  /** `liveFingerprint` is what discovery says the suite is *right now*. */
  status: (repoId: string, suiteId: string, liveFingerprint: string) => Promise<TestTrustStatus>;
  trust: (
    repoId: string,
    suiteId: string,
    fingerprint: string,
    now: number,
  ) => Promise<TestTrustStatus>;
  untrust: (repoId: string, suiteId: string) => Promise<TestTrustStatus>;
};

type StoredState = { version: 1; repos: Record<string, Record<string, SuiteTrustRecord>> };

const FILE_NAME = 'tests-trust.json';

const EMPTY_STATUS: TestTrustStatus = { state: 'untrusted', trustedAt: null };

export function createTestTrustStore(directory: string): TestTrustStore {
  const file = join(directory, FILE_NAME);
  let cache: Record<string, Record<string, SuiteTrustRecord>> | null = null;

  const load = async (): Promise<Record<string, Record<string, SuiteTrustRecord>>> => {
    if (cache) return cache;
    try {
      cache = parseTrustState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing or corrupt. Starting empty errs toward re-approving rather
      // than executing something nobody granted this session.
      cache = {};
    }
    return cache;
  };

  const save = async (repos: Record<string, Record<string, SuiteTrustRecord>>): Promise<void> => {
    const state: StoredState = { version: 1, repos };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down; the grant holds for
      // this session and is asked for again next launch.
    }
  };

  return {
    status: async (repoId, suiteId, liveFingerprint) => {
      const record = (await load())[repoId]?.[suiteId];
      if (!record || record.fingerprint !== liveFingerprint) return EMPTY_STATUS;
      return { state: 'trusted', trustedAt: record.trustedAt };
    },

    trust: async (repoId, suiteId, fingerprint, now) => {
      const repos = await load();
      repos[repoId] = { ...repos[repoId], [suiteId]: { fingerprint, trustedAt: now } };
      await save(repos);
      return { state: 'trusted', trustedAt: now };
    },

    untrust: async (repoId, suiteId) => {
      const repos = await load();
      const forRepo = { ...repos[repoId] };
      delete forRepo[suiteId];
      repos[repoId] = forRepo;
      await save(repos);
      return EMPTY_STATUS;
    },
  };
}

/** Validate a parsed `tests-trust.json`. A record that fails to parse is dropped. */
export function parseTrustState(value: unknown): Record<string, Record<string, SuiteTrustRecord>> {
  if (typeof value !== 'object' || value === null) return {};
  const repos = (value as { repos?: unknown }).repos;
  if (typeof repos !== 'object' || repos === null) return {};

  const out: Record<string, Record<string, SuiteTrustRecord>> = {};
  for (const [repoId, suites] of Object.entries(repos as Record<string, unknown>)) {
    if (!repoId || typeof suites !== 'object' || suites === null) continue;
    const forRepo: Record<string, SuiteTrustRecord> = {};
    for (const [suiteId, raw] of Object.entries(suites as Record<string, unknown>)) {
      if (!suiteId || typeof raw !== 'object' || raw === null) continue;
      const row = raw as Record<string, unknown>;
      const fingerprint = row['fingerprint'];
      const trustedAt = row['trustedAt'];
      if (typeof fingerprint === 'string' && typeof trustedAt === 'number' && Number.isFinite(trustedAt)) {
        forRepo[suiteId] = { fingerprint, trustedAt };
      }
    }
    if (Object.keys(forRepo).length > 0) out[repoId] = forRepo;
  }
  return out;
}

/** Trusts nothing and remembers nothing — the fallback before one is configured. */
export const nullTestTrustStore: TestTrustStore = {
  status: async () => EMPTY_STATUS,
  trust: async () => EMPTY_STATUS,
  untrust: async () => EMPTY_STATUS,
};
