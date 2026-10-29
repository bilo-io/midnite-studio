"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appIssueLabels = appIssueLabels;
exports.parseCreatedIssueUrl = parseCreatedIssueUrl;
exports.createAppIssueCommand = createAppIssueCommand;
exports.createAppIssue = createAppIssue;
const studio_shared_1 = require("@midnite/studio-shared");
const gh_1 = require("./gh");
const KIND_LABEL = { bug: 'bug', feature: 'enhancement' };
/**
 * The label pair a report carries: its kind, and `app: <slug>` for the app that filed it.
 * `needs-triage` is never applied — that label exists for a web form whose App dropdown can be
 * left wrong, which cannot happen when the app itself knows which app it is. **Each `app: <slug>`
 * label must exist on midnite-apps**: `gh issue create --label` refuses an unknown one.
 */
function appIssueLabels(kind, app = studio_shared_1.DEFAULT_ISSUE_APP) {
    return [KIND_LABEL[kind], `app: ${app}`];
}
const WRITE_TIMEOUT_MS = 20_000;
/**
 * `gh issue create`'s own success output is the issue's URL; matched rather than assumed to be all
 * of stdout, so a banner line from a shell rc degrades to "filed, no link", never "failed".
 */
const ISSUE_URL_PATTERN = /https:\/\/github\.com\/\S+\/issues\/\d+/;
function parseCreatedIssueUrl(output) {
    return output.match(ISSUE_URL_PATTERN)?.[0] ?? null;
}
/** `gh issue create -R 'bilo-io/midnite-apps' --title '…' --body '…' --label '…'…` — a pure string. */
function createAppIssueCommand(fields) {
    const labelFlags = fields.labels.map((label) => ` --label ${(0, gh_1.shellQuote)(label)}`).join('');
    return (`gh issue create -R ${(0, gh_1.shellQuote)(studio_shared_1.APP_ISSUES_REPO)}` +
        ` --title ${(0, gh_1.shellQuote)(fields.title)} --body ${(0, gh_1.shellQuote)(fields.body)}${labelFlags}`);
}
/**
 * File it. The probe comes first: a signed-out `gh` fails with a true but unhelpful message, and
 * `cli.reason` carries a better one for the dialog to render.
 */
async function createAppIssue(gh, fields) {
    const cli = await gh.status();
    if (cli.reason !== 'ready')
        return { ok: false, cli, error: null, url: null };
    const command = createAppIssueCommand({
        title: fields.title,
        body: fields.body,
        labels: appIssueLabels(fields.kind, fields.app),
    });
    const result = await gh.run(command, WRITE_TIMEOUT_MS);
    if (result.exitCode !== 0)
        return { ok: false, cli, error: (0, gh_1.describeFailure)(result.output), url: null };
    return { ok: true, cli, error: null, url: parseCreatedIssueUrl(result.stdout) };
}
//# sourceMappingURL=app-issue.js.map