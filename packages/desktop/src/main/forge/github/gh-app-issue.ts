import { APP_ISSUES_REPO, type AppIssueSubmitResult } from '@midnite/studio-shared';

import { describeFailure, ghStatus, LIST_TIMEOUT_MS, runInShell, shellQuote } from './gh-shell';

/**
 * The one write in this directory with no `Forge` parameter — Phase 93.
 *
 * Every function in `gh-write.ts` takes `(forge: Forge, …)`, derived from
 * whatever repository the user has open. This one never does: it always
 * targets `bilo-io/midnite-apps` (`APP_ISSUES_REPO`), the app's own public
 * bug tracker, regardless of which repo is active or whether there even is
 * one — filing "the app crashed" has nothing to do with the git repo sitting
 * open in the client at the time. **Do not copy this file's shape** for a
 * write that does belong to the active repo; those all belong in
 * `gh-write.ts` and take `forge` like everything else there.
 *
 * `gh issue create`, not `gh api`: there is no JSON payload here, the same
 * reasoning `gh-write.ts`'s `issueCommentCommand`/`issueSetStateCommand`
 * already apply to every other issue write in this app.
 */

export type AppIssueKind = 'bug' | 'feature';

/**
 * The label pair each kind applies, against the label set already verified
 * present on `bilo-io/midnite-apps` (`gh label list`) — no creation step.
 * `needs-triage` is deliberately never applied: that label exists for the web
 * form's "App" dropdown routing to the wrong place, which cannot happen when
 * the app itself already knows which app it is.
 */
const KIND_LABELS: Record<AppIssueKind, readonly string[]> = {
  bug: ['bug', 'app: midnite-studio'],
  feature: ['enhancement', 'app: midnite-studio'],
};

/** Same ceiling `gh-write.ts`'s own writes use — a slow write is a slow network, not a slow op. */
const WRITE_TIMEOUT_MS = LIST_TIMEOUT_MS;

/**
 * `gh issue create`'s own success output: the created issue's URL, and
 * nothing else. Matched rather than assumed to be the *entire* stdout, so a
 * `gh` version that prefixes it with a banner line still resolves — a parse
 * miss degrades to "filed, no link" rather than "failed", since the issue was
 * filed either way.
 */
const ISSUE_URL_PATTERN = /https:\/\/github\.com\/\S+\/issues\/\d+/;

/** Pull the created issue's URL out of `gh issue create`'s stdout, or `null` if it can't be found. */
export function parseCreatedIssueUrl(output: string): string | null {
  return output.match(ISSUE_URL_PATTERN)?.[0] ?? null;
}

/**
 * `gh issue create -R 'bilo-io/midnite-apps' --title '…' --body '…' --label '…' [--label '…']`
 *
 * A pure function, exactly the `*Command()` shape every write in `gh-write.ts`
 * uses — no subprocess, no network, testable as a string. `-R` rather than
 * `--repo`: `gh issue create` accepts both, and `-R` is what this file's own
 * tests assert to keep one spelling in the codebase for "the repo this write
 * targets," matching the fixed nature of the target itself.
 */
export function createAppIssueCommand(fields: {
  title: string;
  body: string;
  labels: readonly string[];
}): string {
  const labelFlags = fields.labels.map((label) => ` --label ${shellQuote(label)}`).join('');
  return (
    `gh issue create -R ${shellQuote(APP_ISSUES_REPO)}` +
    ` --title ${shellQuote(fields.title)} --body ${shellQuote(fields.body)}${labelFlags}`
  );
}

/**
 * File the issue, and report it the way every forge write in this app does.
 *
 * The probe comes first, same as `gh-write.ts`'s `runWrite`: a signed-out `gh`
 * fails with a message about authentication that is true but unhelpful, and
 * `cli.reason` already carries a better sentence for the UI to render. Unlike
 * a listing's failure path, this does not invalidate the probe cache on a
 * refused write — the commonest cause of a refusal here is a genuine
 * permission gap (no write access to `bilo-io/midnite-apps`), not a stale
 * credential, so there is nothing worth re-probing for.
 */
export async function createAppIssue(fields: {
  title: string;
  body: string;
  kind: AppIssueKind;
}): Promise<AppIssueSubmitResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { ok: false, cli, error: null, url: null };

  const command = createAppIssueCommand({
    title: fields.title,
    body: fields.body,
    labels: KIND_LABELS[fields.kind],
  });
  const result = await runInShell(command, WRITE_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    return { ok: false, cli, error: describeFailure(result.output), url: null };
  }
  return { ok: true, cli, error: null, url: parseCreatedIssueUrl(result.stdout) };
}
