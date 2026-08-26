import { describe, expect, it } from 'vitest';

import { shellQuote } from './gh-cli';
import {
  isAuthenticated,
  parseJsonPayload,
  parsePullList,
  parseRunList,
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
