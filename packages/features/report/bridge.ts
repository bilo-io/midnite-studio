import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The report feature's preload half: `window.midniteStudio.report`, written once.
 *
 * Every app's preload builds its bridge from the runtime's `createBridgeSlice(ipcRenderer)`; this
 * takes that slice and returns the whole `report` namespace, so an app wires Report an Issue with
 * one line — `report: createReportBridge(slice)` — and cannot drift from the channels the feature's
 * main half registers.
 *
 * It imports the channel names alone, by source path (`@midnite/studio-shared/ipc/channels`), as
 * every app preload does: the shared barrel would drag every zod schema into the preload. The
 * slice's type is restated structurally below rather than imported from the runtime, whose
 * `app-main/bridge-slice` subpath is reached by alias, not by package export.
 */
export type ReportBridgeSlice = {
  call<Req, Res>(channel: string, req?: Req): Promise<Res>;
  send(channel: string, req?: unknown): void;
  subscribe<T>(channel: string, handler: (payload: T) => void): () => void;
};

export type ReportBridge = MidniteStudioBridge['report'];

export function createReportBridge({ call, send, subscribe }: ReportBridgeSlice): ReportBridge {
  return {
    // `send`, not `call`: a crash report has no answer worth awaiting, and the renderer making it
    // may be seconds from a reload.
    error: (report) => send(CHANNELS.reportError, report),
    logPath: () => call(CHANNELS.reportLogPath),
    bundle: () => call(CHANNELS.reportBundle),
    // Deliberately argument-free — main reveals the file it owns.
    reveal: () => call(CHANNELS.reportReveal),
    submitIssue: (req) => call(CHANNELS.reportSubmitIssue, req),
    ghStatus: () => call(CHANNELS.reportGhStatus),
    openUrl: (req) => call(CHANNELS.reportOpenUrl, req),
    copy: (req) => call(CHANNELS.reportCopy, req),
    onOpen: (handler) => subscribe(EVENT_CHANNELS.reportOpen, () => handler()),
  };
}
