import { defineFeatureMain, type LogSink, BUNDLE_RECORDS, formatLogBundle } from '@midnite/studio-runtime';
import {
  AppIssueSubmitRequestSchema,
  CHANNELS,
  ErrorReportSchema,
  EVENT_CHANNELS,
  failure,
  isAppIssuesUrl,
  ok,
  schemas,
  type AppIssueSubmitResult,
  type ErrorReport,
  type GitOpResult,
} from '@midnite/studio-shared';

import { reportManifest } from '../manifest';
import { createAppIssue } from './app-issue';
import { createShellGh, type GhRunner } from './gh';

export { reportManifest, type ReportManifest } from '../manifest';
export {
  appIssueLabels,
  createAppIssue,
  createAppIssueCommand,
  parseCreatedIssueUrl,
  type AppIssueKind,
} from './app-issue';
export { createShellGh, describeFailure, isAuthenticated, shellQuote, type GhRunner, type GhRunResult } from './gh';

/**
 * The report feature's main half: every channel Report an Issue and the crash log answer on.
 *
 * Nothing here imports `electron`. The composer hands in what touches the OS — its log sink, the
 * home directory to redact, `shell.openExternal`, `clipboard.writeText` and
 * `shell.showItemInFolder` — and, optionally, its own `gh` (Studio shares the forge's probe cache).
 *
 * **An invalid crash report is logged, never dropped.** A payload malformed enough to fail its
 * schema is itself evidence of the bug being reported, and it is the only trace of it.
 */
export type ReportMainServices = {
  /** The composer's crash log, resolved on every call — it may be opened after registration. */
  sink: () => LogSink | null;
  /** The home directory paths are redacted against in the diagnostics bundle. */
  homeDir: () => string;
  /**
   * The bundle's first line, identifying the build. Read per call; kept out of the sink's tail
   * because on a long session the boot record scrolls out of the very block meant to name it.
   */
  bootLine?: () => string;
  /** Where a renderer crash report is written. Defaults to the sink at `error` level. */
  logError?: (line: string) => void;
  /** Defaults to {@link createShellGh}. Studio passes the forge's cached probe and shell. */
  gh?: GhRunner;
  /** `shell.openExternal` — only ever handed a midnite-apps issues URL (checked here). */
  openExternal: (url: string) => Promise<void> | void;
  /** `clipboard.writeText` — synchronous, which is why the request schema caps the length. */
  writeClipboard: (text: string) => void;
  /** `shell.showItemInFolder` — handed the sink's own path, never one from the renderer. */
  revealPath: (path: string) => void;
};

/** `ErrorReport` → the line that goes in the file. */
export function formatReport(report: ErrorReport): string {
  const where = [report.role, report.view].filter((part) => part !== undefined).join('/');
  const parts = [`[renderer] ${report.source} ${where}: ${report.name}: ${report.message}`];
  if (report.stack.length > 0) parts.push(report.stack);
  if (report.componentStack !== undefined && report.componentStack.length > 0) {
    parts.push(`component stack:${report.componentStack}`);
  }
  return parts.join('\n');
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const reportMain = defineFeatureMain<ReportMainServices>({
  feature: reportManifest.feature,
  channels: reportManifest.ipc,
  register({ ipc }, services) {
    const gh = services.gh ?? createShellGh();
    const logError = services.logError ?? ((line: string) => services.sink()?.write('error', line));

    ipc.send(
      CHANNELS.reportError,
      ErrorReportSchema,
      (report) => logError(formatReport(report)),
      // Not a drop — see this module's header.
      (issue) => logError(`[report] rejected a report from the renderer — ${issue}`),
    );

    ipc.handleBare(CHANNELS.reportLogPath, () => ({ path: services.sink()?.path ?? null }));

    ipc.handleBare(CHANNELS.reportBundle, () => {
      const records = services.sink()?.tail(BUNDLE_RECORDS) ?? [];
      return { text: formatLogBundle(services.bootLine?.() ?? '', records, services.homeDir()) };
    });

    ipc.handleBare(CHANNELS.reportReveal, (): GitOpResult => {
      const sink = services.sink();
      if (!sink) return failure('no log file — the sink could not be opened this session');
      services.revealPath(sink.path);
      return ok();
    });

    ipc.handle(
      CHANNELS.reportSubmitIssue,
      AppIssueSubmitRequestSchema,
      (req) => createAppIssue(gh, req),
      // "Nothing was attempted" — the shape every forge write's `onInvalid` uses, `url` included.
      (issue): AppIssueSubmitResult => ({
        ok: false,
        cli: { reason: 'not-installed', binPath: null, hint: '' },
        error: issue,
        url: null,
      }),
    );

    ipc.handleBare(CHANNELS.reportGhStatus, () => gh.status());

    ipc.handle(
      CHANNELS.reportOpenUrl,
      schemas.ReportOpenUrlRequest,
      async ({ url }): Promise<GitOpResult> => {
        // The schema already refuses anything else; checked again where the URL leaves the app.
        if (!isAppIssuesUrl(url)) return failure('only a midnite-apps issue page can be opened');
        try {
          await services.openExternal(url);
          return ok();
        } catch (error) {
          return failure(message(error));
        }
      },
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.reportCopy,
      schemas.ReportCopyRequest,
      ({ text }) => {
        try {
          services.writeClipboard(text);
          return { ok: true };
        } catch (error) {
          // A clipboard the OS refuses is the user's environment, not a crash.
          return { ok: false, message: message(error) };
        }
      },
      (issue) => ({ ok: false, message: issue }),
    );
  },
});

/**
 * A native Help ▸ Report an Issue… item, for an app's own menu: clicking it sends
 * `EVENT_CHANNELS.reportOpen` to the app's window, which the mounted `ReportIssueHost` opens on.
 * `send` is the composer's `ctx.emit`-shaped window sender.
 */
export function reportIssueMenuItem(send: (channel: string, payload: unknown) => void): {
  label: string;
  click: () => void;
} {
  return { label: 'Report an Issue…', click: () => send(EVENT_CHANNELS.reportOpen, undefined) };
}
