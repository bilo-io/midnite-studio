import type { Forge, ForgeWriteResult } from '@midnite/git-shared';

import {
  apiHostFlag,
  describeFailure,
  ghStatus,
  invalidateGhProbe,
  LIST_TIMEOUT_MS,
  runInShell,
  shellQuote,
  slug,
} from './gh-cli';
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
