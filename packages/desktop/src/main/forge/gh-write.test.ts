import type { Forge } from '@midnite/git-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCommitSample } from './gh-parse';
import {
  addReviewComment,
  commentCommand,
  describeApiFailure,
  mergeCommand,
  readyCommand,
  replyToReviewComment,
  requestReviewCommand,
  rerunCommand,
  reviewCommand,
  setThreadResolved,
} from './gh-write';

/**
 * The write module's command construction, with no subprocess anywhere.
 *
 * This is the file where being wrong is most expensive: every function here
 * changes state on somebody's pull request, and the two things that can go
 * wrong quietly are the *anchor* (a comment on the wrong line) and the
 * *quoting* (an owner or repo out of a `.git/config` reaching a shell). Both
 * are visible in the command line, so the command line is what is asserted.
 *
 * `runInShell` is mocked and everything else in `gh-shell` is real —
 * `shellQuote` especially. Stubbing the quoting would make these tests agree
 * with themselves about escaping rather than with the function that does it.
 *
 * The Themes F and G half at the bottom needs no mock at all: those commands are
 * built by pure functions and asserted as strings.
 */

/*
  `vi.hoisted`, not a bare `vi.fn()` at module scope.

  `vi.mock` is hoisted above the imports, so its factory runs before any
  module-level `const` has been initialised — referencing one from inside the
  factory throws. `vi.hoisted` lifts the spy with it, which is what lets the
  module under test be a plain static import rather than a top-level `await
  import`. (That matters here beyond style: desktop's tsconfig `module` setting
  rejects top-level await outright, so the awaited form typechecks red while
  passing under vitest.)
*/
const { runInShell } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{
      output: string;
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }>
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

const FORGE: Forge = { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' };

const ok = { output: '{}', stdout: '{}', stderr: '', exitCode: 0 };
const fail = (output: string) => ({ output, stdout: output, stderr: output, exitCode: 1 });

/** The JSON body of the nth call, as parsed from its `printf %s '…'` prefix. */
function bodyOf(callIndex: number): unknown {
  const command = runInShell.mock.calls[callIndex]?.[0] ?? '';
  const match = /^printf %s '(.*)' \| gh api/s.exec(command);
  if (!match) throw new Error(`no printf body in: ${command}`);
  // Undo `shellQuote`'s single-quote escaping before parsing.
  return JSON.parse(match[1]!.replaceAll(`'\\''`, "'"));
}

beforeEach(() => {
  runInShell.mockReset();
});

describe('addReviewComment', () => {
  const request = {
    number: 42,
    commitId: 'a'.repeat(40),
    path: 'src/app.tsx',
    line: 12,
    side: 'RIGHT' as const,
    position: 7,
    body: 'This reads better as a guard clause.',
  };

  it('posts the line-based anchor, and does not send position alongside it', async () => {
    runInShell.mockResolvedValue(ok);

    const result = await addReviewComment(FORGE, request);

    expect(result.ok).toBe(true);
    expect(runInShell).toHaveBeenCalledTimes(1);
    expect(runInShell.mock.calls[0]?.[0]).toContain(
      "gh api --method POST 'repos/bilo-io/midnite-git/pulls/42/comments'",
    );
    // The modern form only. Sending both would let GitHub choose which anchor
    // wins, and the two disagree the moment the diff is not the whole file.
    expect(bodyOf(0)).toEqual({
      body: request.body,
      commit_id: request.commitId,
      path: 'src/app.tsx',
      line: 12,
      side: 'RIGHT',
    });
  });

  it('sends the body as JSON on stdin, never as gh -f flags', async () => {
    runInShell.mockResolvedValue(ok);
    await addReviewComment(FORGE, request);

    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain('--input -');
    // `-f line=12` would post the string "12" and be rejected; `-F` would
    // coerce a body of "true" into a boolean. Neither may appear.
    expect(command).not.toMatch(/ -f \w+=/);
    expect(command).not.toMatch(/ -F \w+=/);
  });

  it('retries with the legacy position when the line anchor is refused', async () => {
    runInShell
      .mockResolvedValueOnce(
        fail('{"message":"Validation Failed","errors":[{"message":"line must be part of the diff"}]}'),
      )
      .mockResolvedValueOnce(ok);

    const result = await addReviewComment(FORGE, request);

    expect(result.ok).toBe(true);
    expect(runInShell).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).toEqual({
      body: request.body,
      commit_id: request.commitId,
      path: 'src/app.tsx',
      position: 7,
    });
  });

  it('does not retry a failure that was not about the anchor', async () => {
    // A stale token or a missing scope is not something a different anchor
    // fixes. Retrying would spend a second write against the rate limit and
    // report the second failure instead of the first.
    runInShell.mockResolvedValue(fail('{"message":"You must have write access to this repository"}'));

    const result = await addReviewComment(FORGE, request);

    expect(runInShell).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('write access');
  });

  it('does not retry when the caller had no position to fall back to', async () => {
    runInShell.mockResolvedValue(fail('{"errors":[{"message":"line must be part of the diff"}]}'));
    const { position: _unused, ...withoutPosition } = request;

    await addReviewComment(FORGE, withoutPosition);

    expect(runInShell).toHaveBeenCalledTimes(1);
  });

  it('reports the second failure when both anchors are refused', async () => {
    runInShell.mockResolvedValue(fail('{"errors":[{"message":"position is invalid"}]}'));

    const result = await addReviewComment(FORGE, request);

    expect(runInShell).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('position is invalid');
  });

  it('quotes an owner and repo that came out of a .git/config', async () => {
    runInShell.mockResolvedValue(ok);
    await addReviewComment(
      { ...FORGE, owner: "o'; rm -rf /; echo '" },
      { ...request, position: undefined },
    );

    const command = runInShell.mock.calls[0]?.[0] ?? '';
    // Every quote is closed, escaped and reopened — the shell sees one argument.
    expect(command).toContain(`'repos/o'\\''; rm -rf /; echo '\\''/midnite-git/pulls/42/comments'`);
  });

  it('adds --hostname for an enterprise host, and not for github.com', async () => {
    runInShell.mockResolvedValue(ok);

    await addReviewComment(FORGE, { ...request, position: undefined });
    expect(runInShell.mock.calls[0]?.[0]).not.toContain('--hostname');

    await addReviewComment({ ...FORGE, host: 'github.acme.dev' }, { ...request, position: undefined });
    expect(runInShell.mock.calls[1]?.[0]).toContain("--hostname 'github.acme.dev'");
  });
});

describe('replyToReviewComment', () => {
  it('posts to the replies endpoint of the comment it was given', async () => {
    runInShell.mockResolvedValue(ok);

    const result = await replyToReviewComment(FORGE, {
      number: 42,
      commentId: '2345678',
      body: 'Agreed.',
    });

    expect(result.ok).toBe(true);
    expect(runInShell.mock.calls[0]?.[0]).toContain(
      "'repos/bilo-io/midnite-git/pulls/42/comments/2345678/replies'",
    );
    // The reply endpoint takes a body and nothing else — no anchor, because the
    // thread it lands in already has one.
    expect(bodyOf(0)).toEqual({ body: 'Agreed.' });
  });
});

describe('setThreadResolved', () => {
  it('sends the resolve mutation with the thread node id', async () => {
    runInShell.mockResolvedValue(ok);

    const result = await setThreadResolved(FORGE, { threadId: 'PRRT_kwDO', resolved: true });

    expect(result.ok).toBe(true);
    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain('gh api graphql');
    expect(command).toContain('resolveReviewThread(input:{threadId:$threadId})');
    // `-f`, not `-F`: the variable is an `ID!`, and `-F` type-guesses.
    expect(command).toContain("-f threadId='PRRT_kwDO'");
    expect(command).not.toContain('-F threadId=');
  });

  it('sends the unresolve mutation when reopening', async () => {
    runInShell.mockResolvedValue(ok);
    await setThreadResolved(FORGE, { threadId: 'PRRT_kwDO', resolved: false });

    expect(runInShell.mock.calls[0]?.[0]).toContain('unresolveReviewThread');
  });

  it('reports the GraphQL error message, not a generic sentence', async () => {
    runInShell.mockResolvedValue(
      fail('{"errors":[{"message":"Could not resolve to a node with the global id of \'x\'"}]}'),
    );

    const result = await setThreadResolved(FORGE, { threadId: 'x', resolved: true });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('global id');
  });
});

describe('describeApiFailure', () => {
  it('joins the summary and the field-level message', () => {
    // Neither half is enough alone: "Validation Failed" says nothing, and the
    // field line alone loses that it was a validation error.
    expect(
      describeApiFailure(
        '{"message":"Validation Failed","errors":[{"message":"body is too long (maximum is 65536 characters)"}]}',
      ),
    ).toBe('Validation Failed — body is too long (maximum is 65536 characters)');
  });

  it('uses the summary alone when there is no errors array', () => {
    expect(describeApiFailure('{"message":"Not Found"}')).toBe('Not Found');
  });

  it('falls back to the line scan for output that is not JSON', () => {
    expect(describeApiFailure('gh: error connecting to api.github.com')).toMatch(/error connecting/);
  });
});

/*
  ─── Themes F and G: the command line itself ────────────────────────────────

  The assertions below are deliberately about the exact string, not about a
  parsed shape: this is the one module in the app that changes someone else's
  data, and the failure modes worth catching are all textual — a verb that
  becomes a value, a body that breaks out of its quoting, a `--failed` that
  appears when nobody asked for it, a method flag omitted so `gh` drops into an
  interactive prompt and hangs. None of those are visible in a mock's
  arguments; all of them are visible here.

  No `vi.mock` is needed for any of it, which is the reward for splitting
  command construction from the spawn.
*/

const forge: Forge = { kind: 'github', host: 'github.com', owner: 'bilo-io', repo: 'midnite-git' };
const enterprise: Forge = { kind: 'github', host: 'ghe.example.com', owner: 'acme', repo: 'app' };

describe('reviewCommand', () => {
  it('spells each event as its own flag, not as a value', () => {
    expect(reviewCommand(forge, 7, 'APPROVE', '')).toBe(
      "gh pr review 7 --repo 'bilo-io/midnite-git' --approve",
    );
    expect(reviewCommand(forge, 7, 'REQUEST_CHANGES', 'needs work')).toBe(
      "gh pr review 7 --repo 'bilo-io/midnite-git' --request-changes --body 'needs work'",
    );
    expect(reviewCommand(forge, 7, 'COMMENT', 'looks fine')).toBe(
      "gh pr review 7 --repo 'bilo-io/midnite-git' --comment --body 'looks fine'",
    );
  });

  it('omits --body entirely for a bare approval', () => {
    // Not `--body ''`: gh accepts that and publishes an approval carrying an
    // empty comment, which is not what "approve with nothing to add" means.
    expect(reviewCommand(forge, 1, 'APPROVE', '   ')).not.toContain('--body');
  });

  it('renders a hostile body as one inert argument', () => {
    const body = "'; rm -rf ~; echo '";
    const command = reviewCommand(forge, 1, 'COMMENT', body);
    // Every `'` the body carried is closed, escaped and reopened, so nothing in
    // it can end the quoting and become a second command.
    expect(command).toBe(
      `gh pr review 1 --repo 'bilo-io/midnite-git' --comment --body ` +
        `''\\''; rm -rf ~; echo '\\'''`,
    );
    expect(command.split(' --body ')[1]?.startsWith("'")).toBe(true);
  });

  it('keeps a multi-line body in one argument', () => {
    const command = reviewCommand(forge, 2, 'COMMENT', 'line one\nline two');
    expect(command).toContain("--body 'line one\nline two'");
  });

  it('host-qualifies --repo for GitHub Enterprise', () => {
    expect(reviewCommand(enterprise, 3, 'APPROVE', '')).toContain(
      "--repo 'ghe.example.com/acme/app'",
    );
  });
});

describe('commentCommand', () => {
  it('posts a discussion comment, not a verdict-less review', () => {
    // `gh pr comment`, not `gh pr review --comment` — different collections,
    // different attribution. See the doc comment on commentCommand.
    expect(commentCommand(forge, 12, 'ping')).toBe(
      "gh pr comment 12 --repo 'bilo-io/midnite-git' --body 'ping'",
    );
  });
});

describe('mergeCommand', () => {
  it('always carries a method flag', () => {
    // A method-less `gh pr merge` prompts interactively, and the login shell
    // these run in is tty-ish enough that it would hang until the timeout.
    for (const method of ['merge', 'squash', 'rebase'] as const) {
      expect(mergeCommand(forge, 9, method)).toBe(
        `gh pr merge 9 --repo 'bilo-io/midnite-git' --${method}`,
      );
    }
  });

  it('never deletes the head branch', () => {
    // A second destructive act with its own blast radius; deliberately absent.
    expect(mergeCommand(forge, 9, 'squash')).not.toContain('--delete-branch');
  });
});

describe('requestReviewCommand', () => {
  it('repeats the flag rather than comma-joining logins', () => {
    expect(requestReviewCommand(forge, 4, ['octocat', 'hubot'])).toBe(
      "gh pr edit 4 --repo 'bilo-io/midnite-git' --add-reviewer 'octocat' --add-reviewer 'hubot'",
    );
  });

  it('quotes each login on its own', () => {
    expect(requestReviewCommand(forge, 4, ['a-b'])).toContain("--add-reviewer 'a-b'");
  });
});

describe('readyCommand', () => {
  it('has no --undo path', () => {
    const command = readyCommand(forge, 5);
    expect(command).toBe("gh pr ready 5 --repo 'bilo-io/midnite-git'");
    expect(command).not.toContain('--undo');
  });
});

describe('rerunCommand', () => {
  it('adds --failed only when asked', () => {
    expect(rerunCommand(forge, '123456', false)).toBe(
      "gh run rerun '123456' --repo 'bilo-io/midnite-git'",
    );
    expect(rerunCommand(forge, '123456', true)).toBe(
      "gh run rerun '123456' --repo 'bilo-io/midnite-git' --failed",
    );
  });
});

/**
 * The merge confirm's number, at its source.
 *
 * Lives in this file rather than beside the other parsers because it exists for
 * one caller — the blast radius on the one irreversible write above — and the
 * property that matters is not "it parses" but "the count is exact even though
 * the sample is capped". A test that only checked the sample would pass while
 * the dialog under-reported what a merge was about to do.
 */
describe('parseCommitSample', () => {
  const commit = (oid: string, headline: string) => ({
    oid,
    messageHeadline: headline,
    messageBody: 'body text nobody renders',
    authors: [{ login: 'octocat' }],
  });

  it('returns the newest commits first', () => {
    // `gh` sends them oldest-first; a branch is recognised by its newest tip.
    const sample = parseCommitSample([commit('a1', 'first'), commit('b2', 'second')]);
    expect(sample).toEqual([
      { sha: 'b2', subject: 'second' },
      { sha: 'a1', subject: 'first' },
    ]);
  });

  it('caps the sample at PULL_COMMIT_SAMPLE', () => {
    const many = Array.from({ length: 40 }, (_, i) => commit(`sha${i}`, `subject ${i}`));
    expect(parseCommitSample(many)).toHaveLength(5);
    // Newest first means the cap keeps the tip, not the root.
    expect(parseCommitSample(many)[0]).toEqual({ sha: 'sha39', subject: 'subject 39' });
  });

  it('drops rows with no sha rather than inventing one', () => {
    expect(parseCommitSample([{ messageHeadline: 'orphan' }, commit('c3', 'kept')])).toEqual([
      { sha: 'c3', subject: 'kept' },
    ]);
  });

  it('answers empty for anything that is not an array', () => {
    expect(parseCommitSample(undefined)).toEqual([]);
    expect(parseCommitSample(null)).toEqual([]);
    expect(parseCommitSample('nope')).toEqual([]);
  });
});
