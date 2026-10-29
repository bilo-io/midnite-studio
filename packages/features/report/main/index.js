"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportMain = exports.shellQuote = exports.isAuthenticated = exports.describeFailure = exports.createShellGh = exports.parseCreatedIssueUrl = exports.createAppIssueCommand = exports.createAppIssue = exports.appIssueLabels = exports.reportManifest = void 0;
exports.formatReport = formatReport;
exports.reportIssueMenuItem = reportIssueMenuItem;
const studio_runtime_1 = require("@midnite/studio-runtime");
const studio_shared_1 = require("@midnite/studio-shared");
const manifest_1 = require("../manifest");
const app_issue_1 = require("./app-issue");
const gh_1 = require("./gh");
var manifest_2 = require("../manifest");
Object.defineProperty(exports, "reportManifest", { enumerable: true, get: function () { return manifest_2.reportManifest; } });
var app_issue_2 = require("./app-issue");
Object.defineProperty(exports, "appIssueLabels", { enumerable: true, get: function () { return app_issue_2.appIssueLabels; } });
Object.defineProperty(exports, "createAppIssue", { enumerable: true, get: function () { return app_issue_2.createAppIssue; } });
Object.defineProperty(exports, "createAppIssueCommand", { enumerable: true, get: function () { return app_issue_2.createAppIssueCommand; } });
Object.defineProperty(exports, "parseCreatedIssueUrl", { enumerable: true, get: function () { return app_issue_2.parseCreatedIssueUrl; } });
var gh_2 = require("./gh");
Object.defineProperty(exports, "createShellGh", { enumerable: true, get: function () { return gh_2.createShellGh; } });
Object.defineProperty(exports, "describeFailure", { enumerable: true, get: function () { return gh_2.describeFailure; } });
Object.defineProperty(exports, "isAuthenticated", { enumerable: true, get: function () { return gh_2.isAuthenticated; } });
Object.defineProperty(exports, "shellQuote", { enumerable: true, get: function () { return gh_2.shellQuote; } });
/** `ErrorReport` → the line that goes in the file. */
function formatReport(report) {
    const where = [report.role, report.view].filter((part) => part !== undefined).join('/');
    const parts = [`[renderer] ${report.source} ${where}: ${report.name}: ${report.message}`];
    if (report.stack.length > 0)
        parts.push(report.stack);
    if (report.componentStack !== undefined && report.componentStack.length > 0) {
        parts.push(`component stack:${report.componentStack}`);
    }
    return parts.join('\n');
}
const message = (error) => (error instanceof Error ? error.message : String(error));
exports.reportMain = (0, studio_runtime_1.defineFeatureMain)({
    feature: manifest_1.reportManifest.feature,
    channels: manifest_1.reportManifest.ipc,
    register({ ipc }, services) {
        const gh = services.gh ?? (0, gh_1.createShellGh)();
        const logError = services.logError ?? ((line) => services.sink()?.write('error', line));
        ipc.send(studio_shared_1.CHANNELS.reportError, studio_shared_1.ErrorReportSchema, (report) => logError(formatReport(report)), 
        // Not a drop — see this module's header.
        (issue) => logError(`[report] rejected a report from the renderer — ${issue}`));
        ipc.handleBare(studio_shared_1.CHANNELS.reportLogPath, () => ({ path: services.sink()?.path ?? null }));
        ipc.handleBare(studio_shared_1.CHANNELS.reportBundle, () => {
            const records = services.sink()?.tail(studio_runtime_1.BUNDLE_RECORDS) ?? [];
            return { text: (0, studio_runtime_1.formatLogBundle)(services.bootLine?.() ?? '', records, services.homeDir()) };
        });
        ipc.handleBare(studio_shared_1.CHANNELS.reportReveal, () => {
            const sink = services.sink();
            if (!sink)
                return (0, studio_shared_1.failure)('no log file — the sink could not be opened this session');
            services.revealPath(sink.path);
            return (0, studio_shared_1.ok)();
        });
        ipc.handle(studio_shared_1.CHANNELS.reportSubmitIssue, studio_shared_1.AppIssueSubmitRequestSchema, (req) => (0, app_issue_1.createAppIssue)(gh, req), 
        // "Nothing was attempted" — the shape every forge write's `onInvalid` uses, `url` included.
        (issue) => ({
            ok: false,
            cli: { reason: 'not-installed', binPath: null, hint: '' },
            error: issue,
            url: null,
        }));
        ipc.handleBare(studio_shared_1.CHANNELS.reportGhStatus, () => gh.status());
        ipc.handle(studio_shared_1.CHANNELS.reportOpenUrl, studio_shared_1.schemas.ReportOpenUrlRequest, async ({ url }) => {
            // The schema already refuses anything else; checked again where the URL leaves the app.
            if (!(0, studio_shared_1.isAppIssuesUrl)(url))
                return (0, studio_shared_1.failure)('only a midnite-apps issue page can be opened');
            try {
                await services.openExternal(url);
                return (0, studio_shared_1.ok)();
            }
            catch (error) {
                return (0, studio_shared_1.failure)(message(error));
            }
        }, (issue) => (0, studio_shared_1.failure)(issue));
        ipc.handle(studio_shared_1.CHANNELS.reportCopy, studio_shared_1.schemas.ReportCopyRequest, ({ text }) => {
            try {
                services.writeClipboard(text);
                return { ok: true };
            }
            catch (error) {
                // A clipboard the OS refuses is the user's environment, not a crash.
                return { ok: false, message: message(error) };
            }
        }, (issue) => ({ ok: false, message: issue }));
    },
});
/**
 * A native Help ▸ Report an Issue… item, for an app's own menu: clicking it sends
 * `EVENT_CHANNELS.reportOpen` to the app's window, which the mounted `ReportIssueHost` opens on.
 * `send` is the composer's `ctx.emit`-shaped window sender.
 */
function reportIssueMenuItem(send) {
    return { label: 'Report an Issue…', click: () => send(studio_shared_1.EVENT_CHANNELS.reportOpen, undefined) };
}
//# sourceMappingURL=index.js.map