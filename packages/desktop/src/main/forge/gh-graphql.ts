import {
  ForgeReviewThreadSchema,
  type Forge,
  type ForgePullThreadsResult,
  type ForgeReviewThread,
} from '@midnite/git-shared';

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
 * The one GraphQL read in the app, and why it has to be one.
 *
 * Every other forge read here goes through `gh`'s own REST-backed subcommands,
 * which is the right default: they are stable, they are what `gh` is for, and a
 * `--json` field list is easier to audit than a query document. Inline review
 * threads are the exception, because REST cannot answer the question.
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
 * How many threads and replies are worth reading in a git client.
 *
 * The same judgement `CONVERSATION_PAGE` makes for the top-level thread: a pull
 * request with more than a hundred inline threads is one whose review belongs in
 * a browser, and `--paginate` on a GraphQL connection is several sequential
 * round trips for discussion nobody scrolls to in this pane. Fifty replies deep
 * in a single thread is past the point of an inline panel.
 */
const THREAD_PAGE = 100;
const REPLY_PAGE = 50;

/**
 * The query, as one line.
 *
 * Newlines are legal in a GraphQL document but this string is spliced into a
 * shell command line, and a single-quoted multi-line argument is one stray
 * quote away from a very confusing failure. One line, single-quoted by
 * `shellQuote`, is the version with no edge cases.
 *
 * The field list is deliberately narrow. `line` / `originalLine` / `startLine`
 * are three fields for one position because a thread can lose its anchor — see
 * `ForgeReviewThread`'s note. `databaseId` on the comment is what a reply needs
 * and `id` is what a resolve needs, which is why both are asked for.
 */
const THREADS_QUERY = [
  'query($owner:String!,$name:String!,$number:Int!){',
  'repository(owner:$owner,name:$name){',
  'pullRequest(number:$number){',
  `reviewThreads(first:${THREAD_PAGE}){`,
  'nodes{',
  'id isResolved isOutdated path line originalLine startLine diffSide subjectType',
  `comments(first:${REPLY_PAGE}){nodes{id databaseId author{login} body createdAt url}}`,
  '}}}}}',
].join('');

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
    ` -f query=${shellQuote(THREADS_QUERY)}` +
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

  return { cli, threads: parseReviewThreads(result.output), error: null };
}

/**
 * What went wrong, in GraphQL's own words.
 *
 * `describeFailure` cannot answer this one, and the reason is a real quirk
 * rather than an oversight: on a query error `gh api graphql` prints the
 * `{"errors":[…]}` body to stdout and its own `gh: <message>` line to stderr,
 * and the two arrive in the combined stream with nothing between them — so the
 * one informative line begins with `{`, which `describeFailure` skips by design
 * (that skip is what keeps a 400KB `--json` payload out of a sidebar note).
 *
 * So the message is read out of the payload where it actually lives, and
 * `describeFailure` stays the fallback for the cases with no payload at all: a
 * network failure, a killed subprocess, a shell that could not find `gh`.
 */
export function describeGraphqlFailure(output: string): string {
  const errors = pick(firstJsonObject(output), 'errors');
  if (Array.isArray(errors)) {
    const message = errors
      .map((entry) => asString(pick(entry, 'message')))
      .find((text): text is string => text !== null && text.length > 0);
    if (message !== undefined) {
      return message.length > GRAPHQL_MESSAGE_MAX
        ? `${message.slice(0, GRAPHQL_MESSAGE_MAX)}\u2026`
        : message;
    }
  }
  return describeFailure(output);
}

/** The same ceiling `describeFailure` applies, and for the same reason. */
const GRAPHQL_MESSAGE_MAX = 300;

/**
 * The GraphQL payload, as `ForgeReviewThread[]`.
 *
 * Separate from the call and exported for its tests, matching `gh-parse.ts`'s
 * shape: the parser is the part with edge cases, and it should be exercisable
 * against captured output with no subprocess anywhere.
 *
 * Takes the raw text rather than a parsed object because that is what the
 * caller has, and because a payload that is not JSON at all — a shell banner, a
 * network error page — has to degrade to "no threads" here rather than throw
 * inside an IPC handler.
 */
export function parseReviewThreads(output: string): ForgeReviewThread[] {
  const nodes = threadNodes(output);
  const threads: ForgeReviewThread[] = [];

  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const id = asString(row['id']);
    const path = asString(row['path']);
    // No id means nothing can be resolved against it; no path means it cannot
    // be anchored to a file. Either way there is nothing to render.
    if (id === null || path === null) continue;

    const comments = parseThreadComments(row['comments']);
    /*
      A thread with no comments is not a thread.

      It happens: GraphQL returns the thread node for a comment the token
      cannot read, and `comments.nodes` comes back empty. Rendering it would
      put an empty panel and a resolve button on a line for no visible reason.
    */
    if (comments.length === 0) continue;

    const subjectType = asString(row['subjectType']);
    const parsed = ForgeReviewThreadSchema.safeParse({
      id,
      path,
      line: asPositiveInt(row['line']),
      originalLine: asPositiveInt(row['originalLine']),
      startLine: asPositiveInt(row['startLine']),
      // `LEFT` is read but never written — see `ForgeThreadSide`. An unknown
      // value falls to the schema default rather than dropping the thread.
      side: asString(row['diffSide']) === 'LEFT' ? 'LEFT' : 'RIGHT',
      resolved: row['isResolved'] === true,
      outdated: row['isOutdated'] === true,
      fileLevel: subjectType === 'FILE',
      comments,
    });
    if (parsed.success) threads.push(parsed.data);
  }

  return threads;
}

/**
 * Walk to `reviewThreads.nodes`, or give up quietly.
 *
 * Every level is optional because every level can legitimately be absent: a
 * repository the token cannot see makes `repository` null, a deleted PR makes
 * `pullRequest` null, and an `errors`-only response has no `data` at all. The
 * caller has already decided by exit code whether this was a failure, so the
 * job here is only to find the array if it is there.
 */
function threadNodes(output: string): unknown[] {
  const data = pick(firstJsonObject(output), 'data');
  const repository = pick(data, 'repository');
  const pullRequest = pick(repository, 'pullRequest');
  const reviewThreads = pick(pullRequest, 'reviewThreads');
  const nodes = pick(reviewThreads, 'nodes');
  return Array.isArray(nodes) ? nodes : [];
}

function parseThreadComments(payload: unknown): Record<string, unknown>[] {
  const nodes = pick(payload, 'nodes');
  if (!Array.isArray(nodes)) return [];

  const comments: Record<string, unknown>[] = [];
  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;

    const id = asString(row['id']);
    const createdAt = asString(row['createdAt']);
    // Same rule `parseIssueComments` follows: no timestamp means no place in an
    // ordered thread, and an empty-string fallback would sort it first.
    if (id === null || createdAt === null) continue;

    comments.push({
      id,
      // Stringified because it is an integer that identifies a row, and every
      // other forge id in this contract is a string for the 2^53 reason.
      databaseId: typeof row['databaseId'] === 'number' ? String(row['databaseId']) : null,
      author: asString(pick(row['author'], 'login')) ?? '',
      body: asString(row['body']) ?? '',
      createdAt,
      url: asString(row['url']) ?? '',
    });
  }
  return comments;
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

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * A line number, or null.
 *
 * `line` is genuinely null on an outdated thread and `startLine` is null on
 * every single-line one, so null is the common case rather than a fault. Zero
 * and negatives are rejected rather than passed through: they are not line
 * numbers, and the schema would reject them one layer later anyway.
 */
const asPositiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
