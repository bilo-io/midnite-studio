import type {
  Forge,
  ForgeMergeMethod,
  ForgeReviewEvent,
  ForgeWriteResult,
} from '@midnite/studio-shared';

import {
  apiHostFlag,
  describeFailure,
  ghStatus,
  invalidateGhProbe,
  LIST_TIMEOUT_MS,
  repoFlag,
  runInShell,
  shellQuote,
  slug,
} from './gh-shell';
import { describeGraphqlFailure } from './gh-graphql';

/**
 * The app's one write surface on the forge — and nothing else.
 *
 * `gh-cli.ts` says of itself "strictly reads… on purpose", and that stays
 * literally true because every call that changes state on GitHub lives here
 * instead. That is the whole reason this file exists as a separate module: the
 * write surface should be auditable by opening one file and reading it top to
 * bottom, not by grepping a 800-line reader for verbs.
 *
 * The bounds, restated where someone adding to this file will read them:
 *
 * - **Pull-request review only.** Approve, request changes, comment, merge,
 *   reviewer re-request, draft→ready, re-run checks. Nothing that touches
 *   issues, labels, branch protection, or the creation of pull requests.
 * - **Never a rejection.** Every function resolves `ForgeWriteResult`, so a
 *   failed write is a sentence the UI renders next to the button that caused
 *   it. An exception across the IPC boundary would unmount the pane holding
 *   the composer, along with the text the user just typed.
 * - **`gh`'s own words on failure.** "You must have write access", "the head
 *   sha is out of date" and "review cannot be requested from the author" are
 *   three different actions the user can take. A generic toast is none of them.
 *
 * ─── Theme E: inline review threads ────────────────────────────────────────
 *
 * Three calls: start a thread on a line, reply into one, and resolve or reopen
 * one. Two go through REST and one through GraphQL, and that split is forced by
 * the API rather than chosen — see each function.
 *
 * ─── Themes F and G: the verdict, the merge, the nudges ────────────────────
 *
 * Six calls, and all six are plain `gh` subcommands rather than `gh api` — `gh
 * pr review`, `gh pr comment`, `gh pr merge`, `gh pr edit`, `gh pr ready`, `gh
 * run rerun`. Theme E reaches for the API because threads have no CLI verb;
 * these do, and the CLI verb is the one that keeps working across API versions.
 *
 * **Command construction is separated from the spawn.** Each has a pure
 * `*Command(forge, …)` returning a string, and the runner below hands that
 * string to `runInShell`. That split is what makes the write surface testable at
 * all: `gh-write.test.ts` asserts the exact command line — flags, ordering,
 * quoting — with no subprocess, no network and no repository, which for a module
 * whose whole job is to be trusted is the test worth having.
 */

/**
 * Start a new inline thread on a line of the diff.
 *
 * `POST repos/{o}/{r}/pulls/{n}/comments`. REST, not GraphQL, because
 * `addPullRequestReviewThread` requires an in-progress review to attach to,
 * which would mean this app owning the "pending review" lifecycle — start,
 * accumulate, submit — for a single comment. REST posts a standalone thread in
 * one call, which is what the gutter's `+` means.
 *
 * **Two anchor forms, tried in order.** The modern one is
 * `line` + `side: RIGHT`: a new-file line number, which is exactly what
 * `DiffLine.newNo` already carries. The legacy one is `position`, a count of
 * lines down from the file's first `@@` header — computed in the renderer,
 * which is where the parsed hunks live. The line-based form is sent first and
 * is expected to be the only one ever used; `position` is retried only if the
 * API refuses it, which is the case on hosts predating line-based anchors.
 *
 * The retry is guarded on the *anchor* fields specifically. Retrying every
 * 422 with a different anchor would re-post on a rejection that had nothing to
 * do with the line — an empty body, a stale sha — and turn one refused comment
 * into two attempts against the user's rate limit.
 */
export async function addReviewComment(
  forge: Forge,
  request: {
    number: number;
    commitId: string;
    path: string;
    line: number;
    side: 'RIGHT';
    /** The legacy anchor, used only if the line-based form is refused. */
    position?: number;
    body: string;
  },
): Promise<ForgeWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return notReady(cli);

  const endpoint = `repos/${slug(forge)}/pulls/${request.number}/comments`;
  const base: Record<string, unknown> = {
    body: request.body,
    commit_id: request.commitId,
    path: request.path,
  };

  const lineBased = await apiPost(forge, endpoint, {
    ...base,
    line: request.line,
    side: request.side,
  });
  if (lineBased.ok || request.position === undefined || !refusedTheAnchor(lineBased.error)) {
    return { cli, ...lineBased };
  }

  const positional = await apiPost(forge, endpoint, { ...base, position: request.position });
  return { cli, ...positional };
}

/**
 * Whether a failure was about the anchor, and so worth retrying with the other
 * form.
 *
 * Matched on the field names GitHub names in its own validation message, not on
 * the status code: a 422 covers every invalid field on the resource, and the
 * one thing a second attempt can possibly fix is where the comment was pointed.
 */
function refusedTheAnchor(error: string | null): boolean {
  if (error === null) return false;
  return /\b(line|side|position|subject_type)\b/i.test(error);
}

/**
 * A reply into an existing thread.
 *
 * `POST pulls/{n}/comments/{comment_id}/replies`, keyed by the REST id of any
 * comment already in the thread — which is why `ForgeReviewComment` carries
 * `databaseId` beside its node id. There is no GraphQL mutation for this, and
 * the alternative REST form (`in_reply_to` on the create endpoint) is the
 * deprecated spelling of the same thing.
 */
export async function replyToReviewComment(
  forge: Forge,
  request: { number: number; commentId: string; body: string },
): Promise<ForgeWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return notReady(cli);

  const result = await apiPost(
    forge,
    `repos/${slug(forge)}/pulls/${request.number}/comments/${request.commentId}/replies`,
    { body: request.body },
  );
  return { cli, ...result };
}

/**
 * Resolve a thread, or reopen it.
 *
 * GraphQL, and this one has no REST alternative at all: resolution is a
 * property of `PullRequestReviewThread`, a type REST does not expose. It is
 * also why the thread reader is GraphQL — the `threadId` this takes is the node
 * id that only `reviewThreads` hands out.
 */
export async function setThreadResolved(
  forge: Forge,
  request: { threadId: string; resolved: boolean },
): Promise<ForgeWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return notReady(cli);

  const mutation = request.resolved ? 'resolveReviewThread' : 'unresolveReviewThread';
  const query =
    `mutation($threadId:ID!){${mutation}(input:{threadId:$threadId})` +
    '{thread{id isResolved}}}';

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(query)}` +
    // `-f` for an ID! variable, for the same reason `pullThreads` uses it for
    // its String!s: `-F` would type-guess the value out of being a string.
    ` -f threadId=${shellQuote(request.threadId)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    return { cli, ok: false, error: describeGraphqlFailure(result.output) };
  }
  return { cli, ok: true, error: null };
}

/**
 * One `gh api` POST with a JSON body.
 *
 * The body goes through `--input -` on stdin rather than a pile of `-f key=…`
 * flags, and that is not a style choice: `-f` sends every value as a *string*,
 * so `-f line=42` posts `"42"` and GitHub rejects it, while `-F line=42` guesses
 * types from the text and would coerce a body of `"true"` into a boolean. One
 * `JSON.stringify` is the only form where the types are exactly what was meant.
 *
 * The user's text does still reach a command line, as `printf`'s argument —
 * single-quoted by `shellQuote`, which is why that function is used rather than
 * trusted. What it never reaches is a `gh` *flag*, so nothing parses it as an
 * option or guesses a type out of it.
 */
async function apiPost(
  forge: Forge,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const command =
    `printf %s ${shellQuote(JSON.stringify(body))} |` +
    ` gh api --method POST ${shellQuote(endpoint)}${apiHostFlag(forge)} --input -`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    // The same probe invalidation every failing read does: the commonest cause
    // of a refused write is a token that has expired or lost a scope, and the
    // next `ghStatus()` should find that out rather than serve a cached `ready`.
    invalidateGhProbe();
    return { ok: false, error: describeApiFailure(result.output) };
  }
  return { ok: true, error: null };
}

/**
 * What a refused REST write said.
 *
 * `gh api` prints GitHub's error body as JSON — `{"message":"…","errors":[…]}` —
 * and `describeFailure` deliberately skips lines beginning with `{`, so it would
 * report "could not complete that request" for a response that named the exact
 * field at fault. The `errors[].message` entry is the useful half when there is
 * one ("body is too long", "line must be part of the diff"); `message` is the
 * summary; `describeFailure` catches everything with no payload.
 */
export function describeApiFailure(output: string): string {
  const brace = output.indexOf('{');
  if (brace >= 0) {
    try {
      const payload = JSON.parse(output.slice(brace)) as Record<string, unknown>;
      const detail = Array.isArray(payload['errors'])
        ? payload['errors']
            .map((entry) =>
              typeof entry === 'object' && entry !== null
                ? (entry as Record<string, unknown>)['message']
                : null,
            )
            .find((text): text is string => typeof text === 'string' && text.length > 0)
        : undefined;
      const summary = typeof payload['message'] === 'string' ? payload['message'] : null;

      // Both when both exist: "Validation Failed" alone says nothing, and the
      // field-level line alone loses the fact that it was a validation error.
      const message = [summary, detail].filter((text) => text !== null && text !== undefined);
      if (message.length > 0) return cap(message.join(' — '));
    } catch {
      // Not JSON after all — fall through to the line scan.
    }
  }
  return describeFailure(output);
}

/** The same ceiling `describeFailure` applies, so one sentence stays one line. */
const API_MESSAGE_MAX = 300;
const cap = (text: string): string =>
  text.length > API_MESSAGE_MAX ? `${text.slice(0, API_MESSAGE_MAX)}…` : text;

/**
 * The answer when `gh` cannot be used at all.
 *
 * `ok: false` with a null `error`, because nothing failed — nothing was
 * attempted. The `cli` reason carries the whole story and the UI already knows
 * how to render it as "run gh auth login" rather than as a red write failure.
 */
const notReady = (cli: ForgeWriteResult['cli']): ForgeWriteResult => ({
  ok: false,
  cli,
  error: null,
});

/*
  ─── Themes F and G ─────────────────────────────────────────────────────────
*/

/**
 * Longer than the reads' twenty seconds would be wrong, and shorter would be
 * worse.
 *
 * A write is a POST GitHub processes rather than a listing it serves from cache,
 * and a merge in particular waits on the far side actually creating a commit.
 * Reusing the listing timeout is deliberate: the observed shape of a slow write
 * is a slow *network*, which twenty seconds already accommodates, and a longer
 * ceiling would only mean a user waits longer to be told the same thing.
 */
const WRITE_TIMEOUT_MS = LIST_TIMEOUT_MS;

/**
 * `--body` from a string the user typed, safely and without a temp file.
 *
 * `gh` also takes `--body-file`, which is what a shell script would reach for,
 * and it is the wrong tool here: it would mean writing the user's review to
 * disk, remembering to delete it, and having a half-written review survive a
 * crash. `shellQuote` makes an arbitrary multi-line body — backticks, `$(…)`,
 * embedded quotes and all — a single inert argv entry, which is the whole
 * reason that function is load-bearing rather than decorative.
 *
 * An empty body produces no flag at all rather than `--body ''`: `gh pr review
 * --approve --body ''` is accepted, but it publishes an approval carrying an
 * empty comment, and a bare approval is what the user asked for.
 */
const bodyFlag = (body: string): string =>
  body.trim().length > 0 ? ` --body ${shellQuote(body)}` : '';

/**
 * The flag each review verb spells itself with.
 *
 * `gh pr review` takes the verb as a flag, not as a value — there is no
 * `--event APPROVE` — so the mapping has to exist somewhere. Here, as a total
 * record over the contract's own enum, so adding a fourth event would fail to
 * compile rather than silently produce a command with no verb in it.
 */
const REVIEW_FLAG: Record<ForgeReviewEvent, string> = {
  APPROVE: '--approve',
  REQUEST_CHANGES: '--request-changes',
  COMMENT: '--comment',
};

/** `gh pr review <n> --repo … --approve|--request-changes|--comment [--body …]` */
export function reviewCommand(
  forge: Forge,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): string {
  return `gh pr review ${number} ${repoFlag(forge)} ${REVIEW_FLAG[event]}${bodyFlag(body)}`;
}

/**
 * `gh pr comment <n> --repo … --body …`
 *
 * Not `gh pr review --comment`, which looks like the same thing and is not: a
 * review-with-no-verdict lands in the PR's `reviews` collection with reviewer
 * attribution, while this lands in `issues/{n}/comments` as ordinary
 * discussion. `mergeConversation` merges both for reading, so the only place
 * the difference is visible is the choice of which one to post — which is here.
 */
export function commentCommand(forge: Forge, number: number, body: string): string {
  return `gh pr comment ${number} ${repoFlag(forge)} --body ${shellQuote(body)}`;
}

/**
 * The flag each merge shape spells itself with.
 *
 * Total over `ForgeMergeMethod`, and never defaulted: `gh pr merge` with no
 * method flag drops into an interactive prompt on a tty, and the login shell
 * these run in is convincing enough that it would hang until the timeout killed
 * it. The contract refuses a method-less request for that reason and this map is
 * the other half of it.
 */
const MERGE_FLAG: Record<ForgeMergeMethod, string> = {
  merge: '--merge',
  squash: '--squash',
  rebase: '--rebase',
};

/**
 * `gh pr merge <n> --repo … --merge|--squash|--rebase`
 *
 * No `--delete-branch`, and that absence is deliberate. Deleting the head
 * branch is a second destructive act with its own blast radius — a contributor's
 * fork branch, or one someone else still has checked out — and folding it into
 * the merge would mean a confirm dialog that counts commits while quietly also
 * removing a ref. If the app grows that, it grows its own control and its own
 * sentence in the confirm.
 */
export function mergeCommand(forge: Forge, number: number, method: ForgeMergeMethod): string {
  return `gh pr merge ${number} ${repoFlag(forge)} ${MERGE_FLAG[method]}`;
}

/**
 * `gh pr edit <n> --repo … --add-reviewer a --add-reviewer b`
 *
 * Repeated flags rather than one comma-joined value. `gh` accepts both, but a
 * comma-joined list makes the quoting carry a separator the far side has to
 * re-split, on the assumption that a login can never contain a comma — which is
 * true today and is exactly the kind of reasoning that stops being true one API
 * version later. One flag per reviewer has no such assumption in it.
 *
 * "Re-request" and "request" are the same call: GitHub has no separate verb for
 * asking again, and adding a reviewer who is already requested re-asks them
 * rather than erroring.
 */
export function requestReviewCommand(forge: Forge, number: number, reviewers: string[]): string {
  const flags = reviewers.map((login) => ` --add-reviewer ${shellQuote(login)}`).join('');
  return `gh pr edit ${number} ${repoFlag(forge)}${flags}`;
}

/**
 * `gh pr ready <n> --repo …`
 *
 * One-directional on purpose. `gh pr ready --undo` exists and would turn a ready
 * PR back into a draft; the app does not offer it, because the control that
 * raised this is a button that disappears once the PR is no longer a draft, and
 * a hidden path back would be a state change with no affordance.
 */
export function readyCommand(forge: Forge, number: number): string {
  return `gh pr ready ${number} ${repoFlag(forge)}`;
}

/**
 * `gh run rerun <id> --repo … [--failed]`
 *
 * The run id is `shellQuote`d even though the schema has already constrained it
 * to digits — the same belt-and-braces the read side applies, and for the same
 * reason: the guard that stops a value being a command is the quoting, and the
 * schema is what stops it being a value that could not exist.
 */
export function rerunCommand(forge: Forge, runId: string, failedOnly: boolean): string {
  return `gh run rerun ${shellQuote(runId)} ${repoFlag(forge)}${failedOnly ? ' --failed' : ''}`;
}

/**
 * Run one CLI write, and report it the way every forge call reports itself.
 *
 * The probe comes first because a signed-out `gh` fails with a message about
 * authentication that is true but unhelpful — the UI has a better sentence for
 * that state, and this is where it gets the chance to use it.
 *
 * Unlike `apiPost`, this does NOT call `invalidateGhProbe` on failure. That call
 * exists so a listing that failed on a stale credential re-probes; a *write*
 * that failed may well have failed on a permission the user genuinely lacks
 * (approving your own PR, merging without write access), and dropping the probe
 * cache on every such refusal would mean two extra shell spawns each time
 * someone is told no.
 */
async function runWrite(command: string): Promise<ForgeWriteResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return notReady(cli);

  const result = await runInShell(command, WRITE_TIMEOUT_MS);
  if (result.exitCode === 0) return { cli, ok: true, error: null };
  return { cli, ok: false, error: describeFailure(result.output) };
}

/** Submit a review: approve, request changes, or comment. */
export function reviewPull(
  forge: Forge,
  number: number,
  event: ForgeReviewEvent,
  body: string,
): Promise<ForgeWriteResult> {
  return runWrite(reviewCommand(forge, number, event, body));
}

/** Post a top-level conversation comment. */
export function commentPull(forge: Forge, number: number, body: string): Promise<ForgeWriteResult> {
  return runWrite(commentCommand(forge, number, body));
}

/** Merge the pull request. The renderer confirms before this is ever reached. */
export function mergePull(
  forge: Forge,
  number: number,
  method: ForgeMergeMethod,
): Promise<ForgeWriteResult> {
  return runWrite(mergeCommand(forge, number, method));
}

/** Ask one or more logins for a review. */
export function requestReview(
  forge: Forge,
  number: number,
  reviewers: string[],
): Promise<ForgeWriteResult> {
  return runWrite(requestReviewCommand(forge, number, reviewers));
}

/** Take a draft pull request out of draft. */
export function markReady(forge: Forge, number: number): Promise<ForgeWriteResult> {
  return runWrite(readyCommand(forge, number));
}

/** Re-run a workflow run — every job, or only the failed ones. */
export function rerunChecks(
  forge: Forge,
  runId: string,
  failedOnly: boolean,
): Promise<ForgeWriteResult> {
  return runWrite(rerunCommand(forge, runId, failedOnly));
}

/*
  ─── Theme G: comment, and close/reopen — two writes and only two ──────────
*/

/**
 * `gh issue comment <n> --repo … --body …`
 *
 * The issue-numbered twin of `commentCommand` above, and there is no
 * `gh issue review`-shaped alternative to disambiguate from the way
 * `commentCommand`'s own doc comment has to for pull requests: an issue has
 * no review concept, so every comment on it is unambiguously discussion.
 */
export function issueCommentCommand(forge: Forge, number: number, body: string): string {
  return `gh issue comment ${number} ${repoFlag(forge)} --body ${shellQuote(body)}`;
}

/**
 * `gh issue close <n> --repo …` / `gh issue reopen <n> --repo …`
 *
 * Two subcommands, not one with a flag — `gh` itself has no `gh issue edit
 * --state`, so the target `state` in the request picks which of the two verbs
 * this builds. Neither takes `--comment`: a closing or reopening note is a
 * second write bundled into this one, and the composer above already covers
 * "say something about this issue" as its own action.
 */
export function issueSetStateCommand(forge: Forge, number: number, state: 'open' | 'closed'): string {
  const verb = state === 'closed' ? 'close' : 'reopen';
  return `gh issue ${verb} ${number} ${repoFlag(forge)}`;
}

/** Post a top-level comment on an issue's conversation. */
export function commentIssue(forge: Forge, number: number, body: string): Promise<ForgeWriteResult> {
  return runWrite(issueCommentCommand(forge, number, body));
}

/** Close or reopen an issue. */
export function setIssueState(
  forge: Forge,
  number: number,
  state: 'open' | 'closed',
): Promise<ForgeWriteResult> {
  return runWrite(issueSetStateCommand(forge, number, state));
}
