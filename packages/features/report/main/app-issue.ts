import { APP_ISSUES_REPO, DEFAULT_ISSUE_APP, type AppIssueSubmitResult } from '@midnite/studio-shared';

import { describeFailure, shellQuote, type GhRunner } from './gh';

/**
 * Filing an issue on `bilo-io/midnite-apps` (`APP_ISSUES_REPO`), the suite's public tracker —
 * moved here from the forge feature (Phase 93's `gh-app-issue.ts`) so every app files the same way.
 *
 * It has no `Forge` parameter on purpose: it always targets midnite-apps, whichever repo is open or
 * whether one is open at all. `gh issue create`, not `gh api`: there is no JSON payload.
 */

export type AppIssueKind = 'bug' | 'feature';

const KIND_LABEL: Record<AppIssueKind, string> = { bug: 'bug', feature: 'enhancement' };

/**
 * The label pair a report carries: its kind, and `app: <slug>` for the app that filed it.
 * `needs-triage` is never applied — that label exists for a web form whose App dropdown can be
 * left wrong, which cannot happen when the app itself knows which app it is. **Each `app: <slug>`
 * label must exist on midnite-apps**: `gh issue create --label` refuses an unknown one.
 */
export function appIssueLabels(kind: AppIssueKind, app: string = DEFAULT_ISSUE_APP): readonly string[] {
  return [KIND_LABEL[kind], `app: ${app}`];
}

const WRITE_TIMEOUT_MS = 20_000;

/**
 * `gh issue create`'s own success output is the issue's URL; matched rather than assumed to be all
 * of stdout, so a banner line from a shell rc degrades to "filed, no link", never "failed".
 */
const ISSUE_URL_PATTERN = /https:\/\/github\.com\/\S+\/issues\/\d+/;

export function parseCreatedIssueUrl(output: string): string | null {
  return output.match(ISSUE_URL_PATTERN)?.[0] ?? null;
}

/** `gh issue create -R 'bilo-io/midnite-apps' --title '…' --body '…' --label '…'…` — a pure string. */
export function createAppIssueCommand(fields: { title: string; body: string; labels: readonly string[] }): string {
  const labelFlags = fields.labels.map((label) => ` --label ${shellQuote(label)}`).join('');
  return (
    `gh issue create -R ${shellQuote(APP_ISSUES_REPO)}` +
    ` --title ${shellQuote(fields.title)} --body ${shellQuote(fields.body)}${labelFlags}`
  );
}

/**
 * File it. The probe comes first: a signed-out `gh` fails with a true but unhelpful message, and
 * `cli.reason` carries a better one for the dialog to render.
 */
export async function createAppIssue(
  gh: GhRunner,
  fields: { title: string; body: string; kind: AppIssueKind; app?: string },
): Promise<AppIssueSubmitResult> {
  const cli = await gh.status();
  if (cli.reason !== 'ready') return { ok: false, cli, error: null, url: null };
  const command = createAppIssueCommand({
    title: fields.title,
    body: fields.body,
    labels: appIssueLabels(fields.kind, fields.app),
  });
  const result = await gh.run(command, WRITE_TIMEOUT_MS);
  if (result.exitCode !== 0) return { ok: false, cli, error: describeFailure(result.output), url: null };
  return { ok: true, cli, error: null, url: parseCreatedIssueUrl(result.stdout) };
}
