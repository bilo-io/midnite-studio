import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { redactPaths } from '@midnite/studio-shared';

/** How many records the diagnostics bundle carries — enough to show the run-up to a crash. */
const BUNDLE_RECORDS = 50;

export type CrashLog = {
  /** Append one record (kept in memory and, best-effort, in the file). */
  write(level: 'info' | 'warn' | 'error', message: string): void;
  /** The file's path — always known: Monitor owns its log. */
  path: string;
  /** The redacted tail, ready to paste into an issue. */
  bundle(): string;
};

/**
 * Monitor's own crash log: a bounded in-memory tail plus an append-only file under its userData.
 * Studio's is `desktop/src/main/log-sink.ts`, which is electron- and desktop-coupled; this is the
 * minimum the Crash log section needs, with the file write injectable for tests.
 */
export function createCrashLog(
  path: string,
  home: string,
  opts: { now?: () => number; append?: (path: string, line: string) => void } = {},
): CrashLog {
  const now = opts.now ?? Date.now;
  const append =
    opts.append ??
    ((file: string, line: string) => {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, line);
    });
  const records: string[] = [];
  return {
    path,
    write(level, message) {
      const line = `${new Date(now()).toISOString()} ${level.toUpperCase()} ${redactPaths(message, home)}`;
      records.push(line);
      if (records.length > BUNDLE_RECORDS) records.shift();
      try {
        append(path, `${line}\n`);
      } catch {
        // A full disk must not take the app down with its own log.
      }
    },
    bundle: () => redactPaths(records.join('\n'), home),
  };
}
