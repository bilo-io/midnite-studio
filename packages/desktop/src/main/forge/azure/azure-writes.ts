import type {
  Forge,
  ForgeAccount,
  ForgeCliStatus,
  ForgeMergeMethod,
  ForgeProjectWriteResult,
  ForgeReviewEvent,
  ForgeWriteResult,
} from '@midnite/studio-shared';

import { azGet, azPatch, azPost, azPut, azWorkItemPatch, azureCliStatus, repoSegment, stateCategoriesFor } from './azure-client';
import { asStringLoose, fields, row } from './azure-json';

/**
 * The write half of Azure DevOps's adapter — the phase doc's own scope:
 * "comment on a PR or work item, vote, resolve a thread, transition a work
 * item's state." `mergePull` and `markReady` are real Azure actions and are
 * implemented properly; `requestReview` needs an identity-resolution picker
 * this app does not build (the same gap Bitbucket's own write module leaves
 * open, for the identical reason) and `rerunChecks` has no selective-retry
 * endpoint in Azure's public REST API at all — both report an honest
 * `unsupportedWrite` rather than a guess.
 */

function notReady(cli: ForgeCliStatus): ForgeWriteResult {
  return { ok: false, cli, error: cli.hint || null };
}

function fromResult(cli: ForgeCliStatus, ok: boolean, error: string | null): ForgeWriteResult {
  return { ok, cli, error };
}

async function unsupportedWrite(account: ForgeAccount | null, message: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  return { ok: false, cli, error: message };
}

// ─── Comments ─────────────────────────────────────────────────────────────

export async function commentPull(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPost(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}/threads`, {
    comments: [{ content: body, commentType: 'text' }],
    status: 'active',
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function commentIssue(forge: Forge, account: ForgeAccount | null, number: number, body: string): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPost(forge, account, `wit/workItems/${number}/comments`, { text: body }, { 'api-version': '7.1-preview.3' });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function replyToReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  // `commentId` here is actually the thread id — see `azure-reads.ts`'s
  // `pullThreads`, whose `ForgeReviewComment.databaseId` is the thread id,
  // not the comment id, because a reply targets the thread as a whole.
  const result = await azPost(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${request.number}/threads/${request.commentId}/comments`,
    { content: request.body, commentType: 'text' },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/**
 * A brand-new inline thread. Azure anchors a thread to `{filePath,
 * rightFileStart, rightFileEnd}` rather than a commit id — `commitId` and
 * `side` are accepted (the interface's own shape) but unused, the same
 * "the interface still names it, this provider does not need it" posture
 * `bitbucket-writes.ts`'s `addReviewComment` already takes for its own
 * unused `commitId`.
 */
export async function addReviewComment(
  forge: Forge,
  account: ForgeAccount | null,
  request: { number: number; path: string; line: number; body: string },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const anchor = { line: request.line, offset: 1 };
  const result = await azPost(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${request.number}/threads`, {
    comments: [{ content: request.body, commentType: 'text' }],
    status: 'active',
    threadContext: { filePath: `/${request.path}`, rightFileStart: anchor, rightFileEnd: anchor },
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

/** Decodes the `${prNumber}:${threadId}` id `azure-reads.ts`'s `pullThreads`
 *  builds — see its own note on why the PR number has to ride inside the id. */
export async function setThreadResolved(
  forge: Forge,
  account: ForgeAccount | null,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const separator = request.threadId.indexOf(':');
  if (separator <= 0) return fromResult(cli, false, 'Not an Azure DevOps thread id.');
  const number = request.threadId.slice(0, separator);
  const threadId = request.threadId.slice(separator + 1);
  if (!/^\d+$/.test(number) || threadId.length === 0) {
    return fromResult(cli, false, 'Not an Azure DevOps thread id.');
  }

  const result = await azPatch(
    forge,
    account,
    `git/repositories/${repoSegment(forge)}/pullrequests/${number}/threads/${threadId}`,
    { status: request.resolved ? 'fixed' : 'active' },
  );
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

// ─── Review vote ──────────────────────────────────────────────────────────

/**
 * `reviewPull` onto Azure's numeric vote scale — `10` for `APPROVE`, `-10`
 * for `REQUEST_CHANGES` (Azure's own reject; there is no separate
 * "request changes" concept beyond the vote itself, the phase doc's own
 * note), and a plain thread comment for `COMMENT`, exactly like
 * GitLab/Bitbucket's identical fallthrough.
 *
 * The reviewer id is the authenticated PAT's own identity — resolved via
 * the profile call `whoami.ts`'s `azureWhoami` already makes.
 * **Unverified against a live organization**: Azure DevOps's own
 * documentation is ambiguous about whether the *profile* id `GET
 * .../profiles/me` returns is accepted directly as the `reviewerId` path
 * segment on `PUT .../reviewers/{id}`, or whether it needs resolving through
 * the separate Identities API first. `@me` — the literal string Azure's own
 * web UI's underlying calls are known to accept in several reviewer
 * endpoints — is used here instead, which sidesteps the ambiguity if Azure
 * accepts it; the numeric id is not.
 */
export async function reviewPull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (event === 'COMMENT') return commentPull(forge, account, number, body);

  const vote = event === 'APPROVE' ? 10 : -10;
  const verdict = await azPut(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}/reviewers/@me`, { vote });
  if (!verdict.ok) return fromResult(cli, false, verdict.error);

  if (body.trim().length > 0) {
    const note = await commentPull(forge, account, number, body);
    if (!note.ok) return fromResult(cli, true, `Vote recorded, but the comment failed: ${note.error}`);
  }
  return fromResult(cli, true, null);
}

// ─── Merge, draft, reviewers, rerun ─────────────────────────────────────

/**
 * Azure's completion request needs `lastMergeSourceCommit` as a concurrency
 * guard — the same commit the PR itself last computed a merge against — so
 * this reads the PR before writing it, matching `gitlab-write.ts`'s
 * `markReady` doing the identical read-before-write for its own title-prefix
 * toggle.
 */
export async function mergePull(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  if (method === 'rebase') {
    return unsupportedWrite(account, 'Azure DevOps has no server-side rebase-merge — merge or squash instead.');
  }

  const pr = await azGet<Record<string, unknown>>(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`);
  if (!pr.ok) return fromResult(cli, false, pr.error);
  const lastMergeSource = row(pr.data['lastMergeSourceCommit']);
  if (!lastMergeSource) return fromResult(cli, false, 'This pull request has no computed merge commit yet.');

  const result = await azPatch(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`, {
    status: 'completed',
    lastMergeSourceCommit: lastMergeSource,
    completionOptions: { squashMerge: method === 'squash', bypassPolicy: false },
  });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function markReady(forge: Forge, account: ForgeAccount | null, number: number): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);
  const result = await azPatch(forge, account, `git/repositories/${repoSegment(forge)}/pullrequests/${number}`, { isDraft: false });
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}

export async function requestReview(
  _forge: Forge,
  account: ForgeAccount | null,
  _number: number,
  _reviewers: string[],
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Requesting an Azure DevOps reviewer needs an identity picker this app does not build yet.',
  );
}

export async function rerunChecks(
  _forge: Forge,
  account: ForgeAccount | null,
  _runId: string,
  _failedOnly: boolean,
): Promise<ForgeWriteResult> {
  return unsupportedWrite(
    account,
    'Azure Pipelines has no public API to retry an existing run — start a new one from the Pipelines page.',
  );
}

export async function setItemField(): Promise<ForgeProjectWriteResult> {
  // Real board writes go through `azure-board.ts`'s own `setItemField` —
  // `create-azure-adapter.ts` binds that one, not this stub. This exists
  // only so the module shape mirrors `bitbucket-writes.ts`'s and
  // `gitlab-write.ts`'s own file layout.
  return { ok: false, kind: 'error', message: 'Not implemented in this module — see azure-board.ts.' };
}

// ─── Work item state ──────────────────────────────────────────────────────

/**
 * `open`/`closed` onto a real Azure state name — Azure has no `open`/
 * `closed` field at all, only a per-type, per-process `System.State`
 * vocabulary (`azure-client.ts`'s `stateCategoriesFor`). This picks the
 * first state in the target category (`Completed` for `closed`, `Proposed`
 * for `open`, falling back to `InProgress`) — a team with several
 * "Completed"-category states (`Closed` *and* `Done`, say) gets whichever
 * one the API lists first, the same single-verb simplification GitHub's own
 * "Close" button makes for issues with no equivalent multi-state ambiguity.
 */
export async function setIssueState(
  forge: Forge,
  account: ForgeAccount | null,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return notReady(cli);

  const item = await azGet<Record<string, unknown>>(forge, account, `wit/workitems/${number}`, {
    fields: 'System.WorkItemType,System.State',
  });
  if (!item.ok) return fromResult(cli, false, item.error);
  const f = fields(item.data);
  const type = asStringLoose(f['System.WorkItemType']);
  if (!type) return fromResult(cli, false, 'Could not resolve this work item’s type.');

  const categories = await stateCategoriesFor(forge, account, type);
  if (!categories) return fromResult(cli, false, 'Could not load this project’s work item states.');

  const targetCategory = state === 'closed' ? 'Completed' : 'Proposed';
  let targetState = [...categories.entries()].find(([, category]) => category === targetCategory)?.[0];
  if (!targetState && state === 'open') {
    targetState = [...categories.entries()].find(([, category]) => category === 'InProgress')?.[0];
  }
  if (!targetState) return fromResult(cli, false, `This project has no "${targetCategory}" state for ${type}.`);

  const result = await azWorkItemPatch(forge, account, `wit/workitems/${number}`, [
    { op: 'add', path: '/fields/System.State', value: targetState },
  ]);
  return fromResult(cli, result.ok, result.ok ? null : result.error);
}
