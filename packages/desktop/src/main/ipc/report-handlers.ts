import {
  CHANNELS,
  ErrorReportSchema,
  failure,
  ok,
  redactPaths,
  type ErrorReport,
  type GitOpResult,
} from '@midnite/studio-shared';
import { app, shell } from 'electron';

import { defaultLogger, getLogSink, type Logger } from '../log';
import type { LogSink } from '../log-sink';
import { handleBare, handleSend } from './handle';

/**
 * The renderer's crash channel, and the two clicks that get a user at it —
 * Phase 65 Theme B.
 *
 * Modelled on `perf-handlers.ts`, with **one deliberate inversion.** Perf drops
 * a malformed mark on purpose: the data is optional, high-frequency and
 * dev-only, so a silent drop surfaces one layer up as a loud missing mark.
 * Every clause of that reasoning reverses here. An error report is rare, it is
 * the product's only record of the failure, and a payload malformed enough to
 * fail `safeParse` is itself evidence of the bug being reported. So an invalid
 * report is **logged**, never dropped.
 */

/** How many sink records the diagnostics bundle carries. Enough to show the run-up to a crash. */
const BUNDLE_RECORDS = 50;

/**
 * The one-line build stamp, set once at boot by `index.ts`.
 *
 * Kept here rather than read back off the log, because the bundle shows only
 * the *tail* and the boot line is by definition the head — on a session that
 * produced more than {@link BUNDLE_RECORDS} records it would have scrolled out
 * of the very block whose whole job is to identify the build.
 */
let bootLine = '';

export function setBootLine(line: string): void {
  bootLine = line;
}

/** Test seam and injection point: which sink the read-side handlers report on. */
export type ReportDeps = {
  log?: Logger;
  /**
   * Resolved lazily on every call, not captured: handlers are registered at
   * `handlers-registered` and the sink is constructed a few lines later, once
   * `userData` exists.
   */
  sink?: () => LogSink | null;
  homeDir?: () => string;
};

/** `ErrorReport` → the single line that goes in the file. */
export function formatReport(report: ErrorReport): string {
  const where = [report.role, report.view].filter((part) => part !== undefined).join('/');
  const head = `[renderer] ${report.source} ${where}: ${report.name}: ${report.message}`;
  const parts = [head];
  if (report.stack.length > 0) parts.push(report.stack);
  if (report.componentStack !== undefined && report.componentStack.length > 0) {
    parts.push(`component stack:${report.componentStack}`);
  }
  return parts.join('\n');
}

/** The diagnostics block: the boot line, then the tail, as plain text. */
export function formatBundle(
  boot: string,
  records: Array<{ t: number; level: string; msg: string }>,
  homeDir?: string,
): string {
  const lines: string[] = [];
  if (boot.length > 0) lines.push(boot);
  for (const record of records) {
    const at = new Date(record.t).toISOString();
    lines.push(`${at} ${record.level.toUpperCase()} ${record.msg}`);
  }
  // Redacted again on the way out even though every record was redacted on the
  // way in: the boot line does not come from the sink, and this is the one
  // string in the app designed to be pasted somewhere public. Redaction is
  // idempotent, so the second pass costs a scan and buys the guarantee.
  return redactPaths(lines.join('\n'), homeDir);
}

export function registerReportHandlers(deps: ReportDeps = {}): void {
  const log = deps.log ?? defaultLogger;
  const resolveSink = deps.sink ?? (() => getLogSink());
  const resolveHome = deps.homeDir ?? (() => app.getPath('home'));

  handleSend(
    CHANNELS.reportError,
    ErrorReportSchema,
    (report) => {
      log.error(formatReport(report));
    },
    (issue) => {
      // Not a drop. See this module's header: the malformed payload IS the
      // evidence, and losing it loses the only trace of the failure.
      log.error(`[report] rejected a report from the renderer — ${issue}`);
    },
  );

  handleBare(CHANNELS.reportLogPath, () => ({ path: resolveSink()?.path ?? null }));

  handleBare(CHANNELS.reportBundle, () => {
    const sink = resolveSink();
    const records = sink?.tail(BUNDLE_RECORDS) ?? [];
    return { text: formatBundle(bootLine, records, resolveHome()) };
  });

  handleBare(CHANNELS.reportReveal, (): GitOpResult => {
    const sink = resolveSink();
    if (!sink) return failure('no log file — the sink could not be opened this session');
    // No path crosses the boundary in either direction; main reveals the file
    // it owns. See `CHANNELS.reportReveal` for why this is not a widened
    // `shellShowItemInFolder`.
    shell.showItemInFolder(sink.path);
    return ok();
  });
}
