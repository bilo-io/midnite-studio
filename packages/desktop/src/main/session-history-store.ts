import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ClosedSessionSchema,
  MAX_CLOSED_SESSIONS,
  type ClosedSession,
} from '@midnite/studio-shared';

import { safeId } from './terminal-store';

/**
 * The sessions you closed, and the transcripts they left.
 *
 * A sibling of `terminal-store.ts`, not a replacement: that store owns the
 * *live* rows and their `scrollback/`, this one owns the *ended* rows and their
 * `session-history/`. A close moves a record from the first to the second, and
 * the transcript moves with it — by `rename`, so the archived bytes are
 * byte-identical by construction and a megabyte is never re-read to be written
 * back out.
 *
 * Shaped after `diagnostics/trust-store.ts`: the directory is **injected**
 * rather than read from `app.getPath('userData')`, so this module carries no
 * `electron` import and the whole store is testable under bare vitest against a
 * `mkdtemp` directory. And like that store, a parse failure degrades to empty
 * rather than throwing — this runs inside `app.whenReady()`, where a throw is a
 * boot failure and the cost of starting empty is a lost history.
 *
 * Unlike `trust-store.ts`, the records **cross to the renderer**, so they are
 * validated with real zod rather than a hand-rolled guard — the rule that store
 * states for itself.
 */
export type SessionHistoryStore = {
  list: () => Promise<ClosedSession[]>;
  /** `transcriptFrom` is the live scrollback path to rename in, or null if there is none. */
  append: (record: ClosedSession, transcriptFrom: string | null) => Promise<void>;
  transcript: (sessionId: string) => Promise<Uint8Array>;
  /** One id, or every record when null. The only path that unlinks a transcript. */
  purge: (sessionId: string | null) => Promise<void>;
};

type StoredState = { version: 1; closed: ClosedSession[] };

const FILE_NAME = 'session-history.json';
const TRANSCRIPT_DIR = 'session-history';

/** Where an archived transcript lives, given the store's root. */
export function transcriptPath(directory: string, sessionId: string): string {
  return join(directory, TRANSCRIPT_DIR, `${safeId(sessionId)}.bin`);
}

/**
 * Trim to the cap, unlinking every dropped record's transcript in the same call.
 *
 * The array and the files are trimmed together or not at all. [Phase 45] found
 * this exact bug twice — a cap applied to the copy written to disk and never to
 * the in-memory array, or to the array and never to the files it owns.
 * `councils-runs-store.ts` is the shape to copy and *not* the completeness to
 * copy: it caps an array of records that own no files, so it has never had this
 * half of the problem.
 *
 * Exported for the test that counts both.
 */
export async function evictClosed(
  directory: string,
  next: readonly ClosedSession[],
  cap = MAX_CLOSED_SESSIONS,
): Promise<ClosedSession[]> {
  if (next.length <= cap) return [...next];

  // Newest last (append order), so the excess is sliced off the front.
  const dropped = next.slice(0, next.length - cap);
  const kept = next.slice(next.length - cap);

  await Promise.all(
    dropped.map(async (record) => {
      try {
        await rm(transcriptPath(directory, record.id), { force: true });
      } catch {
        // Unlinkable or already gone. Dropping the row regardless is right:
        // a file we cannot delete must not pin a record in the list forever.
      }
    }),
  );
  return kept;
}

export function createSessionHistoryStore(directory: string): SessionHistoryStore {
  const file = join(directory, FILE_NAME);
  const transcriptDir = join(directory, TRANSCRIPT_DIR);
  let cache: ClosedSession[] | null = null;

  const load = async (): Promise<ClosedSession[]> => {
    if (cache) return cache;
    try {
      cache = parseHistoryState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing (nothing closed yet) or corrupt. A corrupt file must leave the
      // app bootable; the cost is a lost history, and the alternative is a
      // store that throws inside `app.whenReady()`.
      cache = [];
    }
    return cache;
  };

  const save = async (closed: readonly ClosedSession[]): Promise<void> => {
    const state: StoredState = { version: 1, closed: [...closed] };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down. The archive holds for
      // this session and is gone next launch — the same trade `trust-store.ts`
      // and `terminal-store.ts` both take.
    }
  };

  return {
    // Stored newest-last so eviction is a slice off the front; reversed once
    // here rather than sorted on every read.
    list: async () => [...(await load())].reverse(),

    append: async (record, transcriptFrom) => {
      await archiveTranscript(transcriptDir, transcriptFrom, transcriptPath(directory, record.id));
      const closed = await load();
      // An id closed twice (a replayed `forget`) replaces rather than doubles.
      const next = [...closed.filter((r) => r.id !== record.id), record];
      cache = await evictClosed(directory, next);
      await save(cache);
    },

    transcript: async (sessionId) => {
      try {
        return new Uint8Array(await readFile(transcriptPath(directory, sessionId)));
      } catch {
        // A record whose transcript was evicted, or never written because the
        // session printed nothing, is a normal outcome — not an error.
        return new Uint8Array(0);
      }
    },

    purge: async (sessionId) => {
      const closed = await load();
      const dropped = sessionId === null ? closed : closed.filter((r) => r.id === sessionId);
      await Promise.all(
        dropped.map(async (record) => {
          try {
            await rm(transcriptPath(directory, record.id), { force: true });
          } catch {
            // Already gone, or unlinkable — either way the row still goes.
          }
        }),
      );
      cache = sessionId === null ? [] : closed.filter((r) => r.id !== sessionId);
      await save(cache);
    },
  };
}

/**
 * Move the live scrollback into the archive.
 *
 * A `rename`, not a copy: one syscall, no re-read of a megabyte, and the
 * archived bytes are identical to the ones that were on disk. The `EXDEV`
 * fallback cannot fire today — both directories live under the same `userData`
 * root — but `userData` is a user-relocatable path, and the failure mode
 * without the branch is a silently lost transcript.
 */
async function archiveTranscript(
  transcriptDir: string,
  from: string | null,
  to: string,
): Promise<void> {
  if (from === null) return;
  try {
    await mkdir(transcriptDir, { recursive: true });
  } catch {
    return;
  }
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') return;
    try {
      await copyFile(from, to);
      await rm(from, { force: true });
    } catch {
      // Nothing further to try. The record is still appended below — a history
      // row with no transcript reads better than no row at all.
    }
  }
}

/**
 * Real zod, not a hand-rolled guard: these records cross to the renderer.
 *
 * A bad row is dropped rather than taking the whole file down with it, matching
 * `parseStoredSessions`.
 */
export function parseHistoryState(value: unknown): ClosedSession[] {
  if (typeof value !== 'object' || value === null) return [];
  const closed = (value as { closed?: unknown }).closed;
  if (!Array.isArray(closed)) return [];
  const out: ClosedSession[] = [];
  for (const row of closed) {
    const parsed = ClosedSessionSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** No store configured — before boot wiring, and in tests that want no disk. */
export const nullSessionHistoryStore: SessionHistoryStore = {
  list: async () => [],
  append: async () => {},
  transcript: async () => new Uint8Array(0),
  purge: async () => {},
};
