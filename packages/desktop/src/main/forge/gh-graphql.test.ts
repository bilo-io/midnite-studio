import type { Forge } from '@midnite/git-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { describeGraphqlFailure, parseReviewThreads, pullThreads } from './gh-graphql';

/*
  `runInShell` mocked, the rest of `gh-shell` real — the same arrangement
  `gh-write.test.ts` documents, and for the same reason: `shellQuote` is half of
  what these assertions are about, so stubbing it would only prove the test
  agrees with itself about escaping.
*/
const { runInShell } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{ output: string; stdout: string; stderr: string; exitCode: number | null }>
  >(),
}));

vi.mock('./gh-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-shell')>();
  return {
    ...actual,
    runInShell,
    ghStatus: vi.fn(async () => ({ reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' })),
    invalidateGhProbe: vi.fn(),
  };
});

/**
 * The GraphQL thread reader, against payloads shaped like `gh api graphql`'s.
 *
 * Field names and nesting here are copied from a real response — verified
 * against `cli/cli#14200`, which carries two threads on two files, one of them
 * a two-comment reply chain. That matters: a fixture invented from the schema
 * docs would not have caught that `diffSide` lives on the thread and not on the
 * comment, which is the first thing the spike got wrong.
 */

const thread = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PRRT_kwDODKw3uc6ai8rw',
  isResolved: false,
  isOutdated: false,
  path: 'internal/gh/gh.go',
  line: 111,
  originalLine: 111,
  startLine: null,
  diffSide: 'RIGHT',
  subjectType: 'LINE',
  comments: {
    nodes: [
      {
        id: 'PRRC_kwDODKw3uc6ai8rw',
        databaseId: 2_345_678,
        author: { login: 'babakks' },
        body: '**nitpick:** the `Retry-After` header is the number of seconds.',
        createdAt: '2026-08-20T10:00:00Z',
        url: 'https://github.com/cli/cli/pull/14200#discussion_r2345678',
      },
    ],
  },
  ...over,
});

const payload = (threads: Record<string, unknown>[]): string =>
  JSON.stringify({
    data: { repository: { pullRequest: { reviewThreads: { nodes: threads } } } },
  });

describe('parseReviewThreads', () => {
  it('reads a thread with its anchor, its flags and its comments', () => {
    const [parsed] = parseReviewThreads(payload([thread()]));

    expect(parsed).toMatchObject({
      id: 'PRRT_kwDODKw3uc6ai8rw',
      path: 'internal/gh/gh.go',
      line: 111,
      originalLine: 111,
      startLine: null,
      side: 'RIGHT',
      resolved: false,
      outdated: false,
      fileLevel: false,
    });
    expect(parsed?.comments).toHaveLength(1);
    expect(parsed?.comments[0]).toMatchObject({
      author: 'babakks',
      // Stringified: every forge id in this contract is a string, for the same
      // 2^53 reason `ForgeRun.id` states.
      databaseId: '2345678',
    });
  });

  it('keeps a multi-comment thread in the order GraphQL returned it', () => {
    const [parsed] = parseReviewThreads(
      payload([
        thread({
          comments: {
            nodes: [
              {
                id: 'a',
                databaseId: 1,
                author: { login: 'first' },
                body: 'one',
                createdAt: '2026-08-20T10:00:00Z',
              },
              {
                id: 'b',
                databaseId: 2,
                author: { login: 'second' },
                body: 'two',
                createdAt: '2026-08-20T11:00:00Z',
              },
            ],
          },
        }),
      ]),
    );

    expect(parsed?.comments.map((comment) => comment.author)).toEqual(['first', 'second']);
  });

  it('carries a null line through rather than substituting the original', () => {
    // The outdated case: GitHub nulls `line` and keeps `originalLine`. Filling
    // one from the other here is exactly how a comment gets pinned to code its
    // author never saw.
    const [parsed] = parseReviewThreads(
      payload([thread({ isOutdated: true, line: null, originalLine: 40 })]),
    );

    expect(parsed).toMatchObject({ outdated: true, line: null, originalLine: 40 });
  });

  it('marks a file-level thread rather than inventing a line for it', () => {
    const [parsed] = parseReviewThreads(
      payload([thread({ subjectType: 'FILE', line: null, originalLine: null })]),
    );

    expect(parsed).toMatchObject({ fileLevel: true, line: null });
  });

  it('reads a left-side thread, which is displayed but never written', () => {
    const [parsed] = parseReviewThreads(payload([thread({ diffSide: 'LEFT' })]));

    expect(parsed?.side).toBe('LEFT');
  });

  it('falls back to RIGHT for a side it does not recognise, keeping the thread', () => {
    // Dropping the thread would hide real discussion over an enum value; the
    // schema default is the safe read, since v1 only ever *writes* RIGHT.
    const [parsed] = parseReviewThreads(payload([thread({ diffSide: 'SOMETHING_NEW' })]));

    expect(parsed?.side).toBe('RIGHT');
  });

  it('drops a thread whose comments the token could not read', () => {
    // A thread node with an empty `comments.nodes` is what a permission gap
    // looks like. Rendering it would put an empty panel and a Resolve button on
    // a line for no visible reason.
    expect(parseReviewThreads(payload([thread({ comments: { nodes: [] } })]))).toEqual([]);
  });

  it('drops a comment with no timestamp, and the thread with it if that was all', () => {
    expect(
      parseReviewThreads(
        payload([thread({ comments: { nodes: [{ id: 'a', body: 'no createdAt' }] } })]),
      ),
    ).toEqual([]);
  });

  it('drops a thread with no id — nothing could be resolved against it', () => {
    const nodes = [thread()];
    delete nodes[0]!['id'];
    expect(parseReviewThreads(payload(nodes))).toEqual([]);
  });

  it('reads a null databaseId as no reply target rather than as a zero', () => {
    const [parsed] = parseReviewThreads(
      payload([
        thread({
          comments: {
            nodes: [{ id: 'a', author: { login: 'x' }, body: 'y', createdAt: '2026-01-01T00:00:00Z' }],
          },
        }),
      ]),
    );

    expect(parsed?.comments[0]?.databaseId).toBeNull();
  });

  it('seeks past a login shell banner to the payload', () => {
    expect(parseReviewThreads(`Welcome to zsh!\n${payload([thread()])}`)).toHaveLength(1);
  });

  it('answers empty for output that is not JSON at all', () => {
    expect(parseReviewThreads('gh: command not found')).toEqual([]);
  });

  it('answers empty when the repository or pull request came back null', () => {
    // Both are legitimate: a repo the token cannot see, or a deleted PR.
    expect(parseReviewThreads(JSON.stringify({ data: { repository: null } }))).toEqual([]);
    expect(
      parseReviewThreads(JSON.stringify({ data: { repository: { pullRequest: null } } })),
    ).toEqual([]);
  });

  it('rejects a zero or negative line rather than passing it on', () => {
    const [parsed] = parseReviewThreads(payload([thread({ line: 0, startLine: -3 })]));

    expect(parsed).toMatchObject({ line: null, startLine: null });
  });
});

describe('describeGraphqlFailure', () => {
  it('reads the message out of the errors array', () => {
    // The real shape: `gh api graphql` prints this to stdout and its own `gh: …`
    // line to stderr, and the two arrive with nothing between them — which is
    // why `describeFailure` alone cannot see past the leading brace.
    const output =
      '{"errors":[{"message":"Field \'diffSide\' doesn\'t exist on type \'PullRequestReviewComment\'"}]}' +
      "gh: Field 'diffSide' doesn't exist on type 'PullRequestReviewComment'";

    expect(describeGraphqlFailure(output)).toBe(
      "Field 'diffSide' doesn't exist on type 'PullRequestReviewComment'",
    );
  });

  it('falls back to the line scan when there is no payload', () => {
    expect(describeGraphqlFailure('error: could not resolve host api.github.com')).toMatch(
      /could not resolve host/,
    );
  });

  it('caps a very long message rather than putting it all in a note', () => {
    const long = 'x'.repeat(500);
    const described = describeGraphqlFailure(JSON.stringify({ errors: [{ message: long }] }));

    expect(described.length).toBeLessThan(320);
    expect(described.endsWith('…')).toBe(true);
  });
});

/**
 * How the query is handed to `gh`, which is a separate question from how its
 * answer is parsed — and the one place a *valid* query still fails.
 */
describe('pullThreads', () => {
  const forge = (over: Partial<Forge> = {}): Forge => ({
    host: 'github.com',
    owner: 'bilo-io',
    repo: 'midnite-git',
    kind: 'github',
    ...over,
  });

  beforeEach(() => {
    runInShell.mockReset();
    runInShell.mockResolvedValue({
      output: payload([thread()]),
      stdout: payload([thread()]),
      stderr: '',
      exitCode: 0,
    });
  });

  it('sends owner and name as strings, so a numerically-named repo still resolves', async () => {
    /*
      The bug this exists to prevent: `-F` guesses a type from the text, so
      `-F name=2048` sends the *integer* 2048 for a `String!` variable and
      GitHub rejects the entire query on a variable type mismatch — for a repo
      name that is neither unusual nor invalid (`gabrielecirulli/2048`).
      `number` is the only variable here that really is an Int!.
    */
    await pullThreads(forge({ owner: '123', repo: '2048' }), 42);

    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain("-f owner='123'");
    expect(command).toContain("-f name='2048'");
    expect(command).toContain('-F number=42');
    expect(command).not.toMatch(/-F (owner|name)=/);
  });

  it('quotes an owner and repo that came out of a .git/config', async () => {
    await pullThreads(forge({ owner: "o'brien", repo: 'a b' }), 7);

    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain(`-f owner='o'\\''brien'`);
    expect(command).toContain("-f name='a b'");
  });

  it('reads the threads back when the query succeeds', async () => {
    const result = await pullThreads(forge(), 42);

    expect(result.error).toBeNull();
    expect(result.threads).toHaveLength(1);
  });

  it('reports gh\'s own words when the query fails, and no threads', async () => {
    const output = JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository' }] });
    runInShell.mockResolvedValue({ output, stdout: output, stderr: '', exitCode: 1 });

    const result = await pullThreads(forge(), 42);

    // Never an empty list with a null error — that would read as "no inline
    // comments" for a pull request nothing was able to ask about.
    expect(result.threads).toEqual([]);
    expect(result.error).toMatch(/Could not resolve to a Repository/);
  });
});
