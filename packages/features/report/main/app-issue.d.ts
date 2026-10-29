import { type AppIssueSubmitResult } from '@midnite/studio-shared';
import { type GhRunner } from './gh';
/**
 * Filing an issue on `bilo-io/midnite-apps` (`APP_ISSUES_REPO`), the suite's public tracker —
 * moved here from the forge feature (Phase 93's `gh-app-issue.ts`) so every app files the same way.
 *
 * It has no `Forge` parameter on purpose: it always targets midnite-apps, whichever repo is open or
 * whether one is open at all. `gh issue create`, not `gh api`: there is no JSON payload.
 */
export type AppIssueKind = 'bug' | 'feature';
/**
 * The label pair a report carries: its kind, and `app: <slug>` for the app that filed it.
 * `needs-triage` is never applied — that label exists for a web form whose App dropdown can be
 * left wrong, which cannot happen when the app itself knows which app it is. **Each `app: <slug>`
 * label must exist on midnite-apps**: `gh issue create --label` refuses an unknown one.
 */
export declare function appIssueLabels(kind: AppIssueKind, app?: string): readonly string[];
export declare function parseCreatedIssueUrl(output: string): string | null;
/** `gh issue create -R 'bilo-io/midnite-apps' --title '…' --body '…' --label '…'…` — a pure string. */
export declare function createAppIssueCommand(fields: {
    title: string;
    body: string;
    labels: readonly string[];
}): string;
/**
 * File it. The probe comes first: a signed-out `gh` fails with a true but unhelpful message, and
 * `cli.reason` carries a better one for the dialog to render.
 */
export declare function createAppIssue(gh: GhRunner, fields: {
    title: string;
    body: string;
    kind: AppIssueKind;
    app?: string;
}): Promise<AppIssueSubmitResult>;
//# sourceMappingURL=app-issue.d.ts.map