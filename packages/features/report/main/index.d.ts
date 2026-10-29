import { type LogSink } from '@midnite/studio-runtime';
import { type ErrorReport } from '@midnite/studio-shared';
import { type GhRunner } from './gh';
export { reportManifest, type ReportManifest } from '../manifest';
export { appIssueLabels, createAppIssue, createAppIssueCommand, parseCreatedIssueUrl, type AppIssueKind, } from './app-issue';
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
export declare function formatReport(report: ErrorReport): string;
export declare const reportMain: import("@midnite/studio-runtime").FeatureMainModule<ReportMainServices>;
/**
 * A native Help ▸ Report an Issue… item, for an app's own menu: clicking it sends
 * `EVENT_CHANNELS.reportOpen` to the app's window, which the mounted `ReportIssueHost` opens on.
 * `send` is the composer's `ctx.emit`-shaped window sender.
 */
export declare function reportIssueMenuItem(send: (channel: string, payload: unknown) => void): {
    label: string;
    click: () => void;
};
//# sourceMappingURL=index.d.ts.map