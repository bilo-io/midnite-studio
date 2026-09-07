import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  apiFailure,
  apiOk,
  redactSecretValues,
  type ApiHistoryEntry,
  type ApiOpResult,
} from '@midnite/studio-shared';

import {
  confineParent,
  confineTree,
  createFile,
  ensureConfinedDirs,
  openForOverwrite,
} from '../fs-scope-write';

/**
 * Request history (Phase 70 Theme D) — `.midnite/api/history.local.json`, a
 * single flat array, newest entry first, capped at {@link MAX_HISTORY_ENTRIES}
 * rows evicting the oldest. `.local.json` puts it under Theme A's own
 * `.gitignore` pattern (`*.local.json`) without this module having to write
 * one of its own — it lives beside the environment overlays under
 * `.midnite/api/`, which Theme A already protects on the first environment
 * save. **There is no per-entry sidecar file** — the whole history is one
 * array in one file, so the 200-cap evicts a row, never a file the eviction
 * forgot to also delete (the bug Phase 45 found twice in stores that kept
 * one file per entry).
 *
 * **What never reaches this file, by construction:** a row is
 * `{id, at, method, url, status, durationMs, sizeBytes, collectionId,
 * itemPath, environmentId}` — metadata only. No caller of
 * {@link recordHistoryEntry} has a request header, a request body, or a
 * response body in scope to hand it even if it wanted to; the type this
 * module writes has no field for any of the three, so there is no code path
 * that could leak one in.
 *
 * **The secret rewrite.** `recordHistoryEntry`'s caller (`send.ts`) passes
 * the resolved wire URL plus the flat map of this send's secret-typed
 * environment values (already merged from the overlay, already the ones
 * `interpolate.ts` substituted into that URL). `redactSecretValues`
 * (`shared/src/redact.ts`) rewrites every literal occurrence of one of those
 * values back to `{{key}}` before the URL is ever serialised — so a history
 * row reads like the templated request that produced it, not the request
 * with its credential still sitting in a gitignored-but-still-on-disk file.
 *
 * Every write goes through `fs-scope-write`, exactly as `environment-io.ts`
 * does: `ensureConfinedDirs`/`confineParent` for a fresh file,
 * `openForOverwrite` (`O_NOFOLLOW`) for an existing one, `confineTree` before
 * any read — a `.midnite/api` symlinked outside the repo is refused, not
 * followed, and a save that would refuse writes nothing rather than writing
 * partway.
 */

const HISTORY_REL = '.midnite/api/history.local.json';

/** 200, per the phase doc — capped, evicting the oldest row first. */
export const MAX_HISTORY_ENTRIES = 200;

function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isHistoryEntryShaped(value: unknown): value is ApiHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<ApiHistoryEntry>;
  return (
    typeof row.id === 'string' &&
    typeof row.at === 'number' &&
    typeof row.method === 'string' &&
    typeof row.url === 'string' &&
    typeof row.status === 'number' &&
    typeof row.durationMs === 'number' &&
    typeof row.sizeBytes === 'number' &&
    (row.collectionId === null || typeof row.collectionId === 'string') &&
    (row.itemPath === null || Array.isArray(row.itemPath)) &&
    (row.environmentId === null || typeof row.environmentId === 'string')
  );
}

/** The history file's current rows, newest first, or `[]` for "does not
 *  exist yet" / "not a valid history file" / "confined outside the repo" —
 *  every one of those is a normal empty-history state, never an error a
 *  caller needs to branch on. */
async function readHistory(repoRoot: string): Promise<ApiHistoryEntry[]> {
  const fileAbs = join(repoRoot, ...HISTORY_REL.split('/'));
  const confined = await confineTree(repoRoot, fileAbs);
  if (!confined) return [];
  try {
    const raw = await readFile(confined, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntryShaped) : [];
  } catch {
    return [];
  }
}

/** Overwrite (or create) the history file with exactly `entries`, in the
 *  order given — the caller is responsible for newest-first ordering and the
 *  200-cap; this just gets the array onto disk through the confined,
 *  symlink-safe path every other write in this package uses. */
async function writeHistory(repoRoot: string, entries: readonly ApiHistoryEntry[]): Promise<boolean> {
  if (!(await ensureConfinedDirs(repoRoot, HISTORY_REL))) return false;
  const target = await confineParent(repoRoot, HISTORY_REL);
  if (!target) return false;

  const created = await createFile(target);
  if (created) {
    try {
      await created.writeFile(serialise(entries), 'utf8');
    } finally {
      await created.close();
    }
    return true;
  }

  const handle = await openForOverwrite(target);
  if (!handle) return false;
  try {
    await handle.truncate(0);
    await handle.writeFile(serialise(entries), 'utf8');
  } finally {
    await handle.close();
  }
  return true;
}

/** What `send.ts` hands `recordHistoryEntry` right after a settled response —
 *  everything needed to build one redacted row, and nothing else: no
 *  headers, no request body, no response body is even a field here. */
export interface HistoryRecordInput {
  method: string;
  /** The resolved wire URL (with its query string), not the templated draft
   *  URL — this is what actually went out, before redaction. */
  url: string;
  status: number;
  durationMs: number;
  sizeBytes: number;
  collectionId: string | null;
  itemPath: string[] | null;
  environmentId: string | null;
  /** This send's secret-typed environment values only (already merged from
   *  the `.local.json` overlay) — never the full environment, which would
   *  also rewrite a harmless `default`-typed value that happened to match. */
  secretValues: Readonly<Record<string, string>>;
}

/**
 * Append one redacted row and cap-evict the oldest, best-effort — returns
 * `false` on any write failure (a symlinked `.midnite/api`, a permissions
 * error) rather than throwing, since a history-recording failure must never
 * be what turns a successful send into a failed one for the user.
 */
export async function recordHistoryEntry(repoRoot: string, input: HistoryRecordInput): Promise<boolean> {
  const entry: ApiHistoryEntry = {
    id: randomUUID(),
    at: Date.now(),
    method: input.method.toUpperCase(),
    url: redactSecretValues(input.url, input.secretValues),
    status: input.status,
    durationMs: Math.round(input.durationMs),
    sizeBytes: input.sizeBytes,
    collectionId: input.collectionId,
    itemPath: input.itemPath,
    environmentId: input.environmentId,
  };

  const existing = await readHistory(repoRoot);
  const next = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
  return writeHistory(repoRoot, next);
}

/** Every history row for `repoRoot`, newest first — `{ok:true, value:[]}` for
 *  a repo with none recorded yet, never an error. */
export async function listHistory(repoRoot: string): Promise<ApiOpResult<ApiHistoryEntry[]>> {
  return apiOk(await readHistory(repoRoot));
}

/** Replace the history file with an empty array. A repo with no history file
 *  at all still succeeds — "already empty" and "now empty" read the same. */
export async function clearHistory(repoRoot: string): Promise<ApiOpResult> {
  const ok = await writeHistory(repoRoot, []);
  return ok ? apiOk() : apiFailure('Could not clear the request history.');
}
