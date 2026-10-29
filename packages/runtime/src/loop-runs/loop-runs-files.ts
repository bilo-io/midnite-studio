import { mkdirSync, watch as fsWatch } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { LoopRunRecordSchema, type LoopRunRecord } from '@midnite/studio-shared';

import { runtimeDataDirectory } from '../data-directory';
import { writePrivateFile } from '../private-files';

/**
 * The loop-run ledger's files (Phase 123 Theme G) — one per app, merged on read.
 *
 * Every suite app's FAB records its runs, and Studio's Sessions page and
 * dashboard list them all. Two apps appending to one file would race on every
 * Start and every pty exit, so each app writes only
 * `<appData>/Midnite Runtime/loop-runs/<appId>.json` — one writer per file,
 * written by temp-file + rename so a reader never sees half of one — and
 * {@link LoopRunsFiles.listAll} reads and merges the whole directory, newest
 * first, each run tagged with the app that wrote it.
 *
 * Plain node, no `electron`: the composer hands over the runtime data
 * directory and a logger, and forwards {@link LoopRunsFiles.onChanged} to its
 * windows. Changes from other apps arrive through `fs.watch` on the directory.
 */

export const LOOP_RUNS_DIRECTORY_NAME = 'loop-runs';

/** Runs beyond this many (oldest first) are dropped on save — per app file. */
export const MAX_STORED_LOOP_RUNS = 200;

export const LOOP_RUNS_WATCH_DEBOUNCE_MS = 100;

/** `<appData>/Midnite Runtime/loop-runs`. */
export function loopRunsDirectory(appDataBase: string): string {
  return join(runtimeDataDirectory(appDataBase), LOOP_RUNS_DIRECTORY_NAME);
}

/** What the ledger service persists through: this app's own file. */
export type LoopRunsStore = {
  load: () => Promise<LoopRunRecord[]>;
  save: (runs: readonly LoopRunRecord[]) => Promise<void>;
  /** Every app's runs, merged, newest first, each tagged with its `appId`. Absent: only this store's own. */
  loadAll?: () => Promise<LoopRunRecord[]>;
};

export const nullLoopRunsStore: LoopRunsStore = {
  load: async () => [],
  save: async () => {},
};

type StoredState = { version: 1; runs: unknown[] };

/** Drops one bad entry rather than the file. */
export function parseStoredLoopRuns(value: unknown): LoopRunRecord[] {
  if (typeof value !== 'object' || value === null) return [];
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) return [];

  const result: LoopRunRecord[] = [];
  for (const entry of runs) {
    const parsed = LoopRunRecordSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

/** The slice of `fs.watch` the service uses, injectable so tests drive it by hand. */
export type LoopRunsWatchFn = (
  directory: string,
  listener: (eventType: string, fileName: string | null) => void,
) => { close(): void };

export type LoopRunsFilesOptions = {
  /** `<appData>/Midnite Runtime/loop-runs` (or a temp dir in tests). Created on first write. */
  directory: string;
  /** The app whose file this instance writes — `studio`, `vanguard`, … */
  appId: string;
  warn: (message: string) => void;
  /** Defaults to `fs.watch`. */
  watch?: LoopRunsWatchFn;
  debounceMs?: number;
};

export type LoopRunsFiles = LoopRunsStore & {
  readonly filePath: string;
  loadAll: () => Promise<LoopRunRecord[]>;
  /**
   * Copies `legacyFile` (Studio's old `<userData>/loop-runs.json`) into this app's file, once: only when
   * this app has no file yet. The source is left in place. Resolves `true` when it copied.
   */
  migrateFrom: (legacyFile: string) => Promise<boolean>;
  /** Fires on outside changes seen by {@link LoopRunsFiles.watch}. Own writes are announced by the ledger. */
  onChanged: (listener: () => void) => () => void;
  /** Start watching the directory for other apps' writes. Idempotent. Never throws. */
  watch: () => void;
  close: () => void;
};

function defaultWatchWith(warn: (message: string) => void): LoopRunsWatchFn {
  return (directory, listener) => {
    const watcher = fsWatch(directory, { persistent: false }, listener);
    // An `error` event with no listener would be an uncaught exception in main.
    watcher.on('error', (err) => {
      warn(`loop-runs: watching ${directory} stopped (${String(err)}); other apps' runs show after a restart`);
      watcher.close();
    });
    return watcher;
  };
}

export function createLoopRunsFiles(options: LoopRunsFilesOptions): LoopRunsFiles {
  const { directory, appId, warn } = options;
  const watchFn = options.watch ?? defaultWatchWith(warn);
  const debounceMs = options.debounceMs ?? LOOP_RUNS_WATCH_DEBOUNCE_MS;
  const fileName = `${appId}.json`;
  const filePath = join(directory, fileName);

  const listeners = new Set<() => void>();
  let watcher: { close(): void } | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  /** Files already warned about, so a file that stays corrupt warns once, not on every read. */
  const warned = new Set<string>();

  /** `undefined` when the file is missing or unreadable; the parsed runs otherwise. */
  async function readFileRuns(path: string): Promise<LoopRunRecord[] | undefined> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') warnOnce(path, `could not be read (${String(err)})`);
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnOnce(path, 'is not valid JSON');
      return undefined;
    }
    warned.delete(path);
    return parseStoredLoopRuns(parsed);
  }

  function warnOnce(path: string, why: string): void {
    if (warned.has(path)) return;
    warned.add(path);
    warn(`loop-runs: ${path} ${why}; skipping it`);
  }

  return {
    filePath,

    load: async () => (await readFileRuns(filePath)) ?? [],

    save: async (runs) => {
      const trimmed = runs.length > MAX_STORED_LOOP_RUNS ? runs.slice(runs.length - MAX_STORED_LOOP_RUNS) : runs;
      const state: StoredState = { version: 1, runs: [...trimmed] };
      try {
        await writePrivateFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
      } catch {
        // A read-only data dir shouldn't take the app down.
      }
    },

    loadAll: async () => {
      let names: string[];
      try {
        names = await readdir(directory);
      } catch {
        return [];
      }
      const merged: LoopRunRecord[] = [];
      for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
        const runs = await readFileRuns(join(directory, name));
        if (!runs) continue;
        const owner = name.slice(0, -'.json'.length);
        for (const run of runs) merged.push({ ...run, appId: owner });
      }
      return merged.sort((a, b) => b.startedAt - a.startedAt);
    },

    migrateFrom: async (legacyFile) => {
      try {
        await stat(filePath);
        return false; // This app already has a ledger; the old file is not read again.
      } catch {
        // No file yet — fall through.
      }
      try {
        await stat(legacyFile);
      } catch {
        return false;
      }
      try {
        await mkdir(directory, { recursive: true });
        await copyFile(legacyFile, filePath);
        return true;
      } catch (err) {
        warn(`loop-runs: could not copy ${legacyFile} to ${filePath} (${String(err)})`);
        return false;
      }
    },

    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    watch: () => {
      if (watcher) return;
      try {
        mkdirSync(directory, { recursive: true });
        watcher = watchFn(directory, (_event, changed) => {
          // Our own writes are announced by the ledger; temp files are not ledger files.
          if (changed === fileName || (changed !== null && !changed.endsWith('.json'))) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            debounce = null;
            for (const listener of listeners) {
              try {
                listener();
              } catch {
                // A listener that throws must not stop the others hearing the change.
              }
            }
          }, debounceMs);
        });
      } catch (err) {
        warn(`loop-runs: could not watch ${directory} (${String(err)}); other apps' runs show after a restart`);
      }
    },

    close: () => {
      if (debounce) clearTimeout(debounce);
      debounce = null;
      watcher?.close();
      watcher = null;
      listeners.clear();
    },
  };
}
