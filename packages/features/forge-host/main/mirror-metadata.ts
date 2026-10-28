import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writePrivateFile } from '@midnite/studio-runtime';

/**
 * Forge metadata for a mirror (Phase 119 Theme A). The source is a port: the forge feature owns the
 * adapters and a feature never imports another, so Theme C/F's composer hands `forge-host` an object
 * that wraps `ForgeAdapter` (`listIssues`, `listPulls`, `pullComments`, ...). This file owns what is
 * written and how a refresh is made incremental.
 */
export const NDJSON_KINDS = ['issues', 'pulls', 'reviews', 'comments'] as const;
export type NdjsonKind = (typeof NDJSON_KINDS)[number];
export const SNAPSHOT_KINDS = ['labels', 'milestones', 'releases'] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

/** A record with a stable `id`, so a refresh can replace it rather than append a duplicate. */
export type MetadataRecord = { id: string | number } & Record<string, unknown>;

/** Thrown by a source on HTTP 403/429; `retryAfterMs` honours the provider's own hint when it sent one. */
export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export type MetadataSource = {
  /** Which adapter and account the data came from, recorded in the manifest. */
  adapter: string;
  account: string;
  /** The provider's view of the default branch, for the refresh's head check. */
  defaultBranch(): Promise<{ ref: string; sha: string } | null>;
  /** Records changed since `since` (an ISO time), or all of them when `since` is null. */
  records(kind: NdjsonKind, since: string | null): Promise<readonly MetadataRecord[]>;
  /** Whole-list kinds have no `since`: labels, milestones, releases. */
  snapshot(kind: SnapshotKind): Promise<unknown>;
};

export type BackoffOptions = { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> };

/** Retry a call that hit a rate limit with exponential backoff; any other error propagates untouched. */
export async function withBackoff<T>(call: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
  const retries = options.retries ?? 4;
  const base = options.baseMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof RateLimitError) || attempt >= retries) throw error;
      await sleep(error.retryAfterMs ?? base * 2 ** attempt);
    }
  }
}

async function readNdjson(file: string): Promise<MetadataRecord[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const out: MetadataRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as MetadataRecord);
    } catch {
      // A torn line is dropped; the next full refresh restores it.
    }
  }
  return out;
}

/** Merge fresh records over the existing file by `id` and keep it id-sorted, so a re-run is byte-stable. */
export function mergeRecords(existing: readonly MetadataRecord[], fresh: readonly MetadataRecord[]): MetadataRecord[] {
  const byId = new Map<string, MetadataRecord>();
  for (const record of [...existing, ...fresh]) byId.set(String(record.id), record);
  return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
}

export type ExportMetadataOptions = {
  source: MetadataSource;
  metaDir: string;
  /** The previous manifest's `fetchedAt`; null does a full export. */
  since: string | null;
  backoff?: BackoffOptions;
  /** Checked between reads, never between writes. */
  signal?: AbortSignal;
};

/** Write every metadata file for one repo. Each file is atomic and 0600; the manifest is the caller's last step. */
export async function exportMetadata({ source, metaDir, since, backoff, signal }: ExportMetadataOptions): Promise<void> {
  // Read everything first, write after: a quit lands between reads (nothing on disk changed). Once the
  // writes start they run to completion (they are local and fast), so a quit does not split them.
  const pending: { file: string; content: string }[] = [];
  for (const kind of NDJSON_KINDS) {
    signal?.throwIfAborted();
    const fresh = await withBackoff(() => source.records(kind, since), backoff);
    const file = join(metaDir, `${kind}.ndjson`);
    const merged = mergeRecords(since === null ? [] : await readNdjson(file), fresh);
    pending.push({ file, content: merged.map((r) => JSON.stringify(r)).join('\n') + (merged.length > 0 ? '\n' : '') });
  }
  for (const kind of SNAPSHOT_KINDS) {
    signal?.throwIfAborted();
    const data = await withBackoff(() => source.snapshot(kind), backoff);
    pending.push({ file: join(metaDir, `${kind}.json`), content: `${JSON.stringify(data ?? [], null, 2)}\n` });
  }
  signal?.throwIfAborted();
  for (const { file, content } of pending) await writePrivateFile(file, content);
}
