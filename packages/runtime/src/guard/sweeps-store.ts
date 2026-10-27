import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  GuardSweepRecordSchema,
  SecurityFindingSchema,
  type GuardSweepRecord,
  type SecurityFinding,
} from '@midnite/studio-shared';

const SWEEPS_LEDGER_FILE = 'guard-sweeps.json';
const SECURITY_DIR = 'security';
const SWEEPS_DIR = 'sweeps';
export const MAX_STORED_GUARD_SWEEPS = 200;

export interface GuardSweepsStore {
  list(): Promise<GuardSweepRecord[]>;
  latest(): Promise<GuardSweepRecord | null>;
  append(record: GuardSweepRecord): Promise<void>;
  saveFindings(sweepId: string, findings: readonly SecurityFinding[]): Promise<string>;
  loadFindings(sweepId: string): Promise<SecurityFinding[]>;
}

export function createGuardSweepsStore(userData: string): GuardSweepsStore {
  const ledgerPath = join(userData, SWEEPS_LEDGER_FILE);
  const sweepsDir = join(userData, SECURITY_DIR, SWEEPS_DIR);

  let cache: GuardSweepRecord[] | null = null;
  let lock: Promise<unknown> = Promise.resolve();

  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = lock.then(fn, fn);
    lock = next.catch(() => undefined);
    return next;
  }

  async function loadRecords(): Promise<GuardSweepRecord[]> {
    if (cache !== null) return [...cache];
    try {
      const raw = await readFile(ledgerPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { records?: unknown }).records)) {
        const records: GuardSweepRecord[] = [];
        for (const item of (parsed as { records: unknown[] }).records) {
          const validated = GuardSweepRecordSchema.safeParse(item);
          if (validated.success) {
            records.push(validated.data);
          }
        }
        cache = records;
        return [...records];
      }
    } catch {
      // Missing or unparseable file
    }
    cache = [];
    return [];
  }

  return {
    async list(): Promise<GuardSweepRecord[]> {
      return withLock(async () => loadRecords());
    },

    async latest(): Promise<GuardSweepRecord | null> {
      return withLock(async () => {
        const records = await loadRecords();
        return records.length > 0 ? records[records.length - 1]! : null;
      });
    },

    async append(record: GuardSweepRecord): Promise<void> {
      return withLock(async () => {
        const records = await loadRecords();
        const next = [...records, record];
        const trimmed = next.length > MAX_STORED_GUARD_SWEEPS ? next.slice(next.length - MAX_STORED_GUARD_SWEEPS) : next;
        cache = trimmed;
        try {
          await writeFile(ledgerPath, JSON.stringify({ version: 1, records: trimmed }, null, 2) + '\n', 'utf8');
        } catch {
          // Ignore write failure in read-only environment
        }
      });
    },

    async saveFindings(sweepId: string, findings: readonly SecurityFinding[]): Promise<string> {
      await mkdir(sweepsDir, { recursive: true, mode: 0o700 });
      const filePath = join(sweepsDir, `${sweepId}.json`);
      const content = JSON.stringify(findings, null, 2) + '\n';
      await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
      return filePath;
    },

    async loadFindings(sweepId: string): Promise<SecurityFinding[]> {
      const filePath = join(sweepsDir, `${sweepId}.json`);
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const validated: SecurityFinding[] = [];
          for (const item of parsed) {
            const v = SecurityFindingSchema.safeParse(item);
            if (v.success) validated.push(v.data);
          }
          return validated;
        }
      } catch {
        // Not found
      }
      return [];
    },
  };
}
