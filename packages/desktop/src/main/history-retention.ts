import { readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * Local history housekeeping — Phase 115 Theme B. Three directories under `userData` hold history:
 * `scrollback/` (one `.bin` per live or restorable session), `session-history/` (archived
 * transcripts) and `logs/` (the NDJSON sink). Chats are documents the user wrote and are never
 * touched here; neither are settings or `terminals.json`.
 *
 * Free of `electron`: the caller hands in the directory and the ids of the sessions that are live,
 * so the module runs under bare vitest against a `mkdtemp` directory.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Entry = { path: string; bytes: number; mtimeMs: number };
export type HistoryTotals = { files: number; bytes: number; /** File names (no extension) of removed archived transcripts, i.e. session ids. */ transcriptIds?: string[] };

async function filesIn(dir: string): Promise<Entry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const name of names) {
    const path = join(dir, name);
    try {
      const st = await stat(path);
      if (st.isFile()) out.push({ path, bytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
      // Vanished between readdir and stat.
    }
  }
  return out;
}

async function candidates(
  userData: string,
  liveIds: ReadonlySet<string>,
): Promise<{ scrollback: Entry[]; transcripts: Entry[]; logs: Entry[] }> {
  // Scrollback of a session that is still live or restorable is not history; its file is `<id>.bin`.
  const scrollback = (await filesIn(join(userData, 'scrollback'))).filter(
    (e) => e.path.endsWith('.bin') && !liveIds.has(basename(e.path, '.bin')),
  );
  const transcripts = await filesIn(join(userData, 'session-history'));
  const logs = (await filesIn(join(userData, 'logs'))).filter((e) => e.path.endsWith('.log'));
  return { scrollback, transcripts, logs };
}

async function removeAll(entries: readonly Entry[]): Promise<HistoryTotals> {
  const out: HistoryTotals = { files: 0, bytes: 0 };
  for (const e of entries) {
    try {
      await rm(e.path, { force: true });
      out.files++;
      out.bytes += e.bytes;
    } catch {
      // Unlinkable: leave it, count nothing.
    }
  }
  return out;
}

/** What "Clear all local history" would delete right now: the blast radius its confirm shows. */
export async function historyStats(userData: string, liveIds: ReadonlySet<string>): Promise<HistoryTotals> {
  const c = await candidates(userData, liveIds);
  const all = [...c.scrollback, ...c.transcripts, ...c.logs];
  return { files: all.length, bytes: all.reduce((n, e) => n + e.bytes, 0) };
}

/** Delete scrollback (of sessions not live), archived transcripts and logs. Never throws. */
export async function clearHistory(userData: string, liveIds: ReadonlySet<string>): Promise<HistoryTotals> {
  const c = await candidates(userData, liveIds);
  return removeAll([...c.scrollback, ...c.transcripts, ...c.logs]);
}

/**
 * Delete scrollback and archived transcripts last written more than `days` days ago, skipping live
 * sessions. Logs rotate on their own and are not pruned by age. `days: null` keeps everything.
 */
export async function pruneHistory(
  userData: string,
  opts: { days: number | null; liveIds: ReadonlySet<string>; now?: number },
): Promise<HistoryTotals> {
  if (opts.days === null || !(opts.days > 0)) return { files: 0, bytes: 0 };
  const cutoff = (opts.now ?? Date.now()) - opts.days * DAY_MS;
  const c = await candidates(userData, opts.liveIds);
  const old = [...c.scrollback, ...c.transcripts].filter((e) => e.mtimeMs < cutoff);
  const out = await removeAll(old);
  const transcriptIds = c.transcripts.filter((e) => old.includes(e)).map((e) => basename(e.path, '.bin'));
  return { ...out, transcriptIds };
}
