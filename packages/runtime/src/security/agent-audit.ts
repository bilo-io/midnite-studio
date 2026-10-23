import { randomUUID } from 'node:crypto';
import { appendFile, chmod, mkdir, open, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AGENT_AUDIT_DEFAULT_LIMIT,
  AGENT_AUDIT_DEFAULT_RETENTION_DAYS,
  agentAuditFileDay,
  agentAuditFileName,
  AgentAuditRecordSchema,
  redactRecord,
  type AgentAuditCursor,
  type AgentAuditFilter,
  type AgentAuditKind,
  type AgentAuditRecord,
  type NewAgentAuditRecord,
} from '@midnite/studio-shared';

/**
 * The agent audit trail — Phase 121 Theme G.
 *
 * Append-only NDJSON, one file per UTC day:
 * `<userData>/security/audit/agents-<yyyy-mm-dd>.ndjson`, the directory 0700 and each file 0600.
 * Every record is validated against `AgentAuditRecordSchema` (an unknown field is stripped — that is
 * how `mcp-call` stays payload-free) and then run through `redactRecord` before it is serialised, so
 * a vault token in a command line is `<redacted>` on disk, not only on the screen.
 *
 * **Two halves, one file format.** {@link createAgentAuditReader} is the read side and imports
 * nothing but `shared` and `node:fs`: Phase 120 Theme G (Vanguard's rogue-agent rules) opens it over
 * the trail's directory and either reads a window ({@link AgentAuditReader.list},
 * {@link AgentAuditReader.tail}) or follows the day file with {@link AgentAuditReader.readSince} and
 * the cursor it returns. {@link createAgentAudit} adds the writer on top.
 *
 * **A write never throws into its caller.** An audit failure must not break an agent: `record`
 * returns void, serialises through one promise chain and hands any error to `onError` (the host's
 * log seam) and swallows it.
 *
 * **A torn last line is survivable.** A crash mid-write leaves a line with no newline. Readers skip
 * a line that does not parse, `readSince` never consumes an unterminated line (it is retried on the
 * next read), and the writer starts a file it did not create with a newline if the last byte is not
 * one, so the next record is not glued onto the torn one.
 */

const AUDIT_DIR = join('security', 'audit');
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const DAY_MS = 86_400_000;

/** A string field longer than this is clipped *after* redaction, so a clip can never split a secret open. */
const MAX_FIELD_CHARS = 4000;

/** The directory the trail lives in under a user data directory. */
export function agentAuditDirectory(userData: string): string {
  return join(userData, AUDIT_DIR);
}

export interface AgentAuditReaderOptions {
  /** The trail directory (`agentAuditDirectory(userData)`). */
  directory: string;
}

export interface AgentAuditTailOptions {
  /** Only this kind. */
  kind?: AgentAuditKind;
  /** Newest `limit` records; default 50. */
  limit?: number;
}

export interface AgentAuditReadResult {
  /** Oldest first — the order a watcher replays them in. */
  records: AgentAuditRecord[];
  /** Pass this back to the next `readSince`. */
  cursor: AgentAuditCursor | null;
}

export interface AgentAuditReader {
  readonly directory: string;
  /**
   * Records matching `filter`, **newest first**, at most `limit` (default 200). `truncated` says more
   * matched than were returned.
   */
  list(filter?: AgentAuditFilter & { limit?: number }): Promise<{ records: AgentAuditRecord[]; truncated: boolean }>;
  /** The newest `limit` records (optionally of one kind), **newest first**. */
  tail(options?: AgentAuditTailOptions): Promise<AgentAuditRecord[]>;
  /**
   * Everything appended after `cursor` (a `null` cursor starts at the end of the trail, returning
   * nothing — a watcher that wants history calls `list` first). Only complete lines are consumed, so a
   * record being written right now arrives whole on the next call. Spans a day rollover: the rest of
   * the cursor's file, then every later day file.
   */
  readSince(cursor: AgentAuditCursor | null): Promise<AgentAuditReadResult>;
}

export interface AgentAuditOptions {
  /** The app's user data directory; the trail is `<userData>/security/audit/`. */
  userData: string;
  /** Home directory for path redaction. The ambient home is used when omitted. */
  homeDir?: string;
  /**
   * Days to keep. Phase 115 B's "Keep local history" setting, read at each prune so a change takes
   * effect without a restart; `0`, a negative number or `Infinity` keeps everything. Defaults to
   * {@link AGENT_AUDIT_DEFAULT_RETENTION_DAYS} until that setting exists.
   */
  retentionDays?: number | (() => number);
  /** Clock, for tests. */
  now?: () => number;
  /** Where a swallowed write or prune failure goes. */
  onError?: (error: unknown) => void;
  /** Fired after each record is on disk (a viewer can refresh). */
  onAppended?: (record: AgentAuditRecord) => void;
}

export interface AgentAudit extends AgentAuditReader {
  /**
   * Append one record. Fire-and-forget and total: validation, redaction and I/O failures are logged
   * through `onError` and dropped. Returns the record's id.
   */
  record(input: NewAgentAuditRecord): string;
  /** Resolves when every record accepted so far is on disk. Never rejects. */
  flush(): Promise<void>;
  /** Delete day files older than the retention window. Returns the names removed. Never rejects. */
  prune(): Promise<string[]>;
  /** Write the trail (filtered, oldest first) to `path` as NDJSON, mode 0600. Returns the record count. */
  exportTo(path: string, filter?: AgentAuditFilter): Promise<number>;
}

// --- reader ------------------------------------------------------------------

async function listDayFiles(directory: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  return names.filter((n) => agentAuditFileDay(n) !== null).sort();
}

/** Parse the complete lines of `text`; a line that is not a valid record is skipped. */
function parseLines(text: string): AgentAuditRecord[] {
  const out: AgentAuditRecord[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    try {
      const parsed = AgentAuditRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // A torn or hand-edited line.
    }
  }
  return out;
}

function matches(record: AgentAuditRecord, filter: AgentAuditFilter): boolean {
  if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(record.kind)) return false;
  if (filter.sessionId !== undefined && record.sessionId !== filter.sessionId) return false;
  if (filter.since !== undefined && record.at < filter.since) return false;
  if (filter.until !== undefined && record.at >= filter.until) return false;
  return true;
}

/** The read side: no writes, no `electron`, no feature imports. */
export function createAgentAuditReader(options: AgentAuditReaderOptions, beforeRead?: () => Promise<void>): AgentAuditReader {
  const { directory } = options;

  async function readFileText(name: string): Promise<string> {
    try {
      return await readFile(join(directory, name), 'utf8');
    } catch {
      return '';
    }
  }

  async function list(filter: AgentAuditFilter & { limit?: number } = {}) {
    await beforeRead?.();
    const limit = filter.limit ?? AGENT_AUDIT_DEFAULT_LIMIT;
    const files = (await listDayFiles(directory)).reverse(); // newest day first
    const since = filter.since;
    const records: AgentAuditRecord[] = [];
    let truncated = false;
    for (const name of files) {
      // A whole day older than `since` (and so every earlier one) cannot match.
      const day = agentAuditFileDay(name);
      if (since !== undefined && day !== null && day + DAY_MS <= since) break;
      const inFile = parseLines(await readFileText(name)).reverse();
      for (const record of inFile) {
        if (!matches(record, filter)) continue;
        if (records.length >= limit) {
          truncated = true;
          break;
        }
        records.push(record);
      }
      if (truncated) break;
    }
    return { records, truncated };
  }

  async function tail(opts: AgentAuditTailOptions = {}): Promise<AgentAuditRecord[]> {
    const { records } = await list({ ...(opts.kind ? { kinds: [opts.kind] } : {}), limit: opts.limit ?? 50 });
    return records;
  }

  async function readSince(cursor: AgentAuditCursor | null): Promise<AgentAuditReadResult> {
    await beforeRead?.();
    const files = await listDayFiles(directory);
    // Nothing on disk yet: the empty-file cursor, so whatever is written first is read, not skipped.
    if (files.length === 0) return { records: [], cursor: cursor ?? { file: '', offset: 0 } };

    const endOf = async (name: string): Promise<number> => {
      const text = await readFileText(name);
      const lastNewline = text.lastIndexOf('\n');
      return lastNewline === -1 ? 0 : Buffer.byteLength(text.slice(0, lastNewline + 1));
    };

    if (cursor === null) {
      const last = files[files.length - 1]!;
      return { records: [], cursor: { file: last, offset: await endOf(last) } };
    }

    const records: AgentAuditRecord[] = [];
    let current: AgentAuditCursor = cursor;
    // The cursor's own file (if it still exists) and every later one.
    const pending = files.filter((n) => n >= cursor.file);
    for (const name of pending) {
      const bytes = Buffer.from(await readFileText(name), 'utf8');
      const from = name === cursor.file ? Math.min(cursor.offset, bytes.length) : 0;
      const slice = bytes.subarray(from);
      const lastNewline = slice.lastIndexOf(0x0a);
      if (lastNewline === -1) {
        current = { file: name, offset: from };
        continue;
      }
      records.push(...parseLines(slice.subarray(0, lastNewline + 1).toString('utf8')));
      current = { file: name, offset: from + lastNewline + 1 };
    }
    return { records, cursor: current };
  }

  return { directory, list, tail, readSince };
}

// --- writer ------------------------------------------------------------------

function clipStrings<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.length > MAX_FIELD_CHARS) out[key] = `${value.slice(0, MAX_FIELD_CHARS)}…`;
    else if (Array.isArray(value)) out[key] = value.map((v) => (typeof v === 'string' && v.length > MAX_FIELD_CHARS ? `${v.slice(0, MAX_FIELD_CHARS)}…` : v));
    else out[key] = value;
  }
  return out as T;
}

/** The trail: the reader plus the writer, retention and export. */
export function createAgentAudit(options: AgentAuditOptions): AgentAudit {
  const directory = agentAuditDirectory(options.userData);
  const now = options.now ?? (() => Date.now());
  const onError = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // The error sink itself must not throw into an agent.
    }
  };

  let chain: Promise<unknown> = Promise.resolve();
  let dirReady: Promise<void> | null = null;
  /** The day files this process has already checked for a torn tail. */
  const checkedFiles = new Set<string>();
  let lastPruneDay = -1;

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }

  async function ensureDir(): Promise<void> {
    dirReady ??= (async () => {
      await mkdir(directory, { recursive: true, mode: DIR_MODE });
      // `mkdir`'s mode is masked by the umask and does not touch an existing directory.
      await chmod(directory, DIR_MODE).catch(() => undefined);
      await chmod(join(options.userData, 'security'), DIR_MODE).catch(() => undefined);
    })().catch((error: unknown) => {
      dirReady = null; // retry on the next record
      throw error;
    });
    await dirReady;
  }

  /** A file a crash left without its final newline would swallow the next record; end it first. */
  async function terminateTornTail(path: string): Promise<void> {
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return; // no such file yet
    }
    if (size === 0) return;
    const handle = await open(path, 'r');
    try {
      const buf = Buffer.alloc(1);
      await handle.read(buf, 0, 1, size - 1);
      if (buf[0] !== 0x0a) await appendFile(path, '\n', { mode: FILE_MODE });
    } finally {
      await handle.close();
    }
  }

  async function write(record: AgentAuditRecord): Promise<void> {
    await ensureDir();
    const name = agentAuditFileName(record.at);
    const path = join(directory, name);
    if (!checkedFiles.has(name)) {
      await terminateTornTail(path);
      checkedFiles.add(name);
    }
    await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: FILE_MODE });
    await chmod(path, FILE_MODE).catch(() => undefined);
    options.onAppended?.(record);

    // The first write of a new UTC day also prunes, so a long-running app keeps to its window.
    const day = Math.floor(record.at / DAY_MS);
    if (day !== lastPruneDay) {
      lastPruneDay = day;
      await pruneNow().catch(onError);
    }
  }

  async function pruneNow(): Promise<string[]> {
    const configured = typeof options.retentionDays === 'function' ? options.retentionDays() : options.retentionDays;
    const days = configured ?? AGENT_AUDIT_DEFAULT_RETENTION_DAYS;
    if (!Number.isFinite(days) || days <= 0) return [];
    const cutoff = Math.floor(now() / DAY_MS) * DAY_MS - days * DAY_MS;
    const removed: string[] = [];
    for (const name of await listDayFiles(directory)) {
      const day = agentAuditFileDay(name);
      if (day === null || day >= cutoff) continue;
      try {
        await unlink(join(directory, name));
        checkedFiles.delete(name);
        removed.push(name);
      } catch (error) {
        onError(error);
      }
    }
    return removed;
  }

  const flush = async (): Promise<void> => {
    await chain.catch(() => undefined);
  };

  const reader = createAgentAuditReader({ directory }, flush);

  return {
    ...reader,

    record(input) {
      const id = randomUUID();
      try {
        const candidate = { ...input, id, at: input.at ?? now() };
        const validated = AgentAuditRecordSchema.parse(candidate);
        const clean = clipStrings(redactRecord(validated as Record<string, unknown>, options.homeDir)) as AgentAuditRecord;
        void enqueue(() => write(clean)).catch(onError);
      } catch (error) {
        onError(error);
      }
      return id;
    },

    flush,

    async prune() {
      try {
        await flush();
        return await enqueue(pruneNow);
      } catch (error) {
        onError(error);
        return [];
      }
    },

    async exportTo(path, filter = {}) {
      await flush();
      const { records } = await reader.list({ ...filter, limit: Number.MAX_SAFE_INTEGER });
      // The lines are already redacted on disk; redact again so a trail written by an older build,
      // or a pattern added since, is covered on the way out.
      const lines = records
        .reverse()
        .map((r) => JSON.stringify(clipStrings(redactRecord(r as Record<string, unknown>, options.homeDir))));
      await writeFile(path, lines.length === 0 ? '' : `${lines.join('\n')}\n`, { encoding: 'utf8', mode: FILE_MODE });
      await chmod(path, FILE_MODE).catch(() => undefined);
      return records.length;
    },
  };
}
