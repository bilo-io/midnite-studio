import type { Forge } from '@midnite/git-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addReviewComment,
  describeApiFailure,
  replyToReviewComment,
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
 * `runInShell` is mocked and everything else in `gh-cli` is real — `shellQuote`
 * especially. Stubbing the quoting would make these tests agree with themselves
 * about escaping rather than with the function that does it.
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

vi.mock('./gh-cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-cli')>();
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
