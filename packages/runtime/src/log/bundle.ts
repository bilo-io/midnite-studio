import { redactPaths } from '@midnite/studio-shared';

import type { LogLevel, LogRecord, LogSink } from './log-sink';

/**
 * How many sink records a diagnostics bundle carries — enough to show the run-up to a crash, short
 * enough to paste into an issue.
 */
export const BUNDLE_RECORDS = 50;

/**
 * The diagnostics block: the boot line, then the tail, as plain text, redacted.
 *
 * Redacted again on the way out even though every record was redacted on the way in: the boot line
 * does not come from the sink, and this is the one string in the suite designed to be pasted
 * somewhere public. Redaction is idempotent, so the second pass costs a scan and buys the guarantee.
 */
export function formatLogBundle(
  boot: string,
  records: ReadonlyArray<Pick<LogRecord, 't' | 'level' | 'msg'> | { t: number; level: string; msg: string }>,
  homeDir?: string,
): string {
  const lines: string[] = [];
  if (boot.length > 0) lines.push(boot);
  for (const record of records) {
    lines.push(`${new Date(record.t).toISOString()} ${record.level.toUpperCase()} ${record.msg}`);
  }
  return redactPaths(lines.join('\n'), homeDir);
}

/** A sink's bundle in one call: its last {@link BUNDLE_RECORDS} records under the boot line. */
export function bundleFromSink(sink: LogSink | null, boot: string, homeDir?: string): string {
  return formatLogBundle(boot, sink?.tail(BUNDLE_RECORDS) ?? [], homeDir);
}

/** The two `process` events a crash log listens to — injected so this registers under bare vitest. */
export type CrashEventSource = {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
};

/**
 * Route main's own crashes into the log at `error` level, which the sink flushes synchronously —
 * the line that matters most is the last one before the process dies. Listening to
 * `uncaughtException` also keeps the process up, as Monitor's crash log always has.
 */
export function installCrashLogging(
  write: (level: LogLevel, message: string) => void,
  source: CrashEventSource = process,
): void {
  source.on('uncaughtException', (error) => write('error', `uncaught: ${error.stack ?? error.message}`));
  source.on('unhandledRejection', (reason) => write('error', `unhandled rejection: ${String(reason)}`));
}
