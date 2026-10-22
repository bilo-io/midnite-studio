import { randomUUID } from 'node:crypto';
import { appendFile, chmod, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  redactRecord,
  SecurityFindingSchema,
  type NewSecurityFinding,
  type SecurityFinding,
  type SecurityFindingCategory,
  type SecurityFindingSeverity,
  type SecurityFindingSource,
  type SecurityFindingStatus,
} from '@midnite/studio-shared';

const SECURITY_DIR = 'security';
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface FindingsLedgerOptions {
  /** The app's user data directory, under which security/ is placed. */
  userData: string;
  /** Home directory used for path redaction. Ambient home dir is used when omitted. */
  homeDir?: string;
  /** Clock source for testing. Defaults to Date.now. */
  now?: () => number;
  /** Optional callback fired when the ledger changes. */
  onChanged?: () => void;
}

export interface FindingsListFilter {
  status?: SecurityFindingStatus | SecurityFindingStatus[];
  severity?: SecurityFindingSeverity | SecurityFindingSeverity[];
  source?: SecurityFindingSource | SecurityFindingSource[];
  category?: SecurityFindingCategory | SecurityFindingCategory[];
  since?: number;
  sessionId?: string;
  repoId?: string;
}

export interface PruneResult {
  prunedCount: number;
  prunedFiles: string[];
}

export type PruneRetention = number | { maxAgeMs?: number; days?: number };

/** Convert a timestamp to `YYYY-MM` string for monthly ndjson filenames. */
export function formatYearMonth(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface FindingsLedger {
  record(input: NewSecurityFinding): Promise<SecurityFinding>;
  list(filter?: FindingsListFilter): Promise<SecurityFinding[]>;
  get(id: string): Promise<SecurityFinding | null>;
  setStatus(id: string, status: SecurityFindingStatus): Promise<SecurityFinding | null>;
  prune(retention: PruneRetention): Promise<PruneResult>;
  getSecurityDir(): string;
}

/**
 * Creates the runtime security findings ledger — Phase 120 Theme A.
 *
 * Stores findings in append-only NDJSON files partitioned monthly:
 * `<userData>/security/findings-<yyyy-mm>.ndjson`
 * Directory is kept at 0700, and files at 0600.
 * Records are scrubbed via `redactRecord` before writing to disk.
 * Deduplicates by `fingerprint` within the open set (bumps count & lastSeen rather than adding a row).
 * Mutations are serialised through a `withLock` promise queue.
 */
export function createFindingsLedger(options: FindingsLedgerOptions): FindingsLedger {
  const securityDir = join(options.userData, SECURITY_DIR);
  const now = options.now ?? (() => Date.now());

  let loaded: Promise<void> | null = null;
  let lock: Promise<unknown> = Promise.resolve();

  const findings = new Map<string, SecurityFinding>();
  const openFingerprints = new Map<string, string>(); // fingerprint -> findingId
  const fileAssignments = new Map<string, string>(); // findingId -> filename (e.g. findings-2026-10.ndjson)

  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = lock.then(fn, fn);
    lock = next.catch(() => undefined);
    return next;
  }

  async function ensureDir(): Promise<void> {
    await mkdir(securityDir, { recursive: true, mode: DIR_MODE });
    try {
      await chmod(securityDir, DIR_MODE);
    } catch {
      // Ignore chmod error on unsupported filesystems
    }
  }

  async function ensureLoaded(): Promise<void> {
    loaded ??= (async () => {
      await ensureDir();
      findings.clear();
      openFingerprints.clear();
      fileAssignments.clear();

      let entries: string[] = [];
      try {
        entries = await readdir(securityDir);
      } catch {
        return;
      }

      const fileRegex = /^findings-(\d{4}-\d{2})\.ndjson$/;
      const matchingFiles = entries.filter((e) => fileRegex.test(e)).sort();

      for (const fileName of matchingFiles) {
        const filePath = join(securityDir, fileName);
        try {
          const content = await readFile(filePath, 'utf8');
          const lines = content.split('\n');
          for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as unknown;
              const validated = SecurityFindingSchema.safeParse(parsed);
              if (validated.success) {
                const item = validated.data;
                findings.set(item.id, item);
                fileAssignments.set(item.id, fileName);
                if (item.status === 'open') {
                  openFingerprints.set(item.fingerprint, item.id);
                }
              }
            } catch {
              // Ignore corrupt line
            }
          }
        } catch {
          // File might have been removed or unreadable
        }
      }
    })();
    await loaded;
  }

  async function writeMonthlyFile(fileName: string): Promise<void> {
    await ensureDir();
    const filePath = join(securityDir, fileName);
    const items: SecurityFinding[] = [];
    for (const [id, fName] of fileAssignments) {
      if (fName === fileName) {
        const item = findings.get(id);
        if (item) items.push(item);
      }
    }

    if (items.length === 0) {
      try {
        await unlink(filePath);
      } catch {
        // Already gone
      }
      return;
    }

    // Sort by firstSeen ascending
    items.sort((a, b) => a.firstSeen - b.firstSeen);
    const lines = items.map((item) => {
      const redacted = redactRecord(item, options.homeDir);
      return JSON.stringify(redacted);
    });

    const content = lines.join('\n') + '\n';
    await writeFile(filePath, content, { encoding: 'utf8', mode: FILE_MODE });
    try {
      await chmod(filePath, FILE_MODE);
    } catch {
      // Ignore chmod error
    }
  }

  async function appendRecordToFile(fileName: string, item: SecurityFinding): Promise<void> {
    await ensureDir();
    const filePath = join(securityDir, fileName);
    const redacted = redactRecord(item, options.homeDir);
    const line = JSON.stringify(redacted) + '\n';

    await appendFile(filePath, line, { encoding: 'utf8', mode: FILE_MODE });
    try {
      await chmod(filePath, FILE_MODE);
    } catch {
      // Ignore chmod error
    }
  }

  return {
    getSecurityDir: () => securityDir,

    async record(input: NewSecurityFinding): Promise<SecurityFinding> {
      return withLock(async () => {
        await ensureLoaded();
        const currentNow = now();

        // Dedupe within the open set by fingerprint
        const existingId = openFingerprints.get(input.fingerprint);
        if (existingId) {
          const existing = findings.get(existingId);
          if (existing && existing.status === 'open') {
            existing.count += 1;
            existing.lastSeen = input.lastSeen ?? currentNow;
            if (input.evidence && input.evidence.length > 0) {
              existing.evidence = input.evidence;
            }
            if (input.detail) {
              existing.detail = input.detail;
            }

            const fileName = fileAssignments.get(existing.id) ?? `findings-${formatYearMonth(existing.firstSeen)}.ndjson`;
            fileAssignments.set(existing.id, fileName);
            await writeMonthlyFile(fileName);

            options.onChanged?.();
            return existing;
          }
        }

        // New finding row
        const id = input.id ?? randomUUID();
        const firstSeen = input.firstSeen ?? currentNow;
        const lastSeen = input.lastSeen ?? firstSeen;
        const count = input.count ?? 1;
        const status: SecurityFindingStatus = input.status ?? 'open';

        const finding: SecurityFinding = {
          id,
          fingerprint: input.fingerprint,
          source: input.source,
          severity: input.severity,
          category: input.category,
          title: input.title,
          detail: input.detail,
          evidence: input.evidence,
          remediation: input.remediation,
          firstSeen,
          lastSeen,
          count,
          status,
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ...(input.repoId ? { repoId: input.repoId } : {}),
          ...(input.actions ? { actions: input.actions } : {}),
          ...(input.resolvedBy ? { resolvedBy: input.resolvedBy } : {}),
        };

        const validated = SecurityFindingSchema.parse(finding);
        findings.set(id, validated);
        if (validated.status === 'open') {
          openFingerprints.set(validated.fingerprint, id);
        }

        const fileName = `findings-${formatYearMonth(firstSeen)}.ndjson`;
        fileAssignments.set(id, fileName);

        await appendRecordToFile(fileName, validated);

        options.onChanged?.();
        return validated;
      });
    },

    async list(filter?: FindingsListFilter): Promise<SecurityFinding[]> {
      await ensureLoaded();

      const statusFilter = filter?.status ? (Array.isArray(filter.status) ? filter.status : [filter.status]) : null;
      const severityFilter = filter?.severity
        ? Array.isArray(filter.severity)
          ? filter.severity
          : [filter.severity]
        : null;
      const sourceFilter = filter?.source ? (Array.isArray(filter.source) ? filter.source : [filter.source]) : null;
      const categoryFilter = filter?.category
        ? Array.isArray(filter.category)
          ? filter.category
          : [filter.category]
        : null;

      const result: SecurityFinding[] = [];
      for (const item of findings.values()) {
        if (statusFilter && !statusFilter.includes(item.status)) continue;
        if (severityFilter && !severityFilter.includes(item.severity)) continue;
        if (sourceFilter && !sourceFilter.includes(item.source)) continue;
        if (categoryFilter && !categoryFilter.includes(item.category)) continue;
        if (filter?.since !== undefined && item.lastSeen < filter.since) continue;
        if (filter?.sessionId !== undefined && item.sessionId !== filter.sessionId) continue;
        if (filter?.repoId !== undefined && item.repoId !== filter.repoId) continue;

        result.push({ ...item });
      }

      // Newest first
      result.sort((a, b) => b.lastSeen - a.lastSeen);
      return result;
    },

    async get(id: string): Promise<SecurityFinding | null> {
      await ensureLoaded();
      const item = findings.get(id);
      return item ? { ...item } : null;
    },

    async setStatus(id: string, status: SecurityFindingStatus): Promise<SecurityFinding | null> {
      return withLock(async () => {
        await ensureLoaded();
        const existing = findings.get(id);
        if (!existing) return null;

        existing.status = status;
        if (status === 'open') {
          openFingerprints.set(existing.fingerprint, existing.id);
        } else if (openFingerprints.get(existing.fingerprint) === existing.id) {
          openFingerprints.delete(existing.fingerprint);
        }

        const fileName = fileAssignments.get(id) ?? `findings-${formatYearMonth(existing.firstSeen)}.ndjson`;
        await writeMonthlyFile(fileName);

        options.onChanged?.();
        return { ...existing };
      });
    },

    async prune(retention: PruneRetention): Promise<PruneResult> {
      return withLock(async () => {
        await ensureLoaded();
        const currentNow = now();

        let retentionMs: number;
        if (typeof retention === 'number') {
          retentionMs = retention < 3650 ? retention * 24 * 60 * 60 * 1000 : retention;
        } else {
          retentionMs = retention.maxAgeMs ?? (retention.days ? retention.days * 24 * 60 * 60 * 1000 : 0);
        }

        const cutoff = currentNow - retentionMs;
        const prunedFiles: string[] = [];
        let prunedCount = 0;

        // Group findings by file
        const filesToRewrite = new Set<string>();
        const filesToDelete = new Set<string>();

        // Check each monthly file
        const fileRegex = /^findings-(\d{4})-(\d{2})\.ndjson$/;
        let dirEntries: string[] = [];
        try {
          dirEntries = await readdir(securityDir);
        } catch {
          return { prunedCount: 0, prunedFiles: [] };
        }

        for (const fileName of dirEntries) {
          const match = fileRegex.exec(fileName);
          if (!match) continue;

          const year = parseInt(match[1]!, 10);
          const month = parseInt(match[2]!, 10);
          // Month end timestamp (in UTC)
          const monthEnd = Date.UTC(year, month, 1, 0, 0, 0, 0) - 1;

          if (monthEnd < cutoff) {
            // Entire month is older than cutoff
            filesToDelete.add(fileName);
          }
        }

        // Remove findings belonging to deleted files
        for (const [id, fileName] of Array.from(fileAssignments.entries())) {
          if (filesToDelete.has(fileName)) {
            const item = findings.get(id);
            if (item) {
              findings.delete(id);
              if (openFingerprints.get(item.fingerprint) === id) {
                openFingerprints.delete(item.fingerprint);
              }
              fileAssignments.delete(id);
              prunedCount += 1;
            }
          }
        }

        // For files that are kept, check if individual findings inside them are older than cutoff
        for (const [id, item] of Array.from(findings.entries())) {
          if (item.lastSeen < cutoff) {
            const fileName = fileAssignments.get(id);
            findings.delete(id);
            if (openFingerprints.get(item.fingerprint) === id) {
              openFingerprints.delete(item.fingerprint);
            }
            fileAssignments.delete(id);
            prunedCount += 1;
            if (fileName && !filesToDelete.has(fileName)) {
              filesToRewrite.add(fileName);
            }
          }
        }

        // Delete expired files from disk
        for (const fileName of filesToDelete) {
          const filePath = join(securityDir, fileName);
          try {
            await unlink(filePath);
            prunedFiles.push(fileName);
          } catch {
            // Already unlinked
          }
        }

        // Rewrite files that had partial findings pruned
        for (const fileName of filesToRewrite) {
          await writeMonthlyFile(fileName);
        }

        if (prunedCount > 0) {
          options.onChanged?.();
        }

        return { prunedCount, prunedFiles };
      });
    },
  };
}
