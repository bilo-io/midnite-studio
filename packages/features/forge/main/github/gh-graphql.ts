import {
  describeGraphqlFailure as describeGraphqlPayload,
  parseReviewCommentCounts,
  parseReviewThreads,
  reviewCommentCountsQuery,
  reviewThreadsQuery,
  withReviewComments,
} from '@midnite/forge-github-core';
import type {
  Forge,
  ForgePullScope,
  ForgePullsResult,
  ForgePullThreadsResult,
  ForgeReviewThread,
} from '@midnite/studio-shared';

import { listPulls } from './gh-cli';

import {
  apiHostFlag,
  describeFailure,
  ghStatus,
  invalidateGhProbe,
  LIST_TIMEOUT_MS,
  runInShell,
  shellQuote,
} from './gh-shell';

/**
 * The app's GraphQL reads, and why they have to be GraphQL.
 *
 * Every other forge read here goes through `gh`'s own REST-backed subcommands,
 * which is the right default: they are stable, they are what `gh` is for, and a
 * `--json` field list is easier to audit than a query document. Inline review
 * threads are the exception, because REST cannot answer the question — both the
 * threads themselves and, for the Reviews list, how many comments they hold.
 *
 * `GET pulls/{n}/comments` returns review comments as a **flat list**, chained
 * only by `in_reply_to_id`, and carries no thread object at all — so grouping
 * would have to be reconstructed here, and two facts would still be missing:
 * whether a thread is **resolved**, and the thread's **node id**, which is the
 * only handle `resolveReviewThread` accepts. Neither exists anywhere in REST.
 * `repository.pullRequest.reviewThreads` has both, already grouped, in one call.
 *
 * Kept in its own file rather than inside `gh-cli.ts` so the shape of that
 * file's contents stays "one `gh` subcommand per function". This is a query
 * document, which is a different kind of thing to maintain.
 */

/**
 * A pull request's inline review threads.
 *
 * Fails soft like every read in `gh-cli.ts`: a missing or signed-out `gh`
 * produces a reason code and an empty list, and a query error produces `gh`'s
 * own text. What it never does is report "no inline comments" for a pull request
 * nothing was able to ask about — the Files tab draws its comment gutters off
 * this, and an empty answer that means "we could not look" would hide real
 * discussion behind a UI that looks complete.
 */
export async function pullThreads(forge: Forge, number: number): Promise<ForgePullThreadsResult> {
  const cli = await ghStatus();
  if (cli.reason !== 'ready') return { cli, threads: [], error: null };

  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(reviewThreadsQuery)}` +
    // `-f`, not `-F`, for the two String! variables. `-F` guesses a type from
    // the text, so a repo legitimately named `2048` would be sent as an Int and
    // GraphQL would refuse the whole query on a variable type mismatch. `-F` is
    // right only for `number`, which really is an Int!.
    ` -f owner=${shellQuote(forge.owner)}` +
    ` -f name=${shellQuote(forge.repo)}` +
    ` -F number=${number}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);

  /*
    The exit code, not the payload, decides success — the same trap
    `pullComments` documents. `gh api graphql` prints its `errors` array as
    perfectly valid JSON and exits non-zero; judging by "did it parse" would
    read a permission error as a pull request with no inline discussion.
  */
  if (result.exitCode !== 0) {
    invalidateGhProbe();
    return { cli, threads: [], error: describeGraphqlFailure(result.output) };
  }

  return { cli, threads: parseReviewThreadsFromStdout(result.output), error: null };
}

/**
 * A listing page, with each row's `commentCount` widened to include inline
 * review comments.
 *
 * `gh pr list --json comments` carries issue comments only, so a PR whose whole
 * discussion happened on the diff would show no bubble at all. The inline half
 * is one aliased GraphQL query for the whole page — not one per row — run only
 * here, for the Reviews list, rather than inside `gh-cli.ts`'s `listPulls`,
 * which the poller, the MCP tools and the trigger scheduler also call and
 * which none of them need counts from.
 *
 * Fails soft to the issue-comment counts already on the rows: a count that is
 * slightly low is a better outcome than a list that failed to load.
 */
export async function listPullsWithReviewComments(
  forge: Forge,
  options: {
    limit: number;
    state: 'open' | 'closed' | 'merged' | 'all';
    scope?: ForgePullScope;
  },
): Promise<ForgePullsResult> {
  const result = await listPulls(forge, options);
  if (result.pulls.length === 0) return result;

  const counts = await reviewCommentCounts(
    forge,
    result.pulls.map((pull) => pull.number),
  );
  if (counts === null) return result;
  return { ...result, pulls: withReviewComments(result.pulls, counts) };
}

/**
 * Inline review comments per pull request number, or null if the query failed.
 *
 * Counts every comment in every thread, resolved and outdated included —
 * GitHub's own list bubble counts them too. `THREAD_PAGE` caps the threads read
 * per PR, the same cap the detail view's thread reader uses.
 */
async function reviewCommentCounts(
  forge: Forge,
  numbers: readonly number[],
): Promise<Map<number, number> | null> {
  const command =
    `gh api graphql${apiHostFlag(forge)}` +
    ` -f query=${shellQuote(reviewCommentCountsQuery(numbers))}` +
    // `-f` for both, for the same reason `pullThreads` gives.
    ` -f owner=${shellQuote(forge.owner)}` +
    ` -f name=${shellQuote(forge.repo)}`;

  const result = await runInShell(command, LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) return null;
  return parseReviewCommentCountsFromStdout(result.output);
}

/**
 * What went wrong, in GraphQL's own words, read out of `gh`'s combined output.
 *
 * The message extraction lives in `@midnite/forge-github-core` (`describeGraphqlFailure`, shared with
 * mobile); this wrapper is the `gh`-specific half. On a query error `gh api graphql` prints the
 * `{"errors":[…]}` body to stdout and its own `gh: <message>` line to stderr with nothing between them,
 * so the one informative line begins with `{`, which `describeFailure` skips by design. The payload is
 * located with `firstJsonObject`, and `describeFailure` stays the fallback for the cases with no payload
 * at all: a network failure, a killed subprocess, a shell that could not find `gh`.
 */
export function describeGraphqlFailure(output: string): string {
  return describeGraphqlPayload(firstJsonObject(output), describeFailure(output));
}

/** `parseReviewThreads` over `gh`'s stdout: a non-JSON payload (shell banner) degrades to no threads. */
export function parseReviewThreadsFromStdout(output: string): ForgeReviewThread[] {
  return parseReviewThreads(pick(firstJsonObject(output), 'data'));
}

/** `parseReviewCommentCounts` over `gh`'s stdout. */
export function parseReviewCommentCountsFromStdout(output: string): Map<number, number> {
  return parseReviewCommentCounts(pick(firstJsonObject(output), 'data'));
}

/**
 * The first JSON object in `output`, ignoring whatever surrounds it.
 *
 * Two kinds of noise, one on each side, and both are real rather than
 * hypothetical. Before: a login shell that greets on stdout, which is why
 * `parseJsonPayload` in `gh-parse.ts` seeks to the opening brace. **After: `gh`
 * itself.** On a query error it prints the `{"errors":[…]}` body to stdout and
 * its own `gh: <message>` line to stderr, and in the combined stream the two are
 * adjacent with no newline — so slicing from the brace to the end of the string
 * and parsing that fails on the trailing prose, which is exactly the payload
 * `describeGraphqlFailure` needs to read.
 *
 * So the object's end is found rather than assumed: brace depth, with string
 * literals and their escapes skipped, because a `}` inside a comment body is a
 * `}` in the text and not a closing brace.
 */
function firstJsonObject(output: string): unknown {
  const start = output.indexOf('{');
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let at = start; at < output.length; at += 1) {
    const char = output[at];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(output.slice(start, at + 1));
        } catch {
          return undefined;
        }
      }
    }
  }

  // Unbalanced — a truncated payload. Nothing to read, and guessing at where it
  // was cut would be reading half an answer as a whole one.
  return undefined;
}

const pick = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
