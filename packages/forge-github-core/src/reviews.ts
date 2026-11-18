import { ForgeReviewThreadSchema, type ForgePull, type ForgeReviewThread } from '@midnite/studio-shared';

import { asPositiveInt, asString, pick } from './json';

/**
 * Inline review thread documents and parsers (moved from forge main's `gh-graphql.ts`, Phase 146 Theme D).
 * REST cannot answer "is this thread resolved, and what is its node id", so threads are GraphQL. Parsers
 * take the parsed GraphQL `data` object.
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
export const THREAD_PAGE = 100;
export const REPLY_PAGE = 50;

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
export const reviewThreadsQuery = [
  'query($owner:String!,$name:String!,$number:Int!){',
  'repository(owner:$owner,name:$name){',
  'pullRequest(number:$number){',
  `reviewThreads(first:${THREAD_PAGE}){`,
  'nodes{',
  'id isResolved isOutdated path line originalLine startLine diffSide subjectType',
  `comments(first:${REPLY_PAGE}){nodes{id databaseId author{login} body createdAt url diffHunk pullRequestReview{databaseId}}}`,
  '}}}}}',
].join('');

/**
 * One alias per pull request — `p123: pullRequest(number:123){…}` — so a page
 * of rows costs one round trip. The numbers are spliced in rather than passed
 * as variables because a variable list cannot fan out into aliases; they come
 * from `gh`'s own listing and are positive integers by `ForgePullSchema`, so
 * there is nothing to escape.
 */
export function reviewCommentCountsQuery(numbers: readonly number[]): string {
  const fields = numbers
    .map(
      (number) =>
        `p${number}:pullRequest(number:${number}){` +
        `reviewThreads(first:${THREAD_PAGE}){nodes{comments{totalCount}}}}`,
    )
    .join(' ');
  return `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${fields}}}`;
}
/**
 * The aliased payload, as number → inline comment total. A PR the query could
 * not resolve comes back as a null alias and is simply absent from the map.
 */
export function parseReviewCommentCounts(data: unknown): Map<number, number> {
  const counts = new Map<number, number>();
  const repository = pick(data, 'repository');
  if (typeof repository !== 'object' || repository === null) return counts;

  for (const [alias, pull] of Object.entries(repository)) {
    const number = Number(alias.slice(1));
    if (!alias.startsWith('p') || !Number.isInteger(number)) continue;
    const nodes = pick(pick(pull, 'reviewThreads'), 'nodes');
    if (!Array.isArray(nodes)) continue;
    let total = 0;
    for (const node of nodes) {
      const count = pick(pick(node, 'comments'), 'totalCount');
      if (typeof count === 'number' && Number.isInteger(count) && count > 0) total += count;
    }
    counts.set(number, total);
  }
  return counts;
}

/** Adds each row's inline total to the issue-comment count it already has. */
export function withReviewComments(
  pulls: readonly ForgePull[],
  counts: ReadonlyMap<number, number>,
): ForgePull[] {
  return pulls.map((pull) => {
    const inline = counts.get(pull.number) ?? 0;
    return inline === 0 ? pull : { ...pull, commentCount: pull.commentCount + inline };
  });
}
/**
 * The GraphQL payload, as `ForgeReviewThread[]`.
 *
 * Separate from the call and exported for its tests, matching `gh-parse.ts`'s
 * shape: the parser is the part with edge cases, and it should be exercisable
 * against captured data with no subprocess anywhere.
 *
 * Takes the parsed `data` object, not a transport's text: a payload that is
 * absent or malformed degrades to "no threads" rather than throwing.
 */
export function parseReviewThreads(data: unknown): ForgeReviewThread[] {
  const nodes = threadNodes(data);
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
function threadNodes(data: unknown): unknown[] {
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

    const reviewDatabaseId = pick(row['pullRequestReview'], 'databaseId');

    comments.push({
      id,
      // Stringified because it is an integer that identifies a row, and every
      // other forge id in this contract is a string for the 2^53 reason.
      databaseId: typeof row['databaseId'] === 'number' ? String(row['databaseId']) : null,
      author: asString(pick(row['author'], 'login')) ?? '',
      body: asString(row['body']) ?? '',
      createdAt,
      url: asString(row['url']) ?? '',
      diffHunk: asString(row['diffHunk']) ?? '',
      // Stringified to equal the `id` of the `kind:'review'` comment parsePullReviews makes.
      reviewId:
        typeof reviewDatabaseId === 'number' ? String(reviewDatabaseId) : null,
    });
  }
  return comments;
}
