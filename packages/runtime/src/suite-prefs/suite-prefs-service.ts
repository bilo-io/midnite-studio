import { randomBytes } from 'node:crypto';
import { mkdirSync, watch as fsWatch } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  resolveSuitePrefs,
  SUITE_PREFS_FILE_NAME,
  SUITE_PREFS_VERSION,
  SuitePrefsSetRequestSchema,
  type SuitePrefsSetResponse,
  type SuitePrefsSnapshot,
} from '@midnite/studio-shared';

/**
 * The suite-prefs service (Phase 123 Theme L.1) — the one file every suite app's
 * main serves its renderer's shared preferences from.
 *
 * Plain node, no `electron`: the composer hands it the runtime data directory
 * (`<appData>/Midnite Runtime`) and a logger, and forwards {@link onChanged} to
 * its windows. Each app's main composes its own instance over the same file;
 * they coordinate through the file alone.
 *
 * - **Atomic writes.** A write lands in a sibling temp file and is renamed over
 *   the real one, so a reader never sees half a file.
 * - **Read-merge-write per key.** `set` re-reads the file, replaces one group,
 *   and writes the rest back as it found them, so two apps changing different
 *   groups both keep their change. Two apps changing the *same* group is
 *   user-driven and rare; the later write wins.
 * - **A corrupt file is moved aside**, never overwritten in place: it becomes
 *   `suite-prefs.json.bad-<ts>`, reads fall back to defaults, and one `warn`
 *   is logged.
 * - **Changes from elsewhere arrive through `fs.watch`** on the directory (the
 *   rename swaps the file's inode, so a watch on the file itself would go deaf
 *   after the first write), debounced 100 ms. A change whose content matches
 *   what this process last wrote or announced is not announced again.
 */

export const SUITE_PREFS_WATCH_DEBOUNCE_MS = 100;

/** The slice of `fs.watch` the service uses, injectable so tests drive it by hand. */
export type SuitePrefsWatchFn = (
  directory: string,
  listener: (eventType: string, fileName: string | null) => void,
) => { close(): void };

export type SuitePrefsServiceOptions = {
  /** `<appData>/Midnite Runtime` (or a temp dir in tests). Created on first write. */
  directory: string;
  warn: (message: string) => void;
  /** Defaults to `fs.watch`. */
  watch?: SuitePrefsWatchFn;
  now?: () => number;
  debounceMs?: number;
};

export type SuitePrefsService = {
  readonly filePath: string;
  get(): Promise<SuitePrefsSnapshot>;
  /** Validates `raw` (`{ key, value }`) and replaces that group. Never throws. */
  set(raw: unknown): Promise<SuitePrefsSetResponse>;
  /** Fires on this service's own writes and on outside changes seen by {@link watch}. */
  onChanged(listener: (snapshot: SuitePrefsSnapshot) => void): () => void;
  /** Start watching the file for other processes' writes. Idempotent. Never throws. */
  watch(): void;
  close(): void;
};

const defaultWatch: SuitePrefsWatchFn = (directory, listener) => fsWatch(directory, { persistent: false }, listener);

export function createSuitePrefsService(options: SuitePrefsServiceOptions): SuitePrefsService {
  const { directory, warn } = options;
  const watchFn = options.watch ?? defaultWatch;
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? SUITE_PREFS_WATCH_DEBOUNCE_MS;
  const filePath = join(directory, SUITE_PREFS_FILE_NAME);

  const listeners = new Set<(snapshot: SuitePrefsSnapshot) => void>();
  let lock: Promise<unknown> = Promise.resolve();
  let lastKnownRaw: string | null = null;
  let watcher: { close(): void } | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = lock.then(fn, fn);
    lock = next.catch(() => undefined);
    return next;
  }

  function emit(snapshot: SuitePrefsSnapshot): void {
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // A listener that throws must not stop the others hearing the change.
      }
    }
  }

  /** The file's raw text, or null when there is none. */
  async function readRaw(): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Parse the file into its top-level record. Unparseable JSON, or JSON that is
   * not an object, is moved aside and read as empty — the defaults.
   */
  async function readRecord(): Promise<{ record: Record<string, unknown>; raw: string | null }> {
    const raw = await readRaw();
    if (raw === null) return { record: {}, raw };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { record: parsed as Record<string, unknown>, raw };
    }
    const aside = `${filePath}.bad-${now()}`;
    try {
      await rename(filePath, aside);
      warn(`suite-prefs: ${filePath} was unreadable; moved it to ${aside} and fell back to defaults`);
    } catch (err) {
      warn(`suite-prefs: ${filePath} was unreadable and could not be moved aside (${String(err)}); using defaults`);
    }
    return { record: {}, raw: null };
  }

  function snapshotOf(record: Record<string, unknown>): SuitePrefsSnapshot {
    return resolveSuitePrefs(record);
  }

  async function writeAtomic(text: string): Promise<void> {
    await mkdir(directory, { recursive: true });
    const temp = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
      await writeFile(temp, text, { encoding: 'utf8', mode: 0o600 });
      await rename(temp, filePath);
    } catch (err) {
      await unlink(temp).catch(() => undefined);
      throw err;
    }
  }

  async function get(): Promise<SuitePrefsSnapshot> {
    return withLock(async () => {
      const { record } = await readRecord();
      return snapshotOf(record);
    });
  }

  async function set(raw: unknown): Promise<SuitePrefsSetResponse> {
    const parsed = SuitePrefsSetRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid suite-prefs payload' };
    }
    const { key, value } = parsed.data;
    try {
      const snapshot = await withLock(async () => {
        const { record } = await readRecord();
        const next: Record<string, unknown> = { ...record, version: SUITE_PREFS_VERSION, [key]: value };
        const text = `${JSON.stringify(next, null, 2)}\n`;
        await writeAtomic(text);
        lastKnownRaw = text;
        return snapshotOf(next);
      });
      emit(snapshot);
      return { ok: true, snapshot };
    } catch (err) {
      return { ok: false, error: `suite-prefs: could not write ${filePath}: ${String(err)}` };
    }
  }

  /** An outside change: re-read, and announce it unless it is what we already know. */
  async function onFileEvent(): Promise<void> {
    const snapshot = await withLock(async () => {
      const raw = await readRaw();
      if (raw === lastKnownRaw) return null;
      const { record, raw: kept } = await readRecord();
      lastKnownRaw = kept;
      return snapshotOf(record);
    });
    if (snapshot) emit(snapshot);
  }

  function watch(): void {
    if (watcher) return;
    try {
      mkdirSync(directory, { recursive: true });
      watcher = watchFn(directory, (_eventType, fileName) => {
        if (fileName !== null && fileName !== SUITE_PREFS_FILE_NAME) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          onFileEvent().catch((err: unknown) => warn(`suite-prefs: re-read after a change failed: ${String(err)}`));
        }, debounceMs);
      });
    } catch (err) {
      // No directory yet, or the platform refuses: this app still reads and writes; it
      // only misses live changes from other apps until the next start.
      warn(`suite-prefs: cannot watch ${directory} (${String(err)}); other apps' changes show after a restart`);
      watcher = null;
    }
  }

  function close(): void {
    if (debounce) clearTimeout(debounce);
    debounce = null;
    watcher?.close();
    watcher = null;
    listeners.clear();
  }

  return {
    filePath,
    get,
    set,
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    watch,
    close,
  };
}
