"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReportBridge = createReportBridge;
const channels_1 = require("@midnite/studio-shared/ipc/channels");
function createReportBridge({ call, send, subscribe }) {
    return {
        // `send`, not `call`: a crash report has no answer worth awaiting, and the renderer making it
        // may be seconds from a reload.
        error: (report) => send(channels_1.CHANNELS.reportError, report),
        logPath: () => call(channels_1.CHANNELS.reportLogPath),
        bundle: () => call(channels_1.CHANNELS.reportBundle),
        // Deliberately argument-free — main reveals the file it owns.
        reveal: () => call(channels_1.CHANNELS.reportReveal),
        submitIssue: (req) => call(channels_1.CHANNELS.reportSubmitIssue, req),
        ghStatus: () => call(channels_1.CHANNELS.reportGhStatus),
        openUrl: (req) => call(channels_1.CHANNELS.reportOpenUrl, req),
        copy: (req) => call(channels_1.CHANNELS.reportCopy, req),
        onOpen: (handler) => subscribe(channels_1.EVENT_CHANNELS.reportOpen, () => handler()),
    };
}
//# sourceMappingURL=bridge.js.map