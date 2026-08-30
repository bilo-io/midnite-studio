import { describe, expect, it } from 'vitest';

import { DiagnosticsTrustStateSchema, commandFingerprint } from '../domain/diagnostics';
import { ForgeRunSchema } from '../domain/forge';
import {
  CalendarDaySchema,
  ContributorStatSchema,
  STATS_WINDOW_DAYS,
} from '../domain/stats';
import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
  metricsPresent,
} from '../domain/metrics';
import { COMMAND_IDS, DEFAULT_KEYMAP, GLOBAL_CHORDS, isCommandId } from '../keybindings';
import { CHANNELS, EVENT_CHANNELS } from './channels';
import * as schemas from './schemas';

describe('channels', () => {
  it('has no duplicate channel names', () => {
    // A duplicate is a silent cross-wiring: two handlers registered on one name
    // and whichever registered last wins.
    const all = [...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('namespaces every channel under mgit:', () => {
    for (const name of [...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]) {
      expect(name.startsWith('mgit:')).toBe(true);
    }
  });
});

describe('diagnostics contract', () => {
  const command = {
    command: '/repo/node_modules/.bin/eslint',
    args: ['.', '--format', 'json'],
    parser: 'eslint' as const,
    ecosystem: 'javascript' as const,
  };

  it('takes a repoId and nothing else on every verb but trust', () => {
    // Main resolves the checkout and reads the command from its own store. A
    // path or a command on these calls would make the renderer the thing that
    // decides what gets executed — see diag-handlers.ts.
    for (const schema of [
      schemas.DiagTrustStatusRequest,
      schemas.DiagUntrustRequest,
      schemas.DiagDetectRequest,
      schemas.DiagRunRequest,
    ]) {
      expect(Object.keys(schema.shape)).toEqual(['repoId']);
    }
  });

  it('carries the command only on trust, where it is what is being approved', () => {
    expect(Object.keys(schemas.DiagTrustRequest.shape).sort()).toEqual(['command', 'repoId']);
  });

  it('rejects a command with no executable', () => {
    expect(() =>
      schemas.DiagTrustRequest.parse({ repoId: 'r', command: { ...command, command: '' } }),
    ).toThrow();
  });

  it('rejects a parser this build cannot read', () => {
    // The gate that stops a proposal whose output would always be parse-failed.
    expect(() =>
      schemas.DiagTrustRequest.parse({ repoId: 'r', command: { ...command, parser: 'golangci' } }),
    ).toThrow();
  });

  it('fingerprints a command by its whole argument vector', () => {
    expect(commandFingerprint(command)).toBe(commandFingerprint({ ...command }));
    expect(commandFingerprint(command)).not.toBe(
      commandFingerprint({ ...command, args: [...command.args, '--fix'] }),
    );
  });

  it('cannot be fooled by re-splitting an argument', () => {
    // NUL-joined for the same reason the git parsers are: any printable
    // separator makes ['a b'] and ['a', 'b'] fingerprint alike, and this value
    // decides whether something executes.
    expect(commandFingerprint({ ...command, args: ['a b'] })).not.toBe(
      commandFingerprint({ ...command, args: ['a', 'b'] }),
    );
  });

  it('distinguishes a changed command from one never approved', () => {
    expect(DiagnosticsTrustStateSchema.options).toContain('command-changed');
    expect(DiagnosticsTrustStateSchema.options).toContain('untrusted');
  });

  it('makes every failure a reason code rather than a throw', () => {
    const parsed = schemas.DiagRunResponse.parse({
      ok: false,
      reason: 'untrusted',
      hint: 'not enabled',
    });
    expect(parsed.ok).toBe(false);
  });

  it('keeps counts and rows separable so a cap cannot understate the total', () => {
    const parsed = schemas.DiagRunResponse.parse({
      ok: true,
      errorCount: 900,
      warningCount: 100,
      rows: [],
      withheld: 1000,
      ranAt: 1,
      durationMs: 2,
    });
    expect(parsed.ok && parsed.errorCount).toBe(900);
  });
});

describe('tests contract', () => {
  it('takes a repoId and nothing else on discover', () => {
    expect(Object.keys(schemas.TestsDiscoverRequest.shape)).toEqual(['repoId']);
  });

  it('takes a repoId and a suiteId — never a command — on trustStatus, untrust, run and cancel', () => {
    for (const schema of [
      schemas.TestsTrustStatusRequest,
      schemas.TestsUntrustRequest,
      schemas.TestsRunRequest,
    ]) {
      expect(Object.keys(schema.shape).sort()).toEqual(['repoId', 'suiteId']);
    }
    expect(Object.keys(schemas.TestsCancelRequest.shape)).toEqual(['runId']);
  });

  it('carries a fingerprint on trust, never the run command itself', () => {
    // What crosses on `trust` is a confirmation of the suite the prompt
    // showed — main re-derives the actual argument vector from its own
    // discovery pass, exactly as `diag-handlers.ts` does for a proposed
    // linter. See tests-handlers.ts.
    expect(Object.keys(schemas.TestsTrustRequest.shape).sort()).toEqual([
      'fingerprint',
      'repoId',
      'suiteId',
    ]);
  });

  it('run resolves with a run id immediately, not a finished result', () => {
    const parsed = schemas.TestsRunResponse.parse({ ok: true, runId: 'r1' });
    expect(parsed).toEqual({ ok: true, runId: 'r1' });
  });
});

describe('request schemas', () => {
  it('applies the log stream defaults', () => {
    const parsed = schemas.LogStartRequest.parse({ repoId: 'r', requestId: 'q1' });
    expect(parsed.limit).toBe(50_000);
  });

  it('rejects an empty repoId', () => {
    expect(() => schemas.StatusGetRequest.parse({ repoId: '' })).toThrow();
  });

  it('requires at least one path to stage', () => {
    expect(() => schemas.StageRequest.parse({ repoId: 'r', paths: [] })).toThrow();
  });

  it('requires at least one sha to cherry-pick', () => {
    expect(() => schemas.CherryPickRequest.parse({ repoId: 'r', shas: [] })).toThrow();
  });

  it('constrains reset to the three real modes', () => {
    expect(schemas.ResetRequest.parse({ repoId: 'r', target: 'HEAD~1', mode: 'hard' }).mode).toBe(
      'hard',
    );
    expect(() =>
      schemas.ResetRequest.parse({ repoId: 'r', target: 'HEAD~1', mode: 'keep' }),
    ).toThrow();
  });

  it('has no force flag on push', () => {
    // No force-push exists anywhere in the MVP (INITIAL_PLAN → Risks). If this
    // ever fails, someone added one without the --force-with-lease gating.
    const parsed = schemas.PushRequest.parse({ repoId: 'r' });
    expect(parsed).not.toHaveProperty('force');
    expect(Object.keys(schemas.PushRequest.shape)).not.toContain('force');
  });

  it('defaults both diff requests to git\'s own -U3', () => {
    expect(schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts' }).context).toBe(3);
    expect(
      schemas.CommitFileDiffRequest.parse({ repoId: 'r', sha: 'abc', path: 'a.ts' }).context,
    ).toBe(3);
  });

  it('bounds the diff context a renderer can ask for', () => {
    // `context` becomes a `-U` argument, so an unbounded value from the renderer
    // is an unbounded amount of work in main.
    expect(() =>
      schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts', context: 10 ** 9 }),
    ).toThrow();
    expect(() =>
      schemas.FileDiffRequest.parse({ repoId: 'r', path: 'a.ts', context: -1 }),
    ).toThrow();
  });

  it('keeps the commit diff request scoped to a sha, not to the index', () => {
    // Widening FileDiffRequest with a sha would leave `staged` conditionally
    // meaningful on it. Two requests, each with only fields that always apply.
    expect(Object.keys(schemas.CommitFileDiffRequest.shape)).not.toContain('staged');
    expect(() => schemas.CommitFileDiffRequest.parse({ repoId: 'r', path: 'a.ts' })).toThrow();
  });

  it('defaults fetch to pruning origin', () => {
    expect(schemas.FetchRequest.parse({ repoId: 'r' })).toMatchObject({
      remote: 'origin',
      prune: true,
    });
  });
});

describe('fs write contract (Phase 24)', () => {
  const base = { scope: 'repo' as const, repoId: 'r', relPath: 'a.ts' };
  const version = { mtimeMs: 1, size: 2 };

  it('reads carry an FsVersion on the text arm', () => {
    const parsed = schemas.FsReadFileResponse.parse({
      kind: 'text',
      content: 'x',
      size: 1,
      version,
    });
    expect(parsed).toMatchObject({ version });
  });

  it('every write request accepts repo scope and refuses claude-home', () => {
    expect(() =>
      schemas.FsWriteFileRequest.parse({ ...base, content: 'x', expectedVersion: version }),
    ).not.toThrow();
    expect(() =>
      schemas.FsWriteFileRequest.parse({
        ...base,
        scope: 'claude-home',
        content: 'x',
        expectedVersion: version,
      }),
    ).toThrow();

    expect(() => schemas.FsCreateRequest.parse({ ...base, kind: 'file' })).not.toThrow();
    expect(() =>
      schemas.FsCreateRequest.parse({ ...base, scope: 'claude-home', kind: 'file' }),
    ).toThrow();

    expect(() =>
      schemas.FsRenameRequest.parse({
        scope: 'repo',
        repoId: 'r',
        fromRelPath: 'a.ts',
        toRelPath: 'b.ts',
      }),
    ).not.toThrow();
    expect(() =>
      schemas.FsRenameRequest.parse({
        scope: 'claude-home',
        repoId: 'r',
        fromRelPath: 'a.ts',
        toRelPath: 'b.ts',
      }),
    ).toThrow();

    expect(() => schemas.FsDeleteRequest.parse(base)).not.toThrow();
    expect(() => schemas.FsDeleteRequest.parse({ ...base, scope: 'claude-home' })).toThrow();
  });

  it('rejects an empty relPath on every write request', () => {
    expect(() =>
      schemas.FsWriteFileRequest.parse({ ...base, relPath: '', content: 'x', expectedVersion: version }),
    ).toThrow();
    expect(() => schemas.FsCreateRequest.parse({ ...base, relPath: '', kind: 'file' })).toThrow();
    expect(() => schemas.FsDeleteRequest.parse({ ...base, relPath: '' })).toThrow();
    expect(() =>
      schemas.FsRenameRequest.parse({ scope: 'repo', repoId: 'r', fromRelPath: '', toRelPath: 'b.ts' }),
    ).toThrow();
  });

  it('rejects a NUL byte in a write relPath', () => {
    expect(() =>
      schemas.FsWriteFileRequest.parse({
        ...base,
        relPath: 'a\0.ts',
        content: 'x',
        expectedVersion: version,
      }),
    ).toThrow();
  });

  it('constrains fsCreate to file or directory', () => {
    expect(schemas.FsCreateRequest.parse({ ...base, kind: 'directory' }).kind).toBe('directory');
    expect(() => schemas.FsCreateRequest.parse({ ...base, kind: 'symlink' })).toThrow();
  });

  it('fsRename carries independent from/to paths, not a single relPath', () => {
    expect(Object.keys(schemas.FsRenameRequest.shape)).toEqual(
      expect.arrayContaining(['fromRelPath', 'toRelPath']),
    );
    expect(Object.keys(schemas.FsRenameRequest.shape)).not.toContain('relPath');
  });

  it('requires an expectedVersion to overwrite a file', () => {
    expect(() => schemas.FsWriteFileRequest.parse({ ...base, content: 'x' })).toThrow();
  });

  it('reports a stale write as a GitOpResult error with a matchable code', () => {
    const result = schemas.OpResponse.parse({
      ok: false,
      kind: 'error',
      message: 'the file changed on disk',
      code: 'stale-write',
    });
    expect(result).toMatchObject({ ok: false, code: 'stale-write' });
  });

  it('does not grow ConflictOp for a stale write', () => {
    expect(() =>
      schemas.OpResponse.parse({ ok: false, kind: 'conflict', op: 'stale-write', files: [] }),
    ).toThrow();
  });
});

describe('fs read-only reads for the delete confirm + reveal (Phase 24 Theme C)', () => {
  const base = { scope: 'repo' as const, repoId: 'r', relPath: 'a.ts' };

  it('FsDirStatsRequest and ShowItemInFolderRequest are repo-scoped like the writes', () => {
    expect(() => schemas.FsDirStatsRequest.parse(base)).not.toThrow();
    expect(() => schemas.FsDirStatsRequest.parse({ ...base, scope: 'claude-home' })).toThrow();
    expect(() => schemas.ShowItemInFolderRequest.parse(base)).not.toThrow();
    expect(() => schemas.ShowItemInFolderRequest.parse({ ...base, scope: 'claude-home' })).toThrow();
  });

  it('FsDirStatsRequest allows an empty relPath — the scope root itself', () => {
    expect(() => schemas.FsDirStatsRequest.parse({ ...base, relPath: '' })).not.toThrow();
  });

  it('FsDirStatsResponse carries a truncated flag on its ok arm', () => {
    const parsed = schemas.FsDirStatsResponse.parse({
      ok: true,
      fileCount: 3,
      totalBytes: 100,
      truncated: false,
    });
    expect(parsed).toMatchObject({ fileCount: 3, truncated: false });
    expect(() =>
      schemas.FsDirStatsResponse.parse({ ok: true, fileCount: 3, totalBytes: 100 }),
    ).toThrow();
  });

  it('ShowItemInFolderResponse is a hand-off outcome, not a GitOpResult', () => {
    expect(schemas.ShowItemInFolderResponse.parse({ ok: false, message: 'nope' })).toMatchObject({
      ok: false,
    });
    expect(schemas.ShowItemInFolderResponse.parse({ ok: true })).toEqual({ ok: true });
  });
});

describe('OpenExternalRequest', () => {
  it.each(['https://github.com/o/r', 'http://localhost:3000/x', 'mailto:dev@example.com'])(
    'accepts %s',
    (url) => {
      expect(schemas.OpenExternalRequest.parse({ url }).url).toBe(url);
    },
  );

  it.each([
    // `openExternal` hands the scheme to the OS's registered handler, so each of
    // these is a real capability the renderer must not be able to reach for.
    ['a local file', 'file:///etc/passwd'],
    ['script execution', 'javascript:alert(1)'],
    ['an inline payload', 'data:text/html,<script>alert(1)</script>'],
    ['an SMB share', 'smb://attacker.example/share'],
    ['a custom app scheme', 'ms-msdt:/id/PCWDiagnostic'],
    ['a bare host', 'github.com/o/r'],
    ['a relative path', '/etc/passwd'],
    // The WHATWG parser strips leading whitespace and control characters before
    // reading the scheme, so this is `javascript:` by the time anything sees it.
    ['whitespace-smuggled script execution', ' \njavascript:alert(1)'],
  ])('rejects %s', (_label, url) => {
    expect(() => schemas.OpenExternalRequest.parse({ url })).toThrow();
  });

  it('rejects a protocol whose prefix is on the allow-list', () => {
    // `https:` is allowed; `httpsx:` merely starts with it. The check compares
    // the parsed protocol exactly rather than testing the raw string's prefix.
    expect(schemas.isOpenableExternally('httpsx://evil.example')).toBe(false);
  });

  it('normalises to the parsed href, so main opens what was validated', () => {
    // If main passed the caller's raw string on instead, the string the OS
    // receives would be one this validation never actually inspected.
    expect(schemas.normalizeExternalUrl(' https://ok.example')).toBe('https://ok.example/');
    expect(schemas.normalizeExternalUrl('nope')).toBeNull();
  });
});

describe('forge schemas', () => {
  it('caps a listing so a sidebar section cannot spawn an unbounded gh call', () => {
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r' }).limit).toBe(20);
    expect(() => schemas.ForgePullsRequest.parse({ repoId: 'r', limit: 500 })).toThrow();
    expect(() => schemas.ForgeRunsRequest.parse({ repoId: 'r', limit: 0 })).toThrow();
  });

  it('leaves branch optional — omitted means every branch', () => {
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r' }).branch).toBeUndefined();
    expect(schemas.ForgeRunsRequest.parse({ repoId: 'r', branch: 'main' }).branch).toBe('main');
  });

  it('keeps an unfinished run distinguishable from a failed one', () => {
    // The whole point of a nullable conclusion: defaulting it to anything
    // would paint a queued run with a verdict nobody has reached.
    const parsed = schemas.ForgeRunsResponse.parse({
      cli: { reason: 'ready' },
      runs: [
        {
          id: '1',
          name: 'CI',
          status: 'queued',
          createdAt: '2026-08-26T10:00:00Z',
          url: 'https://github.com/o/r/actions/runs/1',
        },
      ],
    });
    expect(parsed.runs[0]?.conclusion).toBeNull();
    expect(parsed.error).toBeNull();
  });

  it('lets an empty listing and an unavailable CLI stay different answers', () => {
    const ready = schemas.ForgePullsResponse.parse({ cli: { reason: 'ready' } });
    const missing = schemas.ForgePullsResponse.parse({
      cli: { reason: 'not-installed', hint: 'Install the GitHub CLI.' },
    });
    expect(ready.pulls).toEqual([]);
    expect(missing.pulls).toEqual([]);
    // Same empty list, different reason — which is what the envelope buys.
    expect(ready.cli.reason).not.toBe(missing.cli.reason);
  });

  it('rejects a forge status with a reason it cannot render', () => {
    expect(() => schemas.ForgeCliStatusResponse.parse({ reason: 'probably-fine' })).toThrow();
  });

  it('keeps "issues are off" and "the call failed" apart', () => {
    const off = schemas.ForgeIssuesResponse.parse({ cli: { reason: 'ready' }, disabled: true });
    const broke = schemas.ForgeIssuesResponse.parse({
      cli: { reason: 'ready' },
      error: 'HTTP 502',
    });
    // Both are empty listings; only one of them is worth a red card.
    expect(off.issues).toEqual([]);
    expect(broke.issues).toEqual([]);
    expect(off.disabled).toBe(true);
    expect(off.error).toBeNull();
    expect(broke.disabled).toBe(false);
  });

  it('refuses a run id that is not a run id', () => {
    // The value is spliced into a shell command line. `shellQuote` makes that
    // safe; this makes it safe twice, and cheaply.
    expect(() => schemas.ForgeRunDetailRequest.parse({ repoId: 'r', runId: '123' })).not.toThrow();
    expect(() => schemas.ForgeRunDetailRequest.parse({ repoId: 'r', runId: '1; rm -rf /' })).toThrow();
    expect(() => schemas.ForgeRunLogRequest.parse({ repoId: 'r', runId: '' })).toThrow();
  });

  it('caps a log by default and makes the whole thing opt-in', () => {
    const capped = schemas.ForgeRunLogRequest.parse({ repoId: 'r', runId: '7' });
    expect(capped.full).toBe(false);
    // A truncated log always says how much it dropped — the shape has no way
    // to express "short" without also expressing "and here is what is missing".
    const log = schemas.ForgeRunLogResponse.parse({
      cli: { reason: 'ready' },
      log: { lines: ['a'], truncated: true, omittedLines: 400, totalBytes: 9_000_000 },
    });
    expect(log.log?.omittedLines).toBe(400);
    expect(log.log?.complete).toBe(false);
  });

  it('lets a Phase 17 run payload keep parsing after Theme C widened it', () => {
    // Every field Theme C added is nullable with a default, so a cached run
    // from before this phase still parses — and draws the columns it can.
    const old = ForgeRunSchema.parse({
      id: '1',
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-01-01T00:00:00Z',
      url: 'https://github.com/o/r/actions/runs/1',
    });
    expect(old.workflowId).toBeNull();
    expect(old.event).toBeNull();
  });

  it('bounds a pull-request number to a positive integer', () => {
    // The value is spliced into the `gh` command line main builds. Rejecting
    // anything else here means main never has to trust the quoting alone —
    // the same rule `RunId`'s digits-only regex expresses for run ids.
    expect(() => schemas.ForgePullDetailRequest.parse({ repoId: 'r', number: 42 })).not.toThrow();
    expect(() => schemas.ForgePullFilesRequest.parse({ repoId: 'r', number: 0 })).toThrow();
    expect(() => schemas.ForgePullFilesRequest.parse({ repoId: 'r', number: 1.5 })).toThrow();
    expect(() =>
      schemas.ForgePullCommentsRequest.parse({ repoId: 'r', number: '42; rm -rf /' }),
    ).toThrow();
  });

  it('keeps "no diff" and "an empty diff" as different answers', () => {
    // `files: null` is a pull request whose patch could not be read; a `files`
    // object with an empty array is one that genuinely changes nothing. The UI
    // says different things for each, so the envelope has to hold both.
    const unread = schemas.ForgePullFilesResponse.parse({ cli: { reason: 'ready' } });
    expect(unread.files).toBeNull();

    const empty = schemas.ForgePullFilesResponse.parse({
      cli: { reason: 'ready' },
      files: { files: [] },
    });
    expect(empty.files?.files).toEqual([]);
    expect(empty.files?.truncated).toBe(false);
  });

  it('defaults every withheld field of a PR detail rather than rejecting it', () => {
    const detail = schemas.ForgePullDetailResponse.parse({
      cli: { reason: 'ready' },
      detail: {
        pull: {
          number: 7,
          title: 'Bare',
          state: 'open',
          headBranch: 'b',
          url: 'https://github.com/o/r/pull/7',
        },
      },
    });
    expect(detail.detail?.headSha).toBeNull();
    expect(detail.detail?.body).toBe('');
    expect(detail.detail?.changedFiles).toBe(0);
  });

  it('bounds every field of a review-comment request', () => {
    const valid = {
      repoId: 'r1',
      number: 42,
      commitId: 'a'.repeat(40),
      path: 'src/app.tsx',
      line: 12,
      body: 'A note.',
    };
    // `side` defaults rather than being required — v1 writes only the right side.
    expect(schemas.ForgeReviewCommentRequest.parse(valid).side).toBe('RIGHT');

    // A short or upper-case sha is not a sha. GitHub anchors the comment to a
    // commit, and a rejected one here beats a comment attached to whatever the
    // API decides is current.
    expect(() =>
      schemas.ForgeReviewCommentRequest.parse({ ...valid, commitId: 'abc123' }),
    ).toThrow();
    expect(() =>
      schemas.ForgeReviewCommentRequest.parse({ ...valid, commitId: 'A'.repeat(40) }),
    ).toThrow();

    // An empty comment is not a comment, and GitHub would reject it anyway.
    expect(() => schemas.ForgeReviewCommentRequest.parse({ ...valid, body: '' })).toThrow();
    // Line numbers are 1-based and positive.
    expect(() => schemas.ForgeReviewCommentRequest.parse({ ...valid, line: 0 })).toThrow();
    // LEFT is readable but not writable in v1 — the schema is where that holds.
    expect(() => schemas.ForgeReviewCommentRequest.parse({ ...valid, side: 'LEFT' })).toThrow();
  });

  it('keeps a comment id digits-only and a thread id url-safe', () => {
    // Both are spliced into a `gh` command line. `shellQuote` already makes
    // that safe; rejecting the wrong shape here means main never has to rely on
    // the quoting alone — the same rule `RunId` follows.
    expect(() =>
      schemas.ForgeReviewReplyRequest.parse({
        repoId: 'r1',
        number: 1,
        commentId: '123; rm -rf /',
        body: 'x',
      }),
    ).toThrow();

    expect(() =>
      schemas.ForgeResolveThreadRequest.parse({
        repoId: 'r1',
        threadId: "PRRT_'; echo '",
        resolved: true,
      }),
    ).toThrow();
    expect(
      schemas.ForgeResolveThreadRequest.parse({
        repoId: 'r1',
        threadId: 'PRRT_kwDODKw3uc6ai8rw',
        resolved: false,
      }).resolved,
    ).toBe(false);
  });

  it('allows only a bare approval, never a bodiless comment or refusal', () => {
    // GitHub documents `body` as required for REQUEST_CHANGES *and* COMMENT, so
    // the contract refuses both — and the composer's disabled Submit button
    // agrees with it, rather than the user discovering the COMMENT half from a
    // failed subprocess.
    for (const event of ['REQUEST_CHANGES', 'COMMENT'] as const) {
      expect(() =>
        schemas.ForgePullReviewRequest.parse({ repoId: 'r1', number: 1, event, body: '   ' }),
      ).toThrow();
      expect(
        schemas.ForgePullReviewRequest.parse({ repoId: 'r1', number: 1, event, body: 'said' })
          .body,
      ).toBe('said');
    }
    expect(
      schemas.ForgePullReviewRequest.parse({ repoId: 'r1', number: 1, event: 'APPROVE' }).body,
    ).toBe('');
    // A discussion comment with nothing in it is meaningless, and that rule is
    // ours rather than GitHub's — hence the separate schema and the trim.
    expect(() =>
      schemas.ForgePullCommentRequest.parse({ repoId: 'r1', number: 1, body: '  ' }),
    ).toThrow();
  });

  it('never defaults a merge method', () => {
    // Picking one for the caller would mean the app could squash a history the
    // user meant to preserve because a field went unset.
    expect(() => schemas.ForgePullMergeRequest.parse({ repoId: 'r1', number: 1 })).toThrow();
    expect(
      schemas.ForgePullMergeRequest.parse({ repoId: 'r1', number: 1, method: 'squash' }).method,
    ).toBe('squash');
  });

  it('refuses a reviewer that could not be a GitHub login', () => {
    expect(() =>
      schemas.ForgePullRequestReviewRequest.parse({
        repoId: 'r1',
        number: 1,
        reviewers: ["octo'; rm -rf /"],
      }),
    ).toThrow();
    // An empty list is a request that asks nobody for anything.
    expect(() =>
      schemas.ForgePullRequestReviewRequest.parse({ repoId: 'r1', number: 1, reviewers: [] }),
    ).toThrow();
    expect(
      schemas.ForgePullRequestReviewRequest.parse({
        repoId: 'r1',
        number: 1,
        reviewers: ['octo-cat', 'hubot'],
      }).reviewers,
    ).toEqual(['octo-cat', 'hubot']);
  });

  it('re-runs every job unless the narrower flag is asked for', () => {
    expect(
      schemas.ForgeRunRerunRequest.parse({ repoId: 'r1', runId: '9001' }).failedOnly,
    ).toBe(false);
    // Same digits-only run id every read channel takes — it reaches a command line.
    expect(() =>
      schemas.ForgeRunRerunRequest.parse({ repoId: 'r1', runId: '9001; whoami' }),
    ).toThrow();
  });

  it('has a request schema for every forge channel', () => {
    // The same guard the pty/terminal table applies: a forge channel added
    // without a schema is unvalidated input reaching a subprocess.
    const expected: Record<string, string[]> = {
      forgeCliStatus: ['ForgeCliStatusRequest', 'ForgeCliStatusResponse'],
      forgeRuns: ['ForgeRunsRequest', 'ForgeRunsResponse'],
      forgePulls: ['ForgePullsRequest', 'ForgePullsResponse'],
      forgeIssues: ['ForgeIssuesRequest', 'ForgeIssuesResponse'],
      forgeRunDetail: ['ForgeRunDetailRequest', 'ForgeRunDetailResponse'],
      forgeRunLog: ['ForgeRunLogRequest', 'ForgeRunLogResponse'],
      forgeWorkflows: ['ForgeWorkflowsRequest', 'ForgeWorkflowsResponse'],
      forgePullDetail: ['ForgePullDetailRequest', 'ForgePullDetailResponse'],
      forgePullFiles: ['ForgePullFilesRequest', 'ForgePullFilesResponse'],
      forgePullComments: ['ForgePullCommentsRequest', 'ForgePullCommentsResponse'],
      forgePullThreads: ['ForgePullThreadsRequest', 'ForgePullThreadsResponse'],
      /*
        The nine writes (Phase 20 Themes E, F and G), and the reason this guard
        matters more for them than for anything above: an unvalidated *read*
        returns the wrong data, while an unvalidated write changes state on
        somebody's pull request with a payload the renderer chose.
      */
      forgeReviewComment: ['ForgeReviewCommentRequest', 'ForgeReviewCommentResponse'],
      forgeReviewReply: ['ForgeReviewReplyRequest', 'ForgeReviewReplyResponse'],
      forgeResolveThread: ['ForgeResolveThreadRequest', 'ForgeResolveThreadResponse'],
      forgePullReview: ['ForgePullReviewRequest', 'ForgePullReviewResponse'],
      forgePullComment: ['ForgePullCommentRequest', 'ForgePullCommentResponse'],
      forgePullMerge: ['ForgePullMergeRequest', 'ForgePullMergeResponse'],
      forgePullRequestReview: [
        'ForgePullRequestReviewRequest',
        'ForgePullRequestReviewResponse',
      ],
      forgePullReady: ['ForgePullReadyRequest', 'ForgePullReadyResponse'],
      forgeRunRerun: ['ForgeRunRerunRequest', 'ForgeRunRerunResponse'],
    };
    const channelKeys = Object.keys(CHANNELS).filter((key) => key.startsWith('forge'));
    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const name of names) expect(schemas).toHaveProperty(name);
    }
  });
});

describe('metrics schemas', () => {
  it('accepts a sample carrying nothing but a timestamp', () => {
    // A machine where every probe failed is a valid sample, not an error. The
    // renderer renders no readouts at all for it, which is the honest answer.
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1 })).not.toThrow();
  });

  it('keeps "unreadable" and "zero" as different answers, all the way down', () => {
    const absent = schemas.MetricsSampleEvent.parse({ at: 1, cpu: 40 });
    const zero = schemas.MetricsSampleEvent.parse({ at: 1, cpu: 40, gpu: 0 });
    expect(absent.gpu).toBeUndefined();
    expect(zero.gpu).toBe(0);
    // Distinguishable by presence, not by value — which is what lets the chart
    // drop the series instead of drawing a flat zero line.
    expect('gpu' in absent).toBe(false);
    expect('gpu' in zero).toBe(true);
  });

  it('rejects a percentage outside 0-100', () => {
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1, cpu: 101 })).toThrow();
    expect(() => schemas.MetricsSampleEvent.parse({ at: 1, memory: -1 })).toThrow();
  });

  it('omits load1 rather than reporting win32\'s hard-coded zero', () => {
    // libuv returns [0,0,0] on win32; the field being optional is what keeps
    // that from reading as a genuinely idle machine.
    const parsed = schemas.MetricsSampleEvent.parse({ at: 1, cpuInfo: { cores: 8 } });
    expect(parsed.cpuInfo?.load1).toBeUndefined();
  });

  it('bounds the cadence the renderer may ask for', () => {
    // The floor matters: the GPU probe spawns a subprocess per tick, so a
    // renderer bug asking for 10ms would fork-bomb the machine.
    expect(() => schemas.MetricsStartRequest.parse({ intervalMs: 10 })).toThrow();
    expect(() => schemas.MetricsStartRequest.parse({ intervalMs: 600_000 })).toThrow();
    expect(schemas.MetricsStartRequest.parse({ intervalMs: 2_000 }).intervalMs).toBe(2_000);
  });

  it('offers both cadences inside the bounds it enforces', () => {
    for (const interval of [METRICS_ACTIVE_INTERVAL_MS, METRICS_IDLE_INTERVAL_MS]) {
      expect(() => schemas.MetricsStartRequest.parse({ intervalMs: interval })).not.toThrow();
    }
  });

  it('reports which metrics a sample actually carries', () => {
    expect(metricsPresent({ at: 1, cpu: 10, gpu: 0 })).toEqual(['cpu', 'gpu']);
    expect(metricsPresent({ at: 1 })).toEqual([]);
  });

  it('covers every metrics channel with a schema', () => {
    const expected: Record<string, string[]> = {
      metricsStart: ['MetricsStartRequest'],
      // `stop` carries no payload at all — there is nothing to validate.
      metricsStop: [],
      metricsSample: ['MetricsSampleEvent'],
    };
    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)].filter((key) =>
      key.startsWith('metrics'),
    );
    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const name of names) expect(schemas).toHaveProperty(name);
    }
  });
});

describe('stats schemas', () => {
  it('defaults to the 90-day window and to churn off', () => {
    // Churn off by default is the load-bearing half: `--numstat` makes git diff
    // every commit rather than read commit objects, so a caller that forgets to
    // ask should get the cheap traversal, not the expensive one.
    const parsed = schemas.StatsSummaryRequest.parse({ repoId: 'r' });
    expect(parsed.window).toBe('90d');
    expect(parsed.withChurn).toBe(false);
  });

  it('takes a repoId only — never a path', () => {
    // The forge-handlers rule: main resolves the checkout itself, so the
    // renderer cannot point a history traversal at an arbitrary directory.
    expect(Object.keys(schemas.StatsSummaryRequest.shape)).toEqual([
      'repoId',
      'window',
      'withChurn',
    ]);
  });

  it('rejects an empty repoId and an unknown window', () => {
    expect(() => schemas.StatsSummaryRequest.parse({ repoId: '' })).toThrow();
    expect(() => schemas.StatsSummaryRequest.parse({ repoId: 'r', window: '5y' })).toThrow();
  });

  it('accepts every window the domain offers', () => {
    for (const window of Object.keys(STATS_WINDOW_DAYS)) {
      expect(() => schemas.StatsSummaryRequest.parse({ repoId: 'r', window })).not.toThrow();
    }
  });

  it('keeps "churn not requested" distinct from "no files changed"', () => {
    // Null, not an empty table — the widget renders the two differently.
    const base = {
      repoId: 'r',
      window: '90d',
      generatedAt: 1,
      truncated: false,
      commitsScanned: 0,
      calendar: [],
      contributors: [],
      activity: [],
      health: {
        localBranches: 0,
        remoteBranches: 0,
        tags: 0,
        staleByAge: 0,
        mergedBranches: 0,
        oldestUnmergedAt: null,
        sizeBytes: null,
        looseObjects: null,
      },
    };
    expect(schemas.StatsSummaryResponse.parse({ ...base, churn: null }).churn).toBeNull();
    expect(
      schemas.StatsSummaryResponse.parse({ ...base, churn: { files: [], withheld: 0 } }).churn,
    ).toEqual({ files: [], withheld: 0 });
  });

  it('requires a calendar date to be an actual YYYY-MM-DD', () => {
    // The heatmap keys cells on this string; a stray ISO timestamp would draw
    // a cell nobody can look up.
    expect(() => CalendarDaySchema.parse({ date: '2024-3-5', count: 1 })).toThrow();
    expect(() => CalendarDaySchema.parse({ date: '2024-03-05T00:00:00Z', count: 1 })).toThrow();
    expect(CalendarDaySchema.parse({ date: '2024-03-05', count: 1 }).date).toBe('2024-03-05');
  });

  it('lets a contributor report null line counts', () => {
    const parsed = ContributorStatSchema.parse({
      email: 'a@b.com',
      name: 'A',
      commits: 1,
      insertions: null,
      deletions: null,
      firstAt: 1,
      lastAt: 2,
    });
    expect(parsed.insertions).toBeNull();
  });

  it('covers the stats channel with a schema', () => {
    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)].filter((key) =>
      key.startsWith('stats'),
    );
    expect(channelKeys).toEqual(['statsSummary']);
    expect(schemas).toHaveProperty('StatsSummaryRequest');
    expect(schemas).toHaveProperty('StatsSummaryResponse');
  });
});

describe('keybindings', () => {
  it('binds every command at most once', () => {
    const commands = DEFAULT_KEYMAP.map((b) => b.command);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it('binds every chord at most once, except a browser.* command deliberately sharing one with an app-wide command', () => {
    // Phase 32 Theme C: the browser's own tab chords (Mod+w, Mod+1…Mod+9)
    // intentionally reuse chords repo.close/graph.focus/status.focus already
    // own — `use-keybindings.ts` resolves the collision by preferring the
    // `browser.*` reading only while the pane is open. Any OTHER duplicate
    // is a real mistake this test still catches.
    const byChord = new Map<string, string[]>();
    for (const binding of DEFAULT_KEYMAP) {
      byChord.set(binding.chord, [...(byChord.get(binding.chord) ?? []), binding.command]);
    }
    for (const [chord, commands] of byChord) {
      if (commands.length === 1) continue;
      expect(commands, `chord ${chord} bound to ${commands.join(', ')}`).toHaveLength(2);
      const browserCommands = commands.filter((c) => c.startsWith('browser.'));
      expect(browserCommands, `chord ${chord} bound to ${commands.join(', ')}`).toHaveLength(1);
    }
  });

  it('only binds known command ids', () => {
    for (const binding of DEFAULT_KEYMAP) expect(isCommandId(binding.command)).toBe(true);
  });

  it('toggles the terminal with Ctrl+` on every platform', () => {
    // macOS reserves Cmd+` for cycling windows within an app — taking it would
    // break a system gesture, so this must stay Ctrl even on darwin.
    const toggle = DEFAULT_KEYMAP.find((b) => b.command === 'terminal.toggle');
    expect(toggle?.chord).toBe('Ctrl+`');
    expect(toggle?.chord.startsWith('Mod')).toBe(false);
  });

  it('lets the terminal toggle escape xterm', () => {
    // Scope `global` is what puts a chord on the allow-list that bypasses the
    // terminal's key handling; without it the toggle dies inside the shell.
    expect(GLOBAL_CHORDS).toContain('Ctrl+`');
  });

  it('rejects an unknown command id', () => {
    expect(isCommandId('nope.nope')).toBe(false);
    expect(COMMAND_IDS.length).toBeGreaterThan(0);
  });
});


describe('LogStartRequest.revisions', () => {
  it('defaults to every ref, so a pre-filter payload still parses', () => {
    const parsed = schemas.LogStartRequest.parse({ repoId: 'r1', requestId: 'r1#1' });
    expect(parsed.revisions).toEqual([]);
    expect(parsed.limit).toBe(50_000);
  });

  it('carries fully-qualified refs through unchanged', () => {
    // Fully-qualified because `main` and `origin/main` are different commits
    // with the same short name, and `git log main` would resolve one silently.
    const parsed = schemas.LogStartRequest.parse({
      repoId: 'r1',
      requestId: 'r1#2',
      revisions: ['refs/heads/main', 'refs/remotes/origin/main'],
    });
    expect(parsed.revisions).toEqual(['refs/heads/main', 'refs/remotes/origin/main']);
  });
});

/**
 * The `pty:*` and `terminal:*` payloads, swept as a table.
 *
 * A table rather than a describe-block each so that adding a channel without a
 * schema test shows up as a missing row instead of as silence — the coverage
 * assertion at the end of this block is what turns that from a convention into
 * a failure. There were no pty schema tests at all before this, which is how
 * `PtyCreateRequest` grew four fields across Phase 15 without one.
 */
describe('terminal and pty schemas', () => {
  const session = {
    id: 's1',
    kind: 'shell' as const,
    title: 'midnite-git',
    cwd: '/repo',
    repoId: 'r1',
    createdAt: 0,
  };

  const ptyCreate = {
    sessionId: 's1',
    kind: 'shell' as const,
    repoId: 'r1',
    cwd: '/repo',
    cols: 80,
    rows: 24,
  };

  /**
   * Each row: the schema, one payload that must parse, and payloads that must
   * not — each paired with what it is actually testing, so a failure names the
   * rule rather than an index.
   */
  const CASES: {
    name: string;
    schema: { parse: (value: unknown) => unknown };
    valid: unknown;
    invalid: [string, unknown][];
  }[] = [
    {
      name: 'PtyCreateRequest',
      schema: schemas.PtyCreateRequest,
      valid: ptyCreate,
      invalid: [
        // The session record exists before the process does; a pty with no
        // session to append its output to has nowhere to write scrollback.
        ['no sessionId', { ...ptyCreate, sessionId: undefined }],
        ['empty sessionId', { ...ptyCreate, sessionId: '' }],
        ['unknown kind', { ...ptyCreate, kind: 'wizard' }],
        // Zero or fractional dimensions reach node-pty, which is a native
        // module — a bad size there is not a validation error, it is a crash.
        ['zero cols', { ...ptyCreate, cols: 0 }],
        ['fractional rows', { ...ptyCreate, rows: 24.5 }],
        ['negative rows', { ...ptyCreate, rows: -1 }],
      ],
    },
    {
      name: 'PtyCreateResponse',
      schema: schemas.PtyCreateResponse,
      valid: { ok: true, ptyId: 'p1' },
      invalid: [
        // The discriminant is the whole contract: node-pty is loaded lazily and
        // fails soft, so a bare `{ptyId}` would read as neither arm.
        ['no discriminant', { ptyId: 'p1' }],
        ['failure without a message', { ok: false }],
        ['success without a ptyId', { ok: true }],
      ],
    },
    {
      name: 'PtyInputRequest',
      schema: schemas.PtyInputRequest,
      valid: { ptyId: 'p1', data: 'ls\r' },
      invalid: [['no data', { ptyId: 'p1' }]],
    },
    {
      name: 'PtyResizeRequest',
      schema: schemas.PtyResizeRequest,
      valid: { ptyId: 'p1', cols: 120, rows: 40 },
      invalid: [
        ['zero cols', { ptyId: 'p1', cols: 0, rows: 40 }],
        ['fractional cols', { ptyId: 'p1', cols: 120.5, rows: 40 }],
      ],
    },
    {
      name: 'PtyKillRequest',
      schema: schemas.PtyKillRequest,
      valid: { ptyId: 'p1' },
      invalid: [['no ptyId', {}]],
    },
    {
      name: 'PtySnapshotRequest',
      schema: schemas.PtySnapshotRequest,
      valid: { ptyId: 'p1' },
      invalid: [['no ptyId', {}], ['empty ptyId', { ptyId: '' }]],
    },
    {
      name: 'PtyExitEvent',
      schema: schemas.PtyExitEvent,
      valid: { ptyId: 'p1', exitCode: 0 },
      invalid: [
        ['no exitCode', { ptyId: 'p1' }],
        ['fractional exitCode', { ptyId: 'p1', exitCode: 1.5 }],
      ],
    },
    {
      name: 'PtyAgentChangedEvent',
      schema: schemas.PtyAgentChangedEvent,
      valid: { ptyId: 'p1', agentId: 'codex' },
      invalid: [
        ['no agentId at all', { ptyId: 'p1' }],
        // `null` is a real answer — "looked, recognised nothing" — but an empty
        // string is not one, and would resolve to no roster entry either way.
        ['an empty agentId', { ptyId: 'p1', agentId: '' }],
        ['no ptyId', { agentId: null }],
      ],
    },
    {
      name: 'PtyCommandChangedEvent',
      schema: schemas.PtyCommandChangedEvent,
      valid: { ptyId: 'p1', command: 'pnpm dev' },
      invalid: [
        ['no command at all', { ptyId: 'p1' }],
        // An empty string is not "back at the prompt" — that is `null`.
        ['an empty command', { ptyId: 'p1', command: '' }],
        ['no ptyId', { command: null }],
      ],
    },
    {
      name: 'PtyActivityEvent',
      schema: schemas.PtyActivityEvent,
      valid: { ptyId: 'p1', activity: 'thinking' },
      invalid: [
        ['an unrecognised activity value', { ptyId: 'p1', activity: 'busy' }],
        ['no ptyId', { activity: null }],
      ],
    },
    {
      name: 'TerminalListResponse',
      schema: schemas.TerminalListResponse,
      valid: {
        sessions: [
          { session, scrollback: new Uint8Array([0x24, 0x20]), live: null },
          {
            session,
            scrollback: new Uint8Array(),
            live: { ptyId: 'p1', pid: 123, cols: 80, rows: 24 },
            legacy: true,
          },
        ],
        broker: { mode: 'broker' },
      },
      invalid: [
        // Scrollback crosses as raw pty bytes via structured clone, never as a
        // string — decoding it anywhere but xterm mangles escape sequences.
        ['scrollback as a string', { sessions: [{ session, scrollback: '$ ', live: null }] }],
        ['scrollback as a number array', { sessions: [{ session, scrollback: [36, 32], live: null }] }],
        ['session missing its cwd', { sessions: [{ session: { ...session, cwd: undefined }, scrollback: new Uint8Array(), live: null }] }],
        ['no live key at all', { sessions: [{ session, scrollback: new Uint8Array() }] }],
        ['live.pid zero', { sessions: [{ session, scrollback: new Uint8Array(), live: { ptyId: 'p1', pid: 0, cols: 80, rows: 24 } }] }],
        ['unknown broker mode', { sessions: [], broker: { mode: 'detached' } }],
      ],
    },
    {
      name: 'TerminalSaveRequest',
      schema: schemas.TerminalSaveRequest,
      valid: { session },
      // The agent case is a POSITIVE one and lives in its own test below.
      invalid: [
        ['no session', {}],
        // `kind` and `agentId` are one fact; either half alone degrades silently.
        ['an agent session with no agentId to start it', { session: { ...session, kind: 'agent' } }],
        ['a shell session carrying an agentId', { session: { ...session, agentId: 'claude' } }],
      ],
    },
    {
      name: 'TerminalForgetRequest',
      schema: schemas.TerminalForgetRequest,
      valid: { sessionId: 's1' },
      invalid: [['empty sessionId', { sessionId: '' }]],
    },
    {
      name: 'TerminalReorderRequest',
      schema: schemas.TerminalReorderRequest,
      valid: { sessionIds: ['s1', 's2'] },
      invalid: [
        // The whole order, not a moved-from/moved-to pair — but an empty id in
        // it would silently drop a session on replay.
        ['an empty id in the list', { sessionIds: ['s1', ''] }],
        ['ids as numbers', { sessionIds: [1, 2] }],
      ],
    },
  ];

  for (const { name, schema, valid, invalid } of CASES) {
    describe(name, () => {
      it('parses a well-formed payload', () => {
        expect(() => schema.parse(valid)).not.toThrow();
      });

      for (const [why, payload] of invalid) {
        it(`rejects ${why}`, () => {
          expect(() => schema.parse(payload)).toThrow();
        });
      }
    });
  }

  it('carries an agent session through save unchanged', () => {
    // `agent` differs from `shell` only by what was typed into it on startup,
    // so the record has to round-trip `agentId` rather than normalise it away.
    const agent = { ...session, kind: 'agent' as const, agentId: 'claude' };
    expect(schemas.TerminalSaveRequest.parse({ session: agent })).toMatchObject({
      session: { kind: 'agent', agentId: 'claude' },
    });
  });

  /**
   * `null` is not an absence, and the wire has to carry it as one of two real
   * answers.
   *
   * The renderer keys this into a `Record<string, string | null>` where a
   * *missing key* means "never probed" and `null` means "probed, nothing
   * running" — the first has to leave an agent session wearing its mark and the
   * second has to take it away. A schema that dropped `null` to `undefined`
   * would collapse the two and every agent row would keep its mark forever.
   */
  it('carries a null agent as a real answer, not an absence', () => {
    const parsed = schemas.PtyAgentChangedEvent.parse({ ptyId: 'p1', agentId: null });

    expect(parsed.agentId).toBeNull();
    expect('agentId' in parsed).toBe(true);
  });

  /**
   * `null` is the wire's explicit "the detector has nothing to say" — no
   * marker set for the running agent, or one disabled after tripping its time
   * budget — which the renderer draws as the quiet "unknown" mark.
   */
  it('carries a null activity as a real answer, not an absence', () => {
    const parsed = schemas.PtyActivityEvent.parse({ ptyId: 'p1', activity: null });

    expect(parsed.activity).toBeNull();
    expect('activity' in parsed).toBe(true);
  });

  it('defaults an agent pty to no initial input', () => {
    // `initialInput` is what makes an agent session an agent session; it must
    // stay absent rather than becoming '' when nobody sets it.
    expect(schemas.PtyCreateRequest.parse(ptyCreate).initialInput).toBeUndefined();
    expect(
      schemas.PtyCreateRequest.parse({ ...ptyCreate, kind: 'agent', agentId: 'claude', initialInput: 'claude\r' })
        .initialInput,
    ).toBe('claude\r');
  });

  /**
   * The one channel in this family that crosses without a zod schema.
   *
   * `pty:data` is a firehose — one message per chunk of shell output, which for
   * anything scrolling is hundreds a second — carrying `{ptyId, data:
   * Uint8Array}` typed on the bridge alone. Parsing every chunk would put zod on
   * the path of each keystroke's echo to buy approximately nothing: the payload
   * is raw bytes whose only consumer is xterm, and its shape is fixed by the
   * emitter in main rather than supplied by a renderer.
   *
   * Listed rather than skipped, so the guard below still fires for the NEXT
   * channel added without validation and this stays a decision on the record
   * instead of an omission nobody notices.
   */
  const UNVALIDATED_BY_DESIGN = ['ptyData'];

  /**
   * The reason this block is a table.
   *
   * Every `pty:*` and `terminal:*` channel must appear above by name. A new
   * channel added without a row fails here, rather than shipping unvalidated.
   */
  it('covers every pty and terminal channel', () => {
    const covered = new Set(CASES.map((c) => c.name));
    const expected: Record<string, string[]> = {
      ptyCreate: ['PtyCreateRequest', 'PtyCreateResponse'],
      ptyInput: ['PtyInputRequest'],
      ptyResize: ['PtyResizeRequest'],
      ptyKill: ['PtyKillRequest'],
      ptySnapshot: ['PtySnapshotRequest'],
      ptyExit: ['PtyExitEvent'],
      ptyAgentChanged: ['PtyAgentChangedEvent'],
      ptyCommandChanged: ['PtyCommandChangedEvent'],
      ptyActivity: ['PtyActivityEvent'],
      terminalList: ['TerminalListResponse'],
      terminalSave: ['TerminalSaveRequest'],
      terminalForget: ['TerminalForgetRequest'],
      terminalReorder: ['TerminalReorderRequest'],
    };

    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)]
      .filter((key) => key.startsWith('pty') || key.startsWith('terminal'))
      .filter((key) => !UNVALIDATED_BY_DESIGN.includes(key));

    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
    for (const names of Object.values(expected)) {
      for (const schemaName of names) expect(covered).toContain(schemaName);
    }
  });

  it('keeps the unvalidated list honest', () => {
    // An exemption for a channel that no longer exists is a comment claiming a
    // decision nobody is still making.
    const all = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)];
    for (const key of UNVALIDATED_BY_DESIGN) expect(all).toContain(key);
  });
});

describe('search and blame channels and schemas', () => {
  it('covers every search and blame channel', () => {
    const expected: Record<string, boolean> = {
      searchStart: true,
      searchCancel: true,
      blameRead: true,
      searchBatch: true,
      searchDone: true,
    };

    const channelKeys = [...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)].filter(
      (key) => key.startsWith('search') || key.startsWith('blame'),
    );

    expect(channelKeys.sort()).toEqual(Object.keys(expected).sort());
  });

  it('validates SearchStartRequest refines against leading "-" and path escapes', () => {
    // Valid commits request
    expect(
      schemas.SearchStartRequest.parse({
        repoId: 'r1',
        mode: 'commits',
        requestId: 'req-1',
        query: {
          grep: ['refactor'],
          author: ['Alice'],
        },
      }),
    ).toBeDefined();

    // Invalid flag starting with '-'
    expect(() =>
      schemas.SearchStartRequest.parse({
        repoId: 'r1',
        mode: 'commits',
        requestId: 'req-1',
        query: {
          grep: ['--bad-flag'],
        },
      }),
    ).toThrow();

    // Invalid path containing '..'
    expect(() =>
      schemas.SearchStartRequest.parse({
        repoId: 'r1',
        mode: 'content',
        requestId: 'req-1',
        query: {
          pattern: 'foo',
          paths: ['../outside'],
        },
      }),
    ).toThrow();
  });
});

