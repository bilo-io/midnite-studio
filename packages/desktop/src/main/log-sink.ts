import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { redactPaths } from '@midnite/studio-shared';

/**
 * The file under main's one log seam — Phase 65 Theme A.
 *
 * Until this module, `main/log.ts` was fourteen lines of `console.warn` and its
 * own header claimed the broker redirected it to a file. It did not: the broker
 * redirects the *child process's* stdio, and every one of the ~40 lines main
 * produces went to a stderr a packaged app discards. This is the file those
 * lines have always deserved.
 *
 * Three properties are load-bearing, and each is a decision recorded in the
 * phase doc:
 *
 * 1. **It takes a directory, never `app.getPath`.** Same shape as
 *    `repo-store.ts`, `windows-store.ts` and `terminal-store.ts`: `userData` is
 *    resolved exactly once in `index.ts` and injected. That is what lets this
 *    module be tested under bare vitest against a temp dir, and what keeps
 *    `electron` out of the one module graph that has to be importable from a
 *    crash handler.
 * 2. **NDJSON, one `{t, level, msg}` record per line.** Not a human log format:
 *    the "Copy diagnostics" affordance reads the tail back and has to parse it,
 *    and `[perf] renderer boot 812` is not parseable.
 * 3. **It never throws into its caller.** A full disk, a read-only volume or a
 *    vanished directory disables the sink for the rest of the session and says
 *    so once. A logger that can crash the process it exists to diagnose is
 *    worse than no logger.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** One line of the file. Kept flat so a tail is `JSON.parse` per line and nothing more. */
export type LogRecord = {
  /** Epoch milliseconds. */
  t: number;
  level: LogLevel;
  msg: string;
};

export type LogSink = {
  /** Absolute path of the current (unrotated) file. */
  readonly path: string;
  /**
   * Record one line.
   *
   * `error` is flushed **synchronously**; `info` and `warn` are buffered and
   * flushed on the next tick. That split is the whole point of the sink: the
   * record that matters most is the last one before a crash, and an async
   * append loses exactly that one. The volume at `error` level is by definition
   * tiny, and main already does synchronous fs work at boot.
   */
  write(level: LogLevel, message: string): void;
  /** The last `count` parseable records, oldest first. Unparseable lines are skipped. */
  tail(count: number): LogRecord[];
  /** Flush anything buffered. Safe to call twice. */
  flush(): void;
  /** Flush and stop. Later writes are no-ops. */
  close(): void;
};

export type FileSinkOptions = {
  /** Directory the file lives in; created if missing. */
  dir: string;
  /** File name, default `main.log`. Rotations become `main.1.log`, `main.2.log`, … */
  name?: string;
  /** Rotate once the file would exceed this. Default 2 MB. */
  maxBytes?: number;
  /** How many rotated generations to keep. Default 3, so at most 4 files exist. */
  generations?: number;
  /** Clock seam for tests. */
  now?: () => number;
  /** Home directory handed to `redactPaths`; defaults to the ambient one. */
  homeDir?: string;
  /** Where the degraded-mode notice goes when the file cannot be written. */
  onFailure?: (message: string) => void;
};

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_GENERATIONS = 3;

/** `main.log` + `n` → `main.3.log`. Extension-aware so the suffix stays sortable in Finder. */
function generationName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.${n}`;
  return `${name.slice(0, dot)}.${n}${name.slice(dot)}`;
}

/** Size in bytes, or 0 when the file does not exist (or cannot be stat'd). */
function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone, or not ours to remove. Either way there is nothing to do.
  }
}

/**
 * Shift `main.log` → `main.1.log` → … → `main.<generations>.log`, dropping the oldest.
 *
 * Exported because it is the only rotate helper in this repo and the broker's
 * own log — the one file that has grown without bound for the life of a build
 * (`broker-client.ts`'s `openSync(logPath, 'a')`) — reuses it on open. "One
 * sink rather than two" was the instruction; an unbounded second file is what
 * that phrase is about.
 */
export function rotateFiles(dir: string, name: string, generations: number): void {
  removeQuietly(join(dir, generationName(name, generations)));
  for (let n = generations - 1; n >= 1; n -= 1) {
    try {
      renameSync(join(dir, generationName(name, n)), join(dir, generationName(name, n + 1)));
    } catch {
      // That generation does not exist yet — normal until the file has rotated
      // `generations` times.
    }
  }
  try {
    renameSync(join(dir, name), join(dir, generationName(name, 1)));
  } catch {
    // Nothing to rotate.
  }
}

/**
 * Rotate `dir/name` if it is already at or over `maxBytes`.
 *
 * The check-on-open counterpart to the sink's own check-on-write, for callers
 * that append to a file by other means. Returns `true` when it rotated.
 */
export function capFile(dir: string, name: string, maxBytes: number, generations: number): boolean {
  if (sizeOf(join(dir, name)) < maxBytes) return false;
  rotateFiles(dir, name, generations);
  return true;
}

/**
 * Open (or create) an NDJSON sink under `dir`.
 *
 * Construction itself cannot throw: a directory that cannot be created leaves
 * the sink permanently degraded rather than failing a boot.
 */
export function createFileSink(options: FileSinkOptions): LogSink {
  const {
    dir,
    name = 'main.log',
    maxBytes = DEFAULT_MAX_BYTES,
    generations = DEFAULT_GENERATIONS,
    now = () => Date.now(),
    homeDir,
    onFailure,
  } = options;

  const path = join(dir, name);
  /** Buffered `info`/`warn` lines, already serialised. */
  let pending: string[] = [];
  let timer: NodeJS.Timeout | null = null;
  let disabled = false;
  let closed = false;

  /**
   * Give up on the file, once.
   *
   * Once is the operative word: the failure mode being defended against is a
   * read-only volume, where every subsequent write fails identically, and a
   * sink that reports each of them has replaced one silent problem with a loud
   * one at the same rate.
   */
  function degrade(err: unknown): void {
    if (disabled) return;
    disabled = true;
    pending = [];
    const reason = err instanceof Error ? err.message : String(err);
    onFailure?.(`[log] file sink disabled: ${redactPaths(reason, homeDir)}`);
  }

  function ensureDir(): void {
    mkdirSync(dir, { recursive: true });
  }

  /** Append `text`, rotating first if it would push the file past `maxBytes`. */
  function appendNow(text: string): void {
    if (disabled || closed || text.length === 0) return;
    try {
      ensureDir();
      // Checked on write, not on a timer: a timer would let a burst of records
      // between two ticks blow past the cap, and the stat is one syscall on a
      // path this app touches tens of times per session, not per frame.
      if (sizeOf(path) + Buffer.byteLength(text) > maxBytes) {
        rotateFiles(dir, name, generations);
      }
      appendFileSync(path, text);
    } catch (err) {
      degrade(err);
    }
  }

  function flush(): void {
    if (pending.length === 0) return;
    const text = pending.join('');
    pending = [];
    appendNow(text);
  }

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 0);
    // The buffer must never be the reason the process stays alive; a pending
    // `info` line is not worth a millisecond of shutdown.
    timer.unref?.();
  }

  function serialise(level: LogLevel, message: string): string {
    const record: LogRecord = { t: now(), level, msg: redactPaths(message, homeDir) };
    // A message containing a newline would otherwise split one record into two
    // lines, and the tail parser reads line by line. `JSON.stringify` escapes
    // them, which is the other half of why the format is NDJSON.
    return `${JSON.stringify(record)}\n`;
  }

  return {
    path,
    write(level, message) {
      if (disabled || closed) return;
      let line: string;
      try {
        line = serialise(level, message);
      } catch (err) {
        degrade(err);
        return;
      }
      if (level === 'error') {
        // Flush what is queued first, so the file keeps causal order rather
        // than putting the crash ahead of the lines that led to it.
        pending.push(line);
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
        return;
      }
      pending.push(line);
      schedule();
    },
    tail(count) {
      if (count <= 0) return [];
      flush();
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        // No file yet, or unreadable. An empty tail is the honest answer.
        return [];
      }
      const lines = text.split('\n').filter((line) => line.length > 0);
      const out: LogRecord[] = [];
      // Backwards, stopping once `count` records have been recovered — so a
      // torn last line from a hard kill mid-append costs nothing rather than
      // eating one of the caller's slots.
      for (let i = lines.length - 1; i >= 0 && out.length < count; i -= 1) {
        try {
          const parsed: unknown = JSON.parse(lines[i] ?? '');
          if (
            parsed !== null &&
            typeof parsed === 'object' &&
            typeof (parsed as LogRecord).msg === 'string'
          ) {
            out.push(parsed as LogRecord);
          }
        } catch {
          // Not a record. Skipping it is why the tail is defensive rather than
          // trusting its own writer.
        }
      }
      return out.reverse();
    },
    flush,
    close() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      closed = true;
    },
  };
}
