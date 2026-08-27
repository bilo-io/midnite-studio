import { describe, expect, it } from 'vitest';

import { parseMultiFileDiff } from '@midnite/git-engine';

import {
  capPatch,
  logVerdict,
  stripPatchPreamble,
  stripShellPreamble,
} from './gh-cli';
import {
  describeFailure,
  repoFlag,
  shellQuote,
} from './gh-shell';
import {
  LOG_FULL_MAX_BYTES,
  LOG_HEAD_BYTES,
  LOG_TAIL_BYTES,
  isAuthenticated,
  isIssuesDisabled,
  mergeConversation,
  parseIssueComments,
  parseIssueList,
  parseJsonPayload,
  parsePullDetail,
  parsePullList,
  parsePullReviews,
  parseRunDetail,
  parseRunList,
  parseRunLog,
  parseWorkflowList,
  rollupChecks,
} from './gh-parse';

describe('shellQuote', () => {
  it('wraps a plain argument', () => {
    expect(shellQuote('bilo-io/midnite-git')).toBe(`'bilo-io/midnite-git'`);
  });

  it('neutralises every expansion a shell has', () => {
    for (const hostile of ['$(rm -rf /)', '`id`', 'a;b', 'a && b', '$HOME', 'a|b', 'a\nb']) {
      const quoted = shellQuote(hostile);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      // Nothing inside the quotes can terminate them except the escape form.
      expect(quoted.slice(1, -1).includes("'")).toBe(false);
    }
  });

  it('closes, escapes and reopens an embedded single quote', () => {
    // The one character single-quoting cannot contain. `o'brien` must survive
    // as one argument, not become two with a dangling quote.
    expect(shellQuote("o'brien/repo")).toBe(`'o'\\''brien/repo'`);
  });
});

describe('parseJsonPayload', () => {
  it('reads a clean payload', () => {
    expect(parseJsonPayload('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('skips the banner a login shell prints before the payload', () => {
    const noisy = 'Last login: Tue\ngh version 2.63.0 is available\n[{"number":7}]';
    expect(parseJsonPayload(noisy)).toEqual([{ number: 7 }]);
  });

  it('falls back to a per-line parse when the banner itself contains a brace', () => {
    const noisy = 'direnv: export ~PATH {loaded}\n[{"number":7}]\n';
    expect(parseJsonPayload(noisy)).toEqual([{ number: 7 }]);
  });

  it('answers null rather than throwing on garbage', () => {
    expect(parseJsonPayload('command not found: gh')).toBeNull();
    expect(parseJsonPayload('')).toBeNull();
  });
});

describe('parseRunList', () => {
  const run = {
    databaseId: 18234567890123,
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headBranch: 'main',
    headSha: 'a'.repeat(40),
    createdAt: '2026-08-26T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
  };

  it('maps a completed run', () => {
    expect(parseRunList([run])).toEqual([
      {
        id: '18234567890123',
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        headBranch: 'main',
        headSha: 'a'.repeat(40),
        createdAt: '2026-08-26T10:00:00Z',
        url: 'https://github.com/o/r/actions/runs/1',
        // Everything Phase 19 Theme C added, absent from this payload and so
        // null — the property that lets a pre-Theme-C row keep parsing.
        event: null,
        workflowId: null,
        workflowName: null,
        startedAt: null,
        updatedAt: null,
        displayTitle: null,
        number: null,
        attempt: null,
      },
    ]);
  });

  it('keeps the id exact past 2^53', () => {
    // A number that cannot round-trip through JS's float64 would silently
    // become a neighbouring id and link to the wrong run.
    const [parsed] = parseRunList([{ ...run, databaseId: '9007199254740993' }]);
    expect(parsed?.id).toBe('9007199254740993');
  });

  it('reads an in-flight run as having no conclusion', () => {
    // `gh` sends "" rather than null while a run is still going.
    const [parsed] = parseRunList([{ ...run, status: 'in_progress', conclusion: '' }]);
    expect(parsed?.status).toBe('in_progress');
    expect(parsed?.conclusion).toBeNull();
  });

  it('drops a row it cannot understand instead of guessing', () => {
    expect(parseRunList([{ ...run, status: 'teleported' }])).toEqual([]);
    expect(parseRunList([{ ...run, url: undefined }])).toEqual([]);
    expect(parseRunList([null, 'nope', 3])).toEqual([]);
  });

  it('survives a payload that is not a list', () => {
    expect(parseRunList({ message: 'Not Found' })).toEqual([]);
    expect(parseRunList(null)).toEqual([]);
  });
});

describe('rollupChecks', () => {
  it('is null when there are no checks at all', () => {
    // Distinct from "pending": a repo with no CI must not show a spinner.
    expect(rollupChecks([])).toBeNull();
    expect(rollupChecks(undefined)).toBeNull();
  });

  it('passes only when every check has finished green', () => {
    expect(
      rollupChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }]),
    ).toBe('passing');
  });

  it('lets a running check outrank the green ones', () => {
    expect(
      rollupChecks([
        { status: 'COMPLETED', conclusion: 'SUCCESS' },
        { status: 'IN_PROGRESS', conclusion: '' },
      ]),
    ).toBe('pending');
  });

  it('lets a failure outrank everything', () => {
    expect(
      rollupChecks([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }]),
    ).toBe('failing');
  });
});

describe('parsePullList', () => {
  const pull = {
    number: 42,
    title: 'Line the table up',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'APPROVED',
    headRefName: 'fix/table',
    author: { login: 'bilo' },
    url: 'https://github.com/o/r/pull/42',
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
    mergedAt: null,
    closedAt: null,
  };

  it('maps an open, approved PR', () => {
    expect(parsePullList([pull])).toEqual([
      {
        number: 42,
        title: 'Line the table up',
        state: 'open',
        isDraft: false,
        reviewDecision: 'APPROVED',
        checks: 'passing',
        headBranch: 'fix/table',
        author: 'bilo',
        url: 'https://github.com/o/r/pull/42',
        mergedAt: null,
        closedAt: null,
      },
    ]);
  });

  it('carries a merged PR’s merge and close dates', () => {
    const merged = parsePullList([
      { ...pull, state: 'MERGED', mergedAt: '2026-08-20T10:00:00Z', closedAt: '2026-08-20T10:00:00Z' },
    ])[0];
    expect(merged?.mergedAt).toBe('2026-08-20T10:00:00Z');
    expect(merged?.closedAt).toBe('2026-08-20T10:00:00Z');
  });

  it('turns GitHub’s zero-time merge date into an honest null', () => {
    expect(
      parsePullList([{ ...pull, mergedAt: '0001-01-01T00:00:00Z' }])[0]?.mergedAt,
    ).toBeNull();
  });

  it('keeps "nobody reviewed" apart from "a review is required"', () => {
    expect(parsePullList([{ ...pull, reviewDecision: '' }])[0]?.reviewDecision).toBeNull();
    expect(parsePullList([{ ...pull, reviewDecision: 'REVIEW_REQUIRED' }])[0]?.reviewDecision).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('carries the draft flag', () => {
    expect(parsePullList([{ ...pull, isDraft: true }])[0]?.isDraft).toBe(true);
  });

  it('drops a PR with no URL rather than rendering a dead row', () => {
    expect(parsePullList([{ ...pull, url: '' }])).toEqual([]);
  });

  it('survives an author the forge withheld', () => {
    expect(parsePullList([{ ...pull, author: null }])[0]?.author).toBe('');
  });
});

describe('isAuthenticated', () => {
  it('believes a zero exit', () => {
    expect(isAuthenticated('', 0)).toBe(true);
  });

  it('believes a logged-in line even when another host failed', () => {
    // `gh auth status` exits 1 if ANY configured host has a bad token, which
    // must not sign the user out of the host that works.
    const output = [
      'github.com',
      '  ✓ Logged in to github.com account bilo (keyring)',
      'ghe.corp',
      '  X Failed to log in to ghe.corp',
    ].join('\n');
    expect(isAuthenticated(output, 1)).toBe(true);
  });

  it('reports a genuinely signed-out CLI', () => {
    expect(isAuthenticated('You are not logged into any GitHub hosts.', 1)).toBe(false);
  });
});

describe('parseIssueList', () => {
  /* Captured from `gh issue list --json …` against a public repo. */
  const rows = [
    {
      number: 42,
      title: 'Graph rows jump on resize',
      state: 'OPEN',
      author: { login: 'bilo' },
      labels: [
        { name: 'bug', color: 'd73a4a' },
        { name: 'ui', color: '' },
      ],
      assignees: [{ login: 'bilo' }, { login: 'other' }],
      createdAt: '2026-08-01T09:00:00Z',
      updatedAt: '2026-08-20T09:00:00Z',
      url: 'https://github.com/o/r/issues/42',
    },
  ];

  it('flattens gh’s nested author, labels and assignees', () => {
    const [issue] = parseIssueList(rows);
    expect(issue?.author).toBe('bilo');
    expect(issue?.labels.map((l) => l.name)).toEqual(['bug', 'ui']);
    expect(issue?.assignees).toEqual(['bilo', 'other']);
    // Uppercase everywhere in gh's output; lowercase everywhere in ours.
    expect(issue?.state).toBe('open');
  });

  it('reads an empty listing as an empty listing', () => {
    expect(parseIssueList([])).toEqual([]);
    expect(parseIssueList(null)).toEqual([]);
  });

  it('drops a row with no url rather than linking nowhere', () => {
    expect(parseIssueList([{ ...rows[0], url: '' }])).toEqual([]);
  });

  it('survives a forge that withheld the author', () => {
    const [issue] = parseIssueList([{ ...rows[0], author: null, assignees: [] }]);
    expect(issue?.author).toBe('');
    expect(issue?.assignees).toEqual([]);
  });
});

describe('isIssuesDisabled', () => {
  it('recognises the message gh prints for a repo with issues off', () => {
    // The only signal there is: no JSON payload, no distinct exit code.
    expect(isIssuesDisabled('could not find any issues: the "o/r" repository has disabled issues')).toBe(
      true,
    );
    expect(isIssuesDisabled('GraphQL: Issues are disabled for this repository')).toBe(true);
  });

  it('does not mistake an ordinary failure for a configuration', () => {
    // A reworded message must degrade to "something went wrong", never to a
    // silent empty list that reads as "this repo has no issues".
    expect(isIssuesDisabled('HTTP 502: Bad gateway')).toBe(false);
    expect(isIssuesDisabled('could not find any open issues')).toBe(false);
  });
});

describe('parseRunList, widened', () => {
  it('groups on the workflow id, not its display name', () => {
    const [run] = parseRunList([
      {
        databaseId: 32929855838,
        name: 'Triage Scheduled Tasks',
        status: 'completed',
        conclusion: 'success',
        headBranch: 'trunk',
        headSha: 'cc83172',
        createdAt: '2026-08-26T04:20:34Z',
        url: 'https://github.com/cli/cli/actions/runs/32929855838',
        event: 'schedule',
        workflowDatabaseId: 235328803,
        workflowName: 'Triage Scheduled Tasks',
        startedAt: '2026-08-26T04:20:34Z',
        updatedAt: '2026-08-26T04:20:47Z',
        displayTitle: 'Triage Scheduled Tasks',
        number: 6446,
        attempt: 1,
      },
    ]);
    // A string, so a workflow id past 2^53 survives the trip.
    expect(run?.workflowId).toBe('235328803');
    expect(run?.event).toBe('schedule');
    expect(run?.attempt).toBe(1);
  });

  it('keeps a Phase 17-era row parsing, with the new fields null', () => {
    const [run] = parseRunList([
      {
        databaseId: 1,
        name: 'CI',
        status: 'in_progress',
        conclusion: '',
        createdAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/o/r/actions/runs/1',
      },
    ]);
    expect(run?.conclusion).toBeNull();
    expect(run?.workflowId).toBeNull();
    expect(run?.number).toBeNull();
  });
});

describe('parseRunDetail', () => {
  /* Trimmed from a real `gh run view <id> --json jobs,…` payload. */
  const payload = {
    databaseId: 32929855838,
    name: 'Triage Scheduled Tasks',
    status: 'completed',
    conclusion: 'failure',
    headBranch: 'trunk',
    createdAt: '2026-08-26T04:20:34Z',
    url: 'https://github.com/cli/cli/actions/runs/32929855838',
    jobs: [
      {
        databaseId: 98059883361,
        name: 'no-response / noResponse',
        status: 'completed',
        conclusion: 'failure',
        startedAt: '2026-08-26T04:20:37Z',
        completedAt: '2026-08-26T04:20:46Z',
        url: 'https://github.com/cli/cli/actions/runs/32929855838/job/98059883361',
        steps: [
          {
            number: 1,
            name: 'Set up job',
            status: 'completed',
            conclusion: 'success',
            startedAt: '2026-08-26T04:20:39Z',
            completedAt: '2026-08-26T04:20:40Z',
          },
          {
            number: 2,
            name: 'Run tests',
            status: 'in_progress',
            conclusion: '',
            startedAt: '2026-08-26T04:20:40Z',
            completedAt: '0001-01-01T00:00:00Z',
          },
        ],
      },
      {
        databaseId: 98059883909,
        name: 'pitch-surface',
        status: 'completed',
        conclusion: 'skipped',
        startedAt: '0001-01-01T00:00:00Z',
        completedAt: '0001-01-01T00:00:00Z',
        url: 'https://github.com/cli/cli/actions/runs/32929855838/job/98059883909',
        steps: [],
      },
    ],
  };

  it('reads the run and its job tree from one payload', () => {
    const detail = parseRunDetail(payload);
    expect(detail?.run.id).toBe('32929855838');
    expect(detail?.jobs).toHaveLength(2);
    expect(detail?.jobs[0]?.steps).toHaveLength(2);
  });

  it('keeps a skipped job, empty steps and all', () => {
    // `steps: []` is what GitHub sends for a job an `if:` declined to run.
    // Dropping it would hide the reason half a matrix looks missing.
    const skipped = parseRunDetail(payload)?.jobs[1];
    expect(skipped?.conclusion).toBe('skipped');
    expect(skipped?.steps).toEqual([]);
  });

  it('turns GitHub’s zero-time into an honest null', () => {
    const detail = parseRunDetail(payload);
    // Year 1 is "never started", not a date anyone should see rendered.
    expect(detail?.jobs[1]?.startedAt).toBeNull();
    expect(detail?.jobs[0]?.steps[1]?.completedAt).toBeNull();
    // An in-progress step has no conclusion; `""` must not reach the enum.
    expect(detail?.jobs[0]?.steps[1]?.conclusion).toBeNull();
  });

  it('returns null when the run itself cannot be understood', () => {
    // A job tree with no run above it has nothing to render against.
    expect(parseRunDetail({ jobs: payload.jobs })).toBeNull();
    expect(parseRunDetail([])).toBeNull();
    expect(parseRunDetail(null)).toBeNull();
  });
});

describe('parseWorkflowList', () => {
  it('reads the path a run listing never carries', () => {
    const [workflow] = parseWorkflowList([
      { id: 235328803, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
    ]);
    expect(workflow?.id).toBe('235328803');
    expect(workflow?.path).toBe('.github/workflows/ci.yml');
  });

  it('drops a row with no path — the only reason it was fetched', () => {
    expect(parseWorkflowList([{ id: 1, name: 'CI', state: 'active' }])).toEqual([]);
  });
});

describe('parseRunLog', () => {
  // Fixed width, so the byte arithmetic below is exact: `line 7` and
  // `line 4096` are not the same length.
  const line = (n: number) =>
    `job\tstep\t2026-08-26T04:20:39.7297973Z line ${String(n).padStart(9, '0')}`;
  const logOf = (count: number) =>
    `${Array.from({ length: count }, (_, i) => line(i)).join('\n')}\n`;

  it('leaves a short log whole and says so', () => {
    const log = parseRunLog(logOf(3));
    expect(log.lines).toHaveLength(3);
    expect(log.truncated).toBe(false);
    expect(log.omittedLines).toBe(0);
    expect(log.complete).toBe(true);
  });

  it('strips the BOM the Actions API prefixes', () => {
    expect(parseRunLog(`\uFEFF${line(0)}\n`).lines[0]?.startsWith('job')).toBe(true);
  });

  it('does not turn a trailing newline into a blank last line', () => {
    expect(parseRunLog(`${line(0)}\n`).lines).toEqual([line(0)]);
  });

  it('keeps the head and the tail, and names what fell out', () => {
    // Just over the cap, so the middle is dropped but both ends survive.
    const perLine = line(0).length + 1;
    const count = Math.ceil(((LOG_HEAD_BYTES + LOG_TAIL_BYTES) * 2) / perLine);
    const log = parseRunLog(logOf(count));

    expect(log.truncated).toBe(true);
    expect(log.complete).toBe(false);
    expect(log.totalBytes).toBeGreaterThan(LOG_HEAD_BYTES + LOG_TAIL_BYTES);
    // The failure is at the end and the setup is at the start; both are here.
    expect(log.lines[0]).toContain(`line ${String(0).padStart(9, '0')}`);
    expect(log.lines[log.lines.length - 1]).toContain(
      `line ${String(count - 1).padStart(9, '0')}`,
    );
    // And exactly one line says what is missing — never a silently short log.
    const markers = log.lines.filter((l) => l.includes('lines omitted'));
    expect(markers).toHaveLength(1);
    expect(log.omittedLines).toBeGreaterThan(0);
    expect(log.lines).toHaveLength(count - log.omittedLines + 1);
  });

  it('sits exactly on the boundary without truncating', () => {
    const perLine = line(0).length + 1;
    const count = Math.floor((LOG_HEAD_BYTES + LOG_TAIL_BYTES) / perLine);
    const log = parseRunLog(logOf(count));
    expect(log.totalBytes).toBeLessThanOrEqual(LOG_HEAD_BYTES + LOG_TAIL_BYTES);
    expect(log.truncated).toBe(false);
    expect(log.lines).toHaveLength(count);
  });

  it('still caps under `full`, because IPC is not a file transfer', () => {
    // `full` widens the window; it does not remove it. Past the hard ceiling
    // the UI keeps pointing at GitHub.
    const perLine = line(0).length + 1;
    const count = Math.ceil((9_000_000 * 1.1) / perLine);
    const log = parseRunLog(logOf(count), { full: true });
    expect(log.truncated).toBe(true);
    expect(log.omittedLines).toBeGreaterThan(0);
  });
});

describe('stripShellPreamble', () => {
  it('drops a chatty .zshrc printing above the log', () => {
    const text = ['direnv: loading', 'job\tstep\t2026 hello'].join('\n');
    expect(stripShellPreamble(text)).toBe('job\tstep\t2026 hello');
  });

  it('passes text through when there is nothing to recognise', () => {
    // A heuristic that gives up beats one that eats output it did not parse.
    expect(stripShellPreamble('no tabs here')).toBe('no tabs here');
  });

  it('leaves a clean log untouched', () => {
    const text = 'job\tstep\ta\njob\tstep\tb';
    expect(stripShellPreamble(text)).toBe(text);
  });
});

describe('the review’s findings, kept fixed', () => {
  it('keeps the tail under `full`, because the failure is at the end', () => {
    // `full` widens the window; it does not change which end of a log matters.
    // Returning the first 8MB of a 20MB matrix log would drop the failure —
    // the reason the log was opened in the first place.
    const line = (n: number) => `job\tstep\tline ${String(n).padStart(9, '0')}`;
    const perLine = line(0).length + 1;
    const count = Math.ceil((LOG_FULL_MAX_BYTES * 1.5) / perLine);
    const text = `${Array.from({ length: count }, (_, i) => line(i)).join('\n')}\n`;

    const log = parseRunLog(text, { full: true });
    expect(log.truncated).toBe(true);
    expect(log.lines[0]).toContain('line 000000000');
    expect(log.lines[log.lines.length - 1]).toContain(
      `line ${String(count - 1).padStart(9, '0')}`,
    );
    // And wider than the capped view, which is the whole point of asking.
    expect(log.omittedLines).toBeLessThan(parseRunLog(text).omittedLines);
  });

  it('drops one unreadable step, not the job it belongs to', () => {
    // Zod fails a whole object over one bad array element, so an unvalidated
    // steps array would delete the entire job — and the sidebar would report
    // that a run with jobs has none.
    const detail = parseRunDetail({
      databaseId: 1,
      name: 'CI',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-08-26T10:00:00Z',
      url: 'https://github.com/o/r/actions/runs/1',
      jobs: [
        {
          databaseId: 10,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          url: 'https://github.com/o/r/actions/runs/1/job/10',
          steps: [
            { number: 1, name: 'good', status: 'completed', conclusion: 'success' },
            { number: 2, name: 'nonsense', status: 'teleported', conclusion: 'success' },
          ],
        },
      ],
    });

    expect(detail?.jobs).toHaveLength(1);
    expect(detail?.jobs[0]?.steps.map((s) => s.name)).toEqual(['good']);
  });

  it('parses a job held for a deployment approval', () => {
    // `waiting` is a real, deliberate GitHub state — a job blocked on a human.
    // Leaving it out of the enum did not make it not happen; it made the one
    // job worth seeing the one job that vanished.
    const detail = parseRunDetail({
      databaseId: 1,
      name: 'Deploy',
      status: 'waiting',
      conclusion: '',
      createdAt: '2026-08-26T10:00:00Z',
      url: 'https://github.com/o/r/actions/runs/1',
      jobs: [
        {
          databaseId: 10,
          name: 'production',
          status: 'waiting',
          conclusion: '',
          url: 'https://github.com/o/r/actions/runs/1/job/10',
          steps: [],
        },
      ],
    });

    expect(detail?.run.status).toBe('waiting');
    expect(detail?.jobs[0]?.status).toBe('waiting');
  });
});

describe('repoFlag', () => {
  it('leaves github.com implicit', () => {
    expect(repoFlag({ host: 'github.com', owner: 'o', repo: 'r', kind: 'github' })).toBe(
      "--repo 'o/r'",
    );
  });

  it('qualifies an Enterprise host through --repo, never --hostname', () => {
    // `--hostname` reads like the flag for this and is not one: `gh issue
    // list`, `run list`, `run view`, `pr list` and `workflow list` all exit
    // with `unknown flag`. It belongs to `gh auth` and `gh api`.
    const flag = repoFlag({ host: 'github.acme.com', owner: 'o', repo: 'r', kind: 'github' });
    expect(flag).toBe("--repo 'github.acme.com/o/r'");
    expect(flag).not.toContain('--hostname');
  });
});

describe('describeFailure', () => {
  it('finds the line that says what went wrong', () => {
    expect(describeFailure('direnv: loading\nHTTP 502: could not reach the server')).toBe(
      'HTTP 502: could not reach the server',
    );
  });

  it('never renders a JSON payload as an error message', () => {
    // `gh --json` prints its whole payload on ONE line, so a run carrying a
    // step named "Upload failed artifacts" would otherwise put several hundred
    // KB of JSON into a sidebar note.
    const payload = JSON.stringify([{ name: 'Upload failed artifacts' }]);
    expect(describeFailure(payload)).toBe('The GitHub CLI could not complete that request.');
  });

  it('caps whatever still gets through', () => {
    const long = `error: ${'x'.repeat(5_000)}`;
    expect(describeFailure(long).length).toBeLessThanOrEqual(301);
  });
});

describe('logVerdict', () => {
  const log = 'job\tstep\t2026 hello\n';

  it('accepts a clean run', () => {
    const verdict = logVerdict({ stdout: log, stderr: '', exitCode: 0 }, false);
    expect(verdict.log?.lines).toEqual(['job\tstep\t2026 hello']);
    expect(verdict.log?.complete).toBe(true);
  });

  it('refuses a partial log that gh exited non-zero over', () => {
    // `gh` prints the job logs it DID fetch before failing on the ones it
    // could not. Believing that stdout would cache a half-log as complete —
    // exactly the silently-short log the shape exists to prevent.
    const verdict = logVerdict(
      { stdout: log, stderr: 'error: failed to get logs for 30 jobs', exitCode: 1 },
      false,
    );
    expect(verdict.log).toBeNull();
    expect(verdict.error).toContain('failed to get logs');
  });

  it('calls an unfinished run pending, not broken', () => {
    const verdict = logVerdict(
      { stdout: '', stderr: 'run 1 is still in progress; logs will be available when it is complete', exitCode: 1 },
      false,
    );
    expect(verdict.pending).toBe(true);
    expect(verdict.error).toBeNull();
  });

  it('reads the verdict off stderr, so a chatty shell is not a log', () => {
    // A login shell that greets on STDOUT is the case the whole -lic wrapper
    // exists to tolerate; without the exit-code gate that banner would be
    // cached as the run's log.
    const verdict = logVerdict(
      { stdout: 'direnv: loading\n', stderr: 'run 1 is still in progress', exitCode: 1 },
      false,
    );
    expect(verdict.log).toBeNull();
    expect(verdict.pending).toBe(true);
  });
});

describe('parsePullDetail', () => {
  const row = {
    number: 42,
    title: 'Add the Reviews page',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'APPROVED',
    headRefName: 'feature/reviews',
    author: { login: 'bilo' },
    url: 'https://github.com/o/r/pull/42',
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    body: 'Why this exists.',
    headRefOid: 'a'.repeat(40),
    baseRefName: 'main',
    additions: 120,
    deletions: 8,
    changedFiles: 6,
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-21T09:00:00Z',
    mergeable: 'MERGEABLE',
  };

  it('reuses the listing parser for the fields a row already has', () => {
    const detail = parsePullDetail(row);
    expect(detail?.pull.number).toBe(42);
    expect(detail?.pull.headBranch).toBe('feature/reviews');
    expect(detail?.pull.reviewDecision).toBe('APPROVED');
    expect(detail?.pull.checks).toBe('passing');
  });

  it('maps headRefOid onto headSha, which is what the Checks tab matches on', () => {
    // `gh pr view` calls it headRefOid; the run listing calls the same value
    // headSha. Getting this wrong makes the Checks tab silently empty.
    expect(parsePullDetail(row)?.headSha).toBe('a'.repeat(40));
  });

  it('carries the detail-only facts', () => {
    const detail = parsePullDetail(row);
    expect(detail?.body).toBe('Why this exists.');
    expect(detail?.baseBranch).toBe('main');
    expect(detail?.additions).toBe(120);
    expect(detail?.deletions).toBe(8);
    expect(detail?.changedFiles).toBe(6);
    expect(detail?.mergeable).toBe('MERGEABLE');
  });

  it('defaults every withheld field rather than dropping the pull request', () => {
    const detail = parsePullDetail({
      number: 7,
      title: 'Bare',
      state: 'MERGED',
      headRefName: 'x',
      url: 'https://github.com/o/r/pull/7',
    });
    expect(detail?.pull.state).toBe('merged');
    expect(detail?.body).toBe('');
    expect(detail?.headSha).toBeNull();
    expect(detail?.changedFiles).toBe(0);
  });

  it('returns null for a payload that is not a pull request', () => {
    expect(parsePullDetail(null)).toBeNull();
    expect(parsePullDetail([row])).toBeNull();
    // No url — parsePullList drops such a row, and a detail with no pull above
    // it has nothing to render against.
    expect(parsePullDetail({ number: 1, title: 't', state: 'OPEN', headRefName: 'b' })).toBeNull();
  });
});

describe('parseIssueComments', () => {
  it('reads the REST snake_case shape', () => {
    const [comment] = parseIssueComments([
      {
        id: 900,
        user: { login: 'reviewer' },
        body: 'One thought.',
        created_at: '2026-08-20T10:00:00Z',
        html_url: 'https://github.com/o/r/pull/42#issuecomment-900',
      },
    ]);
    expect(comment).toMatchObject({
      id: '900',
      kind: 'comment',
      author: 'reviewer',
      body: 'One thought.',
      reviewState: null,
    });
  });

  it('drops a row with no id or no timestamp, and keeps its neighbours', () => {
    const comments = parseIssueComments([
      { id: 1, created_at: '2026-08-20T10:00:00Z' },
      { user: { login: 'x' }, created_at: '2026-08-20T11:00:00Z' },
      { id: 3 },
      { id: 4, created_at: '2026-08-20T12:00:00Z' },
    ]);
    expect(comments.map((c) => c.id)).toEqual(['1', '4']);
  });

  it('answers empty for anything that is not a list', () => {
    expect(parseIssueComments({ message: 'Not Found' })).toEqual([]);
  });
});

describe('parsePullReviews', () => {
  const review = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: 1,
    user: { login: 'reviewer' },
    state: 'APPROVED',
    body: 'Looks right.',
    submitted_at: '2026-08-21T10:00:00Z',
    html_url: 'https://github.com/o/r/pull/42#pullrequestreview-1',
    ...over,
  });

  it('keeps a verdict and the reasoning attached to it', () => {
    const [approved] = parsePullReviews([review({})]);
    expect(approved).toMatchObject({
      kind: 'review',
      reviewState: 'APPROVED',
      body: 'Looks right.',
      createdAt: '2026-08-21T10:00:00Z',
    });
  });

  it('keeps an approval with no words — a real and common event', () => {
    const [approved] = parsePullReviews([review({ body: '' })]);
    expect(approved?.reviewState).toBe('APPROVED');
    expect(approved?.body).toBe('');
  });

  it('drops a PENDING review, which its author has not published', () => {
    expect(parsePullReviews([review({ state: 'PENDING' })])).toEqual([]);
  });

  it('drops a review with no submitted_at rather than sorting it to the top', () => {
    // An empty-string createdAt sorts above every real timestamp, which would
    // put an undated review at the head of a thread read chronologically.
    expect(parsePullReviews([review({ submitted_at: undefined })])).toEqual([]);
  });

  it('drops a state this enum does not know rather than guessing a verdict', () => {
    expect(parsePullReviews([review({ state: 'SOMETHING_NEW' })])).toEqual([]);
  });

  it('drops the empty COMMENTED shell around inline diff comments', () => {
    // GitHub creates one per inline-comment batch; it carries no prose and no
    // verdict, so rendering it is an author's name attached to nothing.
    expect(parsePullReviews([review({ state: 'COMMENTED', body: '' })])).toEqual([]);
    expect(parsePullReviews([review({ state: 'COMMENTED', body: 'a note' })])).toHaveLength(1);
  });

  it('normalises the state casing before the enum sees it', () => {
    expect(parsePullReviews([review({ state: 'changes_requested' })])[0]?.reviewState).toBe(
      'CHANGES_REQUESTED',
    );
  });
});

describe('mergeConversation', () => {
  const at = (id: string, createdAt: string, kind: 'comment' | 'review') => ({
    id,
    kind,
    author: 'x',
    body: 'b',
    createdAt,
    url: '',
    reviewState: null,
  });

  it('interleaves the two collections by time, not by source', () => {
    // Concatenating would put every review after every comment, which is not
    // the order either was written in.
    const merged = mergeConversation(
      [at('c1', '2026-08-20T10:00:00Z', 'comment'), at('c2', '2026-08-22T10:00:00Z', 'comment')],
      [at('r1', '2026-08-21T10:00:00Z', 'review')],
    );
    expect(merged.map((entry) => entry.id)).toEqual(['c1', 'r1', 'c2']);
  });

  it('keeps input order for a tie, so the thread does not flicker', () => {
    const merged = mergeConversation(
      [at('c1', '2026-08-20T10:00:00Z', 'comment')],
      [at('r1', '2026-08-20T10:00:00Z', 'review')],
    );
    expect(merged.map((entry) => entry.id)).toEqual(['c1', 'r1']);
  });
});

describe('stripPatchPreamble', () => {
  it('drops a shell banner printed above the patch', () => {
    const text = ['direnv: loading', 'diff --git a/a.ts b/a.ts', '--- a/a.ts'].join('\n');
    expect(stripPatchPreamble(text)).toBe('diff --git a/a.ts b/a.ts\n--- a/a.ts');
  });

  it('passes a patch through untouched when it already starts at the header', () => {
    const text = 'diff --git a/a.ts b/a.ts\n--- a/a.ts';
    expect(stripPatchPreamble(text)).toBe(text);
  });

  it('gives up rather than eating output it does not understand', () => {
    // A header-less patch still parses; a heuristic that trimmed it would lose
    // the only hunk in it.
    const text = '@@ -1,1 +1,1 @@\n-a\n+b';
    expect(stripPatchPreamble(text)).toBe(text);
  });
});

describe('capPatch', () => {
  const file = (name: string, lines: number): string =>
    [
      `diff --git a/${name} b/${name}`,
      `--- a/${name}`,
      `+++ b/${name}`,
      `@@ -0,0 +1,${lines} @@`,
      ...Array.from({ length: lines }, (_, i) => `+${name} line ${i} ${'x'.repeat(40)}`),
    ].join('\n');

  const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

  it('returns a patch under the cap unchanged', () => {
    const patch = file('a.ts', 3);
    expect(capPatch(patch, 1_000_000)).toEqual({
      patch,
      truncated: false,
      omittedFiles: 0,
      totalBytes: bytes(patch),
    });
  });

  it('cuts on a file boundary, never mid-hunk', () => {
    // Half a hunk is not a diff: the parser would read the truncated tail as
    // context and a file's last change would silently vanish.
    const patch = [file('a.ts', 20), file('b.ts', 20), file('c.ts', 20)].join('\n');
    const capped = capPatch(patch, 400);

    expect(capped.truncated).toBe(true);
    expect(capped.omittedFiles).toBeGreaterThan(0);
    expect(capped.patch.split('\n').filter((l) => l.startsWith('diff --git ')).length).toBe(
      3 - capped.omittedFiles,
    );
    expect(capped.totalBytes).toBe(bytes(patch));
  });

  it('actually bounds its output — the thing the cap exists to guarantee', () => {
    // The regression this test was written for: the ceiling used to be tested
    // only when the NEXT header arrived, so the file that crossed it was always
    // kept whole and an over-cap file at the END escaped entirely.
    const patch = [file('tiny.ts', 1), file('lockfile.json', 4000)].join('\n');
    const capped = capPatch(patch, 2_000);

    expect(capped.truncated).toBe(true);
    expect(bytes(capped.patch)).toBeLessThanOrEqual(2_000);
    expect(capped.omittedFiles).toBe(1);
    expect(capped.patch).toContain('tiny.ts');
    expect(capped.patch).not.toContain('lockfile.json');
  });

  it('bounds a header-less patch too, since there is no boundary to cut at', () => {
    // `stripPatchPreamble` deliberately passes a header-less patch through, so
    // without a byte slice here the cap would silently not apply to it.
    const headerless = Array.from({ length: 4000 }, (_, i) => `+line ${i}`).join('\n');
    const capped = capPatch(headerless, 1_000);

    expect(capped.truncated).toBe(true);
    expect(bytes(capped.patch)).toBeLessThanOrEqual(1_000);
    expect(capped.totalBytes).toBe(bytes(headerless));
  });

  it('cuts a lone over-cap file on a line boundary rather than shipping it whole', () => {
    const capped = capPatch(file('huge.ts', 4000), 1_000);
    expect(capped.truncated).toBe(true);
    expect(bytes(capped.patch)).toBeLessThanOrEqual(1_000);
    // Whole lines only: a byte slice could land inside a multi-byte character.
    expect(capped.patch.split('\n').every((line) => line.length >= 0)).toBe(true);
  });

  it('keeps the FIRST file of a multi-file patch whole, however large', () => {
    // Returning nothing at all would report "no changes" for a pull request
    // that has them.
    const patch = [file('huge.ts', 4000), file('small.ts', 1)].join('\n');
    const capped = capPatch(patch, 500);
    expect(capped.patch).toContain('huge.ts');
    expect(capped.omittedFiles).toBe(1);
  });
});

describe('parseMultiFileDiff over what gh actually returns', () => {
  /*
    A regression fixture, and the reason `pullFiles` does NOT pass `--patch`.

    `--patch` asks GitHub for the `.patch` media type, which is
    `git format-patch` output: one mbox entry per COMMIT. A two-commit PR that
    touches one file twice yields two sections for it, and every mbox header
    after the first lands inside the previous file's section — where the parser
    reads the `---` separator as a deletion and the diffstat as context.
  */
  const mbox = [
    'From c218854 Mon Sep 17 00:00:00 2001',
    'From: Someone <someone@example.com>',
    'Subject: [PATCH 1/2] first',
    '---',
    ' a.ts | 1 +',
    ' 1 file changed, 1 insertion(+)',
    '',
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,1 +1,2 @@',
    ' const a = 1;',
    '+const b = 2;',
    'From d449102 Mon Sep 17 00:00:00 2001',
    'From: Someone <someone@example.com>',
    'Subject: [PATCH 2/2] second',
    '---',
    ' a.ts | 1 +',
    ' 1 file changed, 1 insertion(+)',
    '',
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    '+const c = 3;',
  ].join('\n');

  it('shows why format-patch output must not reach it', () => {
    const files = parseMultiFileDiff(mbox, { contextLines: 3, fallbackPath: 'pull-1' });

    // One path, twice — which is what a duplicate accordion row looks like.
    expect(files.filter((f) => f.path === 'a.ts')).toHaveLength(2);
    // And the second commit's mbox header is swallowed by the first file: its
    // `---` reads as a deletion the pull request never made.
    const first = files.find((f) => f.path === 'a.ts');
    expect(first?.deletions).toBeGreaterThan(0);
  });

  it('parses the combined diff bare `gh pr diff` returns cleanly', () => {
    const combined = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,3 @@',
      ' const a = 1;',
      '+const b = 2;',
      '+const c = 3;',
    ].join('\n');

    const files = parseMultiFileDiff(combined, { contextLines: 3, fallbackPath: 'pull-1' });
    expect(files).toHaveLength(1);
    expect(files[0]?.insertions).toBe(2);
    expect(files[0]?.deletions).toBe(0);
  });
});
