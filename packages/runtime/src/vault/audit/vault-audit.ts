import { createHash } from 'node:crypto';
import { appendFile, chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GENESIS_HASH = '0'.repeat(64);
export const AUDIT_FILE_NAME = 'vault-audit.ndjson';
export const AUDIT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const VAULT_MODE = 0o600;

export type VaultAuditOp =
  | 'get'
  | 'set'
  | 'delete'
  | 'grant'
  | 'revoke'
  | 'pair'
  | 'unpair'
  | 'unlock'
  | 'unlock-failed'
  | 'lock'
  | 'reveal'
  | 'copy'
  | 'export'
  | 'import'
  | 'tamper';

export type VaultAuditResult = 'ok' | 'denied' | 'locked' | 'failed';

export type VaultAuditRecord = {
  t: number;
  seq: number;
  prev: string;
  op: VaultAuditOp;
  namespace?: string;
  id?: string;
  app: string;
  principal: string;
  result: VaultAuditResult;
  reason?: string;
  count?: number;
};

export type VaultAuditLog = {
  log(event: Omit<VaultAuditRecord, 'seq' | 'prev' | 't'> & { t?: number }): Promise<void>;
  flush(): Promise<void>;
  read(limit?: number): Promise<VaultAuditRecord[]>;
  verify(): Promise<{ valid: boolean; brokenSeq?: number; total: number; lastHash: string }>;
  getFilePath(): string;
};

export function hashLine(line: string): string {
  return createHash('sha256').update(line, 'utf8').digest('hex');
}

export async function verifyAuditLines(
  lines: string[],
): Promise<{ valid: boolean; brokenSeq?: number; total: number; lastHash: string }> {
  let prevHash = GENESIS_HASH;
  let total = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    total += 1;
    let parsed: VaultAuditRecord;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { valid: false, brokenSeq: total, total, lastHash: prevHash };
    }

    if (parsed.prev !== prevHash) {
      return { valid: false, brokenSeq: parsed.seq ?? total, total, lastHash: prevHash };
    }

    prevHash = hashLine(raw);
  }

  return { valid: true, total, lastHash: prevHash };
}

export async function verifyAuditChain(
  filePath: string,
): Promise<{ valid: boolean; brokenSeq?: number; total: number; lastHash: string }> {
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return verifyAuditLines(lines);
  } catch {
    return { valid: true, total: 0, lastHash: GENESIS_HASH };
  }
}

export type CoalesceKey = `${string}:${string}:${string}:${VaultAuditResult}`;

export function createVaultAuditLog(
  directory: string,
  onPersist?: (filePath: string) => Promise<void> | void,
  onBeforePersist?: (filePath: string) => (() => void) | void,
): VaultAuditLog {
  const filePath = join(directory, AUDIT_FILE_NAME);
  let initialized = false;
  let lastSeq = 0;
  let lastHash = GENESIS_HASH;

  // Coalesce buffer for 'get' ops within a 60s window
  const getCoalesce = new Map<CoalesceKey, { event: VaultAuditRecord; count: number; windowStart: number }>();
  const COALESCE_WINDOW_MS = 60_000;

  const init = async () => {
    if (initialized) return;
    initialized = true;
    try {
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const res = await verifyAuditLines(lines);
      lastSeq = res.total;
      lastHash = res.lastHash;
    } catch {
      lastSeq = 0;
      lastHash = GENESIS_HASH;
    }
  };

  const writeRecord = async (record: VaultAuditRecord) => {
    await init();
    const line = JSON.stringify(record);
    const lineHash = hashLine(line);
    try {
      // Check file size for rotation
      const s = await stat(filePath).catch(() => null);
      if (s && s.size >= AUDIT_MAX_FILE_BYTES) {
        const rotatedName = `vault-audit.${Date.now()}.ndjson`;
        await writeFile(join(directory, rotatedName), await readFile(filePath), { mode: VAULT_MODE });
        await writeFile(filePath, '', { mode: VAULT_MODE });
      }
    } catch {
      // Ignore rotation errors
    }

    const doneWriting = onBeforePersist?.(filePath);
    try {
      await appendFile(filePath, line + '\n', { encoding: 'utf8', mode: VAULT_MODE });
      await chmod(filePath, VAULT_MODE);
      await onPersist?.(filePath);
    } catch {
      // Ignore write/chmod errors if directory was deleted or is read-only
    } finally {
      doneWriting?.();
    }
    lastSeq = record.seq;
    lastHash = lineHash;
  };

  const flush = async () => {
    if (getCoalesce.size === 0) return;
    for (const [, item] of getCoalesce) {
      lastSeq += 1;
      const rec: VaultAuditRecord = {
        ...item.event,
        seq: lastSeq,
        prev: lastHash,
        count: item.count,
      };
      await writeRecord(rec);
    }
    getCoalesce.clear();
  };

  const log = async (event: Omit<VaultAuditRecord, 'seq' | 'prev' | 't'> & { t?: number }) => {
    await init();
    const now = event.t ?? Date.now();

    // Coalesce 'get' ops per (app, namespace, id, result)
    if (event.op === 'get' && event.namespace && event.id) {
      const key: CoalesceKey = `${event.app}:${event.namespace}:${event.id}:${event.result}`;
      const existing = getCoalesce.get(key);
      if (existing) {
        if (now - existing.windowStart < COALESCE_WINDOW_MS) {
          existing.count += 1;
          return;
        }
        // Window expired: flush this one and start fresh
        lastSeq += 1;
        await writeRecord({
          ...existing.event,
          seq: lastSeq,
          prev: lastHash,
          count: existing.count,
        });
        getCoalesce.delete(key);
      }
      getCoalesce.set(key, {
        event: {
          t: now,
          seq: 0,
          prev: '',
          op: 'get',
          namespace: event.namespace,
          id: event.id,
          app: event.app,
          principal: event.principal,
          result: event.result,
          reason: event.reason,
        },
        count: 1,
        windowStart: now,
      });
      return;
    }

    // Flush pending coalesced reads before other events
    await flush();

    lastSeq += 1;
    const record: VaultAuditRecord = {
      t: now,
      seq: lastSeq,
      prev: lastHash,
      op: event.op,
      namespace: event.namespace,
      id: event.id,
      app: event.app,
      principal: event.principal,
      result: event.result,
      reason: event.reason,
      ...(event.count !== undefined ? { count: event.count } : {}),
    };
    await writeRecord(record);
  };

  const read = async (limit = 200): Promise<VaultAuditRecord[]> => {
    await flush();
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const records: VaultAuditRecord[] = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // Skip invalid lines
        }
      }
      return records.slice(-limit).reverse();
    } catch {
      return [];
    }
  };

  const verify = async () => {
    await flush();
    return verifyAuditChain(filePath);
  };

  return {
    log,
    flush,
    read,
    verify,
    getFilePath: () => filePath,
  };
}
