import { describe, expect, it } from 'vitest';

import { describeFailure, logVerdict, repoFlag, shellQuote, stripShellPreamble } from './gh-cli';
import {
  LOG_FULL_MAX_BYTES,
  LOG_HEAD_BYTES,
  LOG_TAIL_BYTES,
  isAuthenticated,
  isIssuesDisabled,
  parseIssueList,
  parseJsonPayload,
  parsePullList,
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
      },
    ]);
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
