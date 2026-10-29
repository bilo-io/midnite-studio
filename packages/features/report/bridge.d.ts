import type { MidniteStudioBridge } from '@midnite/studio-shared';
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
export declare function createReportBridge({ call, send, subscribe }: ReportBridgeSlice): ReportBridge;
//# sourceMappingURL=bridge.d.ts.map